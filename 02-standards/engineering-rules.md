# Engineering Rules

## Core
- Volunteer-usable > technically clever
- Service-reliable > feature-rich
- Explicit > magic
- Thin resolvers, logic in services
- Small, reversible changes
- Prefer domain language from `03-context/` and `05-plans/`

## TypeScript
- No `any`
- Explicit return types on exports
- Zod at all trust boundaries: GraphQL input, AI output, event payloads, webhook input
- Prefer discriminated unions for stateful workflows
- External IDs must be typed as opaque strings at boundaries and validated before use

## Tests
- New behavior → new test
- Bug fix → regression test
- AI prompt functions → schema compliance test + fallback test
- Service/domain logic should be unit tested before resolver integration tests
- Offline-first modules need sync-queue and stale-data tests

## AI
- AI output = untrusted until Zod-validated
- Every prompt spec must declare: purpose · required inputs · forbidden assumptions · output schema · fallback
- No PII to third-party models unless `aiPolicyProfile.piiSharingAllowed = true`
- Prompt callers must request the smallest necessary ChurchContext projection
- AI features must return reviewable results before writes that affect services, people, streams, or comms

## Privacy and safety
- Tenant scope is required on every persisted read/write
- Never log secrets, tokens, full prompt payloads, or raw PII
- Destructive mutations require explicit user intent and audit logging
- Stream start/stop and OBS automation require a human confirmation gate

## Offline-first
- Play and Charts must keep rehearsal-critical state available locally
- Local writes queue for sync and surface conflict status to the user
- Network failure cannot block existing local charts, cues, or playback-critical metadata

## API shape
- GraphQL resolvers parse input, authorize, and delegate
- Services own transactions, role checks, and cross-aggregate behavior
- Domain functions stay pure where practical
- Integration adapters isolate vendor SDKs and normalize failures

## Tasks
1. Restate scope  2. List files to change  3. Implement smallest complete slice  4. Validate  5. Summarize changes + remaining risks
