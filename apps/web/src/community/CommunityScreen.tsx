import { useCallback, useEffect, useState, type ReactElement } from "react";
import type { CommunityDataSource } from "./client.js";
import { CommunityDetail } from "./CommunityDetail.js";
import { CommunityList } from "./CommunityList.js";
import type { CommunityDetailState, CommunityLoadState } from "./types.js";

/**
 * Community+ read surface container.
 *
 * Loads the community-group list from the injected `CommunityDataSource`, tracks
 * the selected group, and loads that group's detail (resolved members + their
 * engagement summaries). The data source is injected so the same component
 * renders against demo sample data, a live GraphQL endpoint, or a test double.
 * The `mode` label is surfaced in the header so a screenshot makes clear whether
 * the data is demo or live. Mirrors `apps/web/src/play/PlayScreen` (read-only — no
 * write path). The surface renders only PII-safe fields.
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
        <CommunityDetail state={detailState} />
      </div>
    </main>
  );
};
