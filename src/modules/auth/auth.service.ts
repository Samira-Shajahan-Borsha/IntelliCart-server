import { Inject, Injectable } from "@nestjs/common";
import type { User } from "@prisma/client";
import { ENV, type Env } from "../../config/env";
import type { AuthPrincipal } from "../../common/auth/principal";
import { AppError } from "../../common/errors/app-error";
import { APP_LOGGER, type AppLogger } from "../../common/logging/logger";
import { randomToken, sha256 } from "../../common/utils/crypto";
import { MailerService } from "../../lib/mailer/mailer.service";
import { toUserDTO, type UserDTO } from "./auth.mapper";
import { AuthRepository, type SessionMeta } from "./auth.repository";
import type { LoginInput, RegisterInput } from "./auth.schema";
import { PasswordService } from "./password.service";
import { TokenService } from "./token.service";

/** Result of any operation that establishes or renews a session. */
export interface IssuedSession {
  user: UserDTO;
  accessToken: string;
  expiresAt: Date;
  /** Raw refresh credential - the transport must place it in an HttpOnly cookie only. */
  refreshToken: string;
}

const INVALID_CREDENTIALS = "Invalid email or password.";
const INVALID_SESSION = "Session is invalid or has expired.";

/**
 * Authentication & session application service (PRD 10.1). Transport-agnostic: it never
 * touches cookies/headers, so the same rules apply to RPC handlers and any future caller.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly repo: AuthRepository,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly mailer: MailerService,
    @Inject(ENV) private readonly env: Env,
    @Inject(APP_LOGGER) private readonly logger: AppLogger,
  ) {}

  /**
   * Creates a CUSTOMER account (role is never client-controlled), opens a session and sends
   * a verification email. Duplicate normalized email -> CONFLICT (PRD 7.1 acceptance).
   */
  async register(
    input: RegisterInput,
    meta: SessionMeta,
  ): Promise<IssuedSession> {
    const passwordHash = await this.passwords.hash(input.password);
    const user = await this.repo.createUser({
      name: input.name,
      email: input.email,
      passwordHash,
      phone: input.phone,
    });
    if (!user)
      throw new AppError(
        "CONFLICT",
        "An account with this email already exists.",
      );

    this.logger.info(
      { event: "auth.register", userId: user.id },
      "account created",
    );
    await this.sendVerificationEmail(user);
    return this.openSession(user, meta);
  }

  /**
   * Verifies credentials with uniform failure (no account enumeration) and timing
   * equalization. BLOCKED accounts are refused only after a correct password so status is
   * not disclosed to someone who does not know the password.
   */
  async login(input: LoginInput, meta: SessionMeta): Promise<IssuedSession> {
    const user = await this.repo.findUserByEmail(input.email);
    const valid = user
      ? await this.passwords.verify(user.passwordHash, input.password)
      : await this.passwords.verifyAgainstDummy(input.password);

    if (!user || !valid || user.status === "DELETED") {
      this.logger.warn({ event: "auth.login_failed" }, "login failed");
      throw new AppError("UNAUTHENTICATED", INVALID_CREDENTIALS);
    }
    if (user.status === "BLOCKED")
      throw new AppError("FORBIDDEN", "This account is blocked.");

    this.logger.info(
      { event: "auth.login", userId: user.id },
      "login succeeded",
    );
    return this.openSession(user, meta);
  }

  /**
   * Rotates the refresh credential (single use). Presenting an already-used token is treated
   * as theft/replay: the whole session is revoked and the caller must sign in again.
   */
  async refresh(rawRefreshToken: string | undefined): Promise<IssuedSession> {
    if (!rawRefreshToken)
      throw new AppError("UNAUTHENTICATED", INVALID_SESSION);
    const record = await this.repo.findRefreshToken(sha256(rawRefreshToken));
    if (!record) throw new AppError("UNAUTHENTICATED", INVALID_SESSION);

    const { session } = record;
    if (record.usedAt) {
      await this.repo.revokeSession(session.id, "REFRESH_REUSE_DETECTED");
      this.logger.warn(
        { event: "auth.refresh_reuse", sessionId: session.id },
        "refresh token reuse detected",
      );
      throw new AppError("UNAUTHENTICATED", INVALID_SESSION);
    }
    const now = new Date();
    if (
      session.revokedAt ||
      session.expiresAt <= now ||
      record.expiresAt <= now ||
      session.user.status !== "ACTIVE"
    ) {
      throw new AppError("UNAUTHENTICATED", INVALID_SESSION);
    }

    const refreshToken = randomToken();
    const rotated = await this.repo.rotateRefreshToken({
      oldTokenId: record.id,
      sessionId: session.id,
      newTokenHash: sha256(refreshToken),
      // Rotation never extends the absolute session lifetime.
      expiresAt: session.expiresAt,
    });
    if (!rotated) {
      // Lost a concurrent race for the same token: equivalent to replay.
      await this.repo.revokeSession(session.id, "REFRESH_REUSE_DETECTED");
      throw new AppError("UNAUTHENTICATED", INVALID_SESSION);
    }

    const access = this.tokens.signAccessToken({
      sub: session.userId,
      sid: session.id,
      role: session.user.role,
    });
    return {
      user: toUserDTO(session.user),
      accessToken: access.token,
      expiresAt: access.expiresAt,
      refreshToken,
    };
  }

  /**
   * Revokes the caller's current session. The session is identified by the refresh cookie
   * when present (works even after the access token expired), otherwise by the principal.
   */
  async logout(input: {
    rawRefreshToken?: string;
    principal: AuthPrincipal | null;
  }): Promise<void> {
    let sessionId = input.principal?.sessionId;
    if (input.rawRefreshToken) {
      const record = await this.repo.findRefreshToken(
        sha256(input.rawRefreshToken),
      );
      if (record) sessionId = record.sessionId;
    }
    if (!sessionId)
      throw new AppError("UNAUTHENTICATED", "Authentication is required.");
    await this.repo.revokeSession(sessionId, "LOGOUT");
    this.logger.info({ event: "auth.logout", sessionId }, "session revoked");
  }

  /**
   * Always succeeds from the caller's perspective to prevent account enumeration. A reset
   * link is sent only to ACTIVE accounts; older outstanding reset tokens are invalidated.
   */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.repo.findUserByEmail(email);
    if (!user || user.status !== "ACTIVE") return;

    const token = randomToken();
    await this.repo.replaceEmailToken({
      userId: user.id,
      type: "PASSWORD_RESET",
      tokenHash: sha256(token),
      expiresAt: this.tokens.emailTokenExpiry(),
    });
    await this.safeSend(
      user.email,
      "Reset your ShopWise password",
      `Reset link: ${this.link("/reset-password", token)}`,
    );
  }

  /** Consumes a reset token, sets the new password and revokes every session of the account. */
  async resetPassword(resetToken: string, newPassword: string): Promise<void> {
    const passwordHash = await this.passwords.hash(newPassword);
    const reset = await this.repo.resetPasswordWithToken(
      sha256(resetToken),
      passwordHash,
    );
    if (!reset)
      throw new AppError(
        "BAD_REQUEST",
        "Reset token is invalid or has expired.",
      );
    this.logger.info(
      { event: "auth.password_reset" },
      "password reset; all sessions revoked",
    );
  }

  /** Consumes a verification token and marks the email verified in one transaction. */
  async verifyEmail(token: string): Promise<UserDTO> {
    const user = await this.repo.verifyEmailWithToken(sha256(token));
    if (!user)
      throw new AppError(
        "BAD_REQUEST",
        "Verification token is invalid or has expired.",
      );
    return toUserDTO(user);
  }

  /**
   * Resend policy: an authenticated caller resends for their own account; an anonymous
   * caller supplies an email and always receives the same success response.
   */
  async resendVerification(input: {
    principal: AuthPrincipal | null;
    email?: string;
  }): Promise<void> {
    if (!input.principal && !input.email) {
      throw new AppError("VALIDATION_ERROR", "Validation failed.", [
        { field: "email", message: "Email is required." },
      ]);
    }
    const user = input.principal
      ? await this.repo.findUserById(input.principal.userId)
      : await this.repo.findUserByEmail(input.email!);

    if (!user || user.status !== "ACTIVE" || user.emailVerifiedAt) return;
    await this.sendVerificationEmail(user);
  }

  /**
   * Resolves a bearer access token to a principal, re-checking that the session is still
   * live and the account ACTIVE. Returns null (anonymous) rather than throwing, so public
   * operations keep working with a stale token while protected ones reject with 401.
   */
  async resolvePrincipal(
    accessToken: string | undefined,
  ): Promise<AuthPrincipal | null> {
    if (!accessToken) return null;
    const claims = this.tokens.verifyAccessToken(accessToken);
    if (!claims) return null;
    const session = await this.repo.findActiveSession(claims.sid);
    if (
      !session ||
      session.userId !== claims.sub ||
      session.user.status !== "ACTIVE"
    )
      return null;
    // Role is read from the database, not the token, so role changes apply immediately.
    return {
      userId: session.userId,
      sessionId: session.id,
      role: session.user.role,
    };
  }

  private async openSession(
    user: User,
    meta: SessionMeta,
  ): Promise<IssuedSession> {
    const refreshToken = randomToken();
    const { sessionId } = await this.repo.createSession({
      userId: user.id,
      meta,
      expiresAt: this.tokens.refreshExpiry(),
      refreshTokenHash: sha256(refreshToken),
    });
    const access = this.tokens.signAccessToken({
      sub: user.id,
      sid: sessionId,
      role: user.role,
    });
    return {
      user: toUserDTO(user),
      accessToken: access.token,
      expiresAt: access.expiresAt,
      refreshToken,
    };
  }

  private async sendVerificationEmail(user: User): Promise<void> {
    const token = randomToken();
    await this.repo.replaceEmailToken({
      userId: user.id,
      type: "EMAIL_VERIFICATION",
      tokenHash: sha256(token),
      expiresAt: this.tokens.emailTokenExpiry(),
    });
    await this.safeSend(
      user.email,
      "Verify your ShopWise email",
      `Verification link: ${this.link("/verify-email", token)}`,
    );
  }

  /** Email delivery failure must not fail the account operation; it is logged without content. */
  private async safeSend(
    to: string,
    subject: string,
    text: string,
  ): Promise<void> {
    try {
      await this.mailer.send({ to, subject, text });
    } catch (err) {
      this.logger.error(
        { event: "mail.send_failed", subject, err: (err as Error).name },
        "email delivery failed",
      );
    }
  }

  private link(path: string, token: string): string {
    return `${this.env.APP_BASE_URL}${path}?token=${encodeURIComponent(token)}`;
  }
}
