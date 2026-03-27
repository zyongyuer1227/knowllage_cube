import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

const bodyParser = require("body-parser");

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(bodyParser.json({ limit: "20mb" }));
  app.use(bodyParser.urlencoded({ extended: true, limit: "20mb" }));
  const corsOrigins = (process.env.CORS_ORIGIN ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : true,
    credentials: true
  });
  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true
    })
  );
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? "0.0.0.0";
  await app.listen(port, host);
}

bootstrap();
