// SQL Server access: one shared connection pool plus small helpers for parameterized SQL.
// Server-side only (API routes, getServerSideProps, scripts). Never import from a component.
//
//   const pool = await getPool();
//   const rows = await query(pool, "SELECT id, full_name AS fullName FROM dbo.users WHERE id = @id", { id });
//
//   await withTransaction(async (tx) => {
//     await execute(tx, "UPDATE dbo.assets SET status = @status WHERE id = @id", { id, status });
//   });
//
// Parameters are always bound (never concatenated). An array parameter expands for IN lists:
//   WHERE id IN (@ids)   with { ids: [1, 2, 3] }   →   WHERE id IN (@ids_0, @ids_1, @ids_2)
//
// Column aliases containing dots become nested objects, so joins return the same shape the
// API always returned:  r.full_name AS [requester.fullName]  →  { requester: { fullName } }.
// A nested object whose values are all NULL (an unmatched LEFT JOIN) becomes null.

import sql from "mssql";
import { buildDbConfig } from "./config/db-config.mjs";
import { logger } from "./logger";

export type Sql = typeof sql;
/** A connection pool or an open transaction. Every helper below accepts either. */
export type Tx = sql.ConnectionPool | sql.Transaction;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;
/** Explicitly typed parameter, for the rare case where type inference is not enough. */
export interface TypedParam {
  type: sql.ISqlType | (() => sql.ISqlType);
  value: unknown;
}
export type Params = Record<string, unknown>;

interface Db {
  sql: Sql;
  pool: sql.ConnectionPool;
}

// Survives hot reloads in development so we don't open a new pool on every edit.
const globalForDb = globalThis as unknown as { itAssetDb?: Promise<Db> };

// Kept out of webpack's sight: the Windows-auth driver is an optional native package.
const MSNODESQLV8 = "mssql/msnodesqlv8.js";

async function connect(): Promise<Db> {
  const { driver, config } = buildDbConfig();
  const driverSql: Sql =
    driver === "msnodesqlv8" ? (await import(/* webpackIgnore: true */ MSNODESQLV8)).default : sql;
  const pool = new driverSql.ConnectionPool(config);
  pool.on("error", (error: Error) => logger.error("SQL Server pool error", { error: error.message }));
  await pool.connect();
  return { sql: driverSql, pool };
}

export function getDb(): Promise<Db> {
  if (!globalForDb.itAssetDb) {
    globalForDb.itAssetDb = connect().catch((error) => {
      globalForDb.itAssetDb = undefined; // don't cache a failed connection
      throw error;
    });
  }
  return globalForDb.itAssetDb;
}

export async function getPool(): Promise<sql.ConnectionPool> {
  return (await getDb()).pool;
}

/** Close the pool (scripts only — the web app keeps it open). */
export async function closeDb(): Promise<void> {
  const db = globalForDb.itAssetDb;
  globalForDb.itAssetDb = undefined;
  if (db) await (await db).pool.close();
}

function isTypedParam(v: unknown): v is TypedParam {
  return typeof v === "object" && v !== null && !(v instanceof Date) && "type" in v && "value" in v;
}

function bind(req: sql.Request, name: string, value: unknown) {
  if (value === undefined) value = null;
  if (value instanceof Date) req.input(name, sql.DateTime2, value);
  else if (isTypedParam(value)) req.input(name, value.type, value.value);
  else req.input(name, value);
}

function prepare(ex: Tx, text: string, params: Params = {}) {
  const req = ex.request();
  let sqlText = text;
  for (const [name, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      const names = value.map((_, i) => `${name}_${i}`);
      value.forEach((v, i) => bind(req, names[i], v));
      const list = names.length ? names.map((n) => `@${n}`).join(", ") : "NULL";
      sqlText = sqlText.replace(new RegExp(`@${name}\\b`, "g"), list);
    } else {
      bind(req, name, value);
    }
  }
  return { req, sqlText };
}

/** Turn dotted column aliases into nested objects; all-NULL nested objects become null. */
export function nest<T = Row>(row: Row): T {
  const out: Row = {};
  const created: Row[] = [];
  for (const [key, value] of Object.entries(row)) {
    if (!key.includes(".")) {
      out[key] = value;
      continue;
    }
    const parts = key.split(".");
    let cur = out;
    for (let i = 0; i < parts.length - 1; i++) {
      if (cur[parts[i]] === undefined) {
        cur[parts[i]] = {};
        created.push(cur[parts[i]]);
      }
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
  }
  const collapse = (obj: Row) => {
    for (const [k, v] of Object.entries(obj)) {
      if (v && typeof v === "object" && created.includes(v)) {
        collapse(v);
        if (Object.values(v).every((x) => x === null)) obj[k] = null;
      }
    }
  };
  collapse(out);
  return out as T;
}

/** Rows of the first result set. */
export async function query<T = Row>(ex: Tx, text: string, params?: Params): Promise<T[]> {
  const { req, sqlText } = prepare(ex, text, params);
  const result = await req.query(sqlText);
  return (result.recordset ?? []).map((r) => nest<T>(r));
}

/** First row of the first result set, or null. */
export async function queryOne<T = Row>(ex: Tx, text: string, params?: Params): Promise<T | null> {
  return (await query<T>(ex, text, params))[0] ?? null;
}

/** Several SELECTs in one round trip: one array of rows per result set. */
export async function queryMany(ex: Tx, text: string, params?: Params): Promise<Row[][]> {
  const { req, sqlText } = prepare(ex, text, params);
  const result = await req.query(sqlText);
  const sets = (result.recordsets ?? []) as unknown as Row[][];
  return sets.map((set) => set.map((r) => nest(r)));
}

/** INSERT / UPDATE / DELETE. Returns the number of affected rows. */
export async function execute(ex: Tx, text: string, params?: Params): Promise<number> {
  const { req, sqlText } = prepare(ex, text, params);
  const result = await req.query(sqlText);
  return result.rowsAffected.reduce((a, b) => a + b, 0);
}

/**
 * Run `fn` in a transaction: commit when it resolves, roll back when it throws.
 * Requests on one transaction must run one at a time (await each call, no Promise.all).
 */
export async function withTransaction<T>(fn: (tx: sql.Transaction) => Promise<T>): Promise<T> {
  const pool = await getPool();
  const tx = pool.transaction();
  await tx.begin();
  try {
    const result = await fn(tx);
    await tx.commit();
    return result;
  } catch (error) {
    try {
      await tx.rollback();
    } catch {
      // Already rolled back by SQL Server (e.g. the error aborted the transaction).
    }
    throw error;
  }
}

/** Value for `LIKE @param`: matches the text anywhere, with LIKE wildcards escaped. */
export function likeContains(text: string): string {
  return `%${text.replace(/[[%_]/g, "[$&]")}%`;
}

/** Collects WHERE conditions and their parameters. */
export class Where {
  readonly conditions: string[] = [];
  readonly params: Params = {};

  add(condition: string, params: Params = {}): this {
    this.conditions.push(condition);
    Object.assign(this.params, params);
    return this;
  }

  toString(): string {
    return this.conditions.length ? `WHERE ${this.conditions.join(" AND ")}` : "";
  }
}

/** Errors that mean "the database is unreachable", as opposed to a bad query. */
const CONNECTION_ERROR_CODES = new Set(["ELOGIN", "ESOCKET", "ETIMEOUT", "ECONNCLOSED", "ENOTOPEN", "EINSTLOOKUP", "ENOCONN"]);

export function isConnectionError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return !!code && CONNECTION_ERROR_CODES.has(code);
}

/** SQL Server error number (2627/2601 unique key, 547 constraint), if any. */
export function sqlErrorNumber(error: unknown): number | undefined {
  const e = error as { number?: number; originalError?: { info?: { number?: number } } } | null;
  return e?.number ?? e?.originalError?.info?.number;
}
