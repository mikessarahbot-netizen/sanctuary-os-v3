import { describe, expect, it } from "vitest";
import {
  ChartAnnotationPersistenceRecordSchema,
  ChartPersistenceRecordSchema,
  ChartsPersistenceWriteOptionsSchema,
  MusicianChartPreferencePersistenceRecordSchema
} from "./index.js";

const chart = {
  arrangementRef: "arrangement_1",
  chartId: "chart_1",
  chordProSource: "{title: Grace}\n[G]hi",
  createdAt: "2026-06-17T08:00:00.000Z",
  defaultKey: "G",
  schemaVersion: "charts.v1",
  songRef: "song_1",
  tenantId: "tenant_1",
  title: "Grace",
  updatedAt: "2026-06-17T08:00:00.000Z"
} as const;

describe("Charts persistence contracts", () => {
  it("accepts a valid chart record", () => {
    expect(ChartPersistenceRecordSchema.parse(chart)).toEqual(chart);
  });

  it("rejects an unknown chart field", () => {
    expect(() => ChartPersistenceRecordSchema.parse({ ...chart, extra: true })).toThrow();
  });

  it("requires the charts schema version", () => {
    expect(() =>
      ChartPersistenceRecordSchema.parse({ ...chart, schemaVersion: "charts.v2" })
    ).toThrow();
  });

  it("requires note text for a note annotation", () => {
    expect(() =>
      ChartAnnotationPersistenceRecordSchema.parse({
        annotationId: "annotation_1",
        chartId: "chart_1",
        createdAt: "2026-06-17T08:00:00.000Z",
        kind: "note",
        lineIndex: 0,
        musicianId: "musician_1",
        sectionIndex: 0,
        tenantId: "tenant_1",
        updatedAt: "2026-06-17T08:00:00.000Z"
      })
    ).toThrow("require note text");
  });

  it("accepts a negative transpose preference", () => {
    const preference = {
      capo: 2,
      chartId: "chart_1",
      chordsVisible: true,
      fontScale: 1.25,
      instrument: "guitar",
      musicianId: "musician_1",
      tenantId: "tenant_1",
      transposeSemitones: -2,
      updatedAt: "2026-06-17T08:00:00.000Z"
    } as const;

    expect(MusicianChartPreferencePersistenceRecordSchema.parse(preference)).toEqual(preference);
  });

  it("requires an actor on write options", () => {
    expect(() =>
      ChartsPersistenceWriteOptionsSchema.parse({
        context: { requestId: "request_1", tenantId: "tenant_1" },
        intent: "update"
      })
    ).toThrow("require an actor");
  });
});
