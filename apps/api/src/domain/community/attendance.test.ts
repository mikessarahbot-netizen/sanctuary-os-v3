import { describe, expect, it } from "vitest";
import { tallyAttendance } from "./attendance.js";
import { parseAttendanceRecord, type AttendanceRecord } from "./schemas.js";

const ISO = "2026-06-17T10:00:00.000Z";

const memberRow = (
  occasionRef: string,
  memberRef: string,
  status: "present" | "absent" | "excused"
): AttendanceRecord =>
  parseAttendanceRecord({
    attendanceId: `att-${occasionRef}-${memberRef}`,
    memberRef,
    occasionRef,
    recordedAt: ISO,
    recordedByRef: "actor-1",
    status,
    tenantId: "tenant-1",
    updatedAt: ISO
  });

const headcountRow = (occasionRef: string, count: number): AttendanceRecord =>
  parseAttendanceRecord({
    attendanceId: `head-${occasionRef}-${String(count)}`,
    headcount: count,
    occasionRef,
    recordedAt: ISO,
    recordedByRef: "actor-1",
    tenantId: "tenant-1",
    updatedAt: ISO
  });

describe("tallyAttendance", () => {
  it("sums present/absent/excused per occasion", () => {
    const tally = tallyAttendance([
      memberRow("svc-1", "m-1", "present"),
      memberRow("svc-1", "m-2", "present"),
      memberRow("svc-1", "m-3", "absent"),
      memberRow("svc-1", "m-4", "excused")
    ]);

    const occasion = tally.occasions[0];
    expect(occasion?.occasionRef).toBe("svc-1");
    expect(occasion?.present).toBe(2);
    expect(occasion?.absent).toBe(1);
    expect(occasion?.excused).toBe(1);
    expect(occasion?.totalKnown).toBe(4);
  });

  it("adds anonymous headcount and computes totalReached", () => {
    const tally = tallyAttendance([
      memberRow("svc-1", "m-1", "present"),
      headcountRow("svc-1", 30),
      headcountRow("svc-1", 5)
    ]);

    const occasion = tally.occasions[0];
    expect(occasion?.present).toBe(1);
    expect(occasion?.anonymousHeadcount).toBe(35);
    // totalReached = present members + anonymous headcount.
    expect(occasion?.totalReached).toBe(36);
    expect(occasion?.totalKnown).toBe(1);
  });

  it("groups by occasion and orders occasions deterministically", () => {
    const tally = tallyAttendance([
      memberRow("svc-c", "m-1", "present"),
      memberRow("svc-a", "m-1", "present"),
      memberRow("svc-b", "m-1", "absent")
    ]);

    expect(tally.occasions.map((occasion) => occasion.occasionRef)).toEqual([
      "svc-a",
      "svc-b",
      "svc-c"
    ]);
  });

  it("returns an empty tally for no records", () => {
    expect(tallyAttendance([])).toEqual({ occasions: [] });
  });

  it("does not mutate the source records", () => {
    const rows = [memberRow("svc-1", "m-1", "present")];
    const snapshot = structuredClone(rows);
    tallyAttendance(rows);

    expect(rows).toEqual(snapshot);
  });

  it("is deterministic regardless of input order", () => {
    const rows = [
      memberRow("svc-1", "m-1", "present"),
      headcountRow("svc-1", 10),
      memberRow("svc-2", "m-2", "absent")
    ];
    const shuffled = [...rows].reverse();

    expect(tallyAttendance(rows)).toEqual(tallyAttendance(shuffled));
  });
});
