import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { THEME } from "../theme";
import { TASKS, getTaskStatus, type Task, type TaskStatus } from "./demoTimeline";

const cl = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

const STATUS_CFG: Record<
  TaskStatus,
  { dot: string; label: string; color: string; bg: string }
> = {
  pending:  { dot: "○", label: "pending",  color: THEME.textDim,           bg: "rgba(255,255,255,0.03)" },
  active:   { dot: "●", label: "active",   color: THEME.mc.xpGreen,        bg: "rgba(94,189,59,0.10)"  },
  complete: { dot: "✓", label: "complete", color: THEME.accent3,            bg: "rgba(34,197,94,0.08)"  },
  verified: { dot: "◉", label: "verified", color: THEME.accent,             bg: "rgba(34,211,238,0.08)" },
};

// Seeded memory count cycling
const MEM_COUNTS = [0, 1, 1, 2, 2, 3, 3, 3, 4];

const TaskRow: React.FC<{ task: Task; frame: number; index: number }> = ({
  task,
  frame,
  index,
}) => {
  const status = getTaskStatus(task, frame);
  const cfg = STATUS_CFG[status];

  // Row fade-in on first appearance
  const rowFade = interpolate(frame, [task.activeAt - 4, task.activeAt + 8], [0, 1], cl);

  // Active glow pulse
  const glowPulse =
    status === "active"
      ? interpolate(Math.sin((frame / 18) * Math.PI), [-1, 1], [0.4, 1])
      : 0;

  // Progress bar for active task
  const progress =
    status === "active"
      ? Math.min((frame - task.activeAt) / (task.doneAt - task.activeAt), 1)
      : status === "pending"
      ? 0
      : 1;

  // Note fade-in after completion
  const noteFade =
    task.note && status !== "pending" && status !== "active"
      ? interpolate(frame, [task.doneAt, task.doneAt + 14], [0, 1], cl)
      : 0;

  return (
    <div
      style={{
        opacity: status === "pending" && frame < task.activeAt - 4 ? 0.0 : Math.max(rowFade, status === "pending" ? 0.38 : 1),
        borderLeft: `3px solid ${status === "active" ? THEME.mc.xpGreen : "transparent"}`,
        boxShadow:
          status === "active"
            ? `inset 0 0 18px rgba(94,189,59,${(glowPulse * 0.12).toFixed(3)}), -2px 0 8px rgba(94,189,59,${(glowPulse * 0.3).toFixed(3)})`
            : "none",
        background: status === "active" ? cfg.bg : "transparent",
        borderBottom: `1px solid rgba(255,255,255,0.04)`,
        padding: "8px 12px 8px 14px",
        transition: "none",
      }}
    >
      {/* Main row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        {/* Status chip */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            minWidth: 108,
            background: cfg.bg,
            border: `1px solid ${cfg.color}33`,
            padding: "2px 8px",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontFamily: THEME.fontMono,
              fontSize: 11,
              color: cfg.color,
              opacity: status === "active" ? glowPulse : 0.9,
            }}
          >
            {cfg.dot}
          </span>
          <span
            style={{
              fontFamily: THEME.fontMono,
              fontSize: 10,
              color: cfg.color,
              letterSpacing: "0.04em",
              lineHeight: 1,
            }}
          >
            {cfg.label}
          </span>
        </div>

        {/* Task id */}
        <span
          style={{
            fontFamily: THEME.fontMono,
            fontSize: 11,
            color: THEME.textDim,
            letterSpacing: "0.04em",
            minWidth: 66,
            flexShrink: 0,
          }}
        >
          {task.id}
        </span>

        {/* Label */}
        <span
          style={{
            fontFamily: THEME.fontMono,
            fontSize: 14,
            color:
              status === "active"
                ? THEME.text
                : status === "pending"
                ? THEME.textDim
                : THEME.textMuted,
            letterSpacing: "0.01em",
            flex: 1,
          }}
        >
          {task.label}
        </span>
      </div>

      {/* Progress bar (active only) */}
      {status === "active" && (
        <div
          style={{
            marginTop: 5,
            marginLeft: 124,
            height: 3,
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.06)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${progress * 100}%`,
              background: `linear-gradient(90deg, ${THEME.mc.xpDark}, ${THEME.mc.xpGreen})`,
              boxShadow: `0 0 6px ${THEME.mc.xpGreen}88`,
            }}
          />
        </div>
      )}

      {/* Note */}
      {task.note && noteFade > 0 && (
        <div
          style={{
            opacity: noteFade,
            marginTop: 3,
            marginLeft: 124,
            fontFamily: THEME.fontMono,
            fontSize: 11,
            color: THEME.textDim,
            letterSpacing: "0.02em",
          }}
        >
          └ {task.note}
        </div>
      )}
    </div>
  );
};

export const TaskTreeReplay: React.FC = () => {
  const frame = useCurrentFrame();

  const fadeIn = interpolate(frame, [0, 20], [0, 1], cl);

  // Which task is active now
  const activeTask = TASKS.find(
    (t) => frame >= t.activeAt && frame < t.doneAt
  );

  // Memory count (increases as tasks complete)
  const completedCount = TASKS.filter(
    (t) => frame >= t.doneAt
  ).length;
  const memCount = Math.min(completedCount, 9);

  // Running indicator pulse
  const runPulse = interpolate(
    Math.sin((frame / 18) * Math.PI),
    [-1, 1],
    [0.5, 1]
  );

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#090E1A",
        display: "flex",
        flexDirection: "column",
        opacity: fadeIn,
        overflow: "hidden",
        fontFamily: THEME.fontMono,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "12px 16px 10px",
          borderBottom: `2px solid rgba(255,255,255,0.07)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              color: THEME.accent2,
              letterSpacing: "0.12em",
              textTransform: "uppercase" as const,
              lineHeight: 1.2,
            }}
          >
            MINE0 — task / world model
          </div>
          <div
            style={{
              fontSize: 13,
              color: THEME.textMuted,
              letterSpacing: "0.01em",
              marginTop: 3,
              lineHeight: 1.3,
            }}
          >
            Craft and equip an iron helmet before nightfall
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 10px",
            background: "rgba(94,189,59,0.08)",
            border: `1px solid ${THEME.mc.xpGreen}33`,
          }}
        >
          <div
            style={{
              width: 6,
              height: 6,
              background: THEME.mc.xpGreen,
              opacity: runPulse,
              boxShadow: `0 0 5px ${THEME.mc.xpGreen}`,
            }}
          />
          <span
            style={{
              fontSize: 10,
              color: THEME.mc.xpGreen,
              letterSpacing: "0.08em",
            }}
          >
            RUNNING
          </span>
        </div>
      </div>

      {/* Task list */}
      <div style={{ flex: 1, overflowY: "hidden" as const }}>
        {TASKS.map((task, i) => (
          <TaskRow key={task.id} task={task} frame={frame} index={i} />
        ))}
      </div>

      {/* System footer */}
      <div
        style={{
          borderTop: `1px solid rgba(255,255,255,0.07)`,
          padding: "8px 16px",
          display: "flex",
          gap: 16,
          flexShrink: 0,
        }}
      >
        {[
          { label: "memory",   value: `${String(memCount).padStart(2, "0")} entries`, color: THEME.mc.enchantPurp },
          { label: "verifier", value: "online",          color: THEME.accent },
          { label: "planner",  value: "Gemma/Cerebras",  color: THEME.accent2 },
          { label: "executor", value: "Mineflayer",      color: THEME.mc.xpGreen },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 9, color: THEME.textDim, letterSpacing: "0.08em" }}>
              {label.toUpperCase()}
            </span>
            <span style={{ fontSize: 10, color, letterSpacing: "0.04em" }}>
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
