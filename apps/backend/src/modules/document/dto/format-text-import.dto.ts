import { IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class FormatTextImportDto {
  @IsOptional()
  @IsString()
  documentId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  title!: string;

  @IsString()
  @IsNotEmpty()
  text!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  archivePath?: string;
}
