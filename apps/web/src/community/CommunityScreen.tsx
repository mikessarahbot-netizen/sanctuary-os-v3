import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import {
  DEFAULT_COMMS_ACTOR_REF,
  type CommunityDataSource
} from "./client.js";
import { CommunityDetail, type CommunityCommsCallbacks } from "./CommunityDetail.js";
import { CommunityList } from "./CommunityList.js";
import type { CommunityDetailState, CommunityLoadState } from "./types.js";

/**
 * Community+ surface container.
 *
 * Loads the community-group list from the injected `CommunityDataSource`, tracks
 * the selected group, and loads that group's detail (resolved members + their
 * engagement summaries). The data source is injected so the same component
 * renders against demo sample data, a live GraphQL endpoint, or a test double.
 * The `mode` label is surfaced in the header so a screenshot makes clear whether
 * the data is demo or live. The read surface mirrors `apps/web/src/play/PlayScreen`
 * and renders only PII-safe fields.
 *
 * It also wires the COMMS gate: the data source's `composeDraft` /
 * `getResolvedAudience` / `confirmAndQueue` are passed down to the detail's compose
 * panel, which drives the consent-preview + human-confirm-send flow. The
 * confirm-send is attributed to `DEFAULT_COMMS_ACTOR_REF` (cosmetic in demo).
 */
export interface CommunityScreenProps {
  readonly dataSource: CommunityDataSource;
  readonly mode: "demo" | "live";
  readonly initialSelectedGroupId?: string | null;
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown error.";

export const CommunityScreen = (props: CommunityScreenProps): ReactElement => {
  const { dataSource } = props;
  const [listState, setListState] = useState<CommunityLoadState>({
    status: "loading"
  });
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(
    props.initialSelectedGroupId ?? null
  );
  const [detailState, setDetailState] = useState<CommunityDetailState>({
    status: "missing"
  });

  useEffect(() => {
    let cancelled = false;

    dataSource
      .listCommunityGroups()
      .then((groups) => {
        if (!cancelled) {
          setListState({ status: "loaded", groups });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setListState({ status: "error", message: errorMessage(error) });
        }
      });

    return (): void => {
      cancelled = true;
    };
  }, [dataSource]);

  useEffect(() => {
    if (selectedGroupId === null) {
      setDetailState({ status: "missing" });

      return;
    }

    let cancelled = false;
    setDetailState({ status: "loading" });

    dataSource
      .getCommunityGroupDetail(selectedGroupId)
      .then((detail) => {
        if (cancelled) {
          return;
        }

        setDetailState(
          detail === null ? { status: "missing" } : { status: "loaded", detail }
        );
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setDetailState({ status: "error", message: errorMessage(error) });
        }
      });

    return (): void => {
      cancelled = true;
    };
  }, [dataSource, selectedGroupId]);

  const handleSelect = useCallback((groupId: string): void => {
    setSelectedGroupId(groupId);
  }, []);

  // Adapt the data source's comms methods into the detail panel's callback shape.
  // `confirmAndQueue` is attributed to the demo operator ref; this object is the
  // ONLY thing that exposes a queue path to the UI, and it always confirms first.
  const comms = useMemo<CommunityCommsCallbacks>(
    () => ({
      onComposeDraft: (input) => dataSource.composeDraft(input),
      onConfirmAndQueue: (input) =>
        dataSource.confirmAndQueue({
          confirmedByRef: DEFAULT_COMMS_ACTOR_REF,
          messageId: input.messageId,
          reason: input.reason
        }),
      // The AI-draft affordance: hand the data source's `draftWithAi` straight to the
      // compose panel. The returned ai-drafted draft is routed through the same
      // confirm-send gate (onConfirmAndQueue) — AI drafts, a human confirms.
      onDraftWithAi: (input) => dataSource.draftWithAi(input),
      onResolveAudience: (messageId) => dataSource.getResolvedAudience(messageId)
    }),
    [dataSource]
  );

  return (
    <main className="charts-screen">
      <header className="charts-screen__header">
        <h1>Community</h1>
        <span className={`mode-badge mode-badge--${props.mode}`}>{props.mode} data</span>
      </header>
      <div className="charts-screen__body">
        <nav className="charts-screen__sidebar" aria-label="Community group library">
          <CommunityList
            state={listState}
            selectedGroupId={selectedGroupId}
            onSelect={handleSelect}
          />
        </nav>
        <CommunityDetail state={detailState} comms={comms} />
      </div>
    </main>
  );
};
