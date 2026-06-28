const form = document.getElementById("planner-form");
const status = document.getElementById("status");
const results = document.getElementById("results");
const selectedExecutor = document.getElementById("selected-executor");
const modeChip = document.getElementById("mode-chip");
const selectedIntent = document.getElementById("selected-intent");
const branchTable = document.getElementById("branch-table");
const worldState = document.getElementById("world-state");
const outcome = document.getElementById("outcome");
const runButton = document.getElementById("run-button");

function setStatus(message, state = "idle") {
  status.textContent = message;
  status.className = `status ${state}`;
}

function renderIntent(trace) {
  selectedIntent.innerHTML = `
    <h3>${trace.selectedIntent.instruction}</h3>
    <p><strong>Objective:</strong> ${trace.objective}</p>
    <p><strong>Action:</strong> ${trace.selectedIntent.candidateAction.name}</p>
    <p><strong>Reason:</strong> ${trace.selectedIntent.candidateAction.reason}</p>
    <p><strong>Success condition:</strong> ${trace.selectedIntent.successCondition.item} x ${trace.selectedIntent.successCondition.count}</p>
    <p><strong>Provider:</strong> ${trace.planner.providerMode} / ${trace.planner.configuredModel}</p>
  `;
}

function renderBranches(trace) {
  branchTable.innerHTML = `
    <div class="branch-list">
      <article class="branch-row selected">
        <strong>${trace.plannedFuture.strategy}</strong>
        <div>${trace.plannedFuture.candidateAction.name} :: ${JSON.stringify(trace.plannedFuture.candidateAction.arguments)}</div>
        <div class="branch-meta">
          <span>success ${trace.plannedFuture.successProbability}</span>
          <span>risk ${trace.plannedFuture.risk}</span>
          <span>eta ${trace.plannedFuture.estimatedSeconds}s</span>
          <span>progress ${trace.plannedFuture.goalProgress}</span>
        </div>
        <div>${trace.plannedFuture.likelyNextObservation}</div>
      </article>
    </div>
  `;
}

function renderTrace(trace) {
  selectedExecutor.textContent = trace.executor;
  modeChip.textContent = "single-plan";
  renderIntent(trace);
  renderBranches(trace);
  worldState.textContent = JSON.stringify(
    {
      worldState: trace.worldState,
      perception: trace.perception,
      memorySummary: trace.memorySummary,
      planner: trace.planner,
    },
    null,
    2,
  );
  outcome.textContent = JSON.stringify(
    {
      actionOutcome: trace.actionOutcome,
      verification: trace.verification,
      storedMemory: trace.storedMemory,
    },
    null,
    2,
  );
  results.classList.remove("hidden");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  runButton.disabled = true;
  setStatus("Running planning loop...", "running");

  const payload = {
    objective: document.getElementById("objective").value,
    executorKind: document.getElementById("executorKind").value,
    mode: "multiverse",
  };

  try {
    const response = await fetch("/api/run-cycle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok) {
      throw new Error(body.error || "Request failed");
    }

    renderTrace(body.trace);
    setStatus("Decision cycle complete.", "idle");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Unknown error", "error");
  } finally {
    runButton.disabled = false;
  }
});
