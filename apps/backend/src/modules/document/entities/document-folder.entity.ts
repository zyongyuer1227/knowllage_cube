import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity({ name: "document_folders" })
export class DocumentFolderEntity {
  @PrimaryGeneratedColumn("increment", { type: "bigint" })
  id!: string;

  @Column({ type: "varchar", length: 200 })
  name!: string;

  @Column({ type: "varchar", length: 500, name: "full_path", unique: true })
  fullPath!: string;

  @Column({ type: "varchar", length: 500, name: "parent_path", nullable: true })
  parentPath!: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
