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
const liveRun = document.getElementById("live-run");
const liveChip = document.getElementById("live-chip");
const liveSummary = document.getElementById("live-summary");
const liveSteps = document.getElementById("live-steps");
const liveTaskTree = document.getElementById("live-task-tree");
const liveFrame = document.getElementById("live-frame");
const selectedFrame = document.getElementById("selected-frame");

let livePollTimer = null;

function formatInventory(inventory) {
  if (!Array.isArray(inventory) || inventory.length === 0) {
    return "[]";
  }

  return inventory
    .map((stack) => `${stack.item} x${stack.count}`)
    .join(", ");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderTaskNode(node, currentAction, depth = 0) {
  if (!node) return "";
  const isRoot = depth === 0;
  const isActive = node.status === "active";
  const children = Array.isArray(node.children) ? node.children : [];
  const label = isRoot ? `Main goal: ${node.description}` : node.description;
  return `
    <li class="task-node task-node-${node.status} ${isRoot ? "task-node-root" : ""}">
      <div class="task-node-card">
        <span class="task-node-marker" aria-hidden="true"></span>
        <div>
          <div class="task-node-label">${escapeHtml(label)}</div>
          ${isActive && currentAction ? `<div class="task-current-action">CURRENT ACTION &rarr; ${escapeHtml(currentAction)}</div>` : ""}
        </div>
        <span class="task-status">${isActive ? "current" : node.status}</span>
      </div>
      ${children.length ? `<ul>${children.map((child) => renderTaskNode(child, currentAction, depth + 1)).join("")}</ul>` : ""}
    </li>
  `;
}

function setStatus(message, state = "idle") {
  status.textContent = message;
  status.className = `status ${state}`;
}

function frameUrlFor(screenshotPath) {
  if (!screenshotPath) {
    return "";
  }

  return `/api/frame?path=${encodeURIComponent(screenshotPath)}&t=${Date.now()}`;
}

function renderFrame(imageElement, screenshotPath) {
  if (!screenshotPath) {
    imageElement.classList.add("hidden");
    imageElement.removeAttribute("src");
    return;
  }

  imageElement.src = frameUrlFor(screenshotPath);
  imageElement.classList.remove("hidden");
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
  const selectedId = trace.planner.selectedBranchId;
  const branches = trace.planner.scoredBranches?.length
    ? trace.planner.scoredBranches
    : [
        {
          branchId: trace.plannedFuture.branchId,
          strategy: trace.plannedFuture.strategy,
          candidateAction: trace.plannedFuture.candidateAction,
          score: 0,
          successProbability: trace.plannedFuture.successProbability,
          estimatedSeconds: trace.plannedFuture.estimatedSeconds,
          risk: trace.plannedFuture.risk,
          goalProgress: trace.plannedFuture.goalProgress,
          notes: [],
        },
      ];
  branchTable.innerHTML = `
    <div class="branch-list">
      ${branches
        .map(
          (branch) => `
            <article class="branch-row ${branch.branchId === selectedId ? "selected" : ""}">
              <strong>${branch.strategy}</strong>
              <div>${branch.candidateAction.name} :: ${JSON.stringify(branch.candidateAction.arguments)}</div>
              <div class="branch-meta">
                <span>score ${branch.score}</span>
                <span>success ${branch.successProbability}</span>
                <span>risk ${branch.risk}</span>
                <span>eta ${branch.estimatedSeconds}s</span>
                <span>progress ${branch.goalProgress}</span>
              </div>
              <div>${branch.notes.join(" | ")}</div>
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderTrace(trace) {
  selectedExecutor.textContent = trace.executor;
  modeChip.textContent = `${trace.mode} · ${trace.totalDecisions} steps`;
  renderIntent(trace);
  renderBranches(trace);
  renderFrame(
    selectedFrame,
    trace.worldState?.screenshotPath || trace.steps.at(-1)?.worldState?.screenshotPath || "",
  );
  worldState.textContent = JSON.stringify(
    {
      completedObjective: trace.completedObjective,
      stopReason: trace.stopReason,
      totalDecisions: trace.totalDecisions,
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

function renderLiveRun(runState) {
  liveRun.classList.remove("hidden");
  liveChip.textContent = runState.running ? "running" : runState.error ? "error" : "complete";
  const latestScreenshotPath =
    runState.latestStep?.worldState?.screenshotPath ||
    runState.steps.at(-1)?.worldState?.screenshotPath ||
    "";
  const latestInventory = runState.latestStep?.worldState?.inventory || runState.steps.at(-1)?.worldState?.inventory || [];
  const taskContext = runState.latestStep?.taskContext || runState.steps.at(-1)?.taskContext;
  const pendingTasks = taskContext?.pendingSubtasks || [];
  const completedTasks = taskContext?.completedSubtasks || [];
  const currentAction = runState.latestStep?.selectedIntent?.instruction || "";
  liveSummary.innerHTML = `
    <h3>${runState.objective || "No active objective"}</h3>
    <p><strong>Executor:</strong> ${runState.executorKind || "n/a"}</p>
    <p><strong>Mode:</strong> ${runState.mode || "n/a"}</p>
    <p><strong>Steps so far:</strong> ${runState.steps.length}</p>
    <p><strong>Stop reason:</strong> ${runState.stopReason || (runState.running ? "still running" : "n/a")}</p>
    <p><strong>Error:</strong> ${runState.error || "none"}</p>
    <p><strong>Latest POV frame:</strong> ${latestScreenshotPath || "not available yet"}</p>
    <p><strong>Current inventory:</strong> ${formatInventory(latestInventory)}</p>
    <div class="task-stack">
      <p><strong>Active subtask:</strong> ${taskContext?.activeSubtask?.description || (runState.running ? "reconciling..." : "none")}</p>
      <p><strong>Planning focus:</strong> ${taskContext?.activeSubtask?.planningFocus || "none"}</p>
      <p><strong>Queued:</strong> ${pendingTasks.map((task, index) => `${index + 1}. ${task.description}`).join(" → ") || "none"}</p>
      <p><strong>Completed:</strong> ${completedTasks.map((task) => task.description).join(" · ") || "none"}</p>
    </div>
  `;
  liveTaskTree.innerHTML = taskContext?.taskTree
    ? `<ul class="task-tree-root">${renderTaskNode(taskContext.taskTree, currentAction)}</ul>`
    : `<p class="task-tree-empty">${runState.running ? "Reconciling the task tree..." : "No task tree available."}</p>`;
  renderFrame(liveFrame, latestScreenshotPath);

  liveSteps.innerHTML = runState.steps.length
    ? runState.steps
        .map(
          (step) => `
            <article class="step-card">
              <div class="step-head">
                <strong>Step ${step.stepNumber}</strong>
                <span>${step.selectedIntent.candidateAction.name}</span>
              </div>
              <p><strong>Objective:</strong> ${step.selectedIntent.objective}</p>
              <p><strong>Active subtask:</strong> ${step.taskContext?.activeSubtask?.description || "none"}</p>
              <p><strong>Pending stack:</strong> ${(step.taskContext?.pendingSubtasks || []).map((task) => task.description).join(" → ") || "none"}</p>
              <p><strong>Instruction:</strong> ${step.selectedIntent.instruction}</p>
              <p><strong>Strategy:</strong> ${step.plannedFuture.strategy}</p>
              <p><strong>Next step rationale:</strong> ${step.selectedIntent.candidateAction.reason}</p>
              <p><strong>Outcome:</strong> ${step.actionOutcome.status}${step.actionOutcome.failureReason ? ` · ${step.actionOutcome.failureReason}` : ""}</p>
              <p><strong>Position delta:</strong> ${JSON.stringify(step.actionOutcome.positionDelta)}</p>
              <p><strong>Inventory delta:</strong> ${JSON.stringify(step.actionOutcome.inventoryDelta)}</p>
              <p><strong>Full inventory:</strong> ${formatInventory(step.worldState?.inventory)}</p>
              ${step.worldState?.screenshotPath ? `<img class="step-frame" alt="Step ${step.stepNumber} first-person view" src="${frameUrlFor(step.worldState.screenshotPath)}" />` : ""}
            </article>
          `,
        )
        .join("")
    : `<article class="step-card"><p>Waiting for the first decision step...</p></article>`;
}

async function pollRunStatus() {
  try {
    const response = await fetch("/api/run-status");
    const body = await response.json();
    renderLiveRun(body);

    if (body.running) {
      livePollTimer = setTimeout(pollRunStatus, 1000);
      return;
    }

    livePollTimer = null;
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Failed to poll run status", "error");
    livePollTimer = null;
  }
}

function startLivePolling() {
  if (livePollTimer) {
    clearTimeout(livePollTimer);
  }
  livePollTimer = setTimeout(pollRunStatus, 0);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  runButton.disabled = true;
  results.classList.add("hidden");
  setStatus("Running planning loop...", "running");

  const payload = {
    objective: document.getElementById("objective").value,
    executorKind: document.getElementById("executorKind").value,
    mode: "multiverse",
  };

  startLivePolling();

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
    renderLiveRun({
      running: false,
      startedAt: body.trace.startedAt,
      objective: body.trace.objective,
      executorKind: payload.executorKind,
      mode: body.trace.mode,
      completedObjective: body.trace.completedObjective,
      stopReason: body.trace.stopReason,
      steps: body.trace.steps,
      latestStep: body.trace.steps.at(-1) ?? null,
      error: null,
    });
    setStatus(
      body.trace.completedObjective
        ? `Objective completed in ${body.trace.totalDecisions} steps.`
        : `Run stopped after ${body.trace.totalDecisions} steps: ${body.trace.stopReason}`,
      "idle",
    );
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Unknown error", "error");
  } finally {
    runButton.disabled = false;
  }
});
