import { Module } from "@nestjs/common";
import { AuthRepository } from "./auth.repository";
import { AuthService } from "./auth.service";
import { PasswordService } from "./password.service";
import { TokenService } from "./token.service";

@Module({
  providers: [AuthRepository, AuthService, PasswordService, TokenService],
  exports: [AuthService],
})
export class AuthModule {}
