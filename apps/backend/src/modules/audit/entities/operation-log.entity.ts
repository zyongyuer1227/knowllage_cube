import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity({ name: "operation_logs" })
export class OperationLogEntity {
  @PrimaryGeneratedColumn("increment", { type: "bigint" })
  id!: string;

  @Column({ type: "bigint", name: "operator_id", nullable: true })
  operatorId!: string | null;

  @Column({ type: "varchar", length: 100 })
  operation!: string;

  @Column({ type: "varchar", length: 50, name: "target_type" })
  targetType!: string;

  @Column({ type: "varchar", length: 100, name: "target_id" })
  targetId!: string;

  @Column({ type: "jsonb", nullable: true })
  detail!: Record<string, unknown> | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}

