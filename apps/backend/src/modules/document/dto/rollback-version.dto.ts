import { IsOptional, IsString, MaxLength } from "class-validator";

export class RollbackVersionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  changeNote?: string;
}

