import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ObsDataSource } from "./client.js";
import { createSampleObsDataSource, SAMPLE_OBS_CONSOLE } from "./sample-data.js";
import type { ObsActionIntent, ObsConsole } from "./types.js";
import { ObsScreen } from "./ObsScreen.js";

afterEach(() => {
  cleanup();
});

/**
 * Wrap a real `ObsDataSource` so a test can assert which action methods were
 * called and in what order. The shared `calls` log records the method names so a
 * test can prove dispatch never precedes (or runs without) a confirm.
 */
const spyOnDataSource = (
  inner: ObsDataSource
): { readonly source: ObsDataSource; readonly calls: string[] } => {
  const calls: string[] = [];

  return {
    calls,
    source: {
      loadConsole: (connectionProfileId?: string): Promise<ObsConsole> => {
        calls.push("loadConsole");

        return inner.loadConsole(connectionProfileId);
      },
      requestSwitchScene: (input): Promise<ObsActionIntent> => {
        calls.push("requestSwitchScene");

        return inner.requestSwitchScene(input);
      },
      confirmAction: (input): Promise<ObsActionIntent> => {
        calls.push("confirmAction");

        return inner.confirmAction(input);
      },
      dispatchAction: (input): Promise<ObsActionIntent> => {
        calls.push("dispatchAction");

        return inner.dispatchAction(input);
      },
      refreshCatalog: (connectionProfileId: string): Promise<void> => {
        calls.push("refreshCatalog");

        return inner.refreshCatalog(connectionProfileId);
      }
    }
  };
};

const getSermonSwitchButton = (): HTMLElement => {
  const scenes = screen.getByRole("list", { name: "OBS scenes" });
  const sermonRow = within(scenes).getByText("Sermon").closest("li");

  if (sermonRow === null) {
    throw new Error("Expected a Sermon scene row.");
  }

  return within(sermonRow).getByRole("button", { name: "Switch to this scene" });
};

/**
 * The display name of the program scene, read from the row badged "On air"
 * inside the OBS scenes list. Scoping to the list disambiguates the scene name
 * from the same name appearing in the open confirm gate's summary text.
 */
const getProgramSceneName = (): string => {
  const scenes = screen.getByRole("list", { name: "OBS scenes" });
  const programRow = within(scenes).getByText("On air").closest("li");

  if (programRow === null) {
    throw new Error("Expected a program scene row.");
  }

  return programRow.querySelector(".obs-scene-row__name")?.textContent ?? "";
};

describe("ObsScreen read view", () => {
  it("renders the scenes with the program scene highlighted and the demo badge", async () => {
    render(<ObsScreen dataSource={createSampleObsDataSource()} mode="demo" />);

    await waitFor(() => {
      expect(screen.getByText("Worship")).toBeInTheDocument();
    });

    expect(screen.getByText("demo data")).toBeInTheDocument();
    // Worship is the program scene: it is badged "On air" and has no switch button.
    const worshipRow = screen.getByText("Worship").closest("li");
    expect(worshipRow).not.toBeNull();
    expect(within(worshipRow as HTMLElement).getByText("On air")).toBeInTheDocument();
    expect(
      within(worshipRow as HTMLElement).queryByRole("button", {
        name: "Switch to this scene"
      })
    ).toBeNull();
    // Sermon + Announcements are not on air, so they offer a switch.
    expect(getSermonSwitchButton()).toBeInTheDocument();
  });

  it("shows the connection ref + stream/recording state (no secret rendered)", async () => {
    render(<ObsScreen dataSource={createSampleObsDataSource()} mode="demo" />);

    await waitFor(() => {
      expect(screen.getByText("Sanctuary OBS")).toBeInTheDocument();
    });

    expect(screen.getByText("vault://obs/demo-sanctuary")).toBeInTheDocument();
    expect(screen.getByText("Streaming")).toBeInTheDocument();
    expect(screen.getByText("Recording off")).toBeInTheDocument();
    // No secret-shaped value reaches the DOM.
    expect(document.body.textContent).not.toContain("ws://");
    expect(document.body.textContent).not.toContain("password");
  });

  it("shows an error state when the console fails to load", async () => {
    const failing: ObsDataSource = {
      loadConsole: (): Promise<never> => Promise.reject(new Error("OBS unreachable")),
      requestSwitchScene: (): Promise<never> => Promise.reject(new Error("unused")),
      confirmAction: (): Promise<never> => Promise.reject(new Error("unused")),
      dispatchAction: (): Promise<never> => Promise.reject(new Error("unused")),
      refreshCatalog: (): Promise<never> => Promise.reject(new Error("unused"))
    };

    render(<ObsScreen dataSource={failing} mode="live" />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("OBS unreachable");
    });
  });
});

describe("ObsScreen human-confirm gate", () => {
  it("requesting a switch shows the confirm step and does NOT dispatch", async () => {
    const user = userEvent.setup();
    const { source, calls } = spyOnDataSource(createSampleObsDataSource());
    render(<ObsScreen dataSource={source} mode="demo" />);

    await waitFor(() => {
      expect(screen.getByText("Sermon")).toBeInTheDocument();
    });

    await user.click(getSermonSwitchButton());

    // The confirm step appears...
    await waitFor(() => {
      expect(
        screen.getByRole("alertdialog", { name: "Confirm scene switch" })
      ).toBeInTheDocument();
    });
    expect(screen.getByText(/switches the LIVE program output/i)).toBeInTheDocument();

    // ...the request ran, but NOTHING was confirmed or dispatched.
    expect(calls).toContain("requestSwitchScene");
    expect(calls).not.toContain("confirmAction");
    expect(calls).not.toContain("dispatchAction");

    // The program scene is still Worship — nothing has gone live.
    expect(getProgramSceneName()).toBe("Worship");
  });

  it("Confirm calls confirm THEN dispatch and the program scene updates to the target", async () => {
    const user = userEvent.setup();
    const { source, calls } = spyOnDataSource(createSampleObsDataSource());
    render(<ObsScreen dataSource={source} mode="demo" />);

    await waitFor(() => {
      expect(screen.getByText("Sermon")).toBeInTheDocument();
    });

    await user.click(getSermonSwitchButton());

    const reason = await screen.findByLabelText(/Reason/);
    await user.type(reason, "Pastor is walking up");
    await user.click(screen.getByRole("button", { name: "Confirm and go live" }));

    // The program scene moves to Sermon (the dispatched result, after reload).
    await waitFor(() => {
      expect(getProgramSceneName()).toBe("Sermon");
    });

    // confirm ran before dispatch, and dispatch ran exactly once.
    const confirmIndex = calls.indexOf("confirmAction");
    const dispatchIndex = calls.indexOf("dispatchAction");
    expect(confirmIndex).toBeGreaterThanOrEqual(0);
    expect(dispatchIndex).toBeGreaterThan(confirmIndex);
    expect(calls.filter((call) => call === "dispatchAction")).toHaveLength(1);

    // The gate closed.
    expect(
      screen.queryByRole("alertdialog", { name: "Confirm scene switch" })
    ).toBeNull();
  });

  it("Cancel aborts the switch with no confirm and no dispatch", async () => {
    const user = userEvent.setup();
    const { source, calls } = spyOnDataSource(createSampleObsDataSource());
    render(<ObsScreen dataSource={source} mode="demo" />);

    await waitFor(() => {
      expect(screen.getByText("Sermon")).toBeInTheDocument();
    });

    await user.click(getSermonSwitchButton());
    await screen.findByRole("alertdialog", { name: "Confirm scene switch" });

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    // The gate closed, nothing confirmed/dispatched, program scene unchanged.
    await waitFor(() => {
      expect(
        screen.queryByRole("alertdialog", { name: "Confirm scene switch" })
      ).toBeNull();
    });
    expect(calls).not.toContain("confirmAction");
    expect(calls).not.toContain("dispatchAction");
    expect(getProgramSceneName()).toBe("Worship");
  });

  it("surfaces an error from the dispatch and keeps the program scene unchanged", async () => {
    const user = userEvent.setup();
    // A source whose dispatch always rejects (e.g. the server gate or OBS refused),
    // but whose request/confirm succeed.
    const requested: ObsActionIntent = {
      actionIntentId: "action_1",
      kind: "switch_scene",
      origin: "human",
      safeFailureMessage: null,
      status: "requested",
      targetSceneRef: "scene-sermon"
    };
    const dispatchAction = vi.fn<ObsDataSource["dispatchAction"]>(() =>
      Promise.reject(new Error("OBS rejected the requested action."))
    );
    const source: ObsDataSource = {
      loadConsole: (): Promise<ObsConsole> => Promise.resolve(SAMPLE_OBS_CONSOLE),
      requestSwitchScene: (): Promise<ObsActionIntent> => Promise.resolve(requested),
      confirmAction: (): Promise<ObsActionIntent> =>
        Promise.resolve({ ...requested, status: "confirmed" }),
      dispatchAction,
      refreshCatalog: (): Promise<void> => Promise.resolve()
    };

    render(<ObsScreen dataSource={source} mode="live" />);

    await waitFor(() => {
      expect(screen.getByText("Sermon")).toBeInTheDocument();
    });

    await user.click(getSermonSwitchButton());
    const reason = await screen.findByLabelText(/Reason/);
    await user.type(reason, "Go now");
    await user.click(screen.getByRole("button", { name: "Confirm and go live" }));

    // The error surfaces in the gate, which stays open for a retry/cancel.
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("OBS rejected the requested action.");
    });
    expect(dispatchAction).toHaveBeenCalledTimes(1);
    // Worship is still the program scene (the dispatch never moved it).
    expect(getProgramSceneName()).toBe("Worship");
  });

  it("never dispatches without a confirm even across the whole flow (call-order invariant)", async () => {
    const user = userEvent.setup();
    const { source, calls } = spyOnDataSource(createSampleObsDataSource());
    render(<ObsScreen dataSource={source} mode="demo" />);

    await waitFor(() => {
      expect(screen.getByText("Sermon")).toBeInTheDocument();
    });

    // Start a switch, then confirm it.
    await user.click(getSermonSwitchButton());
    const reason = await screen.findByLabelText(/Reason/);
    await user.type(reason, "Pastor up");
    await user.click(screen.getByRole("button", { name: "Confirm and go live" }));

    await waitFor(() => {
      expect(getProgramSceneName()).toBe("Sermon");
    });

    // INVARIANT: every dispatchAction is preceded by a confirmAction earlier in
    // the call log — there is no dispatch that was not gated by a confirm.
    calls.forEach((call, index) => {
      if (call === "dispatchAction") {
        expect(calls.slice(0, index)).toContain("confirmAction");
      }
    });
  });
});
