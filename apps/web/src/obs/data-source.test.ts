import { describe, expect, it } from "vitest";
import {
  createDemoObsDataSource,
  resolveObsDataSource,
  resolveObsDataSourceMode
} from "./data-source.js";

describe("resolveObsDataSourceMode", () => {
  it("defaults to demo with no signals", () => {
    expect(resolveObsDataSourceMode()).toBe("demo");
  });

  it("prefers an explicit mode argument", () => {
    expect(resolveObsDataSourceMode({ mode: "live", search: "?demo" })).toBe("live");
  });

  it("honours ?demo in the search", () => {
    expect(resolveObsDataSourceMode({ search: "?demo" })).toBe("demo");
  });

  it("honours ?source=live in the search", () => {
    expect(resolveObsDataSourceMode({ search: "?source=live" })).toBe("live");
  });

  it("honours ?source=demo in the search", () => {
    expect(resolveObsDataSourceMode({ search: "?source=demo" })).toBe("demo");
  });

  it("falls back to the env value when the search has no signal", () => {
    expect(resolveObsDataSourceMode({ envValue: "live" })).toBe("live");
  });

  it("ignores an unrecognised env value", () => {
    expect(resolveObsDataSourceMode({ envValue: "nonsense" })).toBe("demo");
  });
});

describe("resolveObsDataSource", () => {
  it("returns a demo source in demo mode", async () => {
    const source = resolveObsDataSource({ mode: "demo" });
    const console = await source.loadConsole();

    expect(console.connection?.label).toBe("Sanctuary OBS");
  });

  it("returns a live client in live mode (no demo data)", async () => {
    const source = resolveObsDataSource({
      mode: "live",
      // Point at a closed port; loading must reject (it is the live client, not
      // the demo fixture).
      endpoint: "http://127.0.0.1:0/graphql"
    });

    await expect(source.loadConsole()).rejects.toBeInstanceOf(Error);
  });
});

describe("createDemoObsDataSource", () => {
  it("seeds Worship as the current program scene", async () => {
    const source = createDemoObsDataSource();
    const console = await source.loadConsole();

    const program = console.scenes.find((scene) => scene.isCurrentProgramScene);
    expect(program?.displayName).toBe("Worship");
    expect(console.scenes.map((scene) => scene.displayName)).toEqual([
      "Worship",
      "Sermon",
      "Announcements"
    ]);
  });

  it("replays the gate: request does not move the program scene", async () => {
    const source = createDemoObsDataSource();
    const intent = await source.requestSwitchScene({
      connectionProfileId: "obs-connection-sanctuary",
      requestedByRef: "demo-web-operator",
      targetSceneRef: "scene-sermon"
    });

    expect(intent.status).toBe("requested");

    const afterRequest = await source.loadConsole();
    expect(
      afterRequest.scenes.find((scene) => scene.isCurrentProgramScene)?.displayName
    ).toBe("Worship");
  });

  it("replays the gate: confirm then dispatch moves the program scene", async () => {
    const source = createDemoObsDataSource();
    const requested = await source.requestSwitchScene({
      connectionProfileId: "obs-connection-sanctuary",
      requestedByRef: "demo-web-operator",
      targetSceneRef: "scene-sermon"
    });
    await source.confirmAction({
      actionIntentId: requested.actionIntentId,
      confirmedByRef: "demo-web-operator",
      reason: "Pastor up."
    });
    const dispatched = await source.dispatchAction({
      actionIntentId: requested.actionIntentId
    });

    expect(dispatched.status).toBe("succeeded");

    const afterDispatch = await source.loadConsole();
    expect(
      afterDispatch.scenes.find((scene) => scene.isCurrentProgramScene)?.displayName
    ).toBe("Sermon");
  });

  it("replays the gate: dispatch without confirm rejects and does not move the scene", async () => {
    const source = createDemoObsDataSource();
    const requested = await source.requestSwitchScene({
      connectionProfileId: "obs-connection-sanctuary",
      requestedByRef: "demo-web-operator",
      targetSceneRef: "scene-sermon"
    });

    await expect(
      source.dispatchAction({ actionIntentId: requested.actionIntentId })
    ).rejects.toThrow(/confirmed/);

    const afterReject = await source.loadConsole();
    expect(
      afterReject.scenes.find((scene) => scene.isCurrentProgramScene)?.displayName
    ).toBe("Worship");
  });

  it("boots with the stream live (active)", async () => {
    const source = createDemoObsDataSource();
    const console = await source.loadConsole();

    expect(console.streamState?.streamStatus).toBe("active");
  });

  it("replays the stream gate: a stop request does not change the stream status", async () => {
    const source = createDemoObsDataSource();
    const intent = await source.requestStreamAction({
      connectionProfileId: "obs-connection-sanctuary",
      kind: "stop_stream",
      requestedByRef: "demo-web-operator"
    });

    expect(intent.status).toBe("requested");
    expect(intent.kind).toBe("stop_stream");
    expect(intent.targetSceneRef).toBeNull();

    const afterRequest = await source.loadConsole();
    expect(afterRequest.streamState?.streamStatus).toBe("active");
  });

  it("replays the stream gate: confirm then dispatch flips active -> inactive -> active", async () => {
    const source = createDemoObsDataSource();

    // Stop: confirmed dispatch flips the stream off.
    const stop = await source.requestStreamAction({
      connectionProfileId: "obs-connection-sanctuary",
      kind: "stop_stream",
      requestedByRef: "demo-web-operator"
    });
    await source.confirmAction({
      actionIntentId: stop.actionIntentId,
      confirmedByRef: "demo-web-operator",
      reason: "Service has ended."
    });
    const stopped = await source.dispatchAction({ actionIntentId: stop.actionIntentId });
    expect(stopped.status).toBe("succeeded");
    expect((await source.loadConsole()).streamState?.streamStatus).toBe("inactive");

    // Start: confirmed dispatch flips the stream back on.
    const start = await source.requestStreamAction({
      connectionProfileId: "obs-connection-sanctuary",
      kind: "start_stream",
      requestedByRef: "demo-web-operator"
    });
    await source.confirmAction({
      actionIntentId: start.actionIntentId,
      confirmedByRef: "demo-web-operator",
      reason: "Service is starting."
    });
    const started = await source.dispatchAction({ actionIntentId: start.actionIntentId });
    expect(started.status).toBe("succeeded");
    expect((await source.loadConsole()).streamState?.streamStatus).toBe("active");
  });

  it("replays the stream gate: dispatch without confirm rejects and does not change the stream", async () => {
    const source = createDemoObsDataSource();
    const requested = await source.requestStreamAction({
      connectionProfileId: "obs-connection-sanctuary",
      kind: "stop_stream",
      requestedByRef: "demo-web-operator"
    });

    await expect(
      source.dispatchAction({ actionIntentId: requested.actionIntentId })
    ).rejects.toThrow(/confirmed/);

    expect((await source.loadConsole()).streamState?.streamStatus).toBe("active");
  });

  it("AI suggest returns a requested, ai_suggested switch-scene intent (no network)", async () => {
    const source = createDemoObsDataSource();
    const suggested = await source.suggestWithAi({
      connectionProfileId: "obs-connection-sanctuary",
      operatorIntent: "The pastor is walking up to preach",
      requestedByRef: "demo-web-operator"
    });

    expect(suggested.origin).toBe("ai_suggested");
    expect(suggested.status).toBe("requested");
    expect(suggested.kind).toBe("switch_scene");
    expect(suggested.targetSceneRef).toBe("scene-sermon");
    // The suggestion alone does NOT move the program scene — it is unconfirmed.
    expect(
      (await source.loadConsole()).scenes.find((scene) => scene.isCurrentProgramScene)
        ?.displayName
    ).toBe("Worship");
  });

  it("replays the gate for an ai-suggested intent: dispatch without confirm rejects", async () => {
    const source = createDemoObsDataSource();
    const suggested = await source.suggestWithAi({
      connectionProfileId: "obs-connection-sanctuary",
      requestedByRef: "demo-web-operator"
    });

    // SAME gate as a manual switch: an ai-suggested intent cannot dispatch unconfirmed.
    await expect(
      source.dispatchAction({ actionIntentId: suggested.actionIntentId })
    ).rejects.toThrow(/confirmed/);
    expect(
      (await source.loadConsole()).scenes.find((scene) => scene.isCurrentProgramScene)
        ?.displayName
    ).toBe("Worship");
  });

  it("replays the gate for an ai-suggested intent: confirm then dispatch moves the program scene", async () => {
    const source = createDemoObsDataSource();
    const suggested = await source.suggestWithAi({
      connectionProfileId: "obs-connection-sanctuary",
      requestedByRef: "demo-web-operator"
    });
    await source.confirmAction({
      actionIntentId: suggested.actionIntentId,
      confirmedByRef: "demo-web-operator",
      reason: "Reviewed; pastor is up."
    });
    const dispatched = await source.dispatchAction({
      actionIntentId: suggested.actionIntentId
    });

    expect(dispatched.status).toBe("succeeded");
    // Only AFTER the human confirm does the AI-suggested switch take effect.
    expect(
      (await source.loadConsole()).scenes.find((scene) => scene.isCurrentProgramScene)
        ?.displayName
    ).toBe("Sermon");
  });
});
