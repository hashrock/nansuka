import { renderToString } from "react-dom/server";
import { ReactRefresh, Script, ViteClient } from "vite-ssr-components/react";
import { serializePage, type PageObject, type RootView } from "@hono/inertia";

const Document = ({ page }: { page: PageObject }) => (
  <html lang="en">
    <head>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>nansuka</title>
      <link rel="icon" href="/logo.svg" type="image/svg+xml" />
      <ViteClient />
      <ReactRefresh />
      <Script src="/src/client.tsx" />
    </head>
    <body>
      <script
        data-page="app"
        type="application/json"
        dangerouslySetInnerHTML={{ __html: serializePage(page) }}
      />
      <div id="app" />
    </body>
  </html>
);

export const rootView: RootView = (page) =>
  "<!DOCTYPE html>" + renderToString(<Document page={page} />);
