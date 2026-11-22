import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import SwaggerParser from "@apidevtools/swagger-parser";
import { loadEnv } from "vite";

import { createOpenApiDocument } from "./spec";

const outputPath = path.resolve("docs/openapi.json");
const temporaryPath = path.resolve("docs/openapi.tmp.json");
const env = loadEnv("development", process.cwd(), "");
const configuredServer = process.env.OPENAPI_SERVER_URL
  ?? env.OPENAPI_SERVER_URL
  ?? "http://127.0.0.1:54321";
const normalizedServer = configuredServer.replace(/\/+$/, "");
const serverUrl = normalizedServer.endsWith("/functions/v1")
  ? normalizedServer
  : `${normalizedServer}/functions/v1`;

async function main(): Promise<void> {
  const document = createOpenApiDocument(serverUrl);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  try {
    await SwaggerParser.validate(temporaryPath);
    await rename(temporaryPath, outputPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
  console.log(`Generated and validated ${path.relative(process.cwd(), outputPath)}`);
}

main().catch((error: unknown) => {
  console.error("OpenAPI generation failed:", error);
  process.exitCode = 1;
});
