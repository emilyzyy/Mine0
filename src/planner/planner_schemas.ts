function stringArraySchema() {
  return {
    type: "array",
    items: { type: "string" },
  };
}

export const perceptionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    sceneSummary: { type: "string" },
    visibleResources: stringArraySchema(),
    terrainAffordances: stringArraySchema(),
    hazards: stringArraySchema(),
    reachableTargets: stringArraySchema(),
    confidenceNotes: stringArraySchema(),
  },
  required: [
    "sceneSummary",
    "visibleResources",
    "terrainAffordances",
    "hazards",
    "reachableTargets",
    "confidenceNotes",
  ],
};

export const plannerProposalSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    plannerId: { type: "string" },
    strategy: { type: "string" },
    instruction: { type: "string" },
    actionName: { type: "string" },
    blockType: { type: "string" },
    item: { type: "string" },
    count: { type: "number" },
    direction: { type: "string" },
    location: { type: "string" },
    reason: { type: "string" },
    successItem: { type: "string" },
    successCount: { type: "number" },
    maximumSteps: { type: "number" },
  },
  required: [
    "plannerId",
    "strategy",
    "instruction",
    "actionName",
    "blockType",
    "item",
    "count",
    "direction",
    "location",
    "reason",
    "successItem",
    "successCount",
    "maximumSteps",
  ],
};

export const rolloutSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    futures: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          strategy: { type: "string" },
          actionName: { type: "string" },
          blockType: { type: "string" },
          item: { type: "string" },
          count: { type: "number" },
          direction: { type: "string" },
          location: { type: "string" },
          reason: { type: "string" },
          preconditions: stringArraySchema(),
          predictedStep1Action: { type: "string" },
          predictedStep1Result: { type: "string" },
          predictedStep2Action: { type: "string" },
          predictedStep2Result: { type: "string" },
          successProbability: { type: "number" },
          estimatedSeconds: { type: "number" },
          risk: { type: "number" },
          resourceCost: { type: "number" },
          goalProgress: { type: "number" },
          likelyNextObservation: { type: "string" },
        },
        required: [
          "strategy",
          "actionName",
          "blockType",
          "item",
          "count",
          "direction",
          "location",
          "reason",
          "preconditions",
          "predictedStep1Action",
          "predictedStep1Result",
          "predictedStep2Action",
          "predictedStep2Result",
          "successProbability",
          "estimatedSeconds",
          "risk",
          "resourceCost",
          "goalProgress",
          "likelyNextObservation",
        ],
      },
    },
  },
  required: ["futures"],
};

export const criticSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    branches: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          branchId: { type: "string" },
          adjustment: { type: "number" },
          memoryAlignment: { type: "number" },
          executionConcern: { type: "string" },
          rationale: { type: "string" },
        },
        required: [
          "branchId",
          "adjustment",
          "memoryAlignment",
          "executionConcern",
          "rationale",
        ],
      },
    },
  },
  required: ["branches"],
};
