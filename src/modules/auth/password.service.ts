import { Injectable } from "@nestjs/common";
import * as argon2 from "argon2";

/**
 * Adaptive password hashing (PRD 11.1) with argon2id at OWASP-recommended baseline cost.
 */
@Injectable()
export class PasswordService {
  private static readonly OPTIONS: argon2.HashOptions & { raw: false } = {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
    raw: false,
  };

  /** Pre-computed hash verified when the account does not exist, to equalize login timing. */
  private dummyHash?: Promise<string>;

  hash(password: string): Promise<string> {
    return argon2.hash(password, PasswordService.OPTIONS);
  }

  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  /** Burns comparable CPU time for unknown accounts so response timing does not reveal existence. */
  async verifyAgainstDummy(password: string): Promise<false> {
    this.dummyHash ??= this.hash("dummy-password-for-timing-equalization-1");
    await this.verify(await this.dummyHash, password);
    return false;
  }
}
