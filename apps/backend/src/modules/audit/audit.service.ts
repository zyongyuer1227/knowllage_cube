import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { QueryAuditDto } from "./dto/query-audit.dto";
import { OperationLogEntity } from "./entities/operation-log.entity";

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(OperationLogEntity)
    private readonly operationLogRepository: Repository<OperationLogEntity>
  ) {}

  bootstrapInfo() {
    return {
      message: "Audit module is ready"
    };
  }

  async record(input: {
    operatorId?: number | string;
    operation: string;
    targetType: string;
    targetId: string;
    detail?: Record<string, unknown>;
  }) {
    await this.operationLogRepository.save(
      this.operationLogRepository.create({
        operatorId: input.operatorId ? String(input.operatorId) : null,
        operation: input.operation,
        targetType: input.targetType,
        targetId: input.targetId,
        detail: input.detail ?? null
      })
    );
  }

  async list(query: QueryAuditDto) {
    const qb = this.operationLogRepository.createQueryBuilder("log");
    if (query.operation) {
      qb.andWhere("log.operation = :operation", { operation: query.operation });
    }
    if (query.targetType) {
      qb.andWhere("log.target_type = :targetType", { targetType: query.targetType });
    }
    if (query.operatorId) {
      qb.andWhere("log.operator_id = :operatorId", { operatorId: query.operatorId });
    }

    qb.orderBy("log.createdAt", "DESC");
    qb.skip((query.page - 1) * query.pageSize).take(query.pageSize);
    const [rows, total] = await qb.getManyAndCount();
    return {
      page: query.page,
      pageSize: query.pageSize,
      total,
      items: rows
    };
  }
}
