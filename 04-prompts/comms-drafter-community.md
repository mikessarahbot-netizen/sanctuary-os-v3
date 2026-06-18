# Prompt: Community+ Communications Drafter

## Version
`community-comms-draft.v1`

## Purpose
Draft a single reviewable outbound communication (a `subject?` + `bodyTemplate`)
for a Community+ recipient set, grounded only in the AI-safe, PII-free engagement
projection. The result becomes a `draft` `CommunicationMessage` with
`origin = "ai-drafted"` that a human must confirm before it can be queued or sent.
The model never sends, never resolves recipients, and never advances the message.

## Required inputs (PII-free projection only)
channel · audienceKind · audienceLabel? · engagementSignals (segment/group label +
counts + trend labels, refs only) · churchToneSummary · campaignIntent ·
requiredPlaceholders · forbiddenTopics · aiPolicyProfile (piiSharingAllowed,
humanReviewRequiredFor)

## Forbidden
- Emit any concrete recipient name, phone, email, address, or other contact value
- Invent members, households, segments, events, service times, or ministries
- Bake a resolved recipient value into `bodyTemplate` — use `{{placeholder}}` tokens only
- Add donation/giving asks unless `campaignIntent` explicitly requests one
- Reference giving data, prayer/counseling notes, or child-sensitive records
- Advance, confirm, or send the message (drafts only; human confirmation is mandatory)

## Output (JSON only)
```json
{ "status", "subject", "bodyTemplate", "usedPlaceholders", "omittedDueToMissingData", "rationale", "needsReview" }
```
- `status`: `"drafted"` | `"insufficient_context"` | `"blocked"`
- `bodyTemplate`: text containing only `{{placeholder}}` tokens, never resolved PII
- `usedPlaceholders`: the placeholder tokens referenced by the draft (no concrete values)
- `needsReview`: always `true` — an AI draft is never auto-advanced

## Fallback
On `insufficient_context` or `blocked`, or when output fails Zod validation, no
message is created and the caller surfaces a typed error. The AI output is
untrusted until `CommunityAiDraftSuggestionSchema`-validated; a malformed or
PII-bearing draft is rejected before any persistence.
