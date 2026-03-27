import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity({ name: "documents" })
export class DocumentEntity {
  @PrimaryGeneratedColumn("increment", { type: "bigint" })
  id!: string;

  @Column({ type: "varchar", length: 500 })
  title!: string;

  @Column({ type: "varchar", length: 500, name: "archive_path", nullable: true })
  archivePath!: string | null;

  @Column({ type: "integer", name: "current_version", default: 1 })
  currentVersion!: number;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
