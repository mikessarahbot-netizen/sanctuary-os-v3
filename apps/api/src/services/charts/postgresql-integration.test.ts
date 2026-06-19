import { describe, expect, it } from "vitest";
import { z } from "zod";
import { Pool, type PoolClient, type QueryConfig } from "pg";
import {
  ChartsInitialSchemaMigration,
  CommunityInitialSchemaMigration,
  ObsInitialSchemaMigration,
  PlayInitialSchemaMigration,
  createPostgreSqlOperatorExecutor,
  type PlanningSqlExecutor,
  type PostgreSqlPlanningQueryConfig,
  type SqlMigrationArtifact
} from "@sanctuary-os/db";
import { createChartsPersistenceSelection } from "./composition.js";
import { createCommunityPersistenceSelection } from "../community/composition.js";
import { createObsPersistenceSelection } from "../obs/composition.js";
import { createPlayPersistenceSelection } from "../play/composition.js";
import type { AuthenticatedActor } from "../../auth/index.js";

/**
 * Live PostgreSQL (Supabase) integration smoke for the four operator modules'
 * persistence over `createPostgreSqlOperatorExecutor` (the `?` -> `$N` bridge), the
 * operator-module analog of `presenter/postgresql-integration.test.ts`.
 *
 * SKIPPED by default (so CI stays green with no database): it runs ONLY when
 * `SANCTUARY_OS_POSTGRES_URL` is set, which the parent supplies when pointing at a
 * real Supabase connection string. It creates an isolated test schema, applies all
 * four modules' migrations verbatim, drives a charts CRUD round-trip (save -> get ->
 * list) plus a save -> read for play / community / obs (proving every module's schema
 * + writes work on PostgreSQL), and drops the test schema in teardown.
 */

const SchemaNameSchema = z.string().regex(/^[a-z][a-z0-9_]{0,62}$/u);

const RawLivePostgreSqlIntegrationEnvSchema = z
  .object({
    databaseUrl: z.string().url().optional(),
    schemaName: SchemaNameSchema.optional()
  })
  .strict();

type LivePostgreSqlIntegrationConfig =
  | {
      readonly databaseUrl: string;
      readonly enabled: true;
      readonly schemaName: string;
    }
  | {
      readonly enabled: false;
      readonly skipReason: string;
    };

const parseLivePostgreSqlIntegrationConfig =
  (): LivePostgreSqlIntegrationConfig => {
    const env = RawLivePostgreSqlIntegrationEnvSchema.parse({
      databaseUrl: process.env.SANCTUARY_OS_POSTGRES_URL,
      schemaName: process.env.SANCTUARY_OS_CHARTS_POSTGRES_SCHEMA
    });

    if (env.databaseUrl === undefined) {
      return {
        enabled: false,
        skipReason:
          "Set SANCTUARY_OS_POSTGRES_URL to run the live operator-module PostgreSQL integration smoke test."
      };
    }

    return {
      databaseUrl: env.databaseUrl,
      enabled: true,
      schemaName:
        env.schemaName ?? `sanctuary_operator_live_${process.pid.toString(10)}`
    };
  };

const integrationConfig = parseLivePostgreSqlIntegrationConfig();
const liveIt = integrationConfig.enabled ? it : it.skip;

const OPERATOR_MIGRATIONS: readonly SqlMigrationArtifact[] = [
  ChartsInitialSchemaMigration,
  PlayInitialSchemaMigration,
  CommunityInitialSchemaMigration,
  ObsInitialSchemaMigration
];

const quoteIdentifier = (identifier: string): string => `"${identifier}"`;

const resetOperatorSchema = async (
  client: PoolClient,
  schemaName: string
): Promise<void> => {
  await client.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schemaName)} CASCADE`);
  await client.query(`CREATE SCHEMA ${quoteIdentifier(schemaName)}`);
  await client.query("SELECT set_config('search_path', $1, false)", [schemaName]);
  // The modules' DDL is ANSI/PostgreSQL-compatible and applied verbatim.
  for (const migration of OPERATOR_MIGRATIONS) {
    await client.query(migration.upSql);
  }
};

const liveActor: AuthenticatedActor = {
  actorId: "actor_operator_live_1",
  roles: ["super_admin", "church_admin", "worship_leader", "planner", "musician"],
  tenantId: "tenant_operator_live_1"
};

const CLOCK_VALUE = "2026-06-17T12:10:00.000Z";

describe("Operator modules PostgreSQL integration smoke", () => {
  it("documents the default skip behavior", () => {
    if (integrationConfig.enabled) {
      expect(SchemaNameSchema.parse(integrationConfig.schemaName)).toBe(
        integrationConfig.schemaName
      );
      return;
    }

    expect(integrationConfig.skipReason).toContain("SANCTUARY_OS_POSTGRES_URL");
  });

  liveIt(
    "round-trips operator-module persistence through the ?->$N PostgreSQL executor",
    async () => {
      if (!integrationConfig.enabled) {
        throw new Error("Live PostgreSQL integration config is disabled.");
      }

      const { databaseUrl, schemaName } = integrationConfig;
      // Pin search_path to the isolated test schema on every pooled connection so the
      // executor's statements resolve the operator tables regardless of connection.
      const pool = new Pool({
        connectionString: databaseUrl,
        max: 4,
        options: `-c search_path=${schemaName}`
      });
      let primaryClient: PoolClient | undefined;

      try {
        primaryClient = await pool.connect();
        await resetOperatorSchema(primaryClient, schemaName);

        const executor: PlanningSqlExecutor = createPostgreSqlOperatorExecutor({
          queryClient: {
            query: async (queryConfig: PostgreSqlPlanningQueryConfig) => {
              const config: QueryConfig<unknown[]> = {
                name: queryConfig.name ?? "",
                text: queryConfig.text,
                values: [...queryConfig.values]
              };

              return pool.query(config);
            }
          }
        });

        const clock = (): string => CLOCK_VALUE;
        const charts = createChartsPersistenceSelection(
          { mode: "sql" },
          { sql: { clock, executor } }
        ).servicesAdapter;
        const play = createPlayPersistenceSelection(
          { mode: "sql" },
          { sql: { clock, executor } }
        ).servicesAdapter;
        const community = createCommunityPersistenceSelection(
          { mode: "sql" },
          { sql: { clock, executor } }
        ).servicesAdapter;
        const obs = createObsPersistenceSelection(
          { mode: "sql" },
          { sql: { clock, executor } }
        ).servicesAdapter;

        // --- Charts CRUD round-trip: save -> get -> list ---
        const savedChart = await charts.commandService.saveChart({
          actor: liveActor,
          input: {
            chartId: "chart_operator_live_1",
            chordProSource: "{title: Live}\n[G]Live [C]chart",
            defaultKey: "G",
            songRef: "song_operator_live_1",
            title: "Live Chart"
          },
          requestId: "request_operator_live_save_chart"
        });

        expect(savedChart).toMatchObject({
          chartId: "chart_operator_live_1",
          chordProSource: "{title: Live}\n[G]Live [C]chart",
          defaultKey: "G",
          songRef: "song_operator_live_1",
          tenantId: liveActor.tenantId,
          title: "Live Chart"
        });

        await expect(
          charts.queryService.getChart({
            actor: liveActor,
            input: { chartId: "chart_operator_live_1" },
            requestId: "request_operator_live_get_chart"
          })
        ).resolves.toEqual(savedChart);

        await expect(
          charts.queryService.listCharts({
            actor: liveActor,
            input: {},
            requestId: "request_operator_live_list_charts"
          })
        ).resolves.toEqual([savedChart]);

        // --- Play: save arrangement -> read back via the arrangement query ---
        await play.commandService.savePlayArrangement({
          actor: liveActor,
          input: {
            arrangementRef: "arrangement_operator_live_1",
            defaultKey: "G",
            label: "Live Arrangement",
            sectionOrder: [],
            songRef: "song_operator_live_1",
            tempoBpm: 120
          },
          requestId: "request_operator_live_save_arrangement"
        });

        await expect(
          play.queryService.listPlayArrangements({
            actor: liveActor,
            input: { songRef: "song_operator_live_1" },
            requestId: "request_operator_live_list_arrangements"
          })
        ).resolves.toMatchObject([
          {
            arrangementRef: "arrangement_operator_live_1",
            songRef: "song_operator_live_1",
            tenantId: liveActor.tenantId
          }
        ]);

        // --- Community: save member -> read back via the member query ---
        await community.commandService.saveMember({
          actor: liveActor,
          input: {
            contactChannelRefs: [],
            customFieldValues: [],
            displayName: "Live Member",
            memberId: "member_operator_live_1",
            segmentRefs: [],
            status: "active"
          },
          requestId: "request_operator_live_save_member"
        });

        await expect(
          community.queryService.getMember({
            actor: liveActor,
            input: { memberId: "member_operator_live_1" },
            requestId: "request_operator_live_get_member"
          })
        ).resolves.toMatchObject({
          displayName: "Live Member",
          memberId: "member_operator_live_1",
          tenantId: liveActor.tenantId
        });

        // --- OBS: save connection profile -> read back via the profile query ---
        await obs.commandService.saveObsConnectionProfile({
          actor: liveActor,
          input: {
            connectionProfileId: "obs_profile_operator_live_1",
            connectionRef: "vault://obs/operator-live-1",
            label: "Live OBS"
          },
          requestId: "request_operator_live_save_obs_profile"
        });

        await expect(
          obs.queryService.listObsConnectionProfiles({
            actor: liveActor,
            input: {},
            requestId: "request_operator_live_list_obs_profiles"
          })
        ).resolves.toMatchObject([
          {
            connectionProfileId: "obs_profile_operator_live_1",
            label: "Live OBS",
            tenantId: liveActor.tenantId
          }
        ]);
      } finally {
        primaryClient?.release();
        await pool
          .query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schemaName)} CASCADE`)
          .catch((): void => undefined);
        await pool.end();
      }
    }
  );
});
