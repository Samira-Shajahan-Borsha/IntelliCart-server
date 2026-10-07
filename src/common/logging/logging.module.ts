import { Global, Module } from "@nestjs/common";
import { ENV, type Env } from "../../config/env";
import { APP_LOGGER, createLogger } from "./logger";

@Global()
@Module({
  providers: [
    {
      provide: APP_LOGGER,
      inject: [ENV],
      useFactory: (env: Env) => createLogger(env.LOG_LEVEL),
    },
  ],
  exports: [APP_LOGGER],
})
export class LoggingModule {}
