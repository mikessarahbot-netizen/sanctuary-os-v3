import { z } from "zod";
import {
  AppendObsActionLogEntryPersistenceOperationSchema,
  GetObsActionIntentPersistenceOperationSchema,
  GetObsConnectionProfilePersistenceOperationSchema,
  GetObsRecordingStatePersistenceOperationSchema,
  GetObsSceneItemPersistenceOperationSchema,
  GetObsScenePersistenceOperationSchema,
  GetObsSourcePersistenceOperationSchema,
  GetObsStreamStatePersistenceOperationSchema,
  ListObsActionIntentsPersistenceOperationSchema,
  ListObsActionLogPersistenceOperationSchema,
  ListObsConnectionProfilesPersistenceOperationSchema,
  ListObsSceneItemsPersistenceOperationSchema,
  ListObsScenesPersistenceOperationSchema,
  ListObsSourcesPersistenceOperationSchema,
  ObsActionConfirmationPersistenceSchema,
  ObsActionIntentPersistenceRecordSchema,
  ObsActionLogEntryPersistenceRecordSchema,
  ObsConnectionProfilePersistenceRecordSchema,
  ObsRecordingStatePersistenceRecordSchema,
  ObsSceneItemPersistenceRecordSchema,
  ObsScenePersistenceRecordSchema,
  ObsSourcePersistenceRecordSchema,
  ObsStreamStatePersistenceRecordSchema,
  ReplaceObsCatalogSnapshotPersistenceOperationSchema,
  SaveObsActionIntentPersistenceOperationSchema,
  SetObsActionIntentStatusPersistenceOperationSchema,
  SetObsRecordingStatePersistenceOperationSchema,
  SetObsStreamStatePersistenceOperationSchema,
  UpsertObsConnectionProfilePersistenceOperationSchema,
  UpsertObsSceneItemPersistenceOperationSchema,
  UpsertObsScenePersistenceOperationSchema,
  UpsertObsSourcePersistenceOperationSchema,
  type ObsActionConfirmationPersistence,
  type ObsActionIntentPersistenceRecord,
  type ObsActionLogEntryPersistenceRecord,
  type ObsCommandPersistenceRepository,
  type ObsConnectionProfilePersistenceRecord,
  type ObsQueryPersistenceRepository,
  type ObsRecordingStatePersistenceRecord,
  type ObsSceneItemPersistenceRecord,
  type ObsScenePersistenceRecord,
  type ObsSourcePersistenceRecord,
  type ObsStreamStatePersistenceRecord
} from "./obs-repository-contracts.js";
import type {
  PlanningSqlExecutor,
  PlanningSqlRow
} from "./planning-command-sql-repository.js";
import type { TransactionHandle } from "./transactions.js";

type ListObsConnectionProfilesPersistenceOperation = z.infer<
  typeof ListObsConnectionProfilesPersistenceOperationSchema
>;
type GetObsConnectionProfilePersistenceOperation = z.infer<
  typeof GetObsConnectionProfilePersistenceOperationSchema
>;
type ListObsScenesPersistenceOperation = z.infer<
  typeof ListObsScenesPersistenceOperationSchema
>;
type GetObsScenePersistenceOperation = z.infer<
  typeof GetObsScenePersistenceOperationSchema
>;
type ListObsSourcesPersistenceOperation = z.infer<
  typeof ListObsSourcesPersistenceOperationSchema
>;
type GetObsSourcePersistenceOperation = z.infer<
  typeof GetObsSourcePersistenceOperationSchema
>;
type ListObsSceneItemsPersistenceOperation = z.infer<
  typeof ListObsSceneItemsPersistenceOperationSchema
>;
type GetObsSceneItemPersistenceOperation = z.infer<
  typeof GetObsSceneItemPersistenceOperationSchema
>;
type GetObsStreamStatePersistenceOperation = z.infer<
  typeof GetObsStreamStatePersistenceOperationSchema
>;
type GetObsRecordingStatePersistenceOperation = z.infer<
  typeof GetObsRecordingStatePersistenceOperationSchema
>;
type ListObsActionIntentsPersistenceOperation = z.infer<
  typeof ListObsActionIntentsPersistenceOperationSchema
>;
type GetObsActionIntentPersistenceOperation = z.infer<
  typeof GetObsActionIntentPersistenceOperationSchema
>;
type ListObsActionLogPersistenceOperation = z.infer<
  typeof ListObsActionLogPersistenceOperationSchema
>;
type UpsertObsConnectionProfilePersistenceOperation = z.infer<
  typeof UpsertObsConnectionProfilePersistenceOperationSchema
>;
type UpsertObsScenePersistenceOperation = z.infer<
  typeof UpsertObsScenePersistenceOperationSchema
>;
type UpsertObsSourcePersistenceOperation = z.infer<
  typeof UpsertObsSourcePersistenceOperationSchema
>;
type UpsertObsSceneItemPersistenceOperation = z.infer<
  typeof UpsertObsSceneItemPersistenceOperationSchema
>;
type ReplaceObsCatalogSnapshotPersistenceOperation = z.infer<
  typeof ReplaceObsCatalogSnapshotPersistenceOperationSchema
>;
type SetObsStreamStatePersistenceOperation = z.infer<
  typeof SetObsStreamStatePersistenceOperationSchema
>;
type SetObsRecordingStatePersistenceOperation = z.infer<
  typeof SetObsRecordingStatePersistenceOperationSchema
>;
type SaveObsActionIntentPersistenceOperation = z.infer<
  typeof SaveObsActionIntentPersistenceOperationSchema
>;
type SetObsActionIntentStatusPersistenceOperation = z.infer<
  typeof SetObsActionIntentStatusPersistenceOperationSchema
>;
type AppendObsActionLogEntryPersistenceOperation = z.infer<
  typeof AppendObsActionLogEntryPersistenceOperationSchema
>;

export type ObsSqlExecutor = Pick<PlanningSqlExecutor, "query">;

export interface ObsQuerySqlRepositoryDependencies {
  readonly executor: ObsSqlExecutor;
}

export interface ObsCommandSqlRepositoryDependencies {
  readonly clock: () => string;
  readonly executor: ObsSqlExecutor;
}

const optionalTransaction = (
  transaction: TransactionHandle | undefined
): { readonly transaction?: TransactionHandle } =>
  transaction === undefined ? {} : { transaction };

const optionalText = (value: string | undefined): string | null => value ?? null;

const optionalBooleanFlag = (value: boolean | undefined): number | null =>
  value === undefined ? null : value ? 1 : 0;

/**
 * Rebuild the flattened confirmation columns into the record's confirmation
 * object, mirroring Community+ `decodeConfirmation`: the object exists only when
 * `confirmed = 1`; an unconfirmed intent simply omits `confirmation`.
 */
const decodeConfirmation = (
  row: Readonly<{
    confirmed: number;
    confirmed_at?: string | null | undefined;
    confirmed_by_ref?: string | null | undefined;
    confirmation_reason?: string | null | undefined;
  }>
): ObsActionConfirmationPersistence | undefined => {
  if (row.confirmed === 0) {
    return undefined;
  }

  return ObsActionConfirmationPersistenceSchema.parse({
    confirmed: true,
    confirmedAt: row.confirmed_at,
    confirmedByRef: row.confirmed_by_ref,
    reason: row.confirmation_reason
  });
};

const ObsConnectionProfileSqlRowSchema = z
  .object({
    connection_profile_id: z.string().min(1),
    connection_ref: z.string().min(1),
    connection_status: z.string().min(1),
    created_at: z.string().datetime({ offset: true }),
    label: z.string().min(1),
    last_seen_at: z.string().min(1).nullable().optional(),
    obs_websocket_version: z.string().min(1).nullable().optional(),
    schema_version: z.string().min(1),
    tenant_id: z.string().min(1),
    updated_at: z.string().datetime({ offset: true })
  })
  .strict()
  .transform((row): ObsConnectionProfilePersistenceRecord =>
    ObsConnectionProfilePersistenceRecordSchema.parse({
      connectionProfileId: row.connection_profile_id,
      connectionRef: row.connection_ref,
      connectionStatus: row.connection_status,
      createdAt: row.created_at,
      label: row.label,
      ...(row.last_seen_at !== undefined && row.last_seen_at !== null
        ? { lastSeenAt: row.last_seen_at }
        : {}),
      ...(row.obs_websocket_version !== undefined && row.obs_websocket_version !== null
        ? { obsWebsocketVersion: row.obs_websocket_version }
        : {}),
      schemaVersion: row.schema_version,
      tenantId: row.tenant_id,
      updatedAt: row.updated_at
    })
  );

const ObsSceneSqlRowSchema = z
  .object({
    connection_profile_id: z.string().min(1),
    display_name: z.string().min(1),
    is_current_program_scene: z.number().int(),
    obs_scene_ref: z.string().min(1),
    order_hint: z.number().int().nonnegative(),
    scene_id: z.string().min(1),
    snapshot_at: z.string().datetime({ offset: true }),
    tenant_id: z.string().min(1)
  })
  .strict()
  .transform((row): ObsScenePersistenceRecord =>
    ObsScenePersistenceRecordSchema.parse({
      connectionProfileId: row.connection_profile_id,
      displayName: row.display_name,
      isCurrentProgramScene: row.is_current_program_scene !== 0,
      obsSceneRef: row.obs_scene_ref,
      orderHint: row.order_hint,
      sceneId: row.scene_id,
      snapshotAt: row.snapshot_at,
      tenantId: row.tenant_id
    })
  );

const ObsSourceSqlRowSchema = z
  .object({
    active_hint: z.number().int().nullable().optional(),
    connection_profile_id: z.string().min(1),
    kind_label: z.string().min(1),
    muted_hint: z.number().int().nullable().optional(),
    obs_source_ref: z.string().min(1),
    snapshot_at: z.string().datetime({ offset: true }),
    source_id: z.string().min(1),
    tenant_id: z.string().min(1)
  })
  .strict()
  .transform((row): ObsSourcePersistenceRecord =>
    ObsSourcePersistenceRecordSchema.parse({
      ...(row.active_hint !== undefined && row.active_hint !== null
        ? { activeHint: row.active_hint !== 0 }
        : {}),
      connectionProfileId: row.connection_profile_id,
      kindLabel: row.kind_label,
      ...(row.muted_hint !== undefined && row.muted_hint !== null
        ? { mutedHint: row.muted_hint !== 0 }
        : {}),
      obsSourceRef: row.obs_source_ref,
      snapshotAt: row.snapshot_at,
      sourceId: row.source_id,
      tenantId: row.tenant_id
    })
  );

const ObsSceneItemSqlRowSchema = z
  .object({
    connection_profile_id: z.string().min(1),
    obs_scene_item_id: z.string().min(1),
    order_hint: z.number().int().nonnegative(),
    scene_item_id: z.string().min(1),
    scene_ref: z.string().min(1),
    snapshot_at: z.string().datetime({ offset: true }),
    source_ref: z.string().min(1),
    tenant_id: z.string().min(1),
    visible_hint: z.number().int()
  })
  .strict()
  .transform((row): ObsSceneItemPersistenceRecord =>
    ObsSceneItemPersistenceRecordSchema.parse({
      connectionProfileId: row.connection_profile_id,
      obsSceneItemId: row.obs_scene_item_id,
      orderHint: row.order_hint,
      sceneItemId: row.scene_item_id,
      sceneRef: row.scene_ref,
      snapshotAt: row.snapshot_at,
      sourceRef: row.source_ref,
      tenantId: row.tenant_id,
      visibleHint: row.visible_hint !== 0
    })
  );

const ObsStreamStateSqlRowSchema = z
  .object({
    connection_profile_id: z.string().min(1),
    last_action_intent_ref: z.string().min(1).nullable().optional(),
    last_transition_actor_id: z.string().min(1).nullable().optional(),
    last_transition_at: z.string().min(1).nullable().optional(),
    stream_status: z.string().min(1),
    tenant_id: z.string().min(1),
    updated_at: z.string().datetime({ offset: true })
  })
  .strict()
  .transform((row): ObsStreamStatePersistenceRecord =>
    ObsStreamStatePersistenceRecordSchema.parse({
      connectionProfileId: row.connection_profile_id,
      ...(row.last_action_intent_ref !== undefined && row.last_action_intent_ref !== null
        ? { lastActionIntentRef: row.last_action_intent_ref }
        : {}),
      ...(row.last_transition_actor_id !== undefined &&
      row.last_transition_actor_id !== null
        ? { lastTransitionActorId: row.last_transition_actor_id }
        : {}),
      ...(row.last_transition_at !== undefined && row.last_transition_at !== null
        ? { lastTransitionAt: row.last_transition_at }
        : {}),
      streamStatus: row.stream_status,
      tenantId: row.tenant_id,
      updatedAt: row.updated_at
    })
  );

const ObsRecordingStateSqlRowSchema = z
  .object({
    connection_profile_id: z.string().min(1),
    last_transition_actor_id: z.string().min(1).nullable().optional(),
    last_transition_at: z.string().min(1).nullable().optional(),
    recording_status: z.string().min(1),
    tenant_id: z.string().min(1),
    updated_at: z.string().datetime({ offset: true })
  })
  .strict()
  .transform((row): ObsRecordingStatePersistenceRecord =>
    ObsRecordingStatePersistenceRecordSchema.parse({
      connectionProfileId: row.connection_profile_id,
      ...(row.last_transition_actor_id !== undefined &&
      row.last_transition_actor_id !== null
        ? { lastTransitionActorId: row.last_transition_actor_id }
        : {}),
      ...(row.last_transition_at !== undefined && row.last_transition_at !== null
        ? { lastTransitionAt: row.last_transition_at }
        : {}),
      recordingStatus: row.recording_status,
      tenantId: row.tenant_id,
      updatedAt: row.updated_at
    })
  );

const ObsActionIntentSqlRowSchema = z
  .object({
    action_intent_id: z.string().min(1),
    affects_live_output: z.number().int(),
    confirmation_reason: z.string().min(1).nullable().optional(),
    confirmed: z.number().int(),
    confirmed_at: z.string().datetime({ offset: true }).nullable().optional(),
    confirmed_by_ref: z.string().min(1).nullable().optional(),
    connection_profile_id: z.string().min(1),
    created_at: z.string().datetime({ offset: true }),
    desired_muted: z.number().int().nullable().optional(),
    desired_visible: z.number().int().nullable().optional(),
    kind: z.string().min(1),
    origin: z.string().min(1),
    requested_by_ref: z.string().min(1),
    safe_failure_message: z.string().min(1).nullable().optional(),
    status: z.string().min(1),
    target_scene_item_id: z.string().min(1).nullable().optional(),
    target_scene_ref: z.string().min(1).nullable().optional(),
    target_source_ref: z.string().min(1).nullable().optional(),
    tenant_id: z.string().min(1),
    updated_at: z.string().datetime({ offset: true })
  })
  .strict()
  .transform((row): ObsActionIntentPersistenceRecord => {
    const confirmation = decodeConfirmation({
      confirmation_reason: row.confirmation_reason,
      confirmed: row.confirmed,
      confirmed_at: row.confirmed_at,
      confirmed_by_ref: row.confirmed_by_ref
    });

    return ObsActionIntentPersistenceRecordSchema.parse({
      actionIntentId: row.action_intent_id,
      affectsLiveOutput: row.affects_live_output !== 0,
      ...(confirmation !== undefined ? { confirmation } : {}),
      connectionProfileId: row.connection_profile_id,
      createdAt: row.created_at,
      ...(row.desired_muted !== undefined && row.desired_muted !== null
        ? { desiredMuted: row.desired_muted !== 0 }
        : {}),
      ...(row.desired_visible !== undefined && row.desired_visible !== null
        ? { desiredVisible: row.desired_visible !== 0 }
        : {}),
      kind: row.kind,
      origin: row.origin,
      requestedByRef: row.requested_by_ref,
      ...(row.safe_failure_message !== undefined && row.safe_failure_message !== null
        ? { safeFailureMessage: row.safe_failure_message }
        : {}),
      status: row.status,
      ...(row.target_scene_item_id !== undefined && row.target_scene_item_id !== null
        ? { targetSceneItemId: row.target_scene_item_id }
        : {}),
      ...(row.target_scene_ref !== undefined && row.target_scene_ref !== null
        ? { targetSceneRef: row.target_scene_ref }
        : {}),
      ...(row.target_source_ref !== undefined && row.target_source_ref !== null
        ? { targetSourceRef: row.target_source_ref }
        : {}),
      tenantId: row.tenant_id,
      updatedAt: row.updated_at
    });
  });

const ObsActionLogEntrySqlRowSchema = z
  .object({
    action_intent_ref: z.string().min(1),
    actor_id: z.string().min(1),
    connection_profile_id: z.string().min(1),
    log_entry_id: z.string().min(1),
    occurred_at: z.string().datetime({ offset: true }),
    outcome: z.string().min(1),
    reason: z.string().min(1),
    safe_message: z.string().min(1).nullable().optional(),
    tenant_id: z.string().min(1)
  })
  .strict()
  .transform((row): ObsActionLogEntryPersistenceRecord =>
    ObsActionLogEntryPersistenceRecordSchema.parse({
      actionIntentRef: row.action_intent_ref,
      actorId: row.actor_id,
      connectionProfileId: row.connection_profile_id,
      logEntryId: row.log_entry_id,
      occurredAt: row.occurred_at,
      outcome: row.outcome,
      reason: row.reason,
      ...(row.safe_message !== undefined && row.safe_message !== null
        ? { safeMessage: row.safe_message }
        : {}),
      tenantId: row.tenant_id
    })
  );

const parseOptionalRow = <Result>(
  rowSchema: { readonly parse: (row: PlanningSqlRow) => Result },
  rows: readonly PlanningSqlRow[]
): Result | null => {
  const row = rows[0];

  return row === undefined ? null : rowSchema.parse(row);
};

const firstRow = (rows: readonly PlanningSqlRow[], message: string): PlanningSqlRow => {
  const row = rows[0];

  if (row === undefined) {
    throw new Error(message);
  }

  return row;
};

const OBS_CONNECTION_PROFILE_COLUMNS = `
  tenant_id, connection_profile_id, label, connection_ref, connection_status,
  obs_websocket_version, last_seen_at, schema_version, created_at, updated_at
`.trim();

const OBS_SCENE_COLUMNS = `
  tenant_id, scene_id, connection_profile_id, obs_scene_ref, display_name,
  is_current_program_scene, order_hint, snapshot_at
`.trim();

const OBS_SOURCE_COLUMNS = `
  tenant_id, source_id, connection_profile_id, obs_source_ref, kind_label, muted_hint,
  active_hint, snapshot_at
`.trim();

const OBS_SCENE_ITEM_COLUMNS = `
  tenant_id, scene_item_id, connection_profile_id, scene_ref, source_ref, obs_scene_item_id,
  visible_hint, order_hint, snapshot_at
`.trim();

const OBS_STREAM_STATE_COLUMNS = `
  tenant_id, connection_profile_id, stream_status, last_transition_at,
  last_transition_actor_id, last_action_intent_ref, updated_at
`.trim();

const OBS_RECORDING_STATE_COLUMNS = `
  tenant_id, connection_profile_id, recording_status, last_transition_at,
  last_transition_actor_id, updated_at
`.trim();

const OBS_ACTION_INTENT_COLUMNS = `
  tenant_id, action_intent_id, connection_profile_id, kind, target_scene_ref,
  target_source_ref, target_scene_item_id, desired_visible, desired_muted,
  affects_live_output, status, origin, confirmed, confirmed_by_ref, confirmation_reason,
  confirmed_at, requested_by_ref, safe_failure_message, created_at, updated_at
`.trim();

const OBS_ACTION_LOG_COLUMNS = `
  tenant_id, log_entry_id, connection_profile_id, action_intent_ref, actor_id, reason,
  outcome, safe_message, occurred_at
`.trim();

const upsertObsSceneStatement = (
  scene: ObsScenePersistenceRecord
): {
  readonly name: string;
  readonly parameters: readonly (string | number)[];
  readonly sql: string;
} => ({
  name: "obs.scenes.upsert",
  parameters: [
    scene.tenantId,
    scene.sceneId,
    scene.connectionProfileId,
    scene.obsSceneRef,
    scene.displayName,
    scene.isCurrentProgramScene ? 1 : 0,
    scene.orderHint,
    scene.snapshotAt
  ],
  sql: `
INSERT INTO obs_scenes (tenant_id, scene_id, connection_profile_id, obs_scene_ref, display_name, is_current_program_scene, order_hint, snapshot_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (tenant_id, scene_id) DO UPDATE SET
  connection_profile_id = excluded.connection_profile_id,
  obs_scene_ref = excluded.obs_scene_ref,
  display_name = excluded.display_name,
  is_current_program_scene = excluded.is_current_program_scene,
  order_hint = excluded.order_hint,
  snapshot_at = excluded.snapshot_at
`.trim()
});

const upsertObsSourceStatement = (
  source: ObsSourcePersistenceRecord
): {
  readonly name: string;
  readonly parameters: readonly (string | number | null)[];
  readonly sql: string;
} => ({
  name: "obs.sources.upsert",
  parameters: [
    source.tenantId,
    source.sourceId,
    source.connectionProfileId,
    source.obsSourceRef,
    source.kindLabel,
    optionalBooleanFlag(source.mutedHint),
    optionalBooleanFlag(source.activeHint),
    source.snapshotAt
  ],
  sql: `
INSERT INTO obs_sources (tenant_id, source_id, connection_profile_id, obs_source_ref, kind_label, muted_hint, active_hint, snapshot_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (tenant_id, source_id) DO UPDATE SET
  connection_profile_id = excluded.connection_profile_id,
  obs_source_ref = excluded.obs_source_ref,
  kind_label = excluded.kind_label,
  muted_hint = excluded.muted_hint,
  active_hint = excluded.active_hint,
  snapshot_at = excluded.snapshot_at
`.trim()
});

const upsertObsSceneItemStatement = (
  sceneItem: ObsSceneItemPersistenceRecord
): {
  readonly name: string;
  readonly parameters: readonly (string | number)[];
  readonly sql: string;
} => ({
  name: "obs.scene_items.upsert",
  parameters: [
    sceneItem.tenantId,
    sceneItem.sceneItemId,
    sceneItem.connectionProfileId,
    sceneItem.sceneRef,
    sceneItem.sourceRef,
    sceneItem.obsSceneItemId,
    sceneItem.visibleHint ? 1 : 0,
    sceneItem.orderHint,
    sceneItem.snapshotAt
  ],
  sql: `
INSERT INTO obs_scene_items (tenant_id, scene_item_id, connection_profile_id, scene_ref, source_ref, obs_scene_item_id, visible_hint, order_hint, snapshot_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (tenant_id, scene_item_id) DO UPDATE SET
  connection_profile_id = excluded.connection_profile_id,
  scene_ref = excluded.scene_ref,
  source_ref = excluded.source_ref,
  obs_scene_item_id = excluded.obs_scene_item_id,
  visible_hint = excluded.visible_hint,
  order_hint = excluded.order_hint,
  snapshot_at = excluded.snapshot_at
`.trim()
});

export const createObsQuerySqlRepository = (
  dependencies: ObsQuerySqlRepositoryDependencies
): ObsQueryPersistenceRepository => ({
  getObsActionIntent: async (rawOperation: GetObsActionIntentPersistenceOperation) => {
    const operation = GetObsActionIntentPersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query({
      name: "obs.action_intents.get",
      parameters: [operation.options.context.tenantId, operation.input.actionIntentId],
      sql: `SELECT ${OBS_ACTION_INTENT_COLUMNS} FROM obs_action_intents WHERE tenant_id = ? AND action_intent_id = ? LIMIT 1`,
      ...optionalTransaction(operation.options.transaction)
    });

    return parseOptionalRow(ObsActionIntentSqlRowSchema, result.rows);
  },

  getObsConnectionProfile: async (
    rawOperation: GetObsConnectionProfilePersistenceOperation
  ) => {
    const operation =
      GetObsConnectionProfilePersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query({
      name: "obs.connection_profiles.get",
      parameters: [
        operation.options.context.tenantId,
        operation.input.connectionProfileId
      ],
      sql: `SELECT ${OBS_CONNECTION_PROFILE_COLUMNS} FROM obs_connection_profiles WHERE tenant_id = ? AND connection_profile_id = ? LIMIT 1`,
      ...optionalTransaction(operation.options.transaction)
    });

    return parseOptionalRow(ObsConnectionProfileSqlRowSchema, result.rows);
  },

  getObsRecordingState: async (
    rawOperation: GetObsRecordingStatePersistenceOperation
  ) => {
    const operation = GetObsRecordingStatePersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query({
      name: "obs.recording_state.get",
      parameters: [
        operation.options.context.tenantId,
        operation.input.connectionProfileId
      ],
      sql: `SELECT ${OBS_RECORDING_STATE_COLUMNS} FROM obs_recording_state WHERE tenant_id = ? AND connection_profile_id = ? LIMIT 1`,
      ...optionalTransaction(operation.options.transaction)
    });

    return parseOptionalRow(ObsRecordingStateSqlRowSchema, result.rows);
  },

  getObsScene: async (rawOperation: GetObsScenePersistenceOperation) => {
    const operation = GetObsScenePersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query({
      name: "obs.scenes.get",
      parameters: [operation.options.context.tenantId, operation.input.sceneId],
      sql: `SELECT ${OBS_SCENE_COLUMNS} FROM obs_scenes WHERE tenant_id = ? AND scene_id = ? LIMIT 1`,
      ...optionalTransaction(operation.options.transaction)
    });

    return parseOptionalRow(ObsSceneSqlRowSchema, result.rows);
  },

  getObsSceneItem: async (rawOperation: GetObsSceneItemPersistenceOperation) => {
    const operation = GetObsSceneItemPersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query({
      name: "obs.scene_items.get",
      parameters: [operation.options.context.tenantId, operation.input.sceneItemId],
      sql: `SELECT ${OBS_SCENE_ITEM_COLUMNS} FROM obs_scene_items WHERE tenant_id = ? AND scene_item_id = ? LIMIT 1`,
      ...optionalTransaction(operation.options.transaction)
    });

    return parseOptionalRow(ObsSceneItemSqlRowSchema, result.rows);
  },

  getObsSource: async (rawOperation: GetObsSourcePersistenceOperation) => {
    const operation = GetObsSourcePersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query({
      name: "obs.sources.get",
      parameters: [operation.options.context.tenantId, operation.input.sourceId],
      sql: `SELECT ${OBS_SOURCE_COLUMNS} FROM obs_sources WHERE tenant_id = ? AND source_id = ? LIMIT 1`,
      ...optionalTransaction(operation.options.transaction)
    });

    return parseOptionalRow(ObsSourceSqlRowSchema, result.rows);
  },

  getObsStreamState: async (rawOperation: GetObsStreamStatePersistenceOperation) => {
    const operation = GetObsStreamStatePersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query({
      name: "obs.stream_state.get",
      parameters: [
        operation.options.context.tenantId,
        operation.input.connectionProfileId
      ],
      sql: `SELECT ${OBS_STREAM_STATE_COLUMNS} FROM obs_stream_state WHERE tenant_id = ? AND connection_profile_id = ? LIMIT 1`,
      ...optionalTransaction(operation.options.transaction)
    });

    return parseOptionalRow(ObsStreamStateSqlRowSchema, result.rows);
  },

  listObsActionIntents: async (
    rawOperation: ListObsActionIntentsPersistenceOperation
  ) => {
    const operation = ListObsActionIntentsPersistenceOperationSchema.parse(rawOperation);
    const connectionProfileId = operation.input.filter?.connectionProfileId ?? null;
    const status = operation.input.filter?.status ?? null;
    const result = await dependencies.executor.query({
      name: "obs.action_intents.list",
      parameters: [
        operation.options.context.tenantId,
        connectionProfileId,
        connectionProfileId,
        status,
        status
      ],
      sql: `
SELECT ${OBS_ACTION_INTENT_COLUMNS}
FROM obs_action_intents
WHERE tenant_id = ?
  AND (? IS NULL OR connection_profile_id = ?)
  AND (? IS NULL OR status = ?)
ORDER BY created_at, action_intent_id
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return z.array(ObsActionIntentSqlRowSchema).parse(result.rows);
  },

  listObsActionLog: async (rawOperation: ListObsActionLogPersistenceOperation) => {
    const operation = ListObsActionLogPersistenceOperationSchema.parse(rawOperation);
    const actionIntentRef = operation.input.actionIntentRef ?? null;
    const result = await dependencies.executor.query({
      name: "obs.action_log.list",
      parameters: [
        operation.options.context.tenantId,
        operation.input.connectionProfileId,
        actionIntentRef,
        actionIntentRef
      ],
      sql: `
SELECT ${OBS_ACTION_LOG_COLUMNS}
FROM obs_action_log_entries
WHERE tenant_id = ?
  AND connection_profile_id = ?
  AND (? IS NULL OR action_intent_ref = ?)
ORDER BY occurred_at, log_entry_id
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return z.array(ObsActionLogEntrySqlRowSchema).parse(result.rows);
  },

  listObsConnectionProfiles: async (
    rawOperation: ListObsConnectionProfilesPersistenceOperation
  ) => {
    const operation =
      ListObsConnectionProfilesPersistenceOperationSchema.parse(rawOperation);
    const connectionStatus = operation.input.filter?.connectionStatus ?? null;
    const result = await dependencies.executor.query({
      name: "obs.connection_profiles.list",
      parameters: [
        operation.options.context.tenantId,
        connectionStatus,
        connectionStatus
      ],
      sql: `
SELECT ${OBS_CONNECTION_PROFILE_COLUMNS}
FROM obs_connection_profiles
WHERE tenant_id = ? AND (? IS NULL OR connection_status = ?)
ORDER BY label, connection_profile_id
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return z.array(ObsConnectionProfileSqlRowSchema).parse(result.rows);
  },

  listObsSceneItems: async (rawOperation: ListObsSceneItemsPersistenceOperation) => {
    const operation = ListObsSceneItemsPersistenceOperationSchema.parse(rawOperation);
    const sceneRef = operation.input.sceneRef ?? null;
    const result = await dependencies.executor.query({
      name: "obs.scene_items.list",
      parameters: [
        operation.options.context.tenantId,
        operation.input.connectionProfileId,
        sceneRef,
        sceneRef
      ],
      sql: `
SELECT ${OBS_SCENE_ITEM_COLUMNS}
FROM obs_scene_items
WHERE tenant_id = ?
  AND connection_profile_id = ?
  AND (? IS NULL OR scene_ref = ?)
ORDER BY order_hint, scene_item_id
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return z.array(ObsSceneItemSqlRowSchema).parse(result.rows);
  },

  listObsScenes: async (rawOperation: ListObsScenesPersistenceOperation) => {
    const operation = ListObsScenesPersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query({
      name: "obs.scenes.list",
      parameters: [
        operation.options.context.tenantId,
        operation.input.connectionProfileId
      ],
      sql: `
SELECT ${OBS_SCENE_COLUMNS}
FROM obs_scenes
WHERE tenant_id = ? AND connection_profile_id = ?
ORDER BY order_hint, scene_id
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return z.array(ObsSceneSqlRowSchema).parse(result.rows);
  },

  listObsSources: async (rawOperation: ListObsSourcesPersistenceOperation) => {
    const operation = ListObsSourcesPersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query({
      name: "obs.sources.list",
      parameters: [
        operation.options.context.tenantId,
        operation.input.connectionProfileId
      ],
      sql: `
SELECT ${OBS_SOURCE_COLUMNS}
FROM obs_sources
WHERE tenant_id = ? AND connection_profile_id = ?
ORDER BY obs_source_ref, source_id
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return z.array(ObsSourceSqlRowSchema).parse(result.rows);
  }
});

export const createObsCommandSqlRepository = (
  dependencies: ObsCommandSqlRepositoryDependencies
): ObsCommandPersistenceRepository => ({
  appendObsActionLogEntry: async (
    rawOperation: AppendObsActionLogEntryPersistenceOperation
  ) => {
    const operation =
      AppendObsActionLogEntryPersistenceOperationSchema.parse(rawOperation);
    const entry = operation.input;

    if (entry.tenantId !== operation.options.context.tenantId) {
      throw new Error("OBS action log entry tenant must match operation tenant.");
    }

    const result = await dependencies.executor.query({
      name: "obs.action_log.append",
      parameters: [
        entry.tenantId,
        entry.logEntryId,
        entry.connectionProfileId,
        entry.actionIntentRef,
        entry.actorId,
        entry.reason,
        entry.outcome,
        optionalText(entry.safeMessage),
        entry.occurredAt
      ],
      sql: `
INSERT INTO obs_action_log_entries (tenant_id, log_entry_id, connection_profile_id, action_intent_ref, actor_id, reason, outcome, safe_message, occurred_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
RETURNING ${OBS_ACTION_LOG_COLUMNS}
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return ObsActionLogEntrySqlRowSchema.parse(
      firstRow(result.rows, "OBS action log insert did not return the appended row.")
    );
  },

  replaceObsCatalogSnapshot: async (
    rawOperation: ReplaceObsCatalogSnapshotPersistenceOperation
  ) => {
    const operation =
      ReplaceObsCatalogSnapshotPersistenceOperationSchema.parse(rawOperation);
    const snapshot = operation.input;
    const tenantId = operation.options.context.tenantId;
    const transaction = optionalTransaction(operation.options.transaction);

    // Delete the connection's existing scene/source/scene-item snapshot, then
    // insert the freshly-reconciled set — all tenant-scoped. The contract has
    // already validated that every row shares the snapshot connectionProfileId,
    // that at most one scene is the program scene, and that refs are unique.
    await dependencies.executor.query({
      name: "obs.scene_items.replace_delete",
      parameters: [tenantId, snapshot.connectionProfileId],
      sql: `DELETE FROM obs_scene_items WHERE tenant_id = ? AND connection_profile_id = ?`,
      ...transaction
    });

    await dependencies.executor.query({
      name: "obs.sources.replace_delete",
      parameters: [tenantId, snapshot.connectionProfileId],
      sql: `DELETE FROM obs_sources WHERE tenant_id = ? AND connection_profile_id = ?`,
      ...transaction
    });

    await dependencies.executor.query({
      name: "obs.scenes.replace_delete",
      parameters: [tenantId, snapshot.connectionProfileId],
      sql: `DELETE FROM obs_scenes WHERE tenant_id = ? AND connection_profile_id = ?`,
      ...transaction
    });

    for (const scene of snapshot.scenes) {
      if (scene.tenantId !== tenantId) {
        throw new Error("OBS scene tenant must match operation tenant.");
      }

      const statement = upsertObsSceneStatement(scene);

      await dependencies.executor.query({ ...statement, ...transaction });
    }

    for (const source of snapshot.sources) {
      if (source.tenantId !== tenantId) {
        throw new Error("OBS source tenant must match operation tenant.");
      }

      const statement = upsertObsSourceStatement(source);

      await dependencies.executor.query({ ...statement, ...transaction });
    }

    for (const sceneItem of snapshot.sceneItems) {
      if (sceneItem.tenantId !== tenantId) {
        throw new Error("OBS scene item tenant must match operation tenant.");
      }

      const statement = upsertObsSceneItemStatement(sceneItem);

      await dependencies.executor.query({ ...statement, ...transaction });
    }
  },

  saveObsActionIntent: async (rawOperation: SaveObsActionIntentPersistenceOperation) => {
    const operation = SaveObsActionIntentPersistenceOperationSchema.parse(rawOperation);
    const intent = operation.input;

    if (intent.tenantId !== operation.options.context.tenantId) {
      throw new Error("OBS action intent tenant must match operation tenant.");
    }

    const confirmation = intent.confirmation;

    await dependencies.executor.query({
      name: "obs.action_intents.upsert",
      parameters: [
        intent.tenantId,
        intent.actionIntentId,
        intent.connectionProfileId,
        intent.kind,
        optionalText(intent.targetSceneRef),
        optionalText(intent.targetSourceRef),
        optionalText(intent.targetSceneItemId),
        optionalBooleanFlag(intent.desiredVisible),
        optionalBooleanFlag(intent.desiredMuted),
        intent.affectsLiveOutput ? 1 : 0,
        intent.status,
        intent.origin,
        confirmation === undefined ? 0 : 1,
        optionalText(confirmation?.confirmedByRef),
        optionalText(confirmation?.reason),
        optionalText(confirmation?.confirmedAt),
        intent.requestedByRef,
        optionalText(intent.safeFailureMessage),
        intent.createdAt,
        intent.updatedAt
      ],
      sql: `
INSERT INTO obs_action_intents (tenant_id, action_intent_id, connection_profile_id, kind, target_scene_ref, target_source_ref, target_scene_item_id, desired_visible, desired_muted, affects_live_output, status, origin, confirmed, confirmed_by_ref, confirmation_reason, confirmed_at, requested_by_ref, safe_failure_message, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (tenant_id, action_intent_id) DO UPDATE SET
  connection_profile_id = excluded.connection_profile_id,
  kind = excluded.kind,
  target_scene_ref = excluded.target_scene_ref,
  target_source_ref = excluded.target_source_ref,
  target_scene_item_id = excluded.target_scene_item_id,
  desired_visible = excluded.desired_visible,
  desired_muted = excluded.desired_muted,
  affects_live_output = excluded.affects_live_output,
  status = excluded.status,
  origin = excluded.origin,
  confirmed = excluded.confirmed,
  confirmed_by_ref = excluded.confirmed_by_ref,
  confirmation_reason = excluded.confirmation_reason,
  confirmed_at = excluded.confirmed_at,
  requested_by_ref = excluded.requested_by_ref,
  safe_failure_message = excluded.safe_failure_message,
  updated_at = excluded.updated_at
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return ObsActionIntentPersistenceRecordSchema.parse(intent);
  },

  setObsActionIntentStatus: async (
    rawOperation: SetObsActionIntentStatusPersistenceOperation
  ) => {
    const operation =
      SetObsActionIntentStatusPersistenceOperationSchema.parse(rawOperation);
    const confirmation = operation.input.confirmation;
    // The DDL CHECK enforces confirm-before-dispatch (status past `requested`
    // requires confirmed = 1, and confirmed = 1 requires the confirmation
    // columns), so the transition only writes the right columns: the confirming
    // step carries the confirmation; later steps re-assert it via COALESCE.
    const result = await dependencies.executor.query({
      name: "obs.action_intents.set_status",
      parameters: [
        operation.input.status,
        optionalText(operation.input.safeFailureMessage),
        operation.input.updatedAt,
        confirmation === undefined ? 0 : 1,
        optionalText(confirmation?.confirmedByRef),
        optionalText(confirmation?.reason),
        optionalText(confirmation?.confirmedAt),
        operation.options.context.tenantId,
        operation.input.actionIntentId
      ],
      sql: `
UPDATE obs_action_intents
SET status = ?,
    safe_failure_message = ?,
    updated_at = ?,
    confirmed = CASE WHEN ? = 1 THEN 1 ELSE confirmed END,
    confirmed_by_ref = COALESCE(?, confirmed_by_ref),
    confirmation_reason = COALESCE(?, confirmation_reason),
    confirmed_at = COALESCE(?, confirmed_at)
WHERE tenant_id = ? AND action_intent_id = ?
RETURNING ${OBS_ACTION_INTENT_COLUMNS}
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return ObsActionIntentSqlRowSchema.parse(
      firstRow(
        result.rows,
        "OBS action intent status update did not match a tenant-scoped intent."
      )
    );
  },

  setObsRecordingState: async (
    rawOperation: SetObsRecordingStatePersistenceOperation
  ) => {
    const operation = SetObsRecordingStatePersistenceOperationSchema.parse(rawOperation);
    const recordingState = operation.input;

    if (recordingState.tenantId !== operation.options.context.tenantId) {
      throw new Error("OBS recording state tenant must match operation tenant.");
    }

    await dependencies.executor.query({
      name: "obs.recording_state.upsert",
      parameters: [
        recordingState.tenantId,
        recordingState.connectionProfileId,
        recordingState.recordingStatus,
        optionalText(recordingState.lastTransitionAt),
        optionalText(recordingState.lastTransitionActorId),
        recordingState.updatedAt
      ],
      sql: `
INSERT INTO obs_recording_state (tenant_id, connection_profile_id, recording_status, last_transition_at, last_transition_actor_id, updated_at)
VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT (tenant_id, connection_profile_id) DO UPDATE SET
  recording_status = excluded.recording_status,
  last_transition_at = excluded.last_transition_at,
  last_transition_actor_id = excluded.last_transition_actor_id,
  updated_at = excluded.updated_at
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return ObsRecordingStatePersistenceRecordSchema.parse(recordingState);
  },

  setObsStreamState: async (rawOperation: SetObsStreamStatePersistenceOperation) => {
    const operation = SetObsStreamStatePersistenceOperationSchema.parse(rawOperation);
    const streamState = operation.input;

    if (streamState.tenantId !== operation.options.context.tenantId) {
      throw new Error("OBS stream state tenant must match operation tenant.");
    }

    await dependencies.executor.query({
      name: "obs.stream_state.upsert",
      parameters: [
        streamState.tenantId,
        streamState.connectionProfileId,
        streamState.streamStatus,
        optionalText(streamState.lastTransitionAt),
        optionalText(streamState.lastTransitionActorId),
        optionalText(streamState.lastActionIntentRef),
        streamState.updatedAt
      ],
      sql: `
INSERT INTO obs_stream_state (tenant_id, connection_profile_id, stream_status, last_transition_at, last_transition_actor_id, last_action_intent_ref, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (tenant_id, connection_profile_id) DO UPDATE SET
  stream_status = excluded.stream_status,
  last_transition_at = excluded.last_transition_at,
  last_transition_actor_id = excluded.last_transition_actor_id,
  last_action_intent_ref = excluded.last_action_intent_ref,
  updated_at = excluded.updated_at
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return ObsStreamStatePersistenceRecordSchema.parse(streamState);
  },

  upsertObsConnectionProfile: async (
    rawOperation: UpsertObsConnectionProfilePersistenceOperation
  ) => {
    const operation =
      UpsertObsConnectionProfilePersistenceOperationSchema.parse(rawOperation);
    const profile = operation.input;

    if (profile.tenantId !== operation.options.context.tenantId) {
      throw new Error("OBS connection profile tenant must match operation tenant.");
    }

    await dependencies.executor.query({
      name: "obs.connection_profiles.upsert",
      parameters: [
        profile.tenantId,
        profile.connectionProfileId,
        profile.label,
        profile.connectionRef,
        profile.connectionStatus,
        optionalText(profile.obsWebsocketVersion),
        optionalText(profile.lastSeenAt),
        profile.schemaVersion,
        profile.createdAt,
        profile.updatedAt
      ],
      sql: `
INSERT INTO obs_connection_profiles (tenant_id, connection_profile_id, label, connection_ref, connection_status, obs_websocket_version, last_seen_at, schema_version, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (tenant_id, connection_profile_id) DO UPDATE SET
  label = excluded.label,
  connection_ref = excluded.connection_ref,
  connection_status = excluded.connection_status,
  obs_websocket_version = excluded.obs_websocket_version,
  last_seen_at = excluded.last_seen_at,
  schema_version = excluded.schema_version,
  updated_at = excluded.updated_at
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return ObsConnectionProfilePersistenceRecordSchema.parse(profile);
  },

  upsertObsScene: async (rawOperation: UpsertObsScenePersistenceOperation) => {
    const operation = UpsertObsScenePersistenceOperationSchema.parse(rawOperation);
    const scene = operation.input;

    if (scene.tenantId !== operation.options.context.tenantId) {
      throw new Error("OBS scene tenant must match operation tenant.");
    }

    await dependencies.executor.query({
      ...upsertObsSceneStatement(scene),
      ...optionalTransaction(operation.options.transaction)
    });

    return ObsScenePersistenceRecordSchema.parse(scene);
  },

  upsertObsSceneItem: async (rawOperation: UpsertObsSceneItemPersistenceOperation) => {
    const operation = UpsertObsSceneItemPersistenceOperationSchema.parse(rawOperation);
    const sceneItem = operation.input;

    if (sceneItem.tenantId !== operation.options.context.tenantId) {
      throw new Error("OBS scene item tenant must match operation tenant.");
    }

    await dependencies.executor.query({
      ...upsertObsSceneItemStatement(sceneItem),
      ...optionalTransaction(operation.options.transaction)
    });

    return ObsSceneItemPersistenceRecordSchema.parse(sceneItem);
  },

  upsertObsSource: async (rawOperation: UpsertObsSourcePersistenceOperation) => {
    const operation = UpsertObsSourcePersistenceOperationSchema.parse(rawOperation);
    const source = operation.input;

    if (source.tenantId !== operation.options.context.tenantId) {
      throw new Error("OBS source tenant must match operation tenant.");
    }

    await dependencies.executor.query({
      ...upsertObsSourceStatement(source),
      ...optionalTransaction(operation.options.transaction)
    });

    return ObsSourcePersistenceRecordSchema.parse(source);
  }
});
