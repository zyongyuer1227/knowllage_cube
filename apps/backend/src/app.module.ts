import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { RolesGuard } from "./common/guards/roles.guard";
import { AuthModule } from "./modules/auth/auth.module";
import { AuditModule } from "./modules/audit/audit.module";
import { DocumentModule } from "./modules/document/document.module";
import { SearchModule } from "./modules/search/search.module";
import { SystemModule } from "./modules/system/system.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: "postgres",
        host: configService.getOrThrow<string>("DB_HOST"),
        port: Number(configService.getOrThrow<string>("DB_PORT")),
        username: configService.getOrThrow<string>("DB_USER"),
        password: configService.getOrThrow<string>("DB_PASSWORD"),
        database: configService.getOrThrow<string>("DB_NAME"),
        autoLoadEntities: true,
        synchronize: false
      })
    }),
    AuthModule,
    DocumentModule,
    SearchModule,
    AuditModule,
    SystemModule
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard }
  ]
})
export class AppModule {}
