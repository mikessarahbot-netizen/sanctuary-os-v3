import { useCallback, useEffect, useState, type ReactElement } from "react";
import type { PlayDataSource } from "./client.js";
import { PlayDetail } from "./PlayDetail.js";
import { PlayList } from "./PlayList.js";
import type { PlayDetailState, PlayLoadState } from "./types.js";

/**
 * Play read surface container.
 *
 * Loads the track-set list from the injected `PlayDataSource`, tracks the
 * selected track set, and loads that track set's detail (sections + cues). The
 * data source is injected so the same component renders against demo sample
 * data, a live GraphQL endpoint, or a test double. The `mode` label is surfaced
 * in the header so a screenshot makes clear whether the data is demo or live.
 * Mirrors `apps/web/src/charts/ChartsScreen` (read-only — no write path).
 */
export interface PlayScreenProps {
  readonly dataSource: PlayDataSource;
  readonly mode: "demo" | "live";
  readonly initialSelectedTrackSetId?: string | null;
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown error.";

export const PlayScreen = (props: PlayScreenProps): ReactElement => {
  const { dataSource } = props;
  const [listState, setListState] = useState<PlayLoadState>({ status: "loading" });
  const [selectedTrackSetId, setSelectedTrackSetId] = useState<string | null>(
    props.initialSelectedTrackSetId ?? null
  );
  const [detailState, setDetailState] = useState<PlayDetailState>({ status: "missing" });

  useEffect(() => {
    let cancelled = false;

    dataSource
      .listTrackSets()
      .then((trackSets) => {
        if (!cancelled) {
          setListState({ status: "loaded", trackSets });
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
    if (selectedTrackSetId === null) {
      setDetailState({ status: "missing" });

      return;
    }

    let cancelled = false;
    setDetailState({ status: "loading" });

    dataSource
      .getTrackSetDetail(selectedTrackSetId)
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
  }, [dataSource, selectedTrackSetId]);

  const handleSelect = useCallback((trackSetId: string): void => {
    setSelectedTrackSetId(trackSetId);
  }, []);

  return (
    <main className="charts-screen">
      <header className="charts-screen__header">
        <h1>Play</h1>
        <span className={`mode-badge mode-badge--${props.mode}`}>{props.mode} data</span>
      </header>
      <div className="charts-screen__body">
        <nav className="charts-screen__sidebar" aria-label="Track set library">
          <PlayList
            state={listState}
            selectedTrackSetId={selectedTrackSetId}
            onSelect={handleSelect}
          />
        </nav>
        <PlayDetail state={detailState} />
      </div>
    </main>
  );
};
