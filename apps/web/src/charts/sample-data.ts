import type { Chart } from "./types.js";

/**
 * Seeded sample Charts for demo mode and tests.
 *
 * Demo mode (the default data source, or `?demo` / `VITE_DATA_SOURCE=demo`)
 * renders these so the Charts screen is populated and screenshot-able without a
 * live GraphQL API. The ChordPro source is valid `[chord]lyric` + `{directive}`
 * syntax so the detail view shows a realistic chart.
 */
const AMAZING_GRACE: Chart = {
  arrangementRef: null,
  chartId: "chart-amazing-grace",
  chordProSource: [
    "{title: Amazing Grace}",
    "{key: G}",
    "",
    "{start_of_verse}",
    "[G]Amazing [G7]grace how [C]sweet the [G]sound",
    "That [G]saved a [Em]wretch like [D]me",
    "{end_of_verse}"
  ].join("\n"),
  createdAt: "2026-01-04T09:00:00.000Z",
  defaultKey: "G",
  songRef: "song-amazing-grace",
  tenantId: "tenant-demo",
  title: "Amazing Grace",
  updatedAt: "2026-02-10T17:30:00.000Z"
};

const HOW_GREAT: Chart = {
  arrangementRef: "arr-how-great-acoustic",
  chartId: "chart-how-great-thou-art",
  chordProSource: [
    "{title: How Great Thou Art}",
    "{key: D}",
    "",
    "{start_of_chorus}",
    "Then [D]sings my [G]soul, my [D]Saviour God to [A]thee",
    "How [D]great thou [G]art, how [A]great thou [D]art",
    "{end_of_chorus}"
  ].join("\n"),
  createdAt: "2026-01-12T11:15:00.000Z",
  defaultKey: "D",
  songRef: "song-how-great-thou-art",
  tenantId: "tenant-demo",
  title: "How Great Thou Art",
  updatedAt: "2026-03-01T08:45:00.000Z"
};

const CORNERSTONE: Chart = {
  arrangementRef: null,
  chartId: "chart-cornerstone",
  chordProSource: [
    "{title: Cornerstone}",
    "{key: C}",
    "",
    "{start_of_chorus}",
    "Christ a[C]lone, corner[G]stone",
    "Weak made [Am]strong in the [F]Saviour's love",
    "{end_of_chorus}"
  ].join("\n"),
  createdAt: "2026-02-02T14:00:00.000Z",
  defaultKey: "C",
  songRef: "song-cornerstone",
  tenantId: "tenant-demo",
  title: "Cornerstone",
  updatedAt: "2026-03-20T19:05:00.000Z"
};

export const SAMPLE_CHARTS: readonly Chart[] = [AMAZING_GRACE, HOW_GREAT, CORNERSTONE];

export const findSampleChart = (chartId: string): Chart | undefined =>
  SAMPLE_CHARTS.find((chart) => chart.chartId === chartId);

/**
 * Mutable per-session copy of the seeded charts for demo mode's write path.
 *
 * The demo data source clones this so a `updateChartSource` in demo mode
 * persists across subsequent `listCharts` / `getChart` calls (mirroring the live
 * command service), without mutating the shared read-only `SAMPLE_CHARTS`
 * fixture the tests and live path compare against.
 */
export const createSampleChartStore = (): Chart[] =>
  SAMPLE_CHARTS.map((chart) => ({ ...chart }));
