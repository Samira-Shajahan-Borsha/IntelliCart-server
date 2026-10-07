import { Inject, Injectable } from "@nestjs/common";
import { ENV, type Env } from "../config/env";
import { AppError } from "../common/errors/app-error";
import { randomToken, safeEqual } from "../common/utils/crypto";
import type { RpcContext } from "./rpc-context";

export const REFRESH_COOKIE = "sw_rt";
export const CSRF_COOKIE = "sw_csrf";
export const CSRF_HEADER = "x-csrf-token";
/** The refresh cookie is only ever sent to auth RPC endpoints, never to the rest of the API. */
const REFRESH_COOKIE_PATH = "/rpc/AuthService";

/**
 * Cookie + double-submit CSRF policy for the session transport (PRD 4.6 / 11.1).
 * The refresh token lives only in an HttpOnly cookie. Because that cookie is attached
 * automatically by browsers, every call that uses it must also echo the readable CSRF
 * cookie value in the X-CSRF-Token header.
 */
@Injectable()
export class SessionCookies {
  constructor(@Inject(ENV) private readonly env: Env) {}

  /** Sets refresh + CSRF cookies and returns the CSRF value so it can also go in the body. */
  issue(ctx: RpcContext, refreshToken: string): string {
    const maxAge = this.env.REFRESH_TOKEN_TTL_DAYS * 86_400_000;
    const csrf = randomToken(24);
    ctx.responseCookies.push(
      {
        name: REFRESH_COOKIE,
        value: refreshToken,
        options: {
          httpOnly: true,
          secure: this.env.COOKIE_SECURE,
          sameSite: "lax",
          path: REFRESH_COOKIE_PATH,
          maxAge,
        },
      },
      {
        name: CSRF_COOKIE,
        value: csrf,
        options: {
          httpOnly: false,
          secure: this.env.COOKIE_SECURE,
          sameSite: "lax",
          path: "/",
          maxAge,
        },
      },
    );
    return csrf;
  }

  clear(ctx: RpcContext): void {
    const base = {
      secure: this.env.COOKIE_SECURE,
      sameSite: "lax" as const,
      maxAge: 0,
    };
    ctx.responseCookies.push(
      {
        name: REFRESH_COOKIE,
        value: "",
        options: { ...base, httpOnly: true, path: REFRESH_COOKIE_PATH },
      },
      {
        name: CSRF_COOKIE,
        value: "",
        options: { ...base, httpOnly: false, path: "/" },
      },
    );
  }

  readRefreshToken(ctx: RpcContext): string | undefined {
    return ctx.cookies[REFRESH_COOKIE] || undefined;
  }

  /** Rejects cookie-authenticated calls whose CSRF header does not match the CSRF cookie. */
  assertCsrf(ctx: RpcContext): void {
    const cookie = ctx.cookies[CSRF_COOKIE];
    const header = ctx.header(CSRF_HEADER);
    if (!cookie || !header || !safeEqual(cookie, header)) {
      throw new AppError("FORBIDDEN", "CSRF validation failed.");
    }
  }
}
