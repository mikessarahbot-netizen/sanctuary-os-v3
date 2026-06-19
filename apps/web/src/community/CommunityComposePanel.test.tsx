import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { CommunityComposePanel } from "./CommunityComposePanel.js";
import { findSampleCommunityGroupDetail, resolveSampleAudience } from "./sample-data.js";
import type {
  AiDraftedMessage,
  CommunicationChannel,
  CommunicationMessageRef,
  DraftWithAiInput,
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
  readonly draftWithAi: (input: DraftWithAiInput) => Promise<AiDraftedMessage>;
  readonly draftWithAiInputs: DraftWithAiInput[];
  readonly resolveAudience: (messageId: string) => Promise<ResolvedAudience | null>;
  readonly confirmAndQueue: (input: {
    readonly messageId: string;
    readonly reason: string;
  }) => Promise<QueuedCommunicationResult>;
}

// The AI-drafted message the fake `draftWithAi` returns: origin "ai-drafted",
// status "draft", with a placeholder-token body (never a contact value).
const AI_DRAFT_MESSAGE_ID = "ai-message-1";
const AI_DRAFT_BODY = "Hi {{firstName}}, we'd love to see you Sunday.";

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
  const draftWithAiInputs: DraftWithAiInput[] = [];

  return {
    calls,
    draftWithAiInputs,
    composeDraft: (input): Promise<CommunicationMessageRef> => {
      calls.push("composeDraft");

      return Promise.resolve({
        channel: input.channel,
        messageId: "message-1",
        origin: "human",
        status: "draft"
      });
    },
    draftWithAi: (input): Promise<AiDraftedMessage> => {
      calls.push("draftWithAi");
      draftWithAiInputs.push(input);

      // The backend created an ai-drafted DRAFT (it never sends); return it with the
      // drafted text so the panel can show it for review.
      return Promise.resolve({
        bodyTemplate: AI_DRAFT_BODY,
        channel: input.channel,
        messageId: AI_DRAFT_MESSAGE_ID,
        origin: "ai-drafted",
        status: "draft",
        subject: input.channel === "email" ? "Hope to see you Sunday" : null
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

// Render with the AI-draft affordance wired (the screen passes `onDraftWithAi` from
// the data source). Returns the container for DOM-wide privacy assertions.
const renderPanelWithAi = (spy: SpyCallbacks): { readonly container: HTMLElement } => {
  const { container } = render(
    <CommunityComposePanel
      groupId="group-hospitality"
      groupLabel="Hospitality Team"
      memberRows={HOSPITALITY_ROWS}
      onComposeDraft={spy.composeDraft}
      onDraftWithAi={spy.draftWithAi}
      onResolveAudience={spy.resolveAudience}
      onConfirmAndQueue={spy.confirmAndQueue}
    />
  );

  return { container };
};

// Fill the AI hints and click "AI draft", then wait for the AI-drafted message to
// appear (review state). Shared by the AI-flow tests below.
const aiDraftAndReview = async (
  user: ReturnType<typeof userEvent.setup>
): Promise<void> => {
  await user.type(
    screen.getByLabelText("What is this message for?"),
    "Invite the team to Sunday setup."
  );
  await user.click(screen.getByRole("button", { name: "AI draft" }));
  await screen.findByRole("group", { name: "Resolved audience" });
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

describe("CommunityComposePanel AI draft", () => {
  it("clicking AI draft calls the mutation, shows the AI-drafted message + audience, and frames it as needing a human confirm", async () => {
    const user = userEvent.setup();
    const spy = makeSpy("sms");
    const { container } = renderPanelWithAi(spy);

    await aiDraftAndReview(user);

    // The mutation was called with the group + channel + the PII-free hints.
    expect(spy.calls).toEqual(["draftWithAi", "resolveAudience"]);
    expect(spy.draftWithAiInputs).toHaveLength(1);
    expect(spy.draftWithAiInputs[0]).toMatchObject({
      campaignIntent: "Invite the team to Sunday setup.",
      channel: "sms",
      groupId: "group-hospitality"
    });

    // The AI-drafted message is shown for review with the "a human still confirms"
    // framing visible.
    const aiDraft = screen.getByRole("region", { name: "AI-drafted message" });
    expect(aiDraft).toHaveTextContent(AI_DRAFT_BODY);
    expect(
      screen.getByText(/AI-drafted · a human still confirms before sending/)
    ).toBeInTheDocument();

    // The same consent-filtered audience the manual flow shows is resolved for the
    // AI draft: Anita included, David + Maria suppressed.
    const audience = screen.getByRole("group", { name: "Resolved audience" });
    expect(within(audience).getByText("Included · 1")).toBeInTheDocument();
    expect(within(audience).getByText("Anita Bello")).toBeInTheDocument();
    expect(within(audience).getByText("Suppressed · 2")).toBeInTheDocument();

    // Privacy: the placeholder-token body carries no contact value, and no
    // channelRef token leaks to the DOM.
    const text = container.textContent;
    expect(text).not.toContain("@");
    expect(text).not.toMatch(/\d{7,}/);
    expect(text).not.toContain("channel-anita-sms");

    // Nothing has been queued yet — only draft + resolve happened.
    expect(spy.calls).not.toContain("confirmAndQueue");
  });

  it("INVARIANT: an AI-origin draft cannot bypass the confirm step — Send opens the gate and only an explicit Confirm queues", async () => {
    const user = userEvent.setup();
    const spy = makeSpy("sms");
    renderPanelWithAi(spy);

    await aiDraftAndReview(user);

    // The AI draft did NOT auto-send: up to here, no queue has happened.
    expect(spy.calls).not.toContain("confirmAndQueue");

    // Send opens the loud human-confirm gate — still no queue.
    await user.click(screen.getByRole("button", { name: /^Send to 1 recipient/ }));
    await screen.findByRole("alertdialog", { name: "Confirm send" });
    expect(spy.calls).not.toContain("confirmAndQueue");

    // Only the explicit Confirm (with a reason) runs the queue path, exactly once,
    // and only AFTER the AI draft + preview + gate-open.
    await user.type(await screen.findByLabelText(/Reason/), "Approved by lead");
    await user.click(
      screen.getByRole("button", { name: /^Confirm and send to 1 person/ })
    );
    await waitFor(() => {
      expect(screen.getByText("Queued to 1 recipient.")).toBeInTheDocument();
    });

    expect(spy.calls).toEqual([
      "draftWithAi",
      "resolveAudience",
      "confirmAndQueue"
    ]);
    // The confirm is strictly the last action — the AI draft never reached the queue
    // on its own.
    expect(spy.calls.indexOf("confirmAndQueue")).toBe(spy.calls.length - 1);
  });

  it("does not render the AI-draft affordance when no onDraftWithAi is provided (manual compose unchanged)", () => {
    const spy = makeSpy("sms");
    renderPanel(spy);

    expect(screen.queryByRole("button", { name: "AI draft" })).toBeNull();
    expect(screen.queryByLabelText("What is this message for?")).toBeNull();
    // The manual Preview-audience button is still there.
    expect(
      screen.getByRole("button", { name: "Preview audience" })
    ).toBeInTheDocument();
  });
});
