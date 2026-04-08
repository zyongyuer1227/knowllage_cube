import { Injectable } from "@nestjs/common";
import { promises as fs } from "fs";
import { join } from "path";
import { DataSource } from "typeorm";
import { AuthRequest } from "../../common/auth/auth-request.interface";
import { DEFAULT_DOCUMENT_TAXONOMY, type DocumentTaxonomyConfig, type DocumentTaxonomyNode } from "../document/document-taxonomy";
import {
  renderPersistedPreviewHtml
} from "../document/document-preview.util";
import {
  normalizePreviewWatermarkSettings,
  readPreviewWatermarkSettings,
  type PreviewWatermarkRenderContext,
  type PreviewWatermarkSettings
} from "../document/preview-watermark.util";
import { UpdateDocumentTaxonomyDto } from "./dto/update-document-taxonomy.dto";
import { UpdatePreviewWatermarkDto } from "./dto/update-preview-watermark.dto";
import { UpdateWelcomeDocumentDto } from "./dto/update-welcome-document.dto";

@Injectable()
export class SystemService {
  private readonly systemRoot = join(process.cwd(), "storage", "system");
  private readonly welcomeMarkdownPath = join(this.systemRoot, "welcome.md");
  private readonly welcomeMetadataPath = join(this.systemRoot, "welcome.json");
  private readonly welcomePreviewHtmlPath = join(this.systemRoot, "welcome.preview.html");
  private readonly documentTaxonomyPath = join(this.systemRoot, "document-taxonomy.json");
  private readonly previewWatermarkPath = join(this.systemRoot, "preview-watermark.json");
  private readonly defaultWelcomeTitle = "欢迎.md";
  private readonly defaultWelcomeMarkdown = `# 欢迎

欢迎使用 Knowledge Cube。

这里可以放置欢迎词、联系方式、图片说明和使用指南。
`;

  constructor(private readonly dataSource: DataSource) {}

  async health() {
    let database = "down";
    try {
      await this.dataSource.query("SELECT 1");
      database = "up";
    } catch {
      database = "down";
    }

    return {
      status: "ok",
      service: "knowledge-cube-backend",
      database,
      timestamp: new Date().toISOString()
    };
  }

  async getPublicWelcomeDocument(req?: AuthRequest) {
    const welcome = await this.readWelcomeDocument(this.buildWatermarkContext("public", req, "print-preview"));
    return {
      title: welcome.title,
      markdownContent: welcome.markdownContent,
      previewHtml: welcome.previewHtml,
      updatedAt: welcome.updatedAt
    };
  }

  async getPublicDocumentTaxonomy() {
    return this.readDocumentTaxonomy();
  }

  async getAdminWelcomeDocument(req?: AuthRequest) {
    return this.readWelcomeDocument(this.buildWatermarkContext("admin", req, "screen"));
  }

  async updateWelcomeDocument(body: UpdateWelcomeDocumentDto) {
    const title = body.title.trim() || this.defaultWelcomeTitle;
    const markdownContent = body.markdownContent;
    const previewHtml = await renderPersistedPreviewHtml(markdownContent);
    const updatedAt = new Date().toISOString();

    await fs.mkdir(this.systemRoot, { recursive: true });
    await Promise.all([
      fs.writeFile(this.welcomeMarkdownPath, markdownContent, "utf-8"),
      fs.writeFile(this.welcomePreviewHtmlPath, previewHtml, "utf-8"),
      fs.writeFile(
        this.welcomeMetadataPath,
        JSON.stringify(
          {
            title,
            updatedAt,
            changeNote: body.changeNote ?? null
          },
          null,
          2
        ),
        "utf-8"
      )
    ]);

    return {
      title,
      markdownContent,
      previewHtml,
      updatedAt
    };
  }

  async getAdminDocumentTaxonomy() {
    return this.readDocumentTaxonomy();
  }

  async updateDocumentTaxonomy(body: UpdateDocumentTaxonomyDto) {
    const taxonomy = this.normalizeDocumentTaxonomy(body as Partial<DocumentTaxonomyConfig>);
    await fs.mkdir(this.systemRoot, { recursive: true });
    await fs.writeFile(this.documentTaxonomyPath, JSON.stringify(taxonomy, null, 2), "utf-8");
    return taxonomy;
  }

  async getAdminPreviewWatermark() {
    return readPreviewWatermarkSettings();
  }

  async updatePreviewWatermark(body: UpdatePreviewWatermarkDto) {
    const settings = normalizePreviewWatermarkSettings(body as Partial<PreviewWatermarkSettings>);
    await fs.mkdir(this.systemRoot, { recursive: true });
    await fs.writeFile(this.previewWatermarkPath, JSON.stringify(settings, null, 2), "utf-8");

    try {
      const welcomeMarkdown = await fs.readFile(this.welcomeMarkdownPath, "utf-8");
      const previewHtml = await renderPersistedPreviewHtml(welcomeMarkdown, {
        scope: "view",
        profile: "print-preview",
        source: "system",
        timestamp: new Date().toISOString()
      });
      await fs.writeFile(this.welcomePreviewHtmlPath, previewHtml, "utf-8");
    } catch {
      // Welcome file may not exist yet; rendering will self-heal on next read.
    }

    return settings;
  }

  private async readWelcomeDocument(context: PreviewWatermarkRenderContext) {
    await fs.mkdir(this.systemRoot, { recursive: true });

    let title = this.defaultWelcomeTitle;
    let markdownContent = this.defaultWelcomeMarkdown;
    let updatedAt = new Date().toISOString();

    try {
      const markdown = await fs.readFile(this.welcomeMarkdownPath, "utf-8");
      if (markdown.trim()) {
        markdownContent = markdown;
      }
    } catch {
      await fs.writeFile(this.welcomeMarkdownPath, markdownContent, "utf-8");
    }

    try {
      const metadataRaw = await fs.readFile(this.welcomeMetadataPath, "utf-8");
      const metadata = JSON.parse(metadataRaw) as { title?: string; updatedAt?: string };
      title = metadata.title?.trim() || title;
      updatedAt = metadata.updatedAt || updatedAt;
    } catch {
      await fs.writeFile(
        this.welcomeMetadataPath,
        JSON.stringify(
          {
            title,
            updatedAt
          },
          null,
          2
        ),
        "utf-8"
      );
    }

    const previewHtml = await renderPersistedPreviewHtml(markdownContent, context);
    await fs.writeFile(this.welcomePreviewHtmlPath, previewHtml, "utf-8");

    return {
      title,
      markdownContent,
      previewHtml,
      updatedAt
    };
  }

  private async readDocumentTaxonomy(): Promise<DocumentTaxonomyConfig> {
    await fs.mkdir(this.systemRoot, { recursive: true });
    try {
      const raw = await fs.readFile(this.documentTaxonomyPath, "utf-8");
      const parsed = JSON.parse(raw) as Partial<DocumentTaxonomyConfig>;
      const normalized = this.normalizeDocumentTaxonomy(parsed);
      await fs.writeFile(this.documentTaxonomyPath, JSON.stringify(normalized, null, 2), "utf-8");
      return normalized;
    } catch {
      await fs.writeFile(this.documentTaxonomyPath, JSON.stringify(DEFAULT_DOCUMENT_TAXONOMY, null, 2), "utf-8");
      return DEFAULT_DOCUMENT_TAXONOMY;
    }
  }

  private normalizeDocumentTaxonomy(input: Partial<DocumentTaxonomyConfig>) {
    const businessDomains = Array.isArray(input.businessDomains) ? input.businessDomains : DEFAULT_DOCUMENT_TAXONOMY.businessDomains;
    const legalLevels = Array.isArray(input.legalLevels) ? input.legalLevels : DEFAULT_DOCUMENT_TAXONOMY.legalLevels;
    const normalizedBusinessDomains = this.normalizeTaxonomyNodes(businessDomains, 1);
    const normalizedLegalLevels = this.normalizeTaxonomyNodes(legalLevels, 1);

    return {
      businessDomains: normalizedBusinessDomains.length > 0 ? normalizedBusinessDomains : DEFAULT_DOCUMENT_TAXONOMY.businessDomains,
      legalLevels: normalizedLegalLevels.length > 0 ? normalizedLegalLevels : DEFAULT_DOCUMENT_TAXONOMY.legalLevels
    } satisfies DocumentTaxonomyConfig;
  }

  private normalizeTaxonomyNodes(input: unknown[], depth: number): DocumentTaxonomyNode[] {
    const normalized = input
      .map((item) => this.normalizeTaxonomyNode(item, depth))
      .filter((item): item is DocumentTaxonomyNode => Boolean(item));

    return normalized.filter((item, index, array) => array.findIndex((candidate) => candidate.name === item.name) === index);
  }

  private normalizeTaxonomyNode(input: unknown, depth: number): DocumentTaxonomyNode | null {
    const record = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : null;
    const name = String(record?.name ?? "").trim();
    if (!name) {
      return null;
    }

    let rawChildren: unknown[] = [];
    if (Array.isArray(record?.children)) {
      rawChildren = record.children;
    } else if (Array.isArray(record?.subdomains)) {
      rawChildren = record.subdomains.map((item) => ({ name: item, children: [] }));
    }

    return {
      name,
      children: depth >= 3 ? [] : this.normalizeTaxonomyNodes(rawChildren, depth + 1)
    };
  }

  private buildWatermarkContext(
    source: PreviewWatermarkRenderContext["source"],
    req?: AuthRequest,
    profile: PreviewWatermarkRenderContext["profile"] = "screen"
  ): PreviewWatermarkRenderContext {
    const forwardedFor = req?.headers?.["x-forwarded-for"];
    const ip = typeof forwardedFor === "string" && forwardedFor.trim()
      ? forwardedFor.split(",")[0].trim()
      : req?.ip || req?.socket?.remoteAddress || null;

    return {
      scope: "view",
      profile,
      source,
      username: req?.user?.username ?? null,
      role: req?.user?.role ?? null,
      ip,
      timestamp: new Date().toISOString()
    };
  }
}
