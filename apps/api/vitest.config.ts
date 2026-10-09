import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    globalSetup: ["./test/global-setup.ts"],
    // les tests d'intégration partagent une base : on les exécute l'un après l'autre
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
