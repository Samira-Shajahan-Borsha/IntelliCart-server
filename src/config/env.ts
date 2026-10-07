import "dotenv/config";
import { z } from "zod";

/**
 * Fail-fast environment validation. The process refuses to boot with missing or weak
 * security settings instead of failing later at request time.
 */
const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(5000),
    CORS_ORIGINS: z
      .string()
      .default("http://localhost:3000")
      .transform((v) =>
        v
          .split(",")
          .map((o) => o.trim())
          .filter(Boolean),
      ),
    APP_BASE_URL: z.string().url(),
    DATABASE_URL: z.string().min(1),
    JWT_ACCESS_SECRET: z
      .string()
      .min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(60)
      .max(3600)
      .default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    EMAIL_TOKEN_TTL_MINUTES: z.coerce
      .number()
      .int()
      .min(5)
      .max(1440)
      .default(60),
    COOKIE_SECURE: z
      .enum(["true", "false"])
      .default("true")
      .transform((v) => v === "true"),
    MAIL_TRANSPORT: z.enum(["console", "memory"]).default("memory"),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production") {
      if (!env.COOKIE_SECURE) {
        ctx.addIssue({
          code: "custom",
          path: ["COOKIE_SECURE"],
          message: "must be true in production",
        });
      }
      // The console transport prints email links (which contain tokens) to stdout.
      if (env.MAIL_TRANSPORT === "console") {
        ctx.addIssue({
          code: "custom",
          path: ["MAIL_TRANSPORT"],
          message: "console transport is not allowed in production",
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

export const ENV = Symbol("ENV");

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    // Only variable names and rule messages are printed - never values.
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return parsed.data;
}
