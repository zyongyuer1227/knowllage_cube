import { Injectable } from "@nestjs/common";
import { promises as fs } from "fs";
import { join } from "path";
import { DataSource } from "typeorm";
import { renderPersistedPreviewHtml } from "../document/document-preview.util";
import { UpdateWelcomeDocumentDto } from "./dto/update-welcome-document.dto";

@Injectable()
export class SystemService {
  private readonly systemRoot = join(process.cwd(), "storage", "system");
  private readonly welcomeMarkdownPath = join(this.systemRoot, "welcome.md");
  private readonly welcomeMetadataPath = join(this.systemRoot, "welcome.json");
  private readonly welcomePreviewHtmlPath = join(this.systemRoot, "welcome.preview.html");
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

  async getPublicWelcomeDocument() {
    const welcome = await this.readWelcomeDocument();
    return {
      title: welcome.title,
      markdownContent: welcome.markdownContent,
      previewHtml: welcome.previewHtml,
      updatedAt: welcome.updatedAt
    };
  }

  async getAdminWelcomeDocument() {
    return this.readWelcomeDocument();
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

  private async readWelcomeDocument() {
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

    let previewHtml: string;
    try {
      previewHtml = await fs.readFile(this.welcomePreviewHtmlPath, "utf-8");
      if (!previewHtml.trim()) {
        throw new Error("empty preview");
      }
    } catch {
      previewHtml = await renderPersistedPreviewHtml(markdownContent);
      await fs.writeFile(this.welcomePreviewHtmlPath, previewHtml, "utf-8");
    }

    return {
      title,
      markdownContent,
      previewHtml,
      updatedAt
    };
  }
}
