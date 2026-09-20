import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        api: "modern-compiler",
        silenceDeprecations: [
          "import",
          "global-builtin",
          "color-functions",
          "mixed-decls",
          "legacy-js-api",
        ],
        quietDeps: true,
      },
    },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    pool: "forks",
    maxWorkers: 1,
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
  },
});
