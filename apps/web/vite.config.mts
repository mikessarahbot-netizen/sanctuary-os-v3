import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Vite config for the `@sanctuary-os/web` SPA.
 *
 * Named `.mts` so it stays outside the repo's TypeScript lint/typecheck globs
 * (which target `src/**` and root `.ts`) while Vite still auto-loads it. The dev
 * server defaults to a fixed port so the parent can reliably screenshot it.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true
  },
  preview: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true
  }
});
