import { Transform } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class QueryAuditDto {
  @IsOptional()
  @Transform(({ value }) => Number(value ?? 1))
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Transform(({ value }) => Number(value ?? 20))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;

  @IsOptional()
  @IsString()
  operation?: string;

  @IsOptional()
  @IsString()
  targetType?: string;

  @IsOptional()
  @IsString()
  operatorId?: string;
}

