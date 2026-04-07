import { Type } from "class-transformer";
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Matches } from "class-validator";

export class UpdatePreviewWatermarkDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsIn(["view", "export", "both"])
  mode?: "view" | "export" | "both";

  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
  color?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  fontSize?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  opacity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  rotate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  gapX?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  gapY?: number;
}
