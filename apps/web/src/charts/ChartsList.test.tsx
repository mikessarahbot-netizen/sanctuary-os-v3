import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChartsList } from "./ChartsList.js";
import { SAMPLE_CHARTS } from "./sample-data.js";

afterEach(() => {
  cleanup();
});

describe("ChartsList", () => {
  it("renders the title, key, and song ref of each sample chart", () => {
    render(
      <ChartsList
        state={{ status: "loaded", charts: SAMPLE_CHARTS }}
        selectedChartId={null}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByText("Amazing Grace")).toBeInTheDocument();
    expect(screen.getByText("How Great Thou Art")).toBeInTheDocument();
    expect(screen.getByText("Cornerstone")).toBeInTheDocument();
    expect(screen.getByText("Key G")).toBeInTheDocument();
    expect(screen.getByText("song-cornerstone")).toBeInTheDocument();
  });

  it("invokes onSelect with the chart id when a row is clicked", async () => {
    const onSelect = vi.fn();
    const { userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();

    render(
      <ChartsList
        state={{ status: "loaded", charts: SAMPLE_CHARTS }}
        selectedChartId={null}
        onSelect={onSelect}
      />
    );

    await user.click(screen.getByText("How Great Thou Art"));

    expect(onSelect).toHaveBeenCalledWith("chart-how-great-thou-art");
  });

  it("renders a loading state", () => {
    render(
      <ChartsList state={{ status: "loading" }} selectedChartId={null} onSelect={vi.fn()} />
    );

    expect(screen.getByRole("status")).toHaveTextContent("Loading charts");
  });

  it("renders an empty state when there are no charts", () => {
    render(
      <ChartsList
        state={{ status: "loaded", charts: [] }}
        selectedChartId={null}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByText("No charts yet.")).toBeInTheDocument();
  });

  it("renders an error state", () => {
    render(
      <ChartsList
        state={{ status: "error", message: "boom" }}
        selectedChartId={null}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent("boom");
  });
});
