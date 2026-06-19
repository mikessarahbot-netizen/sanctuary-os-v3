import { useCallback, useEffect, useState, type ReactElement } from "react";
import type { PlayDataSource, SetPlaybackStateInput } from "./client.js";
import { PlayDetail } from "./PlayDetail.js";
import { PlayList } from "./PlayList.js";
import type { PlaybackState, PlayDetailState, PlayLoadState } from "./types.js";

/**
 * Play surface container.
 *
 * Loads the track-set list from the injected `PlayDataSource`, tracks the
 * selected track set, and loads that track set's detail (sections + cues) plus
 * its durable `PlaybackState`. The data source is injected so the same component
 * renders against demo sample data, a live GraphQL endpoint, or a test double.
 * The `mode` label is surfaced in the header so a screenshot makes clear whether
 * the data is demo or live. Mirrors `apps/web/src/charts/ChartsScreen`, with an
 * interactive write path: the Play detail's playback control runs the real
 * `setPlaybackState` mutation and the returned state becomes the new source of
 * truth the detail re-renders.
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
  const [playbackState, setPlaybackState] = useState<PlaybackState | null>(null);

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
      setPlaybackState(null);

      return;
    }

    let cancelled = false;
    setDetailState({ status: "loading" });
    // Clear the previous track set's transport state so the panel never shows a
    // stale status while the newly selected track set's state loads.
    setPlaybackState(null);

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

    // Load this track set's durable playback state in parallel with its detail.
    // A failure here leaves the panel on its stopped default rather than failing
    // the whole detail view.
    dataSource
      .getPlaybackState(selectedTrackSetId)
      .then((state) => {
        if (!cancelled) {
          setPlaybackState(state);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPlaybackState(null);
        }
      });

    return (): void => {
      cancelled = true;
    };
  }, [dataSource, selectedTrackSetId]);

  const handleSelect = useCallback((trackSetId: string): void => {
    setSelectedTrackSetId(trackSetId);
  }, []);

  const handleSetPlaybackState = useCallback(
    async (input: SetPlaybackStateInput): Promise<PlaybackState> => {
      // Run the real mutation (live: `setPlaybackState`; demo: in-memory write),
      // then make the returned state the new source of truth for the detail's
      // playback panel. Guard against a late resolution after the operator has
      // switched track sets by only applying the result when it matches the
      // current selection. Errors propagate to the panel's error state.
      const updated = await dataSource.setPlaybackState(input);

      setSelectedTrackSetId((current) => {
        if (current === updated.trackSetId) {
          setPlaybackState(updated);
        }

        return current;
      });

      return updated;
    },
    [dataSource]
  );

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
        <PlayDetail
          state={detailState}
          {...(detailState.status === "loaded"
            ? { playback: { state: playbackState, onSet: handleSetPlaybackState } }
            : {})}
        />
      </div>
    </main>
  );
};
