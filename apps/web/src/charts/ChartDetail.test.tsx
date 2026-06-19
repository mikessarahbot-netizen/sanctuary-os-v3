import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChartDetail } from "./ChartDetail.js";
import { SAMPLE_CHARTS } from "./sample-data.js";
import type { Chart } from "./types.js";

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

  it("does not show an Edit affordance without an onSave handler", () => {
    render(<ChartDetail state={{ status: "loaded", chart: firstChart }} />);

    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });

  it("toggles a textarea pre-filled with the chart source when editing", async () => {
    const user = userEvent.setup();
    render(
      <ChartDetail
        state={{ status: "loaded", chart: firstChart }}
        onSave={(): Promise<Chart> => Promise.resolve(firstChart)}
      />
    );

    expect(screen.queryByRole("textbox")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Edit" }));

    const textarea = screen.getByRole("textbox");
    expect(textarea).toHaveValue(firstChart.chordProSource);
  });

  it("saves the edited source and re-renders the returned ChordPro", async () => {
    const user = userEvent.setup();
    const edited: Chart = {
      ...firstChart,
      chordProSource: "{title: Amazing Grace}\n[A]Edited [E]words"
    };
    const onSave = vi.fn<(source: string) => Promise<Chart>>(() =>
      Promise.resolve(edited)
    );

    const { rerender } = render(
      <ChartDetail state={{ status: "loaded", chart: firstChart }} onSave={onSave} />
    );

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const textarea = screen.getByRole("textbox");
    await user.clear(textarea);
    // `paste` inserts the text literally (ChordPro `[..]` / `{..}` would be
    // interpreted as key descriptors by `type`).
    await user.click(textarea);
    await user.paste("{title: Amazing Grace}\n[A]Edited [E]words");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith(
      "{title: Amazing Grace}\n[A]Edited [E]words"
    );

    // Simulate the screen feeding the updated chart back through `state`.
    rerender(<ChartDetail state={{ status: "loaded", chart: edited }} onSave={onSave} />);

    await waitFor(() => {
      expect(screen.getByText("Edited")).toBeInTheDocument();
    });
    // Back in read mode (textarea gone), Edit available again.
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("restores the original source when editing is cancelled", async () => {
    const user = userEvent.setup();
    render(
      <ChartDetail
        state={{ status: "loaded", chart: firstChart }}
        onSave={(): Promise<Chart> => Promise.resolve(firstChart)}
      />
    );

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const textarea = screen.getByRole("textbox");
    await user.clear(textarea);
    await user.type(textarea, "scratch edit");
    expect(textarea).toHaveValue("scratch edit");

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    // Edit mode closes and the read view still shows the original source.
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText(/sweet the/)).toBeInTheDocument();

    // Re-opening shows the original source, not the discarded scratch text.
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("textbox")).toHaveValue(firstChart.chordProSource);
  });

  it("shows an error when saving fails and keeps the editor open", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn<(source: string) => Promise<Chart>>(() =>
      Promise.reject(new Error("save failed"))
    );

    render(
      <ChartDetail state={{ status: "loaded", chart: firstChart }} onSave={onSave} />
    );

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("save failed");
    });
    // The editor stays open so the user can retry.
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("starts untransposed with the chart's default key and a zero offset", () => {
    render(<ChartDetail state={{ status: "loaded", chart: firstChart }} />);

    const transpose = screen.getByLabelText("Transpose chart");
    // Stored chords render unchanged; the readout shows the default key + "0".
    expect(within(transpose).getByText("G")).toBeInTheDocument();
    expect(within(transpose).getByText("0")).toBeInTheDocument();
    expect(screen.getByText("G7")).toBeInTheDocument();
    expect(screen.getByText("Em")).toBeInTheDocument();
  });

  it("transposes the displayed chords and key up when + is clicked twice", async () => {
    const user = userEvent.setup();
    render(<ChartDetail state={{ status: "loaded", chart: firstChart }} />);

    const up = screen.getByRole("button", { name: "Transpose up a semitone" });
    await user.click(up);
    await user.click(up);

    // G -> A (+2): the original chord tokens are gone, the transposed ones show.
    expect(screen.queryByText("G7")).toBeNull();
    expect(screen.getByText("A7")).toBeInTheDocument();
    expect(screen.getByText("F#m")).toBeInTheDocument();

    const transpose = screen.getByLabelText("Transpose chart");
    // Readout shows the transposed key (G -> A) and the "+2" offset.
    expect(within(transpose).getByText("A")).toBeInTheDocument();
    expect(within(transpose).getByText("+2")).toBeInTheDocument();
  });

  it("transposes down when − is clicked", async () => {
    const user = userEvent.setup();
    render(<ChartDetail state={{ status: "loaded", chart: firstChart }} />);

    await user.click(screen.getByRole("button", { name: "Transpose down a semitone" }));

    // G -> F# (-1): every chord shifts down a semitone.
    expect(screen.getByText("F#7")).toBeInTheDocument();
    const transpose = screen.getByLabelText("Transpose chart");
    expect(within(transpose).getByText("F#")).toBeInTheDocument();
    expect(within(transpose).getByText("-1")).toBeInTheDocument();
  });

  it("restores the original chords and key when Reset is clicked", async () => {
    const user = userEvent.setup();
    render(<ChartDetail state={{ status: "loaded", chart: firstChart }} />);

    const up = screen.getByRole("button", { name: "Transpose up a semitone" });
    await user.click(up);
    await user.click(up);
    expect(screen.getByText("A7")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reset" }));

    // Back to the stored chords and default key at offset 0.
    expect(screen.getByText("G7")).toBeInTheDocument();
    expect(screen.queryByText("A7")).toBeNull();
    const transpose = screen.getByLabelText("Transpose chart");
    expect(within(transpose).getByText("G")).toBeInTheDocument();
    expect(within(transpose).getByText("0")).toBeInTheDocument();
  });

  it("does not call onSave when transposing (view-only)", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn<(source: string) => Promise<Chart>>(() =>
      Promise.resolve(firstChart)
    );
    render(
      <ChartDetail state={{ status: "loaded", chart: firstChart }} onSave={onSave} />
    );

    const up = screen.getByRole("button", { name: "Transpose up a semitone" });
    await user.click(up);
    await user.click(up);
    await user.click(screen.getByRole("button", { name: "Reset" }));

    expect(onSave).not.toHaveBeenCalled();
  });

  it("hides the transpose control while editing the source", async () => {
    const user = userEvent.setup();
    render(
      <ChartDetail
        state={{ status: "loaded", chart: firstChart }}
        onSave={(): Promise<Chart> => Promise.resolve(firstChart)}
      />
    );

    expect(screen.getByLabelText("Transpose chart")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.queryByLabelText("Transpose chart")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByLabelText("Transpose chart")).toBeInTheDocument();
  });

  it("resets the transpose offset when a different chart is selected", async () => {
    const user = userEvent.setup();
    const [, secondChart] = SAMPLE_CHARTS;

    if (secondChart === undefined) {
      throw new Error("Expected a second sample chart.");
    }

    const { rerender } = render(
      <ChartDetail state={{ status: "loaded", chart: firstChart }} />
    );

    await user.click(screen.getByRole("button", { name: "Transpose up a semitone" }));
    expect(
      within(screen.getByLabelText("Transpose chart")).getByText("+1")
    ).toBeInTheDocument();

    rerender(<ChartDetail state={{ status: "loaded", chart: secondChart }} />);

    // The new chart opens untransposed: offset back to 0, default key shown.
    const transpose = screen.getByLabelText("Transpose chart");
    expect(within(transpose).getByText("0")).toBeInTheDocument();
    expect(within(transpose).getByText(secondChart.defaultKey)).toBeInTheDocument();
  });
});
