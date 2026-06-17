import { describe, expect, it } from "vitest";
import {
  PlayInitialSchemaMigration,
  createPlayCommandSqlRepository,
  createPlayQuerySqlRepository,
  createSqliteExecutor,
  type PadLayerPersistenceRecord,
  type PlanningSqlRow,
  type PlaybackStatePersistenceRecord,
  type PlayArrangementPersistenceRecord,
  type PlayCuePersistenceRecord,
  type PlaySectionPersistenceRecord,
  type PlaySqlExecutor,
  type TrackSetPersistenceRecord
} from "./index.js";

const TENANT = "tenant_1";

const readOptions = {
  context: { actorId: "actor_1", requestId: "request_read", tenantId: TENANT }
} as const;

const writeOptions = {
  context: { actorId: "actor_1", requestId: "request_write", tenantId: TENANT },
  intent: "update"
} as const;

const trackSetRecord: TrackSetPersistenceRecord = {
  arrangementRef: "arrangement_1",
  createdAt: "2026-06-17T08:00:00.000Z",
  defaultKey: "G",
  schemaVersion: "play.v1",
  serviceRef: "service_1",
  songRef: "song_1",
  tempoBpm: 120,
  tenantId: TENANT,
  title: "Grace",
  trackRefs: [
    { label: "Click", muted: false, role: "click", trackRef: "media_click" },
    { muted: true, role: "stem", trackRef: "media_stem" }
  ],
  trackSetId: "track_set_1",
  updatedAt: "2026-06-17T08:00:00.000Z"
};

const arrangementRecord: PlayArrangementPersistenceRecord = {
  arrangementRef: "arrangement_1",
  defaultKey: "G",
  label: "Default",
  loopSectionRef: "section_1",
  sectionOrder: ["section_1", "section_2"],
  songRef: "song_1",
  tempoBpm: 120,
  tenantId: TENANT
};

const sectionRecord: PlaySectionPersistenceRecord = {
  arrangementRef: "arrangement_1",
  clickEnabledDefault: true,
  kind: "verse",
  label: "Verse 1",
  lengthBars: 8,
  padLayerRef: "pad_1",
  sectionId: "section_1",
  tenantId: TENANT
};

const secondSectionRecord: PlaySectionPersistenceRecord = {
  arrangementRef: "arrangement_1",
  clickEnabledDefault: false,
  kind: "chorus",
  lengthBars: 8,
  sectionId: "section_2",
  tenantId: TENANT
};

const cueRecord: PlayCuePersistenceRecord = {
  action: "jump",
  createdAt: "2026-06-17T08:00:00.000Z",
  cueId: "cue_1",
  fireMode: "manual",
  label: "To chorus",
  markerOffsetBeats: 16,
  sectionId: "section_1",
  targetSectionRef: "section_2",
  tenantId: TENANT,
  trackSetId: "track_set_1",
  updatedAt: "2026-06-17T08:00:00.000Z"
};

const padLayerRecord: PadLayerPersistenceRecord = {
  gain: 0.5,
  key: "G",
  label: "Warm pad",
  loop: true,
  padLayerRef: "pad_1",
  padMediaRef: "media_pad",
  sectionScopeRef: "section_1",
  songRef: "song_1",
  tenantId: TENANT,
  updatedAt: "2026-06-17T08:00:00.000Z"
};

const playbackStateRecord: PlaybackStatePersistenceRecord = {
  activePadLayerRef: "pad_1",
  activeSectionRef: "section_1",
  clickEnabled: true,
  positionBeats: 12.5,
  tenantId: TENANT,
  trackSetId: "track_set_1",
  transportStatus: "playing",
  updatedAt: "2026-06-17T08:00:00.000Z"
};

const trackSetRow: PlanningSqlRow = {
  arrangement_ref: "arrangement_1",
  created_at: "2026-06-17T08:00:00.000Z",
  default_key: "G",
  schema_version: "play.v1",
  service_id: "service_1",
  song_id: "song_1",
  tempo_bpm: 120,
  tenant_id: TENANT,
  title: "Grace",
  track_refs_json: JSON.stringify(trackSetRecord.trackRefs),
  track_set_id: "track_set_1",
  updated_at: "2026-06-17T08:00:00.000Z"
};

const padLayerRow: PlanningSqlRow = {
  gain: 0.5,
  label: "Warm pad",
  loop: 1,
  pad_key: "G",
  pad_layer_ref: "pad_1",
  pad_media_ref: "media_pad",
  section_scope_ref: "section_1",
  song_id: "song_1",
  tenant_id: TENANT,
  updated_at: "2026-06-17T08:00:00.000Z"
};

const playbackStateRow: PlanningSqlRow = {
  active_pad_layer_ref: "pad_1",
  active_section_ref: "section_1",
  click_enabled: 1,
  position_beats: 12.5,
  tenant_id: TENANT,
  track_set_id: "track_set_1",
  transport_status: "playing",
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

describe("Play SQL repository (recording executor)", () => {
  it("scopes getTrackSet by tenant and decodes track refs JSON", async () => {
    const { executor, statements } = createRecordingExecutor({
      "play.track_sets.get": [trackSetRow]
    });
    const repository = createPlayQuerySqlRepository({ executor });

    const trackSet = await repository.getTrackSet({
      input: { trackSetId: "track_set_1" },
      options: readOptions
    });

    expect(trackSet?.trackSetId).toBe("track_set_1");
    expect(trackSet?.tenantId).toBe(TENANT);
    expect(trackSet?.tempoBpm).toBe(120);
    expect(trackSet?.serviceRef).toBe("service_1");
    expect(trackSet?.trackRefs).toEqual(trackSetRecord.trackRefs);
    const [statement] = statements;
    expect(statement?.sql).toContain("WHERE tenant_id = ? AND track_set_id = ?");
    expect(statement?.parameters).toEqual([TENANT, "track_set_1"]);
  });

  it("returns null when getTrackSet matches no row", async () => {
    const { executor } = createRecordingExecutor({});
    const repository = createPlayQuerySqlRepository({ executor });

    expect(
      await repository.getTrackSet({ input: { trackSetId: "missing" }, options: readOptions })
    ).toBeNull();
  });

  it("passes the song filter to listTrackSets, repeating it for the null guard", async () => {
    const { executor, statements } = createRecordingExecutor({
      "play.track_sets.list": [trackSetRow]
    });
    const repository = createPlayQuerySqlRepository({ executor });

    const trackSets = await repository.listTrackSets({
      input: { filter: { songRef: "song_1" } },
      options: readOptions
    });

    expect(trackSets).toHaveLength(1);
    expect(statements[0]?.parameters).toEqual([TENANT, "song_1", "song_1"]);
  });

  it("lists every tenant track set when unfiltered", async () => {
    const { executor, statements } = createRecordingExecutor({ "play.track_sets.list": [] });
    const repository = createPlayQuerySqlRepository({ executor });

    await repository.listTrackSets({ input: {}, options: readOptions });

    expect(statements[0]?.parameters).toEqual([TENANT, null, null]);
  });

  it("scopes getPlayArrangement by tenant and decodes the section order JSON", async () => {
    const arrangementRow: PlanningSqlRow = {
      arrangement_ref: "arrangement_1",
      default_key: "G",
      label: "Default",
      loop_section_ref: "section_1",
      section_order: JSON.stringify(["section_1", "section_2"]),
      song_id: "song_1",
      tempo_bpm: 120,
      tenant_id: TENANT
    };
    const { executor, statements } = createRecordingExecutor({
      "play.arrangements.get": [arrangementRow]
    });
    const repository = createPlayQuerySqlRepository({ executor });

    const arrangement = await repository.getPlayArrangement({
      input: { arrangementRef: "arrangement_1" },
      options: readOptions
    });

    expect(arrangement?.arrangementRef).toBe("arrangement_1");
    expect(arrangement?.tenantId).toBe(TENANT);
    expect(arrangement?.sectionOrder).toEqual(["section_1", "section_2"]);
    expect(arrangement?.loopSectionRef).toBe("section_1");
    const [statement] = statements;
    expect(statement?.sql).toContain("WHERE tenant_id = ? AND arrangement_ref = ?");
    expect(statement?.parameters).toEqual([TENANT, "arrangement_1"]);
  });

  it("returns null when getPlayArrangement matches no row", async () => {
    const { executor } = createRecordingExecutor({});
    const repository = createPlayQuerySqlRepository({ executor });

    expect(
      await repository.getPlayArrangement({
        input: { arrangementRef: "missing" },
        options: readOptions
      })
    ).toBeNull();
  });

  it("maps a pad-layer row, renaming pad_key to key and decoding the loop flag", async () => {
    const { executor } = createRecordingExecutor({ "play.pad_layers.list": [padLayerRow] });
    const repository = createPlayQuerySqlRepository({ executor });

    const [padLayer] = await repository.listPadLayers({ input: {}, options: readOptions });

    expect(padLayer?.key).toBe("G");
    expect(padLayer?.loop).toBe(true);
    expect(padLayer?.gain).toBe(0.5);
    expect(padLayer?.songRef).toBe("song_1");
  });

  it("maps a playback-state row, decoding click flag and REAL position", async () => {
    const { executor } = createRecordingExecutor({
      "play.playback_state.get": [playbackStateRow]
    });
    const repository = createPlayQuerySqlRepository({ executor });

    const playbackState = await repository.getPlaybackState({
      input: { trackSetId: "track_set_1" },
      options: readOptions
    });

    expect(playbackState?.clickEnabled).toBe(true);
    expect(playbackState?.positionBeats).toBe(12.5);
    expect(playbackState?.transportStatus).toBe("playing");
  });

  it("upserts a track set with tenant-scoped parameters and serialized track refs", async () => {
    const { executor, statements } = createRecordingExecutor({});
    const repository = createPlayCommandSqlRepository({
      clock: () => "2026-06-17T09:00:00.000Z",
      executor
    });

    const saved = await repository.saveTrackSet({
      input: trackSetRecord,
      options: writeOptions
    });

    expect(saved).toEqual(trackSetRecord);
    expect(statements[0]?.name).toBe("play.track_sets.upsert");
    expect(statements[0]?.sql).toContain("ON CONFLICT (tenant_id, track_set_id) DO UPDATE");
    expect(statements[0]?.parameters[0]).toBe(TENANT);
    expect(statements[0]?.parameters[8]).toBe(JSON.stringify(trackSetRecord.trackRefs));
  });

  it("rejects a track set whose tenant differs from the operation tenant", async () => {
    const { executor } = createRecordingExecutor({});
    const repository = createPlayCommandSqlRepository({ clock: () => "t", executor });

    await expect(
      repository.saveTrackSet({
        input: { ...trackSetRecord, tenantId: "tenant_other" },
        options: writeOptions
      })
    ).rejects.toThrow("tenant must match");
  });

  it("rejects a pad layer whose tenant differs from the operation tenant", async () => {
    const { executor } = createRecordingExecutor({});
    const repository = createPlayCommandSqlRepository({ clock: () => "t", executor });

    await expect(
      repository.savePadLayer({
        input: { ...padLayerRecord, tenantId: "tenant_other" },
        options: writeOptions
      })
    ).rejects.toThrow("tenant must match");
  });

  it("serializes the section order when saving a play arrangement", async () => {
    const { executor, statements } = createRecordingExecutor({});
    const repository = createPlayCommandSqlRepository({ clock: () => "t", executor });

    await repository.savePlayArrangement({ input: arrangementRecord, options: writeOptions });

    expect(statements[0]?.name).toBe("play.arrangements.upsert");
    expect(statements[0]?.parameters[6]).toBe(JSON.stringify(arrangementRecord.sectionOrder));
  });

  it("encodes booleans as 0/1 when saving a play section", async () => {
    const { executor, statements } = createRecordingExecutor({});
    const repository = createPlayCommandSqlRepository({ clock: () => "t", executor });

    await repository.savePlaySection({ input: sectionRecord, options: writeOptions });

    const [statement] = statements;
    expect(statement?.name).toBe("play.sections.upsert");
    // tenant_id, section_id, arrangement_ref, kind, label, length_bars, click_enabled_default
    expect(statement?.parameters[6]).toBe(1);
  });

  it("updates the track-set members with the clock and maps the RETURNING row", async () => {
    const newRefs = [{ muted: false, role: "stem", trackRef: "media_new" }] as const;
    const updatedRow: PlanningSqlRow = {
      ...trackSetRow,
      track_refs_json: JSON.stringify(newRefs),
      updated_at: "2026-06-17T10:00:00.000Z"
    };
    const { executor, statements } = createRecordingExecutor({
      "play.track_sets.update_members": [updatedRow]
    });
    const repository = createPlayCommandSqlRepository({
      clock: () => "2026-06-17T10:00:00.000Z",
      executor
    });

    const trackSet = await repository.updateTrackSetMembers({
      input: { trackRefs: [...newRefs], trackSetId: "track_set_1" },
      options: writeOptions
    });

    expect(trackSet.trackRefs).toEqual(newRefs);
    expect(trackSet.updatedAt).toBe("2026-06-17T10:00:00.000Z");
    const [statement] = statements;
    expect(statement?.sql).toContain("RETURNING");
    expect(statement?.parameters).toEqual([
      JSON.stringify(newRefs),
      "2026-06-17T10:00:00.000Z",
      TENANT,
      "track_set_1"
    ]);
  });

  it("reorders play sections by updating the arrangement order and re-reading", async () => {
    const sectionRow = (sectionId: string): PlanningSqlRow => ({
      arrangement_ref: "arrangement_1",
      click_enabled_default: 1,
      kind: "verse",
      label: null,
      length_bars: 8,
      pad_layer_ref: null,
      section_id: sectionId,
      tenant_id: TENANT
    });
    const { executor, statements } = createRecordingExecutor({
      "play.sections.reorder": [sectionRow("section_2"), sectionRow("section_1")]
    });
    const repository = createPlayCommandSqlRepository({ clock: () => "t", executor });

    const sections = await repository.reorderPlaySections({
      input: { arrangementRef: "arrangement_1", orderedSectionIds: ["section_2", "section_1"] },
      options: writeOptions
    });

    expect(sections.map((section) => section.sectionId)).toEqual(["section_2", "section_1"]);
    expect(statements[0]?.name).toBe("play.arrangements.reorder_sections");
    expect(statements[0]?.sql).toContain("UPDATE play_arrangements SET section_order = ?");
    expect(statements[0]?.parameters).toEqual([
      JSON.stringify(["section_2", "section_1"]),
      TENANT,
      "arrangement_1"
    ]);
    expect(statements[1]?.sql).toContain("json_each(?)");
  });

  it("deletes a cue scoped by tenant, cue, and track set", async () => {
    const { executor, statements } = createRecordingExecutor({});
    const repository = createPlayCommandSqlRepository({ clock: () => "t", executor });

    await repository.removePlayCue({
      input: { cueId: "cue_1", trackSetId: "track_set_1" },
      options: writeOptions
    });

    const [statement] = statements;
    expect(statement?.sql).toContain("DELETE FROM play_cues");
    expect(statement?.parameters).toEqual([TENANT, "cue_1", "track_set_1"]);
  });

  it("upserts a playback-state row keyed one per track set", async () => {
    const { executor, statements } = createRecordingExecutor({});
    const repository = createPlayCommandSqlRepository({ clock: () => "t", executor });

    await repository.setPlaybackState({ input: playbackStateRecord, options: writeOptions });

    const [statement] = statements;
    expect(statement?.sql).toContain("ON CONFLICT (tenant_id, track_set_id) DO UPDATE");
    // click_enabled encoded as 1 (index 5)
    expect(statement?.parameters[5]).toBe(1);
  });
});

const loadNodeSqlite = async (): Promise<typeof import("node:sqlite") | undefined> => {
  try {
    return await import("node:sqlite");
  } catch {
    return undefined;
  }
};

const nodeSqlite = await loadNodeSqlite();
const liveIt = nodeSqlite === undefined ? it.skip : it;

describe("Play SQL repository smoke", () => {
  it("reports whether the in-process SQLite engine is available", () => {
    expect(nodeSqlite === undefined || typeof nodeSqlite.DatabaseSync === "function").toBe(true);
  });

  liveIt("persists and reads the Play graph via node:sqlite", async () => {
    if (nodeSqlite === undefined) {
      throw new Error("node:sqlite is unavailable.");
    }

    const database = new nodeSqlite.DatabaseSync(":memory:");

    try {
      database.exec(PlayInitialSchemaMigration.upSql);
      const executor = createSqliteExecutor({ database });
      const query = createPlayQuerySqlRepository({ executor });
      const command = createPlayCommandSqlRepository({
        clock: () => "2026-06-17T12:00:00.000Z",
        executor
      });

      await command.saveTrackSet({ input: trackSetRecord, options: writeOptions });
      const fetched = await query.getTrackSet({
        input: { trackSetId: "track_set_1" },
        options: readOptions
      });
      expect(fetched?.tempoBpm).toBe(120);
      expect(fetched?.trackRefs).toEqual(trackSetRecord.trackRefs);
      expect(fetched?.trackRefs[1]?.muted).toBe(true);

      await command.savePlayArrangement({ input: arrangementRecord, options: writeOptions });
      const arrangements = await query.listPlayArrangements({
        input: { songRef: "song_1" },
        options: readOptions
      });
      expect(arrangements).toHaveLength(1);
      expect(arrangements[0]?.sectionOrder).toEqual(["section_1", "section_2"]);
      expect(arrangements[0]?.loopSectionRef).toBe("section_1");

      await command.savePlaySection({ input: sectionRecord, options: writeOptions });
      await command.savePlaySection({ input: secondSectionRecord, options: writeOptions });
      const sections = await query.listPlaySections({
        input: { arrangementRef: "arrangement_1" },
        options: readOptions
      });
      expect(sections).toHaveLength(2);
      expect(sections[0]?.clickEnabledDefault).toBe(true);

      const reordered = await command.reorderPlaySections({
        input: {
          arrangementRef: "arrangement_1",
          orderedSectionIds: ["section_2", "section_1"]
        },
        options: writeOptions
      });
      expect(reordered.map((section) => section.sectionId)).toEqual([
        "section_2",
        "section_1"
      ]);

      await command.savePadLayer({ input: padLayerRecord, options: writeOptions });
      const padLayers = await query.listPadLayers({ input: {}, options: readOptions });
      expect(padLayers).toHaveLength(1);
      expect(padLayers[0]?.key).toBe("G");
      expect(padLayers[0]?.loop).toBe(true);

      await command.addPlayCue({ input: cueRecord, options: writeOptions });
      const cues = await query.listPlayCues({
        input: { trackSetId: "track_set_1" },
        options: readOptions
      });
      expect(cues).toHaveLength(1);
      expect(cues[0]?.action).toBe("jump");
      expect(cues[0]?.targetSectionRef).toBe("section_2");

      await command.removePlayCue({
        input: { cueId: "cue_1", trackSetId: "track_set_1" },
        options: writeOptions
      });
      const remainingCues = await query.listPlayCues({
        input: { trackSetId: "track_set_1" },
        options: readOptions
      });
      expect(remainingCues).toHaveLength(0);

      await command.setPlaybackState({ input: playbackStateRecord, options: writeOptions });
      const playbackState = await query.getPlaybackState({
        input: { trackSetId: "track_set_1" },
        options: readOptions
      });
      expect(playbackState?.clickEnabled).toBe(true);
      expect(playbackState?.positionBeats).toBe(12.5);
      expect(playbackState?.activeSectionRef).toBe("section_1");

      const updatedMembers = await command.updateTrackSetMembers({
        input: {
          trackRefs: [{ muted: false, role: "guide", trackRef: "media_guide" }],
          trackSetId: "track_set_1"
        },
        options: writeOptions
      });
      expect(updatedMembers.trackRefs).toEqual([
        { muted: false, role: "guide", trackRef: "media_guide" }
      ]);
      expect(updatedMembers.updatedAt).toBe("2026-06-17T12:00:00.000Z");

      const allTrackSets = await query.listTrackSets({ input: {}, options: readOptions });
      expect(allTrackSets).toHaveLength(1);
      const forSong = await query.listTrackSetsForSong({
        input: { songRef: "song_1" },
        options: readOptions
      });
      expect(forSong).toHaveLength(1);
    } finally {
      database.close();
    }
  });
});
