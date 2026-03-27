import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuditController } from "./audit.controller";
import { AuditService } from "./audit.service";
import { OperationLogEntity } from "./entities/operation-log.entity";

@Module({
  imports: [TypeOrmModule.forFeature([OperationLogEntity])],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService]
})
export class AuditModule {}
