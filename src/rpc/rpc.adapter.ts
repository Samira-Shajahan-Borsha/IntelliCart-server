import { All, Controller, Param, Req, Res } from "@nestjs/common";
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from "express";
import { AuthService as AuthApplicationService } from "../modules/auth/auth.service";
import { serveAuthServiceRpc } from "../generated/webrpc/shopwise.gen";
import { AuthRpcHandler } from "./handlers/auth.handler";
import type { RpcContext } from "./rpc-context";

/**
 * Adapts Nest/Express requests to the web-standard Request/Response objects emitted by
 * WebRPC code generation. Domain behavior stays in handwritten handlers and services.
 */
@Controller("rpc")
export class RpcAdapter {
  constructor(
    private readonly authHandler: AuthRpcHandler,
    private readonly auth: AuthApplicationService,
  ) {}

  /**
   * Generated transport entry point for API-001 through API-008.
   * RPC Method: AuthService.*
   * Purpose: Dispatches typed authentication WebRPC calls to the matching Nest-owned handler.
   * Access: Public/session/auth according to the individual handler contract; identity is resolved from a bearer token and live session record.
   * Input: Accepts JSON WebRPC requests at an allow-listed service and generated method path.
   * Returns: The generated WebRPC response, including cookies and PRD-compatible HTTP status.
   * Business Rules: Generated code performs structural decoding; handlers perform runtime validation, authorization, rate limiting and domain delegation.
   * Errors: Generated transport errors and safe mapped application errors; unknown service methods return not found.
   */
  @All("AuthService/:method")
  async authService(
    @Param("method") method: string,
    @Req() req: ExpressRequest,
    @Res() res: ExpressResponse,
  ): Promise<void> {
    const context = await this.createContext(req);
    const request = this.toWebRequest(req, method);
    const response = await serveAuthServiceRpc(
      this.authHandler,
      context,
      request,
    );
    if (!response) {
      res.status(404).json({
        error: "WebrpcBadRoute",
        code: -2,
        msg: "route not found",
        status: 404,
      });
      return;
    }

    for (const cookie of context.responseCookies)
      res.cookie(cookie.name, cookie.value, cookie.options);
    response.headers.forEach((value, name) => res.setHeader(name, value));
    if (context.errorCode) res.setHeader("X-Error-Code", context.errorCode);

    const body = await response.text();
    let status = response.status;
    if (response.ok && body) {
      try {
        const decoded = JSON.parse(body) as { res?: { status?: number } };
        if (Number.isInteger(decoded.res?.status))
          status = decoded.res!.status!;
      } catch {
        // Generated WebRPC always emits JSON; retain its status if a future generator changes that.
      }
    }
    res
      .status(status)
      .type(response.headers.get("content-type") ?? "application/json")
      .send(body);
  }

  private async createContext(req: ExpressRequest): Promise<RpcContext> {
    const authorization = req.header("authorization");
    const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    return {
      requestId:
        (req as ExpressRequest & { requestId?: string }).requestId ??
        "missing-request-id",
      ip: req.ip || req.socket.remoteAddress || "unknown",
      userAgent: req.header("user-agent"),
      cookies:
        (req.cookies as Record<string, string | undefined> | undefined) ?? {},
      header: (name) => req.header(name),
      responseCookies: [],
      principal: await this.auth.resolvePrincipal(bearer),
    };
  }

  private toWebRequest(req: ExpressRequest, method: string): Request {
    const origin = `${req.protocol}://${req.get("host") ?? "localhost"}`;
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      if (Array.isArray(value)) headers.set(name, value.join(", "));
      else if (value !== undefined) headers.set(name, value);
    }
    if (!headers.has("content-type"))
      headers.set("content-type", "application/json");
    return new Request(
      `${origin}/rpc/AuthService/${encodeURIComponent(method)}`,
      {
        method: req.method,
        headers,
        body:
          req.method === "GET" || req.method === "HEAD"
            ? undefined
            : JSON.stringify(req.body ?? {}),
      },
    );
  }
}
