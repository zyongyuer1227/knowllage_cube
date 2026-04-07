import { ArrayMaxSize, IsArray, IsOptional } from "class-validator";

export class UpdateDocumentTaxonomyDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  businessDomains?: unknown[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  legalLevels?: unknown[];
}
