import { Injectable } from "@nestjs/common";
import {
  Prisma,
  type EmailTokenType,
  type SessionRevokeReason,
  type User,
} from "@prisma/client";
import { PrismaService } from "../../database/prisma/prisma.service";

export interface SessionMeta {
  userAgent?: string;
  ipAddress?: string;
}

/**
 * Data access for identity/session tables. All writes that must be atomic are exposed as
 * single repository methods running one Prisma transaction, so the service never has to
 * coordinate partial writes.
 */
@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  findUserByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findUserById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  /** Returns null when the normalized email is already taken (unique violation P2002). */
  async createUser(data: {
    name: string;
    email: string;
    passwordHash: string;
    phone?: string;
  }): Promise<User | null> {
    try {
      return await this.prisma.user.create({ data });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      )
        return null;
      throw err;
    }
  }

  /** Creates a device session together with its first refresh token. */
  async createSession(input: {
    userId: string;
    meta: SessionMeta;
    expiresAt: Date;
    refreshTokenHash: string;
  }): Promise<{ sessionId: string }> {
    const session = await this.prisma.session.create({
      data: {
        userId: input.userId,
        userAgent: input.meta.userAgent?.slice(0, 512),
        ipAddress: input.meta.ipAddress?.slice(0, 64),
        expiresAt: input.expiresAt,
        refreshTokens: {
          create: {
            tokenHash: input.refreshTokenHash,
            expiresAt: input.expiresAt,
          },
        },
      },
      select: { id: true },
    });
    return { sessionId: session.id };
  }

  findRefreshToken(tokenHash: string) {
    return this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { session: { include: { user: true } } },
    });
  }

  /**
   * Atomically consumes `oldTokenId` and issues its successor. The conditional
   * `usedAt: null` update is the concurrency guard: if two refreshes race with the same
   * token, exactly one wins and the other observes count = 0 (treated as replay).
   */
  async rotateRefreshToken(input: {
    oldTokenId: string;
    sessionId: string;
    newTokenHash: string;
    expiresAt: Date;
  }): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const consumed = await tx.refreshToken.updateMany({
        where: { id: input.oldTokenId, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (consumed.count !== 1) return false;
      await tx.refreshToken.create({
        data: {
          sessionId: input.sessionId,
          tokenHash: input.newTokenHash,
          expiresAt: input.expiresAt,
        },
      });
      await tx.session.update({
        where: { id: input.sessionId },
        data: { lastUsedAt: new Date() },
      });
      return true;
    });
  }

  findActiveSession(sessionId: string) {
    return this.prisma.session.findFirst({
      where: { id: sessionId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        userId: true,
        user: { select: { role: true, status: true } },
      },
    });
  }

  async revokeSession(
    sessionId: string,
    reason: SessionRevokeReason,
  ): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  /** Invalidates outstanding tokens of a type before issuing a new one, so only the latest link works. */
  async replaceEmailToken(input: {
    userId: string;
    type: EmailTokenType;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.emailToken.updateMany({
        where: { userId: input.userId, type: input.type, consumedAt: null },
        data: { consumedAt: new Date() },
      }),
      this.prisma.emailToken.create({ data: input }),
    ]);
  }

  /**
   * Consumes a valid, unexpired token of the given type exactly once.
   * Returns the owning user ID, or null if the token is unknown/expired/already used.
   */
  async consumeEmailToken(
    tokenHash: string,
    type: EmailTokenType,
  ): Promise<string | null> {
    const token = await this.prisma.emailToken.findUnique({
      where: { tokenHash },
    });
    if (
      !token ||
      token.type !== type ||
      token.consumedAt ||
      token.expiresAt <= new Date()
    )
      return null;
    const consumed = await this.prisma.emailToken.updateMany({
      where: { id: token.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    return consumed.count === 1 ? token.userId : null;
  }

  /**
   * Consumes a password-reset token, replaces the password hash and revokes every active
   * session in one transaction. A failed write rolls the token consumption back as well.
   */
  async resetPasswordWithToken(
    tokenHash: string,
    passwordHash: string,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const token = await tx.emailToken.findUnique({ where: { tokenHash } });
      if (
        !token ||
        token.type !== "PASSWORD_RESET" ||
        token.consumedAt ||
        token.expiresAt <= new Date()
      ) {
        return false;
      }

      const user = await tx.user.findFirst({
        where: { id: token.userId, status: "ACTIVE" },
        select: { id: true },
      });
      if (!user) return false;

      const consumed = await tx.emailToken.updateMany({
        where: { id: token.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      if (consumed.count !== 1) return false;

      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      await tx.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: "PASSWORD_RESET" },
      });
      return true;
    });
  }

  /** Consumes an email-verification token and marks its account verified atomically. */
  async verifyEmailWithToken(tokenHash: string): Promise<User | null> {
    return this.prisma.$transaction(async (tx) => {
      const token = await tx.emailToken.findUnique({ where: { tokenHash } });
      if (
        !token ||
        token.type !== "EMAIL_VERIFICATION" ||
        token.consumedAt ||
        token.expiresAt <= new Date()
      ) {
        return null;
      }

      const user = await tx.user.findFirst({
        where: { id: token.userId, status: { not: "DELETED" } },
      });
      if (!user) return null;

      const consumed = await tx.emailToken.updateMany({
        where: { id: token.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      if (consumed.count !== 1) return null;

      if (user.emailVerifiedAt) return user;
      return tx.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: new Date() },
      });
    });
  }
}
