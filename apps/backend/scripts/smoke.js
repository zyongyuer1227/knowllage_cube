"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

function loadEnv() {
  const envPath = path.resolve(__dirname, "../.env");
  if (!fs.existsSync(envPath)) {
    return;
  }
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const idx = trimmed.indexOf("=");
    if (idx <= 0) {
      continue;
    }
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  loadEnv();

  const port = Number(process.env.PORT ?? "3000");
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;
  const backendDir = path.resolve(__dirname, "..");
  const child = spawn("node", ["dist/main.js"], {
    cwd: backendDir,
    stdio: "ignore",
    shell: false
  });

  try {
    await wait(4000);

    const health = await requestJson(`${baseUrl}/system/health`, { method: "GET" });
    const login = await requestJson(`${baseUrl}/admin/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: process.env.ADMIN_USERNAME ?? "admin",
        password: process.env.ADMIN_PASSWORD ?? "Admin@123",
        captcha: process.env.ADMIN_LOGIN_CAPTCHA ?? "1234"
      })
    });
    const search = await requestJson(`${baseUrl}/public/search?q=&page=1&pageSize=5&sortBy=updatedAt&order=desc`, {
      method: "GET"
    });

    console.log(`SMOKE_HEALTH=${health.status}`);
    console.log(`SMOKE_DB=${health.database}`);
    console.log(`SMOKE_LOGIN_USER=${login.user?.username ?? ""}`);
    console.log(`SMOKE_TOKEN=${Boolean(login.token)}`);
    console.log(`SMOKE_SEARCH_TOTAL=${search.total ?? 0}`);
  } finally {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
}

main().catch((error) => {
  console.error(`SMOKE_FAILED=${error.message}`);
  process.exit(1);
});
