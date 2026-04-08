import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from "@nestjs/common";
import { randomUUID } from "crypto";
import { InjectRepository } from "@nestjs/typeorm";
import { execFile } from "child_process";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import { basename, join, resolve } from "path";
import { promisify } from "util";
import { chromium, type Page } from "playwright-core";
import { QueryFailedError, Repository } from "typeorm";
import { AuthRequest } from "../../common/auth/auth-request.interface";
import { UpdateDocumentDto } from "./dto/update-document.dto";
import { FormatTextImportDto } from "./dto/format-text-import.dto";
import { UploadDocumentDto } from "./dto/upload-document.dto";
import { UpdateDocumentContentDto } from "./dto/update-document-content.dto";
import { AuditService } from "../audit/audit.service";
import { SystemService } from "../system/system.service";
import { DocumentContentEntity } from "./entities/document-content.entity";
import { DocumentFolderEntity } from "./entities/document-folder.entity";
import { DocumentConversionTaskEntity } from "./entities/document-conversion-task.entity";
import { type DocumentAttachment, DocumentEntity } from "./entities/document.entity";
import { DocumentVersionEntity } from "./entities/document-version.entity";
import { renderPersistedPreviewHtml } from "./document-preview.util";
import { type DocumentAttributeInput, type DocumentTaxonomyNode } from "./document-taxonomy";
import { type PreviewWatermarkRenderContext } from "./preview-watermark.util";

@Injectable()
export class DocumentService implements OnModuleInit {
  private readonly execFileAsync = promisify(execFile);
  private readonly supportedExt = new Set([".doc", ".docx", ".txt", ".pdf", ".html", ".htm"]);
  private readonly documentsRoot = join(process.cwd(), "storage", "documents");
  private readonly repoRoot = resolve(__dirname, "../../../../../");
  private readonly wordToMdScriptPath = join(this.repoRoot, "scripts", "word2md_converter.py");
  private readonly textToMdScriptPath = join(this.repoRoot, "scripts", "text2md_formatter.py");
  private readonly wordToMdSamplePath = join(this.repoRoot, "scripts", "sample.md");

  constructor(
    @InjectRepository(DocumentEntity)
    private readonly documentRepository: Repository<DocumentEntity>,
    @InjectRepository(DocumentContentEntity)
    private readonly contentRepository: Repository<DocumentContentEntity>,
    @InjectRepository(DocumentFolderEntity)
    private readonly folderRepository: Repository<DocumentFolderEntity>,
    @InjectRepository(DocumentConversionTaskEntity)
    private readonly taskRepository: Repository<DocumentConversionTaskEntity>,
    @InjectRepository(DocumentVersionEntity)
    private readonly versionRepository: Repository<DocumentVersionEntity>,
    private readonly auditService: AuditService,
    private readonly systemService: SystemService
  ) {}

  async onModuleInit() {
    const tasks = await this.taskRepository.find({
      where: [{ status: "pending" }, { status: "processing" }],
      order: { updatedAt: "ASC" }
    });
    tasks.forEach((task) => {
      this.startTaskProcessing(task.id);
    });
  }

  bootstrapInfo() {
    return {
      message: "Document module is ready"
    };
  }

  async listFolders() {
    let rows: DocumentFolderEntity[] = [];
    try {
      rows = await this.folderRepository.find({
        order: { fullPath: "ASC" }
      });
    } catch (error) {
      if (!this.isMissingFolderTableError(error)) {
        throw error;
      }
    }
    return {
      total: rows.length,
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        fullPath: row.fullPath,
        parentPath: row.parentPath
      }))
    };
  }

  async createFolder(path: string, operatorId?: number) {
    const normalizedPath = this.normalizeFolderPath(path);
    const segments = normalizedPath.split("/");
    let parentPath: string | null = null;

    for (let i = 0; i < segments.length; i += 1) {
      const name = segments[i];
      const fullPath = segments.slice(0, i + 1).join("/");
      const existing = await this.folderRepository.findOne({ where: { fullPath } });
      if (!existing) {
        await this.folderRepository.save(
          this.folderRepository.create({
            name,
            fullPath,
            parentPath
          })
        );
      }
      parentPath = fullPath;
    }

    await this.logDocOperation(operatorId, "document_folder.create", normalizedPath, {
      path: normalizedPath
    });

    return {
      path: normalizedPath,
      created: true
    };
  }

  async uploadAndConvert(
    file: { originalname: string; buffer?: Buffer; size?: number; path?: string },
    body: UploadDocumentDto,
    operatorId?: number
  ) {
    const requestedTitle = this.normalizeMultipartText(body.title || file.originalname.replace(/\.[^.]+$/, ""));
    const normalizedArchivePath = body.archivePath ? this.normalizeMultipartText(body.archivePath) : null;
    const normalizedOriginalName = this.normalizeMultipartText(file.originalname);
    const attributes = await this.normalizeDocumentAttributes(body);
    const normalizedTitle = await this.resolveAvailableTitle(requestedTitle);
    const ext = this.normalizeExt(normalizedOriginalName);
    if (!this.supportedExt.has(ext)) {
      throw new BadRequestException(`Unsupported file type: ${ext}`);
    }
    const fileBuffer = await this.readUploadedFile(file);

    const document = await this.documentRepository.save(
      this.documentRepository.create({
        title: normalizedTitle,
        archivePath: normalizedArchivePath ? this.normalizeFolderPath(normalizedArchivePath) : null,
        businessDomain: attributes.businessPath[0] ?? null,
        businessSubdomain: attributes.businessPath[1] ?? null,
        businessPath: attributes.businessPath,
        legalLevel: attributes.legalPath[0] ?? null,
        legalPath: attributes.legalPath,
        attachments: []
      })
    );

    const filePath = await this.persistFile(document.id, normalizedOriginalName, fileBuffer);
    const task = await this.taskRepository.save(
      this.taskRepository.create({
        documentId: document.id,
        status: "pending",
        retryCount: 0,
        errorMessage: null,
        sourceFilename: normalizedOriginalName,
        sourceExt: ext,
        filePath
      })
    );
    await this.logDocOperation(operatorId, "document.upload", document.id, {
      requestedTitle,
      resolvedTitle: normalizedTitle,
      ...attributes,
      sourceFilename: normalizedOriginalName,
      sourceExt: ext,
      taskId: task.id
    });

    this.startTaskProcessing(task.id);

    return {
      documentId: document.id,
      title: normalizedTitle,
      ...attributes,
      taskId: task.id,
      taskStatus: task.status,
      errorMessage: task.errorMessage
    };
  }

  async uploadBatch(
    files: Array<{ originalname: string; buffer?: Buffer; size?: number; path?: string }>,
    body: UploadDocumentDto,
    operatorId?: number
  ) {
    const results: Array<Record<string, unknown>> = [];
    for (const file of files) {
      try {
        const result = await this.uploadAndConvert(file, body, operatorId);
        results.push({
          fileName: file.originalname,
          success: true,
          ...result
        });
      } catch (error) {
        results.push({
          fileName: file.originalname,
          success: false,
          errorMessage: error instanceof Error ? error.message : "Unknown upload error"
        });
      }
    }
    const successCount = results.filter((item) => item.success === true).length;
    return {
      total: results.length,
      successCount,
      failedCount: results.length - successCount,
      items: results
    };
  }

  async formatTextAndImport(body: FormatTextImportDto, operatorId?: number) {
    const requestedTitle = this.normalizeMultipartText(body.title).trim();
    const normalizedArchivePath = body.archivePath ? this.normalizeMultipartText(body.archivePath) : null;
    const attributes = await this.normalizeDocumentAttributes(body);
    const rawText = body.text?.trim();
    const documentId = body.documentId?.trim() || "";
    if (!requestedTitle) {
      throw new BadRequestException("Title is required");
    }
    if (!rawText) {
      throw new BadRequestException("Text content is empty");
    }
    const normalizedTitle = documentId
      ? await this.resolveAvailableTitle(requestedTitle, documentId)
      : await this.resolveAvailableTitle(requestedTitle);
    const markdownLikeText = await this.runTextToMarkdownScript(rawText);
    const normalizedMarkdown = this.ensureMarkdownTitle(normalizedTitle, markdownLikeText);

    if (documentId) {
      const document = await this.documentRepository.findOne({ where: { id: documentId } });
      if (!document) {
        throw new NotFoundException("Document not found");
      }
      document.title = normalizedTitle;
      document.archivePath = normalizedArchivePath ? this.normalizeFolderPath(normalizedArchivePath) : null;
      document.businessDomain = attributes.businessPath[0] ?? null;
      document.businessSubdomain = attributes.businessPath[1] ?? null;
      document.businessPath = attributes.businessPath;
      document.legalLevel = attributes.legalPath[0] ?? null;
      document.legalPath = attributes.legalPath;
      await this.documentRepository.save(document);

      await this.contentRepository.delete({ documentId });
      await this.contentRepository.save(
        this.contentRepository.create({
          documentId,
          rawText: this.extractRawTextFromMarkdown(normalizedMarkdown),
          markdownContent: normalizedMarkdown
        })
      );

      const version = await this.createVersionSnapshot(documentId, operatorId, "Formatted with AI from editor text");
      await this.syncDocumentAssets(documentId);
      await this.logDocOperation(operatorId, "document.ai_format_update", documentId, {
        requestedTitle,
        resolvedTitle: normalizedTitle,
        ...attributes,
        currentVersion: version.versionNo
      });
      return {
        documentId,
        title: normalizedTitle,
        ...attributes,
        updated: true,
        currentVersion: version.versionNo
      };
    }

    const fileBuffer = Buffer.from(normalizedMarkdown, "utf-8");

    return this.uploadAndConvert(
      {
        originalname: `${normalizedTitle}.txt`,
        buffer: fileBuffer,
        size: fileBuffer.byteLength
      },
      {
        title: normalizedTitle,
        archivePath: normalizedArchivePath ?? undefined,
        businessPath: attributes.businessPath.length > 0 ? attributes.businessPath : undefined,
        legalPath: attributes.legalPath.length > 0 ? attributes.legalPath : undefined
      },
      operatorId
    );
  }

  async getTask(taskId: string) {
    const task = await this.taskRepository.findOne({ where: { id: taskId } });
    if (!task) {
      throw new NotFoundException("Task not found");
    }
    return {
      id: task.id,
      documentId: task.documentId,
      status: task.status,
      retryCount: task.retryCount,
      errorMessage: task.errorMessage,
      updatedAt: task.updatedAt
    };
  }

  async retryTask(taskId: string) {
    const task = await this.taskRepository.findOne({ where: { id: taskId } });
    if (!task) {
      throw new NotFoundException("Task not found");
    }
    if (task.status === "success") {
      return {
        id: task.id,
        status: task.status,
        message: "Task already succeeded"
      };
    }
    task.retryCount += 1;
    task.status = "pending";
    task.errorMessage = null;
    await this.taskRepository.save(task);
    this.startTaskProcessing(task.id);
    return this.getTask(task.id);
  }

  private startTaskProcessing(taskId: string) {
    setImmediate(() => {
      void this.processTask(taskId);
    });
  }

  async getDocument(id: string, req?: AuthRequest) {
    const document = await this.documentRepository.findOne({ where: { id } });
    if (!document) {
      throw new NotFoundException("Document not found");
    }
    const content = await this.contentRepository.findOne({
      where: { documentId: id },
      order: { createdAt: "DESC" }
    });
    return {
      ...document,
      attachments: this.serializeAttachments(document.attachments),
      markdownContent: content?.markdownContent ?? null,
      rawText: await this.readTextFile(this.getDocumentAssetPaths(id).rawTextPath),
      previewHtml: content?.markdownContent
        ? await renderPersistedPreviewHtml(
            content.markdownContent,
            this.buildWatermarkContext("admin", req, {
              id: document.id,
              title: document.title,
              archivePath: document.archivePath
            }, "view", "screen")
          )
        : null,
      persistedAssets: await this.getPersistedAssetDescriptor(id)
    };
  }

  async exportDocumentPdf(id: string, req?: AuthRequest) {
    return this.exportDocumentPdfForSource(id, "admin", req);
  }

  async exportPublicDocumentPdf(id: string, req?: AuthRequest) {
    return this.exportDocumentPdfForSource(id, "public", req);
  }

  async addAttachment(
    documentId: string,
    file: { originalname: string; buffer?: Buffer; size?: number; path?: string; mimetype?: string },
    operatorId?: number
  ) {
    const document = await this.documentRepository.findOne({ where: { id: documentId } });
    if (!document) {
      throw new NotFoundException("Document not found");
    }

    const fileBuffer = await this.readUploadedFile(file);
    const attachment = await this.persistAttachment(documentId, file.originalname, fileBuffer, file.mimetype);
    const attachments = [...this.normalizeAttachments(document.attachments), attachment];
    document.attachments = attachments;
    await this.documentRepository.save(document);
    await this.syncDocumentAssets(documentId);
    await this.logDocOperation(operatorId, "document.attachment.add", documentId, {
      attachmentId: attachment.id,
      fileName: attachment.fileName,
      size: attachment.size
    });

    return {
      documentId,
      attachment: this.serializeAttachment(attachment),
      attachments: this.serializeAttachments(attachments)
    };
  }

  async deleteAttachment(documentId: string, attachmentId: string, operatorId?: number) {
    const document = await this.documentRepository.findOne({ where: { id: documentId } });
    if (!document) {
      throw new NotFoundException("Document not found");
    }

    const attachments = this.normalizeAttachments(document.attachments);
    const target = attachments.find((item) => item.id === attachmentId);
    if (!target) {
      throw new NotFoundException("Attachment not found");
    }

    await fs.rm(this.resolveAttachmentPath(documentId, target.relativePath), { force: true });
    document.attachments = attachments.filter((item) => item.id !== attachmentId);
    await this.documentRepository.save(document);
    await this.syncDocumentAssets(documentId);
    await this.logDocOperation(operatorId, "document.attachment.delete", documentId, {
      attachmentId,
      fileName: target.fileName
    });

    return {
      documentId,
      attachmentId,
      deleted: true,
      attachments: this.serializeAttachments(document.attachments)
    };
  }

  async getAttachmentFile(documentId: string, attachmentId: string) {
    const document = await this.documentRepository.findOne({ where: { id: documentId } });
    if (!document) {
      throw new NotFoundException("Document not found");
    }

    const attachment = this.normalizeAttachments(document.attachments).find((item) => item.id === attachmentId);
    if (!attachment) {
      throw new NotFoundException("Attachment not found");
    }

    return {
      buffer: await fs.readFile(this.resolveAttachmentPath(documentId, attachment.relativePath)),
      fileName: attachment.displayName || attachment.fileName,
      mimeType: attachment.mimeType
    };
  }

  private async exportDocumentPdfForSource(
    id: string,
    source: PreviewWatermarkRenderContext["source"],
    req?: AuthRequest
  ) {
    const document = await this.documentRepository.findOne({ where: { id } });
    if (!document) {
      throw new NotFoundException("Document not found");
    }
    const content = await this.contentRepository.findOne({
      where: { documentId: id },
      order: { createdAt: "DESC" }
    });
    if (!content?.markdownContent) {
      throw new NotFoundException("Document content not found");
    }

    const html = await renderPersistedPreviewHtml(
      content.markdownContent,
      this.buildWatermarkContext(source, req, {
        id: document.id,
        title: document.title,
        archivePath: document.archivePath
      }, "export", "export")
    );
    const executablePath = await this.resolvePdfBrowserExecutablePath();
    const browser = await chromium.launch({
      executablePath,
      headless: true
    });

    try {
      const page = await browser.newPage();
      await page.emulateMedia({ media: "print" });
      await page.setContent(html, { waitUntil: "networkidle" });
      await this.waitForPdfPageReady(page);
      const pdf = await page.pdf({
        format: "A4",
        preferCSSPageSize: true,
        scale: 1,
        printBackground: true,
        margin: {
          top: "0",
          right: "0",
          bottom: "0",
          left: "0"
        }
      });

      return {
        fileName: `${this.sanitizeDownloadFilename(document.title || `document-${id}`)}.pdf`,
        buffer: pdf
      };
    } finally {
      await browser.close();
    }
  }

  async updateDocument(id: string, body: UpdateDocumentDto, operatorId?: number) {
    const document = await this.documentRepository.findOne({ where: { id } });
    if (!document) {
      throw new NotFoundException("Document not found");
    }
    if (body.archivePath !== undefined) {
      this.validateArchivePath(body.archivePath);
      document.archivePath = body.archivePath || null;
    }
    if (body.title !== undefined) {
      document.title = await this.resolveAvailableTitle(body.title, id);
    }
    if (body.businessPath !== undefined || body.legalPath !== undefined) {
      const attributes = await this.normalizeDocumentAttributes({
        businessPath: body.businessPath !== undefined ? body.businessPath : document.businessPath,
        legalPath: body.legalPath !== undefined ? body.legalPath : document.legalPath
      });
      document.businessDomain = attributes.businessPath[0] ?? null;
      document.businessSubdomain = attributes.businessPath[1] ?? null;
      document.businessPath = attributes.businessPath;
      document.legalLevel = attributes.legalPath[0] ?? null;
      document.legalPath = attributes.legalPath;
    }
    await this.documentRepository.save(document);
    await this.tryCreateVersionSnapshot(id, operatorId, "Metadata update");
    await this.syncDocumentAssets(id);
    await this.logDocOperation(operatorId, "document.update", id, {
      title: document.title
    });
    return this.getDocument(id);
  }

  async deleteDocument(id: string, operatorId?: number) {
    const document = await this.documentRepository.findOne({ where: { id } });
    if (!document) {
      throw new NotFoundException("Document not found");
    }
    const tasks = await this.taskRepository.find({ where: { documentId: id } });
    for (const task of tasks) {
      if (task.filePath) {
        await fs.rm(task.filePath, { force: true });
      }
    }
    await fs.rm(this.getDocumentStorageDir(id), { recursive: true, force: true });
    await this.versionRepository.delete({ documentId: id });
    await this.contentRepository.delete({ documentId: id });
    await this.taskRepository.delete({ documentId: id });
    await this.documentRepository.delete({ id });
    await this.logDocOperation(operatorId, "document.delete", id, {});
    return {
      id,
      deleted: true
    };
  }

  async updateDocumentContent(id: string, body: UpdateDocumentContentDto, operatorId?: number) {
    const document = await this.documentRepository.findOne({ where: { id } });
    if (!document) {
      throw new NotFoundException("Document not found");
    }

    await this.contentRepository.delete({ documentId: id });
    await this.contentRepository.save(
      this.contentRepository.create({
        documentId: id,
        rawText: null,
        markdownContent: body.markdownContent
      })
    );

    const version = await this.createVersionSnapshot(id, operatorId, body.changeNote ?? "Content update");
    await this.syncDocumentAssets(id);
    await this.logDocOperation(operatorId, "document.update_content", id, {
      currentVersion: version.versionNo,
      changeNote: body.changeNote ?? null
    });
    return {
      documentId: id,
      currentVersion: version.versionNo
    };
  }

  async listVersions(id: string) {
    await this.ensureDocumentExists(id);
    const rows = await this.versionRepository.find({
      where: { documentId: id },
      order: { versionNo: "DESC" }
    });
    return {
      total: rows.length,
      items: rows.map((row) => ({
        id: row.id,
        versionNo: row.versionNo,
        changeNote: row.changeNote,
        changedBy: row.changedBy,
        createdAt: row.createdAt
      }))
    };
  }

  async getVersionDiff(id: string, sourceVersionNo: number, targetVersionNo: number) {
    await this.ensureDocumentExists(id);
    if (sourceVersionNo === targetVersionNo) {
      return {
        sourceVersionNo,
        targetVersionNo,
        added: 0,
        removed: 0,
        changed: 0,
        samples: []
      };
    }
    const source = await this.versionRepository.findOne({
      where: { documentId: id, versionNo: sourceVersionNo }
    });
    const target = await this.versionRepository.findOne({
      where: { documentId: id, versionNo: targetVersionNo }
    });
    if (!source || !target) {
      throw new NotFoundException("Version not found");
    }
    return this.buildDiff(sourceVersionNo, source.markdownContent, targetVersionNo, target.markdownContent);
  }

  async rollbackToVersion(id: string, versionNo: number, changeNote?: string, operatorId?: number) {
    const document = await this.documentRepository.findOne({ where: { id } });
    if (!document) {
      throw new NotFoundException("Document not found");
    }
    const target = await this.versionRepository.findOne({
      where: { documentId: id, versionNo }
    });
    if (!target) {
      throw new NotFoundException("Version not found");
    }

    await this.contentRepository.delete({ documentId: id });
    await this.contentRepository.save(
      this.contentRepository.create({
        documentId: id,
        rawText: null,
        markdownContent: target.markdownContent
      })
    );

    const note = changeNote ?? `Rollback to version ${versionNo}`;
    const newVersion = await this.createVersionSnapshot(id, operatorId, note);
    await this.syncDocumentAssets(id);
    await this.logDocOperation(operatorId, "document.rollback", id, {
      rollbackFromVersion: versionNo,
      currentVersion: newVersion.versionNo
    });
    return {
      documentId: id,
      rollbackFromVersion: versionNo,
      currentVersion: newVersion.versionNo
    };
  }

  private async processTask(taskId: string) {
    const task = await this.taskRepository.findOne({ where: { id: taskId } });
    if (!task) {
      return;
    }
    task.status = "processing";
    task.errorMessage = null;
    await this.taskRepository.save(task);

    try {
      const converted = await this.convertToMarkdown(task.sourceFilename, task.sourceExt, task.filePath);
      const markdownTitle = this.extractMarkdownTitle(converted.markdown);
      if (markdownTitle) {
        await this.documentRepository.update({ id: task.documentId }, { title: markdownTitle });
      }
      await this.contentRepository.delete({ documentId: task.documentId });
      await this.contentRepository.save(
        this.contentRepository.create({
          documentId: task.documentId,
          rawText: converted.rawText,
          markdownContent: converted.markdown
        })
      );
      await this.createVersionSnapshot(task.documentId, undefined, `Converted from ${task.sourceExt}`);
      await this.syncDocumentAssets(task.documentId);
      task.status = "success";
      task.errorMessage = null;
      await this.taskRepository.save(task);
      await this.logDocOperation(undefined, "document.convert_success", task.documentId, {
        taskId: task.id,
        sourceExt: task.sourceExt
      });
    } catch (error) {
      task.status = "failed";
      task.errorMessage = error instanceof Error ? error.message.slice(0, 500) : "Unknown conversion error";
      await this.taskRepository.save(task);
      await this.logDocOperation(undefined, "document.convert_failed", task.documentId, {
        taskId: task.id,
        sourceExt: task.sourceExt,
        errorMessage: task.errorMessage
      });
    }
  }

  private async convertToMarkdown(filename: string, ext: string, filePath: string) {
    const title = filename.replace(/\.[^.]+$/, "");
    if (ext === ".txt") {
      const fileBuffer = await fs.readFile(filePath);
      const rawText = this.decodeTextBuffer(fileBuffer);
      return { rawText, markdown: `# ${title}\n\n${rawText}` };
    }
    if (ext === ".html" || ext === ".htm") {
      const fileBuffer = await fs.readFile(filePath);
      const html = this.decodeTextBuffer(fileBuffer);
      const rawText = html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return { rawText, markdown: `# ${title}\n\n${rawText}` };
    }
    if (ext === ".docx" || ext === ".doc") {
      return this.convertOfficeToMarkdown(title, filePath, ext);
    }
    if (ext === ".pdf") {
      return this.convertPdfToMarkdown(title, filePath);
    }

    throw new Error(`No converter configured for ${ext}`);
  }

  private normalizeExt(filename: string): string {
    const idx = filename.lastIndexOf(".");
    if (idx < 0) {
      return "";
    }
    return filename.slice(idx).toLowerCase();
  }

  private async persistFile(documentId: string, originalName: string, buffer: Buffer): Promise<string> {
    const safeName = originalName.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
    const sourceDir = this.getDocumentAssetPaths(documentId).sourceDir;
    await fs.mkdir(sourceDir, { recursive: true });
    const filePath = join(sourceDir, safeName);
    await fs.writeFile(filePath, buffer);
    return filePath;
  }

  private async persistAttachment(documentId: string, originalName: string, buffer: Buffer, mimeType?: string | null) {
    const assetPaths = this.getDocumentAssetPaths(documentId);
    const safeName = originalName.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
    const storedName = `${randomUUID()}-${safeName}`;
    await fs.mkdir(assetPaths.attachmentDir, { recursive: true });
    await fs.writeFile(join(assetPaths.attachmentDir, storedName), buffer);
    return {
      id: randomUUID(),
      fileName: safeName,
      displayName: safeName,
      mimeType: typeof mimeType === "string" && mimeType.trim() ? mimeType.trim() : null,
      size: buffer.byteLength,
      relativePath: `attachments/${storedName}`,
      uploadedAt: new Date().toISOString()
    } satisfies DocumentAttachment;
  }

  private resolveAttachmentPath(documentId: string, relativePath: string) {
    return join(this.getDocumentStorageDir(documentId), ...relativePath.split("/").filter(Boolean));
  }

  private normalizeAttachments(value: unknown): DocumentAttachment[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((item) => {
        if (!item || typeof item !== "object") {
          return null;
        }
        const attachment = item as Record<string, unknown>;
        const id = String(attachment.id ?? "").trim();
        const fileName = String(attachment.fileName ?? attachment.displayName ?? "").trim();
        const relativePath = String(attachment.relativePath ?? "").trim();
        if (!id || !fileName || !relativePath) {
          return null;
        }
        return {
          id,
          fileName,
          displayName: String(attachment.displayName ?? fileName).trim() || fileName,
          mimeType: typeof attachment.mimeType === "string" && attachment.mimeType.trim() ? attachment.mimeType.trim() : null,
          size: Number(attachment.size ?? 0) || 0,
          relativePath,
          uploadedAt: String(attachment.uploadedAt ?? new Date().toISOString())
        } satisfies DocumentAttachment;
      })
      .filter((item): item is DocumentAttachment => Boolean(item));
  }

  private serializeAttachment(attachment: DocumentAttachment) {
    return {
      id: attachment.id,
      fileName: attachment.fileName,
      displayName: attachment.displayName,
      mimeType: attachment.mimeType,
      size: attachment.size,
      uploadedAt: attachment.uploadedAt
    };
  }

  private serializeAttachments(value: unknown) {
    return this.normalizeAttachments(value).map((attachment) => this.serializeAttachment(attachment));
  }

  private async readUploadedFile(file: { originalname: string; buffer?: Buffer; size?: number; path?: string }) {
    if (file.buffer && file.buffer.byteLength > 0) {
      return file.buffer;
    }
    if (file.path) {
      const buffer = await fs.readFile(file.path);
      if (buffer.byteLength > 0) {
        return buffer;
      }
    }
    throw new BadRequestException("Empty file");
  }

  private async convertOfficeToMarkdown(title: string, filePath: string, ext: string) {
    const attempts: string[] = [];

    if (ext === ".docx") {
      try {
        const markdown = await this.runWordToMarkdownScript(filePath);
        return {
          rawText: this.extractRawTextFromMarkdown(markdown),
          markdown: this.ensureMarkdownTitle(title, markdown)
        };
      } catch (error) {
        attempts.push(`python word2md failed: ${this.errMsg(error)}`);
      }
    }

    try {
      const markdown = await this.runPandocToMarkdown(filePath);
      const rawText = markdown.replace(/^#+\s.*$/gm, "").trim();
      return {
        rawText,
        markdown: this.ensureMarkdownTitle(title, markdown)
      };
    } catch (error) {
      attempts.push(`pandoc failed: ${this.errMsg(error)}`);
    }

    try {
      const rawText = await this.runLibreOfficeToText(filePath);
      return {
        rawText,
        markdown: `# ${title}\n\n${rawText}`
      };
    } catch (error) {
      attempts.push(`libreoffice failed: ${this.errMsg(error)}`);
    }

    throw new Error(
      `No available converter for ${ext}. Attempts: ${attempts.join(" | ")}. ` +
        "Install pandoc or libreoffice and retry."
    );
  }

  private async convertPdfToMarkdown(title: string, filePath: string) {
    const attempts: string[] = [];

    try {
      const rawText = await this.runPdfToText(filePath);
      return {
        rawText,
        markdown: `# ${title}\n\n${rawText}`
      };
    } catch (error) {
      attempts.push(`pdftotext failed: ${this.errMsg(error)}`);
    }

    try {
      const markdown = await this.runPandocToMarkdown(filePath);
      const rawText = markdown.replace(/^#+\s.*$/gm, "").trim();
      return {
        rawText,
        markdown: this.ensureMarkdownTitle(title, markdown)
      };
    } catch (error) {
      attempts.push(`pandoc failed: ${this.errMsg(error)}`);
    }

    throw new Error(
      `No available converter for .pdf. Attempts: ${attempts.join(" | ")}. ` +
        "Install pdftotext (poppler-utils) or configure OCR pipeline."
    );
  }

  private async runPandocToMarkdown(inputPath: string): Promise<string> {
    const { stdout } = await this.execFileAsync("pandoc", [inputPath, "-t", "gfm"], {
      windowsHide: true,
      timeout: 120000,
      maxBuffer: 10 * 1024 * 1024
    });
    const markdown = stdout?.toString() ?? "";
    if (!markdown.trim()) {
      throw new Error("pandoc returned empty content");
    }
    return markdown;
  }

  private async runWordToMarkdownScript(inputPath: string): Promise<string> {
    await fs.access(this.wordToMdScriptPath);
    await fs.access(this.wordToMdSamplePath);

    const outDir = await fs.mkdtemp(join(tmpdir(), "kc-word2md-"));
    const outputPath = join(outDir, `${this.baseName(inputPath)}.txt`);
    const commandCandidates =
      process.platform === "win32"
        ? [
            { command: "python", args: [this.wordToMdScriptPath] },
            { command: "py", args: ["-3", this.wordToMdScriptPath] },
            { command: "python3", args: [this.wordToMdScriptPath] }
          ]
        : [
            { command: "python3", args: [this.wordToMdScriptPath] },
            { command: "python", args: [this.wordToMdScriptPath] }
          ];

    const baseArgs = [
      "--sample",
      this.wordToMdSamplePath,
      "--input",
      inputPath,
      "--output",
      outputPath
    ];
    const errors: string[] = [];

    try {
      for (const candidate of commandCandidates) {
        try {
          await this.execFileAsync(candidate.command, [...candidate.args, ...baseArgs], {
            cwd: this.repoRoot,
            windowsHide: true,
            timeout: 300000,
            maxBuffer: 20 * 1024 * 1024,
            env: {
              ...process.env,
              PYTHONUTF8: "1"
            }
          });

          const markdown = await fs.readFile(outputPath, "utf-8");
          if (!markdown.trim()) {
            throw new Error("word2md converter returned empty content");
          }
          return markdown;
        } catch (error) {
          errors.push(`${candidate.command}: ${this.errMsg(error)}`);
        }
      }
    } finally {
      await fs.rm(outDir, { recursive: true, force: true });
    }

    throw new Error(errors.join(" | "));
  }

  private async runTextToMarkdownScript(sourceText: string): Promise<string> {
    await fs.access(this.textToMdScriptPath);
    await fs.access(this.wordToMdSamplePath);

    const outDir = await fs.mkdtemp(join(tmpdir(), "kc-text2md-"));
    const inputPath = join(outDir, "input.txt");
    const outputPath = join(outDir, "output.txt");
    const commandCandidates =
      process.platform === "win32"
        ? [
            { command: "python", args: [this.textToMdScriptPath] },
            { command: "py", args: ["-3", this.textToMdScriptPath] },
            { command: "python3", args: [this.textToMdScriptPath] }
          ]
        : [
            { command: "python3", args: [this.textToMdScriptPath] },
            { command: "python", args: [this.textToMdScriptPath] }
          ];

    const errors: string[] = [];

    try {
      await fs.writeFile(inputPath, sourceText, "utf-8");
      for (const candidate of commandCandidates) {
        try {
          await this.execFileAsync(
            candidate.command,
            [
              ...candidate.args,
              "--sample",
              this.wordToMdSamplePath,
              "--input",
              inputPath,
              "--output",
              outputPath
            ],
            {
              cwd: this.repoRoot,
              windowsHide: true,
              timeout: 300000,
              maxBuffer: 20 * 1024 * 1024,
              env: {
                ...process.env,
                PYTHONUTF8: "1"
              }
            }
          );

          const markdown = await fs.readFile(outputPath, "utf-8");
          if (!markdown.trim()) {
            throw new Error("text2md converter returned empty content");
          }
          return markdown;
        } catch (error) {
          errors.push(`${candidate.command}: ${this.errMsg(error)}`);
        }
      }
    } finally {
      await fs.rm(outDir, { recursive: true, force: true });
    }

    throw new Error(errors.join(" | "));
  }

  private async runLibreOfficeToText(inputPath: string): Promise<string> {
    const outDir = await fs.mkdtemp(join(tmpdir(), "kc-lo-"));
    try {
      const command = process.platform === "win32" ? "soffice.exe" : "soffice";
      await this.execFileAsync(
        command,
        ["--headless", "--convert-to", "txt:Text", "--outdir", outDir, inputPath],
        {
          windowsHide: true,
          timeout: 120000,
          maxBuffer: 5 * 1024 * 1024
        }
      );
      const txtPath = join(outDir, `${this.baseName(inputPath)}.txt`);
      const rawText = await fs.readFile(txtPath, "utf-8");
      if (!rawText.trim()) {
        throw new Error("libreoffice converted file is empty");
      }
      return rawText;
    } finally {
      await fs.rm(outDir, { recursive: true, force: true });
    }
  }

  private async runPdfToText(inputPath: string): Promise<string> {
    const { stdout } = await this.execFileAsync("pdftotext", [inputPath, "-"], {
      windowsHide: true,
      timeout: 120000,
      maxBuffer: 20 * 1024 * 1024
    });
    const rawText = stdout?.toString() ?? "";
    if (!rawText.trim()) {
      throw new Error("pdftotext returned empty content");
    }
    return rawText;
  }

  private baseName(filePath: string) {
    const normalized = filePath.replace(/\\/g, "/");
    const file = normalized.slice(normalized.lastIndexOf("/") + 1);
    const idx = file.lastIndexOf(".");
    return idx > 0 ? file.slice(0, idx) : file;
  }

  private ensureMarkdownTitle(title: string, markdown: string) {
    const trimmed = markdown.trimStart();
    if (trimmed.startsWith("# ")) {
      return markdown;
    }
    return `# ${title}\n\n${markdown}`;
  }

  private extractRawTextFromMarkdown(markdown: string) {
    return markdown
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/&nbsp;/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/^[>\-\*]\s+/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  private extractMarkdownTitle(markdown: string) {
    const match = markdown.match(/^\s*#\s+(.+?)\s*$/m);
    return match?.[1]?.trim() || null;
  }

  private decodeTextBuffer(buffer: Buffer) {
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch {
      try {
        return new TextDecoder("gb18030", { fatal: true }).decode(buffer);
      } catch {
        return buffer.toString("utf-8");
      }
    }
  }

  private normalizeMultipartText(value: string) {
    if (!value) {
      return value;
    }
    if (!/[ÃÂÅÆÇÐÑØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ]/.test(value)) {
      return value;
    }

    try {
      const repaired = Buffer.from(value, "latin1").toString("utf8");
      const reencoded = Buffer.from(repaired, "utf8").toString("latin1");
      return reencoded === value ? repaired : value;
    } catch {
      return value;
    }
  }

  private errMsg(error: unknown) {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }

  private validateArchivePath(archivePath: string) {
    if (!archivePath) {
      return;
    }
    const levels = archivePath.split("/").filter((s) => s.trim().length > 0);
    if (levels.length > 5) {
      throw new BadRequestException("Archive path depth cannot exceed 5 levels");
    }
  }

  private normalizeFolderPath(path: string) {
    const normalized = path
      .split("/")
      .map((segment) => segment.trim())
      .filter(Boolean)
      .join("/");
    if (!normalized) {
      throw new BadRequestException("Folder path cannot be empty");
    }
    this.validateArchivePath(normalized);
    return normalized;
  }

  private async normalizeDocumentAttributes(input: DocumentAttributeInput) {
    const taxonomy = await this.systemService.getAdminDocumentTaxonomy();
    const businessPath = this.normalizeAttributePath(input.businessPath, taxonomy.businessDomains, "business");
    const legalPath = this.normalizeAttributePath(input.legalPath, taxonomy.legalLevels, "legal");

    return {
      businessPath,
      legalPath
    };
  }

  private normalizeAttributePath(
    pathInput: string[] | null | undefined,
    roots: DocumentTaxonomyNode[],
    label: string
  ) {
    if (!Array.isArray(pathInput) || pathInput.length === 0) {
      return [] as string[];
    }

    const path = pathInput.map((item) => String(item ?? "").trim()).filter(Boolean);
    if (path.length === 0) {
      return [] as string[];
    }
    if (path.length > 3) {
      throw new BadRequestException(`${label} attribute path cannot exceed 3 levels`);
    }

    let nodes: DocumentTaxonomyNode[] = roots;
    for (let index = 0; index < path.length; index += 1) {
      const value = path[index];
      const matched = nodes.find((item) => item.name === value);
      if (!matched) {
        throw new BadRequestException(`Unsupported ${label} attribute path: ${path.join(" / ")}`);
      }
      nodes = matched.children;
    }

    return path;
  }

  private isMissingFolderTableError(error: unknown) {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }
    return String(error.message).includes('relation "document_folders" does not exist');
  }

  private async ensureDocumentExists(id: string) {
    const exists = await this.documentRepository.exist({ where: { id } });
    if (!exists) {
      throw new NotFoundException("Document not found");
    }
  }

  private async resolveAvailableTitle(title: string, excludeId?: string) {
    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
      throw new BadRequestException("Title is required");
    }

    const existingTitles = await this.collectConflictingTitles(normalizedTitle, excludeId);
    if (!existingTitles.has(normalizedTitle)) {
      return normalizedTitle;
    }

    const baseTitle = this.trimTitleForSuffix(normalizedTitle, "");
    for (let index = 2; index <= 9999; index += 1) {
      const suffix = ` (${index})`;
      const candidate = this.trimTitleForSuffix(baseTitle, suffix) + suffix;
      if (!existingTitles.has(candidate)) {
        return candidate;
      }
    }

    throw new BadRequestException(`Unable to resolve a unique document title for: ${normalizedTitle}`);
  }

  private async collectConflictingTitles(title: string, excludeId?: string) {
    const likePrefix = `${this.escapeLikePattern(title)}%`;
    const rows = await this.documentRepository
      .createQueryBuilder("document")
      .select("document.title", "title")
      .where("document.title LIKE :likePrefix ESCAPE '\\'", { likePrefix })
      .andWhere(excludeId ? "document.id <> :excludeId" : "1=1", { excludeId })
      .getRawMany<{ title: string }>();

    return new Set(rows.map((row) => row.title));
  }

  private escapeLikePattern(value: string) {
    return value.replace(/[\\%_]/g, (char) => `\\${char}`);
  }

  private trimTitleForSuffix(title: string, suffix: string) {
    const maxLength = 500 - suffix.length;
    return title.length > maxLength ? title.slice(0, maxLength).trimEnd() : title;
  }

  private buildWatermarkContext(
    source: PreviewWatermarkRenderContext["source"],
    req: AuthRequest | undefined,
    document?: { id?: string | null; title?: string | null; archivePath?: string | null },
    scope: PreviewWatermarkRenderContext["scope"] = "view",
    profile: PreviewWatermarkRenderContext["profile"] = "screen"
  ): PreviewWatermarkRenderContext {
    const forwardedFor = req?.headers?.["x-forwarded-for"];
    const ip = typeof forwardedFor === "string" && forwardedFor.trim()
      ? forwardedFor.split(",")[0].trim()
      : req?.ip || req?.socket?.remoteAddress || null;

    return {
      scope,
      profile,
      source,
      username: req?.user?.username ?? null,
      role: req?.user?.role ?? null,
      ip,
      timestamp: new Date().toISOString(),
      document: document ?? null
    };
  }

  private async waitForPdfPageReady(page: Page) {
    await page.evaluate(async () => {
      if ("fonts" in document) {
        await (document as Document & {
          fonts: FontFaceSet;
        }).fonts.ready;
      }

      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      });
    });
  }

  private async resolvePdfBrowserExecutablePath() {
    const candidates = [
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      process.env.CHROME_PATH,
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
    ].filter((item): item is string => Boolean(item));

    for (const candidate of candidates) {
      try {
        await fs.access(candidate);
        return candidate;
      } catch {
        continue;
      }
    }

    throw new BadRequestException(
      "No Chromium/Edge executable found for PDF export. Set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH or install Edge/Chrome."
    );
  }

  private sanitizeDownloadFilename(value: string) {
    return value.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim() || "document";
  }

  private async cleanupFailedUpload(documentId: string, filePath: string) {
    await this.versionRepository.delete({ documentId });
    await this.contentRepository.delete({ documentId });
    await this.taskRepository.delete({ documentId });
    await this.documentRepository.delete({ id: documentId });
    await fs.rm(filePath, { force: true });
    await fs.rm(this.getDocumentStorageDir(documentId), { recursive: true, force: true });
  }

  private async createVersionSnapshot(documentId: string, changedBy?: number, changeNote?: string) {
    const document = await this.documentRepository.findOne({ where: { id: documentId } });
    if (!document) {
      throw new NotFoundException("Document not found");
    }
    const content = await this.contentRepository.findOne({
      where: { documentId },
      order: { createdAt: "DESC" }
    });
    if (!content) {
      throw new BadRequestException("Document content is empty");
    }
    const latest = await this.versionRepository.findOne({
      where: { documentId },
      order: { versionNo: "DESC" }
    });
    const nextVersionNo = (latest?.versionNo ?? 0) + 1;
    const metadataSnapshot = {
      title: document.title,
      archivePath: document.archivePath,
      businessDomain: document.businessDomain,
      businessSubdomain: document.businessSubdomain,
      businessPath: document.businessPath,
      legalLevel: document.legalLevel,
      legalPath: document.legalPath,
      attachments: this.serializeAttachments(document.attachments)
    };

    const version = await this.versionRepository.save(
      this.versionRepository.create({
        documentId,
        versionNo: nextVersionNo,
        markdownContent: content.markdownContent,
        changeNote: changeNote ?? null,
        changedBy: changedBy ? String(changedBy) : null,
        metadataSnapshot
      })
    );
    document.currentVersion = version.versionNo;
    await this.documentRepository.save(document);
    return version;
  }

  private async tryCreateVersionSnapshot(documentId: string, changedBy?: number, changeNote?: string) {
    try {
      await this.createVersionSnapshot(documentId, changedBy, changeNote);
    } catch (error) {
      if (error instanceof BadRequestException) {
        return;
      }
      throw error;
    }
  }

  private getDocumentStorageDir(documentId: string) {
    return join(this.documentsRoot, documentId);
  }

  private getDocumentAssetPaths(documentId: string) {
    const rootDir = this.getDocumentStorageDir(documentId);
    return {
      rootDir,
      sourceDir: join(rootDir, "source"),
      attachmentDir: join(rootDir, "attachments"),
      markdownPath: join(rootDir, "content.md"),
      rawTextPath: join(rootDir, "content.txt"),
      previewHtmlPath: join(rootDir, "preview.html"),
      metadataPath: join(rootDir, "metadata.json")
    };
  }

  private async syncDocumentAssets(documentId: string) {
    const document = await this.documentRepository.findOne({ where: { id: documentId } });
    if (!document) {
      return;
    }

    const content = await this.contentRepository.findOne({
      where: { documentId },
      order: { createdAt: "DESC" }
    });
    if (!content) {
      return;
    }

    const latestTask = await this.taskRepository.findOne({
      where: { documentId },
      order: { updatedAt: "DESC", createdAt: "DESC" }
    });
    const latestVersion = await this.versionRepository.findOne({
      where: { documentId },
      order: { versionNo: "DESC" }
    });
    const assetPaths = this.getDocumentAssetPaths(documentId);
    const rawText = content.rawText ?? this.extractRawTextFromMarkdown(content.markdownContent);
    const previewHtml = await renderPersistedPreviewHtml(content.markdownContent);

    await fs.mkdir(assetPaths.rootDir, { recursive: true });
    await Promise.all([
      fs.writeFile(assetPaths.markdownPath, content.markdownContent, "utf-8"),
      fs.writeFile(assetPaths.rawTextPath, rawText, "utf-8"),
      fs.writeFile(assetPaths.previewHtmlPath, previewHtml, "utf-8"),
      fs.writeFile(
        assetPaths.metadataPath,
        JSON.stringify(
          {
            documentId,
            title: document.title,
            archivePath: document.archivePath,
            businessDomain: document.businessDomain,
            businessSubdomain: document.businessSubdomain,
            businessPath: document.businessPath,
            legalLevel: document.legalLevel,
            legalPath: document.legalPath,
            attachments: this.serializeAttachments(document.attachments),
            currentVersion: document.currentVersion,
            latestVersionNo: latestVersion?.versionNo ?? document.currentVersion,
            sourceFilename: latestTask?.sourceFilename ?? null,
            sourceExt: latestTask?.sourceExt ?? null,
            sourceFilePath: latestTask?.filePath ?? null,
            markdownPath: assetPaths.markdownPath,
            rawTextPath: assetPaths.rawTextPath,
            previewHtmlPath: assetPaths.previewHtmlPath,
            updatedAt: document.updatedAt?.toISOString?.() ?? new Date().toISOString()
          },
          null,
          2
        ),
        "utf-8"
      )
    ]);
  }

  private async getPersistedAssetDescriptor(documentId: string) {
    const assetPaths = this.getDocumentAssetPaths(documentId);
    const sourceFiles = await this.listSourceFiles(assetPaths.sourceDir);
    return {
      rootDir: assetPaths.rootDir,
      sourceFiles,
      attachmentsDir: await this.pathIfExists(assetPaths.attachmentDir),
      markdownPath: await this.pathIfExists(assetPaths.markdownPath),
      rawTextPath: await this.pathIfExists(assetPaths.rawTextPath),
      previewHtmlPath: await this.pathIfExists(assetPaths.previewHtmlPath),
      metadataPath: await this.pathIfExists(assetPaths.metadataPath)
    };
  }

  private async listSourceFiles(sourceDir: string) {
    try {
      const entries = await fs.readdir(sourceDir, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile())
        .map((entry) => join(sourceDir, entry.name))
        .sort((a, b) => basename(a).localeCompare(basename(b), "zh-CN"));
    } catch {
      return [];
    }
  }

  private async pathIfExists(path: string) {
    try {
      await fs.access(path);
      return path;
    } catch {
      return null;
    }
  }

  private async readTextFile(path: string) {
    try {
      return await fs.readFile(path, "utf-8");
    } catch {
      return null;
    }
  }

  private buildDiff(
    sourceVersionNo: number,
    sourceContent: string,
    targetVersionNo: number,
    targetContent: string
  ) {
    const sourceLines = sourceContent.split(/\r?\n/);
    const targetLines = targetContent.split(/\r?\n/);
    const maxLines = Math.max(sourceLines.length, targetLines.length);
    let added = 0;
    let removed = 0;
    let changed = 0;
    const samples: Array<{ line: number; source: string; target: string }> = [];

    for (let i = 0; i < maxLines; i += 1) {
      const s = sourceLines[i];
      const t = targetLines[i];
      if (s === undefined && t !== undefined) {
        added += 1;
        if (samples.length < 20) {
          samples.push({ line: i + 1, source: "", target: t });
        }
        continue;
      }
      if (s !== undefined && t === undefined) {
        removed += 1;
        if (samples.length < 20) {
          samples.push({ line: i + 1, source: s, target: "" });
        }
        continue;
      }
      if (s !== t) {
        changed += 1;
        if (samples.length < 20) {
          samples.push({ line: i + 1, source: s ?? "", target: t ?? "" });
        }
      }
    }

    return {
      sourceVersionNo,
      targetVersionNo,
      added,
      removed,
      changed,
      samples
    };
  }

  private async logDocOperation(
    operatorId: number | undefined,
    operation: string,
    targetId: string,
    detail: Record<string, unknown>
  ) {
    await this.auditService.record({
      operatorId,
      operation,
      targetType: "document",
      targetId,
      detail
    });
  }

}
