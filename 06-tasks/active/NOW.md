# NOW

## Task
Scaffold monorepo foundation — API, ChurchContext, and DB packages ready for implementation.

## In scope
- Create branch `feature/foundation-monorepo-scaffold`
- Scaffold `apps/api` from `05-plans/api-plan.md`
- Scaffold `packages/church-context` from `03-context/church-context-schema.md`
- Scaffold `packages/db`
- Run lint, typecheck, and tests after each module scaffold
- Commit and push each completed scaffold step
- Run release check and write findings to `07-reviews/architecture/`

## Out of scope
Business logic · database migrations · production GraphQL resolvers · UI components · prompt execution · vendor SDK integrations

## Progress
- [x] Created and checked out `feature/foundation-monorepo-scaffold`
- [x] Scaffold `apps/api`
- [x] Commit API scaffold locally (`chore(api): scaffold api workspace`)
- [ ] Push API scaffold (`origin` remote not configured)
- [x] Scaffold `packages/church-context`
- [x] Commit ChurchContext scaffold locally (`chore(church-context): scaffold context package`)
- [ ] Push ChurchContext scaffold (`origin` remote not configured)
- [x] Scaffold `packages/db`
- [x] Commit DB scaffold locally (`chore(db): scaffold persistence contracts`)
- [ ] Push DB scaffold (`origin` remote not configured)
- [x] Run scaffold release check
- [x] Write architecture review findings

## Done when
All three scaffold targets have typed placeholders, README guidance, lint/typecheck/test pass, commits exist for each module scaffold, branch is pushed, and release-check findings are recorded.

## Next task after this
Implement the first approved module slice from the scaffolded contracts.
