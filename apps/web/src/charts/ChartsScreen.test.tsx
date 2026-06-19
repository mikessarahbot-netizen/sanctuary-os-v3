import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { createDemoChartsDataSource } from "./data-source.js";
import { ChartsScreen } from "./ChartsScreen.js";

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
    const failing = {
      listCharts: (): Promise<never> => Promise.reject(new Error("network down")),
      getChart: (): Promise<null> => Promise.resolve(null)
    };

    render(<ChartsScreen dataSource={failing} mode="live" />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("network down");
    });
  });
});
