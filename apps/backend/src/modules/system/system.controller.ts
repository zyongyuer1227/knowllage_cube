import { Body, Controller, Get, Put } from "@nestjs/common";
import { Roles } from "../../common/decorators/roles.decorator";
import { Public } from "../../common/decorators/public.decorator";
import { UpdateWelcomeDocumentDto } from "./dto/update-welcome-document.dto";
import { SystemService } from "./system.service";

@Controller("system")
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Public()
  @Get("health")
  health() {
    return this.systemService.health();
  }

  @Public()
  @Get("welcome-document")
  getPublicWelcomeDocument() {
    return this.systemService.getPublicWelcomeDocument();
  }

  @Roles("admin")
  @Get("admin/welcome-document")
  getAdminWelcomeDocument() {
    return this.systemService.getAdminWelcomeDocument();
  }

  @Roles("admin")
  @Put("admin/welcome-document")
  updateWelcomeDocument(@Body() body: UpdateWelcomeDocumentDto) {
    return this.systemService.updateWelcomeDocument(body);
  }
}
