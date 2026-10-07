import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { ConfigModule } from "./config/config.module";
import { LoggingModule } from "./common/logging/logging.module";
import { RequestContextMiddleware } from "./common/logging/request-context.middleware";
import { PrismaModule } from "./database/prisma/prisma.module";
import { MailerModule } from "./lib/mailer/mailer.service";
import { RpcModule } from "./rpc/rpc.module";

@Module({
  imports: [ConfigModule, LoggingModule, PrismaModule, MailerModule, RpcModule],
  providers: [RequestContextMiddleware],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes("*");
  }
}
