import { readFile } from "node:fs/promises";
import path from "node:path";
import SwaggerParser from "swagger-parser";

async function main(): Promise<void> {
  const inputPath = path.resolve("docs/openapi.json");
  const document: unknown = JSON.parse(await readFile(inputPath, "utf8"));
  await SwaggerParser.validate(document);
  console.log(`Validated ${path.relative(process.cwd(), inputPath)}`);
}

main().catch((error: unknown) => {
  console.error("OpenAPI validation failed:", error);
  process.exitCode = 1;
});
