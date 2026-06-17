# Play Module Plan

## Scope v1
Track-set definition for a service/song (the desktop "Play" surface for click, pads, and backing stems) · per-song arrangement of sections with an ordered playback sequence · cues that map a section/marker to a playback action (play, stop, jump, pad-change, click-toggle) · pad layers (ambient pad per key/section) · transport/playback state as a durable, resumable model · local fail-safe playback so a loaded track set keeps running if internet drops · offline-first availability of track sets, arrangements, cues, and pads for rehearsal and service · service/song references from Planning and the catalog (opaque IDs).

## Out of scope v1
Raw audio/stem file storage or transcoding (Play references opaque media IDs/URLs from a future media-storage boundary) · a full DAW (multitrack mixing, automation curves, plugins, recording) · MIDI device I/O and the `midi-bridge` hardware layer (Play stores cue intent; the bridge package realizes it later) · the audio engine / actual sample playback (that is desktop-runtime code, not this domain) · song catalog ownership, CCLI/SongSelect licensing or import · Presenter slide/output state (Presenter owns those) · realtime multi-operator co-editing of a track set · automatic AI track generation or stem separation writes.

## Domain objects
TrackSet · PlayArrangement · PlaySection · PlayCue · PadLayer · PlaybackState

## Domain boundaries
| Object | Owns | Does not own |
|---|---|---|
| TrackSet | Tenant-scoped track-set identity, service/song refs, default key/tempo (BPM), stem/track member refs (opaque media IDs), metadata | Raw audio/stem bytes, transcoding, licensing, Presenter slides, attendance |
| PlayArrangement | Arrangement label, default key, tempo, ordered `sectionOrder`, loop/repeat baseline | Song authorship, CCLI contracts, the audio engine, chart ChordPro source |
| PlaySection | Section kind (intro/verse/chorus/bridge/instrumental/tag/outro/other), bars/beats length hint, optional pad/click defaults | Cross-song references, slide content, raw media |
| PlayCue | Cue label, target section/marker position, cue action (play/stop/jump/pad-change/click-toggle), optional target-section ref for jumps, fire mode (manual/auto) | The audio device, MIDI hardware, OBS scene state, destructive stream control |
| PadLayer | Pad identity for a key (and optional section scope), pad media ref (opaque), gain/level hint, loop flag | Raw pad audio bytes, synthesis, the mixer hardware |
| PlaybackState | Durable transport snapshot for a track set: active section, transport status (stopped/playing/paused), position hint, click-enabled, active pad ref, updatedAt | High-frequency per-sample playhead (that is ephemeral runtime state on the local bus), other operators' live sessions |

## API and storage surfaces
- GraphQL/HTTP is the cross-device persistence boundary for saved track sets, arrangements, cues, and pads (mirrors Charts/Presenter).
- The Desktop app (Tauri) owns the live Play surface: the local audio engine, the high-frequency playhead, and offline fail-safe playback. Per the system map, high-frequency Play/Presenter sync uses the **local desktop event bus**, not GraphQL; GraphQL persists the durable model and a coarse, resumable `PlaybackState` snapshot, never the per-sample playhead.
- Media/stem/pad assets are referenced by **opaque IDs/URLs** from a future media-storage boundary; raw audio payload storage is out of scope (same posture as Presenter `MediaCue` / Charts song refs).
- Service and song references are opaque IDs from Planning / the catalog (`songLibraryProfile`); Play reads but does not mutate Planning services or the catalog during import.
- Desktop Play keeps track sets, arrangements, cues, and pads available offline; non-destructive edits and resumable `PlaybackState` updates queue for sync (reuse the local-sync-queue + replay pattern). The destructive `removeCue` is intentionally **excluded** from the offline queue and requires explicit online intent + audit (mirrors `removeChartAnnotation`).

## Domain objects as records (Zod-shaped, tenant-scoped, offline-first; no secrets/PII)
Every record is `.strict()`, branded-ID typed at boundaries, carries `tenantId`, and stores only references (never raw media, credentials, or PII). Field lists name the durable shape the API domain (`apps/api/src/domain/play/contracts.ts`) and persistence records (`packages/db/src/play-repository-contracts.ts`) must agree on.

- **TrackSet** — `tenantId`, `trackSetId`, `songRef`, `serviceRef?`, `arrangementRef?`, `title?`, `defaultKey`, `tempoBpm` (positive number), `trackRefs: TrackMemberRef[]` (each: `trackRef` opaque media ID, `role` ∈ {click, guide, stem, pad, other}, `label?`, `muted` bool), `createdAt`, `updatedAt`.
  - Invariants: `tempoBpm > 0`; `trackRefs` unique by `trackRef`; at most one `click` member; no raw audio bytes — refs only.
- **PlayArrangement** — `tenantId`, `arrangementRef`, `songRef`, `label`, `defaultKey`, `tempoBpm`, `sectionOrder: string[]` (section labels/ids in play order), `loopSectionRef?`.
  - Invariants: `tempoBpm > 0`; `sectionOrder` non-empty entries; `loopSectionRef`, if present, appears in `sectionOrder`.
- **PlaySection** — `tenantId`, `sectionId`, `arrangementRef`, `kind` (enum), `label?`, `lengthBars` (nonneg int), `clickEnabledDefault` bool, `padLayerRef?`.
  - Invariants: `lengthBars >= 0`; `kind` from the fixed `PlaySectionKind` enum; pad ref (if set) resolves within tenant.
- **PlayCue** — `tenantId`, `cueId`, `trackSetId`, `sectionId`, `markerOffsetBeats` (nonneg int), `label`, `action` (enum: play/stop/jump/pad-change/click-toggle), `targetSectionRef?` (required iff `action = jump`), `padLayerRef?` (required iff `action = pad-change`), `fireMode` (manual/auto), `createdAt`, `updatedAt`.
  - Invariants (superRefine): `jump` ⇒ `targetSectionRef` present; `pad-change` ⇒ `padLayerRef` present; `markerOffsetBeats >= 0`. Cues never carry device/hardware handles.
- **PadLayer** — `tenantId`, `padLayerRef`, `songRef?`, `key` (string), `sectionScopeRef?`, `padMediaRef` (opaque media ID), `gain` (REAL, 0..1), `loop` bool, `label?`, `updatedAt`.
  - Invariants: `0 <= gain <= 1`; `padMediaRef` is a reference, never bytes.
- **PlaybackState** — `tenantId`, `trackSetId`, `activeSectionRef?`, `transportStatus` (enum: stopped/playing/paused), `positionBeats` (nonneg number, coarse), `clickEnabled` bool, `activePadLayerRef?`, `updatedAt`.
  - Invariants: `positionBeats >= 0`; this is a **coarse, resumable** snapshot (one row per `tenant_id + track_set_id`), not the per-sample playhead. Destructive transport actions that affect live output (e.g. starting playback into a routed/streamed output) require a confirmation gate at the action boundary — see Privacy and safety.

## Pure rendering/transform rules
The Play analog of ChordPro parse/transpose lives in `apps/api/src/domain/play/sequence.ts` (and a small `timing.ts`), all pure, deterministic, Zod-validated, no I/O — exactly like `chordpro.ts`.

- **Arrangement sequence resolution** is a pure function: `(PlayArrangement, PlaySection[]) → ResolvedPlaySequence` — orders sections by `sectionOrder`, attaches each section's resolved length/click/pad defaults, and flags any `sectionOrder` entry with no matching section (passes through as an `unresolved` marker rather than throwing), mirroring how invalid chords pass through flagged in transpose.
- **Cue resolution** is a pure function: `(PlayArrangement, PlayCue[], resolvedSequence) → ResolvedCueTimeline` — places each cue at its `(section, markerOffsetBeats)` along the resolved sequence and validates action targets (`jump` target exists in the sequence; `pad-change` pad resolves). Invalid targets are flagged, not silently dropped.
- **Beat/bar ↔ time transform** is a pure function over `tempoBpm` (and an optional meter, default 4/4): convert bars/beats to seconds and back deterministically; this is a display/scheduling transform and never mutates the stored model. Equivalent role to capo/transpose display derivation in Charts.
- **Transpose of pad key / arrangement key** (optional, reviewable) reuses the same fixed sharp-enharmonic policy as Charts `transposeChord` so a track set displayed in a transposed key stays consistent with its chart; the stored key is never rewritten unless explicitly saved as a new arrangement.
- Determinism + scope: all of the above are pure and tenant-agnostic at the function level (they take already-tenant-scoped records); no `Date.now`, no randomness, injected clocks only at the service edge.

## Persistence model (SQLite-compatible: TEXT/INTEGER/REAL)
New file `packages/db/src/play-migrations.ts` exporting `PlayInitialSchemaMigration` and `PlayLocalSyncQueueMigration` (via `defineSqlMigrationArtifact`), aggregated as `PlaySqlMigrations`, mirroring `charts-migrations.ts`. All tables tenant-scoped, composite PKs lead with `tenant_id`, `CHECK` constraints encode the Zod invariants, booleans as `INTEGER IN (0,1)`, gains/levels as `REAL`, timestamps/enums as `TEXT`.

Initial schema tables (`schema_version` literal `play.v1`):
- `track_sets` — PK `(tenant_id, track_set_id)`; columns: `song_id TEXT NOT NULL`, `service_id TEXT`, `arrangement_ref TEXT`, `title TEXT`, `default_key TEXT NOT NULL`, `tempo_bpm REAL NOT NULL`, `track_refs_json TEXT NOT NULL`, `schema_version TEXT`, `created_at TEXT`, `updated_at TEXT`; `CHECK (tempo_bpm > 0)`, `CHECK (track_refs_json <> '')`, `CHECK (schema_version = 'play.v1')`. Index `track_sets_tenant_song_idx (tenant_id, song_id)`.
- `play_arrangements` — PK `(tenant_id, arrangement_ref)`; `song_id`, `label`, `default_key`, `tempo_bpm REAL`, `section_order TEXT NOT NULL` (json), `loop_section_ref TEXT`; `CHECK (tempo_bpm > 0)`. Index `play_arrangements_tenant_song_idx`.
- `play_sections` — PK `(tenant_id, section_id)`; `arrangement_ref`, `kind TEXT`, `label`, `length_bars INTEGER NOT NULL DEFAULT 0`, `click_enabled_default INTEGER NOT NULL`, `pad_layer_ref TEXT`; `CHECK (length_bars >= 0)`, `CHECK (click_enabled_default IN (0,1))`, `CHECK (kind IN ('intro','verse','prechorus','chorus','bridge','instrumental','tag','outro','other'))`. Index `play_sections_tenant_arrangement_idx (tenant_id, arrangement_ref)`.
- `play_cues` — PK `(tenant_id, cue_id)`; `track_set_id`, `section_id`, `marker_offset_beats INTEGER NOT NULL DEFAULT 0`, `label TEXT NOT NULL`, `action TEXT NOT NULL`, `target_section_ref TEXT`, `pad_layer_ref TEXT`, `fire_mode TEXT NOT NULL`, `created_at`, `updated_at`; `CHECK (marker_offset_beats >= 0)`, `CHECK (action IN ('play','stop','jump','pad-change','click-toggle'))`, `CHECK (fire_mode IN ('manual','auto'))`, `CHECK (action <> 'jump' OR target_section_ref IS NOT NULL)`, `CHECK (action <> 'pad-change' OR pad_layer_ref IS NOT NULL)`. Index `play_cues_tenant_trackset_idx (tenant_id, track_set_id)`.
- `pad_layers` — PK `(tenant_id, pad_layer_ref)`; `song_id`, `pad_key TEXT NOT NULL`, `section_scope_ref TEXT`, `pad_media_ref TEXT NOT NULL`, `gain REAL NOT NULL`, `loop INTEGER NOT NULL`, `label`, `updated_at`; `CHECK (gain >= 0 AND gain <= 1)`, `CHECK (loop IN (0,1))`. Index `pad_layers_tenant_song_idx`.
- `playback_state` — PK `(tenant_id, track_set_id)` (one resumable snapshot per track set); `active_section_ref TEXT`, `transport_status TEXT NOT NULL`, `position_beats REAL NOT NULL DEFAULT 0`, `click_enabled INTEGER NOT NULL`, `active_pad_layer_ref TEXT`, `updated_at TEXT NOT NULL`; `CHECK (transport_status IN ('stopped','playing','paused'))`, `CHECK (position_beats >= 0)`, `CHECK (click_enabled IN (0,1))`.

Persistence contracts (`packages/db/src/play-repository-contracts.ts`, mirroring `charts-repository-contracts.ts`):
- `PlayPersistenceReadOptions` / `PlayPersistenceWriteOptions` reuse `RepositoryReadOptions`/`RepositoryWriteOptions` and require an `actorId` (superRefine).
- One `*PersistenceRecordSchema` per object + `*PersistenceInputSchema` per operation; `readOperation`/`writeOperation` wrappers; `PlayQueryPersistenceRepository` + `PlayCommandPersistenceRepository` interfaces.

Local sync queue migration (`PlayLocalSyncQueueMigration`, `schema_version` literal `play-local-sync-queue.v1`):
- `play_local_sync_queue_entries` — same column shape as `charts_local_sync_queue_entries` (`tenant_id`, `queue_entry_id`, `track_set_id?`, `actor_id`, `request_id`, `operation`, `payload_json`, `status`, `safe_error_message?`, `attempt_count`, `queued_at`, `last_attempted_at?`, `next_attempt_at?`, `schema_version`, `created_at`, `updated_at`), with the three replay indexes (pending / status / request). `CHECK (operation IN (...non-destructive Play ops...))`, `CHECK (status IN ('pending','in-flight','failed','synced'))`, and the same failed⇒safe-message / next-attempt-only-when-failed / attempted⇒attempt-count constraints.

## GraphQL surface
New file `apps/api/src/graphql/play.ts` (SDL + thin resolvers), merged into the executable schema, with `PlayDomainError.code → extensions.code` mapping (mirrors `charts.ts`). Enums: `PlaySectionKind`, `PlayCueAction`, `PlayCueFireMode`, `TransportStatus`, `TrackRole`.

Types: `TrackSet`, `TrackMemberRef`, `PlayArrangement`, `PlaySection`, `PlayCue`, `PadLayer`, `PlaybackState`, plus a read-only `ResolvedPlaySequence` / `ResolvedCueTimeline` projection type for display.

Queries:
`trackSets(filter)` · `trackSet(id)` · `trackSetsForSong(songRef)` · `playArrangements(songRef)` · `playSections(arrangementRef)` · `playCues(trackSetId)` · `padLayers(filter)` · `playbackState(trackSetId)` · `resolvedPlaySequence(arrangementRef)`

Mutations:
`saveTrackSet(input)` · `updateTrackSetMembers(input)` · `savePlayArrangement(input)` · `savePlaySection(input)` · `reorderPlaySections(input)` · `addPlayCue(input)` · `updatePlayCue(input)` · `removePlayCue(input)` *(destructive — requires `confirmationIntent { confirmed: true, reason }`, online-only, audited)* · `savePadLayer(input)` · `setPlaybackState(input)`

WebSocket events emitted (durable, coarse — high-frequency playhead stays on the local desktop bus): `trackSet.updated` · `play.playbackStateChanged` · `play.cueFired`. Each is a `.strict()` payload added to the API event union (`apps/api/src/events/index.ts`) with a tenant/aggregate scope superRefine exactly like the presenter events, and emitted only after durable state commits.

## Service layer
Mirror the Charts service split under `apps/api/src/services/play/`:
- `contracts.ts` / domain `contracts.ts` — `PlayQueryService` + `PlayCommandService` interfaces (Zod-validated request envelopes: `{ actor, requestId, input }`), one method per query/mutation above.
- `errors.ts` — typed `PlayDomainError` with `PLAY_DOMAIN_ERROR_CODES` = `TRACK_SET_NOT_FOUND` · `ARRANGEMENT_NOT_FOUND` · `SECTION_NOT_FOUND` · `CUE_NOT_FOUND` · `PAD_LAYER_NOT_FOUND` · `PLAYBACK_STATE_NOT_FOUND` · `VALIDATION_FAILED` · `AUTHORIZATION_FAILED`, carrying `code` + redacted `safeMessage` (drives `extensions.code` and classifies replay outcomes).
- `in-memory.ts` — in-memory adapter implementing both services, tenant-scoped, Zod-validated, injected clock + id generator; the test double.
- `persistence.ts` — persistence-backed adapter delegating to the Play SQL repositories over an injected executor; a drop-in behind the same resolvers.
- `composition.ts` — `createPlayPersistenceSelection` selecting `in-memory` vs `sql` by env (sql in production), applying `PlayInitialSchemaMigration` via the shared migration runner; `migratePlaySqliteSchema` helper. Same `PlayPersistenceSelectionConfig` shape as Charts.

Every persisted read/write is tenant-scoped and role-checked; transport/cross-aggregate writes own their transaction; destructive `removePlayCue` requires explicit intent + audit metadata; domain functions stay pure (the service only orchestrates, validates, clocks, and persists).

## Offline-sync: queue + replay
Mirror the Charts local sync queue and the API replay coordinator, and (later) the desktop replay runtime.

- `packages/db/src/play-local-sync-queue-repository-contracts.ts` — a discriminated-union `PlayLocalSyncQueuedOperationPersistence` over the **non-destructive** Play operations (`saveTrackSet`, `updateTrackSetMembers`, `savePlayArrangement`, `savePlaySection`, `reorderPlaySections`, `addPlayCue`, `updatePlayCue`, `savePadLayer`, `setPlaybackState`), each payload **reusing the command repository's input schema** so a queued record can never drift from the online path. `removePlayCue` is excluded. Entry record schema, status enum (`pending`/`in-flight`/`failed`/`synced`), the same allowed-transition map and superRefine guards as Charts (tenant/track-set match, failed⇒safe-message, next-attempt-only-when-failed). Repository interface: `enqueue` · `getById` · `listPending` · `markInFlight` · `markSynced` · `markFailed` · `requeue` · `pruneSynced` · `countByStatus`.
- `packages/db/src/play-local-sync-queue-in-memory-repository.ts` + `play-local-sync-queue-sql-repository.ts` — the double and the SQLite-backed repo.
- `packages/db/src/play-local-sync-queue-replay.ts` — the **pure** replay decision: `decidePlayLocalSyncQueueReplay(pending, { now, policy })` returns `{ eligible, exhausted }` applying ordering, backoff, and attempt limits (no I/O, injected `now`), mirroring the Charts replay decision + status helpers.
- `apps/api/src/services/play/local-sync-queue-replay-coordinator.ts` — a single-pass coordinator: read pending → apply the pure decision → for each eligible entry `markInFlight`, map the stored op to the matching `PlayCommandService` command, run it, then `markSynced` / (retryable) `markFailed`+backoff+`requeue` / (terminal `PlayDomainError`) `markFailed` no-requeue. Actor tenant must match the entry; the entry `requestId` is the idempotency key. No timer loop, no transport of its own (command service injected → unit-testable with a fake).
- **Desktop (later, mirrors Presenter + ADR 0005):** the desktop Play replay runtime runs in a **Node sidecar** using the synchronous `node:sqlite` client (not the Tauri webview), reusing `SqliteMigrationDatabaseClient` unchanged: a `replay-pass` + `replay-scheduler` + `replay-error-classifier` + `runtime-bootstrap` + `sidecar-entry`, engine/transport-agnostic via injected fetch transport, auth-token provider, and connectivity check.

## Privacy and safety rules
- No secrets, vendor tokens, raw audio/stem/pad bytes, or media credentials are stored in Play domain records — references only.
- Tenant scope is required for every persisted track-set, arrangement, section, cue, pad, and playback-state read/write.
- Destructive actions (cue removal; any future track-set/arrangement deletion) require explicit intent and audit metadata, and are online-only (excluded from the offline queue).
- **Human confirmation gate** before any action that starts/affects routed or streamed output: per the non-negotiables, stream start/stop and OBS automation require a human-confirm gate. Play's transport actions that drive live output carry a `confirmationIntent` at the action boundary; Play never auto-starts a stream and never triggers OBS scene changes itself (OBS agent owns that, with its own gate).
- Never log secrets, tokens, full payloads, or PII; queue/replay surfaces store only redacted `safeMessage`s.

## AI assist rules
- AI may suggest arrangement section order, cue placement, or a pad/key choice as **reviewable suggestions**; output is Zod-validated and shown before any write that changes a saved track set, cue, or pad.
- AI may not invent catalog/song entries and must respect `bannedOrPausedSongIds`.
- AI callers request the smallest necessary `ChurchContext` projection.
- No PII is sent to AI unless `aiPolicyProfile.piiSharingAllowed = true`.
- AI features return reviewable results before any write that affects services, people, streams, or comms.

## Slice-by-slice breakdown
Each slice is the smallest complete vertical increment with its own tests + gates green (`pnpm lint` / `typecheck` / `test`, `--max-warnings=0`, injected clocks, no `Date.now` in libs, recording-executor + `node:sqlite` smokes), followed by the slice ceremony (release check + handoff note + `NOW.md` advance + commit/push), exactly as Charts was built.

1. **Play domain + pure logic** *(backend — verifiable now)* — `apps/api/src/domain/play/`: strict Zod schemas for all six records + the section/cue/transport enums, and the pure `sequence.ts`/`timing.ts` (arrangement sequence resolution, cue resolution, beat↔time transform, optional key transpose). Unit tests for purity/determinism and flagged-unresolved behavior. No persistence, no I/O.
2. **Persistence contracts** *(backend)* — `packages/db/src/play-repository-contracts.ts`: tenant-scoped, Zod-validated persistence records + per-operation input schemas + read/write option guards + `PlayQueryPersistenceRepository`/`PlayCommandPersistenceRepository` interfaces. Contract tests (round-trip parse, strictness, actor-id requirement).
3. **Migration artifact** *(backend)* — `packages/db/src/play-migrations.ts`: `PlayInitialSchemaMigration` (six tables + indexes, all `CHECK`s) via `defineSqlMigrationArtifact`. Migration tests assert required tables/indexes, tenant-scoped table list, and up/down idempotency under the SQLite migration runner.
4. **SQLite adapter** *(backend)* — `packages/db/src/play-sql-repository.ts`: command + query SQL repositories over the executor, JSON (de)serialization for `track_refs_json`/`section_order`, tenant filtering on every statement. Recording-executor unit tests + a `node:sqlite` integration smoke.
5. **GraphQL + in-memory service** *(backend)* — `apps/api/src/domain/play/{contracts,errors}.ts`, `apps/api/src/services/play/in-memory.ts`, and `apps/api/src/graphql/play.ts` (SDL: 9 queries, 10 mutations) merged into the executable schema with `PlayDomainError → extensions.code` mapping. In-memory only. Resolver + service + schema-snapshot tests.
6. **Persistence-backed service** *(backend)* — `apps/api/src/services/play/{persistence,composition}.ts`: persistence-backed services delegating to slice-4 repos, plus the in-memory-vs-sql selection + `migratePlaySqliteSchema`. Drop-in behind the slice-5 resolvers; in-memory remains the test double. Parity tests + a `node:sqlite` integration test.
7. **Offline-sync queue** *(backend)* — `packages/db/src/play-local-sync-queue-repository-contracts.ts` (+ in-memory + SQL repos) and `PlayLocalSyncQueueMigration`: the non-destructive-op discriminated union (payloads reuse command inputs), entry record, status transitions, and the three replay indexes. Queue repository tests + migration test + a `node:sqlite` smoke.
8. **Replay decision + coordinator** *(backend)* — `packages/db/src/play-local-sync-queue-replay.ts` (pure decision: ordering/backoff/attempt-limit, injected `now`) and `apps/api/src/services/play/local-sync-queue-replay-coordinator.ts` (single-pass map-and-run with retryable/terminal classification). Pure-decision unit tests + coordinator tests with a fake command service (synced / requeued / terminal / exhausted paths).
9. **WebSocket events** *(backend)* — add `trackSet.updated` · `play.playbackStateChanged` · `play.cueFired` to the API event union with `.strict()` payloads + tenant/aggregate scope superRefines, emitted only after durable commits. Event-validation tests (scope mismatch rejected) + service wiring tests.
10. **Desktop Play replay runtime** *(backend-ish — verifiable now via Node, no UI)* — mirror the Presenter desktop sidecar (ADR 0005): `replay-pass` + `replay-scheduler` + `replay-error-classifier` + `runtime-bootstrap` + `sidecar-entry` for Play, running in a Node context on synchronous `node:sqlite`, engine/transport-agnostic via injected fetch/auth/connectivity. Bootstrap + scheduler + classifier tests with fakes.
11. **Desktop Play UI** *(UI — needs the desktop Play surface scaffold)* — the Tauri webview Play operator surface (track-set load, transport, cue list, pad selection, offline/queue status), talking to the Node sidecar (status + operator actions) rather than executing SQLite itself. Deferred behind the same scaffold/mobile decision flagged in `NOW.md`; not autonomously verifiable yet.
12. **Mobile Play (read-only) view** *(UI — needs the `apps/mobile` Expo scaffold)* — optional read-only rehearsal view of arrangement/cues for volunteers, behind the deferred `apps/mobile` scaffold decision.

**Backend, verifiable now:** slices 1–10. **UI, blocked on a scaffold decision:** slices 11 (desktop Play surface) and 12 (mobile), aligned with the existing Charts-mobile / desktop-shell deferral in `NOW.md`.

## Open questions / risks / decisions for the user
- **ASSUMPTION — Play's concrete v1 feature shape.** The vision/system-map define Play only as "tracks · arrangements · cues · pads · playback state." This plan assumes the v1 surface is the *durable model + offline fail-safe transport* (track sets, arrangements, sections, cues, pads, a resumable `PlaybackState`) and explicitly defers the **audio engine / sample playback**, **MIDI device I/O** (the `midi-bridge` package), and **stem/pad media storage** to later runtime/integration work. Confirm this scope split.
- **ASSUMPTION — `PlaybackState` is a coarse, resumable snapshot persisted via GraphQL, while the per-sample playhead stays ephemeral on the local desktop event bus.** This follows the system map ("local desktop event bus — high-frequency Play/Presenter sync") and keeps GraphQL/SQLite out of the hot path. Confirm the durable snapshot granularity (per-section + coarse `positionBeats`) is the right persistence boundary.
- **ASSUMPTION — media/stem/pad assets are opaque references** from a future media-storage boundary (same posture as Presenter `MediaCue`). The media-storage contract itself is out of scope here and is a separate upcoming decision.
- **ASSUMPTION — cue actions and transport are stored as *intent*, not realized by this domain.** `PlayCue.action` (play/stop/jump/pad-change/click-toggle) and `PlaybackState` describe what should happen; the audio engine and `midi-bridge` realize it later. Confirm the cue-action enum is sufficient for v1.
- **Confirmation-gate boundary.** Which Play transport actions count as "affecting routed/streamed output" and therefore require the human-confirm gate? This plan gates any action that starts playback into a routed/streamed output and keeps Play out of OBS scene control entirely; confirm the exact trigger set with the OBS-agent owner.
- **Risk — desktop Play surface is not the mobile scaffold.** Slice 11 needs the Tauri webview Play surface + Node sidecar supervision (start/stop, crash recovery) wired, which is a larger desktop-shell step (analogous to, but separate from, the deferred `apps/mobile` Expo scaffold). Recommend continuing backend-first (slices 1–10) and taking the desktop Play UI + sidecar supervision as a deliberate, user-approved step — consistent with the backend-first default already recorded in `NOW.md`.
- **Decision — module sequence.** `NOW.md` sequences Play before Community+ and OBS. This plan assumes Play backend slices 1–10 land first; the OBS-confirmation interplay (above) may warrant sketching the OBS-agent boundary before Play's stream-affecting transport is finalized.
