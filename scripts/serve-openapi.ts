import { readFile } from "node:fs/promises";
import path from "node:path";
import express from "express";
import SwaggerParser from "swagger-parser";
import swaggerUi from "swagger-ui-express";

async function main(): Promise<void> {
  const documentPath = path.resolve("docs/openapi.json");
  const document: unknown = JSON.parse(await readFile(documentPath, "utf8"));
  await SwaggerParser.validate(document);

  const app = express();
  app.get("/openapi.json", (_request, response) => response.json(document));
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(document));
  app.get("/", (_request, response) => response.redirect("/api-docs"));

  const rawPort = process.env.OPENAPI_PORT ?? "4174";
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`OPENAPI_PORT must be an integer from 1 to 65535; received "${rawPort}"`);
  }
  const host = process.env.OPENAPI_HOST ?? "127.0.0.1";
  app.listen(port, host, () => {
    console.log(`Swagger UI: http://${host}:${port}/api-docs`);
    console.log(`OpenAPI JSON: http://${host}:${port}/openapi.json`);
  });
}

main().catch((error: unknown) => {
  console.error("OpenAPI documentation server failed:", error);
  process.exitCode = 1;
});
