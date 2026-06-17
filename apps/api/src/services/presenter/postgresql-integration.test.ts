import { describe, expect, it } from "vitest";
import { z } from "zod";
import { Pool, type PoolClient } from "pg";
import {
  PresenterInitialSchemaMigration,
  type PresenterOutputTargetPersistenceRecord,
  type PresenterPresentationPersistenceRecord,
  type PresenterSlidePersistenceRecord,
  type PresenterThemePersistenceRecord,
  type RepositoryMutationIntent,
  type RepositoryReadOptions,
  type RepositoryWriteOptions
} from "@sanctuary-os/db";
import { createPresenterPersistenceSelectionFromRuntimeConfig } from "./composition.js";

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
      databaseUrl: process.env.SANCTUARY_OS_PRESENTER_POSTGRES_URL,
      schemaName: process.env.SANCTUARY_OS_PRESENTER_POSTGRES_SCHEMA
    });

    if (env.databaseUrl === undefined) {
      return {
        enabled: false,
        skipReason:
          "Set SANCTUARY_OS_PRESENTER_POSTGRES_URL to run the live Presenter PostgreSQL integration smoke test."
      };
    }

    return {
      databaseUrl: env.databaseUrl,
      enabled: true,
      schemaName:
        env.schemaName ?? `sanctuary_presenter_live_${process.pid.toString(10)}`
    };
  };

const integrationConfig = parseLivePostgreSqlIntegrationConfig();
const liveIt = integrationConfig.enabled ? it : it.skip;

const quoteIdentifier = (identifier: string): string => `"${identifier}"`;

const resetPresenterSchema = async (
  client: PoolClient,
  schemaName: string
): Promise<void> => {
  await client.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schemaName)} CASCADE`);
  await client.query(`CREATE SCHEMA ${quoteIdentifier(schemaName)}`);
  await client.query("SELECT set_config('search_path', $1, false)", [schemaName]);
  await client.query(PresenterInitialSchemaMigration.upSql);
};

const usePresenterSchema = async (
  client: PoolClient,
  schemaName: string
): Promise<void> => {
  await client.query("SELECT set_config('search_path', $1, false)", [schemaName]);
};

const createIdFactory = (): {
  readonly auditLogId: () => string;
} => {
  let nextId = 0;

  return {
    auditLogId: (): string => {
      nextId += 1;

      return `presenter_audit_live_${nextId.toString(10)}`;
    }
  };
};

const createReadOptions = (requestId: string): RepositoryReadOptions => ({
  context: {
    actorId: "actor_presenter_live_1",
    requestId,
    tenantId: "tenant_presenter_live_1"
  }
});

const createWriteOptions = (
  requestId: string,
  intent: RepositoryMutationIntent
): RepositoryWriteOptions => ({
  ...createReadOptions(requestId),
  intent
});

const theme: PresenterThemePersistenceRecord = {
  colors: {
    background: "#101820",
    lowerThirdBackground: "#000000",
    lowerThirdText: "#ffffff",
    text: "#f7f7f2"
  },
  lowerThird: {
    maxLines: 2,
    placement: "bottom-center"
  },
  name: "Live Sunday Standard",
  spacing: {
    blockGap: 24,
    slidePadding: 72
  },
  tenantId: "tenant_presenter_live_1",
  themeId: "theme_presenter_live_1",
  typography: {
    baseFontSize: 48,
    bodyFontFamily: "Inter",
    headingFontFamily: "Inter Display",
    lineHeight: 1.2
  }
};

const welcomeSlide: PresenterSlidePersistenceRecord = {
  blocks: [
    {
      alignment: "center",
      blockId: "block_presenter_live_1",
      kind: "text",
      text: "Welcome",
      textStyle: "heading"
    }
  ],
  layout: "title",
  order: 0,
  presentationId: "presentation_presenter_live_1",
  slideId: "slide_presenter_live_1",
  tenantId: "tenant_presenter_live_1",
  title: "Welcome"
};

const messageSlide: PresenterSlidePersistenceRecord = {
  blocks: [
    {
      alignment: "center",
      blockId: "block_presenter_live_2",
      kind: "text",
      text: "Grace and peace",
      textStyle: "body"
    }
  ],
  layout: "content",
  order: 1,
  presentationId: "presentation_presenter_live_1",
  slideId: "slide_presenter_live_2",
  tenantId: "tenant_presenter_live_1",
  title: "Message"
};

const responseSlide: PresenterSlidePersistenceRecord = {
  blocks: [
    {
      alignment: "center",
      blockId: "block_presenter_live_3",
      kind: "text",
      text: "Response",
      textStyle: "heading"
    }
  ],
  layout: "content",
  order: 2,
  presentationId: "presentation_presenter_live_1",
  slideId: "slide_presenter_live_3",
  tenantId: "tenant_presenter_live_1",
  title: "Response"
};

const updatedResponseSlide: PresenterSlidePersistenceRecord = {
  ...responseSlide,
  blocks: [
    {
      alignment: "center",
      blockId: "block_presenter_live_3",
      kind: "text",
      text: "Prayer response",
      textStyle: "heading"
    }
  ],
  title: "Prayer Response"
};

const presentation: PresenterPresentationPersistenceRecord = {
  createdAt: "2026-06-17T12:00:00.000Z",
  mediaCues: [
    {
      label: "Welcome loop",
      mediaAssetRef: "media_asset_welcome_loop",
      mediaCueId: "media_cue_presenter_live_1",
      playbackHint: "loop",
      presentationId: "presentation_presenter_live_1",
      slideId: "slide_presenter_live_1",
      tenantId: "tenant_presenter_live_1"
    }
  ],
  presentationId: "presentation_presenter_live_1",
  serviceId: "service_presenter_live_1",
  slides: [welcomeSlide, messageSlide],
  tenantId: "tenant_presenter_live_1",
  theme,
  title: "Live Presenter Worship",
  updatedAt: "2026-06-17T12:05:00.000Z"
};

const outputTarget: PresenterOutputTargetPersistenceRecord = {
  confidenceOutputEnabled: false,
  displayName: "Main Projector",
  outputTargetId: "output_presenter_live_1",
  safeBlanked: true,
  targetKind: "main",
  tenantId: "tenant_presenter_live_1",
  windowRef: "display-main"
};

describe("Presenter PostgreSQL integration smoke", () => {
  it("documents the default skip behavior", () => {
    if (integrationConfig.enabled) {
      const schemaName = integrationConfig.schemaName;

      expect(SchemaNameSchema.parse(schemaName)).toBe(schemaName);
      return;
    }

    expect(integrationConfig.skipReason).toContain(
      "SANCTUARY_OS_PRESENTER_POSTGRES_URL"
    );
  });

  liveIt(
    "runs SQL-backed Presenter persistence through API runtime composition",
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
        await resetPresenterSchema(primaryClient, integrationConfig.schemaName);

        const selection = createPresenterPersistenceSelectionFromRuntimeConfig(
          {
            database: {
              connectionName: "presenter-live-integration",
              runtime: "postgresql",
              urlEnvVar: "SANCTUARY_OS_PRESENTER_POSTGRES_URL"
            },
            environment: "production"
          },
          {
            postgreSql: {
              clock: () => "2026-06-17T12:10:00.000Z",
              ids: createIdFactory(),
              queryClient: primaryClient,
              transactionId: () => "presenter_live_tx",
              transactionPool: {
                connect: async (): Promise<PoolClient> => {
                  const transactionClient = await pool.connect();
                  await usePresenterSchema(
                    transactionClient,
                    integrationConfig.schemaName
                  );

                  return transactionClient;
                }
              }
            }
          }
        );

        await expect(
          selection.commandRepository.savePresentation({
            input: presentation,
            options: createWriteOptions("request_presenter_live_save", "create")
          })
        ).resolves.toEqual(presentation);
        await expect(
          selection.queryRepository.getPresentation({
            input: {
              presentationId: presentation.presentationId
            },
            options: createReadOptions("request_presenter_live_get")
          })
        ).resolves.toEqual(presentation);
        await expect(
          selection.queryRepository.getPresentationForService({
            input: {
              serviceId: "service_presenter_live_1"
            },
            options: createReadOptions("request_presenter_live_get_service")
          })
        ).resolves.toMatchObject({
          presentationId: presentation.presentationId,
          serviceId: "service_presenter_live_1",
          tenantId: "tenant_presenter_live_1"
        });
        await expect(
          selection.queryRepository.listPresenterThemes({
            input: {
              filter: {
                query: "Sunday"
              }
            },
            options: createReadOptions("request_presenter_live_themes")
          })
        ).resolves.toEqual([theme]);

        await expect(
          selection.commandRepository.setOutputTarget({
            input: {
              outputTarget,
              presentationId: presentation.presentationId
            },
            options: createWriteOptions("request_presenter_live_output", "update")
          })
        ).resolves.toEqual(outputTarget);
        await expect(
          selection.queryRepository.listOutputTargets({
            input: {
              presentationId: presentation.presentationId
            },
            options: createReadOptions("request_presenter_live_targets")
          })
        ).resolves.toEqual([outputTarget]);

        await expect(
          selection.commandRepository.addSlide({
            input: {
              afterSlideId: welcomeSlide.slideId,
              presentationId: presentation.presentationId,
              slide: responseSlide
            },
            options: createWriteOptions("request_presenter_live_add_slide", "create")
          })
        ).resolves.toMatchObject({
          order: 1,
          slideId: responseSlide.slideId
        });
        await expect(
          selection.commandRepository.updateSlide({
            input: {
              presentationId: presentation.presentationId,
              slide: updatedResponseSlide
            },
            options: createWriteOptions(
              "request_presenter_live_update_slide",
              "update"
            )
          })
        ).resolves.toEqual(updatedResponseSlide);
        await expect(
          selection.commandRepository.reorderSlides({
            input: {
              orderedSlideIds: [
                welcomeSlide.slideId,
                messageSlide.slideId,
                responseSlide.slideId
              ],
              presentationId: presentation.presentationId
            },
            options: createWriteOptions(
              "request_presenter_live_reorder",
              "update"
            )
          })
        ).resolves.toMatchObject([
          {
            order: 0,
            slideId: welcomeSlide.slideId
          },
          {
            order: 1,
            slideId: messageSlide.slideId
          },
          {
            order: 2,
            slideId: responseSlide.slideId
          }
        ]);
        await expect(
          selection.commandRepository.removeSlide({
            input: {
              presentationId: presentation.presentationId,
              slideId: responseSlide.slideId
            },
            options: createWriteOptions(
              "request_presenter_live_remove",
              "destructive-confirmed"
            )
          })
        ).resolves.toMatchObject({
          presentationId: presentation.presentationId,
          slides: [
            {
              order: 0,
              slideId: welcomeSlide.slideId
            },
            {
              order: 1,
              slideId: messageSlide.slideId
            }
          ]
        });

        const auditResult = await primaryClient.query<{
          operation_name: string;
          tenant_id: string;
        }>(
          `
SELECT tenant_id, operation_name
FROM presenter_audit_log
ORDER BY audit_log_id
`.trim()
        );

        expect(auditResult.rows).toEqual([
          {
            operation_name: "savePresentation",
            tenant_id: "tenant_presenter_live_1"
          },
          {
            operation_name: "setOutputTarget",
            tenant_id: "tenant_presenter_live_1"
          },
          {
            operation_name: "addSlide",
            tenant_id: "tenant_presenter_live_1"
          },
          {
            operation_name: "updateSlide",
            tenant_id: "tenant_presenter_live_1"
          },
          {
            operation_name: "reorderSlides",
            tenant_id: "tenant_presenter_live_1"
          },
          {
            operation_name: "removeSlide",
            tenant_id: "tenant_presenter_live_1"
          }
        ]);
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
