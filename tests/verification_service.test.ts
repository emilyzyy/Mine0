import test from "node:test";
import assert from "node:assert/strict";
import { VerificationService } from "../src/verifier/verification_service.ts";

test("VerificationService classifies placement failures into reusable issue tags and fixes", () => {
  const service = new VerificationService();
  const result = service.verify(
    {
      branchId: "branch_place_001",
      strategy: "place a furnace nearby",
      candidateAction: {
        name: "place",
        arguments: { block_type: "furnace", location: "nearby" },
        reason: "Need furnace access.",
      },
      preconditions: ["furnace in inventory"],
      predictedSteps: [],
      successProbability: 0.8,
      estimatedSeconds: 12,
      risk: 0.05,
      resourceCost: 0,
      goalProgress: 0.2,
      likelyNextObservation: "A furnace should appear nearby.",
    },
    {
      executedAction: {
        name: "place",
        arguments: { block_type: "furnace", location: "nearby" },
        reason: "Need furnace access.",
      },
      status: "failed",
      durationSeconds: 8,
      inventoryDelta: [],
      healthDelta: 0,
      hungerDelta: 0,
      positionDelta: { x: 0, y: 0, z: 0 },
      visualVerification: {
        targetReached: false,
        terrainChangedAsExpected: false,
        hazardPresent: false,
      },
      failureReason: "Unable to find a valid nearby placement spot for furnace: Event blockUpdate:(1, 2, 3) did not fire within timeout of 5000ms",
      executor: "mineflayer",
    },
  );

  assert.ok(result.issueTags.includes("placement_access_problem"));
  assert.ok(result.issueTags.includes("placement_confirmation_problem"));
  assert.ok(result.suggestedFixes.some((entry) => entry.includes("clear space")));
});
