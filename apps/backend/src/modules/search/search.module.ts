import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DocumentContentEntity } from "../document/entities/document-content.entity";
import { DocumentEntity } from "../document/entities/document.entity";
import { DocumentFolderEntity } from "../document/entities/document-folder.entity";
import { PublicDocumentController } from "./public-document.controller";
import { SearchController } from "./search.controller";
import { SearchService } from "./search.service";

@Module({
  imports: [TypeOrmModule.forFeature([DocumentEntity, DocumentContentEntity, DocumentFolderEntity])],
  controllers: [SearchController, PublicDocumentController],
  providers: [SearchService]
})
export class SearchModule {}
