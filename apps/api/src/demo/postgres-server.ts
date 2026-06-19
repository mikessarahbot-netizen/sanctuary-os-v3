import { fileURLToPath } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";
import { config } from "dotenv";
import { Pool, type QueryConfig } from "pg";
import {
  ChartsInitialSchemaMigration,
  CommunityInitialSchemaMigration,
  ObsInitialSchemaMigration,
  PlayInitialSchemaMigration,
  createPostgreSqlOperatorExecutor,
  type PlanningSqlExecutor,
  type SqlMigrationArtifact
} from "@sanctuary-os/db";
import type { AuthBoundary } from "../auth/index.js";
import { createPresenterGraphqlHttpServer } from "../graphql/http-server.js";
import { createChartsPersistenceSelection } from "../services/charts/composition.js";
import { createCommunityPersistenceSelection } from "../services/community/composition.js";
import { createObsPersistenceSelection } from "../services/obs/composition.js";
import { createFakeObsControlPort } from "../services/obs/fake-control-port.js";
import { createPlayPersistenceSelection } from "../services/play/composition.js";
import { createInMemoryPresenterServicesAdapter } from "../services/presenter/in-memory.js";
import type { CommunityAiDraftPort } from "../services/community/ai-draft.js";
import type { ObsAiSuggestionPort } from "../services/obs/ai-suggest.js";
import { resolveCommunityAiDraftPort } from "./community-ai.js";
import { resolveObsAiSuggestionPort } from "./obs-ai.js";
import {
  buildDemoSchema,
  createDemoClock,
  demoActor,
  seedDemoData,
  type DemoAdapters,
  DEMO_OBS_PROGRAM_SCENE_REF,
  DEMO_OBS_SCENES
} from "./compose.js";
import { DemoAuthBoundary } from "./server.js";
import type { GraphQLSchema } from "graphql";
import type { Server } from "node:http";

/**
 * Runnable local DEMO GraphQL server backed by a REAL PostgreSQL (Supabase)
 * database.
 *
 * This is the PostgreSQL sibling of `persistent-server.ts` (which runs the same four
 * web-surfaced modules over an on-disk `node:sqlite` file). It composes each module
 * (charts / play / community / obs) over the persistence-backed services running on
 * PostgreSQL, applies every module's migration idempotently into an ISOLATED schema,
 * and seeds the demo data ONLY when the store is empty — so data written in one boot
 * survives a restart and a reboot over an existing schema does NOT re-seed.
 *
 * The four operator modules build their SQL with SQLite-style `?` placeholders; the
 * executor here is `createPostgreSqlOperatorExecutor`, which rewrites `?` -> `$N`
 * before delegating to `pg`. The adapters' source SQL is untouched (the SQLite path
 * still depends on `?`); only the PostgreSQL `text` carries the rewrite. The modules'
 * DDL is ANSI/PostgreSQL-compatible as written, so it is applied verbatim.
 *
 * It reuses the SAME `buildDemoSchema` + `seedDemoData` as the in-memory and SQLite
 * servers (from `compose.ts`), the SAME deterministic demo clock, the SAME fixed
 * `DemoAuthBoundary`, the SAME fake OBS control port, and the SAME env-gated AI
 * ports (`community-ai.ts` / `obs-ai.ts`) — there is NO real obs-websocket / comms
 * dependency, and the AI ports are the keyless fake path unless `ANTHROPIC_API_KEY`
 * is set.
 *
 * PRESENTER is kept IN-MEMORY in this variant, exactly as in `persistent-server.ts`:
 * the presenter SQL path is the dedicated PostgreSQL planning executor with its own
 * runtime config and is not web-surfaced, so it is not part of this operator-module
 * persistence target.
 *
 * It is NOT a production server: the demo auth ignores the header and resolves to one
 * fixed actor, the seeded Community+ data is PII-safe (display names + opaque contact
 * refs + consent only), and the OBS connection carries only an opaque `connectionRef`
 * (no host / port / password / stream key).
 */

/**
 * The isolated schema every demo object lands in. Keeping the demo inside a named
 * schema (rather than `public`) means the connection string can point at any
 * Supabase database without colliding with existing tables, and the whole demo can
 * be dropped with a single `DROP SCHEMA sanctuary_os CASCADE`.
 */
export const POSTGRES_DEMO_SCHEMA = "sanctuary_os";

const POSTGRES_URL_ENV_VAR = "SANCTUARY_OS_POSTGRES_URL";

/**
 * The four operator-module migrations applied here, in dependency-free order. Each
 * exposes the ANSI/PostgreSQL-compatible `upSql` and the `requiredTables` used as the
 * idempotency sentinel.
 */
const OPERATOR_MIGRATIONS: readonly SqlMigrationArtifact[] = [
  ChartsInitialSchemaMigration,
  PlayInitialSchemaMigration,
  CommunityInitialSchemaMigration,
  ObsInitialSchemaMigration
];

/**
 * Minimal structural view of the `pg` query surface this server needs. Declared
 * structurally so a test can pass a real `Pool`/`PoolClient` or a compatible fake
 * without this module importing concrete `pg` classes.
 */
export interface PostgresQueryable {
  readonly query: (
    queryTextOrConfig: string,
    values?: readonly unknown[]
  ) => Promise<{ readonly rows: readonly Record<string, unknown>[] }>;
}

/**
 * Apply the four operator modules' schema into `POSTGRES_DEMO_SCHEMA` IDEMPOTENTLY.
 *
 * The modules' DDL is bare `CREATE TABLE` (no `IF NOT EXISTS`), so a naive re-run
 * would throw "already exists" on the second boot. Each migration is guarded by a
 * sentinel: if its first required table is already present in the schema (probed via
 * `to_regclass`), the migration is skipped. The first boot applies all four; later
 * boots over the same schema apply nothing.
 *
 * Assumes `search_path` already resolves to `POSTGRES_DEMO_SCHEMA` (so unqualified
 * `CREATE TABLE` lands there); the composition sets that on every pooled connection.
 */
const applyOperatorMigrations = async (client: PostgresQueryable): Promise<void> => {
  for (const migration of OPERATOR_MIGRATIONS) {
    const sentinelTable = migration.requiredTables[0];
    if (sentinelTable === undefined) {
      throw new Error(
        `Operator migration ${migration.migrationId} declares no required tables.`
      );
    }

    // `to_regclass` resolves the unqualified name against the current search_path
    // and yields NULL when the table is absent, so this is a schema-scoped probe.
    const probe = await client.query(
      "SELECT to_regclass($1) AS table_ref",
      [sentinelTable]
    );
    const alreadyApplied = probe.rows[0]?.["table_ref"] != null;

    if (!alreadyApplied) {
      await client.query(migration.upSql);
    }
  }
};

export interface PostgresDemoComposition {
  readonly adapters: DemoAdapters;
  readonly authBoundary: AuthBoundary;
  /** Close the underlying connection pool. */
  readonly dispose: () => Promise<void>;
  readonly schema: GraphQLSchema;
  /** The isolated schema the demo objects live in. */
  readonly schemaName: string;
  /** Whether this boot seeded an empty store or reused an already-populated one. */
  readonly seedOutcome: DemoSeedOutcome;
}

export type DemoSeedOutcome = "seeded" | "reused";

export interface CreatePostgresDemoCompositionDependencies {
  /**
   * The Community AI-draft port to inject. Defaults to NONE (the keyless fake path),
   * exactly like the other demo servers. `main()` resolves the real Anthropic port
   * from `ANTHROPIC_API_KEY` (after dotenv) and passes it here; an integration test
   * calls this with no dependency, so it always runs the keyless fake path.
   */
  readonly communityAiDraftPort?: CommunityAiDraftPort;
  /**
   * The OBS AI-suggestion port to inject. Defaults to NONE (the keyless fake path),
   * exactly like the other demo servers.
   */
  readonly obsAiSuggestionPort?: ObsAiSuggestionPort;
}

/**
 * Build the PostgreSQL demo composition over a caller-owned `pg.Pool` WITHOUT
 * starting an http listener:
 *
 * 1. Ensure the isolated `POSTGRES_DEMO_SCHEMA` exists (the pool already pins
 *    `search_path` to it on every connection — see `createPostgresPool`).
 * 2. Apply all four operator migrations idempotently (see `applyOperatorMigrations`).
 * 3. Build a shared `createPostgreSqlOperatorExecutor` over the pool + each module's
 *    persistence-backed `.servicesAdapter` (charts / play / community / obs),
 *    injecting the SAME demo clock and the SAME fake OBS control port the other demo
 *    servers use. Presenter stays in-memory (see the file header).
 * 4. Seed via the shared `seedDemoData` ONLY when the store is empty (probed by a
 *    tenant-scoped Charts list), so the first boot seeds and later boots preserve the
 *    existing data without duplicating it.
 *
 * Returns the adapters, the wired schema, the demo auth boundary, the schema name,
 * the seed outcome, and a `dispose()` that ends the pool. The pool is provided by the
 * caller so a test can build the composition over a pool it owns (and drop its test
 * schema afterwards) without serving.
 */
export const createPostgresDemoComposition = async (
  pool: Pool,
  dependencies: CreatePostgresDemoCompositionDependencies = {}
): Promise<PostgresDemoComposition> => {
  const clock = createDemoClock();

  // Idempotent schema + migrations on a single dedicated connection so the
  // unqualified DDL lands in the demo schema deterministically.
  const migrationClient = await pool.connect();
  try {
    await migrationClient.query(
      `CREATE SCHEMA IF NOT EXISTS ${POSTGRES_DEMO_SCHEMA}`
    );
    await migrationClient.query(`SET search_path TO ${POSTGRES_DEMO_SCHEMA}`);
    await applyOperatorMigrations(migrationClient);
  } finally {
    migrationClient.release();
  }

  // One executor over the pool backs every module's SQL repositories. The pool pins
  // `search_path` to the demo schema on every connection, so the executor resolves
  // the operator tables regardless of which pooled connection serves a statement.
  const executor: PlanningSqlExecutor = createPostgreSqlOperatorExecutor({
    queryClient: {
      query: async (queryConfig) => {
        // `pg`'s overload infers its value-type param from `values`; the operator
        // executor hands it a `readonly` array, so rebuild a mutable `QueryConfig`
        // (preserving the prepared-statement `name` + the rewritten `$N` `text`).
        const config: QueryConfig<unknown[]> = {
          name: queryConfig.name ?? "",
          text: queryConfig.text,
          values: [...queryConfig.values]
        };

        return pool.query(config);
      }
    }
  });

  const chartsSelection = createChartsPersistenceSelection(
    { mode: "sql" },
    { sql: { clock, executor } }
  );
  const playSelection = createPlayPersistenceSelection(
    { mode: "sql" },
    { sql: { clock, executor } }
  );
  // Community uses its built-in default send port. The AI-draft port is injected ONLY
  // when supplied (real Anthropic when `main()` found a key); absent otherwise — the
  // keyless fake path, the same default an integration test runs.
  const communitySelection = createCommunityPersistenceSelection(
    { mode: "sql" },
    {
      sql: {
        clock,
        executor,
        ...(dependencies.communityAiDraftPort !== undefined
          ? { aiDraftPort: dependencies.communityAiDraftPort }
          : {})
      }
    }
  );
  // OBS: inject the SAME fake control port the other demo servers use (no real
  // obs-websocket). `refreshObsCatalog` reads this fake at seed time; the
  // request -> confirm -> dispatch gate drives it live.
  const obsControlPort = createFakeObsControlPort({
    currentProgramSceneRef: DEMO_OBS_PROGRAM_SCENE_REF,
    recordingStatus: "inactive",
    scenes: DEMO_OBS_SCENES.map((scene) => ({ ...scene })),
    streamStatus: "active"
  });
  const obsSelection = createObsPersistenceSelection(
    { mode: "sql" },
    {
      sql: {
        clock,
        controlPort: obsControlPort.port,
        executor,
        ...(dependencies.obsAiSuggestionPort !== undefined
          ? { aiSuggestionPort: dependencies.obsAiSuggestionPort }
          : {})
      }
    }
  );

  // Presenter stays in-memory in this variant (see the file header: presenter is not
  // web-surfaced and has its own PostgreSQL planning path).
  const presenter = createInMemoryPresenterServicesAdapter({ clock });

  const adapters: DemoAdapters = {
    charts: chartsSelection.servicesAdapter,
    community: communitySelection.servicesAdapter,
    obs: obsSelection.servicesAdapter,
    play: playSelection.servicesAdapter,
    presenter
  };

  const schema = buildDemoSchema(adapters);
  const authBoundary = new DemoAuthBoundary();

  // Seed-if-empty: probe the durable store under the demo tenant. A non-empty Charts
  // list means a previous boot already seeded, so we PRESERVE the existing data (and
  // any later writes) instead of duplicating the seed.
  const existingCharts = await adapters.charts.queryService.listCharts({
    actor: demoActor,
    input: {},
    requestId: "demo-postgres-seed-probe"
  });
  let seedOutcome: DemoSeedOutcome;
  if (existingCharts.length === 0) {
    await seedDemoData(adapters);
    seedOutcome = "seeded";
  } else {
    seedOutcome = "reused";
  }

  return {
    adapters,
    authBoundary,
    dispose: async (): Promise<void> => {
      await pool.end();
    },
    schema,
    schemaName: POSTGRES_DEMO_SCHEMA,
    seedOutcome
  };
};

/**
 * Build a `pg.Pool` for the demo over `connectionString`, pinning `search_path` to
 * the isolated demo schema on EVERY connection (`-c search_path=...` startup option)
 * so the operator executor's pooled statements always resolve the demo tables.
 */
export const createPostgresPool = (connectionString: string): Pool =>
  new Pool({
    connectionString,
    max: 4,
    options: `-c search_path=${POSTGRES_DEMO_SCHEMA}`
  });

const DEFAULT_PORT = 4000;

const resolvePort = (rawPort: string | undefined): number => {
  if (rawPort === undefined || rawPort.length === 0) {
    return DEFAULT_PORT;
  }

  const parsed = Number.parseInt(rawPort, 10);

  return Number.isInteger(parsed) && parsed >= 0 ? parsed : DEFAULT_PORT;
};

export interface PostgresDemoServer {
  readonly composition: PostgresDemoComposition;
  readonly server: Server;
}

/**
 * Build the PostgreSQL composition and the Node http server over it (without
 * listening). The thin `main` below resolves env + listens.
 */
export const createPostgresDemoServer = async (
  pool: Pool,
  dependencies: CreatePostgresDemoCompositionDependencies = {}
): Promise<PostgresDemoServer> => {
  const composition = await createPostgresDemoComposition(pool, dependencies);
  const server = createPresenterGraphqlHttpServer({
    authBoundary: composition.authBoundary,
    schema: composition.schema
  });

  return { composition, server };
};

/**
 * Module entry: resolve the PostgreSQL connection string from
 * `SANCTUARY_OS_POSTGRES_URL` (exit with a clear message if unset), build the pool,
 * compose (migrate + seed-if-empty), then listen on `PORT` (default 4000). Run with
 * `pnpm --filter @sanctuary-os/api dev:postgres`.
 */
const main = async (): Promise<void> => {
  // Load apps/api/.env relative to this file (src/demo/postgres-server.ts ->
  // apps/api/.env) so `ANTHROPIC_API_KEY` + `SANCTUARY_OS_POSTGRES_URL` load
  // regardless of cwd, then resolve the real-vs-fake AI ports. Kept in the entry
  // point (not module scope) so an integration test, which constructs the composition
  // directly, never loads the key or builds an Anthropic client.
  const here = dirname(fileURLToPath(import.meta.url));
  config({ path: resolvePath(here, "..", "..", ".env") });

  const connectionString = process.env[POSTGRES_URL_ENV_VAR];
  if (connectionString === undefined || connectionString.length === 0) {
    console.error(
      `Set ${POSTGRES_URL_ENV_VAR} to a PostgreSQL/Supabase connection string to run the PostgreSQL demo server.`
    );
    process.exitCode = 1;
    return;
  }

  const communityAiDraftPort = resolveCommunityAiDraftPort();
  const obsAiSuggestionPort = resolveObsAiSuggestionPort();

  const pool = createPostgresPool(connectionString);
  const { composition, server } = await createPostgresDemoServer(pool, {
    ...(communityAiDraftPort !== undefined ? { communityAiDraftPort } : {}),
    ...(obsAiSuggestionPort !== undefined ? { obsAiSuggestionPort } : {})
  });

  const port = resolvePort(process.env["PORT"]);
  const host = "127.0.0.1";

  server.listen(port, host, () => {
    // Surface the schema + seed outcome so a restart is observable: the first boot
    // logs "seeded", later boots over the same schema log "reused". Never the URL.
    console.log(
      `PostgreSQL demo schema: ${composition.schemaName} (${composition.seedOutcome})`
    );
    console.log(
      `Community AI draft: ${
        communityAiDraftPort !== undefined
          ? "live Anthropic (ANTHROPIC_API_KEY detected)"
          : "disabled (no ANTHROPIC_API_KEY) — demo uses the fake draft"
      }`
    );
    console.log(
      `OBS AI suggest: ${
        obsAiSuggestionPort !== undefined
          ? "live Anthropic (ANTHROPIC_API_KEY detected)"
          : "disabled (no ANTHROPIC_API_KEY) — demo uses the fake suggestion"
      }`
    );
    console.log(
      `PostgreSQL demo GraphQL API listening at http://${host}:${String(port)}/graphql`
    );
  });
};

// Run only when executed directly (e.g. `tsx src/demo/postgres-server.ts`), not on
// import from an integration test.
const invokedPath = process.argv[1];

if (invokedPath !== undefined && import.meta.url === `file://${invokedPath}`) {
  void main();
}
