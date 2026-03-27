import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";

@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>("JWT_SECRET", "replace-this-secret"),
        signOptions: {
          expiresIn: configService.get<string>("JWT_EXPIRES_IN", "8h")
        }
      })
    })
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [JwtModule]
})
export class AuthModule {}
