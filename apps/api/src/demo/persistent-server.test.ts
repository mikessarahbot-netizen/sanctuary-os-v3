import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AuthenticatedActor } from "../auth/index.js";
import { DEMO_ACTOR_ID, DEMO_TENANT_ID } from "./compose.js";
import {
  createPersistentDemoComposition,
  resolveDemoDatabasePath,
  type PersistentDemoComposition
} from "./persistent-server.js";

/**
 * Restart-durability gate for the persistent demo server.
 *
 * Boots TWO independent compositions over the SAME on-disk SQLite temp file
 * (closing the first handle before opening the second, so this is a real restart,
 * not a shared in-process store). It proves:
 *   1. First boot over an empty file SEEDS (outcome "seeded").
 *   2. A write made through instance A's command service SURVIVES into instance B
 *      (restart-durability) — both an updated chart source and a brand-new chart.
 *   3. Instance B does NOT re-seed (outcome "reused"): the seeded counts are
 *      unchanged across the reboot — no duplication.
 *   4. Cross-module durability: an OBS connection profile and a Community+ member
 *      seeded by A are readable in B.
 *   5. Migrations are idempotent across the two boots (no error, no dup tables).
 *
 * Mirrors the construction + assertion style of the per-module
 * `sqlite-integration.test.ts` files, and skips cleanly when `node:sqlite` is
 * unavailable.
 */
const demoActor: AuthenticatedActor = {
  actorId: DEMO_ACTOR_ID,
  roles: ["super_admin", "church_admin", "worship_leader", "planner", "musician"],
  tenantId: DEMO_TENANT_ID
};

const PROBE_CHART_ID = "chart-durability-probe";
const UPDATED_SOURCE = "{title: Amazing Grace}\n{key: A}\n[A]Durable [D]across a [E]restart";

const loadNodeSqlite = async (): Promise<typeof import("node:sqlite") | undefined> => {
  try {
    return await import("node:sqlite");
  } catch {
    return undefined;
  }
};

const nodeSqlite = await loadNodeSqlite();
const liveIt = nodeSqlite === undefined ? it.skip : it;

describe("persistent demo server (node:sqlite on-disk restart durability)", () => {
  const tempDirs: string[] = [];

  const makeTempDbPath = (): string => {
    const dir = mkdtempSync(join(tmpdir(), "sanctuary-persistent-demo-"));
    tempDirs.push(dir);

    return join(dir, "demo.db");
  };

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it("reports whether the in-process SQLite engine is available", () => {
    expect(
      nodeSqlite === undefined || typeof nodeSqlite.DatabaseSync === "function"
    ).toBe(true);
  });

  it("resolves the default DB path to the gitignored repo-root file when DEMO_DB_PATH is unset", () => {
    const resolved = resolveDemoDatabasePath({});
    expect(resolved.endsWith(".sanctuary-demo.db")).toBe(true);

    const overridden = resolveDemoDatabasePath({ DEMO_DB_PATH: "/tmp/example-demo.db" });
    expect(overridden).toBe("/tmp/example-demo.db");
  });

  liveIt(
    "seeds on the first boot, then preserves an extra write across a restart without re-seeding",
    async () => {
      const dbPath = makeTempDbPath();

      // ---- Instance A: empty file -> migrate + seed, then an extra write. ----
      const instanceA = await createPersistentDemoComposition(dbPath);
      let disposedA = false;
      try {
        expect(instanceA.seedOutcome).toBe("seeded");

        const seededCharts = await instanceA.adapters.charts.queryService.listCharts({
          actor: demoActor,
          input: {},
          requestId: "a-list-seeded"
        });
        // The three web sample charts were seeded.
        expect(seededCharts).toHaveLength(3);
        const seededIds = seededCharts.map((chart) => chart.chartId).sort();
        expect(seededIds).toEqual([
          "chart-amazing-grace",
          "chart-cornerstone",
          "chart-how-great-thou-art"
        ]);

        // Extra write 1: UPDATE an existing chart's source through the command
        // service (a mutation a live demo session would make).
        await instanceA.adapters.charts.commandService.updateChartSource({
          actor: demoActor,
          input: { chartId: "chart-amazing-grace", chordProSource: UPDATED_SOURCE },
          requestId: "a-update-source"
        });

        // Extra write 2: SAVE a brand-new chart so the count grows (lets B assert
        // the seed did not re-run AND the write persisted, in one count).
        await instanceA.adapters.charts.commandService.saveChart({
          actor: demoActor,
          input: {
            chartId: PROBE_CHART_ID,
            chordProSource: "{title: Durability Probe}\n[C]Written in [G]boot A",
            defaultKey: "C",
            songRef: "song-durability-probe",
            title: "Durability Probe"
          },
          requestId: "a-save-probe"
        });

        // Read the extra writes back within A.
        const afterWriteA = await instanceA.adapters.charts.queryService.listCharts({
          actor: demoActor,
          input: {},
          requestId: "a-list-after-write"
        });
        expect(afterWriteA).toHaveLength(4);
        const updatedInA = await instanceA.adapters.charts.queryService.getChart({
          actor: demoActor,
          input: { chartId: "chart-amazing-grace" },
          requestId: "a-get-updated"
        });
        expect(updatedInA?.chordProSource).toBe(UPDATED_SOURCE);

        // Dispose A: close the SQLite handle (a real restart releases the file).
        instanceA.dispose();
        disposedA = true;
      } finally {
        if (!disposedA) {
          instanceA.dispose();
        }
      }

      // ---- Instance B: SAME file, fresh composition -> must NOT re-seed. ----
      const instanceB = await createPersistentDemoComposition(dbPath);
      try {
        // Seed did NOT re-run: the store was already populated.
        expect(instanceB.seedOutcome).toBe("reused");

        // No duplication: still exactly the 3 seeded charts + the 1 probe written
        // in A — the seed did not append a second copy of the three samples.
        const chartsInB = await instanceB.adapters.charts.queryService.listCharts({
          actor: demoActor,
          input: {},
          requestId: "b-list"
        });
        expect(chartsInB).toHaveLength(4);
        const idCounts = new Map<string, number>();
        for (const chart of chartsInB) {
          idCounts.set(chart.chartId, (idCounts.get(chart.chartId) ?? 0) + 1);
        }
        // Each seeded id appears exactly once (no duplicate seed rows).
        expect(idCounts.get("chart-amazing-grace")).toBe(1);
        expect(idCounts.get("chart-cornerstone")).toBe(1);
        expect(idCounts.get("chart-how-great-thou-art")).toBe(1);

        // Restart-durability (write 1): the source UPDATE from A is readable in B.
        const updatedInB = await instanceB.adapters.charts.queryService.getChart({
          actor: demoActor,
          input: { chartId: "chart-amazing-grace" },
          requestId: "b-get-updated"
        });
        expect(updatedInB?.chordProSource).toBe(UPDATED_SOURCE);

        // Restart-durability (write 2): the new chart from A is present in B.
        const probeInB = await instanceB.adapters.charts.queryService.getChart({
          actor: demoActor,
          input: { chartId: PROBE_CHART_ID },
          requestId: "b-get-probe"
        });
        expect(probeInB?.title).toBe("Durability Probe");

        // Cross-module durability (OBS): the seeded connection profile survives.
        const obsProfilesInB =
          await instanceB.adapters.obs.queryService.listObsConnectionProfiles({
            actor: demoActor,
            input: {},
            requestId: "b-list-obs-profiles"
          });
        const sanctuary = obsProfilesInB.find(
          (profile) => profile.connectionProfileId === "obs-connection-sanctuary"
        );
        expect(sanctuary?.label).toBe("Sanctuary OBS");
        // Only an opaque vault ref persisted — never a secret.
        expect(sanctuary?.connectionRef).toBe("vault://obs/demo-sanctuary");

        // Cross-module durability (Community+): a seeded member survives.
        const membersInB = await instanceB.adapters.community.queryService.listMembers({
          actor: demoActor,
          input: {},
          requestId: "b-list-members"
        });
        const memberNames = membersInB.map((member) => member.displayName);
        expect(memberNames).toContain("Anita Bello");
        expect(memberNames).toContain("Jon Pierce");
      } finally {
        instanceB.dispose();
      }
    }
  );

  liveIt(
    "applies all four modules' migrations idempotently across two boots over the same file",
    async () => {
      const dbPath = makeTempDbPath();

      // The runner records applied migrations in a tracking table; a second boot
      // over the same file must skip them (no re-apply, no duplicate-table error).
      // createPersistentDemoComposition() applies all four modules' migrations on
      // every boot, so a clean second composition proves idempotency end-to-end.
      const first = await createPersistentDemoComposition(dbPath);
      first.dispose();

      let second: PersistentDemoComposition | undefined;
      await expect(
        (async (): Promise<void> => {
          second = await createPersistentDemoComposition(dbPath);
        })()
      ).resolves.toBeUndefined();

      // The second boot saw an already-seeded store, so it reused rather than
      // re-seeding — and it got there without a migration error.
      expect(second?.seedOutcome).toBe("reused");
      second?.dispose();
    }
  );
});
