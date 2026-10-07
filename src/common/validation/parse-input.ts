import type { z } from "zod";
import { AppError } from "../errors/app-error";

/**
 * Runtime validation for transport inputs. Generated WebRPC validators only check
 * structural types; business-level rules (length, format, ranges) live in Zod schemas.
 * Unknown keys are stripped by Zod's default object behavior, so privilege fields such
 * as `role` can never be smuggled in.
 */
export function parseInput<S extends z.ZodType>(
  schema: S,
  input: unknown,
): z.infer<S> {
  const result = schema.safeParse(input ?? {});
  if (!result.success) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Validation failed.",
      result.error.issues.map((issue) => ({
        field: issue.path.length ? issue.path.join(".") : undefined,
        message: issue.message,
      })),
    );
  }
  return result.data;
}
