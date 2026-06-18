import { z } from "zod";
import {
  CommunicationChannelSchema,
  type CommunityGroup,
  type EngagementSummary
} from "../../domain/community/index.js";

/**
 * Community+ AI-assist: reviewable comms-draft projection, port, and output
 * schema (slice 10 — the strictest-privacy AI surface).
 *
 * This module is the single boundary where Community+ talks to an AI provider,
 * and it is built so PII *cannot* reach the model by construction:
 *
 *   - **Smallest PII-free projection.** The service hands the port only the
 *     AI-safe engagement signals — `EngagementSummary` rows (refs + counts +
 *     window labels, PII-free by construction), non-PII group labels (ministry
 *     names), the channel, the audience *kind* + an optional non-PII label, and
 *     the `aiPolicyProfile`. No member name, contact value, custom-field value,
 *     household label, or note text is ever included. `buildCommunityAiDraftPrompt`
 *     derives plain signal *strings* (refs/counts/labels) — never raw records.
 *   - **Hard PII guard.** `assertCommunityAiDraftPromptIsPiiFree` walks the prompt
 *     and rejects any forbidden key or any value that looks like a phone/email/
 *     address, so a future projection change that leaks PII fails loudly instead
 *     of silently shipping it to the model. Honors `piiSharingAllowed`: the
 *     default (false) path is PII-free, and even when a tenant allows PII this
 *     slice keeps the comms-draft projection PII-free (plan: "even then, prefer
 *     PII-free").
 *   - **Zod-validated, untrusted output.** The port returns `unknown`; the
 *     service re-parses it through `CommunityAiDraftSuggestionSchema` before any
 *     use. `bodyTemplate` must be `{{placeholder}}`-token text with no resolved
 *     contact value, and `needsReview` is a literal `true`.
 *
 * The validated suggestion maps to a `draft` `CommunicationMessage` with
 * `origin = "ai-drafted"`, which the existing slice-5 human-confirmation gate
 * (the pure `applyMessageTransition` state machine) binds exactly like any other
 * draft: it can never self-advance past `draft` without a human confirming. AI
 * may draft, never send.
 *
 * Versioned prompt spec: `04-prompts/comms-drafter-community.md`
 * (`community-comms-draft.v1`).
 */
const NonEmptyStringSchema = z.string().min(1);
const OptionalNonEmptyStringSchema = NonEmptyStringSchema.optional();

export const COMMUNITY_AI_DRAFT_PROMPT_VERSION = "community-comms-draft.v1";

/**
 * Keys that must never appear in an AI-bound Community+ projection. `[PII]` field
 * names from the domain records (names, contact refs, custom-field values,
 * household labels) plus the raw contact-value scalars the system never even
 * stores. Used by the structural PII guard as defence-in-depth behind the
 * PII-free-by-construction projection types.
 */
const FORBIDDEN_PROJECTION_KEYS: ReadonlySet<string> = new Set([
  "displayName",
  "contactChannelRefs",
  "channelRef",
  "customFieldValues",
  "customFieldValue",
  "phone",
  "phoneNumber",
  "email",
  "emailAddress",
  "address",
  "homeAddress",
  "givingData",
  "prayerNotes",
  "counselingNotes",
  "noteText"
]);

const EMAIL_LIKE = /[\w.+-]+@[\w-]+\.[\w.-]+/u;
const PHONE_LIKE = /(?:\+?\d[\s().-]*){7,}/u;

/**
 * The `aiPolicyProfile` slice every Community+ AI call carries. Mirrors the
 * required policy fields from the ChurchContext schema; `piiSharingAllowed`
 * defaults to the safest value (false) when a caller omits it.
 */
export const CommunityAiPolicyProfileSchema = z
  .object({
    humanReviewRequiredFor: z.array(NonEmptyStringSchema),
    piiSharingAllowed: z.boolean()
  })
  .strict();

/**
 * One AI-safe engagement signal line: a ref or label plus its counts/trend. Built
 * from `EngagementSummary` rows (PII-free by construction) — refs + counts only,
 * never a name or contact value.
 */
export const CommunityAiEngagementSignalSchema = z
  .object({
    attendanceStreak: z.number().int().nonnegative(),
    commsResponseCount: z.number().int().nonnegative(),
    scopeKind: z.enum(["member", "segment"]),
    scopeRef: NonEmptyStringSchema,
    servingCount: z.number().int().nonnegative()
  })
  .strict();

/**
 * The smallest PII-free comms-draft projection handed to the AI port. Refs,
 * counts, labels, enums, and the policy profile only — no member/household/
 * recipient record and no contact value can be expressed in this shape.
 */
export const CommunityAiDraftPromptSchema = z
  .object({
    aiPolicyProfile: CommunityAiPolicyProfileSchema,
    audienceKind: z.enum(["group", "segment", "explicit"]),
    audienceLabel: OptionalNonEmptyStringSchema,
    campaignIntent: NonEmptyStringSchema,
    channel: CommunicationChannelSchema,
    churchToneSummary: NonEmptyStringSchema,
    engagementSignals: z.array(CommunityAiEngagementSignalSchema),
    forbiddenTopics: z.array(NonEmptyStringSchema),
    promptVersion: z.literal(COMMUNITY_AI_DRAFT_PROMPT_VERSION),
    requiredPlaceholders: z.array(NonEmptyStringSchema),
    requestId: NonEmptyStringSchema,
    tenantId: NonEmptyStringSchema
  })
  .strict();

/**
 * The AI suggestion shape — untrusted until parsed. `bodyTemplate` may carry only
 * `{{placeholder}}` tokens (no resolved recipient value); `needsReview` is a
 * literal `true` so a draft can never be marked auto-approved. A
 * `subject` is allowed only for the email channel (enforced again by the
 * `CommunicationMessage` schema when the draft is created).
 */
export const CommunityAiDraftSuggestionSchema = z
  .object({
    bodyTemplate: NonEmptyStringSchema,
    needsReview: z.literal(true),
    omittedDueToMissingData: z.array(NonEmptyStringSchema).default([]),
    rationale: NonEmptyStringSchema,
    status: z.enum(["drafted", "insufficient_context", "blocked"]),
    subject: OptionalNonEmptyStringSchema,
    usedPlaceholders: z.array(NonEmptyStringSchema).default([])
  })
  .strict()
  .superRefine((suggestion, context) => {
    if (EMAIL_LIKE.test(suggestion.bodyTemplate) || PHONE_LIKE.test(suggestion.bodyTemplate)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "bodyTemplate must use placeholder tokens, never a resolved contact value.",
        path: ["bodyTemplate"]
      });
    }

    if (
      suggestion.subject !== undefined &&
      (EMAIL_LIKE.test(suggestion.subject) || PHONE_LIKE.test(suggestion.subject))
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "subject must not contain a resolved contact value.",
        path: ["subject"]
      });
    }
  });

export type CommunityAiPolicyProfile = z.infer<typeof CommunityAiPolicyProfileSchema>;
export type CommunityAiEngagementSignal = z.infer<
  typeof CommunityAiEngagementSignalSchema
>;
export type CommunityAiDraftPrompt = z.infer<typeof CommunityAiDraftPromptSchema>;
export type CommunityAiDraftSuggestion = z.infer<
  typeof CommunityAiDraftSuggestionSchema
>;

/**
 * The injected AI-provider boundary for Community+ comms drafting. The service
 * builds the PII-free `CommunityAiDraftPrompt`, hands it to this port, and
 * re-validates the returned `unknown` through `CommunityAiDraftSuggestionSchema`.
 * A fake is used in tests (no network); real wiring defaults to the latest Claude
 * model but stays injected/config-driven. Mirrors planning's
 * `PlanningSetlistGenerator` injected-port posture.
 */
export interface CommunityAiDraftPort {
  readonly draftCommunication: (prompt: CommunityAiDraftPrompt) => Promise<unknown>;
}

/**
 * Inputs the service gathers to build the PII-free projection. The engagement
 * summaries are the AI-safe rows; the group (when the audience is a group) lends
 * its non-PII label; everything else is enums/labels/policy supplied by the
 * command.
 */
/**
 * The audience descriptor the projection builder reads. Structural (plain-string
 * refs) so both the branded domain `AudienceDescriptor` and the unbranded command
 * input satisfy it — the builder only ever reads `kind` plus a non-PII label, and
 * the explicit member refs are deliberately *not* read into the projection.
 */
export type CommunityAiDraftAudience =
  | { readonly kind: "group"; readonly groupId: string }
  | { readonly kind: "segment"; readonly segmentRef: string }
  | { readonly kind: "explicit"; readonly memberRefs: readonly string[] };

export interface CommunityAiDraftPromptInputs {
  readonly audience: CommunityAiDraftAudience;
  readonly aiPolicyProfile: CommunityAiPolicyProfile;
  readonly campaignIntent: string;
  readonly channel: CommunityAiDraftPrompt["channel"];
  readonly churchToneSummary: string;
  readonly engagementSummaries: readonly EngagementSummary[];
  readonly forbiddenTopics: readonly string[];
  readonly group: CommunityGroup | undefined;
  readonly requestId: string;
  readonly requiredPlaceholders: readonly string[];
  readonly tenantId: string;
}

const toEngagementSignal = (
  summary: EngagementSummary
): CommunityAiEngagementSignal =>
  CommunityAiEngagementSignalSchema.parse({
    attendanceStreak: summary.attendanceStreak,
    commsResponseCount: summary.commsResponseCount,
    scopeKind: summary.scope.kind,
    scopeRef:
      summary.scope.kind === "member"
        ? summary.scope.memberRef
        : summary.scope.segmentRef,
    servingCount: summary.servingCount
  });

const audienceLabelFor = (
  inputs: CommunityAiDraftPromptInputs
): string | undefined => {
  if (inputs.audience.kind === "group") {
    // A group label is a non-PII ministry name (per the plan), so it may appear.
    return inputs.group?.label;
  }

  if (inputs.audience.kind === "segment") {
    return inputs.audience.segmentRef;
  }

  return undefined;
};

/**
 * Build the smallest PII-free comms-draft projection from the AI-safe inputs, then
 * structurally assert it carries no PII before returning. The engagement signals
 * are derived from `EngagementSummary` rows (refs + counts only); the audience
 * contributes its kind plus, at most, a non-PII label (group ministry name or
 * segment ref) — never the explicit member refs themselves, which are opaque but
 * member-identifying, so the `explicit` kind contributes no label.
 */
export const buildCommunityAiDraftPrompt = (
  inputs: CommunityAiDraftPromptInputs
): CommunityAiDraftPrompt => {
  const audienceLabel = audienceLabelFor(inputs);
  const prompt = CommunityAiDraftPromptSchema.parse({
    aiPolicyProfile: inputs.aiPolicyProfile,
    audienceKind: inputs.audience.kind,
    campaignIntent: inputs.campaignIntent,
    channel: inputs.channel,
    churchToneSummary: inputs.churchToneSummary,
    engagementSignals: inputs.engagementSummaries.map(toEngagementSignal),
    forbiddenTopics: [...inputs.forbiddenTopics],
    promptVersion: COMMUNITY_AI_DRAFT_PROMPT_VERSION,
    requiredPlaceholders: [...inputs.requiredPlaceholders],
    requestId: inputs.requestId,
    tenantId: inputs.tenantId,
    ...(audienceLabel !== undefined ? { audienceLabel } : {})
  });

  assertCommunityAiDraftPromptIsPiiFree(prompt);

  return prompt;
};

/**
 * Structural PII guard: throws if the projection contains a forbidden key or any
 * value that looks like a phone/email/address. Defence-in-depth behind the
 * PII-free-by-construction projection type — a future leak fails loudly here
 * rather than reaching the model. Pure and deterministic.
 */
export const assertCommunityAiDraftPromptIsPiiFree = (
  prompt: CommunityAiDraftPrompt
): void => {
  const visit = (value: unknown): void => {
    if (typeof value === "string") {
      if (EMAIL_LIKE.test(value) || PHONE_LIKE.test(value)) {
        throw new Error(
          "Community AI draft projection must not contain a contact value."
        );
      }

      return;
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        visit(entry);
      }

      return;
    }

    if (value !== null && typeof value === "object") {
      for (const [key, nested] of Object.entries(value)) {
        if (FORBIDDEN_PROJECTION_KEYS.has(key)) {
          throw new Error(
            `Community AI draft projection must not carry the PII field "${key}".`
          );
        }

        visit(nested);
      }
    }
  };

  visit(prompt);
};
