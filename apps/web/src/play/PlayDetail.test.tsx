import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PlayDetail } from "./PlayDetail.js";
import { findSampleTrackSetDetail } from "./sample-data.js";

const detail = findSampleTrackSetDetail("track-set-build-my-life");

if (detail === undefined) {
  throw new Error("Expected the seeded sample track set detail.");
}

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
