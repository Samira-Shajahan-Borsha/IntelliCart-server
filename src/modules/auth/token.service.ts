import { Inject, Injectable } from "@nestjs/common";
import jwt from "jsonwebtoken";
import { ENV, type Env } from "../../config/env";
import type { Role } from "../../common/auth/principal";

export interface AccessTokenClaims {
  sub: string;
  sid: string;
  role: Role;
}

const ISSUER = "shopwise-backend";
const AUDIENCE = "shopwise-api";

/**
 * Short-lived HS256 access tokens. They carry only identifiers; authorization decisions
 * always re-check the live session row, so revocation is effective immediately.
 */
@Injectable()
export class TokenService {
  constructor(@Inject(ENV) private readonly env: Env) {}

  signAccessToken(claims: AccessTokenClaims): {
    token: string;
    expiresAt: Date;
  } {
    const ttl = this.env.ACCESS_TOKEN_TTL_SECONDS;
    const token = jwt.sign(
      { sid: claims.sid, role: claims.role },
      this.env.JWT_ACCESS_SECRET,
      {
        algorithm: "HS256",
        subject: claims.sub,
        expiresIn: ttl,
        issuer: ISSUER,
        audience: AUDIENCE,
      },
    );
    return { token, expiresAt: new Date(Date.now() + ttl * 1000) };
  }

  /** Returns null for any invalid/expired/forged token; never throws to callers. */
  verifyAccessToken(token: string): AccessTokenClaims | null {
    try {
      const payload = jwt.verify(token, this.env.JWT_ACCESS_SECRET, {
        algorithms: ["HS256"],
        issuer: ISSUER,
        audience: AUDIENCE,
      });
      if (
        typeof payload === "string" ||
        typeof payload.sub !== "string" ||
        typeof payload.sid !== "string"
      ) {
        return null;
      }
      return { sub: payload.sub, sid: payload.sid, role: payload.role as Role };
    } catch {
      return null;
    }
  }

  refreshExpiry(): Date {
    return new Date(Date.now() + this.env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
  }

  emailTokenExpiry(): Date {
    return new Date(Date.now() + this.env.EMAIL_TOKEN_TTL_MINUTES * 60_000);
  }
}
