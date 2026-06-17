import { z } from "zod";
import {
  AttendanceRecordSchema,
  OccasionRefSchema,
  type AttendanceRecord
} from "./schemas.js";

/**
 * Pure attendance tally for Community+.
 *
 * `tallyAttendance` folds a set of `AttendanceRecord`s into a per-occasion
 * display/rollup projection: counts of `present` / `absent` / `excused` member
 * rows plus the summed anonymous `headcount`, and a `totalKnown` (member rows)
 * and `totalReached` (member-present + anonymous headcount). It never mutates
 * the source rows and carries **no PII** — occasion refs and counts only.
 *
 * Pure and deterministic: no I/O, no clock, no randomness; occasions are
 * emitted in ascending `occasionRef` order so output is stable regardless of
 * input order.
 */
export const OccasionTallySchema = z
  .object({
    absent: z.number().int().nonnegative(),
    anonymousHeadcount: z.number().int().nonnegative(),
    excused: z.number().int().nonnegative(),
    occasionRef: OccasionRefSchema,
    present: z.number().int().nonnegative(),
    totalKnown: z.number().int().nonnegative(),
    totalReached: z.number().int().nonnegative()
  })
  .strict();

export const AttendanceTallySchema = z
  .object({
    occasions: z.array(OccasionTallySchema)
  })
  .strict();

export type OccasionTally = z.infer<typeof OccasionTallySchema>;
export type AttendanceTally = z.infer<typeof AttendanceTallySchema>;

interface MutableOccasionTally {
  absent: number;
  anonymousHeadcount: number;
  excused: number;
  present: number;
}

const emptyTally = (): MutableOccasionTally => ({
  absent: 0,
  anonymousHeadcount: 0,
  excused: 0,
  present: 0
});

export const tallyAttendance = (
  records: readonly AttendanceRecord[]
): AttendanceTally => {
  const parsedRecords = records.map((record) => AttendanceRecordSchema.parse(record));
  const byOccasion = new Map<string, MutableOccasionTally>();

  for (const record of parsedRecords) {
    const tally = byOccasion.get(record.occasionRef) ?? emptyTally();

    if (record.memberRef !== undefined && record.status !== undefined) {
      tally[record.status] += 1;
    } else if (record.headcount !== undefined) {
      tally.anonymousHeadcount += record.headcount;
    }

    byOccasion.set(record.occasionRef, tally);
  }

  const occasionRefs = [...byOccasion.keys()].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0
  );

  const occasions: OccasionTally[] = occasionRefs.map((occasionRef): OccasionTally => {
    const tally = byOccasion.get(occasionRef) ?? emptyTally();
    const totalKnown = tally.present + tally.absent + tally.excused;
    const totalReached = tally.present + tally.anonymousHeadcount;

    return OccasionTallySchema.parse({
      absent: tally.absent,
      anonymousHeadcount: tally.anonymousHeadcount,
      excused: tally.excused,
      occasionRef,
      present: tally.present,
      totalKnown,
      totalReached
    });
  });

  return AttendanceTallySchema.parse({ occasions });
};
