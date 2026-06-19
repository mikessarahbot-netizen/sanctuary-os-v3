import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { CommunityComposePanel } from "./CommunityComposePanel.js";
import { findSampleCommunityGroupDetail, resolveSampleAudience } from "./sample-data.js";
import type {
  CommunicationChannel,
  CommunicationMessageRef,
  GroupMemberRow,
  QueuedCommunicationResult,
  ResolvedAudience
} from "./types.js";

afterEach(() => {
  cleanup();
});

const hospitalityDetail = findSampleCommunityGroupDetail("group-hospitality");

if (hospitalityDetail === undefined) {
  throw new Error("Expected the seeded Hospitality group detail.");
}

const HOSPITALITY_ROWS: readonly GroupMemberRow[] = hospitalityDetail.members;

interface SpyCallbacks {
  readonly calls: string[];
  readonly composeDraft: (input: {
    readonly groupId: string;
    readonly channel: CommunicationChannel;
    readonly bodyTemplate: string;
    readonly subject?: string;
  }) => Promise<CommunicationMessageRef>;
  readonly resolveAudience: (messageId: string) => Promise<ResolvedAudience | null>;
  readonly confirmAndQueue: (input: {
    readonly messageId: string;
    readonly reason: string;
  }) => Promise<QueuedCommunicationResult>;
}

/**
 * Stateful spy callbacks that record the method-call order so a test can prove
 * `confirmAndQueue` (the only queue path) is never invoked before the operator's
 * explicit Confirm. `resolveAudience` runs the real pure resolver over the seeded
 * members so the included / suppressed split is faithful.
 */
const makeSpy = (
  channel: CommunicationChannel,
  confirmImpl?: (input: {
    readonly messageId: string;
    readonly reason: string;
  }) => Promise<QueuedCommunicationResult>
): SpyCallbacks => {
  const calls: string[] = [];

  return {
    calls,
    composeDraft: (input): Promise<CommunicationMessageRef> => {
      calls.push("composeDraft");

      return Promise.resolve({
        channel: input.channel,
        messageId: "message-1",
        origin: "human",
        status: "draft"
      });
    },
    resolveAudience: (messageId): Promise<ResolvedAudience | null> => {
      calls.push("resolveAudience");
      void messageId;

      return Promise.resolve(resolveSampleAudience("group-hospitality", channel));
    },
    confirmAndQueue: (input): Promise<QueuedCommunicationResult> => {
      calls.push("confirmAndQueue");

      if (confirmImpl !== undefined) {
        return confirmImpl(input);
      }

      const audience = resolveSampleAudience("group-hospitality", channel);

      return Promise.resolve({
        includedCount: audience.included.length,
        message: {
          channel,
          messageId: input.messageId,
          origin: "human",
          status: "sent"
        },
        suppressedCount: audience.suppressed.length
      });
    }
  };
};

const renderPanel = (spy: SpyCallbacks): void => {
  render(
    <CommunityComposePanel
      groupId="group-hospitality"
      groupLabel="Hospitality Team"
      memberRows={HOSPITALITY_ROWS}
      onComposeDraft={spy.composeDraft}
      onResolveAudience={spy.resolveAudience}
      onConfirmAndQueue={spy.confirmAndQueue}
    />
  );
};

const previewAudience = async (
  user: ReturnType<typeof userEvent.setup>
): Promise<void> => {
  await user.type(
    screen.getByLabelText("Message"),
    "Setup is at 9am this Sunday."
  );
  await user.click(screen.getByRole("button", { name: "Preview audience" }));
  await screen.findByRole("group", { name: "Resolved audience" });
};

describe("CommunityComposePanel preview", () => {
  it("composing + previewing shows INCLUDED vs SUPPRESSED recipients by display name", async () => {
    const user = userEvent.setup();
    const spy = makeSpy("sms");
    renderPanel(spy);

    await previewAudience(user);

    const audience = screen.getByRole("group", { name: "Resolved audience" });

    // Included: Anita (sms granted).
    expect(within(audience).getByText("Included · 1")).toBeInTheDocument();
    expect(within(audience).getByText("Anita Bello")).toBeInTheDocument();
    expect(within(audience).getByText("will send")).toBeInTheDocument();

    // Suppressed: David (consent not granted) + Maria (no channel for this type).
    expect(within(audience).getByText("Suppressed · 2")).toBeInTheDocument();
    expect(within(audience).getByText("David Okoye")).toBeInTheDocument();
    expect(within(audience).getByText("Maria Santos")).toBeInTheDocument();
    expect(within(audience).getByText("consent not granted")).toBeInTheDocument();
    expect(
      within(audience).getByText("no channel for this type")
    ).toBeInTheDocument();

    // The draft was composed + audience resolved; nothing has been queued.
    expect(spy.calls).toEqual(["composeDraft", "resolveAudience"]);
  });

  it("CONSENT: a non-consented member renders only as suppressed and no contact value reaches the DOM", async () => {
    const user = userEvent.setup();
    const spy = makeSpy("sms");
    const { container } = render(
      <CommunityComposePanel
        groupId="group-hospitality"
        groupLabel="Hospitality Team"
        memberRows={HOSPITALITY_ROWS}
        onComposeDraft={spy.composeDraft}
        onResolveAudience={spy.resolveAudience}
        onConfirmAndQueue={spy.confirmAndQueue}
      />
    );

    await previewAudience(user);

    // David appears under Suppressed, not Included.
    const suppressedGroup = screen
      .getByText("Suppressed · 2")
      .closest(".comms-audience__group");
    expect(suppressedGroup).not.toBeNull();
    expect(
      within(suppressedGroup as HTMLElement).getByText("David Okoye")
    ).toBeInTheDocument();

    const includedGroup = screen
      .getByText("Included · 1")
      .closest(".comms-audience__group");
    expect(
      within(includedGroup as HTMLElement).queryByText("David Okoye")
    ).toBeNull();

    // No contact-value-shaped text anywhere (no "@", no 7+ digit run, no channelRef).
    const text = container.textContent;
    expect(text).not.toContain("@");
    expect(text).not.toMatch(/\d{7,}/);
    expect(text).not.toContain("channel-anita-sms");
    expect(text).not.toContain("channel-david-sms");
  });
});

describe("CommunityComposePanel human-confirm gate", () => {
  it("clicking Send opens the confirm gate and does NOT queue", async () => {
    const user = userEvent.setup();
    const spy = makeSpy("sms");
    renderPanel(spy);

    await previewAudience(user);
    await user.click(screen.getByRole("button", { name: /^Send to 1 recipient/ }));

    // The loud confirm gate appears...
    await waitFor(() => {
      expect(
        screen.getByRole("alertdialog", { name: "Confirm send" })
      ).toBeInTheDocument();
    });
    expect(screen.getByText(/This SENDS the message/i)).toBeInTheDocument();
    // ...stating it sends to 1 person and 2 are suppressed.
    expect(screen.getByText(/SENDS the message to 1 person/i)).toBeInTheDocument();
    expect(screen.getByText(/2 more recipients are/i)).toBeInTheDocument();

    // Nothing has been queued — confirmAndQueue has NOT been called.
    expect(spy.calls).not.toContain("confirmAndQueue");
  });

  it("Confirm runs confirmAndQueue (confirm THEN queue) and shows the queued result", async () => {
    const user = userEvent.setup();
    const spy = makeSpy("sms");
    renderPanel(spy);

    await previewAudience(user);
    await user.click(screen.getByRole("button", { name: /^Send to 1 recipient/ }));

    const reason = await screen.findByLabelText(/Reason/);
    await user.type(reason, "Approved by the team lead");
    await user.click(
      screen.getByRole("button", { name: /^Confirm and send to 1 person/ })
    );

    // The success result renders: queued to 1, with 2 suppressed.
    await waitFor(() => {
      expect(screen.getByText("Queued to 1 recipient.")).toBeInTheDocument();
    });
    expect(
      screen.getByText(/2 recipients suppressed \(consent not granted\)/)
    ).toBeInTheDocument();

    // confirmAndQueue ran exactly once, AFTER the preview (confirm-before-queue is
    // enforced inside confirmAndQueue, asserted in client.test.ts).
    expect(spy.calls.filter((c) => c === "confirmAndQueue")).toHaveLength(1);
    expect(spy.calls).toEqual(["composeDraft", "resolveAudience", "confirmAndQueue"]);

    // The gate closed.
    expect(screen.queryByRole("alertdialog", { name: "Confirm send" })).toBeNull();
  });

  it("INVARIANT: confirmAndQueue is never called before the explicit Confirm", async () => {
    const user = userEvent.setup();
    const spy = makeSpy("sms");
    renderPanel(spy);

    await previewAudience(user);
    await user.click(screen.getByRole("button", { name: /^Send to 1 recipient/ }));
    await screen.findByRole("alertdialog", { name: "Confirm send" });

    // Up to (and including) opening the gate, NO queue happened.
    expect(spy.calls).not.toContain("confirmAndQueue");

    await user.type(await screen.findByLabelText(/Reason/), "Go");
    await user.click(
      screen.getByRole("button", { name: /^Confirm and send to 1 person/ })
    );
    await waitFor(() => {
      expect(screen.getByText("Queued to 1 recipient.")).toBeInTheDocument();
    });

    // Every confirmAndQueue in the call log is preceded by the gate having been
    // opened by the operator (there is exactly one, and it is last).
    const queueIndex = spy.calls.indexOf("confirmAndQueue");
    expect(queueIndex).toBe(spy.calls.length - 1);
  });

  it("Cancel aborts the send with no queue and returns to the audience preview", async () => {
    const user = userEvent.setup();
    const spy = makeSpy("sms");
    renderPanel(spy);

    await previewAudience(user);
    await user.click(screen.getByRole("button", { name: /^Send to 1 recipient/ }));
    await screen.findByRole("alertdialog", { name: "Confirm send" });

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    // The gate closed, nothing was queued, and the audience preview is still shown.
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog", { name: "Confirm send" })).toBeNull();
    });
    expect(spy.calls).not.toContain("confirmAndQueue");
    expect(screen.getByRole("group", { name: "Resolved audience" })).toBeInTheDocument();
    // The Send button is available again.
    expect(
      screen.getByRole("button", { name: /^Send to 1 recipient/ })
    ).toBeInTheDocument();
  });

  it("surfaces an error from confirmAndQueue and keeps the gate open for retry", async () => {
    const user = userEvent.setup();
    const spy = makeSpy("sms", () =>
      Promise.reject(new Error("The messaging integration is unavailable."))
    );
    renderPanel(spy);

    await previewAudience(user);
    await user.click(screen.getByRole("button", { name: /^Send to 1 recipient/ }));
    await user.type(await screen.findByLabelText(/Reason/), "Go now");
    await user.click(
      screen.getByRole("button", { name: /^Confirm and send to 1 person/ })
    );

    // The error surfaces in the gate, which stays open.
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "The messaging integration is unavailable."
      );
    });
    expect(
      screen.getByRole("alertdialog", { name: "Confirm send" })
    ).toBeInTheDocument();
    // No success result rendered.
    expect(screen.queryByText(/Queued to/)).toBeNull();
  });
});
