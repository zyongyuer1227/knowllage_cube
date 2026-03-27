"use strict";

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const MIGRATIONS_DIR = path.resolve(__dirname, "../../../db/migrations");
const MIGRATIONS_TABLE = "schema_migrations";

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

function getClient() {
  return new Client({
    host: process.env.DB_HOST ?? "127.0.0.1",
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER ?? "postgres",
    password: process.env.DB_PASSWORD ?? "postgres",
    database: process.env.DB_NAME ?? "knowledge_cube"
  });
}

function getMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    throw new Error(`Migrations directory not found: ${MIGRATIONS_DIR}`);
  }

  return fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      file_name VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations(client) {
  const result = await client.query(`SELECT file_name FROM ${MIGRATIONS_TABLE}`);
  return new Set(result.rows.map((row) => row.file_name));
}

async function applyMigration(client, fileName) {
  const migrationPath = path.join(MIGRATIONS_DIR, fileName);
  if (!fs.existsSync(migrationPath)) {
    throw new Error(`Migration file not found: ${migrationPath}`);
  }

  const sql = fs.readFileSync(migrationPath, "utf8").trim();
  if (!sql) {
    throw new Error(`Migration file is empty: ${fileName}`);
  }

  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query(`INSERT INTO ${MIGRATIONS_TABLE} (file_name) VALUES ($1)`, [fileName]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

function resolveTargetMigrations(allFiles, explicitFile) {
  if (!explicitFile) {
    return allFiles;
  }

  if (!allFiles.includes(explicitFile)) {
    throw new Error(`Migration file not found in ${MIGRATIONS_DIR}: ${explicitFile}`);
  }

  return [explicitFile];
}

async function main() {
  loadEnv();

  const explicitFile = process.argv[2];
  const allFiles = getMigrationFiles();
  const targetFiles = resolveTargetMigrations(allFiles, explicitFile);
  const client = getClient();

  await client.connect();

  try {
    await ensureMigrationsTable(client);
    const appliedMigrations = await getAppliedMigrations(client);
    const pendingFiles = targetFiles.filter((fileName) => !appliedMigrations.has(fileName));

    if (pendingFiles.length === 0) {
      console.log(explicitFile ? `Migration already applied: ${explicitFile}` : "No pending migrations.");
      return;
    }

    for (const fileName of pendingFiles) {
      await applyMigration(client, fileName);
      console.log(`Migration applied: ${fileName}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Migration failed:", error.message);
  process.exit(1);
});
