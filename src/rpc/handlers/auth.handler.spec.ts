import { VALIDATION_ERRORError } from "../../generated/webrpc/shopwise.gen";
import { AuthRpcHandler } from "./auth.handler";
import type { RpcContext } from "../rpc-context";

const context = (): RpcContext => ({
  requestId: "request-123",
  ip: "127.0.0.1",
  userAgent: "jest",
  cookies: {},
  header: () => undefined,
  responseCookies: [],
  principal: null,
});

describe("AuthRpcHandler", () => {
  const auth = {
    register: jest.fn(),
    refresh: jest.fn(),
  };
  const cookies = {
    issue: jest.fn(),
    assertCsrf: jest.fn(),
    readRefreshToken: jest.fn(),
    clear: jest.fn(),
  };
  const exec = {
    run: jest.fn(
      async (_ctx: RpcContext, _method: string, fn: () => Promise<unknown>) =>
        fn(),
    ),
  };
  const handler = () =>
    new AuthRpcHandler(auth as never, cookies as never, exec as never);

  beforeEach(() => jest.clearAllMocks());

  it("normalizes and validates registration before delegating", async () => {
    auth.register.mockResolvedValue({
      user: { id: "usr_1" },
      accessToken: "access",
      expiresAt: new Date("2026-10-01T00:15:00.000Z"),
      refreshToken: "refresh",
    });
    cookies.issue.mockReturnValue("csrf");

    const result = await handler().register(context(), {
      req: { name: " Ada ", email: " ADA@EXAMPLE.COM ", password: "Password1" },
    });

    expect(auth.register).toHaveBeenCalledWith(
      { name: "Ada", email: "ada@example.com", password: "Password1" },
      { userAgent: "jest", ipAddress: "127.0.0.1" },
    );
    expect(result.res.status).toBe(201);
    expect(result.res.data.csrfToken).toBe("csrf");
  });

  it("maps validation failures through the RPC executor", async () => {
    exec.run.mockImplementationOnce(
      async (ctx: RpcContext, _method: string, fn: () => Promise<unknown>) => {
        try {
          return await fn();
        } catch {
          ctx.errorCode = "VALIDATION_ERROR";
          throw new VALIDATION_ERRORError({ message: "Validation failed." });
        }
      },
    );

    await expect(
      handler().register(context(), {
        req: { name: "A", email: "bad", password: "weak" },
      }),
    ).rejects.toMatchObject({ code: 1000, status: 422 });
    expect(auth.register).not.toHaveBeenCalled();
  });

  it("checks CSRF before rotating a cookie-backed refresh token", async () => {
    cookies.readRefreshToken.mockReturnValue("refresh");
    auth.refresh.mockResolvedValue({
      user: { id: "usr_1" },
      accessToken: "access",
      expiresAt: new Date("2026-10-01T00:15:00.000Z"),
      refreshToken: "next-refresh",
    });
    cookies.issue.mockReturnValue("next-csrf");

    await handler().refresh(context());
    expect(cookies.assertCsrf).toHaveBeenCalledTimes(1);
    expect(auth.refresh).toHaveBeenCalledWith("refresh");
  });
});
