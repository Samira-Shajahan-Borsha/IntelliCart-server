import pino, { type Logger } from "pino";

export const APP_LOGGER = Symbol("APP_LOGGER");
export type AppLogger = Logger;

/**
 * Paths censored in every log line. Covers credentials, tokens, cookies and secrets
 * wherever they appear in structured log objects (PRD 11.3).
 */
export const REDACT_PATHS = [
  "password",
  "newPassword",
  "passwordHash",
  "token",
  "resetToken",
  "accessToken",
  "refreshToken",
  "csrfToken",
  "authorization",
  "cookie",
  "secret",
  "*.password",
  "*.newPassword",
  "*.passwordHash",
  "*.token",
  "*.resetToken",
  "*.accessToken",
  "*.refreshToken",
  "*.csrfToken",
  "*.authorization",
  "*.cookie",
  "*.secret",
  "headers.authorization",
  "headers.cookie",
  'headers["x-csrf-token"]',
];

export function createLogger(level: string): AppLogger {
  return pino({
    level,
    base: { service: "shopwise-backend" },
    redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}
