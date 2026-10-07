import cookieParser from "cookie-parser";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../src/app.module";
import { PrismaService } from "../../src/database/prisma/prisma.service";

describe("Auth WebRPC (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `auth-e2e-${Date.now()}@example.com`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it("registers, rotates a refresh token, revokes the session, and rejects reuse", async () => {
    const agent = request.agent(app.getHttpServer());
    const registered = await agent.post("/rpc/AuthService/Register").send({
      req: { name: "E2E Customer", email, password: "StrongPassword1" },
    });

    expect(registered.status).toBe(201);
    expect(registered.body.res.data.user.email).toBe(email);
    expect(registered.body.res.data.user).not.toHaveProperty("passwordHash");
    expect(registered.headers["set-cookie"]).toEqual(
      expect.arrayContaining([
        expect.stringContaining("sw_rt="),
        expect.stringContaining("HttpOnly"),
      ]),
    );

    const refreshed = await agent
      .post("/rpc/AuthService/Refresh")
      .set("X-CSRF-Token", registered.body.res.data.csrfToken)
      .send({});
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.res.data.accessToken).toEqual(expect.any(String));

    const loggedOut = await request(app.getHttpServer())
      .post("/rpc/AuthService/Logout")
      .set("Authorization", `Bearer ${refreshed.body.res.data.accessToken}`)
      .send({});
    expect(loggedOut.status).toBe(200);

    const afterLogout = await agent
      .post("/rpc/AuthService/Refresh")
      .set("X-CSRF-Token", refreshed.body.res.data.csrfToken)
      .send({});
    expect(afterLogout.status).toBe(401);
    expect(afterLogout.body.error).toBe("UNAUTHENTICATED");
  });
});
