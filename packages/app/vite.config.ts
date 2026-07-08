import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import ssrPlugin from "vite-ssr-components/plugin";
import { inertiaPages } from "@hono/inertia/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    inertiaPages({
      pagesDir: "src/pages",
      outFile: "src/pages.gen.ts",
      serverModule: "./server",
    }),
    react(),
    cloudflare(),
    ssrPlugin(),
  ],
});
