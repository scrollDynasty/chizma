import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// The editor is served from https://<user>.github.io/chizma/, so every asset lives under /chizma/.
export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? "/chizma/",
  plugins: [
    react(),
    tailwindcss(),
    {
      // Production builds get a CSP: scripts only from our own origin (GitHub Pages cannot
      // send headers, so it is a meta tag). Dev keeps Vite's inline preamble working.
      name: "chizma-csp",
      apply: "build",
      transformIndexHtml: (html) =>
        html.replace(
          "<head>",
          `<head>
    <meta http-equiv="Content-Security-Policy" content="script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'">`,
        ),
    },
  ],
  // Excalidraw (~1 MB) is a lazily loaded chunk used only on the editor page.
  build: { chunkSizeWarningLimit: 1200 },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
