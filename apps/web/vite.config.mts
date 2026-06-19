import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Vite config for the `@sanctuary-os/web` SPA.
 *
 * Named `.mts` so it stays outside the repo's TypeScript lint/typecheck globs
 * (which target `src/**` and root `.ts`) while Vite still auto-loads it. The dev
 * server defaults to a fixed port so the parent can reliably screenshot it.
 *
 * The dev server proxies same-origin `POST /graphql` to the local demo API
 * (`apps/api` — `pnpm --filter @sanctuary-os/api dev`, default
 * `http://127.0.0.1:4000`). Live mode (`?source=live` / `VITE_DATA_SOURCE=live`)
 * targets the same-origin `/graphql`, so requests stay on the dev origin and
 * need no CORS. Override the upstream with `VITE_API_PROXY_TARGET`.
 */
const apiProxyTarget = process.env["VITE_API_PROXY_TARGET"] ?? "http://127.0.0.1:4000";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/graphql": {
        changeOrigin: true,
        target: apiProxyTarget
      }
    },
    strictPort: true
  },
  preview: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true
  }
});
