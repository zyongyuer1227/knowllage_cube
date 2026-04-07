const fs = require("fs");
const path = require("path");
const http = require("http");
const { execSync, spawn } = require("child_process");

const root = __dirname;
const isWindows = process.platform === "win32";
const npmCmd = isWindows ? "npm.cmd" : "npm";
const logDir = path.join(root, ".logs");
const backendEnv = path.join(root, "apps", "backend", ".env");
const nodeModules = path.join(root, "node_modules");

const backendOutLog = path.join(logDir, "backend.dev.out.log");
const backendErrLog = path.join(logDir, "backend.dev.err.log");
const frontendOutLog = path.join(logDir, "frontend.dev.out.log");
const frontendErrLog = path.join(logDir, "frontend.dev.err.log");

const children = [];

function writeStep(message) {
  process.stdout.write(`[start-dev] ${message}\n`);
}

function resetLogFile(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "");
}

function appendLog(prefix, line, filePath) {
  if (!line || !line.trim()) {
    return;
  }
  const timestamp = new Date().toTimeString().slice(0, 8);
  const formatted = `[${timestamp}][${prefix}] ${line}`;
  fs.appendFileSync(filePath, `${formatted}\n`);
  process.stdout.write(`${formatted}\n`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPortListening(port) {
  try {
    const output = execSync(
      isWindows ? `cmd.exe /d /s /c "netstat -ano | findstr LISTENING | findstr :${port}"` : `lsof -i :${port}`,
      {
        cwd: root,
        stdio: ["ignore", "pipe", "ignore"],
        encoding: "utf8"
      }
    );
    return output.trim().length > 0;
  } catch {
    return false;
  }
}

function request(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        resolve({
          statusCode: res.statusCode || 0,
          body: Buffer.concat(chunks).toString("utf8")
        });
      });
    });
    req.on("error", reject);
    req.setTimeout(5000, () => req.destroy(new Error("timeout")));
  });
}

function getPortProcessIds(ports) {
  const ids = new Set();
  for (const port of ports) {
    try {
      const output = execSync(
        isWindows ? `cmd.exe /d /s /c "netstat -ano | findstr LISTENING | findstr :${port}"` : `lsof -i :${port}`,
        {
          cwd: root,
          stdio: ["ignore", "pipe", "ignore"],
          encoding: "utf8"
        }
      );
      for (const line of output.split(/\r?\n/)) {
        const match = line.match(/\s+(\d+)\s*$/);
        if (match) {
          ids.add(match[1]);
        }
      }
    } catch {
      // No listeners on this port.
    }
  }
  return Array.from(ids);
}

function getProjectProcessIds() {
  const ids = new Set(getPortProcessIds([3000, 5173]));
  try {
    const command = isWindows
      ? "wmic process where \"name='node.exe' or name='npm.cmd' or name='cmd.exe'\" get ProcessId,CommandLine /format:csv"
      : "ps -ax -o pid=,command=";
    const output = execSync(command, {
      cwd: root,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8"
    });
    for (const line of output.split(/\r?\n/)) {
      if (
        line.includes(root) ||
        line.includes("dev:backend") ||
        line.includes("dev:frontend") ||
        line.includes("apps\\backend") ||
        line.includes("apps\\frontend")
      ) {
        const match = line.match(/(\d+)\s*$/);
        if (match) {
          ids.add(match[1]);
        }
      }
    }
  } catch {
    // Fallback to port cleanup only.
  }
  return Array.from(ids);
}

function stopStaleProcesses() {
  const ids = getProjectProcessIds();
  if (ids.length === 0) {
    writeStep("No stale project processes found.");
  } else {
    writeStep(`Stopping stale project processes: ${ids.join(", ")}`);
    for (const pid of ids) {
      try {
        if (isWindows) {
          execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore" });
        } else {
          process.kill(Number(pid), "SIGKILL");
        }
      } catch {
        // Ignore already-exited processes.
      }
    }
  }

  const blockedPorts = [3000, 5173].filter((port) => isPortListening(port));
  if (blockedPorts.length > 0) {
    throw new Error(`Ports still in use after cleanup: ${blockedPorts.join(", ")}. Stop the conflicting process and retry.`);
  }
}

function runCommand(label, args) {
  writeStep(label);
  execSync(`${npmCmd} ${args.join(" ")}`, {
    cwd: root,
    stdio: "inherit"
  });
}

function startService(name, scriptName, outLog, errLog) {
  resetLogFile(outLog);
  resetLogFile(errLog);
  writeStep(`Starting ${name}...`);

  const command = isWindows ? "cmd.exe" : npmCmd;
  const args = isWindows ? ["/d", "/s", "/c", `npm.cmd run ${scriptName}`] : ["run", scriptName];

  const child = spawn(command, args, {
    cwd: root,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"]
  });

  child.stdout.on("data", (chunk) => {
    for (const line of chunk.toString("utf8").split(/\r?\n/)) {
      appendLog(name, line, outLog);
    }
  });

  child.stderr.on("data", (chunk) => {
    for (const line of chunk.toString("utf8").split(/\r?\n/)) {
      appendLog(`${name}:err`, line, errLog);
    }
  });

  child.on("exit", (code) => {
    writeStep(`${name} exited with code ${code}`);
  });

  children.push(child);
  return child;
}

function stopChildren() {
  for (const child of children) {
    if (!child.killed) {
      try {
        if (isWindows) {
          execSync(`taskkill /PID ${child.pid} /T /F`, { stdio: "ignore" });
        } else {
          child.kill("SIGTERM");
        }
      } catch {
        // Ignore.
      }
    }
  }
}

async function waitForPortsToClear(ports, timeoutMs = 8000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const blocked = ports.filter((port) => isPortListening(port));
    if (blocked.length === 0) {
      return;
    }
    await sleep(300);
  }
  const blocked = ports.filter((port) => isPortListening(port));
  if (blocked.length > 0) {
    throw new Error(`Ports still in use after waiting: ${blocked.join(", ")}. Stop the conflicting process and retry.`);
  }
}

async function runHealthChecks() {
  try {
    const backend = await request("http://127.0.0.1:3000/api/v1/system/health");
    writeStep(`Backend health: HTTP ${backend.statusCode}`);
  } catch {
    writeStep(`Backend health check failed. See ${backendErrLog}`);
  }

  try {
    const frontend = await request("http://127.0.0.1:5173");
    writeStep(`Frontend HTTP status: ${frontend.statusCode}`);
  } catch {
    writeStep(`Frontend check failed. See ${frontendErrLog}`);
  }
}

async function waitForBackendReady(timeoutMs = 30000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const backend = await request("http://127.0.0.1:3000/api/v1/system/health");
      if (backend.statusCode >= 200 && backend.statusCode < 500) {
        writeStep(`Backend is ready: HTTP ${backend.statusCode}`);
        return;
      }
    } catch {
      // Keep polling until timeout.
    }
    await sleep(500);
  }
  throw new Error(`Backend did not become ready within ${timeoutMs}ms. See ${backendErrLog}`);
}

async function main() {
  if (!fs.existsSync(nodeModules)) {
    throw new Error("node_modules not found. Run 'npm install' first.");
  }
  if (!fs.existsSync(backendEnv)) {
    throw new Error(`Backend env file missing: ${backendEnv}`);
  }

  writeStep(`Working directory: ${root}`);
  stopStaleProcesses();
  await waitForPortsToClear([3000, 5173]);
  runCommand("Running database migrations...", ["--workspace", "apps/backend", "run", "db:migrate"]);

  const backend = startService("backend", "dev:backend", backendOutLog, backendErrLog);
  writeStep("Waiting for backend to become ready before starting frontend...");
  await waitForBackendReady();
  const frontend = startService("frontend", "dev:frontend", frontendOutLog, frontendErrLog);

  process.on("SIGINT", () => {
    writeStep("Stopping started services...");
    stopChildren();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    stopChildren();
    process.exit(0);
  });

  writeStep("Waiting for services to become ready...");
  await sleep(1500);
  await runHealthChecks();

  process.stdout.write("\n");
  process.stdout.write("Guest:    http://127.0.0.1:5173\n");
  process.stdout.write("Admin:    http://127.0.0.1:5173/admin\n");
  process.stdout.write("Backend:  http://127.0.0.1:3000\n");
  process.stdout.write("Health:   http://127.0.0.1:3000/api/v1/system/health\n\n");
  process.stdout.write("Logs:\n");
  process.stdout.write(`  ${frontendOutLog}\n`);
  process.stdout.write(`  ${frontendErrLog}\n`);
  process.stdout.write(`  ${backendOutLog}\n`);
  process.stdout.write(`  ${backendErrLog}\n\n`);
  process.stdout.write("Press Ctrl+C to stop services started by this command.\n\n");

  await new Promise((resolve) => {
    backend.on("exit", resolve);
    frontend.on("exit", resolve);
  });

  writeStep("One of the services exited. Stopping the remaining started services.");
  stopChildren();
}

main().catch((error) => {
  process.stderr.write(`[start-dev] ${error.message}\n`);
  process.exit(1);
});
