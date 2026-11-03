export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "INVALID_TRANSITION"
  | "METHOD_NOT_ALLOWED"
  | "NOT_IMPLEMENTED"
  | "INTERNAL_ERROR";

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 422,
  CONFLICT: 409,
  INVALID_TRANSITION: 409,
  METHOD_NOT_ALLOWED: 405,
  NOT_IMPLEMENTED: 501,
  INTERNAL_ERROR: 500,
};

/** Business/application error that maps cleanly onto the standard API error response. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly errors: { path?: string; message: string }[];

  constructor(code: ErrorCode, message: string, errors: { path?: string; message: string }[] = []) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.errors = errors;
  }
}

export const notFound = (what: string) => new AppError("NOT_FOUND", `${what} not found`);
export const forbidden = (message = "You are not authorized to perform this action") =>
  new AppError("FORBIDDEN", message);
export const conflict = (message: string) => new AppError("CONFLICT", message);
export const invalidTransition = (from: string, to: string) =>
  new AppError("INVALID_TRANSITION", `Cannot change status from "${from}" to "${to}"`);
