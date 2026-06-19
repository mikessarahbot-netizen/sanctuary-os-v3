import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SetPlaybackStateInput } from "./client.js";
import { PlayDetail, type PlayDetailPlayback } from "./PlayDetail.js";
import { findSampleTrackSetDetail } from "./sample-data.js";
import type { PlaybackState } from "./types.js";

const detail = findSampleTrackSetDetail("track-set-build-my-life");

if (detail === undefined) {
  throw new Error("Expected the seeded sample track set detail.");
}

const STOPPED_STATE: PlaybackState = {
  activePadLayerRef: null,
  activeSectionRef: "section-bml-intro",
  clickEnabled: true,
  positionBeats: 0,
  tenantId: "tenant-demo",
  trackSetId: "track-set-build-my-life",
  transportStatus: "stopped",
  updatedAt: "2026-04-12T17:30:00.000Z"
};

const resolvingOnSet = (
  result: PlaybackState
): ((input: SetPlaybackStateInput) => Promise<PlaybackState>) =>
  vi.fn<(input: SetPlaybackStateInput) => Promise<PlaybackState>>(() =>
    Promise.resolve(result)
  );

afterEach(() => {
  cleanup();
});

describe("PlayDetail", () => {
  it("renders the track set title, key, tempo, sections, and cues", () => {
    render(<PlayDetail state={{ status: "loaded", detail }} />);

    expect(
      screen.getByRole("heading", { name: "Build My Life" })
    ).toBeInTheDocument();

    expect(screen.getByText("E", { selector: "dd.chart-key" })).toBeInTheDocument();
    expect(screen.getByText("68 bpm")).toBeInTheDocument();

    // Sections of the arrangement render with their labels.
    expect(screen.getByText("Intro")).toBeInTheDocument();
    expect(screen.getByText("Verse 1")).toBeInTheDocument();
    expect(screen.getByText("Chorus")).toBeInTheDocument();

    // Cues render with their labels + actions.
    expect(screen.getByText("Start intro pad")).toBeInTheDocument();
    expect(screen.getByText("Jump to chorus")).toBeInTheDocument();
  });

  it("renders a loading state", () => {
    render(<PlayDetail state={{ status: "loading" }} />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading track set");
  });

  it("prompts to pick a track set when none is selected", () => {
    render(<PlayDetail state={{ status: "missing" }} />);

    expect(screen.getByText(/Select a track set/)).toBeInTheDocument();
  });

  it("renders an error state", () => {
    render(<PlayDetail state={{ status: "error", message: "nope" }} />);

    expect(screen.getByRole("alert")).toHaveTextContent("nope");
  });

  it("renders empty fallbacks when there are no sections or cues", () => {
    render(
      <PlayDetail
        state={{
          status: "loaded",
          detail: { cues: [], sections: [], trackSet: detail.trackSet }
        }}
      />
    );

    expect(
      screen.getByText("No sections for this arrangement.")
    ).toBeInTheDocument();
    expect(screen.getByText("No cues for this track set.")).toBeInTheDocument();
  });
});

describe("PlayDetail playback panel", () => {
  it("does not render the playback panel without a playback prop", () => {
    render(<PlayDetail state={{ status: "loaded", detail }} />);

    expect(screen.queryByLabelText("Playback")).toBeNull();
    expect(screen.queryByRole("button", { name: "Play" })).toBeNull();
  });

  it("shows the current transport status, active section label, and click state", () => {
    const playback: PlayDetailPlayback = {
      onSet: resolvingOnSet(STOPPED_STATE),
      state: STOPPED_STATE
    };
    render(<PlayDetail state={{ status: "loaded", detail }} playback={playback} />);

    const panel = screen.getByLabelText("Playback");
    expect(within(panel).getByLabelText("Transport Stopped")).toHaveTextContent(
      "Stopped"
    );
    // The active-section readout renders the human label, not the raw ref. Scope
    // to the readout `dd` since the "Set active section" list also shows "Intro".
    expect(
      within(panel).getByText("Intro", { selector: "dd.playback__section" })
    ).toBeInTheDocument();
    expect(within(panel).getByText("on")).toBeInTheDocument();
  });

  it("falls back to a stopped default when there is no playback state yet", () => {
    const playback: PlayDetailPlayback = {
      onSet: resolvingOnSet(STOPPED_STATE),
      state: null
    };
    render(<PlayDetail state={{ status: "loaded", detail }} playback={playback} />);

    expect(screen.getByLabelText("Transport Stopped")).toBeInTheDocument();
    expect(screen.getByText("off")).toBeInTheDocument();
  });

  it("calls onSet with transportStatus playing when Play is clicked", async () => {
    const user = userEvent.setup();
    const onSet = resolvingOnSet({ ...STOPPED_STATE, transportStatus: "playing" });
    render(
      <PlayDetail
        state={{ status: "loaded", detail }}
        playback={{ onSet, state: STOPPED_STATE }}
      />
    );

    await user.click(screen.getByRole("button", { name: "Play" }));

    expect(onSet).toHaveBeenCalledWith({
      activeSectionRef: "section-bml-intro",
      clickEnabled: true,
      positionBeats: 0,
      trackSetId: "track-set-build-my-life",
      transportStatus: "playing"
    });
  });

  it("calls onSet with transportStatus paused / stopped for Pause and Stop", async () => {
    const user = userEvent.setup();
    const playing: PlaybackState = { ...STOPPED_STATE, transportStatus: "playing" };

    const pauseOnSet = resolvingOnSet({ ...playing, transportStatus: "paused" });
    const { rerender } = render(
      <PlayDetail
        state={{ status: "loaded", detail }}
        playback={{ onSet: pauseOnSet, state: playing }}
      />
    );
    await user.click(screen.getByRole("button", { name: "Pause" }));
    expect(pauseOnSet).toHaveBeenCalledWith(
      expect.objectContaining({ transportStatus: "paused" })
    );

    const stopOnSet = resolvingOnSet({ ...playing, transportStatus: "stopped" });
    rerender(
      <PlayDetail
        state={{ status: "loaded", detail }}
        playback={{ onSet: stopOnSet, state: playing }}
      />
    );
    await user.click(screen.getByRole("button", { name: "Stop" }));
    expect(stopOnSet).toHaveBeenCalledWith(
      expect.objectContaining({ transportStatus: "stopped" })
    );
  });

  it("reflects the returned state after a transport write", async () => {
    const user = userEvent.setup();
    const playing: PlaybackState = { ...STOPPED_STATE, transportStatus: "playing" };
    const onSet = resolvingOnSet(playing);

    const { rerender } = render(
      <PlayDetail
        state={{ status: "loaded", detail }}
        playback={{ onSet, state: STOPPED_STATE }}
      />
    );

    await user.click(screen.getByRole("button", { name: "Play" }));

    // Simulate the screen feeding the returned state back through `playback`.
    rerender(
      <PlayDetail
        state={{ status: "loaded", detail }}
        playback={{ onSet, state: playing }}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Transport Playing")).toHaveTextContent(
        "Playing"
      );
    });
  });

  it("calls onSet with the chosen activeSectionRef when a section is selected", async () => {
    const user = userEvent.setup();
    const onSet = resolvingOnSet({
      ...STOPPED_STATE,
      activeSectionRef: "section-bml-chorus"
    });
    render(
      <PlayDetail
        state={{ status: "loaded", detail }}
        playback={{ onSet, state: STOPPED_STATE }}
      />
    );

    const setActive = screen.getByLabelText("Set active section");
    await user.click(within(setActive).getByRole("button", { name: /Chorus/ }));

    expect(onSet).toHaveBeenCalledWith({
      activeSectionRef: "section-bml-chorus",
      clickEnabled: true,
      positionBeats: 0,
      trackSetId: "track-set-build-my-life",
      transportStatus: "stopped"
    });
  });

  it("disables the controls while a write is in flight", async () => {
    const user = userEvent.setup();
    let resolveSet: ((state: PlaybackState) => void) | undefined;
    const onSet = vi.fn<(input: SetPlaybackStateInput) => Promise<PlaybackState>>(
      () =>
        new Promise<PlaybackState>((resolve) => {
          resolveSet = resolve;
        })
    );
    render(
      <PlayDetail
        state={{ status: "loaded", detail }}
        playback={{ onSet, state: STOPPED_STATE }}
      />
    );

    await user.click(screen.getByRole("button", { name: "Play" }));

    // While saving, the transport buttons are disabled and a saving hint shows.
    expect(screen.getByRole("button", { name: "Play" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Stop" })).toBeDisabled();
    expect(screen.getByText("Saving…")).toBeInTheDocument();
    expect(onSet).toHaveBeenCalledTimes(1);

    if (resolveSet === undefined) {
      throw new Error("Expected onSet to have been invoked.");
    }
    resolveSet({ ...STOPPED_STATE, transportStatus: "playing" });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Play" })).not.toBeDisabled();
    });
  });

  it("shows an error when the write fails", async () => {
    const user = userEvent.setup();
    const onSet = vi.fn<(input: SetPlaybackStateInput) => Promise<PlaybackState>>(
      () => Promise.reject(new Error("set failed"))
    );
    render(
      <PlayDetail
        state={{ status: "loaded", detail }}
        playback={{ onSet, state: STOPPED_STATE }}
      />
    );

    await user.click(screen.getByRole("button", { name: "Play" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("set failed");
    });
    // Controls re-enable so the operator can retry.
    expect(screen.getByRole("button", { name: "Play" })).not.toBeDisabled();
  });
});
