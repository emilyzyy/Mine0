import React from "react";
import {
  AbsoluteFill,
  interpolate,
  Easing,
  useCurrentFrame,
} from "remotion";
import { THEME, SCENE_DURATIONS } from "../theme";
import { SceneFade } from "../components/SceneFade";

const D = SCENE_DURATIONS.objective; // 180 frames

interface Props {
  objective: string;
}

export const ObjectiveScene: React.FC<Props> = ({ objective }) => {
  const frame = useCurrentFrame();

  // Heading
  const headOpacity = interpolate(frame, [8, 28], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const headY = interpolate(frame, [8, 30], [20, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.quad),
  });

  // Console box
  const boxOpacity = interpolate(frame, [20, 38], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Typing effect — 60 chars/s at 30fps ≈ 2 chars/frame
  const typingStart = 35;
  const typingDuration = 55;
  const charsToShow = Math.floor(
    interpolate(frame, [typingStart, typingStart + typingDuration], [0, objective.length], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    })
  );
  const displayedText = objective.slice(0, charsToShow);
  const showCursor = frame < typingStart + typingDuration + 20;
  const cursorVisible = Math.floor(frame / 12) % 2 === 0;

  // Arrow + label
  const arrowOpacity = interpolate(frame, [100, 120], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const arrowScale = interpolate(frame, [100, 125], [0.85, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.back(1.5)),
  });

  // Flow steps
  const steps = [
    { label: "Natural language objective", icon: "›", color: THEME.text },
    { label: "Cerebras / Gemma-4-31b decomposes goal", icon: "›", color: THEME.accent },
    { label: "Ordered subtask queue created", icon: "›", color: THEME.accent3 },
    { label: "Executor receives first subgoal intent", icon: "›", color: THEME.accent2 },
  ];

  return (
    <SceneFade durationInFrames={D}>
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 180px",
          gap: 0,
        }}
      >
        {/* Section label */}
        <div
          style={{
            opacity: headOpacity,
            transform: `translateY(${headY}px)`,
            fontSize: 18,
            fontFamily: THEME.fontMono,
            color: THEME.accent,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            marginBottom: 20,
            alignSelf: "flex-start",
          }}
        >
          — objective input
        </div>

        {/* Heading */}
        <div
          style={{
            opacity: headOpacity,
            transform: `translateY(${headY}px)`,
            fontSize: 56,
            fontWeight: 700,
            color: THEME.text,
            letterSpacing: "-0.02em",
            lineHeight: 1.1,
            marginBottom: 48,
            alignSelf: "flex-start",
          }}
        >
          Natural language objective
          <br />
          <span style={{ color: THEME.accent }}>→ recursive Minecraft plan</span>
        </div>

        {/* Console box */}
        <div
          style={{
            opacity: boxOpacity,
            width: "100%",
            background: "rgba(0,0,0,0.6)",
            border: `1px solid ${THEME.accent}44`,
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          {/* Terminal chrome */}
          <div
            style={{
              background: "#0d1520",
              padding: "10px 16px",
              display: "flex",
              alignItems: "center",
              gap: 8,
              borderBottom: `1px solid ${THEME.bgCardBorder}`,
            }}
          >
            {["#ff5f57", "#ffbd2e", "#28c840"].map((c) => (
              <div
                key={c}
                style={{ width: 12, height: 12, borderRadius: "50%", background: c }}
              />
            ))}
            <div
              style={{
                flex: 1,
                textAlign: "center",
                fontFamily: THEME.fontMono,
                fontSize: 14,
                color: THEME.textDim,
              }}
            >
              mine0 — objective
            </div>
          </div>

          {/* Terminal body */}
          <div style={{ padding: "24px 28px", minHeight: 90 }}>
            <span
              style={{
                fontFamily: THEME.fontMono,
                fontSize: 13,
                color: THEME.accent3,
                marginRight: 12,
              }}
            >
              $
            </span>
            <span
              style={{
                fontFamily: THEME.fontMono,
                fontSize: 13,
                color: THEME.textDim,
                marginRight: 8,
              }}
            >
              npm run demo --
            </span>
            <span
              style={{
                fontFamily: THEME.fontMono,
                fontSize: 22,
                color: THEME.text,
                letterSpacing: "0.01em",
              }}
            >
              &ldquo;{displayedText}
              {showCursor && cursorVisible && (
                <span
                  style={{
                    display: "inline-block",
                    width: 14,
                    height: 26,
                    background: THEME.accent,
                    verticalAlign: "text-bottom",
                    marginLeft: 2,
                  }}
                />
              )}
              &rdquo;
            </span>
          </div>
        </div>

        {/* Flow steps */}
        <div
          style={{
            opacity: arrowOpacity,
            transform: `scale(${arrowScale})`,
            marginTop: 40,
            display: "flex",
            gap: 0,
            alignSelf: "center",
          }}
        >
          {steps.map((step, i) => {
            const stepOpacity = interpolate(
              frame,
              [105 + i * 12, 125 + i * 12],
              [0, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
            );
            return (
              <React.Fragment key={i}>
                {i > 0 && (
                  <div
                    style={{
                      opacity: stepOpacity,
                      display: "flex",
                      alignItems: "center",
                      padding: "0 8px",
                      color: THEME.textDim,
                      fontSize: 24,
                    }}
                  >
                    →
                  </div>
                )}
                <div
                  style={{
                    opacity: stepOpacity,
                    background: "rgba(34,211,238,0.06)",
                    border: `1px solid ${step.color}33`,
                    borderRadius: 8,
                    padding: "12px 20px",
                    fontFamily: THEME.fontMono,
                    fontSize: 15,
                    color: step.color,
                    whiteSpace: "nowrap",
                  }}
                >
                  {step.icon} {step.label}
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </AbsoluteFill>
    </SceneFade>
  );
};
