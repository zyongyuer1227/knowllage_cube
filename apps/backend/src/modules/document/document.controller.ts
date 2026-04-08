import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFiles,
  UploadedFile,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor, FilesInterceptor } from "@nestjs/platform-express";
import { AuthRequest } from "../../common/auth/auth-request.interface";
import { Roles } from "../../common/decorators/roles.decorator";
import { CreateFolderDto } from "./dto/create-folder.dto";
import { FormatTextImportDto } from "./dto/format-text-import.dto";
import { RollbackVersionDto } from "./dto/rollback-version.dto";
import { UploadDocumentDto } from "./dto/upload-document.dto";
import { UpdateDocumentContentDto } from "./dto/update-document-content.dto";
import { UpdateDocumentDto } from "./dto/update-document.dto";
import { VersionDiffQueryDto } from "./dto/version-diff-query.dto";
import { DocumentService } from "./document.service";

@Roles("admin")
@Controller("admin/documents")
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  @Get("bootstrap")
  bootstrapInfo() {
    return this.documentService.bootstrapInfo();
  }

  @Get("folders")
  listFolders() {
    return this.documentService.listFolders();
  }

  @Post("folders")
  createFolder(@Body() body: CreateFolderDto, @Req() req: AuthRequest) {
    return this.documentService.createFolder(body.path, req.user?.sub);
  }

  @Post("upload")
  @UseInterceptors(FileInterceptor("file"))
  uploadDocument(
    @UploadedFile() file: { originalname: string; buffer?: Buffer; size?: number; path?: string } | undefined,
    @Body() body: UploadDocumentDto,
    @Req() req: AuthRequest
  ) {
    if (!file) {
      throw new BadRequestException("Missing file");
    }
    const byteLength = file.buffer?.byteLength ?? file.size ?? 0;
    if (byteLength <= 0 && !file.path) {
      throw new BadRequestException("Empty file");
    }
    return this.documentService.uploadAndConvert(file, this.normalizeUploadBody(body), req.user?.sub);
  }

  @Post("upload/batch")
  @UseInterceptors(FilesInterceptor("files", 100))
  uploadDocumentsBatch(
    @UploadedFiles() files: Array<{ originalname: string; buffer?: Buffer; size?: number; path?: string }> | undefined,
    @Body() body: UploadDocumentDto,
    @Req() req: AuthRequest
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException("Missing files");
    }
    return this.documentService.uploadBatch(files, this.normalizeUploadBody(body), req.user?.sub);
  }

  @Post("format-text-import")
  formatTextImport(@Body() body: FormatTextImportDto, @Req() req: AuthRequest) {
    return this.documentService.formatTextAndImport(body, req.user?.sub);
  }

  @Get("tasks/:taskId")
  getTask(@Param("taskId") taskId: string) {
    return this.documentService.getTask(taskId);
  }

  @Post("tasks/:taskId/retry")
  retryTask(@Param("taskId") taskId: string) {
    return this.documentService.retryTask(taskId);
  }

  @Get(":id")
  getDocument(@Param("id") id: string, @Req() req: AuthRequest) {
    return this.documentService.getDocument(id, req);
  }

  @Get(":id/export/pdf")
  async exportDocumentPdf(@Param("id") id: string, @Req() req: AuthRequest, @Res({ passthrough: true }) res: any) {
    const exported = await this.documentService.exportDocumentPdf(id, req);
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(exported.fileName)}"`
    });
    return new StreamableFile(exported.buffer);
  }

  @Post(":id/attachments")
  @UseInterceptors(FileInterceptor("file"))
  async uploadAttachment(
    @Param("id") id: string,
    @UploadedFile()
    file: { originalname: string; buffer?: Buffer; size?: number; path?: string; mimetype?: string } | undefined,
    @Req() req: AuthRequest
  ) {
    if (!file) {
      throw new BadRequestException("Missing file");
    }
    const byteLength = file.buffer?.byteLength ?? file.size ?? 0;
    if (byteLength <= 0 && !file.path) {
      throw new BadRequestException("Empty file");
    }
    return this.documentService.addAttachment(id, file, req.user?.sub);
  }

  @Delete(":id/attachments/:attachmentId")
  deleteAttachment(
    @Param("id") id: string,
    @Param("attachmentId") attachmentId: string,
    @Req() req: AuthRequest
  ) {
    return this.documentService.deleteAttachment(id, attachmentId, req.user?.sub);
  }

  @Get(":id/attachments/:attachmentId/download")
  async downloadAttachment(
    @Param("id") id: string,
    @Param("attachmentId") attachmentId: string,
    @Res({ passthrough: true }) res: any
  ) {
    const attachment = await this.documentService.getAttachmentFile(id, attachmentId);
    res.set({
      "Content-Type": attachment.mimeType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(attachment.fileName)}"`
    });
    return new StreamableFile(attachment.buffer);
  }

  @Put(":id")
  updateDocument(@Param("id") id: string, @Body() body: UpdateDocumentDto, @Req() req: AuthRequest) {
    return this.documentService.updateDocument(id, body, req.user?.sub);
  }

  @Delete(":id")
  deleteDocument(@Param("id") id: string, @Req() req: AuthRequest) {
    return this.documentService.deleteDocument(id, req.user?.sub);
  }

  @Put(":id/content")
  updateDocumentContent(@Param("id") id: string, @Body() body: UpdateDocumentContentDto, @Req() req: AuthRequest) {
    return this.documentService.updateDocumentContent(id, body, req.user?.sub);
  }

  @Get(":id/versions")
  listVersions(@Param("id") id: string) {
    return this.documentService.listVersions(id);
  }

  @Get(":id/versions/:versionNo/diff")
  getVersionDiff(
    @Param("id") id: string,
    @Param("versionNo") versionNo: string,
    @Query() query: VersionDiffQueryDto
  ) {
    return this.documentService.getVersionDiff(id, Number(versionNo), query.targetVersionNo);
  }

  @Post(":id/versions/:versionNo/rollback")
  rollbackVersion(
    @Param("id") id: string,
    @Param("versionNo") versionNo: string,
    @Body() body: RollbackVersionDto,
    @Req() req: AuthRequest
  ) {
    return this.documentService.rollbackToVersion(id, Number(versionNo), body.changeNote, req.user?.sub);
  }

  private normalizeUploadBody(body: UploadDocumentDto) {
    const payload = body as UploadDocumentDto & Record<string, unknown>;
    return {
      ...body,
      title: this.normalizeScalarValue(payload.title),
      archivePath: this.normalizeScalarValue(payload.archivePath),
      businessPath: this.normalizeArrayValue(payload.businessPath),
      legalPath: this.normalizeArrayValue(payload.legalPath)
    } satisfies UploadDocumentDto;
  }

  private normalizeScalarValue(value: unknown) {
    if (Array.isArray(value)) {
      const lastValue = value[value.length - 1];
      return typeof lastValue === "string" ? lastValue : undefined;
    }
    return typeof value === "string" ? value : undefined;
  }

  private normalizeArrayValue(value: unknown) {
    const parseJsonArray = (input: unknown) => {
      if (typeof input !== "string") {
        return null;
      }
      const trimmed = input.trim();
      if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
        return null;
      }
      try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed)
          ? parsed.map((item) => String(item ?? "").trim()).filter(Boolean)
          : null;
      } catch {
        return null;
      }
    };

    if (Array.isArray(value)) {
      if (value.length === 1) {
        const parsed = parseJsonArray(value[0]);
        if (parsed) {
          return parsed;
        }
      }
      return value
        .map((item) => String(item ?? "").trim())
        .filter(Boolean);
    }
    const parsed = parseJsonArray(value);
    if (parsed) {
      return parsed;
    }
    if (typeof value === "string" && value.trim()) {
      return [value.trim()];
    }
    return undefined;
  }
}
