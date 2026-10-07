import type { HasPrincipal } from "../common/auth/principal";

export interface CookieInstruction {
  name: string;
  value: string;
  options: {
    httpOnly: boolean;
    secure: boolean;
    sameSite: "lax" | "strict";
    path: string;
    maxAge: number;
  };
}

/**
 * Trusted per-request context handed to every generated WebRPC server method.
 * Identity comes only from `principal`, which the RPC controller resolves from the
 * verified access token - never from request payloads.
 */
export interface RpcContext extends HasPrincipal {
  requestId: string;
  ip: string;
  userAgent?: string;
  cookies: Record<string, string | undefined>;
  header(name: string): string | undefined;
  /** Cookies the handler wants set/cleared; applied by the controller after dispatch. */
  responseCookies: CookieInstruction[];
  /** Sanitized PRD error code of a failed call, surfaced to the access log. */
  errorCode?: string;
}
