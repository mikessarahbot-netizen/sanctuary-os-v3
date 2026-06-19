import { assembleGroupMemberRows } from "./client.js";
import type {
  CommunityGroup,
  CommunityGroupDetail,
  EngagementSummary,
  GroupMembership,
  Member
} from "./types.js";

/**
 * Seeded sample Community+ data for demo mode and tests.
 *
 * Demo mode (the default data source, or `?demo` / `VITE_DATA_SOURCE=demo`)
 * renders these so the Community screen is populated and screenshot-able without
 * a live GraphQL API. The same groups / members / memberships / engagement
 * summaries are seeded into the demo server (`apps/api/src/demo/server.ts`) so
 * live mode renders the same data.
 *
 * PRIVACY: every value here is PII-SAFE. Members carry a `displayName` (a
 * directory name) + `status` and opaque `contactChannelRefs` — each ref is a
 * vault `channelRef` token (e.g. `channel-anita-sms`), a `kind`, and a
 * `consentStatus`, NEVER a phone/email/address value. The seed deliberately uses
 * obviously-non-contact ref tokens so a privacy test can assert no contact-shaped
 * value (no `@`, no phone digits) ever reaches the DOM.
 *
 * The enum-valued fields use the GraphQL SDL names the live client receives
 * (underscored where the domain value is hyphenated: `serving_team`,
 * `small_group`, `co_leader`) so demo and live render identically.
 */
const ANITA: Member = {
  contactChannelRefs: [
    { channelRef: "channel-anita-sms", consentStatus: "granted", kind: "sms" },
    { channelRef: "channel-anita-email", consentStatus: "granted", kind: "email" }
  ],
  displayName: "Anita Bello",
  householdRef: "household-bello",
  memberId: "member-anita",
  status: "active",
  tenantId: "tenant-demo"
};

const DAVID: Member = {
  contactChannelRefs: [
    { channelRef: "channel-david-sms", consentStatus: "denied", kind: "sms" }
  ],
  displayName: "David Okoye",
  householdRef: null,
  memberId: "member-david",
  status: "active",
  tenantId: "tenant-demo"
};

const MARIA: Member = {
  contactChannelRefs: [
    { channelRef: "channel-maria-email", consentStatus: "unknown", kind: "email" }
  ],
  displayName: "Maria Santos",
  householdRef: null,
  memberId: "member-maria",
  status: "visitor",
  tenantId: "tenant-demo"
};

const JON: Member = {
  contactChannelRefs: [
    { channelRef: "channel-jon-push", consentStatus: "granted", kind: "push" }
  ],
  displayName: "Jon Pierce",
  householdRef: "household-bello",
  memberId: "member-jon",
  status: "active",
  tenantId: "tenant-demo"
};

export const SAMPLE_MEMBERS: readonly Member[] = [ANITA, DAVID, MARIA, JON];

const HOSPITALITY: CommunityGroup = {
  archived: false,
  groupId: "group-hospitality",
  kind: "serving_team",
  label: "Hospitality Team",
  leaderMemberRef: "member-anita",
  tenantId: "tenant-demo"
};

const TUESDAY_GROUP: CommunityGroup = {
  archived: false,
  groupId: "group-tuesday",
  kind: "small_group",
  label: "Tuesday Small Group",
  leaderMemberRef: "member-jon",
  tenantId: "tenant-demo"
};

export const SAMPLE_COMMUNITY_GROUPS: readonly CommunityGroup[] = [
  HOSPITALITY,
  TUESDAY_GROUP
];

const HOSPITALITY_MEMBERSHIPS: readonly GroupMembership[] = [
  {
    active: true,
    groupId: "group-hospitality",
    joinedAt: "2026-01-10T09:00:00.000Z",
    memberRef: "member-anita",
    membershipId: "membership-hospitality-anita",
    roleInGroup: "leader",
    tenantId: "tenant-demo"
  },
  {
    active: true,
    groupId: "group-hospitality",
    joinedAt: "2026-02-01T09:00:00.000Z",
    memberRef: "member-david",
    membershipId: "membership-hospitality-david",
    roleInGroup: "member",
    tenantId: "tenant-demo"
  },
  {
    active: true,
    groupId: "group-hospitality",
    joinedAt: "2026-03-05T09:00:00.000Z",
    memberRef: "member-maria",
    membershipId: "membership-hospitality-maria",
    roleInGroup: "guest",
    tenantId: "tenant-demo"
  }
];

const TUESDAY_MEMBERSHIPS: readonly GroupMembership[] = [
  {
    active: true,
    groupId: "group-tuesday",
    joinedAt: "2026-01-15T09:00:00.000Z",
    memberRef: "member-jon",
    membershipId: "membership-tuesday-jon",
    roleInGroup: "leader",
    tenantId: "tenant-demo"
  },
  {
    active: true,
    groupId: "group-tuesday",
    joinedAt: "2026-02-20T09:00:00.000Z",
    memberRef: "member-anita",
    membershipId: "membership-tuesday-anita",
    roleInGroup: "co_leader",
    tenantId: "tenant-demo"
  }
];

export const SAMPLE_GROUP_MEMBERSHIPS: readonly GroupMembership[] = [
  ...HOSPITALITY_MEMBERSHIPS,
  ...TUESDAY_MEMBERSHIPS
];

/**
 * PII-free engagement rollups (refs + counts only). `servingCount` mirrors the
 * count of each member's active memberships in the seed (Anita is in two groups);
 * the streak / response counts are illustrative window rollups.
 */
export const SAMPLE_ENGAGEMENT_SUMMARIES: readonly EngagementSummary[] = [
  {
    attendanceStreak: 4,
    commsResponseCount: 2,
    scope: { memberRef: "member-anita" },
    servingCount: 2,
    summaryId: "engagement:member:member-anita",
    tenantId: "tenant-demo"
  },
  {
    attendanceStreak: 1,
    commsResponseCount: 0,
    scope: { memberRef: "member-david" },
    servingCount: 1,
    summaryId: "engagement:member:member-david",
    tenantId: "tenant-demo"
  },
  {
    attendanceStreak: 0,
    commsResponseCount: 0,
    scope: { memberRef: "member-maria" },
    servingCount: 1,
    summaryId: "engagement:member:member-maria",
    tenantId: "tenant-demo"
  },
  {
    attendanceStreak: 3,
    commsResponseCount: 1,
    scope: { memberRef: "member-jon" },
    servingCount: 1,
    summaryId: "engagement:member:member-jon",
    tenantId: "tenant-demo"
  }
];

const MEMBERSHIPS_BY_GROUP: ReadonlyMap<string, readonly GroupMembership[]> =
  new Map([
    ["group-hospitality", HOSPITALITY_MEMBERSHIPS],
    ["group-tuesday", TUESDAY_MEMBERSHIPS]
  ]);

export const findSampleCommunityGroupDetail = (
  groupId: string
): CommunityGroupDetail | undefined => {
  const group = SAMPLE_COMMUNITY_GROUPS.find((entry) => entry.groupId === groupId);

  if (group === undefined) {
    return undefined;
  }

  const memberships = MEMBERSHIPS_BY_GROUP.get(groupId) ?? [];

  return {
    group,
    members: assembleGroupMemberRows(
      memberships,
      SAMPLE_MEMBERS,
      SAMPLE_ENGAGEMENT_SUMMARIES
    )
  };
};
