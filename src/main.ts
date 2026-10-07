import "reflect-metadata";
import cookieParser from "cookie-parser";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ENV, type Env } from "./config/env";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bodyParser: true });
  const env = app.get<Env>(ENV);
  app.use(cookieParser());
  app.enableCors({ origin: env.CORS_ORIGINS, credentials: true });
  app.getHttpAdapter().getInstance().set("trust proxy", 1);
  app.enableShutdownHooks();
  await app.listen(env.PORT);
}

void bootstrap();
