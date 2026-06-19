import type { ReactElement } from "react";
import { CommunityComposePanel } from "./CommunityComposePanel.js";
import type {
  CommunicationChannel,
  CommunicationMessageRef,
  CommunityDetailState,
  ContactChannelRefEntry,
  GroupMemberRow,
  QueuedCommunicationResult,
  ResolvedAudience
} from "./types.js";

/**
 * Community group DETAIL view. Shows the group label, its kind / leader ref /
 * archived flag, the count of members, and the resolved member rows: each
 * member's display name, role in the group, status, opaque contact-channel refs
 * (kind + consent — NEVER a contact value), and (when available) their PII-free
 * engagement summary counts. Renders the discriminated `CommunityDetailState` so
 * loading / error / missing / loaded are all explicit. Mirrors the shape of
 * `apps/web/src/play/PlayDetail`.
 *
 * When the comms callbacks are provided (the screen wires them to the data
 * source), the loaded view also renders the COMPOSE affordance — a
 * `CommunityComposePanel` for the selected group that drives the consent-preview +
 * human-confirm-send gate. Omitting them keeps the view read-only (the existing
 * groups/members surface is unchanged), exactly like `ChartDetail`'s optional
 * `onSave`.
 *
 * PRIVACY: a `ContactChannelRefEntry` is rendered as "<kind> · <consent>"
 * (e.g. "sms · granted") and never prints the `channelRef` token or any contact
 * value, so no phone/email/address-shaped text can reach the DOM.
 */
export interface CommunityCommsCallbacks {
  readonly onComposeDraft: (input: {
    readonly groupId: string;
    readonly channel: CommunicationChannel;
    readonly bodyTemplate: string;
    readonly subject?: string;
  }) => Promise<CommunicationMessageRef>;
  readonly onResolveAudience: (
    messageId: string
  ) => Promise<ResolvedAudience | null>;
  readonly onConfirmAndQueue: (input: {
    readonly messageId: string;
    readonly reason: string;
  }) => Promise<QueuedCommunicationResult>;
}

export interface CommunityDetailProps {
  readonly state: CommunityDetailState;
  readonly comms?: CommunityCommsCallbacks;
}

const renderContactRef = (
  entry: ContactChannelRefEntry,
  index: number
): ReactElement => (
  <span className="play-tag" key={`${entry.kind}-${String(index)}`}>
    {entry.kind} · {entry.consentStatus}
  </span>
);

const renderMemberRow = (row: GroupMemberRow): ReactElement => {
  const { membership, member, engagement } = row;
  const label = member?.displayName ?? membership.memberRef;

  return (
    <li className="play-section" key={membership.membershipId}>
      <span className="play-section__label">{label}</span>
      <span className="play-section__meta">
        <span className="play-tag">{membership.roleInGroup}</span>
        {member !== null ? <span>{member.status}</span> : null}
        {member !== null
          ? member.contactChannelRefs.map(renderContactRef)
          : null}
        {engagement !== null ? (
          <span>
            streak {engagement.attendanceStreak} · serving {engagement.servingCount}
          </span>
        ) : null}
      </span>
    </li>
  );
};

export const CommunityDetail = (props: CommunityDetailProps): ReactElement => {
  const { state, comms } = props;

  if (state.status === "loading") {
    return (
      <section className="chart-detail" role="status" aria-busy="true">
        <p className="charts-empty">Loading group…</p>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section className="chart-detail" role="alert">
        <p className="charts-error">Could not load group: {state.message}</p>
      </section>
    );
  }

  if (state.status === "missing") {
    return (
      <section className="chart-detail">
        <p className="charts-empty">Select a group to view its members.</p>
      </section>
    );
  }

  const { detail } = state;
  const { group } = detail;

  return (
    <section className="chart-detail" aria-label="Community group detail">
      <header className="chart-detail__header">
        <h2 className="chart-detail__title">{group.label}</h2>
        <dl className="chart-detail__facts">
          <div>
            <dt>Kind</dt>
            <dd className="play-tag">{group.kind}</dd>
          </div>
          <div>
            <dt>Members</dt>
            <dd>{detail.members.length}</dd>
          </div>
          {group.leaderMemberRef !== null ? (
            <div>
              <dt>Leader ref</dt>
              <dd className="chart-songref">{group.leaderMemberRef}</dd>
            </div>
          ) : null}
        </dl>
      </header>

      <div className="play-panel" aria-label="Group members">
        <h3 className="play-panel__title">Members</h3>
        {detail.members.length === 0 ? (
          <p className="charts-empty">No members in this group.</p>
        ) : (
          <ul className="play-list">{detail.members.map(renderMemberRow)}</ul>
        )}
      </div>

      {comms !== undefined ? (
        <CommunityComposePanel
          groupId={group.groupId}
          groupLabel={group.label}
          memberRows={detail.members}
          onComposeDraft={comms.onComposeDraft}
          onResolveAudience={comms.onResolveAudience}
          onConfirmAndQueue={comms.onConfirmAndQueue}
        />
      ) : null}
    </section>
  );
};
