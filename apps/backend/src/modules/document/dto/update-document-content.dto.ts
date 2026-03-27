import { IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateDocumentContentDto {
  @IsString()
  @IsNotEmpty()
  markdownContent!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  changeNote?: string;
}

