import { describe, expect, it } from "vitest";
import {
  calculatePlanningReadiness,
  type PlanningReadinessInput,
  type PlanningServiceItemReadinessSignal
} from "./readiness.js";

const readySongItem: PlanningServiceItemReadinessSignal = {
  durationMinutes: 5,
  hasAttachedSong: true,
  hasChart: true,
  hasCurrentCcliLog: true,
  hasVisibleRehearsalAsset: true,
  requiresRehearsalAcknowledgement: true,
  requiresCcliLog: true,
  serviceItemId: "item_1",
  title: "Opening Song"
};

const readyMessageItem: PlanningServiceItemReadinessSignal = {
  durationMinutes: 30,
  hasAttachedSong: false,
  hasChart: false,
  hasCurrentCcliLog: false,
  hasVisibleRehearsalAsset: true,
  requiresRehearsalAcknowledgement: false,
  requiresCcliLog: false,
  serviceItemId: "item_2",
  title: "Message"
};

const readyInput: PlanningReadinessInput = {
  assignments: [
    { assignmentId: "assignment_vocal", roleId: "role_vocal", status: "confirmed" },
    { assignmentId: "assignment_drums", roleId: "role_drums", status: "confirmed" }
  ],
  ccliStatuses: [{ serviceItemId: "item_1", status: "current" }],
  knownBlockers: [],
  rehearsalAcknowledgements: [
    {
      assignmentId: "assignment_vocal",
      assetId: "asset_chart_1",
      personId: "person_vocal",
      readinessSignal: "ready",
      serviceItemId: "item_1"
    }
  ],
  requiredRoles: [
    { displayName: "Vocal", roleId: "role_vocal" },
    { displayName: "Drums", roleId: "role_drums" }
  ],
  serviceId: "service_1",
  serviceItems: [readySongItem, readyMessageItem],
  tenantId: "tenant_1"
};

describe("calculatePlanningReadiness", () => {
  it("scores a complete service as ready", () => {
    const result = calculatePlanningReadiness(readyInput);

    expect(result.readinessScore).toBe(100);
    expect(result.band).toBe("ready");
    expect(result.risks).toEqual([]);
    expect(result.strengths).toContain("Required roles assigned is complete.");
    expect(result.strengths).toContain("Rehearsal acknowledgements ready is complete.");
  });

  it("surfaces declined volunteers, blockers, incomplete assets, and rehearsal acknowledgement risks", () => {
    const result = calculatePlanningReadiness({
      ...readyInput,
      assignments: [
        { assignmentId: "assignment_vocal", roleId: "role_vocal", status: "declined" },
        { assignmentId: "assignment_drums", roleId: "role_drums", status: "pending" }
      ],
      knownBlockers: ["Keys player unavailable."],
      rehearsalAcknowledgements: [
        {
          assignmentId: "assignment_vocal",
          assetId: "asset_chart_1",
          personId: "person_vocal",
          readinessSignal: "blocked",
          serviceItemId: "item_1"
        },
        {
          assignmentId: "assignment_drums",
          assetId: "asset_chart_2",
          personId: "person_drums",
          readinessSignal: "needs-practice",
          serviceItemId: "item_1"
        }
      ],
      serviceItems: [
        {
          hasAttachedSong: true,
          hasChart: false,
          hasCurrentCcliLog: false,
          hasVisibleRehearsalAsset: false,
          requiresRehearsalAcknowledgement: true,
          requiresCcliLog: true,
          serviceItemId: "item_1",
          title: "Opening Song"
        }
      ]
    });

    expect(result.band).toBe("blocked");
    expect(result.readinessScore).toBeLessThan(50);
    expect(result.risks).toContain("Keys player unavailable.");
    expect(result.risks).toContain("One or more volunteers have declined.");
    expect(result.risks).toContain("One or more rehearsal acknowledgements are blocked.");
    expect(result.risks).toContain("One or more volunteers need more rehearsal practice.");
    expect(result.recommendedActions).toContain("Replace or follow up with declined volunteers.");
    expect(result.recommendedActions).toContain(
      "Resolve blocked rehearsal acknowledgements with assigned volunteers."
    );
    expect(result.recommendedActions).toContain(
      "Schedule extra rehearsal support for volunteers who need practice."
    );
  });

  it("defaults acknowledgement requirements off for older readiness inputs", () => {
    const result = calculatePlanningReadiness({
      assignments: readyInput.assignments,
      knownBlockers: [],
      requiredRoles: readyInput.requiredRoles,
      serviceId: "service_1",
      serviceItems: [
        {
          durationMinutes: 5,
          hasAttachedSong: true,
          hasChart: true,
          hasCurrentCcliLog: true,
          hasVisibleRehearsalAsset: true,
          requiresCcliLog: true,
          serviceItemId: "item_1",
          title: "Opening Song"
        }
      ],
      tenantId: "tenant_1"
    });

    expect(result.readinessScore).toBe(100);
    expect(result.strengths).toContain("Rehearsal acknowledgements ready is complete.");
  });

  it("scores explicit CCLI current-status inputs independently of legacy item flags", () => {
    const currentResult = calculatePlanningReadiness({
      ...readyInput,
      ccliStatuses: [{ serviceItemId: "item_1", status: "current" }],
      serviceItems: [
        {
          ...readySongItem,
          hasCurrentCcliLog: false,
          requiresCcliLog: false
        },
        readyMessageItem
      ]
    });

    expect(
      currentResult.checks.find((check) => check.code === "ccli-logging")
    ).toMatchObject({ maxScore: 10, score: 10 });

    const pendingResult = calculatePlanningReadiness({
      ...readyInput,
      ccliStatuses: [{ serviceItemId: "item_1", status: "pending" }]
    });

    expect(
      pendingResult.checks.find((check) => check.code === "ccli-logging")
    ).toMatchObject({ maxScore: 10, score: 0 });
    expect(pendingResult.risks).toContain("CCLI logging current is incomplete.");
    expect(pendingResult.recommendedActions).toContain("Finish: CCLI logging current.");
  });

  it("validates readiness acknowledgement and CCLI status references", () => {
    expect(() =>
      calculatePlanningReadiness({
        ...readyInput,
        ccliStatuses: [{ serviceItemId: "missing_item", status: "current" }]
      })
    ).toThrow("CCLI status references an unknown service item.");

    expect(() =>
      calculatePlanningReadiness({
        ...readyInput,
        rehearsalAcknowledgements: [
          {
            assignmentId: "missing_assignment",
            assetId: "asset_chart_1",
            personId: "person_vocal",
            readinessSignal: "ready",
            serviceItemId: "item_1"
          }
        ]
      })
    ).toThrow("Rehearsal acknowledgement references an unknown assignment.");
  });
});
