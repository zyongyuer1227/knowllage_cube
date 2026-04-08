import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

export type DocumentAttachment = {
  id: string;
  fileName: string;
  displayName: string;
  mimeType: string | null;
  size: number;
  relativePath: string;
  uploadedAt: string;
};

@Entity({ name: "documents" })
export class DocumentEntity {
  @PrimaryGeneratedColumn("increment", { type: "bigint" })
  id!: string;

  @Column({ type: "varchar", length: 500 })
  title!: string;

  @Column({ type: "varchar", length: 500, name: "archive_path", nullable: true })
  archivePath!: string | null;

  @Column({ type: "varchar", length: 100, name: "business_domain", nullable: true })
  businessDomain!: string | null;

  @Column({ type: "varchar", length: 100, name: "business_subdomain", nullable: true })
  businessSubdomain!: string | null;

  @Column({ type: "jsonb", name: "business_path", nullable: true })
  businessPath!: string[] | null;

  @Column({ type: "varchar", length: 100, name: "legal_level", nullable: true })
  legalLevel!: string | null;

  @Column({ type: "jsonb", name: "legal_path", nullable: true })
  legalPath!: string[] | null;

  @Column({ type: "jsonb", name: "attachments", default: () => "'[]'::jsonb" })
  attachments!: DocumentAttachment[];

  @Column({ type: "integer", name: "current_version", default: 1 })
  currentVersion!: number;

  @Column({ type: "varchar", length: 50, default: "effective" })
  status!: string;

  @Column({ type: "date", name: "expiry_date", nullable: true })
  expiryDate!: string | null;

  @Column({ type: "varchar", length: 500, name: "void_reason", nullable: true })
  voidReason!: string | null;

  @Column({ type: "timestamptz", name: "void_at", nullable: true })
  voidAt!: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
