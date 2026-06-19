import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Vitest config for `@sanctuary-os/web` component tests.
 *
 * Uses the jsdom environment plus React Testing Library so the Charts read
 * surface can be rendered and asserted under `pnpm -r test`. Named `.mts` so it
 * stays outside the repo's TypeScript lint/typecheck globs while Vitest still
 * auto-loads it (mirrors the api package convention).
 */
export default defineConfig({
  plugins: [react()],
  test: {
    css: false,
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"]
  }
});
