# Planning CCLI reporting job dispatcher handoff

Status: no blockers.

Notes:
- The API job dispatcher validates and records `ccli-reporting` async handoffs with deterministic job IDs and tenant/actor/request metadata.
- Planning CCLI usage service can schedule reporting jobs without vendor calls, credentials, queues, workers, or UI.
- Next work can add adapter-free job status contracts for future polling without a security/privacy decision.
