import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import type { CommunityDataSource } from "./client.js";
import { createDemoCommunityDataSource } from "./data-source.js";
import { CommunityScreen } from "./CommunityScreen.js";

afterEach(() => {
  cleanup();
});

describe("CommunityScreen", () => {
  it("loads the group list from the data source and shows the demo badge", async () => {
    render(
      <CommunityScreen dataSource={createDemoCommunityDataSource()} mode="demo" />
    );

    await waitFor(() => {
      expect(screen.getByText("Hospitality Team")).toBeInTheDocument();
    });
    expect(screen.getByText("demo data")).toBeInTheDocument();
    expect(screen.getByText(/Select a group/)).toBeInTheDocument();
  });

  it("loads a group's detail (members + engagement) when its row is selected", async () => {
    const user = userEvent.setup();
    render(
      <CommunityScreen dataSource={createDemoCommunityDataSource()} mode="demo" />
    );

    await waitFor(() => {
      expect(screen.getByText("Tuesday Small Group")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Tuesday Small Group"));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Tuesday Small Group" })
      ).toBeInTheDocument();
    });
    // The detail renders the group's joined members by their PII-safe names.
    expect(screen.getByText("Jon Pierce")).toBeInTheDocument();
    expect(screen.getByText("co_leader")).toBeInTheDocument();
  });

  it("PRIVACY: the populated surface prints no contact-value-shaped text", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <CommunityScreen dataSource={createDemoCommunityDataSource()} mode="demo" />
    );

    await waitFor(() => {
      expect(screen.getByText("Hospitality Team")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Hospitality Team"));
    await waitFor(() => {
      expect(screen.getByText("Anita Bello")).toBeInTheDocument();
    });

    const text = container.textContent;
    expect(text).not.toContain("@");
    expect(text).not.toMatch(/\d{7,}/);
    expect(text).not.toContain("channel-anita-sms");
  });

  it("shows an error state when the data source rejects", async () => {
    const failing: CommunityDataSource = {
      listCommunityGroups: (): Promise<never> =>
        Promise.reject(new Error("network down")),
      getCommunityGroupDetail: (): Promise<null> => Promise.resolve(null)
    };

    render(<CommunityScreen dataSource={failing} mode="live" />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("network down");
    });
  });
});
