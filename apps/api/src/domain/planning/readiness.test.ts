import { describe, expect, it } from "vitest";
import { calculatePlanningReadiness, type PlanningReadinessInput } from "./readiness.js";

const readyInput: PlanningReadinessInput = {
  assignments: [
    { assignmentId: "assignment_vocal", roleId: "role_vocal", status: "confirmed" },
    { assignmentId: "assignment_drums", roleId: "role_drums", status: "confirmed" }
  ],
  knownBlockers: [],
  requiredRoles: [
    { displayName: "Vocal", roleId: "role_vocal" },
    { displayName: "Drums", roleId: "role_drums" }
  ],
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
    },
    {
      durationMinutes: 30,
      hasAttachedSong: false,
      hasChart: false,
      hasCurrentCcliLog: false,
      hasVisibleRehearsalAsset: true,
      requiresCcliLog: false,
      serviceItemId: "item_2",
      title: "Message"
    }
  ],
  tenantId: "tenant_1"
};

describe("calculatePlanningReadiness", () => {
  it("scores a complete service as ready", () => {
    const result = calculatePlanningReadiness(readyInput);

    expect(result.readinessScore).toBe(100);
    expect(result.band).toBe("ready");
    expect(result.risks).toEqual([]);
    expect(result.strengths).toContain("Required roles assigned is complete.");
  });

  it("surfaces declined volunteers, blockers, and incomplete assets", () => {
    const result = calculatePlanningReadiness({
      ...readyInput,
      assignments: [
        { assignmentId: "assignment_vocal", roleId: "role_vocal", status: "declined" },
        { assignmentId: "assignment_drums", roleId: "role_drums", status: "pending" }
      ],
      knownBlockers: ["Keys player unavailable."],
      serviceItems: [
        {
          hasAttachedSong: true,
          hasChart: false,
          hasCurrentCcliLog: false,
          hasVisibleRehearsalAsset: false,
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
    expect(result.recommendedActions).toContain("Replace or follow up with declined volunteers.");
  });
});
