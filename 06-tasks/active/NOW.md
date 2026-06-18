# NOW

## Task
Community+ module, slice 8: the engagement rollup recompute — a tenant-scoped service operation that recomputes EngagementSummary rows over the persisted data (members' attendance/serving/comms-response signals), completing the parity gap slice 7 left. PII-free by construction. (Community+ slices 1–7 done + green at `858719c`.)

## Module / authority
Building Community+ from `05-plans/community-plus-module-plan.md` (authoritative). Strictest-privacy module: EngagementSummary is refs/counts only — NO PII. Charts + Play backends complete.

## Carried gap (from slice 7)
The persistence-backed `recomputeEngagementSummaries` could not fully enumerate attendance because the slice-4 query repo has no list-all attendance read. Add a minimal, additive `listAttendanceRecords` read (tenant-scoped, optional member/occasion filter) to the db community contracts + SQL adapter (+ tests), then use it so the recompute reaches full parity with the in-memory service. Keep it additive (don't disturb existing methods).

## Session protocol (in force)
`agents.md` › "Session continuity protocol": commit + push at clean breakpoints. Handoff = the module plans + this NOW.md + `docs/session-summary.md`. Ceremony streamlined per backend slice; consolidated release check at the Community+-backend milestone.

## In scope (slice 8)
- Continue on `feature/presenter-domain-contracts`
- Reuse the pure `apps/api/src/domain/community/engagement.ts` rollup (slice 1) as the computation core; this slice is the SERVICE-level recompute that gathers the inputs from persistence and upserts the summaries
- Add the additive `listAttendanceRecords` db read (contracts + `community-sql-repository.ts` + recording-executor test + a `node:sqlite` check) to enable full attendance enumeration
- Complete `recomputeEngagementSummaries` in `apps/api/src/services/community/persistence.ts` (and confirm in-memory parity) so it gathers attendance + serving + comms-response signals fully and upserts PII-free EngagementSummary rows; tenant-scoped; injected clock/window
- Tests: service recompute tests (correct counts from seeded data; PII-free output assertion; tenant isolation) + the new db read tests + a `node:sqlite` integration recompute round-trip
- Do not change the GraphQL surface (the recompute mutation/query already exists from slice 5 if the plan put it there; otherwise expose it minimally per the plan)

## Done when
`recomputeEngagementSummaries` fully recomputes PII-free EngagementSummary rows over persisted attendance/serving/comms data (with the additive attendance read), covered by service + db tests + a `node:sqlite` integration test, gates green, committed and pushed.

## Next task after this
Community+ slice 9: WebSocket events (member/household/group/attendance/communication events into the API event union with scope superRefines, emitted after durable commits; comms events must NOT leak PII). Then slice 10: AI assist (reviewable draft suggestions, smallest PII-free ChurchContext projection, no auto-send). Slices 11–13 await user decisions. After Community+: the OBS module (final; obs-websocket + human-confirm gates for stream/scene actions).
