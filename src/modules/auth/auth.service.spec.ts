import { sha256 } from "../../common/utils/crypto";
import { AuthService } from "./auth.service";

const user = {
  id: "usr_1",
  name: "Ada Lovelace",
  email: "ada@example.com",
  passwordHash: "hash",
  phone: null,
  role: "CUSTOMER" as const,
  status: "ACTIVE" as const,
  emailVerifiedAt: null,
  avatarUrl: null,
  createdAt: new Date("2026-10-01T00:00:00.000Z"),
  updatedAt: new Date("2026-10-01T00:00:00.000Z"),
  deletedAt: null,
};

describe("AuthService", () => {
  const repo = {
    createUser: jest.fn(),
    createSession: jest.fn(),
    replaceEmailToken: jest.fn(),
    findUserByEmail: jest.fn(),
    findUserById: jest.fn(),
    findRefreshToken: jest.fn(),
    rotateRefreshToken: jest.fn(),
    revokeSession: jest.fn(),
    resetPasswordWithToken: jest.fn(),
    verifyEmailWithToken: jest.fn(),
    findActiveSession: jest.fn(),
  };
  const passwords = {
    hash: jest.fn(),
    verify: jest.fn(),
    verifyAgainstDummy: jest.fn(),
  };
  const tokens = {
    signAccessToken: jest.fn(),
    verifyAccessToken: jest.fn(),
    refreshExpiry: jest.fn(),
    emailTokenExpiry: jest.fn(),
  };
  const mailer = { send: jest.fn() };
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const env = {
    APP_BASE_URL: "http://localhost:3000",
  };

  const service = () =>
    new AuthService(
      repo as never,
      passwords as never,
      tokens as never,
      mailer as never,
      env as never,
      logger as never,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    passwords.hash.mockResolvedValue("new-hash");
    tokens.emailTokenExpiry.mockReturnValue(
      new Date("2026-10-02T00:00:00.000Z"),
    );
    tokens.refreshExpiry.mockReturnValue(new Date("2026-11-01T00:00:00.000Z"));
    tokens.signAccessToken.mockReturnValue({
      token: "access-token",
      expiresAt: new Date("2026-10-01T00:15:00.000Z"),
    });
    repo.createSession.mockResolvedValue({ sessionId: "ses_1" });
    repo.replaceEmailToken.mockResolvedValue(undefined);
    mailer.send.mockResolvedValue(undefined);
  });

  it("creates only a CUSTOMER account and opens a revocable session", async () => {
    repo.createUser.mockResolvedValue(user);
    const result = await service().register(
      {
        name: user.name,
        email: user.email,
        password: "Password1",
        phone: undefined,
      },
      { ipAddress: "127.0.0.1" },
    );

    expect(repo.createUser).toHaveBeenCalledWith({
      name: user.name,
      email: user.email,
      passwordHash: "new-hash",
      phone: undefined,
    });
    expect(repo.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: user.id,
        refreshTokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
    expect(result.user).not.toHaveProperty("passwordHash");
    expect(result.accessToken).toBe("access-token");
  });

  it("maps a duplicate normalized email to a conflict", async () => {
    repo.createUser.mockResolvedValue(null);
    await expect(
      service().register(
        { name: user.name, email: user.email, password: "Password1" },
        {},
      ),
    ).rejects.toMatchObject({ code: "CONFLICT", statusCode: 409 });
  });

  it("uses dummy verification and returns the same error for an unknown account", async () => {
    repo.findUserByEmail.mockResolvedValue(null);
    passwords.verifyAgainstDummy.mockResolvedValue(false);

    await expect(
      service().login({ email: "missing@example.com", password: "wrong" }, {}),
    ).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
      message: "Invalid email or password.",
    });
    expect(passwords.verifyAgainstDummy).toHaveBeenCalledWith("wrong");
  });

  it("revokes the full session when a used refresh token is replayed", async () => {
    repo.findRefreshToken.mockResolvedValue({
      id: "rt_1",
      usedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      session: {
        id: "ses_1",
        userId: user.id,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        user,
      },
    });

    await expect(service().refresh("refresh-token")).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    expect(repo.findRefreshToken).toHaveBeenCalledWith(sha256("refresh-token"));
    expect(repo.revokeSession).toHaveBeenCalledWith(
      "ses_1",
      "REFRESH_REUSE_DETECTED",
    );
  });

  it("uses the atomic repository operation for password reset", async () => {
    repo.resetPasswordWithToken.mockResolvedValue(true);
    await service().resetPassword(
      "reset-token-value-123456789",
      "NewPassword1",
    );
    expect(repo.resetPasswordWithToken).toHaveBeenCalledWith(
      sha256("reset-token-value-123456789"),
      "new-hash",
    );
  });

  it("uses the atomic repository operation for email verification", async () => {
    repo.verifyEmailWithToken.mockResolvedValue({
      ...user,
      emailVerifiedAt: new Date(),
    });
    const result = await service().verifyEmail(
      "verification-token-value-123456789",
    );
    expect(repo.verifyEmailWithToken).toHaveBeenCalledWith(
      sha256("verification-token-value-123456789"),
    );
    expect(result.emailVerified).toBe(true);
  });
});
