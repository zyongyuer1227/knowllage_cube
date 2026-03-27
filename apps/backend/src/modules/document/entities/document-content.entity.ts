import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity({ name: "document_contents" })
export class DocumentContentEntity {
  @PrimaryGeneratedColumn("increment", { type: "bigint" })
  id!: string;

  @Column({ type: "bigint", name: "document_id" })
  documentId!: string;

  @Column({ type: "text", name: "raw_text", nullable: true })
  rawText!: string | null;

  @Column({ type: "text", name: "markdown_content" })
  markdownContent!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}

