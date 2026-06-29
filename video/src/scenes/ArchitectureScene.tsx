import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from "remotion";
import { THEME, SCENE_DURATIONS } from "../theme";
import { SceneFade } from "../components/SceneFade";

const D = SCENE_DURATIONS.architecture; // 150 frames

interface ArchRow {
  text: string;
  color: string;
  indent: number;
  arrow?: boolean;
}

const ROWS: ArchRow[] = [
  { text: "User objective", color: THEME.text, indent: 0 },
  { text: "Mine0 recursive planner", color: THEME.accent2, indent: 1, arrow: true },
  { text: "Cerebras-hosted Gemma 4", color: THEME.accent, indent: 2, arrow: true },
  { text: "Minecraft executor backend", color: THEME.accent3, indent: 1, arrow: true },
  { text: "verification + memory", color: THEME.warn, indent: 2, arrow: true },
  { text: "next decision", color: THEME.text, indent: 1, arrow: true },
];

const ROW_STAGGER = 14;
const ROWS_START = 12;

export const ArchitectureScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Footer
  const footerOpacity = interpolate(frame, [100, 118], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Final title flash
  const titleOpacity = interpolate(frame, [120, 135], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SceneFade durationInFrames={D} fadeOutFrames={0}>
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 200px",
        }}
      >
        {/* Architecture flow */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            width: "100%",
            maxWidth: 900,
          }}
        >
          {ROWS.map((row, i) => {
            const startF = ROWS_START + i * ROW_STAGGER;
            const rowOpacity = interpolate(frame, [startF, startF + 10], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            const rowX = interpolate(frame, [startF, startF + 18], [-30, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.quad),
            });

            return (
              <div
                key={i}
                style={{
                  opacity: rowOpacity,
                  transform: `translateX(${rowX}px)`,
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  paddingLeft: row.indent * 36,
                }}
              >
                {row.arrow && (
                  <span
                    style={{
                      color: row.color,
                      fontSize: 28,
                      opacity: 0.7,
                      lineHeight: 1,
                    }}
                  >
                    →
                  </span>
                )}
                <span
                  style={{
                    fontFamily: row.indent === 0 ? THEME.fontSans : THEME.fontMono,
                    fontSize: row.indent === 0 ? 38 : 30,
                    fontWeight: row.indent === 0 ? 700 : 400,
                    color: row.color,
                    letterSpacing: row.indent === 0 ? "-0.02em" : "0.01em",
                  }}
                >
                  {row.text}
                </span>
              </div>
            );
          })}
        </div>

        {/* JARVIS footnote */}
        <div
          style={{
            opacity: footerOpacity,
            marginTop: 40,
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "rgba(34,211,238,0.06)",
            border: `1px solid ${THEME.accent}33`,
            borderRadius: 8,
            padding: "12px 24px",
          }}
        >
          <span style={{ color: THEME.accent, fontSize: 18 }}>◈</span>
          <span
            style={{
              fontFamily: THEME.fontMono,
              fontSize: 16,
              color: THEME.textMuted,
            }}
          >
            Persistent JARVIS-VLA backend integrated for embodied visual control.
          </span>
        </div>

        {/* Final title */}
        <div
          style={{
            opacity: titleOpacity,
            marginTop: 48,
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontFamily: THEME.fontSans,
              fontWeight: 800,
              fontSize: 52,
              color: THEME.text,
              letterSpacing: "-0.03em",
              lineHeight: 1.1,
            }}
          >
            Mine<span style={{ color: THEME.accent }}>0</span>
          </div>
          <div
            style={{
              fontFamily: THEME.fontSans,
              fontSize: 22,
              color: THEME.textMuted,
              marginTop: 10,
              letterSpacing: "0.01em",
            }}
          >
            recursive planning for embodied Minecraft agents
          </div>
        </div>
      </AbsoluteFill>
    </SceneFade>
  );
};
