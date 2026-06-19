// @vitest-environment node
/**
 * END-TO-END CONTRACT tests: the REAL web GraphQL clients against the REAL booted
 * GraphQL HTTP server, over the wire.
 *
 * WHY THIS FILE EXISTS (the gap it closes): the four web clients
 * (`apps/web/src/{charts,play,community,obs}/client.ts`) hand-write GraphQL
 * query/mutation STRINGS against locally-declared TypeScript types. The web unit
 * tests drive those clients against FAKE in-process data sources; the api tests
 * execute the schema in-process. NOTHING else drives the actual web client code
 * against the actual booted server over HTTP — so a drift between a client's query
 * and the live schema (a field rename, an enum-value mismatch, an input-shape
 * change, an auth-header bug) would pass every other test yet break the live app.
 * This suite boots the persistent demo composition behind the real Presenter
 * GraphQL HTTP server on an ephemeral port and runs the unmodified clients against
 * it, so any such drift fails here.
 *
 * WIRING: it imports the DEMO composition + the HTTP-server factory from the
 * package's public `@sanctuary-os/api/demo` entry (a dev-only devDependency of
 * `apps/web` — never bundled into the web app). It uses the PERSISTENT
 * (on-disk `node:sqlite`) composition so the gated WRITE flows also exercise REAL
 * persistence end to end. The four clients are pointed at
 * `http://127.0.0.1:<port>/graphql` via their existing `endpoint` option, with the
 * demo `DEFAULT_AUTH_TOKEN`. The whole suite skips gracefully when `node:sqlite`
 * is unavailable (mirrors `apps/api/src/demo/persistent-server.test.ts`).
 *
 * SAFETY: the composition is the same DEMO one shipped behind `dev:persistent` —
 * the fixed `DemoAuthBoundary` (one tenant-scoped actor), the FAKE OBS control
 * port (no real obs-websocket), no real comms/AI, and PII-safe seed data only.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  createPersistentDemoComposition,
  createPresenterGraphqlHttpServer,
  DEMO_OBS_CONNECTION,
  type PersistentDemoComposition
} from "@sanctuary-os/api/demo";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createChartsClient,
  DEFAULT_AUTH_TOKEN as CHARTS_AUTH_TOKEN
} from "../charts/client.js";
import { createCommunityClient } from "../community/client.js";
import {
  createObsClient,
  START_STREAM_ACTION_KIND,
  STOP_STREAM_ACTION_KIND
} from "../obs/client.js";
import { createPlayClient } from "../play/client.js";

/**
 * `node:sqlite` is only present on Node >= 22.6 (stable) — skip the whole suite
 * cleanly when it is unavailable, exactly as `persistent-server.test.ts` does, so
 * the e2e file is a no-op rather than a failure on an older runtime.
 */
const loadNodeSqlite = async (): Promise<typeof import("node:sqlite") | undefined> => {
  try {
    return await import("node:sqlite");
  } catch {
    return undefined;
  }
};

const nodeSqlite = await loadNodeSqlite();
const describeE2e = nodeSqlite === undefined ? describe.skip : describe;

// The demo actor ref the web sample data uses for human-origin gated actions
// (matches `apps/web/src/obs/sample-data.ts`'s `DEMO_OBS_ACTOR_REF`).
const DEMO_OPERATOR_REF = "demo-web-operator";

describeE2e("e2e contract: real web clients <-> real booted GraphQL server", () => {
  // Typed `| undefined` (not definitely-assigned) so the afterAll teardown stays
  // robust — and its null-guards stay genuinely necessary under the strict
  // `no-unnecessary-condition` lint rule — even if beforeAll throws partway.
  let server: Server | undefined;
  let composition: PersistentDemoComposition | undefined;
  let baseUrl = "";
  let tempDir: string | undefined;

  // Each client is the REAL production client, pointed at the booted server via
  // its existing `endpoint` option and carrying the demo auth token. Constructed
  // once the server is listening (in `beforeAll`).
  let charts: ReturnType<typeof createChartsClient>;
  let play: ReturnType<typeof createPlayClient>;
  let community: ReturnType<typeof createCommunityClient>;
  let obs: ReturnType<typeof createObsClient>;

  beforeAll(async () => {
    // Unique on-disk temp DB so the PERSISTENT composition is exercised (the WRITE
    // flows below prove real durability, not just an in-memory round-trip).
    tempDir = mkdtempSync(join(tmpdir(), "sanctuary-web-e2e-"));
    const tempDbPath = join(tempDir, "contract.db");

    composition = await createPersistentDemoComposition(tempDbPath);
    // Capture in a non-nullable local for use across the async listen boundary,
    // then publish to the outer (teardown-visible) handle.
    const httpServer = createPresenterGraphqlHttpServer({
      authBoundary: composition.authBoundary,
      schema: composition.schema
    });
    server = httpServer;

    // Bind to an ephemeral port on loopback; await the 'listening' callback (no
    // fixed sleep), then read the assigned port — mirrors the api server tests.
    await new Promise<void>((resolve) => {
      httpServer.listen(0, "127.0.0.1", () => {
        resolve();
      });
    });
    const address = httpServer.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${String(address.port)}/graphql`;

    const clientOptions = { authToken: CHARTS_AUTH_TOKEN, endpoint: baseUrl };
    charts = createChartsClient(clientOptions);
    play = createPlayClient(clientOptions);
    community = createCommunityClient(clientOptions);
    obs = createObsClient(clientOptions);
  });

  afterAll(async () => {
    // Close the listener (await the callback), dispose the SQLite handle, and
    // delete the temp dir — no leaked port, handle, or file.
    const httpServer = server;
    if (httpServer !== undefined) {
      await new Promise<void>((resolve) => {
        httpServer.close(() => {
          resolve();
        });
      });
    }
    composition?.dispose();
    if (tempDir !== undefined) {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  // ---------------------------------------------------------------------------
  // CHARTS
  // ---------------------------------------------------------------------------
  describe("charts", () => {
    it("READ: lists the 3 seeded charts with the expected shape (drift check)", async () => {
      const list = await charts.listCharts();

      // A GraphQL error or a field/shape mismatch would have thrown inside the
      // client before reaching here, so reaching here at all proves the wire
      // contract; the data assertions pin the seed.
      expect(list).toHaveLength(3);
      const titles = list.map((chart) => chart.title).sort();
      expect(titles).toEqual(["Amazing Grace", "Cornerstone", "How Great Thou Art"]);

      const amazing = list.find((chart) => chart.chartId === "chart-amazing-grace");
      expect(amazing).toBeDefined();
      expect(amazing?.defaultKey).toBe("G");
      expect(amazing?.tenantId).toBe("tenant-demo");
      expect(amazing?.chordProSource).toContain("Amazing");
    });

    it("WRITE: updateChartSource round-trips and the change persists (re-read via client)", async () => {
      const nextSource = "{title: Cornerstone}\n{key: A}\n[A]Christ a[D]lone, corner[E]stone";

      const updated = await charts.updateChartSource("chart-cornerstone", nextSource, "A");
      expect(updated.chartId).toBe("chart-cornerstone");
      expect(updated.chordProSource).toBe(nextSource);
      expect(updated.defaultKey).toBe("A");

      // Re-read through a SEPARATE client call: proves the mutation hit real
      // persistence over the wire, not just an echo of the mutation response.
      const reread = await charts.getChart("chart-cornerstone");
      expect(reread).not.toBeNull();
      expect(reread?.chordProSource).toBe(nextSource);
      expect(reread?.defaultKey).toBe("A");
    });
  });

  // ---------------------------------------------------------------------------
  // PLAY
  // ---------------------------------------------------------------------------
  describe("play", () => {
    it("READ: lists the seeded track sets and loads detail (sections + cues) with shape", async () => {
      const trackSets = await play.listTrackSets();
      expect(trackSets).toHaveLength(2);
      const titles = trackSets.map((trackSet) => trackSet.title).sort();
      expect(titles).toEqual(["Build My Life", "Goodness of God"]);

      const detail = await play.getTrackSetDetail("track-set-build-my-life");
      expect(detail).not.toBeNull();
      expect(detail?.trackSet.trackSetId).toBe("track-set-build-my-life");
      // Build My Life seeds 3 sections (intro / verse / chorus) + 2 cues.
      expect(detail?.sections).toHaveLength(3);
      expect(detail?.sections.map((section) => section.kind)).toContain("chorus");
      expect(detail?.cues).toHaveLength(2);
    });

    it("WRITE: setPlaybackState set + read-back round-trips over real persistence", async () => {
      const next = await play.setPlaybackState({
        activeSectionRef: "section-bml-chorus",
        clickEnabled: false,
        positionBeats: 24,
        trackSetId: "track-set-build-my-life",
        transportStatus: "playing"
      });
      expect(next.transportStatus).toBe("playing");
      expect(next.positionBeats).toBe(24);
      expect(next.activeSectionRef).toBe("section-bml-chorus");
      expect(next.clickEnabled).toBe(false);

      const reread = await play.getPlaybackState("track-set-build-my-life");
      expect(reread).not.toBeNull();
      expect(reread?.transportStatus).toBe("playing");
      expect(reread?.positionBeats).toBe(24);
      expect(reread?.activeSectionRef).toBe("section-bml-chorus");
    });
  });

  // ---------------------------------------------------------------------------
  // COMMUNITY
  // ---------------------------------------------------------------------------
  describe("community", () => {
    it("READ: lists the 2 seeded groups and loads a group's members with shape", async () => {
      const groups = await community.listCommunityGroups();
      expect(groups).toHaveLength(2);
      const labels = groups.map((group) => group.label).sort();
      expect(labels).toEqual(["Hospitality Team", "Tuesday Small Group"]);

      const detail = await community.getCommunityGroupDetail("group-hospitality");
      expect(detail).not.toBeNull();
      expect(detail?.group.groupId).toBe("group-hospitality");
      // Hospitality Team seeds 3 memberships (Anita leader / David / Maria). Each
      // row joins a membership to its member + engagement summary.
      expect(detail?.members.length).toBeGreaterThanOrEqual(3);
      const anita = detail?.members.find(
        (row) => row.membership.memberRef === "member-anita"
      );
      expect(anita).toBeDefined();
      expect(anita?.membership.roleInGroup).toBe("leader");
      // PII-safe: members surface a displayName + opaque refs, never a contact value.
      expect(anita?.member?.displayName).toBe("Anita Bello");
    });

    it("WRITE/GATED: the comms gate lifecycle (draft -> confirm -> queue) over real HTTP", async () => {
      // Draft an SMS to the Hospitality Team. Anita has SMS consent GRANTED in the
      // seed, so the consent-resolved audience is non-empty and the queue step
      // (which refuses an all-suppressed audience) succeeds.
      const draft = await community.composeDraft({
        bodyTemplate: "Reminder: hospitality team meets Sunday at 9am.",
        channel: "sms",
        groupId: "group-hospitality"
      });
      expect(draft.messageId.length).toBeGreaterThan(0);
      expect(draft.status).toBe("draft");
      expect(draft.origin).toBe("human");

      // confirmAndQueue drives resolvedAudience -> markReviewed -> confirmSend ->
      // queueConfirmedCommunication through the real server + persistence. The
      // included recipient (Anita) proves consent resolution ran server-side.
      const queued = await community.confirmAndQueue({
        confirmedByRef: DEMO_OPERATOR_REF,
        messageId: draft.messageId,
        reason: "Approved by worship leader for Sunday reminder."
      });
      expect(queued.message.messageId).toBe(draft.messageId);
      // The demo's default send port runs synchronously, so the queue step
      // advances queue -> send and the message lands at `sent` (the real
      // end-of-lifecycle status, not a stuck `queued`).
      expect(queued.message.status).toBe("sent");
      // At least Anita (SMS consent granted in the seed) resolved into the
      // consent-filtered audience — proving server-side consent resolution ran.
      expect(queued.includedCount).toBeGreaterThanOrEqual(1);
    });
  });

  // ---------------------------------------------------------------------------
  // OBS (the safety-critical request -> confirm -> dispatch gate)
  // ---------------------------------------------------------------------------
  describe("obs", () => {
    const connectionProfileId = DEMO_OBS_CONNECTION.connectionProfileId;

    it("READ: loads the console with the seeded connection, scenes, and stream state", async () => {
      const console_ = await obs.loadConsole();

      expect(console_.connection).not.toBeNull();
      expect(console_.connection?.connectionProfileId).toBe(connectionProfileId);
      expect(console_.connection?.label).toBe("Sanctuary OBS");
      // Worship / Sermon / Announcements, Worship on program at boot.
      const sceneNames = console_.scenes.map((scene) => scene.displayName).sort();
      expect(sceneNames).toEqual(["Announcements", "Sermon", "Worship"]);
      const program = console_.scenes.find((scene) => scene.isCurrentProgramScene);
      expect(program?.obsSceneRef).toBe("scene-worship");
      expect(console_.streamState?.streamStatus).toBe("active");
    });

    it("GATED scene switch: dispatch WITHOUT confirm is refused (NOT_CONFIRMED), then confirm -> dispatch succeeds and a refreshed read reflects it", async () => {
      const requested = await obs.requestSwitchScene({
        connectionProfileId,
        requestedByRef: DEMO_OPERATOR_REF,
        targetSceneRef: "scene-sermon"
      });
      expect(requested.status).toBe("requested");
      expect(requested.targetSceneRef).toBe("scene-sermon");

      // THE GATE: dispatching a merely-requested intent must be refused by the
      // server BEFORE any port call. The web client surfaces the server's
      // safeMessage (the `NOT_CONFIRMED` domain error's pre-redacted text), so the
      // thrown error proves the gate held over the wire — not a fake.
      await expect(
        obs.dispatchAction({ actionIntentId: requested.actionIntentId })
      ).rejects.toThrow(/confirm/i);

      // Confirm (human step), then dispatch — now it goes live through the fake
      // control port server-side.
      const confirmed = await obs.confirmAction({
        actionIntentId: requested.actionIntentId,
        confirmedByRef: DEMO_OPERATOR_REF,
        reason: "Going to the sermon scene for the message."
      });
      expect(confirmed.status).toBe("confirmed");

      const dispatched = await obs.dispatchAction({
        actionIntentId: requested.actionIntentId
      });
      expect(["dispatched", "succeeded"]).toContain(dispatched.status);

      // The dispatch drove the (fake) OBS port live; the durable scene snapshot's
      // program flag is reconciled by an explicit catalog refresh (the same call
      // the live OBS screen makes). After refresh, a fresh READ reflects the
      // switch — proving the change is readable back over the wire end to end.
      await obs.refreshCatalog(connectionProfileId);
      const after = await obs.loadConsole();
      const programAfter = after.scenes.find((scene) => scene.isCurrentProgramScene);
      expect(programAfter?.obsSceneRef).toBe("scene-sermon");
    });

    it("GATED stream stop/start: request -> confirm -> dispatch flips the stream state, refused without confirm", async () => {
      // Stream is active at boot; stop it through the gate. Cover BOTH a stream
      // stop and a subsequent start to exercise the stream-action kind path.
      const requestedStop = await obs.requestStreamAction({
        connectionProfileId,
        kind: STOP_STREAM_ACTION_KIND,
        requestedByRef: DEMO_OPERATOR_REF
      });
      expect(requestedStop.status).toBe("requested");

      // Gate also holds for stream actions: no confirm -> NOT_CONFIRMED.
      await expect(
        obs.dispatchAction({ actionIntentId: requestedStop.actionIntentId })
      ).rejects.toThrow(/confirm/i);

      await obs.confirmAction({
        actionIntentId: requestedStop.actionIntentId,
        confirmedByRef: DEMO_OPERATOR_REF,
        reason: "Stopping the stream after the service."
      });
      await obs.dispatchAction({ actionIntentId: requestedStop.actionIntentId });

      const afterStop = await obs.loadConsole();
      expect(afterStop.streamState?.streamStatus).toBe("inactive");

      // Now start it again through the gate to exercise the start kind too.
      const requestedStart = await obs.requestStreamAction({
        connectionProfileId,
        kind: START_STREAM_ACTION_KIND,
        requestedByRef: DEMO_OPERATOR_REF
      });
      await obs.confirmAction({
        actionIntentId: requestedStart.actionIntentId,
        confirmedByRef: DEMO_OPERATOR_REF,
        reason: "Restarting the stream for the next gathering."
      });
      await obs.dispatchAction({ actionIntentId: requestedStart.actionIntentId });

      const afterStart = await obs.loadConsole();
      expect(afterStart.streamState?.streamStatus).toBe("active");
    });
  });

  // ---------------------------------------------------------------------------
  // AUTH BOUNDARY (over the wire)
  // ---------------------------------------------------------------------------
  describe("auth boundary", () => {
    it("a request WITH the demo token succeeds (proves the real auth path resolves an actor)", async () => {
      // The clients always send `Authorization: Bearer <token>`; a successful
      // read above already exercised this, but assert it directly here too.
      const list = await charts.listCharts();
      expect(list.length).toBeGreaterThan(0);
    });

    it("a request with a MISSING Authorization header is rejected with HTTP 401 (real auth guard, not a fake)", async () => {
      // The clients can never omit the header, so hit the wire directly to prove
      // the server's auth guard rejects an unauthenticated request. A drift that
      // dropped the auth requirement would let this 200 and break the contract.
      const response = await fetch(baseUrl, {
        body: JSON.stringify({ query: "query { charts { chartId } }" }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      expect(response.status).toBe(401);

      const payload = (await response.json()) as {
        readonly errors?: readonly { readonly message: string }[];
      };
      expect(payload.errors?.[0]?.message).toBe("Authentication is required.");
    });
  });
});
