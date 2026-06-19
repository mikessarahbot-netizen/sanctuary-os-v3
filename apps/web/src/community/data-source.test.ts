import { describe, expect, it } from "vitest";
import {
  createDemoCommunityDataSource,
  resolveCommunityDataSourceMode
} from "./data-source.js";
import { SAMPLE_COMMUNITY_GROUPS } from "./sample-data.js";

describe("resolveCommunityDataSourceMode", () => {
  it("defaults to demo", () => {
    expect(resolveCommunityDataSourceMode()).toBe("demo");
  });

  it("honors an explicit mode argument first", () => {
    expect(resolveCommunityDataSourceMode({ mode: "live", search: "?demo" })).toBe(
      "live"
    );
  });

  it("reads ?demo from the query string", () => {
    expect(resolveCommunityDataSourceMode({ search: "?demo", envValue: "live" })).toBe(
      "demo"
    );
  });

  it("reads ?source=live from the query string", () => {
    expect(resolveCommunityDataSourceMode({ search: "?source=live" })).toBe("live");
  });

  it("falls back to the env value", () => {
    expect(resolveCommunityDataSourceMode({ envValue: "live" })).toBe("live");
  });
});

describe("createDemoCommunityDataSource", () => {
  it("lists the seeded sample groups", async () => {
    const groups = await createDemoCommunityDataSource().listCommunityGroups();

    expect(groups).toEqual(SAMPLE_COMMUNITY_GROUPS);
  });

  it("resolves a group's detail with its joined members and engagement", async () => {
    const detail = await createDemoCommunityDataSource().getCommunityGroupDetail(
      "group-hospitality"
    );

    expect(detail?.group.label).toBe("Hospitality Team");
    expect(detail?.members.map((row) => row.membership.memberRef)).toEqual([
      "member-anita",
      "member-david",
      "member-maria"
    ]);
    // Memberships are joined to PII-safe member display fields.
    expect(detail?.members[0]?.member?.displayName).toBe("Anita Bello");
    // ...and to the member's PII-free engagement summary.
    expect(detail?.members[0]?.engagement?.servingCount).toBe(2);
  });

  it("resolves null for an unknown group id", async () => {
    const detail = await createDemoCommunityDataSource().getCommunityGroupDetail(
      "missing"
    );

    expect(detail).toBeNull();
  });
});

describe("createDemoCommunityDataSource comms gate", () => {
  it("composeDraft + getResolvedAudience shows the consent-filtered included vs suppressed split", async () => {
    const source = createDemoCommunityDataSource();
    const draft = await source.composeDraft({
      bodyTemplate: "Setup is at 9am.",
      channel: "sms",
      groupId: "group-hospitality"
    });

    expect(draft.status).toBe("draft");

    const audience = await source.getResolvedAudience(draft.messageId);

    // Hospitality over sms: Anita granted -> included; David denied + Maria no-sms
    // -> suppressed. The split mirrors the live server's resolveAudience.
    expect(audience?.included.map((r) => r.memberRef)).toEqual(["member-anita"]);
    expect(
      audience?.suppressed.map((r) => ({ memberRef: r.memberRef, reason: r.reason }))
    ).toEqual([
      { memberRef: "member-david", reason: "consent-not-granted" },
      { memberRef: "member-maria", reason: "no-channel-of-kind" }
    ]);
  });

  it("CONSENT: a non-consented member is suppressed, never included, and no contact value appears", async () => {
    const source = createDemoCommunityDataSource();
    const draft = await source.composeDraft({
      bodyTemplate: "Hello.",
      channel: "sms",
      groupId: "group-hospitality"
    });
    const audience = await source.getResolvedAudience(draft.messageId);

    const includedRefs = audience?.included.map((r) => r.memberRef) ?? [];
    const suppressedRefs = audience?.suppressed.map((r) => r.memberRef) ?? [];
    // David (sms denied) is suppressed, not included.
    expect(includedRefs).not.toContain("member-david");
    expect(suppressedRefs).toContain("member-david");

    // The whole audience payload carries refs + reasons only — no contact value.
    const serialized = JSON.stringify(audience);
    expect(serialized).not.toContain("@");
    expect(serialized).not.toMatch(/\d{7,}/);
  });

  it("getResolvedAudience returns null for a message it never composed", async () => {
    const source = createDemoCommunityDataSource();

    expect(await source.getResolvedAudience("never-composed")).toBeNull();
  });

  it("confirmAndQueue queues a composed draft and reports the included + suppressed counts", async () => {
    const source = createDemoCommunityDataSource();
    const draft = await source.composeDraft({
      bodyTemplate: "Setup is at 9am.",
      channel: "sms",
      groupId: "group-hospitality"
    });

    const result = await source.confirmAndQueue({
      confirmedByRef: "demo-web-operator",
      messageId: draft.messageId,
      reason: "Approved by lead"
    });

    expect(result.includedCount).toBe(1);
    expect(result.suppressedCount).toBe(2);
    expect(result.message.status).toBe("sent");
  });

  it("GATE: confirmAndQueue refuses a message the demo source never composed (no draft -> no queue)", async () => {
    const source = createDemoCommunityDataSource();

    await expect(
      source.confirmAndQueue({
        confirmedByRef: "demo-web-operator",
        messageId: "never-composed",
        reason: "trying to skip the gate"
      })
    ).rejects.toThrow(/no longer available/);
  });

  it("GATE: a draft can be queued only once (a re-queue of the same message is refused)", async () => {
    const source = createDemoCommunityDataSource();
    const draft = await source.composeDraft({
      bodyTemplate: "Setup is at 9am.",
      channel: "sms",
      groupId: "group-hospitality"
    });

    await source.confirmAndQueue({
      confirmedByRef: "demo-web-operator",
      messageId: draft.messageId,
      reason: "Approved"
    });

    await expect(
      source.confirmAndQueue({
        confirmedByRef: "demo-web-operator",
        messageId: draft.messageId,
        reason: "again"
      })
    ).rejects.toThrow(/no longer available/);
  });

  it("CONSENT FLOOR: queuing a channel with zero consented recipients is refused", async () => {
    // Tuesday group over push: neither Jon (push granted? no — push only Jon) —
    // actually Jon has push granted, so use a channel no Tuesday member consents to.
    // Tuesday = Jon (push granted) + Anita (sms/email granted). Over `push`, only
    // Jon is included, so that is NOT empty. Use sms on a group whose members lack
    // a consented sms: compose for a hand-built case via Hospitality over `push`
    // (no Hospitality member has a push channel -> all suppressed -> empty included).
    const source = createDemoCommunityDataSource();
    const draft = await source.composeDraft({
      bodyTemplate: "Hello.",
      channel: "push",
      groupId: "group-hospitality"
    });

    const audience = await source.getResolvedAudience(draft.messageId);
    expect(audience?.included).toHaveLength(0);

    await expect(
      source.confirmAndQueue({
        confirmedByRef: "demo-web-operator",
        messageId: draft.messageId,
        reason: "no one consents"
      })
    ).rejects.toThrow(/consent/i);
  });
});
