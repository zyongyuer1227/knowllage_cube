import { IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateDocumentDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  archivePath?: string;
}
