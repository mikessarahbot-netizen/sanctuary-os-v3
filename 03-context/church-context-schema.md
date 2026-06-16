# ChurchContext Schema

Canonical shared context object. Assembled by the API backend. Consumed by all AI features and automation paths.

## Shape
```ts
type ChurchContext = {
  churchProfile: ChurchProfile          // identity, timezone, denomination
  serviceProfile: ServiceProfile        // service types, templates, rehearsal norms
  songLibraryProfile: SongLibraryProfile// song catalog with usage, keys, energy
  teamProfile: TeamProfile              // roles, active members, scheduling policies
  peopleProfile: PeopleProfile          // member schema, segments, custom fields
  engagementProfile: EngagementProfile  // attendance + volunteer + comms patterns
  styleProfile: StyleProfile            // tone, brand colors, fonts
  aiPolicyProfile: AIPolicyProfile      // feature flags, PII consent, human-review gates
  operationalProfile: OperationalProfile// platform footprint, internet reliability
  integrationsProfile: IntegrationsProfile
  contextMetadata: ContextMetadata
}
```

## Profile responsibilities
| Profile | Source-of-truth content | AI-safe default projection |
|---|---|---|
| `churchProfile` | Church identity, timezone, denomination/tradition, campuses | Name, timezone, broad tradition |
| `serviceProfile` | Service types, default schedule, templates, rehearsal norms | Service type, date/time, template metadata |
| `songLibraryProfile` | Songs, arrangements, keys, tempo, usage, licensing metadata | Song IDs, titles, keys, tempo, energy, usage counts |
| `teamProfile` | Worship/production roles, scheduling policies, availability rules | Roles and non-PII assignment constraints |
| `peopleProfile` | Member schema, segments, custom fields | Segment counts or anonymized labels only |
| `engagementProfile` | Attendance, volunteer participation, comms patterns | Aggregates and trend labels only |
| `styleProfile` | Visual style, language tone, brand colors, typography | Tone and non-sensitive style settings |
| `aiPolicyProfile` | AI feature flags, PII permission, review gates | Always included for AI calls |
| `operationalProfile` | Devices, internet reliability, local/offline capabilities | Capabilities and reliability labels |
| `integrationsProfile` | Connected vendors, sync status, external catalog metadata | Vendor availability and non-secret status |
| `contextMetadata` | Schema version, generated timestamp, tenant, projection name | Schema version and projection name |

## Required policy fields
`aiPolicyProfile` must define:
- `piiSharingAllowed`
- `humanReviewRequiredFor`
- `enabledAIFeatures`
- `retentionPolicy`
- `lastReviewedAt`

## Boundary rules
- API owns full-context assembly.
- Apps and packages request named projections instead of constructing partial context by hand.
- Prompt functions accept only validated projections, never raw database records.
- Context builders must remove secrets, auth tokens, private notes, and blocked fields before returning.
- Every projection includes `contextMetadata.schemaVersion` so prompt specs can declare compatibility.

## AI context rules
- Pass minimum viable projection for each task (not full context every time)
- Never include in any AI call: phone numbers · home addresses · prayer/counseling notes · giving data tied to individuals · child-sensitive records
- `bannedOrPausedSongIds` must be respected by all recommendation features
- AI may rank/filter songs but may not invent library entries
- AI-generated service, setlist, chart, comms, or automation suggestions must be reviewable before becoming persisted changes
