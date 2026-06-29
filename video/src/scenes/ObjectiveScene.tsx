import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  Easing,
} from "remotion";
import { THEME, SCENE_DURATIONS } from "../theme";
import { SceneFade } from "../components/SceneFade";

const D = SCENE_DURATIONS.objective; // 150 frames

// Cycling goal examples — shown quickly in sequence
const GOAL_EXAMPLES = [
  "Find resources.",
  "Survive the night.",
  "Build shelter.",
  "Hunt mobs.",
];

interface Props {
  objective: string;
}

export const ObjectiveScene: React.FC<Props> = ({ objective }) => {
  const frame = useCurrentFrame();

  // Heading
  const headOpacity = interpolate(frame, [5, 22], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const headY = interpolate(frame, [5, 25], [18, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.quad),
  });

  // Command block appears
  const blockOpacity = interpolate(frame, [18, 35], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Cycle goal examples (each shown for 16 frames), then hold on final objective
  const cycleEnd = 80;
  const exampleIdx =
    frame < cycleEnd
      ? Math.floor(frame / (cycleEnd / GOAL_EXAMPLES.length)) %
        GOAL_EXAMPLES.length
      : -1;
  const displayGoal =
    exampleIdx >= 0 ? GOAL_EXAMPLES[exampleIdx] : objective;

  // Cursor blink in command block
  const cursorVisible = Math.floor(frame / 10) % 2 === 0;
  const showCursor = frame < cycleEnd + 15;

  // Flow badges
  const badgesOpacity = interpolate(frame, [100, 118], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Caption
  const captionOpacity = interpolate(frame, [115, 135], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Night-sky background bleeds through
  const bgStoneOpacity = interpolate(frame, [5, 25], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SceneFade durationInFrames={D}>
      <AbsoluteFill
        style={{
          background: `linear-gradient(180deg, ${THEME.mc.nightSky} 0%, #0A1225 100%)`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 160px",
        }}
      >
        {/* Subtle pixel grid */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            ...THEME.pixelGrid,
            opacity: 0.4,
          }}
        />

        {/* Heading */}
        <div
          style={{
            opacity: headOpacity,
            transform: `translateY(${headY}px)`,
            textAlign: "center",
            marginBottom: 36,
          }}
        >
          <div
            style={{
              fontFamily: THEME.fontMono,
              fontSize: 15,
              color: THEME.mc.xpGreen,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              marginBottom: 12,
            }}
          >
            — give mine0 a job
          </div>
          <div
            style={{
              fontSize: 56,
              fontWeight: 700,
              color: THEME.text,
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
            }}
          >
            Natural language in.
            <br />
            <span style={{ color: THEME.mc.xpGreen }}>
              Autonomous Minecraft work out.
            </span>
          </div>
        </div>

        {/* Command block panel (Minecraft aesthetic) */}
        <div
          style={{
            opacity: blockOpacity,
            width: "100%",
            maxWidth: 1100,
          }}
        >
          {/* Stone-textured header */}
          <div
            style={{
              background: THEME.mc.stoneDark,
              backgroundImage: `
                repeating-linear-gradient(90deg, transparent, transparent 7px, rgba(255,255,255,0.04) 7px, rgba(255,255,255,0.04) 8px),
                repeating-linear-gradient(0deg, transparent, transparent 7px, rgba(255,255,255,0.04) 7px, rgba(255,255,255,0.04) 8px)
              `,
              padding: "10px 18px",
              display: "flex",
              alignItems: "center",
              gap: 12,
              borderLeft: `4px solid ${THEME.mc.redstone}`,
              borderTop: `2px solid ${THEME.mc.stoneLight}`,
              borderRight: `2px solid ${THEME.mc.stoneLight}`,
            }}
          >
            {/* Redstone indicator */}
            <div
              style={{
                width: 14,
                height: 14,
                background: THEME.mc.redstone,
                boxShadow: `0 0 8px ${THEME.mc.redstone}`,
                ...THEME.pixelGrid,
              }}
            />
            <span
              style={{
                fontFamily: THEME.fontMono,
                fontSize: 13,
                color: THEME.mc.stoneLight,
                letterSpacing: "0.08em",
              }}
            >
              MINE0 — COMMAND INPUT
            </span>
            <div style={{ flex: 1 }} />
            <div
              style={{
                fontFamily: THEME.fontMono,
                fontSize: 11,
                color: THEME.mc.xpGreen,
                letterSpacing: "0.06em",
              }}
            >
              READY
            </div>
          </div>

          {/* Command block body */}
          <div
            style={{
              background: "#0A0F1A",
              border: `2px solid ${THEME.mc.stoneDark}`,
              borderTop: "none",
              padding: "28px 28px 24px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                marginBottom: 8,
              }}
            >
              <span
                style={{
                  fontFamily: THEME.fontMono,
                  fontSize: 14,
                  color: THEME.mc.redstone,
                }}
              >
                /objective
              </span>
              <div
                style={{
                  flex: 1,
                  height: 1,
                  background: `${THEME.mc.stoneDark}`,
                }}
              />
            </div>
            <div
              style={{
                fontFamily: THEME.fontMono,
                fontSize: 28,
                color: THEME.text,
                minHeight: 42,
                letterSpacing: "0.01em",
              }}
            >
              {displayGoal}
              {showCursor && cursorVisible && (
                <span
                  style={{
                    display: "inline-block",
                    width: 14,
                    height: 30,
                    background: THEME.mc.xpGreen,
                    verticalAlign: "text-bottom",
                    marginLeft: 3,
                  }}
                />
              )}
            </div>
          </div>
        </div>

        {/* Flow badges */}
        <div
          style={{
            opacity: badgesOpacity,
            marginTop: 32,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          {[
            { label: "TEXT GOAL", color: THEME.accent, bg: "rgba(34,211,238,0.08)" },
            { label: "→", color: THEME.textDim, bg: "transparent", border: "none" },
            { label: "TASK MODEL", color: THEME.mc.xpGreen, bg: `rgba(${THEME.mc.xpGreen},0.08)` },
            { label: "→", color: THEME.textDim, bg: "transparent", border: "none" },
            { label: "SUBTASK QUEUE", color: THEME.accent2, bg: "rgba(124,58,237,0.08)" },
            { label: "→", color: THEME.textDim, bg: "transparent", border: "none" },
            { label: "ACTION", color: THEME.warn, bg: "rgba(245,158,11,0.08)" },
          ].map((b, i) =>
            b.label === "→" ? (
              <span
                key={i}
                style={{
                  fontFamily: THEME.fontMono,
                  fontSize: 20,
                  color: b.color,
                }}
              >
                →
              </span>
            ) : (
              <div
                key={i}
                style={{
                  fontFamily: THEME.fontMono,
                  fontSize: 13,
                  padding: "6px 16px",
                  background: b.bg,
                  border: `1px solid ${b.color}44`,
                  color: b.color,
                  letterSpacing: "0.08em",
                }}
              >
                {b.label}
              </div>
            )
          )}
        </div>

        {/* Caption */}
        <div
          style={{
            opacity: captionOpacity,
            marginTop: 24,
            fontFamily: THEME.fontSans,
            fontSize: 22,
            color: THEME.textMuted,
            textAlign: "center",
          }}
        >
          Give Mine0 a job.{" "}
          <span style={{ color: THEME.text }}>
            It builds the plan, watches what happened, and keeps going.
          </span>
        </div>
      </AbsoluteFill>
    </SceneFade>
  );
};
