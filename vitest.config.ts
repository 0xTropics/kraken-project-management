import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globalSetup: ["./test/setup/global-setup.ts"],
    setupFiles: ["./test/setup/setup-file.ts"],
    // One local Postgres cluster serves the whole run, so files share it serially.
    fileParallelism: false,
    include: ["test/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
