import { describe, expect, it } from "vitest";
import { resolveAudience } from "./audience.js";
import {
  parseGroupMembership,
  parseMember,
  type GroupMembership,
  type Member
} from "./schemas.js";

const ISO = "2026-06-17T10:00:00.000Z";

const member = (overrides: Record<string, unknown>): Member =>
  parseMember({
    contactChannelRefs: [],
    createdAt: ISO,
    customFieldValues: [],
    displayName: "Member",
    memberId: "member-x",
    segmentRefs: [],
    status: "active",
    tenantId: "tenant-1",
    updatedAt: ISO,
    ...overrides
  });

const membership = (overrides: Record<string, unknown>): GroupMembership =>
  parseGroupMembership({
    active: true,
    groupId: "group-1",
    joinedAt: ISO,
    memberRef: "member-x",
    membershipId: "membership-x",
    roleInGroup: "member",
    tenantId: "tenant-1",
    updatedAt: ISO,
    ...overrides
  });

const granted = (memberId: string): Member =>
  member({
    contactChannelRefs: [
      { channelRef: `vault-${memberId}-sms`, consentStatus: "granted", kind: "sms" }
    ],
    memberId
  });

const denied = (memberId: string): Member =>
  member({
    contactChannelRefs: [
      { channelRef: `vault-${memberId}-sms`, consentStatus: "denied", kind: "sms" }
    ],
    memberId
  });

const unknownConsent = (memberId: string): Member =>
  member({
    contactChannelRefs: [
      { channelRef: `vault-${memberId}-sms`, consentStatus: "unknown", kind: "sms" }
    ],
    memberId
  });

describe("resolveAudience consent enforcement", () => {
  it("includes a consented recipient as refs only (no name, no contact value)", () => {
    const resolved = resolveAudience(
      { kind: "explicit", memberRefs: ["member-a"] },
      "sms",
      [granted("member-a")],
      []
    );

    expect(resolved.included).toEqual([
      { channelRef: "vault-member-a-sms", memberRef: "member-a" }
    ]);
    expect(resolved.suppressed).toEqual([]);
    // The resolved recipient shape is refs only — assert no display name leaked.
    const includedKeys = Object.keys(resolved.included[0] ?? {});
    expect(includedKeys.sort()).toEqual(["channelRef", "memberRef"]);
  });

  it("suppresses (not drops) a denied recipient with a reason", () => {
    const resolved = resolveAudience(
      { kind: "explicit", memberRefs: ["member-a"] },
      "sms",
      [denied("member-a")],
      []
    );

    expect(resolved.included).toEqual([]);
    expect(resolved.suppressed).toEqual([
      { consentStatus: "denied", memberRef: "member-a", reason: "consent-not-granted" }
    ]);
  });

  it("suppresses an unknown-consent recipient with a reason", () => {
    const resolved = resolveAudience(
      { kind: "explicit", memberRefs: ["member-a"] },
      "sms",
      [unknownConsent("member-a")],
      []
    );

    expect(resolved.suppressed).toEqual([
      {
        consentStatus: "unknown",
        memberRef: "member-a",
        reason: "consent-not-granted"
      }
    ]);
  });

  it("partitions a mixed audience into included and suppressed", () => {
    const resolved = resolveAudience(
      { kind: "explicit", memberRefs: ["member-a", "member-b", "member-c"] },
      "sms",
      [granted("member-a"), denied("member-b"), granted("member-c")],
      []
    );

    expect(resolved.included.map((entry) => entry.memberRef)).toEqual([
      "member-a",
      "member-c"
    ]);
    expect(resolved.suppressed.map((entry) => entry.memberRef)).toEqual(["member-b"]);
  });

  it("suppresses a member who has no channel of the message kind", () => {
    const emailOnly = member({
      contactChannelRefs: [
        { channelRef: "vault-email", consentStatus: "granted", kind: "email" }
      ],
      memberId: "member-a"
    });

    const resolved = resolveAudience(
      { kind: "explicit", memberRefs: ["member-a"] },
      "sms",
      [emailOnly],
      []
    );

    expect(resolved.included).toEqual([]);
    expect(resolved.suppressed).toEqual([
      { memberRef: "member-a", reason: "no-channel-of-kind" }
    ]);
  });

  it("matches consent to the message channel kind, not another channel", () => {
    // SMS denied but email granted; an email send must include this member.
    const mixed = member({
      contactChannelRefs: [
        { channelRef: "vault-sms", consentStatus: "denied", kind: "sms" },
        { channelRef: "vault-email", consentStatus: "granted", kind: "email" }
      ],
      memberId: "member-a"
    });

    const sms = resolveAudience(
      { kind: "explicit", memberRefs: ["member-a"] },
      "sms",
      [mixed],
      []
    );
    const email = resolveAudience(
      { kind: "explicit", memberRefs: ["member-a"] },
      "email",
      [mixed],
      []
    );

    expect(sms.included).toEqual([]);
    expect(email.included).toEqual([
      { channelRef: "vault-email", memberRef: "member-a" }
    ]);
  });

  it("flags an explicit member that does not exist as member-not-found", () => {
    const resolved = resolveAudience(
      { kind: "explicit", memberRefs: ["ghost"] },
      "sms",
      [],
      []
    );

    expect(resolved.suppressed).toEqual([
      { memberRef: "ghost", reason: "member-not-found" }
    ]);
  });
});

describe("resolveAudience descriptor expansion", () => {
  it("expands a group to its active members only", () => {
    const resolved = resolveAudience(
      { groupId: "group-1", kind: "group" },
      "sms",
      [granted("member-a"), granted("member-b")],
      [
        membership({ memberRef: "member-a", membershipId: "m-a" }),
        membership({ active: false, memberRef: "member-b", membershipId: "m-b" })
      ]
    );

    expect(resolved.included.map((entry) => entry.memberRef)).toEqual(["member-a"]);
  });

  it("expands a segment to members carrying that segmentRef", () => {
    const inSegment = member({
      contactChannelRefs: [
        { channelRef: "vault-a", consentStatus: "granted", kind: "sms" }
      ],
      memberId: "member-a",
      segmentRefs: ["segment-vips"]
    });
    const notInSegment = granted("member-b");

    const resolved = resolveAudience(
      { kind: "segment", segmentRef: "segment-vips" },
      "sms",
      [inSegment, notInSegment],
      []
    );

    expect(resolved.included.map((entry) => entry.memberRef)).toEqual(["member-a"]);
  });

  it("deduplicates repeated members in an explicit descriptor", () => {
    const resolved = resolveAudience(
      { kind: "explicit", memberRefs: ["member-a", "member-a"] },
      "sms",
      [granted("member-a")],
      []
    );

    expect(resolved.included).toHaveLength(1);
  });

  it("is deterministic for identical inputs", () => {
    const members = [granted("member-a"), denied("member-b")];
    const descriptor = {
      kind: "explicit" as const,
      memberRefs: ["member-a", "member-b"]
    };

    expect(resolveAudience(descriptor, "sms", members, [])).toEqual(
      resolveAudience(descriptor, "sms", members, [])
    );
  });
});
