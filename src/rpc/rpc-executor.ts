import { Inject, Injectable } from "@nestjs/common";
import { APP_LOGGER, type AppLogger } from "../common/logging/logger";
import { RateLimiter } from "./rate-limiter";
import type { RpcContext } from "./rpc-context";
import { toWebrpcError } from "./rpc-error.mapper";

/**
 * Cross-cutting wrapper every handler method runs through: rate limiting before the
 * call and safe error mapping after it. Keeps handlers thin and uniform.
 */
@Injectable()
export class RpcExecutor {
  constructor(
    private readonly rateLimiter: RateLimiter,
    @Inject(APP_LOGGER) private readonly logger: AppLogger,
  ) {}

  async run<T>(
    ctx: RpcContext,
    method: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    try {
      this.rateLimiter.consume(method, ctx.ip);
      return await fn();
    } catch (err) {
      throw toWebrpcError(err, ctx, this.logger);
    }
  }
}
