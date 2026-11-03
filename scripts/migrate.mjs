#!/usr/bin/env node
// SQL Server migration runner (no ORM).
//
//   npm run migrate                  apply pending migrations (creates the database if missing)
//   npm run migrate:status           list each file as applied / pending / EDITED / missing
//   npm run migrate:new add_x_col    create database/migrations/NNNN_add_x_col.sql
//
// Rules:
//   * Files are database/migrations/NNNN_name.sql, applied in name order, each in its own transaction.
//   * A file is split on lines containing only GO (like SSMS); each batch runs in that transaction.
//   * Never edit a file that has been applied: its SHA-256 is recorded and the runner refuses to
//     continue if it changes. Fix mistakes with a new migration.
//   * Don't put BEGIN TRAN / COMMIT in a migration — the runner owns the transaction.
//   * Migrations use DB_MIGRATE_USER / DB_MIGRATE_PASSWORD when set (a login that can create and
//     alter tables); otherwise DB_USER / DB_PASSWORD.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDbConfig, loadEnvFiles } from "../shared/config/db-config.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = path.join(ROOT, "database", "migrations");
const FILE_PATTERN = /^(\d{4})_([a-z0-9_]+)\.sql$/;
const HISTORY_TABLE = "dbo.SchemaMigrations";
const LOCK_NAME = "SchemaMigrations";

loadEnvFiles(ROOT);

// ── helpers ──────────────────────────────────────────────────────────────────

function fail(message) {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}

async function loadSql(driver) {
  if (driver === "msnodesqlv8") {
    try {
      return (await import("mssql/msnodesqlv8.js")).default;
    } catch {
      fail('DB_AUTH=windows needs the msnodesqlv8 package: run "npm install msnodesqlv8".');
    }
  }
  return (await import("mssql")).default;
}

function migrationLogin() {
  const env = process.env;
  return env.DB_MIGRATE_USER ? { user: env.DB_MIGRATE_USER, password: env.DB_MIGRATE_PASSWORD ?? "" } : {};
}

/** One connection only, so the session-level app lock and the transactions share a session. */
async function connect(overrides) {
  const { driver, database, config } = buildDbConfig({ ...migrationLogin(), ...overrides });
  const sql = await loadSql(driver);
  const pool = new sql.ConnectionPool({ ...config, pool: { max: 1, min: 1, idleTimeoutMillis: 3_600_000 } });
  try {
    await pool.connect();
  } catch (error) {
    fail(`Could not connect to SQL Server (${config.server ?? "ODBC"} / ${database}): ${error.message}`);
  }
  return { sql, pool, database };
}

function readMigrations() {
  if (!existsSync(MIGRATIONS_DIR)) return [];
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  const bad = files.filter((f) => !FILE_PATTERN.test(f));
  if (bad.length) fail(`Migration file names must look like 0001_create_things.sql: ${bad.join(", ")}`);
  return files.map((name) => {
    // Normalize line endings so a git autocrlf checkout doesn't look like an edit.
    const text = readFileSync(path.join(MIGRATIONS_DIR, name), "utf8").replace(/\r\n/g, "\n");
    return { name, text, checksum: createHash("sha256").update(text).digest("hex") };
  });
}

/** Split on lines that contain only GO (optionally followed by a comment), like SSMS. */
function splitBatches(text) {
  return text
    .split(/^[ \t]*GO[ \t]*(?:--.*)?$/gim)
    .map((b) => b.trim())
    .filter((b) => b.replace(/--.*$/gm, "").trim().length > 0);
}

async function databaseExists(database) {
  const { pool } = await connect({ database: "master" });
  try {
    const r = await pool.request().input("db", database).query("SELECT DB_ID(@db) AS id");
    return r.recordset[0].id !== null;
  } finally {
    await pool.close();
  }
}

async function ensureDatabase(database) {
  const { pool } = await connect({ database: "master" });
  try {
    const r = await pool
      .request()
      .input("db", database)
      .query(`IF DB_ID(@db) IS NULL
              BEGIN
                DECLARE @sql NVARCHAR(400) = N'CREATE DATABASE ' + QUOTENAME(@db);
                EXEC (@sql);
                SELECT 1 AS created;
              END
              ELSE SELECT 0 AS created;`);
    if (r.recordset[0].created) console.log(`Created database ${database}`);
  } catch (error) {
    fail(`Database "${database}" does not exist and could not be created: ${error.message}`);
  } finally {
    await pool.close();
  }
}

async function ensureHistoryTable(pool) {
  await pool.request().batch(`
    IF OBJECT_ID(N'${HISTORY_TABLE}', N'U') IS NULL
      CREATE TABLE ${HISTORY_TABLE} (
        Name      NVARCHAR(200) NOT NULL CONSTRAINT PK_SchemaMigrations PRIMARY KEY,
        Checksum  CHAR(64)      NOT NULL,
        AppliedAt DATETIME2     NOT NULL CONSTRAINT DF_SchemaMigrations_AppliedAt DEFAULT SYSUTCDATETIME()
      );`);
}

async function appliedMigrations(pool) {
  const r = await pool.request().query(`SELECT Name, Checksum, AppliedAt FROM ${HISTORY_TABLE} ORDER BY Name`);
  return new Map(r.recordset.map((row) => [row.Name, row]));
}

function classify(files, applied) {
  const rows = files.map((f) => {
    const a = applied.get(f.name);
    const state = !a ? "pending" : a.Checksum.trim() === f.checksum ? "applied" : "EDITED";
    return { name: f.name, state, appliedAt: a?.AppliedAt ?? null, file: f };
  });
  const onDisk = new Set(files.map((f) => f.name));
  for (const [name, a] of applied) {
    if (!onDisk.has(name)) rows.push({ name, state: "missing", appliedAt: a.AppliedAt, file: null });
  }
  return rows.sort((x, y) => x.name.localeCompare(y.name));
}

// ── commands ─────────────────────────────────────────────────────────────────

async function up() {
  const files = readMigrations();
  const { database } = buildDbConfig(migrationLogin());
  await ensureDatabase(database);

  const { sql, pool } = await connect();
  try {
    const lock = await pool
      .request()
      .query(`DECLARE @r INT;
              EXEC @r = sp_getapplock @Resource = N'${LOCK_NAME}', @LockMode = 'Exclusive', @LockOwner = 'Session', @LockTimeout = 0;
              SELECT @r AS result;`);
    if (lock.recordset[0].result < 0) fail("Another migration is running against this database. Try again when it finishes.");

    await ensureHistoryTable(pool);
    const rows = classify(files, await appliedMigrations(pool));

    const edited = rows.filter((r) => r.state === "EDITED");
    if (edited.length) {
      fail(
        `These applied migrations were edited after they ran: ${edited.map((r) => r.name).join(", ")}\n` +
          "  Restore the original files and put the change in a new migration (npm run migrate:new <name>)."
      );
    }
    for (const r of rows.filter((x) => x.state === "missing")) {
      console.warn(`⚠ ${r.name} is recorded as applied but the file is missing.`);
    }

    const pending = rows.filter((r) => r.state === "pending");
    if (pending.length === 0) {
      console.log(`Database ${database} is up to date (${rows.length} migration(s)).`);
      return;
    }

    for (const { file } of pending) {
      const batches = splitBatches(file.text);
      const tx = new sql.Transaction(pool);
      await tx.begin();
      let current = 0;
      try {
        for (current = 0; current < batches.length; current++) {
          await new sql.Request(tx).batch(batches[current]);
        }
        await new sql.Request(tx)
          .input("name", file.name)
          .input("checksum", file.checksum)
          .query(`INSERT INTO ${HISTORY_TABLE} (Name, Checksum) VALUES (@name, @checksum)`);
        await tx.commit();
        console.log(`✔ ${file.name}`);
      } catch (error) {
        try {
          await tx.rollback();
        } catch {
          // already rolled back by the server
        }
        const where = batches.length > 1 ? ` (batch ${current + 1} of ${batches.length})` : "";
        fail(`${file.name}${where} failed and was rolled back:\n  ${error.message}`);
      }
    }
    console.log(`\nApplied ${pending.length} migration(s) to ${database}.`);
  } finally {
    await pool.close();
  }
}

async function status() {
  const files = readMigrations();
  const { database } = buildDbConfig(migrationLogin());
  let rows;
  if (!(await databaseExists(database))) {
    console.log(`Database ${database} does not exist yet — "npm run migrate" will create it.\n`);
    rows = classify(files, new Map());
  } else {
    const { pool } = await connect();
    try {
      await ensureHistoryTable(pool);
      rows = classify(files, await appliedMigrations(pool));
    } finally {
      await pool.close();
    }
  }
  const width = Math.max(10, ...rows.map((r) => r.name.length));
  for (const r of rows) {
    const when = r.appliedAt ? new Date(r.appliedAt).toISOString().replace("T", " ").slice(0, 19) + " UTC" : "";
    console.log(`${r.name.padEnd(width)}  ${r.state.padEnd(8)}  ${when}`);
  }
  const counts = rows.reduce((acc, r) => ({ ...acc, [r.state]: (acc[r.state] ?? 0) + 1 }), {});
  console.log(`\n${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ") || "no migrations"}`);
  if (counts.EDITED) process.exitCode = 1;
}

function create(rawName) {
  const slug = (rawName ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!slug) fail("Usage: npm run migrate:new <name>   e.g. npm run migrate:new add_asset_location");
  mkdirSync(MIGRATIONS_DIR, { recursive: true });
  const last = readdirSync(MIGRATIONS_DIR)
    .map((f) => FILE_PATTERN.exec(f)?.[1])
    .filter(Boolean)
    .map(Number)
    .reduce((a, b) => Math.max(a, b), 0);
  const name = `${String(last + 1).padStart(4, "0")}_${slug}.sql`;
  writeFileSync(
    path.join(MIGRATIONS_DIR, name),
    `-- =============================================================================
-- ${name.slice(0, 4)} · ${slug.replace(/_/g, " ")}
--
-- Runs once, inside a transaction. Keep it idempotent (guard with IF OBJECT_ID(...) IS NULL /
-- IF COL_LENGTH(...) IS NULL), name every constraint, and use SYSUTCDATETIME() for timestamps.
-- Separate batches with a line containing only GO when a statement must start a batch.
-- =============================================================================

-- IF COL_LENGTH(N'dbo.assets', N'location') IS NULL
--     ALTER TABLE dbo.assets ADD location NVARCHAR(100) NULL;
`
  );
  console.log(`Created database/migrations/${name}`);
}

// ── main ─────────────────────────────────────────────────────────────────────

const [command = "up", arg] = process.argv.slice(2);
const commands = { up, status, new: () => create(arg) };
if (!commands[command]) fail(`Unknown command "${command}". Use: up | status | new <name>`);
await commands[command]();
