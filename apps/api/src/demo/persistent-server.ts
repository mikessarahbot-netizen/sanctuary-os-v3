import { fileURLToPath } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";
import {
  createSqliteExecutor,
  type SqliteBindValue,
  type SqliteMigrationDatabaseClient
} from "@sanctuary-os/db";
import type { AuthBoundary } from "../auth/index.js";
import { createPresenterGraphqlHttpServer } from "../graphql/http-server.js";
import {
  createChartsPersistenceSelection,
  migrateChartsSqliteSchema
} from "../services/charts/composition.js";
import {
  createCommunityPersistenceSelection,
  migrateCommunitySqliteSchema
} from "../services/community/composition.js";
import {
  createObsPersistenceSelection,
  migrateObsSqliteSchema
} from "../services/obs/composition.js";
import { createFakeObsControlPort } from "../services/obs/fake-control-port.js";
import {
  createPlayPersistenceSelection,
  migratePlaySqliteSchema
} from "../services/play/composition.js";
import { createInMemoryPresenterServicesAdapter } from "../services/presenter/in-memory.js";
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
 * Runnable local DEMO GraphQL server backed by a REAL on-disk `node:sqlite`
 * database.
 *
 * Unlike the EPHEMERAL in-memory variant (`server.ts`), this composes each
 * web-surfaced module (charts / play / community / obs) over the
 * persistence-backed services running on a durable SQLite file, applies every
 * module's migration idempotently, and seeds the demo data ONLY when the store is
 * empty. The result PROVES durability: data written in one boot survives a
 * restart, and a reboot over an existing file does NOT re-seed or duplicate.
 *
 * It reuses the SAME `buildDemoSchema` + `seedDemoData` as the in-memory server
 * (from `compose.ts`), the SAME deterministic demo clock, the SAME fixed
 * `DemoAuthBoundary`, and the SAME fake OBS control port — there is NO real
 * obs-websocket / comms / AI dependency.
 *
 * PRESENTER is kept IN-MEMORY in this variant. The presenter/planning persistence
 * path is PostgreSQL-only for SQL mode (`PresenterPersistenceRuntimeConfigSchema`
 * rejects any non-postgresql runtime, and the SQL executor is the PostgreSQL
 * planning executor) — there is no SQLite migration set for it — and presenter is
 * not surfaced in the web app. The four modules above are the persistence target,
 * so presenter is composed in-memory here rather than blocking durability on a
 * Postgres dependency.
 *
 * It is NOT a production server: the demo auth ignores the header and resolves to
 * one fixed actor, the seeded Community+ data is PII-safe (display names + opaque
 * contact refs + consent only), and the OBS connection carries only an opaque
 * `connectionRef` (no host / port / password / stream key).
 */

/**
 * Structural view of the `node:sqlite` `DatabaseSync` surface this server uses.
 * Declared structurally (rather than importing `node:sqlite`) so the module stays
 * loadable on any Node version and a test can pass a real `DatabaseSync` or a
 * compatible fake. The migration runner needs `exec` (multi-statement DDL); the
 * query executor needs only `prepare`.
 */
export interface NodeSqliteStatementLike {
  readonly all: (
    ...parameters: readonly SqliteBindValue[]
  ) => readonly Record<string, unknown>[];
  readonly run: (
    ...parameters: readonly SqliteBindValue[]
  ) => { readonly changes: number | bigint; readonly lastInsertRowid: number | bigint };
}

export interface NodeSqliteDatabaseLike {
  readonly close: () => void;
  readonly exec: (sql: string) => void;
  readonly prepare: (sql: string) => NodeSqliteStatementLike;
}

/**
 * Adapt a `node:sqlite` / `better-sqlite3` database to the synchronous
 * `SqliteMigrationDatabaseClient` the migration runner and the query executor
 * both consume. The executor only calls `prepare`; the runner also calls `exec`.
 */
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

const openNodeSqliteDatabase = async (path: string): Promise<NodeSqliteDatabaseLike> => {
  const sqliteModule = await import("node:sqlite");

  return new sqliteModule.DatabaseSync(path);
};

const DEFAULT_DB_FILENAME = ".sanctuary-demo.db";

/**
 * Resolve the on-disk SQLite path. `DEMO_DB_PATH` overrides; otherwise the file
 * lands at the repo root as `.sanctuary-demo.db` (gitignored). The default is
 * resolved relative to this module so it is stable regardless of cwd.
 */
export const resolveDemoDatabasePath = (
  env: Readonly<Record<string, string | undefined>> = process.env
): string => {
  const override = env["DEMO_DB_PATH"];
  if (override !== undefined && override.length > 0) {
    return resolvePath(override);
  }

  // .../apps/api/src/demo/persistent-server.ts -> repo root is four levels up
  // from the demo dir (demo -> src -> api -> apps -> <root>).
  const here = dirname(fileURLToPath(import.meta.url));

  return resolvePath(here, "..", "..", "..", "..", DEFAULT_DB_FILENAME);
};

export type DemoSeedOutcome = "seeded" | "reused";

export interface PersistentDemoComposition {
  readonly adapters: DemoAdapters;
  readonly authBoundary: AuthBoundary;
  readonly databasePath: string;
  /** Close the underlying SQLite handle. Call before re-opening the same file. */
  readonly dispose: () => void;
  readonly schema: GraphQLSchema;
  /** Whether this boot seeded an empty store or reused an already-populated one. */
  readonly seedOutcome: DemoSeedOutcome;
}

export interface CreatePersistentDemoCompositionDependencies {
  /** Injectable DB opener so a test can pass a real `DatabaseSync` it owns. */
  readonly openDatabase?: (path: string) => Promise<NodeSqliteDatabaseLike>;
}

/**
 * Build the persistent demo composition over an on-disk SQLite database WITHOUT
 * starting an http listener:
 *
 * 1. Open the database at `databasePath`.
 * 2. Apply ALL FOUR modules' migrations idempotently (re-runnable: a second boot
 *    over an existing file applies nothing new).
 * 3. Build a shared `createSqliteExecutor` + each module's persistence-backed
 *    `.servicesAdapter` (charts / play / community / obs), injecting the SAME demo
 *    clock and the SAME fake OBS control port the in-memory demo uses. Presenter
 *    stays in-memory (see the file header).
 * 4. Seed via the shared `seedDemoData` ONLY when the store is empty (probed by a
 *    tenant-scoped Charts list), so the first boot seeds and later boots preserve
 *    the existing data without duplicating it.
 *
 * Returns the adapters, the wired schema, the demo auth boundary, the resolved DB
 * path, the seed outcome, and a `dispose()` that closes the handle. `persistent-
 * server.ts`'s `main` calls this and then listens; the durability test calls it
 * directly across two boots over one temp file.
 */
export const createPersistentDemoComposition = async (
  databasePath: string,
  dependencies: CreatePersistentDemoCompositionDependencies = {}
): Promise<PersistentDemoComposition> => {
  const clock = createDemoClock();
  const open = dependencies.openDatabase ?? openNodeSqliteDatabase;
  const database = await open(databasePath);

  try {
    const migrationDatabase = wrapMigrationDatabase(database);

    // Apply every web-surfaced module's schema. Idempotent: already-applied
    // migrations are skipped, so a reboot over an existing file is a no-op here.
    await migrateChartsSqliteSchema({ clock, database: migrationDatabase });
    await migratePlaySqliteSchema({ clock, database: migrationDatabase });
    await migrateCommunitySqliteSchema({ clock, database: migrationDatabase });
    await migrateObsSqliteSchema({ clock, database: migrationDatabase });

    // One executor over the same on-disk handle backs every module's SQL
    // repositories (the executor uses only `prepare`).
    const executor = createSqliteExecutor({ database: migrationDatabase });

    const chartsSelection = createChartsPersistenceSelection(
      { mode: "sql" },
      { sql: { clock, executor } }
    );
    const playSelection = createPlayPersistenceSelection(
      { mode: "sql" },
      { sql: { clock, executor } }
    );
    // Community uses its built-in default send port + no AI draft port — the same
    // as the in-memory demo, which injects neither.
    const communitySelection = createCommunityPersistenceSelection(
      { mode: "sql" },
      { sql: { clock, executor } }
    );
    // OBS: inject the SAME fake control port the in-memory demo uses (no real
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
      { sql: { clock, controlPort: obsControlPort.port, executor } }
    );

    // Presenter stays in-memory in this variant (see the file header: the
    // presenter SQL path is PostgreSQL-only and presenter is not web-surfaced).
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

    // Seed-if-empty: probe the durable store under the demo tenant. A non-empty
    // Charts list means a previous boot already seeded, so we PRESERVE the
    // existing data (and any later writes) instead of duplicating the seed.
    const existingCharts = await adapters.charts.queryService.listCharts({
      actor: demoActor,
      input: {},
      requestId: "demo-persistent-seed-probe"
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
      databasePath,
      dispose: (): void => {
        database.close();
      },
      schema,
      seedOutcome
    };
  } catch (error) {
    // Don't leak the handle if composition fails after the open.
    database.close();
    throw error;
  }
};

const DEFAULT_PORT = 4000;

const resolvePort = (rawPort: string | undefined): number => {
  if (rawPort === undefined || rawPort.length === 0) {
    return DEFAULT_PORT;
  }

  const parsed = Number.parseInt(rawPort, 10);

  return Number.isInteger(parsed) && parsed >= 0 ? parsed : DEFAULT_PORT;
};

export interface PersistentDemoServer {
  readonly composition: PersistentDemoComposition;
  readonly server: Server;
}

/**
 * Build the persistent composition and the Node http server over it (without
 * listening). The thin `main` below resolves env + listens.
 */
export const createPersistentDemoServer = async (
  databasePath: string
): Promise<PersistentDemoServer> => {
  const composition = await createPersistentDemoComposition(databasePath);
  const server = createPresenterGraphqlHttpServer({
    authBoundary: composition.authBoundary,
    schema: composition.schema
  });

  return { composition, server };
};

/**
 * Module entry: resolve the on-disk DB path, build the persistent composition
 * (migrate + seed-if-empty), then listen on `PORT` (default 4000). Logs the
 * resolved DB path and whether this boot seeded or reused, so the operator can
 * see durability across restarts. Run with
 * `pnpm --filter @sanctuary-os/api dev:persistent`.
 */
const main = async (): Promise<void> => {
  const databasePath = resolveDemoDatabasePath();
  const { composition, server } = await createPersistentDemoServer(databasePath);

  const port = resolvePort(process.env["PORT"]);
  const host = "127.0.0.1";

  server.listen(port, host, () => {
    // Surface the DB path + seed outcome so a restart is observable: the first
    // boot logs "seeded", later boots over the same file log "reused".
    console.log(`Persistent demo DB: ${composition.databasePath} (${composition.seedOutcome})`);
    console.log(
      `Persistent demo GraphQL API listening at http://${host}:${String(port)}/graphql`
    );
  });
};

// Run only when executed directly (e.g. `tsx src/demo/persistent-server.ts`), not
// on import from the durability test.
const invokedPath = process.argv[1];

if (invokedPath !== undefined && import.meta.url === `file://${invokedPath}`) {
  void main();
}
