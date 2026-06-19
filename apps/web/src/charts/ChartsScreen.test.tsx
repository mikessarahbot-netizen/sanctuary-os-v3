import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChartsDataSource } from "./client.js";
import { createDemoChartsDataSource } from "./data-source.js";
import { SAMPLE_CHARTS } from "./sample-data.js";
import type { Chart } from "./types.js";
import { ChartsScreen } from "./ChartsScreen.js";

const [firstChart] = SAMPLE_CHARTS;

if (firstChart === undefined) {
  throw new Error("Expected at least one sample chart.");
}

afterEach(() => {
  cleanup();
});

describe("ChartsScreen", () => {
  it("loads the chart list from the data source and shows the demo badge", async () => {
    render(<ChartsScreen dataSource={createDemoChartsDataSource()} mode="demo" />);

    await waitFor(() => {
      expect(screen.getByText("Amazing Grace")).toBeInTheDocument();
    });
    expect(screen.getByText("demo data")).toBeInTheDocument();
    expect(screen.getByText(/Select a chart/)).toBeInTheDocument();
  });

  it("loads a chart's detail when its row is selected", async () => {
    const user = userEvent.setup();
    render(<ChartsScreen dataSource={createDemoChartsDataSource()} mode="demo" />);

    await waitFor(() => {
      expect(screen.getByText("How Great Thou Art")).toBeInTheDocument();
    });

    await user.click(screen.getByText("How Great Thou Art"));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "How Great Thou Art" })
      ).toBeInTheDocument();
    });
    // The detail renders the chart's ChordPro chords.
    expect(screen.getByText("Saviour God to")).toBeInTheDocument();
  });

  it("shows an error state when the data source rejects", async () => {
    const failing: ChartsDataSource = {
      listCharts: (): Promise<never> => Promise.reject(new Error("network down")),
      getChart: (): Promise<null> => Promise.resolve(null),
      updateChartSource: (): Promise<never> =>
        Promise.reject(new Error("not used"))
    };

    render(<ChartsScreen dataSource={failing} mode="live" />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("network down");
    });
  });

  it("saves an edited chart through the data source and re-renders the list + detail", async () => {
    const user = userEvent.setup();
    const edited: Chart = {
      ...firstChart,
      chordProSource: "{title: Renamed}\n[A]Brand new [E]line",
      title: "Renamed",
      defaultKey: "A"
    };
    const updateChartSource = vi.fn<ChartsDataSource["updateChartSource"]>(() =>
      Promise.resolve(edited)
    );
    const dataSource: ChartsDataSource = {
      listCharts: (): Promise<readonly Chart[]> => Promise.resolve([firstChart]),
      getChart: (): Promise<Chart> => Promise.resolve(firstChart),
      updateChartSource
    };

    render(
      <ChartsScreen
        dataSource={dataSource}
        mode="live"
        initialSelectedChartId={firstChart.chartId}
      />
    );

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: firstChart.title ?? "" })
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Edit" }));

    const textarea = screen.getByRole("textbox");
    await user.clear(textarea);
    // `paste` inserts ChordPro `[..]` / `{..}` literally (unlike `type`).
    await user.click(textarea);
    await user.paste("{title: Renamed}\n[A]Brand new [E]line");
    await user.click(screen.getByRole("button", { name: "Save" }));

    // The save calls the mutation with the chart id + the edited source...
    await waitFor(() => {
      expect(updateChartSource).toHaveBeenCalledWith(
        firstChart.chartId,
        "{title: Renamed}\n[A]Brand new [E]line"
      );
    });

    // ...the detail re-renders the returned ChordPro (new chord + lyric)...
    await waitFor(() => {
      expect(screen.getByText("Brand new")).toBeInTheDocument();
    });
    expect(screen.getByText("A", { selector: "dd.chart-key" })).toBeInTheDocument();

    // ...and the changed title propagates to the sidebar list row.
    expect(
      screen.getByRole("button", { name: /Renamed/ })
    ).toBeInTheDocument();
  });
});
