# Planning event publisher handoff

Status: no blockers.

Notes:
- The adapter-free Planning event publisher validates and records realtime handoff events for `service.published`, `assignment.statusChanged`, and `readiness.updated`.
- Planning command/readiness services now include `requestId` in emitted event envelopes.
- Next work can focus on API async job dispatch for Planning CCLI reporting without a security/privacy decision.
