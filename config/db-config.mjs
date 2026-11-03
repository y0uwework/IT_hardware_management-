// SQL Server connection settings, built from environment variables.
//
// Plain .mjs on purpose: it is imported by the Next.js app (lib/db.ts), the plain-Node
// migration runner (scripts/migrate.mjs) and the seed scripts, so it must not need a build step.
//
//   DB_SERVER                     host, host\INSTANCE (named instance) — default "localhost"
//   DB_PORT                       ignored for named instances — default 1433
//   DB_DATABASE                   default "IT_Assest_manager"
//   DB_AUTH                       "sql" (DB_USER / DB_PASSWORD) or "windows" (needs the optional msnodesqlv8 package)
//   DB_USER, DB_PASSWORD          SQL login used by the app
//   DB_ENCRYPT                    default true
//   DB_TRUST_SERVER_CERTIFICATE   default false
//   DB_ODBC_DRIVER                Windows auth only — default "ODBC Driver 17 for SQL Server"
//   DB_POOL_MAX                   default 10

import { existsSync } from "node:fs";
import path from "node:path";

export const DEFAULT_DATABASE = "IT_Assest_manager";

/**
 * Load .env.local, then .env, into process.env (same precedence as Next.js: values already
 * set — by the shell or by an earlier file — win). Next.js does this itself; scripts call it.
 */
export function loadEnvFiles(cwd = process.cwd()) {
  for (const file of [".env.local", ".env"]) {
    const full = path.join(cwd, file);
    if (existsSync(full)) process.loadEnvFile(full);
  }
}

function flag(value, fallback) {
  if (value === undefined || value.trim() === "") return fallback;
  return /^(1|true|yes|on)$/i.test(value.trim());
}

/**
 * @param {{ database?: string, user?: string, password?: string }} [overrides]
 *   Used by the migration runner (master database, migration login).
 * @returns {{ driver: "tedious" | "msnodesqlv8", database: string, config: Record<string, unknown> }}
 */
export function buildDbConfig(overrides = {}) {
  const env = process.env;
  const [server, instanceName] = (env.DB_SERVER || "localhost").trim().split("\\");
  const port = instanceName ? undefined : Number(env.DB_PORT || 1433);
  const database = overrides.database || env.DB_DATABASE || DEFAULT_DATABASE;
  const auth = (env.DB_AUTH || "sql").trim().toLowerCase();
  const encrypt = flag(env.DB_ENCRYPT, true);
  const trustServerCertificate = flag(env.DB_TRUST_SERVER_CERTIFICATE, false);
  const pool = { max: Number(env.DB_POOL_MAX || 10), min: 0, idleTimeoutMillis: 30_000 };

  if (auth === "windows") {
    const odbcDriver = env.DB_ODBC_DRIVER || "ODBC Driver 17 for SQL Server";
    const target = instanceName ? `${server}\\${instanceName}` : `${server},${port}`;
    const connectionString =
      `Driver={${odbcDriver}};Server=${target};Database=${database};Trusted_Connection=yes;` +
      `Encrypt=${encrypt ? "yes" : "no"};TrustServerCertificate=${trustServerCertificate ? "yes" : "no"};`;
    return { driver: "msnodesqlv8", database, config: { connectionString, pool, options: { useUTC: true } } };
  }

  if (auth !== "sql") throw new Error(`DB_AUTH must be "sql" or "windows" (got "${env.DB_AUTH}")`);
  const user = overrides.user || env.DB_USER;
  const password = overrides.password ?? env.DB_PASSWORD ?? "";
  if (!user) throw new Error("DB_USER is not set. Copy .env.example to .env.local and fill in the DB_* values.");

  return {
    driver: "tedious",
    database,
    config: {
      server,
      port,
      database,
      user,
      password,
      pool,
      connectionTimeout: 15_000,
      requestTimeout: 30_000,
      options: { encrypt, trustServerCertificate, instanceName, useUTC: true, enableArithAbort: true },
    },
  };
}
