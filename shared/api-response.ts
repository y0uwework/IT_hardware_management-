import type { NextApiResponse } from "next";
import type { AppError } from "./errors";

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
}

export interface ApiSuccess<T> {
  success: true;
  message: string;
  data: T;
  meta?: PageMeta;
}

export interface ApiFailure {
  success: false;
  message: string;
  code: string;
  errors: { path?: string; message: string }[];
}

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

/** BigInt / Decimal safe JSON serialization. */
function toJsonSafe<T>(value: T): unknown {
  return JSON.parse(
    JSON.stringify(value, (_key, v) => {
      if (typeof v === "bigint") return v.toString();
      if (v && typeof v === "object" && v.constructor?.name === "Decimal") return v.toString();
      return v;
    })
  );
}

export function ok<T>(res: NextApiResponse, data: T, message = "OK", meta?: PageMeta, status = 200) {
  const body: ApiSuccess<unknown> = { success: true, message, data: toJsonSafe(data) };
  if (meta) body.meta = meta;
  res.status(status).json(body);
}

export function created<T>(res: NextApiResponse, data: T, message = "Created") {
  ok(res, data, message, undefined, 201);
}

export function fail(res: NextApiResponse, error: AppError) {
  const body: ApiFailure = {
    success: false,
    message: error.message,
    code: error.code,
    errors: error.errors,
  };
  res.status(error.status).json(body);
}
