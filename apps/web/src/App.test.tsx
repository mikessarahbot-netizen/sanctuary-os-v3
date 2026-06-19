import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "./App.js";

afterEach(() => {
  cleanup();
});

describe("App", () => {
  it("renders the Charts surface by default", async () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Charts" })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("Amazing Grace")).toBeInTheDocument();
    });
    // The Play surface is not mounted yet.
    expect(screen.queryByText("Build My Life")).toBeNull();
  });

  it("switches to the Play surface when the Play tab is clicked", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Amazing Grace")).toBeInTheDocument();
    });

    const nav = screen.getByRole("navigation", { name: "Surfaces" });
    await user.click(within(nav).getByRole("button", { name: "Play" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Play" })).toBeInTheDocument();
    });
    expect(screen.getByText("Build My Life")).toBeInTheDocument();
    // The Charts surface is unmounted.
    expect(screen.queryByText("Amazing Grace")).toBeNull();
  });

  it("switches back to Charts from Play", async () => {
    const user = userEvent.setup();
    render(<App />);

    const nav = screen.getByRole("navigation", { name: "Surfaces" });
    await user.click(within(nav).getByRole("button", { name: "Play" }));

    await waitFor(() => {
      expect(screen.getByText("Build My Life")).toBeInTheDocument();
    });

    await user.click(within(nav).getByRole("button", { name: "Charts" }));

    await waitFor(() => {
      expect(screen.getByText("Amazing Grace")).toBeInTheDocument();
    });
    expect(screen.queryByText("Build My Life")).toBeNull();
  });

  it("switches to the Community surface when the Community tab is clicked", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Amazing Grace")).toBeInTheDocument();
    });

    const nav = screen.getByRole("navigation", { name: "Surfaces" });
    await user.click(within(nav).getByRole("button", { name: "Community" }));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Community" })
      ).toBeInTheDocument();
    });
    expect(screen.getByText("Hospitality Team")).toBeInTheDocument();
    // The Charts and Play surfaces are unmounted.
    expect(screen.queryByText("Amazing Grace")).toBeNull();
    expect(screen.queryByText("Build My Life")).toBeNull();
  });

  it("switches across Charts, Play, and Community without leaking surfaces", async () => {
    const user = userEvent.setup();
    render(<App />);

    const nav = screen.getByRole("navigation", { name: "Surfaces" });

    await user.click(within(nav).getByRole("button", { name: "Community" }));
    await waitFor(() => {
      expect(screen.getByText("Tuesday Small Group")).toBeInTheDocument();
    });

    await user.click(within(nav).getByRole("button", { name: "Play" }));
    await waitFor(() => {
      expect(screen.getByText("Build My Life")).toBeInTheDocument();
    });
    expect(screen.queryByText("Tuesday Small Group")).toBeNull();

    await user.click(within(nav).getByRole("button", { name: "Charts" }));
    await waitFor(() => {
      expect(screen.getByText("Amazing Grace")).toBeInTheDocument();
    });
    expect(screen.queryByText("Build My Life")).toBeNull();
  });
});
