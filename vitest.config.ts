import { defineConfig } from "vitest/config";

// vite.config.ts を継承しない: グリッドのロジックは素の TypeScript なので
// Cloudflare / Inertia プラグインは不要で、workerd の起動分だけ遅くなる。
export default defineConfig({
  test: {
    include: ["app/**/*.test.ts"],
    environment: "node",
  },
});
