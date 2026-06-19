import {
  createCommunityClient,
  type CommunityDataSource,
  type ComposeDraftInput,
  type ConfirmAndQueueInput
} from "./client.js";
import {
  SAMPLE_COMMUNITY_GROUPS,
  findSampleCommunityGroupDetail,
  resolveSampleAudience
} from "./sample-data.js";
import type {
  CommunicationMessageRef,
  CommunityGroup,
  CommunityGroupDetail,
  QueuedCommunicationResult,
  ResolvedAudience
} from "./types.js";

/**
 * Resolves which Community+ data source the app uses.
 *
 * Demo mode renders seeded `SAMPLE_COMMUNITY_GROUPS` so the screen is populated
 * without a live API (used for screenshots and as the safe default). Live mode
 * talks to the GraphQL endpoint via `createCommunityClient`. Selection precedence
 * mirrors the Charts/Play surfaces (`apps/web/src/charts/data-source.ts`):
 *   1. an explicit `mode` argument (used by tests / callers),
 *   2. the `?demo` / `?source=live` URL query,
 *   3. the `VITE_DATA_SOURCE` env value (`demo` | `live`),
 *   4. default `demo` (so a fresh `pnpm --filter @sanctuary-os/web dev` renders).
 *
 * The demo source is STATEFUL for the comms gate: it tracks composed drafts and
 * REPLAYS the real consent + human-confirm gates — `getResolvedAudience` runs the
 * pure consent resolver over the seeded members (so suppression is visible without
 * an API), and `confirmAndQueue` refuses to queue a draft it has not seen and
 * advances it through confirm before reporting the queued result. This makes the
 * demo gate behave like the live server (a draft can't queue without a confirm;
 * non-consented recipients are suppressed) for screenshots and component tests.
 */
export type CommunityDataSourceMode = "demo" | "live";

/**
 * The terminal lifecycle a demo confirm-and-queue lands on. The live
 * `queueConfirmedCommunication` runs queue→send synchronously through the FAKE send
 * port and returns `sent`; the demo mirrors that so the queued result matches.
 */
const DEMO_QUEUED_STATUS = "sent";

export const createDemoCommunityDataSource = (): CommunityDataSource => {
  // Composed drafts this source has seen, by messageId — the demo gate state.
  const drafts = new Map<
    string,
    { readonly groupId: string; readonly channel: ComposeDraftInput["channel"] }
  >();
  let nextMessageNumber = 1;

  return {
    listCommunityGroups: (): Promise<readonly CommunityGroup[]> =>
      Promise.resolve(SAMPLE_COMMUNITY_GROUPS.map((group) => ({ ...group }))),
    getCommunityGroupDetail: (
      groupId: string
    ): Promise<CommunityGroupDetail | null> => {
      const detail = findSampleCommunityGroupDetail(groupId);

      return Promise.resolve(detail === undefined ? null : { ...detail });
    },
    composeDraft: (
      input: ComposeDraftInput
    ): Promise<CommunicationMessageRef> => {
      const messageId = `demo-message-${String(nextMessageNumber++)}`;
      drafts.set(messageId, { channel: input.channel, groupId: input.groupId });

      return Promise.resolve({
        channel: input.channel,
        messageId,
        origin: "human",
        status: "draft"
      });
    },
    getResolvedAudience: (
      messageId: string
    ): Promise<ResolvedAudience | null> => {
      const draft = drafts.get(messageId);

      if (draft === undefined) {
        return Promise.resolve(null);
      }

      return Promise.resolve(resolveSampleAudience(draft.groupId, draft.channel));
    },
    confirmAndQueue: (
      input: ConfirmAndQueueInput
    ): Promise<QueuedCommunicationResult> => {
      const draft = drafts.get(input.messageId);

      // Mirror the live gate: a draft the source never saw cannot be queued.
      if (draft === undefined) {
        return Promise.reject(
          new Error("This communication message is no longer available.")
        );
      }

      const audience = resolveSampleAudience(draft.groupId, draft.channel);

      // Mirror the server's consent floor: queuing with zero consented recipients
      // is refused (there is no one to send to).
      if (audience.included.length === 0) {
        return Promise.reject(
          new Error("No recipient has granted consent for this channel.")
        );
      }

      // The draft has now been confirmed + queued; drop it so a duplicate queue of
      // the same message behaves like the server (the message is no longer a draft).
      drafts.delete(input.messageId);

      return Promise.resolve({
        includedCount: audience.included.length,
        message: {
          channel: draft.channel,
          messageId: input.messageId,
          origin: "human",
          status: DEMO_QUEUED_STATUS
        },
        suppressedCount: audience.suppressed.length
      });
    }
  };
};

const modeFromSearch = (search: string): CommunityDataSourceMode | undefined => {
  const params = new URLSearchParams(search);

  if (params.has("demo")) {
    return "demo";
  }

  const source = params.get("source");

  if (source === "live" || source === "demo") {
    return source;
  }

  return undefined;
};

const modeFromEnv = (
  envValue: string | undefined
): CommunityDataSourceMode | undefined => {
  if (envValue === "live" || envValue === "demo") {
    return envValue;
  }

  return undefined;
};

export interface ResolveCommunityDataSourceOptions {
  readonly mode?: CommunityDataSourceMode;
  readonly search?: string;
  readonly envValue?: string;
  readonly endpoint?: string;
}

export const resolveCommunityDataSourceMode = (
  options: ResolveCommunityDataSourceOptions = {}
): CommunityDataSourceMode =>
  options.mode ??
  modeFromSearch(options.search ?? "") ??
  modeFromEnv(options.envValue) ??
  "demo";

export const resolveCommunityDataSource = (
  options: ResolveCommunityDataSourceOptions = {}
): CommunityDataSource => {
  const mode = resolveCommunityDataSourceMode(options);

  if (mode === "demo") {
    return createDemoCommunityDataSource();
  }

  return createCommunityClient(
    options.endpoint !== undefined ? { endpoint: options.endpoint } : {}
  );
};
