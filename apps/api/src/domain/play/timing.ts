import { z } from "zod";
import { transposeChord } from "../charts/chordpro.js";

/**
 * Pure timing transforms for the Play module.
 *
 * Beat/bar <-> time conversion over a tempo (BPM) and an optional meter
 * (default 4/4): `barsBeatsToSeconds` and `secondsToBarsBeats` round-trip a
 * musical position deterministically — no I/O, no `Date.now`, no randomness.
 * This is a display/scheduling derivation and never mutates the stored model,
 * the same role capo/transpose display derivation plays in Charts. The
 * optional `transposePlayKey` reuses the fixed sharp-enharmonic policy from
 * Charts `transposeChord` so a track set shown in a transposed key stays
 * consistent with its chart; the stored key is never rewritten here.
 */
export const MeterSchema = z
  .object({
    beatUnit: z.number().int().positive(),
    beatsPerBar: z.number().int().positive()
  })
  .strict();

export type Meter = z.infer<typeof MeterSchema>;

export const DEFAULT_METER: Meter = { beatUnit: 4, beatsPerBar: 4 };

export const BarsBeatsSchema = z
  .object({
    bars: z.number().int().nonnegative(),
    beats: z.number().nonnegative()
  })
  .strict();

export type BarsBeats = z.infer<typeof BarsBeatsSchema>;

const TempoBpmSchema = z.number().positive();
const SecondsSchema = z.number().nonnegative();

/**
 * Total beats from the start, treating each bar as `beatsPerBar` beats. A
 * "beat" here is one `beatUnit` note (quarter note in 4/4), matching how
 * `tempoBpm` is quoted.
 */
export const barsBeatsToBeats = (position: BarsBeats, meter: Meter = DEFAULT_METER): number => {
  const parsedPosition = BarsBeatsSchema.parse(position);
  const parsedMeter = MeterSchema.parse(meter);

  return parsedPosition.bars * parsedMeter.beatsPerBar + parsedPosition.beats;
};

/**
 * Inverse of `barsBeatsToBeats`: split a total beat count back into whole bars
 * plus the remaining beats within the current bar.
 */
export const beatsToBarsBeats = (totalBeats: number, meter: Meter = DEFAULT_METER): BarsBeats => {
  const parsedBeats = SecondsSchema.parse(totalBeats);
  const parsedMeter = MeterSchema.parse(meter);
  const bars = Math.floor(parsedBeats / parsedMeter.beatsPerBar);

  return BarsBeatsSchema.parse({
    bars,
    beats: parsedBeats - bars * parsedMeter.beatsPerBar
  });
};

/** Seconds elapsed for a whole number of beats at `tempoBpm`. */
export const beatsToSeconds = (totalBeats: number, tempoBpm: number): number => {
  const parsedBeats = SecondsSchema.parse(totalBeats);
  const parsedTempo = TempoBpmSchema.parse(tempoBpm);

  return (parsedBeats / parsedTempo) * 60;
};

/** Beats elapsed for a number of seconds at `tempoBpm`. */
export const secondsToBeats = (seconds: number, tempoBpm: number): number => {
  const parsedSeconds = SecondsSchema.parse(seconds);
  const parsedTempo = TempoBpmSchema.parse(tempoBpm);

  return (parsedSeconds / 60) * parsedTempo;
};

/** Seconds elapsed at the start of a bars/beats position. */
export const barsBeatsToSeconds = (
  position: BarsBeats,
  tempoBpm: number,
  meter: Meter = DEFAULT_METER
): number => beatsToSeconds(barsBeatsToBeats(position, meter), tempoBpm);

/** Bars/beats position reached after a number of seconds. */
export const secondsToBarsBeats = (
  seconds: number,
  tempoBpm: number,
  meter: Meter = DEFAULT_METER
): BarsBeats => beatsToBarsBeats(secondsToBeats(seconds, tempoBpm), meter);

/**
 * Transpose a track-set / arrangement / pad key by a semitone offset, reusing
 * the Charts fixed sharp-enharmonic policy. Non-chord-shaped keys pass through
 * unchanged (flagged-passthrough), exactly like `transposeChord`.
 */
export const transposePlayKey = (key: string, semitones: number): string =>
  transposeChord(key, semitones);
