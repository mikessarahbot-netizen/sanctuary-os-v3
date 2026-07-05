# Presenter Event Transport Handoff

Status: not blocked.

Open questions:
- None.

Notes:
- `7576912 feat(api): add presenter event transport` is pushed to `feature/presenter-domain-contracts`.
- The slice was rebased onto remote `a05a4ed fix(db): split presenter sql child writes`.
- `pnpm --filter @sanctuary-os/api test -- events/index.test.ts presenter`, `pnpm --filter @sanctuary-os/api test:integration:postgres`, `pnpm lint`, `pnpm typecheck`, and `pnpm test` passed after rebase.
