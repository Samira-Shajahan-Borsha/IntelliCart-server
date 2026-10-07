import { Module } from "@nestjs/common";
import { AuthModule } from "../modules/auth/auth.module";
import { AuthRpcHandler } from "./handlers/auth.handler";
import { RateLimiter } from "./rate-limiter";
import { RpcAdapter } from "./rpc.adapter";
import { RpcExecutor } from "./rpc-executor";
import { SessionCookies } from "./session-cookies";

@Module({
  imports: [AuthModule],
  controllers: [RpcAdapter],
  providers: [AuthRpcHandler, RateLimiter, RpcExecutor, SessionCookies],
})
export class RpcModule {}
