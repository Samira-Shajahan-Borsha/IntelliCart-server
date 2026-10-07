// Deterministic, non-secret values so unit tests never depend on a developer's local .env.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??=
  "postgresql://shopwise:shopwise@localhost:5433/shopwise_test";
process.env.JWT_ACCESS_SECRET ??=
  "test-access-secret-at-least-32-characters-long";
process.env.APP_BASE_URL ??= "http://localhost:3000";
process.env.COOKIE_SECURE = "false";
process.env.MAIL_TRANSPORT = "memory";
