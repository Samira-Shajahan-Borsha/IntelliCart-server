import { ERROR_CODES, type ErrorCode } from "./error-codes";

export interface FieldErrorDetail {
  field?: string;
  message: string;
}

/**
 * The only error type domain services throw for expected failures. Its message is
 * considered client-safe; anything that is not an AppError is mapped to INTERNAL_ERROR
 * and its details stay in server logs.
 */
export class AppError extends Error {
  readonly statusCode: number;

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly errors?: FieldErrorDetail[],
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = ERROR_CODES[code].status;
  }
}
