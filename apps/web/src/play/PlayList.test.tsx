import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlayList } from "./PlayList.js";
import { SAMPLE_TRACK_SETS } from "./sample-data.js";

afterEach(() => {
  cleanup();
});

describe("PlayList", () => {
  it("renders the title, key, and tempo of each sample track set", () => {
    render(
      <PlayList
        state={{ status: "loaded", trackSets: SAMPLE_TRACK_SETS }}
        selectedTrackSetId={null}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByText("Build My Life")).toBeInTheDocument();
    expect(screen.getByText("Goodness of God")).toBeInTheDocument();
    expect(screen.getByText("Key E")).toBeInTheDocument();
    expect(screen.getByText("68 bpm")).toBeInTheDocument();
  });

  it("invokes onSelect with the track set id when a row is clicked", async () => {
    const onSelect = vi.fn();
    const { userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();

    render(
      <PlayList
        state={{ status: "loaded", trackSets: SAMPLE_TRACK_SETS }}
        selectedTrackSetId={null}
        onSelect={onSelect}
      />
    );

    await user.click(screen.getByText("Goodness of God"));

    expect(onSelect).toHaveBeenCalledWith("track-set-goodness-of-god");
  });

  it("renders a loading state", () => {
    render(
      <PlayList
        state={{ status: "loading" }}
        selectedTrackSetId={null}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByRole("status")).toHaveTextContent("Loading track sets");
  });

  it("renders an empty state when there are no track sets", () => {
    render(
      <PlayList
        state={{ status: "loaded", trackSets: [] }}
        selectedTrackSetId={null}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByText("No track sets yet.")).toBeInTheDocument();
  });

  it("renders an error state", () => {
    render(
      <PlayList
        state={{ status: "error", message: "boom" }}
        selectedTrackSetId={null}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent("boom");
  });
});
