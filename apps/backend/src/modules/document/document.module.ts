import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuditModule } from "../audit/audit.module";
import { DocumentController } from "./document.controller";
import { DocumentService } from "./document.service";
import { DocumentContentEntity } from "./entities/document-content.entity";
import { DocumentFolderEntity } from "./entities/document-folder.entity";
import { DocumentConversionTaskEntity } from "./entities/document-conversion-task.entity";
import { DocumentEntity } from "./entities/document.entity";
import { DocumentVersionEntity } from "./entities/document-version.entity";

@Module({
  imports: [
    AuditModule,
    TypeOrmModule.forFeature([
      DocumentEntity,
      DocumentFolderEntity,
      DocumentContentEntity,
      DocumentConversionTaskEntity,
      DocumentVersionEntity
    ])
  ],
  controllers: [DocumentController],
  providers: [DocumentService]
})
export class DocumentModule {}
