import path from "node:path";
import SwaggerParser from "@apidevtools/swagger-parser";

async function main(): Promise<void> {
  const inputPath = path.resolve("docs/openapi.json");
  await SwaggerParser.validate(inputPath);
  console.log(`Validated ${path.relative(process.cwd(), inputPath)}`);
}

main().catch((error: unknown) => {
  console.error("OpenAPI validation failed:", error);
  process.exitCode = 1;
});
