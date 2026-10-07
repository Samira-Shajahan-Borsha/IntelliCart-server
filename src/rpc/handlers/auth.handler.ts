import { Injectable } from "@nestjs/common";
import { created, empty, ok } from "../../common/http/envelope";
import { parseInput } from "../../common/validation/parse-input";
import type {
  AuthServiceServer,
  AuthSessionResponse,
  ForgotPasswordRequest,
  ForgotPasswordResponse,
  LoginRequest,
  LoginResponse,
  LogoutResponse,
  RefreshResponse,
  RegisterRequest,
  RegisterResponse,
  ResendVerificationRequest,
  ResendVerificationResponse,
  ResetPasswordRequest,
  ResetPasswordResponse,
  VerifyEmailRequest,
  VerifyEmailResponse,
} from "../../generated/webrpc/shopwise.gen";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from "../../modules/auth/auth.schema";
import {
  AuthService,
  type IssuedSession,
} from "../../modules/auth/auth.service";
import type { RpcContext } from "../rpc-context";
import { RpcExecutor } from "../rpc-executor";
import { SessionCookies } from "../session-cookies";

/**
 * Thin WebRPC adapter for PRD 10.1. Responsibilities: runtime validation, trusted context
 * (cookies/CSRF/principal), envelope shaping and delegation to AuthService. No business
 * logic and no data access live here.
 */
@Injectable()
export class AuthRpcHandler implements AuthServiceServer<RpcContext> {
  constructor(
    private readonly auth: AuthService,
    private readonly cookies: SessionCookies,
    private readonly exec: RpcExecutor,
  ) {}

  /**
   * PRD Contract: API-001 POST /auth/register
   * RPC Method: AuthService.Register
   * Purpose: Creates a customer account and signs the new user in on the current device.
   * Access: Public. Rate limited per client IP.
   * Input: Validates name (2-100), email (normalized, max 254), password (8-128, letter + digit) and optional phone. Any client-sent role/status fields are ignored; role is always CUSTOMER.
   * Returns: 201 envelope with AuthSessionDTO (safe user DTO, access token, expiry, CSRF token). The refresh token is set only as an HttpOnly cookie.
   * Business Rules: Email uniqueness is enforced on the normalized value by a database constraint; a verification email is sent (delivery failure does not fail registration); a new revocable session is created.
   * Errors: VALIDATION_ERROR (422), CONFLICT (409) for an existing email, RATE_LIMITED (429).
   */
  async register(
    ctx: RpcContext,
    req: RegisterRequest,
  ): Promise<RegisterResponse> {
    return this.exec.run(ctx, "AuthService.Register", async () => {
      const input = parseInput(registerSchema, req.req);
      const session = await this.auth.register(input, this.meta(ctx));
      return {
        res: {
          ...created(
            "Account created successfully.",
            this.toSessionDTO(ctx, session),
          ),
        },
      };
    });
  }

  /**
   * PRD Contract: API-002 POST /auth/login
   * RPC Method: AuthService.Login
   * Purpose: Authenticates a user with email and password and opens a new device session.
   * Access: Public. Rate limited per client IP.
   * Input: Validates email (normalized) and a bounded password string.
   * Returns: 200 envelope with AuthSessionDTO; refresh token in an HttpOnly cookie.
   * Business Rules: Unknown email and wrong password return the same error with equalized timing (no account enumeration); DELETED accounts cannot sign in; BLOCKED accounts are refused only after a correct password.
   * Errors: VALIDATION_ERROR (422), UNAUTHENTICATED (401) invalid credentials, FORBIDDEN (403) blocked account, RATE_LIMITED (429).
   */
  async login(ctx: RpcContext, req: LoginRequest): Promise<LoginResponse> {
    return this.exec.run(ctx, "AuthService.Login", async () => {
      const input = parseInput(loginSchema, req.req);
      const session = await this.auth.login(input, this.meta(ctx));
      return {
        res: ok("Authenticated successfully.", this.toSessionDTO(ctx, session)),
      };
    });
  }

  /**
   * PRD Contract: API-003 POST /auth/refresh
   * RPC Method: AuthService.Refresh
   * Purpose: Rotates the refresh credential and issues a new access token for the same session.
   * Access: Session. Requires the HttpOnly refresh cookie plus a matching X-CSRF-Token header (double-submit). No user ID is accepted from the client.
   * Input: No payload; the credential is read from the cookie only.
   * Returns: 200 envelope with AuthSessionDTO, a rotated refresh cookie and a fresh CSRF token.
   * Business Rules: Refresh tokens are single-use. Reusing an already-rotated token (or losing a concurrent race for it) is treated as replay and revokes the entire session. Rotation never extends the absolute session expiry.
   * Errors: FORBIDDEN (403) CSRF mismatch, UNAUTHENTICATED (401) missing/invalid/expired/revoked/replayed session, RATE_LIMITED (429).
   */
  async refresh(ctx: RpcContext): Promise<RefreshResponse> {
    return this.exec.run(ctx, "AuthService.Refresh", async () => {
      this.cookies.assertCsrf(ctx);
      try {
        const session = await this.auth.refresh(
          this.cookies.readRefreshToken(ctx),
        );
        return {
          res: ok(
            "Session refreshed successfully.",
            this.toSessionDTO(ctx, session),
          ),
        };
      } catch (err) {
        // A dead refresh credential is useless to the browser; clear it so clients stop retrying.
        this.cookies.clear(ctx);
        throw err;
      }
    });
  }

  /**
   * PRD Contract: API-004 POST /auth/logout
   * RPC Method: AuthService.Logout
   * Purpose: Revokes the caller's current session/refresh credential.
   * Access: Auth. Either the refresh cookie (then X-CSRF-Token is mandatory) or a valid bearer access token identifies the session.
   * Input: No payload.
   * Returns: 200 envelope with no data; session cookies are cleared.
   * Business Rules: Revocation is persisted, and every authenticated call re-checks the session, so previously issued access tokens stop working immediately.
   * Errors: FORBIDDEN (403) CSRF mismatch when using the cookie, UNAUTHENTICATED (401) when no session can be identified.
   */
  async logout(ctx: RpcContext): Promise<LogoutResponse> {
    return this.exec.run(ctx, "AuthService.Logout", async () => {
      const rawRefreshToken = this.cookies.readRefreshToken(ctx);
      if (rawRefreshToken) this.cookies.assertCsrf(ctx);
      await this.auth.logout({ rawRefreshToken, principal: ctx.principal });
      this.cookies.clear(ctx);
      return { res: empty("Logged out successfully.") };
    });
  }

  /**
   * PRD Contract: API-005 POST /auth/forgot-password
   * RPC Method: AuthService.ForgotPassword
   * Purpose: Starts the password-reset flow by emailing a single-use reset link.
   * Access: Public. Rate limited per client IP.
   * Input: Validates and normalizes email.
   * Returns: 200 envelope with no data, identical whether or not the account exists.
   * Business Rules: No account enumeration; only ACTIVE accounts receive a link; issuing a new token invalidates older outstanding reset tokens; tokens are stored hashed and expire.
   * Errors: VALIDATION_ERROR (422), RATE_LIMITED (429).
   */
  async forgotPassword(
    ctx: RpcContext,
    req: ForgotPasswordRequest,
  ): Promise<ForgotPasswordResponse> {
    return this.exec.run(ctx, "AuthService.ForgotPassword", async () => {
      const { email } = parseInput(forgotPasswordSchema, req.req);
      await this.auth.forgotPassword(email);
      return {
        res: empty(
          "If an account exists for this email, a reset link has been sent.",
        ),
      };
    });
  }

  /**
   * PRD Contract: API-006 POST /auth/reset-password
   * RPC Method: AuthService.ResetPassword
   * Purpose: Sets a new password using a valid reset token.
   * Access: Public + reset token. Rate limited per client IP.
   * Input: Validates resetToken format and newPassword strength rules.
   * Returns: 200 envelope with no data.
   * Business Rules: The token is consumed exactly once; the password change and revocation of every existing session of the account happen in one transaction.
   * Errors: VALIDATION_ERROR (422), BAD_REQUEST (400) invalid/expired/used token, RATE_LIMITED (429).
   */
  async resetPassword(
    ctx: RpcContext,
    req: ResetPasswordRequest,
  ): Promise<ResetPasswordResponse> {
    return this.exec.run(ctx, "AuthService.ResetPassword", async () => {
      const input = parseInput(resetPasswordSchema, req.req);
      await this.auth.resetPassword(input.resetToken, input.newPassword);
      return { res: empty("Password has been reset. Please sign in again.") };
    });
  }

  /**
   * PRD Contract: API-007 POST /auth/verify-email
   * RPC Method: AuthService.VerifyEmail
   * Purpose: Marks the account email as verified using a verification token.
   * Access: Public + verification token. Rate limited per client IP.
   * Input: Validates token format.
   * Returns: 200 envelope with the updated UserDTO.
   * Business Rules: Tokens are single-use, hashed at rest and expire; token consumption and the account update are atomic.
   * Errors: VALIDATION_ERROR (422), BAD_REQUEST (400) invalid/expired/used token, RATE_LIMITED (429).
   */
  async verifyEmail(
    ctx: RpcContext,
    req: VerifyEmailRequest,
  ): Promise<VerifyEmailResponse> {
    return this.exec.run(ctx, "AuthService.VerifyEmail", async () => {
      const { token } = parseInput(verifyEmailSchema, req.req);
      const user = await this.auth.verifyEmail(token);
      return {
        res: ok(
          "Email verified successfully.",
          user as VerifyEmailResponse["res"]["data"],
        ),
      };
    });
  }

  /**
   * PRD Contract: API-008 POST /auth/resend-verification
   * RPC Method: AuthService.ResendVerification
   * Purpose: Re-sends the email verification link.
   * Access: Auth/Public policy. An authenticated caller resends for their own account (any email field is ignored); an anonymous caller must provide an email.
   * Input: Optional normalized email (required when anonymous).
   * Returns: 200 envelope with no data, identical for unknown, already-verified and pending accounts.
   * Business Rules: No account enumeration; issuing a new link invalidates older verification tokens; only ACTIVE unverified accounts receive mail.
   * Errors: VALIDATION_ERROR (422) when anonymous without email, RATE_LIMITED (429).
   */
  async resendVerification(
    ctx: RpcContext,
    req: ResendVerificationRequest,
  ): Promise<ResendVerificationResponse> {
    return this.exec.run(ctx, "AuthService.ResendVerification", async () => {
      const { email } = parseInput(resendVerificationSchema, req.req);
      await this.auth.resendVerification({ principal: ctx.principal, email });
      return {
        res: empty("If verification is pending, a new link has been sent."),
      };
    });
  }

  private meta(ctx: RpcContext) {
    return { userAgent: ctx.userAgent, ipAddress: ctx.ip };
  }

  /** Places the refresh token in cookies and builds the body DTO without it. */
  private toSessionDTO(
    ctx: RpcContext,
    session: IssuedSession,
  ): AuthSessionResponse["data"] {
    const csrfToken = this.cookies.issue(ctx, session.refreshToken);
    return {
      user: session.user as AuthSessionResponse["data"]["user"],
      accessToken: session.accessToken,
      expiresAt: session.expiresAt.toISOString(),
      csrfToken,
    };
  }
}
