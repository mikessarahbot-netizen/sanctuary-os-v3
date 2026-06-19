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
(default `http://localhost:4000/graphql`, the api package's http listener path).

## Scripts

- `pnpm --filter @sanctuary-os/web typecheck` — `tsc --noEmit` (covers `.tsx`).
- `pnpm --filter @sanctuary-os/web test` — vitest + React Testing Library (jsdom).
- `pnpm --filter @sanctuary-os/web lint` — eslint over `.ts` + `.tsx`.
- `pnpm --filter @sanctuary-os/web build` — `tsc --noEmit && vite build`.
