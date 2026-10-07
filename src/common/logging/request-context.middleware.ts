import { randomUUID } from "node:crypto";
import { Inject, Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { APP_LOGGER, type AppLogger } from "./logger";

const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

export interface RequestWithId extends Request {
  requestId: string;
}

/**
 * Assigns a correlation ID (reusing a well-formed inbound X-Request-Id) and emits one
 * structured access-log line per request. Only method, path (no query string), status,
 * duration and the sanitized error code are logged - never bodies or headers.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(@Inject(APP_LOGGER) private readonly logger: AppLogger) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const inbound = req.header("x-request-id");
    const requestId =
      inbound && SAFE_REQUEST_ID.test(inbound) ? inbound : randomUUID();
    (req as RequestWithId).requestId = requestId;
    res.setHeader("X-Request-Id", requestId);

    const started = process.hrtime.bigint();
    res.on("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
      this.logger.info(
        {
          requestId,
          method: req.method,
          route: req.path,
          status: res.statusCode,
          durationMs: Math.round(durationMs * 10) / 10,
          errorCode: res.getHeader("X-Error-Code"),
        },
        "request completed",
      );
    });
    next();
  }
}
