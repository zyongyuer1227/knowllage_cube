import { Transform } from "class-transformer";
import { IsInt, Min } from "class-validator";

export class VersionDiffQueryDto {
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  targetVersionNo!: number;
}

