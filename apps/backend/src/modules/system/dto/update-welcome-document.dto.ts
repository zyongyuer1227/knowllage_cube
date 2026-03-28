import { IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateWelcomeDocumentDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsString()
  markdownContent!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  changeNote?: string;
}
