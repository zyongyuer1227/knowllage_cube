import { Controller, Get } from "@nestjs/common";
import { Public } from "../../common/decorators/public.decorator";
import { SystemService } from "./system.service";

@Controller("system")
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Public()
  @Get("health")
  health() {
    return this.systemService.health();
  }
}
