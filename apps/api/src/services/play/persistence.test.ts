import { describe, expect, it } from "vitest";
import type { PlanningSqlRow, PlaySqlExecutor } from "@sanctuary-os/db";
import {
  createPlayCommandSqlRepository,
  createPlayQuerySqlRepository
} from "@sanctuary-os/db";
import type { AuthenticatedActor } from "../../auth/index.js";
import {
  isPlayDomainError,
  type PlayDomainErrorCode
} from "../../domain/play/index.js";
import { createPersistenceBackedPlayServicesAdapter } from "./persistence.js";

const TENANT = "tenant_1";

const leader: AuthenticatedActor = {
  actorId: "leader_1",
  roles: ["worship_leader"],
  tenantId: TENANT
};

const otherTenantLeader: AuthenticatedActor = {
  actorId: "leader_other",
  roles: ["worship_leader"],
  tenantId: "tenant_2"
};

const viewer: AuthenticatedActor = {
  actorId: "viewer_1",
  roles: ["viewer"],
  tenantId: TENANT
};

const trackSetRow: PlanningSqlRow = {
  arrangement_ref: null,
  created_at: "2026-06-17T08:00:00.000Z",
  default_key: "G",
  schema_version: "play.v1",
  service_id: null,
  song_id: "song_1",
  tempo_bpm: 120,
  tenant_id: TENANT,
  title: "Amazing Grace",
  track_refs_json: JSON.stringify([
    { muted: false, role: "click", trackRef: "media_click" }
  ]),
  track_set_id: "track_set_1",
  updated_at: "2026-06-17T08:00:00.000Z"
};

const arrangementRow: PlanningSqlRow = {
  arrangement_ref: "arrangement_1",
  default_key: "G",
  label: "Acoustic",
  loop_section_ref: null,
  section_order: JSON.stringify(["section_intro", "section_verse"]),
  song_id: "song_1",
  tempo_bpm: 120,
  tenant_id: TENANT
};

const introSectionRow: PlanningSqlRow = {
  arrangement_ref: "arrangement_1",
  click_enabled_default: 1,
  kind: "intro",
  label: "section_intro",
  length_bars: 4,
  pad_layer_ref: null,
  section_id: "section_intro",
  tenant_id: TENANT
};

const cueRow: PlanningSqlRow = {
  action: "play",
  created_at: "2026-06-17T08:00:00.000Z",
  cue_id: "cue_1",
  fire_mode: "manual",
  label: "Start",
  marker_offset_beats: 0,
  pad_layer_ref: null,
  section_id: "section_intro",
  target_section_ref: null,
  tenant_id: TENANT,
  track_set_id: "track_set_1",
  updated_at: "2026-06-17T08:00:00.000Z"
};

interface RecordedStatement {
  readonly name: string;
  readonly parameters: readonly unknown[];
  readonly sql: string;
}

const createRecordingExecutor = (
  rowsByName: Readonly<Record<string, readonly PlanningSqlRow[]>>
): { readonly executor: PlaySqlExecutor; readonly statements: RecordedStatement[] } => {
  const statements: RecordedStatement[] = [];
  const executor: PlaySqlExecutor = {
    query: (statement) => {
      statements.push({
        name: statement.name,
        parameters: statement.parameters,
        sql: statement.sql
      });

      return Promise.resolve({ rows: rowsByName[statement.name] ?? [] });
    }
  };

  return { executor, statements };
};

const createAdapter = (
  rowsByName: Readonly<Record<string, readonly PlanningSqlRow[]>>,
  options: {
    readonly clock?: () => string;
    readonly cueId?: () => string;
    readonly sectionId?: () => string;
    readonly trackSetId?: () => string;
  } = {}
): {
  readonly adapter: ReturnType<typeof createPersistenceBackedPlayServicesAdapter>;
  readonly statements: RecordedStatement[];
} => {
  const { executor, statements } = createRecordingExecutor(rowsByName);
  const clock = options.clock ?? ((): string => "2026-06-17T09:00:00.000Z");
  const adapter = createPersistenceBackedPlayServicesAdapter({
    clock,
    commandRepository: createPlayCommandSqlRepository({ clock, executor }),
    ids: {
      ...(options.cueId !== undefined ? { cueId: options.cueId } : {}),
      ...(options.sectionId !== undefined ? { sectionId: options.sectionId } : {}),
      ...(options.trackSetId !== undefined ? { trackSetId: options.trackSetId } : {})
    },
    queryRepository: createPlayQuerySqlRepository({ executor })
  });

  return { adapter, statements };
};

const expectDomainErrorCode = async (
  operation: Promise<unknown>,
  code: PlayDomainErrorCode
): Promise<void> => {
  const error: unknown = await operation.then(
    () => undefined,
    (caught: unknown) => caught
  );

  expect(isPlayDomainError(error)).toBe(true);
  if (isPlayDomainError(error)) {
    expect(error.code).toBe(code);
  }
};

describe("createPersistenceBackedPlayServicesAdapter (recording executor)", () => {
  it("maps a persistence track-set row to a domain record on getTrackSet", async () => {
    const { adapter, statements } = createAdapter({
      "play.track_sets.get": [trackSetRow]
    });

    const trackSet = await adapter.queryService.getTrackSet({
      actor: leader,
      input: { trackSetId: "track_set_1" },
      requestId: "request_get"
    });

    expect(trackSet).toMatchObject({
      defaultKey: "G",
      songRef: "song_1",
      tenantId: TENANT,
      title: "Amazing Grace",
      trackSetId: "track_set_1"
    });
    expect(trackSet?.trackRefs).toEqual([
      { muted: false, role: "click", trackRef: "media_click" }
    ]);
    // The persistence-only schemaVersion field is dropped from the domain record.
    expect(trackSet === null || "schemaVersion" in trackSet).toBe(false);
    expect(statements[0]?.name).toBe("play.track_sets.get");
    expect(statements[0]?.parameters).toEqual([TENANT, "track_set_1"]);
  });

  it("returns null for a cross-tenant getTrackSet without leaking the row", async () => {
    const { adapter } = createAdapter({ "play.track_sets.get": [trackSetRow] });

    await expect(
      adapter.queryService.getTrackSet({
        actor: otherTenantLeader,
        input: { trackSetId: "track_set_1" },
        requestId: "request_cross_tenant"
      })
    ).resolves.toBeNull();
  });

  it("derives the persistence schemaVersion and tenant when saving a track set", async () => {
    const { adapter, statements } = createAdapter(
      {},
      { trackSetId: () => "track_set_created" }
    );

    const trackSet = await adapter.commandService.saveTrackSet({
      actor: leader,
      input: {
        defaultKey: "A",
        songRef: "song_created",
        tempoBpm: 132,
        title: "New Set",
        trackRefs: [{ muted: false, role: "guide", trackRef: "media_guide" }]
      },
      requestId: "request_save"
    });

    expect(trackSet).toMatchObject({
      defaultKey: "A",
      songRef: "song_created",
      tenantId: TENANT,
      title: "New Set",
      trackSetId: "track_set_created"
    });
    const upsert = statements.find(
      (statement) => statement.name === "play.track_sets.upsert"
    );
    expect(upsert?.parameters).toEqual([
      TENANT,
      "track_set_created",
      "song_created",
      null,
      null,
      "New Set",
      "A",
      132,
      JSON.stringify([{ muted: false, role: "guide", trackRef: "media_guide" }]),
      "play.v1",
      "2026-06-17T09:00:00.000Z",
      "2026-06-17T09:00:00.000Z"
    ]);
  });

  it("requires the track set to exist before updating its members", async () => {
    const { adapter } = createAdapter({ "play.track_sets.get": [] });

    await expectDomainErrorCode(
      adapter.commandService.updateTrackSetMembers({
        actor: leader,
        input: {
          trackRefs: [{ muted: false, role: "guide", trackRef: "media_guide" }],
          trackSetId: "track_set_missing"
        },
        requestId: "request_missing"
      }),
      "TRACK_SET_NOT_FOUND"
    );
  });

  it("maps the RETURNING row from updateTrackSetMembers back to a domain record", async () => {
    const { adapter, statements } = createAdapter({
      "play.track_sets.get": [trackSetRow],
      "play.track_sets.update_members": [
        {
          ...trackSetRow,
          track_refs_json: JSON.stringify([
            { muted: false, role: "click", trackRef: "media_click" },
            { muted: true, role: "stem", trackRef: "media_stem" }
          ]),
          updated_at: "2026-06-17T10:00:00.000Z"
        }
      ]
    });

    const trackSet = await adapter.commandService.updateTrackSetMembers({
      actor: leader,
      input: {
        trackRefs: [
          { muted: false, role: "click", trackRef: "media_click" },
          { muted: true, role: "stem", trackRef: "media_stem" }
        ],
        trackSetId: "track_set_1"
      },
      requestId: "request_update_members"
    });

    expect(trackSet.trackRefs).toHaveLength(2);
    expect(trackSet.updatedAt).toBe("2026-06-17T10:00:00.000Z");
    expect(
      statements.some((statement) => statement.name === "play.track_sets.update_members")
    ).toBe(true);
  });

  it("throws ARRANGEMENT_NOT_FOUND when saving a section for an unknown arrangement", async () => {
    const { adapter } = createAdapter({ "play.arrangements.get": [] });

    await expectDomainErrorCode(
      adapter.commandService.savePlaySection({
        actor: leader,
        input: {
          arrangementRef: "arrangement_missing",
          clickEnabledDefault: true,
          kind: "intro",
          lengthBars: 4
        },
        requestId: "request_section_missing"
      }),
      "ARRANGEMENT_NOT_FOUND"
    );
  });

  it("saves a section against an existing arrangement with a generated id", async () => {
    const { adapter, statements } = createAdapter(
      { "play.arrangements.get": [arrangementRow] },
      { sectionId: () => "section_generated" }
    );

    const section = await adapter.commandService.savePlaySection({
      actor: leader,
      input: {
        arrangementRef: "arrangement_1",
        clickEnabledDefault: false,
        kind: "chorus",
        lengthBars: 8
      },
      requestId: "request_save_section"
    });

    expect(section).toMatchObject({
      arrangementRef: "arrangement_1",
      kind: "chorus",
      sectionId: "section_generated"
    });
    const upsert = statements.find(
      (statement) => statement.name === "play.sections.upsert"
    );
    expect(upsert?.parameters).toEqual([
      TENANT,
      "section_generated",
      "arrangement_1",
      "chorus",
      null,
      8,
      0,
      null
    ]);
  });

  it("throws SECTION_NOT_FOUND when reordering with an unknown section id", async () => {
    const { adapter } = createAdapter({
      "play.arrangements.get": [arrangementRow],
      "play.sections.list": [introSectionRow]
    });

    await expectDomainErrorCode(
      adapter.commandService.reorderPlaySections({
        actor: leader,
        input: {
          arrangementRef: "arrangement_1",
          orderedSectionIds: ["section_intro", "section_unknown"]
        },
        requestId: "request_reorder_missing"
      }),
      "SECTION_NOT_FOUND"
    );
  });

  it("requires an existing cue scoped to the track set before updating it", async () => {
    const { adapter } = createAdapter({
      "play.track_sets.get": [trackSetRow],
      "play.cues.list": []
    });

    await expectDomainErrorCode(
      adapter.commandService.updatePlayCue({
        actor: leader,
        input: {
          action: "stop",
          cueId: "cue_missing",
          fireMode: "auto",
          label: "Stop",
          markerOffsetBeats: 16,
          sectionId: "section_intro",
          trackSetId: "track_set_1"
        },
        requestId: "request_update_missing"
      }),
      "CUE_NOT_FOUND"
    );
  });

  it("throws CUE_NOT_FOUND when removing a cue the track set does not own", async () => {
    const { adapter } = createAdapter({ "play.cues.list": [] });

    await expectDomainErrorCode(
      adapter.commandService.removePlayCue({
        actor: leader,
        input: {
          confirmationIntent: { confirmed: true, reason: "cleanup" },
          cueId: "cue_missing",
          trackSetId: "track_set_1"
        },
        requestId: "request_remove_missing"
      }),
      "CUE_NOT_FOUND"
    );
  });

  it("requires an explicit confirmation intent to remove a cue", async () => {
    const { adapter, statements } = createAdapter({ "play.cues.list": [cueRow] });

    await expect(
      adapter.commandService.removePlayCue({
        actor: leader,
        input: {
          confirmationIntent: { confirmed: false, reason: "Oops" },
          cueId: "cue_1",
          trackSetId: "track_set_1"
        },
        requestId: "request_remove_unconfirmed"
      } as unknown as Parameters<typeof adapter.commandService.removePlayCue>[0])
    ).rejects.toThrow();

    expect(statements.some((statement) => statement.name === "play.cues.remove")).toBe(
      false
    );
  });

  it("deletes a confirmed cue with destructive intent after the ownership check", async () => {
    const { adapter, statements } = createAdapter({ "play.cues.list": [cueRow] });

    await expect(
      adapter.commandService.removePlayCue({
        actor: leader,
        input: {
          confirmationIntent: { confirmed: true, reason: "No longer needed" },
          cueId: "cue_1",
          trackSetId: "track_set_1"
        },
        requestId: "request_remove_cue"
      })
    ).resolves.toBeUndefined();

    const remove = statements.find((statement) => statement.name === "play.cues.remove");
    expect(remove?.parameters).toEqual([TENANT, "cue_1", "track_set_1"]);
  });

  it("lists the track set's cues scoped to the tenant and maps them", async () => {
    const { adapter, statements } = createAdapter({ "play.cues.list": [cueRow] });

    const cues = await adapter.queryService.listPlayCues({
      actor: leader,
      input: { trackSetId: "track_set_1" },
      requestId: "request_list_cues"
    });

    expect(cues).toHaveLength(1);
    expect(cues[0]).toMatchObject({
      action: "play",
      cueId: "cue_1",
      trackSetId: "track_set_1"
    });
    expect(statements[0]?.parameters).toEqual([TENANT, "track_set_1"]);
  });

  it("resolves the play sequence for an arrangement and flags unresolved entries", async () => {
    const { adapter } = createAdapter({
      "play.arrangements.get": [arrangementRow],
      "play.sections.list": [introSectionRow]
    });

    const resolved = await adapter.queryService.resolvePlaySequence({
      actor: leader,
      input: { arrangementRef: "arrangement_1" },
      requestId: "request_resolve"
    });

    expect(resolved?.entries).toMatchObject([
      { sectionRef: "section_intro", status: "resolved" },
      { sectionRef: "section_verse", status: "unresolved" }
    ]);
  });

  it("returns null when resolving a play sequence for an unknown arrangement", async () => {
    const { adapter } = createAdapter({ "play.arrangements.get": [] });

    await expect(
      adapter.queryService.resolvePlaySequence({
        actor: leader,
        input: { arrangementRef: "arrangement_missing" },
        requestId: "request_resolve_missing"
      })
    ).resolves.toBeNull();
  });

  it("rejects viewer mutations in the service layer", async () => {
    const { adapter } = createAdapter({ "play.track_sets.get": [trackSetRow] });

    await expectDomainErrorCode(
      adapter.commandService.updateTrackSetMembers({
        actor: viewer,
        input: {
          trackRefs: [{ muted: false, role: "guide", trackRef: "media_guide" }],
          trackSetId: "track_set_1"
        },
        requestId: "request_viewer_write"
      }),
      "AUTHORIZATION_FAILED"
    );
  });
});
