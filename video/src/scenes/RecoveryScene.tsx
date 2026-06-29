import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
} from "remotion";
import { THEME, SCENE_DURATIONS } from "../theme";
import { SceneFade } from "../components/SceneFade";

const D = SCENE_DURATIONS.recovery; // 210 frames

interface LogLine {
  text: string;
  color: string;
  prefix: string;
  indent?: boolean;
}

const LOG_LINES: LogLine[] = [
  { prefix: "›", text: "repetitive_action_loop detected", color: THEME.warn, indent: false },
  { prefix: " ", text: "  scan_for_zombie repeated 3× with no position change", color: THEME.textDim, indent: true },
  { prefix: "›", text: "verification updated: subtask advancement triggered", color: THEME.accent, indent: false },
  { prefix: " ", text: "  active_subtask  scan_for_zombie → orient_to_zombie", color: THEME.accent3, indent: true },
  { prefix: "›", text: "recovery subtask selected: orient_to_zombie", color: THEME.accent, indent: false },
  { prefix: "›", text: "next plan generated — Gemma replans with updated context", color: THEME.text, indent: false },
];

const LINE_STAGGER = 28;
const LINES_START = 18;

export const RecoveryScene: React.FC = () => {
  const frame = useCurrentFrame();

  const headerOpacity = interpolate(frame, [5, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Cursor blink
  const cursorVisible = Math.floor(frame / 12) % 2 === 0;
  const lastLineFrame = LINES_START + (LOG_LINES.length - 1) * LINE_STAGGER;
  const showCursor = frame <= lastLineFrame + 20;

  // Caption
  const captionOpacity = interpolate(
    frame,
    [lastLineFrame + 25, lastLineFrame + 45],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <SceneFade durationInFrames={D}>
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 140px",
        }}
      >
        {/* Header */}
        <div
          style={{
            opacity: headerOpacity,
            alignSelf: "flex-start",
            marginBottom: 40,
          }}
        >
          <div
            style={{
              fontFamily: THEME.fontMono,
              fontSize: 16,
              color: THEME.warn,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              marginBottom: 10,
            }}
          >
            — recovery / replanning
          </div>
          <div
            style={{
              fontSize: 48,
              fontWeight: 700,
              color: THEME.text,
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
            }}
          >
            When execution stalls,
            <br />
            <span style={{ color: THEME.accent }}>Mine0 changes strategy.</span>
          </div>
        </div>

        {/* Terminal window */}
        <div
          style={{
            width: "100%",
            background: "rgba(0,0,0,0.65)",
            border: `1px solid ${THEME.bgCardBorder}`,
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          {/* Chrome bar */}
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
            <span
              style={{
                flex: 1,
                textAlign: "center",
                fontFamily: THEME.fontMono,
                fontSize: 13,
                color: THEME.textDim,
              }}
            >
              mine0 — decision loop
            </span>
          </div>

          {/* Log lines */}
          <div style={{ padding: "24px 28px", minHeight: 240 }}>
            {LOG_LINES.map((line, i) => {
              const lineFrame = LINES_START + i * LINE_STAGGER;
              const lineOpacity = interpolate(
                frame,
                [lineFrame, lineFrame + 10],
                [0, 1],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
              );
              const isLast = i === LOG_LINES.length - 1;
              return (
                <div
                  key={i}
                  style={{
                    opacity: lineOpacity,
                    display: "flex",
                    alignItems: "baseline",
                    gap: 12,
                    marginBottom: 10,
                    paddingLeft: line.indent ? 24 : 0,
                  }}
                >
                  <span
                    style={{
                      fontFamily: THEME.fontMono,
                      fontSize: 18,
                      color: line.color,
                      opacity: line.indent ? 0 : 0.9,
                      minWidth: 16,
                    }}
                  >
                    {line.prefix}
                  </span>
                  <span
                    style={{
                      fontFamily: THEME.fontMono,
                      fontSize: 18,
                      color: line.color,
                      lineHeight: 1.5,
                    }}
                  >
                    {line.text}
                    {isLast && showCursor && cursorVisible && (
                      <span
                        style={{
                          display: "inline-block",
                          width: 11,
                          height: 20,
                          background: THEME.accent,
                          verticalAlign: "text-bottom",
                          marginLeft: 4,
                        }}
                      />
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Caption */}
        <div
          style={{
            opacity: captionOpacity,
            marginTop: 32,
            textAlign: "center",
            fontFamily: THEME.fontSans,
            fontSize: 20,
            color: THEME.textMuted,
            lineHeight: 1.4,
          }}
        >
          Instead of repeating the same action,{" "}
          <span style={{ color: THEME.accent }}>
            Mine0 detects the loop and advances to the next subtask.
          </span>
        </div>
      </AbsoluteFill>
    </SceneFade>
  );
};
