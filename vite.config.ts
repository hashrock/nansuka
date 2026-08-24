import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import ssrPlugin from "vite-ssr-components/plugin";
import { inertiaPages } from "@hono/inertia/vite";

// React JSX is transformed by esbuild via tsconfig (jsx: react-jsx).
// No @vitejs/plugin-react — its Fast Refresh preamble isn't injected into
// our custom Inertia SSR document, which would break hydration.
export default defineConfig({
  plugins: [
    inertiaPages({
      pagesDir: "app/pages",
      outFile: "app/pages.gen.ts",
      serverModule: "./server",
    }),
    cloudflare(),
    // Our sources live in app/, not the plugin's default src/.
    ssrPlugin({
      entry: { target: "app/root-view.tsx" },
      hotReload: { target: ["app/**/*.ts", "app/**/*.tsx"] },
    }),
  ],
});
