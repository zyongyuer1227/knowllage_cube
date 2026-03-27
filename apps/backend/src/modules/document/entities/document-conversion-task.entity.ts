import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity({ name: "document_conversion_tasks" })
export class DocumentConversionTaskEntity {
  @PrimaryGeneratedColumn("increment", { type: "bigint" })
  id!: string;

  @Column({ type: "bigint", name: "document_id" })
  documentId!: string;

  @Column({ type: "varchar", length: 20, default: "pending" })
  status!: string;

  @Column({ type: "integer", name: "retry_count", default: 0 })
  retryCount!: number;

  @Column({ type: "varchar", length: 500, name: "error_message", nullable: true })
  errorMessage!: string | null;

  @Column({ type: "varchar", length: 500, name: "source_filename" })
  sourceFilename!: string;

  @Column({ type: "varchar", length: 20, name: "source_ext" })
  sourceExt!: string;

  @Column({ type: "varchar", length: 500, name: "file_path" })
  filePath!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}

