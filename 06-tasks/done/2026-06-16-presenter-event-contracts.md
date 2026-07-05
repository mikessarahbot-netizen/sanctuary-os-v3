# Presenter Event Contracts

Status: no blockers.

Open questions: none.

Notes:
- Presenter event payload contracts were completed on `feature/presenter-domain-contracts`.
- The next slice can wire in-memory Presenter service mutations to the shared event publisher without a new event-name decision because the event names and schema versions are now validated in `apps/api/src/events/index.ts`.
