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
  `;
}

function renderBranches(trace) {
  const winnerId = trace.scoredFutures[0]?.future.branchId;
  branchTable.innerHTML = `
    <div class="branch-list">
      ${trace.scoredFutures
        .map(
          (entry) => `
            <article class="branch-row ${entry.future.branchId === winnerId ? "selected" : ""}">
              <strong>${entry.future.strategy}</strong>
              <div>${entry.future.candidateAction.name} :: ${JSON.stringify(entry.future.candidateAction.arguments)}</div>
              <div class="branch-meta">
                <span>score ${entry.score}</span>
                <span>success ${entry.future.successProbability}</span>
                <span>risk ${entry.future.risk}</span>
                <span>eta ${entry.future.estimatedSeconds}s</span>
              </div>
              <div>${entry.future.likelyNextObservation}</div>
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderTrace(trace) {
  selectedExecutor.textContent = trace.executor;
  modeChip.textContent = trace.mode;
  renderIntent(trace);
  renderBranches(trace);
  worldState.textContent = JSON.stringify(
    {
      worldState: trace.worldState,
      perception: trace.perception,
      memorySummary: trace.memorySummary,
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
  setStatus("Running mocked decision loop...", "running");

  const payload = {
    objective: document.getElementById("objective").value,
    executorKind: document.getElementById("executorKind").value,
    mode: document.getElementById("mode").value,
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
