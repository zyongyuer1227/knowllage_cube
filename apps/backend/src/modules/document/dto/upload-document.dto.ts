import { IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class UploadDocumentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  archivePath?: string;
}
