import { describe, expect, it } from "vitest";
import {
  resolveCueTimeline,
  resolvePlaySequence,
  type ResolvedSequenceEntry
} from "./sequence.js";
import {
  parsePlayArrangement,
  parsePlayCue,
  parsePlaySection,
  type PlayArrangement,
  type PlayCue,
  type PlaySection
} from "./schemas.js";

const ISO = "2026-06-17T10:00:00.000Z";

const arrangement: PlayArrangement = parsePlayArrangement({
  arrangementRef: "arr-1",
  defaultKey: "G",
  label: "Default",
  loopSectionRef: "chorus-1",
  sectionOrder: ["verse-1", "chorus-1", "bridge-1"],
  songRef: "song-1",
  tempoBpm: 120,
  tenantId: "tenant-1"
});

const verseSection: PlaySection = parsePlaySection({
  arrangementRef: "arr-1",
  clickEnabledDefault: true,
  kind: "verse",
  lengthBars: 8,
  sectionId: "verse-1",
  tenantId: "tenant-1"
});

const chorusSection: PlaySection = parsePlaySection({
  arrangementRef: "arr-1",
  clickEnabledDefault: false,
  kind: "chorus",
  lengthBars: 16,
  padLayerRef: "pad-warm",
  sectionId: "chorus-1",
  tenantId: "tenant-1"
});

// Note: "bridge-1" is intentionally absent from the section list.
const sections: readonly PlaySection[] = [verseSection, chorusSection];

const cue = (overrides: Record<string, unknown>): PlayCue =>
  parsePlayCue({
    action: "play",
    createdAt: ISO,
    cueId: "cue-x",
    fireMode: "manual",
    label: "Cue",
    markerOffsetBeats: 0,
    sectionId: "verse-1",
    tenantId: "tenant-1",
    trackSetId: "ts-1",
    updatedAt: ISO,
    ...overrides
  });

const resolvedById = (
  entries: readonly ResolvedSequenceEntry[],
  sectionRef: string
): Extract<ResolvedSequenceEntry, { status: "resolved" }> => {
  const entry = entries.find((candidate) => candidate.sectionRef === sectionRef);

  if (entry === undefined || entry.status !== "resolved") {
    throw new Error(`expected a resolved entry for ${sectionRef}`);
  }

  return entry;
};

describe("resolvePlaySequence", () => {
  it("orders entries by sectionOrder and attaches resolved defaults", () => {
    const resolved = resolvePlaySequence(arrangement, sections);

    expect(resolved.arrangementRef).toBe("arr-1");
    expect(resolved.loopSectionRef).toBe("chorus-1");
    expect(resolved.entries.map((entry) => entry.sectionRef)).toEqual([
      "verse-1",
      "chorus-1",
      "bridge-1"
    ]);

    const verse = resolvedById(resolved.entries, "verse-1");

    expect(verse.kind).toBe("verse");
    expect(verse.lengthBars).toBe(8);
    expect(verse.clickEnabledDefault).toBe(true);
    expect(verse.padLayerRef).toBeUndefined();
    expect(verse.isLoopSection).toBe(false);
    expect(verse.orderIndex).toBe(0);
  });

  it("attaches pad defaults and flags the loop section", () => {
    const resolved = resolvePlaySequence(arrangement, sections);
    const chorus = resolvedById(resolved.entries, "chorus-1");

    expect(chorus.padLayerRef).toBe("pad-warm");
    expect(chorus.clickEnabledDefault).toBe(false);
    expect(chorus.isLoopSection).toBe(true);
  });

  it("flags a sectionOrder entry with no matching section as unresolved (no throw)", () => {
    const resolved = resolvePlaySequence(arrangement, sections);
    const bridge = resolved.entries[2];

    expect(bridge).toBeDefined();
    expect(bridge?.status).toBe("unresolved");
    expect(bridge?.sectionRef).toBe("bridge-1");
    expect(bridge?.orderIndex).toBe(2);
  });

  it("matches sections referenced by label as well as sectionId", () => {
    const labelled = parsePlayArrangement({
      arrangementRef: "arr-2",
      defaultKey: "G",
      label: "By label",
      sectionOrder: ["Verse 1"],
      songRef: "song-1",
      tempoBpm: 120,
      tenantId: "tenant-1"
    });
    const labelledSection = parsePlaySection({
      arrangementRef: "arr-2",
      clickEnabledDefault: true,
      kind: "verse",
      label: "Verse 1",
      lengthBars: 4,
      sectionId: "sec-abc",
      tenantId: "tenant-1"
    });

    const resolved = resolvePlaySequence(labelled, [labelledSection]);
    const entry = resolvedById(resolved.entries, "Verse 1");

    expect(entry.sectionId).toBe("sec-abc");
    expect(entry.lengthBars).toBe(4);
  });

  it("is deterministic for identical inputs", () => {
    expect(resolvePlaySequence(arrangement, sections)).toEqual(
      resolvePlaySequence(arrangement, sections)
    );
  });
});

describe("resolveCueTimeline", () => {
  it("places cues and resolves a valid jump target", () => {
    const resolved = resolvePlaySequence(arrangement, sections);
    const timeline = resolveCueTimeline(
      arrangement,
      [cue({ action: "jump", cueId: "jump-1", targetSectionRef: "chorus-1" })],
      resolved
    );

    expect(timeline.trackSetId).toBe("ts-1");
    expect(timeline.entries).toHaveLength(1);
    const entry = timeline.entries[0];
    expect(entry?.action).toBe("jump");
    expect(entry?.sectionResolved).toBe(true);
    expect(entry?.targetStatus).toBe("ok");
    expect(entry?.targetSectionRef).toBe("chorus-1");
  });

  it("flags an invalid jump target without dropping the cue", () => {
    const resolved = resolvePlaySequence(arrangement, sections);
    const timeline = resolveCueTimeline(
      arrangement,
      [cue({ action: "jump", cueId: "jump-bad", targetSectionRef: "bridge-1" })],
      resolved
    );

    expect(timeline.entries).toHaveLength(1);
    expect(timeline.entries[0]?.targetStatus).toBe("invalid-jump-target");
  });

  it("resolves a valid pad-change target", () => {
    const resolved = resolvePlaySequence(arrangement, sections);
    const timeline = resolveCueTimeline(
      arrangement,
      [cue({ action: "pad-change", cueId: "pad-ok", padLayerRef: "pad-warm" })],
      resolved
    );

    expect(timeline.entries[0]?.targetStatus).toBe("ok");
  });

  it("flags an invalid pad-change target without dropping the cue", () => {
    const resolved = resolvePlaySequence(arrangement, sections);
    const timeline = resolveCueTimeline(
      arrangement,
      [cue({ action: "pad-change", cueId: "pad-bad", padLayerRef: "pad-missing" })],
      resolved
    );

    expect(timeline.entries).toHaveLength(1);
    expect(timeline.entries[0]?.targetStatus).toBe("invalid-pad-target");
  });

  it("marks a cue on an unresolved section as sectionResolved=false but keeps it", () => {
    const resolved = resolvePlaySequence(arrangement, sections);
    const timeline = resolveCueTimeline(
      arrangement,
      [cue({ cueId: "orphan", sectionId: "bridge-1" })],
      resolved
    );

    expect(timeline.entries).toHaveLength(1);
    expect(timeline.entries[0]?.sectionResolved).toBe(false);
    expect(timeline.entries[0]?.targetStatus).toBe("not-applicable");
  });

  it("orders cues by section then markerOffsetBeats", () => {
    const resolved = resolvePlaySequence(arrangement, sections);
    const timeline = resolveCueTimeline(
      arrangement,
      [
        cue({ cueId: "c-late", markerOffsetBeats: 8, sectionId: "verse-1" }),
        cue({ cueId: "c-early", markerOffsetBeats: 2, sectionId: "verse-1" }),
        cue({ cueId: "c-chorus", markerOffsetBeats: 0, sectionId: "chorus-1" })
      ],
      resolved
    );

    expect(timeline.entries.map((entry) => entry.cueId)).toEqual([
      "c-chorus",
      "c-early",
      "c-late"
    ]);
  });

  it("returns an empty timeline (no trackSetId) for no cues", () => {
    const resolved = resolvePlaySequence(arrangement, sections);
    const timeline = resolveCueTimeline(arrangement, [], resolved);

    expect(timeline.entries).toEqual([]);
    expect(timeline.trackSetId).toBeUndefined();
  });

  it("is deterministic for identical inputs", () => {
    const resolved = resolvePlaySequence(arrangement, sections);
    const cues = [cue({ cueId: "c1" }), cue({ cueId: "c2", sectionId: "chorus-1" })];

    expect(resolveCueTimeline(arrangement, cues, resolved)).toEqual(
      resolveCueTimeline(arrangement, cues, resolved)
    );
  });
});
