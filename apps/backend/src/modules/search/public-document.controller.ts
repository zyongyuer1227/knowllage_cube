import { Controller, Get, Param, Req } from "@nestjs/common";
import { Res, StreamableFile } from "@nestjs/common";
import { AuthRequest } from "../../common/auth/auth-request.interface";
import { Public } from "../../common/decorators/public.decorator";
import { DocumentService } from "../document/document.service";
import { SearchService } from "./search.service";

@Controller("public/documents")
export class PublicDocumentController {
  constructor(
    private readonly searchService: SearchService,
    private readonly documentService: DocumentService
  ) {}

  @Public()
  @Get(":id")
  getDocumentPreview(@Param("id") id: string, @Req() req: AuthRequest) {
    return this.searchService.getDocumentPreview(id, req);
  }

  @Public()
  @Get(":id/export/pdf")
  async exportDocumentPdf(@Param("id") id: string, @Req() req: AuthRequest, @Res({ passthrough: true }) res: any) {
    const exported = await this.documentService.exportPublicDocumentPdf(id, req);
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(exported.fileName)}"`
    });
    return new StreamableFile(exported.buffer);
  }
}
