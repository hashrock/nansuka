import { createInertiaApp, type ResolvedComponent } from "@inertiajs/react";
import { createRoot } from "react-dom/client";
import "./index.css";

if ((window as any).electronAPI) {
  document.body.classList.add("electron");
}

createInertiaApp({
  resolve: async (name) => {
    const pages = import.meta.glob<{ default: ResolvedComponent }>(
      "./pages/**/*.tsx",
    );
    const page = await pages[`./pages/${name}.tsx`]();
    return page.default;
  },
  setup({ el, App, props }) {
    createRoot(el).render(<App {...props} />);
  },
});
