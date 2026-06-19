import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import type { PlayDataSource } from "./client.js";
import { createDemoPlayDataSource } from "./data-source.js";
import { PlayScreen } from "./PlayScreen.js";

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
    expect(screen.getByText("Bridge")).toBeInTheDocument();
    expect(screen.getByText("Swell into bridge")).toBeInTheDocument();
  });

  it("shows an error state when the data source rejects", async () => {
    const failing: PlayDataSource = {
      listTrackSets: (): Promise<never> => Promise.reject(new Error("network down")),
      getTrackSetDetail: (): Promise<null> => Promise.resolve(null)
    };

    render(<PlayScreen dataSource={failing} mode="live" />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("network down");
    });
  });
});
