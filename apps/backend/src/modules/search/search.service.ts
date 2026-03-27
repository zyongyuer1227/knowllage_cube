import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { QueryFailedError, Repository } from "typeorm";
import { DocumentContentEntity } from "../document/entities/document-content.entity";
import { DocumentEntity } from "../document/entities/document.entity";
import { DocumentFolderEntity } from "../document/entities/document-folder.entity";
import { SearchQueryDto } from "./dto/search-query.dto";

@Injectable()
export class SearchService {
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
    if (keyword) {
      qb.leftJoin(
        "document_contents",
        "dc",
        "dc.document_id = d.id AND dc.created_at = (SELECT MAX(dc2.created_at) FROM document_contents dc2 WHERE dc2.document_id = d.id)"
      );
      qb.andWhere(
        "(d.title ILIKE :kw OR COALESCE(dc.raw_text, '') ILIKE :kw OR COALESCE(dc.markdown_content, '') ILIKE :kw)",
        { kw: `%${keyword}%` }
      );
    }

    const countQb = qb.clone();
    countQb.orderBy();
    const total = await countQb.getCount();

    let rows: DocumentEntity[] = [];
    if (query.sortBy === "relevance") {
      const candidates = await qb.clone().orderBy("d.updatedAt", "DESC").take(2000).getMany();
      const ranked = candidates
        .map((row) => ({
          row,
          score: this.calcRelevanceScore(row, keyword)
        }))
        .sort((a, b) => {
          if (b.score !== a.score) {
            return b.score - a.score;
          }
          return b.row.updatedAt.getTime() - a.row.updatedAt.getTime();
        })
        .map((item) => item.row);
      rows = ranked.slice((query.page - 1) * query.pageSize, query.page * query.pageSize);
    } else {
      if (query.sortBy === "createdAt") {
        qb.orderBy("d.createdAt", query.order.toUpperCase() as "ASC" | "DESC");
      } else {
        qb.orderBy("d.updatedAt", query.order.toUpperCase() as "ASC" | "DESC");
      }
      qb.skip((query.page - 1) * query.pageSize).take(query.pageSize);
      rows = await qb.getMany();
    }
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
      markdownContent: content.markdownContent
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

  private calcRelevanceScore(row: DocumentEntity, keyword: string): number {
    if (!keyword) {
      return 0;
    }
    let score = 0;
    const kw = keyword.toLowerCase();
    if (row.title?.toLowerCase().includes(kw)) {
      score += 5;
    }
    return score;
  }

  private isMissingFolderTableError(error: unknown) {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }
    return String(error.message).includes('relation "document_folders" does not exist');
  }
}
