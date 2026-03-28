import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { promises as fs } from "fs";
import { join } from "path";
import { QueryFailedError, Repository } from "typeorm";
import { DocumentContentEntity } from "../document/entities/document-content.entity";
import { DocumentEntity } from "../document/entities/document.entity";
import { DocumentFolderEntity } from "../document/entities/document-folder.entity";
import { SearchQueryDto } from "./dto/search-query.dto";

@Injectable()
export class SearchService {
  private readonly documentsRoot = join(process.cwd(), "storage", "documents");

  constructor(
    @InjectRepository(DocumentEntity)
    private readonly documentRepository: Repository<DocumentEntity>,
    @InjectRepository(DocumentContentEntity)
    private readonly contentRepository: Repository<DocumentContentEntity>,
    @InjectRepository(DocumentFolderEntity)
    private readonly folderRepository: Repository<DocumentFolderEntity>
  ) {}

  async search(query: SearchQueryDto) {
    const qb = this.documentRepository.createQueryBuilder("d");
    qb.where("1 = 1");

    const keyword = (query.q ?? "").trim();
    const hasKeyword = keyword.length > 0;
    qb.leftJoin(
      "document_contents",
      "dc",
      "dc.document_id = d.id AND dc.created_at = (SELECT MAX(dc2.created_at) FROM document_contents dc2 WHERE dc2.document_id = d.id)"
    );

    if (keyword) {
      qb.andWhere(
        "(" +
          "d.title ILIKE :kw " +
          "OR COALESCE(d.archive_path, '') ILIKE :kw " +
          "OR COALESCE(dc.raw_text, '') ILIKE :kw " +
          "OR COALESCE(dc.markdown_content, '') ILIKE :kw" +
        ")",
        { kw: `%${keyword}%` }
      );
    }

    const countQb = qb.clone();
    countQb.orderBy();
    const total = await countQb.getCount();

    if (query.sortBy === "relevance") {
      if (hasKeyword) {
        qb.addSelect(
          [
            "CASE WHEN d.title ILIKE :prefixKw THEN 120 ELSE 0 END",
            "CASE WHEN d.title ILIKE :kw THEN 80 ELSE 0 END",
            "CASE WHEN COALESCE(d.archive_path, '') ILIKE :kw THEN 30 ELSE 0 END",
            "CASE WHEN COALESCE(dc.raw_text, '') ILIKE :kw THEN 20 ELSE 0 END",
            "CASE WHEN COALESCE(dc.markdown_content, '') ILIKE :kw THEN 10 ELSE 0 END"
          ].join(" + "),
          "relevance_score"
        );
        qb.setParameter("prefixKw", `${keyword}%`);
        qb.orderBy("relevance_score", "DESC").addOrderBy("d.updatedAt", "DESC");
      } else {
        qb.orderBy("d.updatedAt", query.order.toUpperCase() as "ASC" | "DESC");
      }
    } else {
      if (query.sortBy === "createdAt") {
        qb.orderBy("d.createdAt", query.order.toUpperCase() as "ASC" | "DESC");
      } else {
        qb.orderBy("d.updatedAt", query.order.toUpperCase() as "ASC" | "DESC");
      }
    }

    qb.skip((query.page - 1) * query.pageSize).take(query.pageSize);
    const rows = await qb.getMany();

    const response = {
      query: keyword,
      page: query.page,
      pageSize: query.pageSize,
      total,
      items: rows.map((row) => ({
        id: row.id,
        title: row.title,
        archivePath: row.archivePath,
        updatedAt: row.updatedAt
      }))
    };
    return response;
  }

  async getDocumentPreview(id: string) {
    const document = await this.documentRepository.findOne({ where: { id } });
    if (!document) {
      throw new NotFoundException("Document not found");
    }
    const content = await this.contentRepository.findOne({
      where: { documentId: id },
      order: { createdAt: "DESC" }
    });
    if (!content) {
      throw new NotFoundException("Document content not found");
    }
    return {
      id: document.id,
      title: document.title,
      archivePath: document.archivePath,
      markdownContent: content.markdownContent,
      rawText: await this.readTextFile(join(this.documentsRoot, id, "content.txt")),
      previewHtml: await this.readTextFile(join(this.documentsRoot, id, "preview.html"))
    };
  }

  async suggest(q: string) {
    const keyword = (q ?? "").trim();
    if (!keyword) {
      return {
        query: "",
        items: []
      };
    }
    const rows = await this.documentRepository
      .createQueryBuilder("d")
      .where("1 = 1")
      .andWhere("d.title ILIKE :kw", {
        kw: `%${keyword}%`
      })
      .orderBy("d.updatedAt", "DESC")
      .take(20)
      .getMany();

    const unique = new Set<string>();
    for (const row of rows) {
      for (const val of [row.title]) {
        const text = (val ?? "").trim();
        if (text && text.toLowerCase().includes(keyword.toLowerCase())) {
          unique.add(text);
        }
        if (unique.size >= 10) {
          break;
        }
      }
      if (unique.size >= 10) {
        break;
      }
    }

    return {
      query: keyword,
      items: Array.from(unique).slice(0, 10)
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
  private isMissingFolderTableError(error: unknown) {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }
    return String(error.message).includes('relation "document_folders" does not exist');
  }

  private async readTextFile(path: string) {
    try {
      return await fs.readFile(path, "utf-8");
    } catch {
      return null;
    }
  }
}
