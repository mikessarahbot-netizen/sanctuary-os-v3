# @sanctuary-os/web

Minimal, runnable web UI for Sanctuary OS. Currently exposes the **Charts read
surface**: a list of charts (title / key / song ref) and a detail view showing
the default key plus a simple rendered representation of the ChordPro source.

Stack: **Vite + React + TypeScript** (strict, matching the monorepo tsconfig).

## Run the dev server

```sh
pnpm --filter @sanctuary-os/web dev
```

Opens on **http://127.0.0.1:5173/** (fixed port).

By default the app runs in **demo mode** and renders seeded sample charts, so the
screen is populated without a live API. Data source selection (precedence high
to low):

1. URL query: `?demo` forces demo, `?source=live` forces live.
2. Env: `VITE_DATA_SOURCE=demo|live`.
3. Default: `demo`.

Live mode POSTs the `charts` / `chart` GraphQL queries to `VITE_API_URL`
(default same-origin `/graphql`). The Vite dev server proxies `/graphql` to the
local demo API (default `http://127.0.0.1:4000`; override with
`VITE_API_PROXY_TARGET`), so live mode is same-origin and needs no CORS.

### Live demo against the API

```sh
# terminal 1 — the demo GraphQL API (seeds sample charts, listens on :4000)
pnpm --filter @sanctuary-os/api dev

# terminal 2 — the web app
pnpm --filter @sanctuary-os/web dev
```

Then open **http://127.0.0.1:5173/?source=live** to render real API data.

## Scripts

- `pnpm --filter @sanctuary-os/web typecheck` — `tsc --noEmit` (covers `.tsx`).
- `pnpm --filter @sanctuary-os/web test` — vitest + React Testing Library (jsdom).
- `pnpm --filter @sanctuary-os/web lint` — eslint over `.ts` + `.tsx`.
- `pnpm --filter @sanctuary-os/web build` — `tsc --noEmit && vite build`.
