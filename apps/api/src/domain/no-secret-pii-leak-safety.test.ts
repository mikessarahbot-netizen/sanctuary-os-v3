import { describe, expect, it } from "vitest";
import {
  EngagementSummarySchema,
  MemberSchema
} from "./community/schemas.js";
import { ObsConnectionProfileSchema } from "./obs/schemas.js";

/**
 * GUARANTEE 2 tripwire — no secret or PII field can attach to the records that
 * must never carry one.
 *
 * The OBS connection profile, the Community member, and the engagement summary
 * are `.strict()` and deliberately hold ONLY opaque refs + coarse/derived state
 * (the OBS host/port/password/stream-key live in a vault; member contact values
 * live in a contact vault; the engagement summary is PII-free by construction so
 * it is the one AI-projectable record). That "no secret/PII field exists" posture
 * is documented in the schema headers but was never *tested* — so nothing stopped
 * a later edit from quietly adding a `password` / `email` field and defeating it.
 *
 * These tests assert the clean record parses AND that adding any secret-/PII-
 * shaped key is REJECTED. If someone widens one of these schemas to admit such a
 * field, the matching case here fails — a deliberate checkpoint, not a silent
 * regression.
 */
const expectRejectsForbiddenKeys = (
  schema: { readonly parse: (input: unknown) => unknown },
  valid: Record<string, unknown>,
  forbiddenKeys: readonly string[]
): void => {
  // Guard against a vacuous pass: the clean record must itself be valid.
  expect(() => schema.parse(valid)).not.toThrow();

  for (const key of forbiddenKeys) {
    const withForbiddenKey: Record<string, unknown> = {
      ...valid,
      [key]: "leaked-secret-or-pii-value"
    };
    // `.strict()` rejects the unknown key regardless of its value, so a secret /
    // contact value can never ride along on the record.
    expect(() => schema.parse(withForbiddenKey)).toThrow();
  }
};

const isoNow = "2026-06-18T12:00:00.000Z";

describe("GUARANTEE 2: no secret can attach to an OBS connection profile", () => {
  const validConnection: Record<string, unknown> = {
    connectionProfileId: "connection_1",
    connectionRef: "vault://obs/booth",
    connectionStatus: "connected",
    createdAt: isoNow,
    label: "Booth",
    tenantId: "tenant_a",
    updatedAt: isoNow
  };

  it("parses the opaque-ref-only profile but rejects every credential-shaped key", () => {
    expectRejectsForbiddenKeys(ObsConnectionProfileSchema, validConnection, [
      "host",
      "port",
      "password",
      "authToken",
      "token",
      "streamKey",
      "secret",
      "url",
      "websocketUrl"
    ]);
  });
});

describe("GUARANTEE 2: no raw PII can attach to a Community member", () => {
  const validMember: Record<string, unknown> = {
    contactChannelRefs: [
      { channelRef: "channel_1", consentStatus: "granted", kind: "sms" }
    ],
    createdAt: isoNow,
    customFieldValues: [],
    displayName: "Pat Doe",
    memberId: "member_1",
    segmentRefs: [],
    status: "active",
    tenantId: "tenant_a",
    updatedAt: isoNow
  };

  it("parses the channel-ref-only member but rejects every raw-contact-shaped key", () => {
    expectRejectsForbiddenKeys(MemberSchema, validMember, [
      "phone",
      "phoneNumber",
      "email",
      "emailAddress",
      "address",
      "contactValue",
      "ssn",
      "dateOfBirth"
    ]);
  });
});

describe("GUARANTEE 2: the AI-projectable engagement summary stays PII-free", () => {
  const validSummary: Record<string, unknown> = {
    attendanceStreak: 3,
    commsResponseCount: 1,
    computedAt: isoNow,
    scope: { kind: "member", memberRef: "member_1" },
    servingCount: 2,
    summaryId: "summary_1",
    tenantId: "tenant_a",
    windowEnd: isoNow,
    windowStart: "2026-06-01T12:00:00.000Z"
  };

  it("parses the refs+counts-only summary but rejects any name / contact / free-text key", () => {
    // This is the one record class projected to AI, so it must never gain a field
    // that could carry identity or free text.
    expectRejectsForbiddenKeys(EngagementSummarySchema, validSummary, [
      "displayName",
      "name",
      "email",
      "phone",
      "contactValue",
      "notes",
      "noteText"
    ]);
  });
});
