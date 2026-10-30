import { defineConfig } from "vitest/config";
import ts from "typescript";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: {
    preserveSymlinks: true,
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  esbuild: false,
  plugins: [
    {
      name: "typescript-in-process",
      enforce: "pre",
      transform(code, id) {
        if (/\.tsx?$/.test(id))
          return {
            // Keep NODE_ENV readable at runtime for production/development
            // boundary tests. Vite's define pass otherwise starts esbuild
            // (blocked by this Windows sandbox) and hardcodes the test mode.
            code: ts.transpileModule(
              code.replaceAll(
                "process.env.NODE_ENV",
                'process.env["NODE_ENV"]',
              ),
              {
                compilerOptions: {
                  target: ts.ScriptTarget.ES2022,
                  module: ts.ModuleKind.ESNext,
                  jsx: ts.JsxEmit.ReactJSX,
                },
              },
            ).outputText,
            map: null,
          };
      },
    },
  ],
  test: {
    include: ["tests/**/*.test.ts"],
    pool: "threads",
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
