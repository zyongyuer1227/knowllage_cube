import { Transform } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

const SORT_FIELDS = ["relevance", "createdAt", "updatedAt"] as const;
const SORT_ORDERS = ["asc", "desc"] as const;

export class SearchQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

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
  @IsIn(SORT_FIELDS)
  sortBy: (typeof SORT_FIELDS)[number] = "relevance";

  @IsOptional()
  @IsIn(SORT_ORDERS)
  order: (typeof SORT_ORDERS)[number] = "desc";
}
