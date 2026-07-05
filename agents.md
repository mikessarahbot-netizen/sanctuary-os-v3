# Sanctuary OS

Unified AI-powered worship platform: Planning · Presenter · Play · Charts · Community+ · OBS control.

## Stack
TypeScript · Turborepo/pnpm · React Native (Expo) · Next.js · Tauri · Node/GraphQL · PostgreSQL · SQLite · WebSockets · Claude API · Whisper API · obs-websocket v5 · Auth0

## Read order (before every task)
1. `00-product/vision.md`
2. `01-architecture/system-map.md`
3. `02-standards/engineering-rules.md`
4. Matching `05-plans/<module>-plan.md`
5. `06-tasks/active/NOW.md`

## Repo layout
| Folder | Purpose |
|---|---|
| `00-product/` | Vision, roadmap, non-goals |
| `01-architecture/` | System map, events, integrations |
| `02-standards/` | Engineering, testing, prompt, privacy, UX rules |
| `03-context/` | ChurchContext schema + domain models |
| `04-prompts/` | Versioned AI prompt specs |
| `05-plans/` | Module implementation plans |
| `06-tasks/` | active / backlog / blocked / done |
| `07-reviews/` | Audits, defects, test results |
| `08-decisions/` | ADRs |
| `apps/` | api · mobile · desktop · web |
| `packages/` | church-context · ui · ai-engine · obs-agent · midi-bridge · db |

## Non-negotiable rules
- No `any`. Zod-validate all external inputs + AI outputs.
- No PII to AI unless `aiPolicyProfile.piiSharingAllowed = true`.
- Offline-first for Play and Charts.
- Human confirmation required before stream-start, stream-stop, or destructive mutations.
- One task at a time. Stop when scope is complete.

## Agent workflow
1. Read the required files in order before changing anything.
2. Restate the active task and identify the smallest complete slice.
3. Check existing files and preserve user changes.
4. Change only files required by the active task.
5. Validate with the lightest reliable command or manual check.
6. Summarize what changed, how it was validated, and what remains risky.

## Source-of-truth hierarchy
When documents disagree, resolve in this order:
1. `agents.md`
2. `06-tasks/active/NOW.md`
3. `02-standards/engineering-rules.md`
4. `01-architecture/system-map.md`
5. Matching `05-plans/<module>-plan.md`
6. Existing implementation, once code exists

## Task output format
1. Scope restatement
2. Files to change
3. Smallest complete implementation
4. Validation steps
5. Remaining risks

## If blocked
State the blocker. Propose 2-3 safe options. Write to `06-tasks/blocked/` if needed.

## Git rules
- `main` is the single source of truth. Task state (`06-tasks/`, `docs/session-summary.md`) is only authoritative on `main`. Merge every completed slice back into `main` and push before ending the session — never leave finished work stranded on a feature branch or in a worktree.
- Work on a feature branch — never directly on `main`.
- Branch naming: `feature/<module>-<short-description>` or `fix/<short-description>`
- Commit after each completed task scope, not mid-implementation.
- Commit message format: `<type>(<scope>): <short summary>`
  - Types: `feat` · `fix` · `chore` · `docs` · `test` · `refactor`
  - Example: `feat(planning): add volunteer assignment mutation`
- Push branch after committing. Do not open a PR unless explicitly asked.
- If unsure whether to commit, finish the current task scope first.

## Session continuity protocol
The build spans many sessions. Keep each session's context window small and token usage low by handing off to a fresh session at clean breakpoints instead of growing one context indefinitely.

- **Commit before handoff — always.** Never begin a new session with uncommitted work. Immediately before handing off: `git add -A`, commit, `git push`, and confirm `git status` is clean. Use a normal `feat`/`chore`/`docs` commit for a finished slice; use `chore(wip): <slice> — <what remains>` when stopping mid-slice. This WIP commit is the one sanctioned exception to "commit after each completed task scope, not mid-implementation".
- **Breakpoints.** Prefer to hand off between slices, just after a slice's full ceremony (code + tests + gates + release check + handoff note + `NOW.md`) is complete and pushed. If context grows large mid-slice, stop at the next safe point, commit a labelled WIP, and hand off anyway.
- **When to hand off.** Trigger a handoff when any of these holds: the context window is getting large; a slice is fully done and pushed; or several slices have accumulated in one session.
- **Handoff package.** Update `06-tasks/active/NOW.md` (next slice, in-scope steps, "Done when") and write `06-tasks/done/<date>-<slice>-handoff.md` (resume command + read order + exact remaining steps). `06-tasks/blocked/` is only for genuinely blocked work awaiting a decision or external input. A fresh session must be able to resume from `agents.md` + `NOW.md` alone, with no memory of the prior session.
- **End the session.** After committing, pushing, and writing the handoff, print `🔄 SESSION HANDOFF — resume in a fresh session from 06-tasks/active/NOW.md` and stop.
- **Goal continuity.** The standing goal — complete the Sanctuary OS build, module by module in sequence, slice by slice, without stopping — carries across sessions via `NOW.md`. The `/goal` Stop hook is per-session runtime state; a fresh session must have the goal re-established to keep building unattended.
- **Bake the cadence into `/goal`.** Re-issue the standing `/goal` so it explicitly drives commit + push + fresh-session handoff at appropriate points — to keep context windows small and token usage low. Suggested wording: *"complete Sanctuary OS build — keep building unattended; at each finished slice AND whenever the context window grows large, run `git add -A && commit && git push`, update `NOW.md` + a handoff note, then hand off to a fresh session before continuing."* (Only the user can set the live hook; the agent cannot rewrite it mid-session.)
- **Proactive context budget.** Do not wait for a forced compaction. When the context is visibly bloated (long tool transcripts, many slices in one session), proactively commit + push + hand off even mid-slice (labelled WIP) rather than pushing on.
