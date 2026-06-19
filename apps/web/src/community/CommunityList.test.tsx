import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommunityList } from "./CommunityList.js";
import { SAMPLE_COMMUNITY_GROUPS } from "./sample-data.js";

afterEach(() => {
  cleanup();
});

describe("CommunityList", () => {
  it("renders the label and kind of each sample group", () => {
    render(
      <CommunityList
        state={{ status: "loaded", groups: SAMPLE_COMMUNITY_GROUPS }}
        selectedGroupId={null}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByText("Hospitality Team")).toBeInTheDocument();
    expect(screen.getByText("Tuesday Small Group")).toBeInTheDocument();
    expect(screen.getByText("serving_team")).toBeInTheDocument();
    expect(screen.getByText("small_group")).toBeInTheDocument();
  });

  it("invokes onSelect with the group id when a row is clicked", async () => {
    const onSelect = vi.fn();
    const { userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();

    render(
      <CommunityList
        state={{ status: "loaded", groups: SAMPLE_COMMUNITY_GROUPS }}
        selectedGroupId={null}
        onSelect={onSelect}
      />
    );

    await user.click(screen.getByText("Tuesday Small Group"));

    expect(onSelect).toHaveBeenCalledWith("group-tuesday");
  });

  it("renders a loading state", () => {
    render(
      <CommunityList
        state={{ status: "loading" }}
        selectedGroupId={null}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByRole("status")).toHaveTextContent("Loading groups");
  });

  it("renders an empty state when there are no groups", () => {
    render(
      <CommunityList
        state={{ status: "loaded", groups: [] }}
        selectedGroupId={null}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByText("No groups yet.")).toBeInTheDocument();
  });

  it("renders an error state", () => {
    render(
      <CommunityList
        state={{ status: "error", message: "boom" }}
        selectedGroupId={null}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent("boom");
  });
});
