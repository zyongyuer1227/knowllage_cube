import { Controller, Get, Param } from "@nestjs/common";
import { Public } from "../../common/decorators/public.decorator";
import { SearchService } from "./search.service";

@Controller("public/documents")
export class PublicDocumentController {
  constructor(private readonly searchService: SearchService) {}

  @Public()
  @Get(":id")
  getDocumentPreview(@Param("id") id: string) {
    return this.searchService.getDocumentPreview(id);
  }
}

