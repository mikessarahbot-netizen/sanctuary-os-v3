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
