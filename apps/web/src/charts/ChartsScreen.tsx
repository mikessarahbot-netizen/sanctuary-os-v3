import { useCallback, useEffect, useState, type ReactElement } from "react";
import type { ChartsDataSource } from "./client.js";
import { ChartDetail } from "./ChartDetail.js";
import { ChartsList } from "./ChartsList.js";
import type { Chart, ChartDetailState, ChartsLoadState } from "./types.js";

/**
 * Charts read surface container.
 *
 * Loads the chart list from the injected `ChartsDataSource`, tracks the selected
 * chart, and loads that chart's detail. The data source is injected so the same
 * component renders against demo sample data, a live GraphQL endpoint, or a test
 * double. The `mode` label is surfaced in the header so a screenshot makes clear
 * whether the data is demo or live.
 */
export interface ChartsScreenProps {
  readonly dataSource: ChartsDataSource;
  readonly mode: "demo" | "live";
  readonly initialSelectedChartId?: string | null;
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown error.";

export const ChartsScreen = (props: ChartsScreenProps): ReactElement => {
  const { dataSource } = props;
  const [listState, setListState] = useState<ChartsLoadState>({ status: "loading" });
  const [selectedChartId, setSelectedChartId] = useState<string | null>(
    props.initialSelectedChartId ?? null
  );
  const [detailState, setDetailState] = useState<ChartDetailState>({ status: "missing" });

  useEffect(() => {
    let cancelled = false;

    dataSource
      .listCharts()
      .then((charts) => {
        if (!cancelled) {
          setListState({ status: "loaded", charts });
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
    if (selectedChartId === null) {
      setDetailState({ status: "missing" });

      return;
    }

    let cancelled = false;
    setDetailState({ status: "loading" });

    dataSource
      .getChart(selectedChartId)
      .then((chart) => {
        if (cancelled) {
          return;
        }

        setDetailState(
          chart === null ? { status: "missing" } : { status: "loaded", chart }
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
  }, [dataSource, selectedChartId]);

  const handleSelect = useCallback((chartId: string): void => {
    setSelectedChartId(chartId);
  }, []);

  const handleSave = useCallback(
    async (chartId: string, chordProSource: string): Promise<Chart> => {
      // Run the real mutation (live: `updateChartSource`; demo: in-memory write),
      // then make the returned chart the new source of truth for both the detail
      // and the matching list row (so a changed title / key shows in the
      // sidebar). Errors propagate to the editor, which renders its error state.
      const updated = await dataSource.updateChartSource(chartId, chordProSource);

      setDetailState((current) =>
        current.status === "loaded" && current.chart.chartId === updated.chartId
          ? { status: "loaded", chart: updated }
          : current
      );
      setListState((current) =>
        current.status === "loaded"
          ? {
              status: "loaded",
              charts: current.charts.map((chart) =>
                chart.chartId === updated.chartId ? updated : chart
              )
            }
          : current
      );

      return updated;
    },
    [dataSource]
  );

  return (
    <main className="charts-screen">
      <header className="charts-screen__header">
        <h1>Charts</h1>
        <span className={`mode-badge mode-badge--${props.mode}`}>{props.mode} data</span>
      </header>
      <div className="charts-screen__body">
        <nav className="charts-screen__sidebar" aria-label="Chart library">
          <ChartsList
            state={listState}
            selectedChartId={selectedChartId}
            onSelect={handleSelect}
          />
        </nav>
        <ChartDetail
          state={detailState}
          {...(detailState.status === "loaded"
            ? {
                onSave: (chordProSource: string): Promise<Chart> =>
                  handleSave(detailState.chart.chartId, chordProSource)
              }
            : {})}
        />
      </div>
    </main>
  );
};
