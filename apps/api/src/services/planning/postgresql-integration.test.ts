import { describe, expect, it } from "vitest";
import { z } from "zod";
import { Pool, type PoolClient } from "pg";
import {
  PlanningInitialSchemaMigration,
  type RepositoryMutationIntent,
  type RepositoryReadOptions,
  type RepositoryWriteOptions
} from "@sanctuary-os/db";
import { createPlanningPersistenceSelectionFromRuntimeConfig } from "./composition.js";

const SchemaNameSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,62}$/u);

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
      databaseUrl: process.env.SANCTUARY_OS_PLANNING_POSTGRES_URL,
      schemaName: process.env.SANCTUARY_OS_PLANNING_POSTGRES_SCHEMA
    });

    if (env.databaseUrl === undefined) {
      return {
        enabled: false,
        skipReason:
          "Set SANCTUARY_OS_PLANNING_POSTGRES_URL to run the live Planning PostgreSQL integration smoke test."
      };
    }

    return {
      databaseUrl: env.databaseUrl,
      enabled: true,
      schemaName:
        env.schemaName ?? `sanctuary_planning_live_${process.pid.toString(10)}`
    };
  };

const integrationConfig = parseLivePostgreSqlIntegrationConfig();
const liveIt = integrationConfig.enabled ? it : it.skip;

const quoteIdentifier = (identifier: string): string => `"${identifier}"`;

const resetPlanningSchema = async (
  client: PoolClient,
  schemaName: string
): Promise<void> => {
  await client.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schemaName)} CASCADE`);
  await client.query(`CREATE SCHEMA ${quoteIdentifier(schemaName)}`);
  await client.query("SELECT set_config('search_path', $1, false)", [schemaName]);
  await client.query(PlanningInitialSchemaMigration.upSql);
};

const usePlanningSchema = async (
  client: PoolClient,
  schemaName: string
): Promise<void> => {
  await client.query("SELECT set_config('search_path', $1, false)", [schemaName]);
};

const createIdFactory = (): {
  readonly assignmentId: () => string;
  readonly auditLogId: () => string;
  readonly ccliUsageLogId: () => string;
  readonly rehearsalAcknowledgementId: () => string;
  readonly rehearsalAssetVisibilityId: () => string;
  readonly serviceId: () => string;
  readonly serviceItemId: () => string;
} => {
  let nextId = 0;
  const next = (prefix: string): string => {
    nextId += 1;

    return `${prefix}_${nextId.toString(10)}`;
  };

  return {
    assignmentId: () => next("assignment_live"),
    auditLogId: () => next("audit_live"),
    ccliUsageLogId: () => next("ccli_live"),
    rehearsalAcknowledgementId: () => next("ack_live"),
    rehearsalAssetVisibilityId: () => next("visibility_live"),
    serviceId: () => next("service_live"),
    serviceItemId: () => next("item_live")
  };
};

const createReadOptions = (requestId: string): RepositoryReadOptions => ({
  context: {
    actorId: "actor_live_1",
    requestId,
    tenantId: "tenant_live_1"
  }
});

const createWriteOptions = (
  requestId: string,
  intent: RepositoryMutationIntent
): RepositoryWriteOptions => ({
  ...createReadOptions(requestId),
  intent
});

describe("Planning PostgreSQL integration smoke", () => {
  it("documents the default skip behavior", () => {
    if (integrationConfig.enabled) {
      const schemaName = integrationConfig.schemaName;

      expect(SchemaNameSchema.parse(schemaName)).toBe(schemaName);
      return;
    }

    expect(integrationConfig.skipReason).toContain(
      "SANCTUARY_OS_PLANNING_POSTGRES_URL"
    );
  });

  liveIt(
    "runs SQL-backed Planning persistence through API runtime composition",
    async () => {
      if (!integrationConfig.enabled) {
        throw new Error("Live PostgreSQL integration config is disabled.");
      }

      const pool = new Pool({
        connectionString: integrationConfig.databaseUrl,
        max: 4
      });
      let primaryClient: PoolClient | undefined;

      try {
        primaryClient = await pool.connect();
        await resetPlanningSchema(primaryClient, integrationConfig.schemaName);

        const selection = createPlanningPersistenceSelectionFromRuntimeConfig(
          {
            database: {
              connectionName: "planning-live-integration",
              runtime: "postgresql",
              urlEnvVar: "SANCTUARY_OS_PLANNING_POSTGRES_URL"
            },
            environment: "production"
          },
          {
            postgreSql: {
              clock: () => "2026-06-17T12:00:00.000Z",
              ids: createIdFactory(),
              queryClient: primaryClient,
              transactionId: () => "planning_live_tx",
              transactionPool: {
                connect: async (): Promise<PoolClient> => {
                  const transactionClient = await pool.connect();
                  await usePlanningSchema(
                    transactionClient,
                    integrationConfig.schemaName
                  );

                  return transactionClient;
                }
              }
            }
          }
        );

        const service = await selection.commandRepository.createService({
          input: {
            serviceTypeId: "sunday",
            startsAt: "2026-06-21T14:00:00.000Z",
            title: "Live PostgreSQL Worship"
          },
          options: createWriteOptions("request_live_create_service", "create")
        });
        const serviceItem = await selection.commandRepository.addServiceItem({
          input: {
            durationMinutes: 5,
            serviceId: service.serviceId,
            songId: "song_live_1",
            title: "Opening Song",
            type: "song"
          },
          options: createWriteOptions("request_live_add_item", "create")
        });
        const assignment = await selection.commandRepository.assignVolunteer({
          input: {
            personId: "person_live_1",
            roleId: "vocal",
            serviceId: service.serviceId
          },
          options: createWriteOptions("request_live_assign", "create")
        });
        const usageLog = await selection.ccliUsageRepository.recordCcliUsage({
          input: {
            ccliSongNumber: "123456",
            serviceId: service.serviceId,
            serviceItemId: serviceItem.serviceItemId,
            songId: "song_live_1",
            title: "Opening Song",
            usageType: "service",
            usedAt: "2026-06-21T14:05:00.000Z"
          },
          options: createWriteOptions("request_live_ccli", "create")
        });
        const visibility =
          await selection.rehearsalTrackingRepository.setRehearsalAssetVisibility({
            input: {
              assetId: "asset_chart_1",
              assetType: "chart",
              isVisible: true,
              serviceId: service.serviceId,
              serviceItemId: serviceItem.serviceItemId,
              title: "Opening Song Chart",
              updatedAt: "2026-06-17T12:00:00.000Z",
              visibleToRoleIds: ["vocal"]
            },
            options: createWriteOptions("request_live_visibility", "update")
          });
        const acknowledgement =
          await selection.rehearsalTrackingRepository.recordRehearsalAcknowledgement({
            input: {
              acknowledgedAt: "2026-06-18T12:00:00.000Z",
              assetId: visibility.assetId,
              assignmentId: assignment.assignmentId,
              personId: assignment.personId,
              readinessSignal: "ready",
              serviceId: service.serviceId,
              serviceItemId: serviceItem.serviceItemId
            },
            options: createWriteOptions("request_live_ack", "create")
          });
        const readiness = await selection.readinessRepository.saveServiceReadiness({
          input: {
            band: "ready",
            checks: [
              {
                code: "required-roles",
                label: "Required roles assigned",
                maxScore: 25,
                score: 25
              }
            ],
            readinessScore: 100,
            recommendedActions: [],
            risks: [],
            serviceId: service.serviceId,
            strengths: ["Required roles assigned is complete."],
            tenantId: service.tenantId
          },
          options: createWriteOptions("request_live_readiness", "update")
        });

        await expect(
          selection.queryRepository.getService({
            input: {
              serviceId: service.serviceId
            },
            options: createReadOptions("request_live_get_service")
          })
        ).resolves.toMatchObject({
          serviceId: service.serviceId,
          startsAt: "2026-06-21T14:00:00.000Z",
          tenantId: "tenant_live_1"
        });
        await expect(
          selection.ccliUsageRepository.listCcliUsageLogs({
            input: {
              serviceId: service.serviceId
            },
            options: createReadOptions("request_live_list_ccli")
          })
        ).resolves.toMatchObject([
          {
            ccliUsageLogId: usageLog.ccliUsageLogId,
            serviceItemId: serviceItem.serviceItemId
          }
        ]);
        await expect(
          selection.rehearsalTrackingRepository.listRehearsalAcknowledgements({
            input: {
              serviceId: service.serviceId
            },
            options: createReadOptions("request_live_list_ack")
          })
        ).resolves.toMatchObject([
          {
            rehearsalAcknowledgementId:
              acknowledgement.rehearsalAcknowledgementId,
            serviceItemId: serviceItem.serviceItemId
          }
        ]);
        await expect(
          selection.readinessRepository.getServiceReadiness({
            input: {
              serviceId: service.serviceId
            },
            options: createReadOptions("request_live_get_readiness")
          })
        ).resolves.toEqual(readiness);
      } finally {
        primaryClient?.release();
        await pool
          .query(
            `DROP SCHEMA IF EXISTS ${quoteIdentifier(
              integrationConfig.schemaName
            )} CASCADE`
          )
          .catch((): void => undefined);
        await pool.end();
      }
    }
  );
});
