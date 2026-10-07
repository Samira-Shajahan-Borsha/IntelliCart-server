import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** URL-safe, high-entropy opaque token (default 256 bits). */
export const randomToken = (bytes = 32): string =>
  randomBytes(bytes).toString("base64url");

/** Hex SHA-256. Used for storing opaque tokens; tokens are high-entropy so no salt is required. */
export const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

/** Constant-time string comparison that tolerates different lengths. */
export const safeEqual = (a: string, b: string): boolean => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};
