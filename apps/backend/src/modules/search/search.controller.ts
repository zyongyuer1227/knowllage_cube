import { Controller, Get, Query } from "@nestjs/common";
import { Public } from "../../common/decorators/public.decorator";
import { SearchQueryDto } from "./dto/search-query.dto";
import { SearchService } from "./search.service";

@Controller("public/search")
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Public()
  @Get()
  search(@Query() query: SearchQueryDto) {
    return this.searchService.search(query);
  }

  @Public()
  @Get("suggest")
  suggest(@Query("q") q = "") {
    return this.searchService.suggest(q);
  }

  @Public()
  @Get("folders")
  folders() {
    return this.searchService.listFolders();
  }
}
