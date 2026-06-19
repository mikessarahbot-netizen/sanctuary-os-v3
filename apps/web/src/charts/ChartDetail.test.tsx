import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ChartDetail } from "./ChartDetail.js";
import { SAMPLE_CHARTS } from "./sample-data.js";

const [firstChart] = SAMPLE_CHARTS;

if (firstChart === undefined) {
  throw new Error("Expected at least one sample chart.");
}

afterEach(() => {
  cleanup();
});

describe("ChartDetail", () => {
  it("renders the title, default key, and ChordPro chords and lyrics", () => {
    render(<ChartDetail state={{ status: "loaded", chart: firstChart }} />);

    expect(
      screen.getByRole("heading", { name: "Amazing Grace" })
    ).toBeInTheDocument();

    const key = screen.getByText("G", { selector: "dd.chart-key" });
    expect(key).toBeInTheDocument();

    // ChordPro chord tokens are rendered (chords pulled out of [..] markers).
    expect(screen.getByText("G7")).toBeInTheDocument();
    expect(screen.getByText("Em")).toBeInTheDocument();
    // ...positioned above lyric fragments.
    expect(screen.getByText(/sweet the/)).toBeInTheDocument();
    // ...and directives render as section labels.
    expect(screen.getByText(/start_of_verse/)).toBeInTheDocument();
  });

  it("renders a loading state", () => {
    render(<ChartDetail state={{ status: "loading" }} />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading chart");
  });

  it("prompts to pick a chart when none is selected", () => {
    render(<ChartDetail state={{ status: "missing" }} />);

    expect(screen.getByText(/Select a chart/)).toBeInTheDocument();
  });

  it("renders an error state", () => {
    render(<ChartDetail state={{ status: "error", message: "nope" }} />);

    expect(screen.getByRole("alert")).toHaveTextContent("nope");
  });
});
