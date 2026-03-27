import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";

@Injectable()
export class SystemService {
  constructor(private readonly dataSource: DataSource) {}

  async health() {
    let database = "down";
    try {
      await this.dataSource.query("SELECT 1");
      database = "up";
    } catch {
      database = "down";
    }

    return {
      status: "ok",
      service: "knowledge-cube-backend",
      database,
      timestamp: new Date().toISOString()
    };
  }
}
