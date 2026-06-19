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
});
