# Sanctuary OS Starter Workspace v3

Token-optimised, file-governed workspace for Claude Code and Codex — with GitHub workflow built in.

## The application
To run the actual Sanctuary OS app (the GraphQL backend + the web operator console),
the test suites, the architecture, and the safety model, see
**[docs/running.md](docs/running.md)**. The rest of this file covers the
agent/workspace governance.

## Start here
1. Open this folder as your project root in Claude Code.
2. Claude Code auto-loads `agents.md` on every turn (Tier 1 context).
3. Load deeper docs only for the task at hand.

## First instruction for any coding agent
```
Read agents.md, then 06-tasks/active/NOW.md. Complete only the active task.
```

## Token tiers
| Tier | Files | When loaded |
|---|---|---|
| 1 — Always | `agents.md` | Every turn |
| 2 — On-demand | `05-plans/<module>.md`, `03-context/church-context-schema.md` | When task touches that module |
| 3 — Reference | Architecture, standards, ADRs | When explicitly referenced |

## Recommended task + git workflow
```
/git-branch <module> <description>
→ /implement-feature <feature> <module>
→ /git-commit
→ update NOW.md with next task
→ repeat
```

## Session management
- Every ~40 messages: run `/compact` in Claude Code
- Save compact output to `docs/session-summary.md`
- New session: load `agents.md` + `docs/session-summary.md` + `NOW.md`

## Included future docs
See `manifest.md`
