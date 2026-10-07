import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { AppError } from "../common/errors/app-error";

export interface RateLimitPolicy {
  limit: number;
  windowMs: number;
}

/**
 * Per-method limits for abuse-prone surfaces (PRD 11.1). Methods without a policy are
 * not rate-limited here. Later slices add search, agent, image and admin-job entries.
 */
export const RATE_LIMIT_POLICIES: Record<string, RateLimitPolicy> = {
  "AuthService.Register": { limit: 5, windowMs: 15 * 60_000 },
  "AuthService.Login": { limit: 10, windowMs: 15 * 60_000 },
  "AuthService.Refresh": { limit: 60, windowMs: 60_000 },
  "AuthService.ForgotPassword": { limit: 5, windowMs: 15 * 60_000 },
  "AuthService.ResetPassword": { limit: 10, windowMs: 15 * 60_000 },
  "AuthService.VerifyEmail": { limit: 20, windowMs: 15 * 60_000 },
  "AuthService.ResendVerification": { limit: 5, windowMs: 15 * 60_000 },
};

/**
 * Fixed-window in-process limiter keyed by method + client IP. Chosen to avoid an extra
 * service (no Redis). With multiple app instances each instance enforces its own window;
 * a Postgres-backed store can replace this class without changing callers.
 */
@Injectable()
export class RateLimiter implements OnModuleDestroy {
  private readonly windows = new Map<
    string,
    { count: number; resetAt: number }
  >();
  private readonly sweeper = setInterval(() => this.sweep(), 60_000).unref();

  /** Overridable in tests; production uses the static policy table. */
  policies: Record<string, RateLimitPolicy> = RATE_LIMIT_POLICIES;

  consume(method: string, clientKey: string, now = Date.now()): void {
    const policy = this.policies[method];
    if (!policy) return;
    const key = `${method}|${clientKey}`;
    const current = this.windows.get(key);
    if (!current || current.resetAt <= now) {
      this.windows.set(key, { count: 1, resetAt: now + policy.windowMs });
      return;
    }
    current.count += 1;
    if (current.count > policy.limit) {
      throw new AppError(
        "RATE_LIMITED",
        "Too many requests. Please try again later.",
      );
    }
  }

  onModuleDestroy(): void {
    clearInterval(this.sweeper);
  }

  private sweep(now = Date.now()): void {
    for (const [key, window] of this.windows)
      if (window.resetAt <= now) this.windows.delete(key);
  }
}
