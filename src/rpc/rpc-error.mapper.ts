import { AppError } from "../common/errors/app-error";
import { ERROR_CODES } from "../common/errors/error-codes";
import type { AppLogger } from "../common/logging/logger";
import {
  WebrpcError,
  webrpcErrorByCode,
} from "../generated/webrpc/shopwise.gen";
import type { RpcContext } from "./rpc-context";

/**
 * Converts any thrown value into a generated WebRPC error that is safe to serialize.
 *
 * - AppError -> the RIDL error with the same PRD code/status; its message is client-safe and
 *   field-level validation details are JSON-encoded into `cause` (FieldError[]).
 * - Generated WebRPC errors pass through unchanged.
 * - Anything else (Prisma, provider, programming errors) -> INTERNAL_ERROR with a generic
 *   message. The original error is logged server-side with the request ID only.
 *
 * This matters because the generated dispatcher would otherwise copy `err.message` of
 * unknown errors into the response `cause`.
 */
export function toWebrpcError(
  err: unknown,
  ctx: RpcContext,
  logger: AppLogger,
): WebrpcError {
  if (err instanceof AppError) {
    ctx.errorCode = err.code;
    const ErrorClass = webrpcErrorByCode[
      ERROR_CODES[err.code].rpcCode
    ] as typeof WebrpcError;
    return new ErrorClass({
      message: err.message,
      cause: err.errors?.length ? JSON.stringify(err.errors) : undefined,
    });
  }
  if (err instanceof WebrpcError) {
    ctx.errorCode = err.name;
    return err;
  }
  ctx.errorCode = "INTERNAL_ERROR";
  logger.error(
    {
      requestId: ctx.requestId,
      errName: (err as Error)?.name,
      err: err instanceof Error ? err : undefined,
    },
    "unhandled RPC error",
  );
  const Internal = webrpcErrorByCode[
    ERROR_CODES.INTERNAL_ERROR.rpcCode
  ] as typeof WebrpcError;
  return new Internal({ message: "Unexpected server error." });
}
