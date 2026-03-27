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
  UploadedFiles,
  UploadedFile,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor, FilesInterceptor } from "@nestjs/platform-express";
import { AuthRequest } from "../../common/auth/auth-request.interface";
import { Roles } from "../../common/decorators/roles.decorator";
import { CreateFolderDto } from "./dto/create-folder.dto";
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
    return this.documentService.uploadAndConvert(file, body, req.user?.sub);
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
    return this.documentService.uploadBatch(files, body, req.user?.sub);
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
  getDocument(@Param("id") id: string) {
    return this.documentService.getDocument(id);
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
}
