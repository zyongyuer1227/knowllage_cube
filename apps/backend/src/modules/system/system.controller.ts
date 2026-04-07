import { Body, Controller, Get, Put, Req } from "@nestjs/common";
import { AuthRequest } from "../../common/auth/auth-request.interface";
import { Roles } from "../../common/decorators/roles.decorator";
import { Public } from "../../common/decorators/public.decorator";
import { UpdateDocumentTaxonomyDto } from "./dto/update-document-taxonomy.dto";
import { UpdatePreviewWatermarkDto } from "./dto/update-preview-watermark.dto";
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
  getPublicWelcomeDocument(@Req() req: AuthRequest) {
    return this.systemService.getPublicWelcomeDocument(req);
  }

  @Roles("admin")
  @Get("admin/welcome-document")
  getAdminWelcomeDocument(@Req() req: AuthRequest) {
    return this.systemService.getAdminWelcomeDocument(req);
  }

  @Roles("admin")
  @Put("admin/welcome-document")
  updateWelcomeDocument(@Body() body: UpdateWelcomeDocumentDto) {
    return this.systemService.updateWelcomeDocument(body);
  }

  @Roles("admin")
  @Get("admin/document-taxonomy")
  getAdminDocumentTaxonomy() {
    return this.systemService.getAdminDocumentTaxonomy();
  }

  @Roles("admin")
  @Put("admin/document-taxonomy")
  updateDocumentTaxonomy(@Body() body: UpdateDocumentTaxonomyDto) {
    return this.systemService.updateDocumentTaxonomy(body);
  }

  @Roles("admin")
  @Get("admin/preview-watermark")
  getAdminPreviewWatermark() {
    return this.systemService.getAdminPreviewWatermark();
  }

  @Roles("admin")
  @Put("admin/preview-watermark")
  updatePreviewWatermark(@Body() body: UpdatePreviewWatermarkDto) {
    return this.systemService.updatePreviewWatermark(body);
  }
}
