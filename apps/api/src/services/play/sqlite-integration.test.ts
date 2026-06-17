import { describe, expect, it } from "vitest";
import {
  createSqliteExecutor,
  type SqliteBindValue,
  type SqliteMigrationDatabaseClient
} from "@sanctuary-os/db";
import type { AuthenticatedActor } from "../../auth/index.js";
import { createPlayPersistenceSelection, migratePlaySqliteSchema } from "./composition.js";

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

interface NodeSqliteStatementLike {
  readonly all: (
    ...parameters: readonly SqliteBindValue[]
  ) => readonly Record<string, unknown>[];
  readonly run: (...parameters: readonly SqliteBindValue[]) => {
    readonly changes: number | bigint;
    readonly lastInsertRowid: number | bigint;
  };
}

interface NodeSqliteDatabaseLike {
  readonly exec: (sql: string) => void;
  readonly prepare: (sql: string) => NodeSqliteStatementLike;
}

const wrapMigrationDatabase = (
  database: NodeSqliteDatabaseLike
): SqliteMigrationDatabaseClient => ({
  exec: (sql: string): void => {
    database.exec(sql);
  },
  prepare: (sql: string) => {
    const statement = database.prepare(sql);

    return {
      all: (...parameters) => statement.all(...parameters),
      run: (...parameters) => {
        const result = statement.run(...parameters);

        return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
      }
    };
  }
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

describe("Play persistence-backed service (node:sqlite integration)", () => {
  it("reports whether the in-process SQLite engine is available", () => {
    expect(nodeSqlite === undefined || typeof nodeSqlite.DatabaseSync === "function").toBe(
      true
    );
  });

  liveIt(
    "applies the Play migration and round-trips a service CRUD flow",
    async () => {
      if (nodeSqlite === undefined) {
        throw new Error("node:sqlite is unavailable.");
      }

      const database = new nodeSqlite.DatabaseSync(":memory:");

      try {
        const clock = (): string => "2026-06-17T12:00:00.000Z";
        const steps = await migratePlaySqliteSchema({
          clock,
          database: wrapMigrationDatabase(database)
        });

        expect(steps).toEqual([
          { migrationId: "202606170005_play_initial_schema", outcome: "applied" }
        ]);

        const selection = createPlayPersistenceSelection(
          { environment: "production" },
          {
            sql: {
              clock,
              executor: createSqliteExecutor({ database }),
              ids: {
                cueId: () => "cue_created",
                sectionId: () => "section_created",
                trackSetId: () => "track_set_created"
              }
            }
          }
        );
        expect(selection.mode).toBe("sql");
        const { commandService, queryService } = selection.servicesAdapter;

        // save track set (boolean + JSON track-ref members round-trip)
        const saved = await commandService.saveTrackSet({
          actor: leader,
          input: {
            defaultKey: "G",
            songRef: "song_1",
            tempoBpm: 120,
            title: "Amazing Grace",
            trackRefs: [
              { muted: false, role: "click", trackRef: "media_click" },
              { label: "Pad", muted: true, role: "pad", trackRef: "media_pad" }
            ]
          },
          requestId: "request_save"
        });
        expect(saved).toMatchObject({
          songRef: "song_1",
          tenantId: TENANT,
          title: "Amazing Grace",
          trackSetId: "track_set_created"
        });

        // get track set: JSON + boolean round-trips survive
        const fetched = await queryService.getTrackSet({
          actor: leader,
          input: { trackSetId: "track_set_created" },
          requestId: "request_get"
        });
        expect(fetched?.trackRefs).toEqual([
          { muted: false, role: "click", trackRef: "media_click" },
          { label: "Pad", muted: true, role: "pad", trackRef: "media_pad" }
        ]);

        // save arrangement
        await commandService.savePlayArrangement({
          actor: leader,
          input: {
            arrangementRef: "arrangement_1",
            defaultKey: "G",
            label: "Acoustic",
            loopSectionRef: "section_created",
            sectionOrder: ["section_created"],
            songRef: "song_1",
            tempoBpm: 120
          },
          requestId: "request_arrangement"
        });

        // save section bound to the arrangement
        const section = await commandService.savePlaySection({
          actor: leader,
          input: {
            arrangementRef: "arrangement_1",
            clickEnabledDefault: true,
            kind: "intro",
            label: "section_created",
            lengthBars: 4,
            sectionId: "section_created"
          },
          requestId: "request_section"
        });
        expect(section).toMatchObject({
          arrangementRef: "arrangement_1",
          clickEnabledDefault: true,
          kind: "intro",
          sectionId: "section_created"
        });

        // resolved sequence reflects the saved arrangement + section
        const resolved = await queryService.resolvePlaySequence({
          actor: leader,
          input: { arrangementRef: "arrangement_1" },
          requestId: "request_resolve"
        });
        expect(resolved?.entries).toMatchObject([
          { isLoopSection: true, sectionRef: "section_created", status: "resolved" }
        ]);

        // add a cue against the track set
        const cue = await commandService.addPlayCue({
          actor: leader,
          input: {
            action: "play",
            fireMode: "manual",
            label: "Start",
            markerOffsetBeats: 0,
            sectionId: "section_created",
            trackSetId: "track_set_created"
          },
          requestId: "request_cue"
        });
        expect(cue).toMatchObject({
          action: "play",
          cueId: "cue_created",
          trackSetId: "track_set_created"
        });

        // save a pad layer (gain REAL + loop boolean round-trip)
        await commandService.savePadLayer({
          actor: leader,
          input: {
            gain: 0.75,
            key: "G",
            loop: true,
            padLayerRef: "pad_1",
            padMediaRef: "media_pad",
            songRef: "song_1"
          },
          requestId: "request_pad"
        });
        const padLayers = await queryService.listPadLayers({
          actor: leader,
          input: { filter: { songRef: "song_1" } },
          requestId: "request_list_pads"
        });
        expect(padLayers).toMatchObject([{ gain: 0.75, loop: true, padLayerRef: "pad_1" }]);

        // set a resumable playback-state snapshot
        const playbackState = await commandService.setPlaybackState({
          actor: leader,
          input: {
            activeSectionRef: "section_created",
            clickEnabled: true,
            positionBeats: 4,
            transportStatus: "playing",
            trackSetId: "track_set_created"
          },
          requestId: "request_state"
        });
        expect(playbackState).toMatchObject({
          activeSectionRef: "section_created",
          clickEnabled: true,
          positionBeats: 4,
          transportStatus: "playing"
        });
        const persistedState = await queryService.getPlaybackState({
          actor: leader,
          input: { trackSetId: "track_set_created" },
          requestId: "request_get_state"
        });
        expect(persistedState).toMatchObject({ transportStatus: "playing" });

        // list cues reflects the round-trip
        const cues = await queryService.listPlayCues({
          actor: leader,
          input: { trackSetId: "track_set_created" },
          requestId: "request_list_cues"
        });
        expect(cues).toHaveLength(1);
        expect(cues[0]?.cueId).toBe("cue_created");

        // list track sets reflects the round-trip
        const all = await queryService.listTrackSets({
          actor: leader,
          input: {},
          requestId: "request_list"
        });
        expect(all).toHaveLength(1);
        expect(all[0]?.title).toBe("Amazing Grace");

        // tenant isolation: a foreign tenant sees nothing
        await expect(
          queryService.getTrackSet({
            actor: otherTenantLeader,
            input: { trackSetId: "track_set_created" },
            requestId: "request_cross_tenant"
          })
        ).resolves.toBeNull();
        await expect(
          queryService.listTrackSets({
            actor: otherTenantLeader,
            input: {},
            requestId: "request_cross_tenant_list"
          })
        ).resolves.toEqual([]);
      } finally {
        database.close();
      }
    }
  );

  liveIt("skips already-applied Play migrations on a second run", async () => {
    if (nodeSqlite === undefined) {
      throw new Error("node:sqlite is unavailable.");
    }

    const database = new nodeSqlite.DatabaseSync(":memory:");

    try {
      const clock = (): string => "2026-06-17T12:00:00.000Z";
      const migrationDatabase = wrapMigrationDatabase(database);
      await migratePlaySqliteSchema({ clock, database: migrationDatabase });

      await expect(
        migratePlaySqliteSchema({ clock, database: migrationDatabase })
      ).resolves.toEqual([
        { migrationId: "202606170005_play_initial_schema", outcome: "skipped" }
      ]);
    } finally {
      database.close();
    }
  });
});
