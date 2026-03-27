import { Controller, Get, Query } from "@nestjs/common";
import { Roles } from "../../common/decorators/roles.decorator";
import { QueryAuditDto } from "./dto/query-audit.dto";
import { AuditService } from "./audit.service";

@Roles("admin")
@Controller("admin/audits")
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get("bootstrap")
  bootstrapInfo() {
    return this.auditService.bootstrapInfo();
  }

  @Get()
  list(@Query() query: QueryAuditDto) {
    return this.auditService.list(query);
  }
}
