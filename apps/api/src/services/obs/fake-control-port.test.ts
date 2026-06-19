import { describe, expect, it } from "vitest";
import {
  ObsControlError,
  isObsControlError,
  type ObsConnectionRef,
  type ObsControlErrorCode,
  type ObsSceneItemRef,
  type ObsSceneRef,
  type ObsSourceRef
} from "./control-port.js";
import {
  createFakeObsControlPort,
  type FakeObsControlPortConfig,
  type FakeObsOperation
} from "./fake-control-port.js";

const CONNECTION_REF = "vault://obs/sanctuary-stage" as ObsConnectionRef;
const SCENE_WORSHIP = "scene-worship-wide" as ObsSceneRef;
const SCENE_LOWER_THIRD = "scene-lower-third" as ObsSceneRef;
const SOURCE_LYRICS = "source-lyrics" as ObsSourceRef;
const SCENE_ITEM_LYRICS = "item-7" as ObsSceneItemRef;

/**
 * A representative two-scene / one-source / one-scene-item instance, program scene
 * = worship, stream + recording inactive. Each test gets a fresh fake.
 */
const baseConfig = (
  overrides: FakeObsControlPortConfig = {}
): FakeObsControlPortConfig => ({
  currentProgramSceneRef: SCENE_WORSHIP,
  scenes: [
    { displayName: "Worship Wide", obsSceneRef: SCENE_WORSHIP },
    { displayName: "Lower Third", obsSceneRef: SCENE_LOWER_THIRD }
  ],
  sceneItems: [
    {
      obsSceneItemId: SCENE_ITEM_LYRICS,
      obsSceneRef: SCENE_WORSHIP,
      obsSourceRef: SOURCE_LYRICS,
      visibleHint: true
    }
  ],
  sources: [
    {
      activeHint: true,
      kindLabel: "browser_source",
      mutedHint: false,
      obsSourceRef: SOURCE_LYRICS
    }
  ],
  ...overrides
});

/** Forbidden secret keys that must never appear anywhere in a port result. */
const FORBIDDEN_SECRET_KEYS: ReadonlySet<string> = new Set([
  "host",
  "port",
  "password",
  "token",
  "authToken",
  "streamKey",
  "secret",
  "connectionRef",
  "url"
]);

const SECRET_LIKE = /(?:password|token|stream-?key|secret|:\/\/|@[\w.-]+:\d)/iu;

/**
 * Recursively assert a port result carries no secret key and no secret-looking
 * string value. Defence-in-depth behind the secret-free-by-construction result
 * schemas — a future leak fails loudly here.
 */
const assertSecretFree = (value: unknown): void => {
  if (typeof value === "string") {
    expect(SECRET_LIKE.test(value)).toBe(false);

    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      assertSecretFree(entry);
    }

    return;
  }

  if (value !== null && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      expect(FORBIDDEN_SECRET_KEYS.has(key)).toBe(false);
      assertSecretFree(nested);
    }
  }
};

const captureError = async (operation: Promise<unknown>): Promise<unknown> =>
  operation.then(
    () => undefined,
    (caught: unknown) => caught
  );

describe("createFakeObsControlPort connect + catalog reads", () => {
  it("connect returns a connected, secret-free info result", async () => {
    const fake = createFakeObsControlPort(baseConfig());

    const info = await fake.port.connect(CONNECTION_REF);

    expect(info.connectionStatus).toBe("connected");
    assertSecretFree(info);
  });

  it("getSceneList returns the configured catalog with the current program scene flagged", async () => {
    const fake = createFakeObsControlPort(baseConfig());

    const catalog = await fake.port.getSceneList(CONNECTION_REF);

    expect(catalog.currentProgramSceneRef).toBe(SCENE_WORSHIP);
    expect(catalog.scenes).toHaveLength(2);
    expect(
      catalog.scenes.find((scene) => scene.obsSceneRef === SCENE_WORSHIP)
        ?.isCurrentProgramScene
    ).toBe(true);
    expect(
      catalog.scenes.find((scene) => scene.obsSceneRef === SCENE_LOWER_THIRD)
        ?.isCurrentProgramScene
    ).toBe(false);
    expect(catalog.sources).toHaveLength(1);
    expect(catalog.sceneItems).toHaveLength(1);
    assertSecretFree(catalog);
  });

  it("getCurrentProgramScene returns the program scene ref", async () => {
    const fake = createFakeObsControlPort(baseConfig());

    const program = await fake.port.getCurrentProgramScene(CONNECTION_REF);

    expect(program.currentProgramSceneRef).toBe(SCENE_WORSHIP);
    assertSecretFree(program);
  });
});

describe("createFakeObsControlPort scene switch", () => {
  it("setCurrentProgramScene changes the observed program scene", async () => {
    const fake = createFakeObsControlPort(baseConfig());

    await fake.port.setCurrentProgramScene(CONNECTION_REF, SCENE_LOWER_THIRD);

    expect(fake.currentProgramSceneRef()).toBe(SCENE_LOWER_THIRD);
    const program = await fake.port.getCurrentProgramScene(CONNECTION_REF);
    expect(program.currentProgramSceneRef).toBe(SCENE_LOWER_THIRD);
    const catalog = await fake.port.getSceneList(CONNECTION_REF);
    expect(
      catalog.scenes.find((scene) => scene.obsSceneRef === SCENE_LOWER_THIRD)
        ?.isCurrentProgramScene
    ).toBe(true);
  });

  it("setCurrentProgramScene to an unknown scene rejects as not-found", async () => {
    const fake = createFakeObsControlPort(baseConfig());

    const error = await captureError(
      fake.port.setCurrentProgramScene(
        CONNECTION_REF,
        "scene-missing" as ObsSceneRef
      )
    );

    expect(isObsControlError(error)).toBe(true);
    if (isObsControlError(error)) {
      expect(error.code).toBe("not-found");
    }
    // Unchanged program scene after a rejected switch.
    expect(fake.currentProgramSceneRef()).toBe(SCENE_WORSHIP);
  });
});

describe("createFakeObsControlPort source toggles", () => {
  it("setSceneItemEnabled toggles the scene-item visibility hint", async () => {
    const fake = createFakeObsControlPort(baseConfig());

    await fake.port.setSceneItemEnabled(CONNECTION_REF, {
      enabled: false,
      obsSceneItemId: SCENE_ITEM_LYRICS,
      obsSceneRef: SCENE_WORSHIP
    });

    const catalog = await fake.port.getSceneList(CONNECTION_REF);
    expect(catalog.sceneItems[0]?.visibleHint).toBe(false);
  });

  it("setInputMute toggles the source mute hint", async () => {
    const fake = createFakeObsControlPort(baseConfig());

    await fake.port.setInputMute(CONNECTION_REF, {
      muted: true,
      obsSourceRef: SOURCE_LYRICS
    });

    const catalog = await fake.port.getSceneList(CONNECTION_REF);
    expect(catalog.sources[0]?.mutedHint).toBe(true);
  });

  it("setInputMute on an unknown source rejects as not-found", async () => {
    const fake = createFakeObsControlPort(baseConfig());

    const error = await captureError(
      fake.port.setInputMute(CONNECTION_REF, {
        muted: true,
        obsSourceRef: "source-missing" as ObsSourceRef
      })
    );

    expect(isObsControlError(error)).toBe(true);
    if (isObsControlError(error)) {
      expect(error.code).toBe("not-found");
    }
  });
});

describe("createFakeObsControlPort stream + recording transitions", () => {
  it("startStream then stopStream transitions stream status and reports it", async () => {
    const fake = createFakeObsControlPort(baseConfig());

    expect(fake.streamStatus()).toBe("inactive");

    const started = await fake.port.startStream(CONNECTION_REF);
    expect(started.streamStatus).toBe("active");
    expect(fake.streamStatus()).toBe("active");
    expect((await fake.port.getStreamStatus(CONNECTION_REF)).streamStatus).toBe(
      "active"
    );
    assertSecretFree(started);

    const stopped = await fake.port.stopStream(CONNECTION_REF);
    expect(stopped.streamStatus).toBe("inactive");
    expect(fake.streamStatus()).toBe("inactive");
  });

  it("startRecord then stopRecord transitions recording status and reports it", async () => {
    const fake = createFakeObsControlPort(baseConfig());

    const started = await fake.port.startRecord(CONNECTION_REF);
    expect(started.recordingStatus).toBe("active");
    expect(fake.recordingStatus()).toBe("active");
    expect(
      (await fake.port.getRecordStatus(CONNECTION_REF)).recordingStatus
    ).toBe("active");
    assertSecretFree(started);

    const stopped = await fake.port.stopRecord(CONNECTION_REF);
    expect(stopped.recordingStatus).toBe("inactive");
    expect(fake.recordingStatus()).toBe("inactive");
  });
});

describe("createFakeObsControlPort secret-free results", () => {
  it("no result from any read or status method carries a secret key or value", async () => {
    const fake = createFakeObsControlPort(baseConfig());

    const results: readonly unknown[] = [
      await fake.port.connect(CONNECTION_REF),
      await fake.port.getSceneList(CONNECTION_REF),
      await fake.port.getCurrentProgramScene(CONNECTION_REF),
      await fake.port.getStreamStatus(CONNECTION_REF),
      await fake.port.getRecordStatus(CONNECTION_REF),
      await fake.port.startStream(CONNECTION_REF),
      await fake.port.startRecord(CONNECTION_REF)
    ];

    for (const result of results) {
      assertSecretFree(result);
    }
  });

  it("a result built from a credential-looking connectionRef still leaks no secret", async () => {
    // The connectionRef is an opaque vault handle; even a URL-shaped one must
    // never surface in a result — the port returns refs + coarse status only.
    const fake = createFakeObsControlPort(baseConfig());
    const credentialLikeRef =
      "wss://operator:hunter2@obs.local:4455" as ObsConnectionRef;

    const info = await fake.port.connect(credentialLikeRef);
    const catalog = await fake.port.getSceneList(credentialLikeRef);

    assertSecretFree(info);
    assertSecretFree(catalog);
  });
});

describe("createFakeObsControlPort injected failure modes", () => {
  const failureCases: readonly {
    readonly code: ObsControlErrorCode;
    readonly expectedRetryable: boolean;
    readonly operation: FakeObsOperation;
  }[] = [
    { code: "disconnected", expectedRetryable: true, operation: "connect" },
    {
      code: "action-rejected",
      expectedRetryable: false,
      operation: "setCurrentProgramScene"
    },
    { code: "not-found", expectedRetryable: false, operation: "getSceneList" },
    {
      code: "port-failure",
      expectedRetryable: false,
      operation: "startStream"
    }
  ];

  for (const failureCase of failureCases) {
    it(`surfaces an injected ${failureCase.code} on ${failureCase.operation} as a typed ObsControlError`, async () => {
      const fake = createFakeObsControlPort(
        baseConfig({
          failures: { [failureCase.operation]: { code: failureCase.code } }
        })
      );

      const invoke = async (): Promise<unknown> => {
        switch (failureCase.operation) {
          case "connect":
            return fake.port.connect(CONNECTION_REF);
          case "getSceneList":
            return fake.port.getSceneList(CONNECTION_REF);
          case "setCurrentProgramScene":
            return fake.port.setCurrentProgramScene(
              CONNECTION_REF,
              SCENE_LOWER_THIRD
            );
          case "startStream":
            return fake.port.startStream(CONNECTION_REF);
          default:
            throw new Error("unreachable failure operation");
        }
      };

      const error = await captureError(invoke());

      expect(isObsControlError(error)).toBe(true);
      if (isObsControlError(error)) {
        expect(error.code).toBe(failureCase.code);
        expect(error.retryable).toBe(failureCase.expectedRetryable);
        // Redacted: the safeMessage carries no secret, URL, or credential.
        expect(error.safeMessage.length).toBeGreaterThan(0);
        expect(SECRET_LIKE.test(error.safeMessage)).toBe(false);
        assertSecretFree({ message: error.message, safeMessage: error.safeMessage });
      }
    });
  }

  it("an injected disconnected failure carries no connection detail in the message", async () => {
    const fake = createFakeObsControlPort(
      baseConfig({ failures: { connect: { code: "disconnected" } } })
    );

    const error = await captureError(fake.port.connect(CONNECTION_REF));

    expect(error instanceof ObsControlError).toBe(true);
    if (error instanceof ObsControlError) {
      expect(error.safeMessage).not.toContain(CONNECTION_REF);
      expect(error.safeMessage).not.toContain("4455");
    }
  });

  it("setFailure / clearFailure inject and lift a failure mode at runtime", async () => {
    const fake = createFakeObsControlPort(baseConfig());

    fake.setFailure("startStream", { code: "action-rejected" });
    const rejected = await captureError(fake.port.startStream(CONNECTION_REF));
    expect(isObsControlError(rejected)).toBe(true);

    fake.clearFailure("startStream");
    const started = await fake.port.startStream(CONNECTION_REF);
    expect(started.streamStatus).toBe("active");
  });

  it("a retryable override is honored on an injected failure", async () => {
    const fake = createFakeObsControlPort(
      baseConfig({
        failures: { getSceneList: { code: "not-found", retryable: true } }
      })
    );

    const error = await captureError(fake.port.getSceneList(CONNECTION_REF));

    expect(isObsControlError(error)).toBe(true);
    if (isObsControlError(error)) {
      expect(error.retryable).toBe(true);
    }
  });
});

describe("createFakeObsControlPort call recording", () => {
  it("records each call in order with the connectionRef and opaque args", async () => {
    const fake = createFakeObsControlPort(baseConfig());

    await fake.port.connect(CONNECTION_REF);
    await fake.port.setCurrentProgramScene(CONNECTION_REF, SCENE_LOWER_THIRD);
    await fake.port.startStream(CONNECTION_REF);

    const calls = fake.calls();
    expect(calls.map((call) => call.operation)).toEqual([
      "connect",
      "setCurrentProgramScene",
      "startStream"
    ]);
    expect(calls.every((call) => call.connectionRef === CONNECTION_REF)).toBe(
      true
    );
    expect(calls[1]?.args).toEqual({ obsSceneRef: SCENE_LOWER_THIRD });
  });

  it("records a call even when the operation is rejected", async () => {
    const fake = createFakeObsControlPort(
      baseConfig({ failures: { startStream: { code: "action-rejected" } } })
    );

    await captureError(fake.port.startStream(CONNECTION_REF));

    expect(fake.calls().map((call) => call.operation)).toEqual(["startStream"]);
  });
});

describe("createFakeObsControlPort determinism", () => {
  it("two fakes seeded identically produce identical catalog reads", async () => {
    const first = createFakeObsControlPort(baseConfig());
    const second = createFakeObsControlPort(baseConfig());

    await first.port.setCurrentProgramScene(CONNECTION_REF, SCENE_LOWER_THIRD);
    await second.port.setCurrentProgramScene(CONNECTION_REF, SCENE_LOWER_THIRD);

    expect(await first.port.getSceneList(CONNECTION_REF)).toEqual(
      await second.port.getSceneList(CONNECTION_REF)
    );
  });

  it("a config mutation does not leak into an already-created fake", async () => {
    const config = baseConfig();
    const fake = createFakeObsControlPort(config);

    // Mutating the source array the caller passed must not affect the fake, which
    // copied its config defensively.
    (config.scenes as { displayName: string; obsSceneRef: string }[]).push({
      displayName: "Injected",
      obsSceneRef: "scene-injected"
    });

    const catalog = await fake.port.getSceneList(CONNECTION_REF);
    expect(catalog.scenes).toHaveLength(2);
  });
});
