import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { THEME } from "../theme";

const SUBGOALS = [
  "scan environment",
  "choose subtask",
  "execute action",
  "verify outcome",
  "update memory",
  "replan",
];

const BADGES = ["TEXT GOAL", "POV FRAME", "ACTION TRACE", "MEMORY"] as const;

export const SystemHud: React.FC = () => {
  const frame = useCurrentFrame();

  const fadeIn = interpolate(frame, [0, 18], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Cycle active subgoal every 20 frames
  const subgoalIdx = Math.floor(frame / 20) % SUBGOALS.length;
  const currentSubgoal = SUBGOALS[subgoalIdx];

  // Cycle badge highlight every 22 frames
  const badgeHighlight = Math.floor(frame / 22) % BADGES.length;

  // XP bar slowly fills
  const xpFill = interpolate(frame, [0, 600], [10, 92], {
    extrapolateRight: "clamp",
  });

  // Planner pulse dot
  const plannerPulse = interpolate(
    Math.sin((frame / 18) * Math.PI),
    [-1, 1],
    [0.5, 1]
  );

  return (
    <AbsoluteFill
      style={{ opacity: fadeIn, pointerEvents: "none" }}
    >
      {/* Main HUD strip */}
      <div
        style={{
          position: "absolute",
          bottom: 4,
          left: 0,
          right: 0,
        }}
      >
        {/* XP bar */}
        <div
          style={{
            height: 5,
            background: THEME.mc.stoneDark,
            border: "1px solid #000",
            borderBottom: "none",
            margin: "0 0",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${xpFill}%`,
              background: `linear-gradient(90deg, ${THEME.mc.xpDark}, ${THEME.mc.xpGreen})`,
              boxShadow: `0 0 6px ${THEME.mc.xpGreen}88`,
            }}
          />
        </div>

        {/* HUD content bar */}
        <div
          style={{
            background: "rgba(8, 12, 20, 0.92)",
            borderTop: `2px solid ${THEME.mc.stoneDark}`,
            padding: "9px 28px",
            display: "flex",
            alignItems: "center",
            gap: 20,
          }}
        >
          {/* Left: planner status */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              minWidth: 260,
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                background: THEME.mc.xpGreen,
                opacity: plannerPulse,
                boxShadow: `0 0 6px ${THEME.mc.xpGreen}`,
              }}
            />
            <div>
              <div
                style={{
                  fontFamily: THEME.fontMono,
                  fontSize: 11,
                  color: THEME.mc.xpGreen,
                  letterSpacing: "0.08em",
                  lineHeight: 1.2,
                }}
              >
                GEMMA / CEREBRAS PLANNER
              </div>
              <div
                style={{
                  fontFamily: THEME.fontMono,
                  fontSize: 10,
                  color: THEME.textDim,
                  letterSpacing: "0.04em",
                  lineHeight: 1.2,
                }}
              >
                low-latency subgoal loop
              </div>
            </div>
          </div>

          {/* Center: modality badge flow */}
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            {BADGES.map((badge, i) => (
              <React.Fragment key={badge}>
                {i > 0 && (
                  <span
                    style={{
                      color: "#334155",
                      fontSize: 13,
                      fontFamily: THEME.fontMono,
                    }}
                  >
                    →
                  </span>
                )}
                <div
                  style={{
                    fontFamily: THEME.fontMono,
                    fontSize: 10,
                    padding: "3px 9px",
                    background:
                      i === badgeHighlight
                        ? `rgba(34,211,238,0.14)`
                        : "rgba(255,255,255,0.03)",
                    border: `1px solid ${
                      i === badgeHighlight
                        ? THEME.accent + "66"
                        : "#2a3040"
                    }`,
                    color:
                      i === badgeHighlight ? THEME.accent : THEME.textDim,
                    letterSpacing: "0.07em",
                    transition: "none",
                  }}
                >
                  {badge}
                </div>
              </React.Fragment>
            ))}
          </div>

          {/* Right: active subgoal */}
          <div
            style={{
              minWidth: 240,
              flexShrink: 0,
              textAlign: "right",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 8,
            }}
          >
            <div
              style={{
                width: 6,
                height: 6,
                background: THEME.mc.redstone,
                boxShadow: `0 0 8px ${THEME.mc.redstone}`,
                animation: "none",
                opacity: plannerPulse,
              }}
            />
            <div>
              <div
                style={{
                  fontFamily: THEME.fontMono,
                  fontSize: 10,
                  color: THEME.textDim,
                  letterSpacing: "0.06em",
                }}
              >
                ACTIVE SUBGOAL
              </div>
              <div
                style={{
                  fontFamily: THEME.fontMono,
                  fontSize: 12,
                  color: THEME.mc.xpGreen,
                  letterSpacing: "0.04em",
                }}
              >
                {currentSubgoal}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
