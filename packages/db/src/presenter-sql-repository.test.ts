import { describe, expect, it } from "vitest";
import {
  createPresenterCommandSqlRepository,
  createPresenterQuerySqlRepository,
  PresenterPresentationPersistenceRecordSchema,
  PresenterSlidePersistenceRecordSchema,
  type PlanningSqlExecutor,
  type PlanningSqlQueryResult,
  type PlanningSqlStatement,
  type PlanningSqlValue,
  type PresenterPersistenceReadOptions,
  type PresenterPersistenceWriteOptions,
  type PresenterPresentationPersistenceRecord
} from "./index.js";
import type { TransactionHandle } from "./index.js";

const fixedNow = "2026-06-17T01:00:00.000Z";

interface RecordingSqlExecutor extends PlanningSqlExecutor {
  readonly statements: readonly PlanningSqlStatement[];
  readonly transactions: readonly TransactionHandle[];
}

const createRecordingExecutor = (
  resultRows: readonly (
    | PlanningSqlQueryResult["rows"][number]
    | readonly PlanningSqlQueryResult["rows"][number][]
  )[]
): RecordingSqlExecutor => {
  const statements: PlanningSqlStatement[] = [];
  const transactions: TransactionHandle[] = [];
  const rowsByQuery = [...resultRows];

  return {
    get statements(): readonly PlanningSqlStatement[] {
      return statements;
    },
    get transactions(): readonly TransactionHandle[] {
      return transactions;
    },
    query: (statement): Promise<PlanningSqlQueryResult> => {
      statements.push(statement);

      if (nonReturningStatementNames.has(statement.name)) {
        return Promise.resolve({ rows: [] });
      }

      const rowOrRows = rowsByQuery.shift();

      if (rowOrRows === undefined) {
        return Promise.resolve({ rows: [] });
      }

      return Promise.resolve({
        rows: Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows]
      });
    },
    runInTransaction: async <Result>(
      operation: (transaction: TransactionHandle) => Promise<Result>
    ): Promise<Result> => {
      const transaction = { transactionId: `tx_${String(transactions.length + 1)}` };
      transactions.push(transaction);

      return operation(transaction);
    }
  };
};

const nonReturningStatementNames = new Set([
  "presenter.audit.insert",
  "presenter.media_cues.insert_saved",
  "presenter.output_targets.upsert",
  "presenter.presentations.replace_children",
  "presenter.presentations.upsert",
  "presenter.slide_blocks.insert_saved",
  "presenter.slide_blocks.replace",
  "presenter.slides.insert_saved",
  "presenter.slides.remove",
  "presenter.slides.update",
  "presenter.themes.upsert"
]);

const readOptions: PresenterPersistenceReadOptions = {
  context: {
    actorId: "actor_1",
    requestId: "request_read",
    tenantId: "tenant_1"
  }
};

const writeOptions: PresenterPersistenceWriteOptions = {
  context: {
    actorId: "actor_1",
    requestId: "request_write",
    tenantId: "tenant_1"
  },
  intent: "update"
};

const theme = {
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
  name: "Sunday Standard",
  spacing: {
    blockGap: 24,
    slidePadding: 72
  },
  tenantId: "tenant_1",
  themeId: "theme_1",
  typography: {
    baseFontSize: 48,
    bodyFontFamily: "Inter",
    headingFontFamily: "Inter Display",
    lineHeight: 1.2
  }
} as const;

const welcomeSlide = {
  blocks: [
    {
      alignment: "center",
      blockId: "block_1",
      kind: "text",
      text: "Welcome",
      textStyle: "heading"
    }
  ],
  layout: "title",
  order: 0,
  presentationId: "presentation_1",
  slideId: "slide_1",
  tenantId: "tenant_1",
  title: "Welcome"
} as const;

const parsedWelcomeSlide = PresenterSlidePersistenceRecordSchema.parse(welcomeSlide);

const messageSlide = {
  ...welcomeSlide,
  blocks: [
    {
      alignment: "center",
      blockId: "block_2",
      kind: "text",
      text: "Message",
      textStyle: "heading"
    }
  ],
  layout: "content",
  order: 1,
  slideId: "slide_2",
  title: "Message"
} as const;

const parsedMessageSlide = PresenterSlidePersistenceRecordSchema.parse(messageSlide);

const outputTarget = {
  confidenceOutputEnabled: false,
  displayName: "Main Projector",
  outputTargetId: "output_1",
  safeBlanked: true,
  targetKind: "main",
  tenantId: "tenant_1",
  windowRef: "display-main"
} as const;

const presentation: PresenterPresentationPersistenceRecord =
  PresenterPresentationPersistenceRecordSchema.parse({
    createdAt: "2026-06-21T14:00:00.000Z",
    mediaCues: [
      {
        label: "Welcome loop",
        mediaAssetRef: "asset_loop",
        mediaCueId: "cue_1",
        playbackHint: "loop",
        presentationId: "presentation_1",
        slideId: "slide_1",
        tenantId: "tenant_1"
      }
    ],
    presentationId: "presentation_1",
    serviceId: "service_1",
    slides: [parsedWelcomeSlide, parsedMessageSlide],
    tenantId: "tenant_1",
    theme,
    title: "Sunday Worship",
    updatedAt: "2026-06-21T14:05:00.000Z"
  });

const presentationRow = {
  created_at: presentation.createdAt,
  media_cues: presentation.mediaCues,
  presentation_id: presentation.presentationId,
  service_id: presentation.serviceId,
  slides: presentation.slides,
  tenant_id: presentation.tenantId,
  theme: presentation.theme,
  title: presentation.title,
  updated_at: presentation.updatedAt
};

const slideRow = {
  background_ref: null,
  blocks: welcomeSlide.blocks,
  layout: welcomeSlide.layout,
  notes: null,
  presentation_id: welcomeSlide.presentationId,
  service_item_id: null,
  slide_id: welcomeSlide.slideId,
  sort_order: welcomeSlide.order,
  tenant_id: welcomeSlide.tenantId,
  timing_hint_seconds: null,
  title: welcomeSlide.title
};

const createCommandRepository = (executor: PlanningSqlExecutor) => {
  let nextAuditId = 1;

  return createPresenterCommandSqlRepository({
    clock: () => fixedNow,
    executor,
    ids: {
      auditLogId: () => {
        const auditLogId = `audit_${String(nextAuditId)}`;
        nextAuditId += 1;
        return auditLogId;
      }
    }
  });
};

const statementAt = (
  executor: RecordingSqlExecutor,
  index: number
): PlanningSqlStatement => {
  const statement = executor.statements[index];
  expect(statement).toBeDefined();

  if (statement === undefined) {
    throw new Error(`Expected SQL statement at index ${String(index)}.`);
  }

  return statement;
};

const expectSqlContains = (statement: PlanningSqlStatement, expected: string): void => {
  expect(statement.sql.toLowerCase()).toContain(expected.toLowerCase());
};

const expectParameters = (
  statement: PlanningSqlStatement,
  expected: readonly PlanningSqlValue[]
): void => {
  expect(statement.parameters).toEqual(expected);
};

describe("Presenter SQL query repository", () => {
  it("lists saved presentations with tenant and service filters", async () => {
    const executor = createRecordingExecutor([[presentationRow]]);
    const repository = createPresenterQuerySqlRepository({ executor });

    await expect(
      repository.listPresentations({
        input: {
          filter: {
            serviceId: "service_1"
          }
        },
        options: readOptions
      })
    ).resolves.toEqual([presentation]);

    const statement = statementAt(executor, 0);
    expect(statement.name).toBe("presenter.presentations.list");
    expectSqlContains(statement, "FROM presenter_presentations presentation");
    expectSqlContains(statement, "WHERE presentation.tenant_id = $1");
    expectSqlContains(statement, "presentation.service_id = $2");
    expectParameters(statement, ["tenant_1", "service_1"]);
  });

  it("gets presentation aggregates and propagates read transactions", async () => {
    const executor = createRecordingExecutor([[presentationRow]]);
    const repository = createPresenterQuerySqlRepository({ executor });
    const transaction = { transactionId: "query_tx" };

    await expect(
      repository.getPresentation({
        input: {
          presentationId: "presentation_1"
        },
        options: {
          ...readOptions,
          transaction
        }
      })
    ).resolves.toEqual(presentation);

    const statement = statementAt(executor, 0);
    expect(statement.transaction).toEqual(transaction);
    expectSqlContains(statement, "jsonb_build_object");
    expectSqlContains(statement, "presenter_slide_blocks");
    expectSqlContains(statement, "presenter_media_cues");
    expectParameters(statement, ["tenant_1", "presentation_1"]);
  });

  it("lists themes and output targets without secret or OBS fields", async () => {
    const executor = createRecordingExecutor([
      [
        {
          colors: theme.colors,
          lower_third: theme.lowerThird,
          name: theme.name,
          spacing: theme.spacing,
          tenant_id: theme.tenantId,
          theme_id: theme.themeId,
          typography: theme.typography
        }
      ],
      [
        {
          confidence_output_enabled: outputTarget.confidenceOutputEnabled,
          display_name: outputTarget.displayName,
          output_target_id: outputTarget.outputTargetId,
          safe_blanked: outputTarget.safeBlanked,
          target_kind: outputTarget.targetKind,
          tenant_id: outputTarget.tenantId,
          window_ref: outputTarget.windowRef
        }
      ]
    ]);
    const repository = createPresenterQuerySqlRepository({ executor });

    await expect(
      repository.listPresenterThemes({
        input: {
          filter: {
            query: "Sunday"
          }
        },
        options: readOptions
      })
    ).resolves.toEqual([theme]);
    await expect(
      repository.listOutputTargets({
        input: {
          presentationId: "presentation_1"
        },
        options: readOptions
      })
    ).resolves.toEqual([outputTarget]);

    const themeStatement = statementAt(executor, 0);
    const outputStatement = statementAt(executor, 1);
    expectSqlContains(themeStatement, "FROM presenter_themes");
    expectSqlContains(themeStatement, "name ILIKE $2");
    expectSqlContains(outputStatement, "FROM presenter_output_targets");
    expectSqlContains(outputStatement, "presenter_presentation_output_targets");

    for (const statement of [themeStatement, outputStatement]) {
      expect(statement.sql).not.toContain("rawMediaPayload");
      expect(statement.sql.toLowerCase()).not.toContain("credential");
      expect(statement.sql.toLowerCase()).not.toContain("token");
      expect(statement.sql.toLowerCase()).not.toContain("obs");
    }
  });
});

describe("Presenter SQL command repository", () => {
  it("saves presentation aggregates with child rows and audit metadata in a transaction", async () => {
    const executor = createRecordingExecutor([]);
    const repository = createCommandRepository(executor);

    await expect(
      repository.savePresentation({
        input: presentation,
        options: {
          ...writeOptions,
          intent: "create"
        }
      })
    ).resolves.toEqual(presentation);

    expect(executor.transactions).toEqual([{ transactionId: "tx_1" }]);
    expect(executor.statements.map((statement) => statement.name)).toEqual([
      "presenter.themes.upsert",
      "presenter.presentations.upsert",
      "presenter.presentations.replace_children",
      "presenter.slides.insert_saved",
      "presenter.slide_blocks.insert_saved",
      "presenter.slides.insert_saved",
      "presenter.slide_blocks.insert_saved",
      "presenter.media_cues.insert_saved",
      "presenter.audit.insert"
    ]);

    const presentationUpsert = statementAt(executor, 1);
    const auditInsert = statementAt(executor, 8);
    expectSqlContains(presentationUpsert, "INSERT INTO presenter_presentations");
    expectSqlContains(presentationUpsert, "ON CONFLICT (tenant_id, presentation_id)");
    expect(auditInsert.transaction).toEqual({ transactionId: "tx_1" });
    expectParameters(auditInsert, [
      "tenant_1",
      "audit_1",
      "actor_1",
      "request_write",
      "savePresentation",
      "create",
      "presentation_1",
      null,
      fixedNow
    ]);
  });

  it("upserts output targets and links them to presentations with audit metadata", async () => {
    const executor = createRecordingExecutor([]);
    const repository = createCommandRepository(executor);

    await expect(
      repository.setOutputTarget({
        input: {
          outputTarget,
          presentationId: "presentation_1"
        },
        options: writeOptions
      })
    ).resolves.toEqual(outputTarget);

    expect(executor.statements).toHaveLength(2);
    const upsert = statementAt(executor, 0);
    const audit = statementAt(executor, 1);
    expectSqlContains(upsert, "INSERT INTO presenter_output_targets");
    expectSqlContains(upsert, "presenter_presentation_output_targets");
    expectSqlContains(upsert, "WHERE tenant_id = $1");
    expectParameters(upsert, [
      "tenant_1",
      "output_1",
      "Main Projector",
      "main",
      "display-main",
      true,
      false,
      fixedNow,
      "presentation_1"
    ]);
    expect(audit.parameters[4]).toBe("setOutputTarget");
    expect(audit.parameters[6]).toBe("presentation_1");
  });

  it("adds, reorders, updates, and removes slides with tenant predicates and audit rows", async () => {
    const executor = createRecordingExecutor([
      slideRow,
      [slideRow, { ...slideRow, slide_id: "slide_2", sort_order: 1 }],
      presentationRow
    ]);
    const repository = createCommandRepository(executor);

    await expect(
      repository.addSlide({
        input: {
          afterSlideId: "slide_0",
          presentationId: "presentation_1",
          slide: parsedWelcomeSlide
        },
        options: writeOptions
      })
    ).resolves.toEqual(parsedWelcomeSlide);
    await expect(
      repository.reorderSlides({
        input: {
          orderedSlideIds: ["slide_1", "slide_2"],
          presentationId: "presentation_1"
        },
        options: writeOptions
      })
    ).resolves.toHaveLength(2);
    await expect(
      repository.updateSlide({
        input: {
          presentationId: "presentation_1",
          slide: parsedWelcomeSlide
        },
        options: writeOptions
      })
    ).resolves.toEqual(parsedWelcomeSlide);
    await expect(
      repository.removeSlide({
        input: {
          presentationId: "presentation_1",
          slideId: "slide_2"
        },
        options: {
          ...writeOptions,
          intent: "destructive-confirmed"
        }
      })
    ).resolves.toEqual(presentation);

    const addStatement = statementAt(executor, 0);
    const reorderStatement = statementAt(executor, 2);
    const updateStatement = statementAt(executor, 4);
    const removeStatement = statementAt(executor, 7);
    expectSqlContains(addStatement, "WHERE tenant_id = $1");
    expectSqlContains(addStatement, "jsonb_array_elements($11::jsonb)");
    expectSqlContains(reorderStatement, "FROM unnest($3::text[]) WITH ORDINALITY");
    expectSqlContains(updateStatement, "UPDATE presenter_slides");
    expectSqlContains(removeStatement, "DELETE FROM presenter_slides");

    expect(executor.statements.filter((statement) => statement.name === "presenter.audit.insert")).toHaveLength(4);
  });

  it("validates operation scope and rejects out-of-scope payload fields before SQL", async () => {
    const executor = createRecordingExecutor([]);
    const repository = createCommandRepository(executor);

    await expect(
      repository.savePresenterTheme({
        input: {
          ...theme,
          tenantId: "tenant_2"
        },
        options: writeOptions
      })
    ).rejects.toThrow("Presenter theme tenant must match operation tenant.");

    const presentationWithSecret: unknown = {
      ...presentation,
      rawMediaPayload: "base64"
    };

    await expect(
      repository.savePresentation(
        {
          input: presentationWithSecret,
          options: writeOptions
        } as Parameters<typeof repository.savePresentation>[0]
      )
    ).rejects.toThrow("Unrecognized key");

    expect(executor.statements).toHaveLength(0);
  });
});
