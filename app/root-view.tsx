import { renderToString } from "react-dom/server";
import { Script, ViteClient } from "vite-ssr-components/react";
import { serializePage, type PageObject, type RootView } from "@hono/inertia";

const Document = ({ page }: { page: PageObject }) => (
  <html lang="en">
    <head>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>nansuka</title>
      <link rel="icon" href="/logo.svg" type="image/svg+xml" />
      <ViteClient />
      <Script src="/app/client.tsx" />
      {/* hashrock のサービス切り替え (<hashrock-switcher>)。repos.hashrock.info が配る */}
      <script type="module" src="https://repos.hashrock.info/switcher/v1.js" />
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
