import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity({ name: "document_versions" })
export class DocumentVersionEntity {
  @PrimaryGeneratedColumn("increment", { type: "bigint" })
  id!: string;

  @Column({ type: "bigint", name: "document_id" })
  documentId!: string;

  @Column({ type: "integer", name: "version_no" })
  versionNo!: number;

  @Column({ type: "text", name: "markdown_content" })
  markdownContent!: string;

  @Column({ type: "varchar", length: 500, name: "change_note", nullable: true })
  changeNote!: string | null;

  @Column({ type: "bigint", name: "changed_by", nullable: true })
  changedBy!: string | null;

  @Column({ type: "jsonb", name: "metadata_snapshot", nullable: true })
  metadataSnapshot!: Record<string, unknown> | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}

