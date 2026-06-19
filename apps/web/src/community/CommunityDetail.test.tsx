import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CommunityDetail } from "./CommunityDetail.js";
import { findSampleCommunityGroupDetail } from "./sample-data.js";
import type { CommunityGroupDetail } from "./types.js";

const detail = findSampleCommunityGroupDetail("group-hospitality");

if (detail === undefined) {
  throw new Error("Expected the seeded sample community group detail.");
}

afterEach(() => {
  cleanup();
});

describe("CommunityDetail", () => {
  it("renders the group label, kind, member count, and resolved members", () => {
    render(<CommunityDetail state={{ status: "loaded", detail }} />);

    expect(
      screen.getByRole("heading", { name: "Hospitality Team" })
    ).toBeInTheDocument();

    // The group kind renders, and the member count reflects the seeded rows.
    expect(screen.getByText("serving_team", { selector: "dd.play-tag" })).toBeInTheDocument();
    expect(screen.getByText("3", { selector: "dd" })).toBeInTheDocument();

    // Members render by their PII-safe display names + roles.
    expect(screen.getByText("Anita Bello")).toBeInTheDocument();
    expect(screen.getByText("David Okoye")).toBeInTheDocument();
    expect(screen.getByText("Maria Santos")).toBeInTheDocument();
    expect(screen.getByText("leader")).toBeInTheDocument();
    expect(screen.getByText("guest")).toBeInTheDocument();
  });

  it("renders contact channels as kind + consent only (never a contact value)", () => {
    render(<CommunityDetail state={{ status: "loaded", detail }} />);

    // The opaque ref surfaces as "<kind> · <consent>" — the consent posture, not
    // a contact value.
    expect(screen.getByText("sms · granted")).toBeInTheDocument();
    expect(screen.getByText("email · granted")).toBeInTheDocument();
    expect(screen.getByText("sms · denied")).toBeInTheDocument();
  });

  it("renders engagement summary counts for members that have one", () => {
    render(<CommunityDetail state={{ status: "loaded", detail }} />);

    // Anita: streak 4, serving 2 in the seed.
    expect(screen.getByText("streak 4 · serving 2")).toBeInTheDocument();
  });

  it("renders a loading state", () => {
    render(<CommunityDetail state={{ status: "loading" }} />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading group");
  });

  it("prompts to pick a group when none is selected", () => {
    render(<CommunityDetail state={{ status: "missing" }} />);

    expect(screen.getByText(/Select a group/)).toBeInTheDocument();
  });

  it("renders an error state", () => {
    render(<CommunityDetail state={{ status: "error", message: "nope" }} />);

    expect(screen.getByRole("alert")).toHaveTextContent("nope");
  });

  it("renders an empty fallback when the group has no members", () => {
    const emptyDetail: CommunityGroupDetail = { group: detail.group, members: [] };

    render(<CommunityDetail state={{ status: "loaded", detail: emptyDetail }} />);

    expect(screen.getByText("No members in this group.")).toBeInTheDocument();
  });

  it("PRIVACY: never prints a phone/email/address-shaped contact value", () => {
    const { container } = render(
      <CommunityDetail state={{ status: "loaded", detail }} />
    );
    const text = container.textContent;

    // No email-shaped value (the "@" of an address) ever reaches the DOM. The
    // consent tags use " · " as a separator, never "@".
    expect(text).not.toContain("@");
    // No phone-number-shaped run of digits (the surface shows small counts like
    // "streak 4" but never a 7+ digit phone number).
    expect(text).not.toMatch(/\d{7,}/);
    // The opaque vault channelRef token itself is never printed — only its kind +
    // consent are surfaced.
    expect(text).not.toContain("channel-anita-sms");
    expect(text).not.toContain("channel-david-sms");
  });
});
