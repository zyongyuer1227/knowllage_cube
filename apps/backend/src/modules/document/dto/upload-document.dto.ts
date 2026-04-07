import { Transform } from "class-transformer";
import { IsArray, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class UploadDocumentDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  archivePath?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (Array.isArray(value)) {
      return value.map((item) => String(item ?? "").trim()).filter(Boolean);
    }
    if (typeof value === "string" && value.trim()) {
      return [value.trim()];
    }
    return undefined;
  })
  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  businessPath?: string[];

  @IsOptional()
  @Transform(({ value }) => {
    if (Array.isArray(value)) {
      return value.map((item) => String(item ?? "").trim()).filter(Boolean);
    }
    if (typeof value === "string" && value.trim()) {
      return [value.trim()];
    }
    return undefined;
  })
  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  legalPath?: string[];
}
