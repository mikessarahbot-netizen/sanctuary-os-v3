import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import type { PlayDataSource } from "./client.js";
import { createDemoPlayDataSource } from "./data-source.js";
import { PlayScreen } from "./PlayScreen.js";
import type { PlaybackState } from "./types.js";

afterEach(() => {
  cleanup();
});

describe("PlayScreen", () => {
  it("loads the track-set list from the data source and shows the demo badge", async () => {
    render(<PlayScreen dataSource={createDemoPlayDataSource()} mode="demo" />);

    await waitFor(() => {
      expect(screen.getByText("Build My Life")).toBeInTheDocument();
    });
    expect(screen.getByText("demo data")).toBeInTheDocument();
    expect(screen.getByText(/Select a track set/)).toBeInTheDocument();
  });

  it("loads a track set's detail (sections + cues) when its row is selected", async () => {
    const user = userEvent.setup();
    render(<PlayScreen dataSource={createDemoPlayDataSource()} mode="demo" />);

    await waitFor(() => {
      expect(screen.getByText("Goodness of God")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Goodness of God"));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Goodness of God" })
      ).toBeInTheDocument();
    });
    // The detail renders the arrangement's sections and the track set's cues.
    // Scope to the read-only Sections / Cues panels: the playback control's
    // "Set active section" list also references the section labels.
    const sections = screen.getByLabelText("Arrangement sections");
    expect(within(sections).getByText("Bridge")).toBeInTheDocument();
    const cues = screen.getByLabelText("Cues");
    expect(within(cues).getByText("Swell into bridge")).toBeInTheDocument();
  });

  it("shows an error state when the data source rejects", async () => {
    const failing: PlayDataSource = {
      listTrackSets: (): Promise<never> => Promise.reject(new Error("network down")),
      getTrackSetDetail: (): Promise<null> => Promise.resolve(null),
      getPlaybackState: (): Promise<null> => Promise.resolve(null),
      setPlaybackState: (): Promise<never> =>
        Promise.reject(new Error("not reached"))
    };

    render(<PlayScreen dataSource={failing} mode="live" />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("network down");
    });
  });

  it("loads the selected track set's playback state and drives the transport", async () => {
    const user = userEvent.setup();
    render(<PlayScreen dataSource={createDemoPlayDataSource()} mode="demo" />);

    await waitFor(() => {
      expect(screen.getByText("Build My Life")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Build My Life"));

    // The seeded Build My Life state opens stopped at the intro.
    const status = await screen.findByLabelText("Transport Stopped");
    expect(status).toHaveTextContent("Stopped");

    // Driving Play runs setPlaybackState and the panel reflects the new state.
    await user.click(screen.getByRole("button", { name: "Play" }));
    await waitFor(() => {
      expect(screen.getByLabelText("Transport Playing")).toHaveTextContent(
        "Playing"
      );
    });
  });

  it("defaults to stopped for a track set with no seeded playback state", async () => {
    const user = userEvent.setup();
    render(<PlayScreen dataSource={createDemoPlayDataSource()} mode="demo" />);

    await waitFor(() => {
      expect(screen.getByText("Goodness of God")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Goodness of God"));

    // No seed for Goodness of God: the panel falls back to its stopped default.
    expect(await screen.findByLabelText("Transport Stopped")).toBeInTheDocument();
  });

  it("loads the newly selected track set's playback state when switching", async () => {
    const user = userEvent.setup();
    const states = new Map<string, PlaybackState>([
      [
        "track-set-build-my-life",
        {
          activePadLayerRef: null,
          activeSectionRef: "section-bml-intro",
          clickEnabled: true,
          positionBeats: 0,
          tenantId: "tenant-demo",
          trackSetId: "track-set-build-my-life",
          transportStatus: "playing",
          updatedAt: "2026-04-12T17:30:00.000Z"
        }
      ]
    ]);
    const base = createDemoPlayDataSource();
    const dataSource: PlayDataSource = {
      ...base,
      getPlaybackState: (trackSetId: string): Promise<PlaybackState | null> =>
        Promise.resolve(states.get(trackSetId) ?? null)
    };

    render(<PlayScreen dataSource={dataSource} mode="demo" />);

    await waitFor(() => {
      expect(screen.getByText("Build My Life")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Build My Life"));
    expect(await screen.findByLabelText("Transport Playing")).toBeInTheDocument();

    // Switching to a track set without a state shows its stopped default, not the
    // previous track set's "playing" status.
    await user.click(screen.getByText("Goodness of God"));
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Goodness of God" })
      ).toBeInTheDocument();
    });
    expect(screen.getByLabelText("Transport Stopped")).toBeInTheDocument();
    expect(screen.queryByLabelText("Transport Playing")).toBeNull();
  });
});
