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

interface FlowRow {
  text: string;
  color: string;
  arrow?: boolean;
}

const FLOW: FlowRow[] = [
  { text: "Text goal",                      color: THEME.text,          arrow: false },
  { text: "Mine0 recursive planner",        color: THEME.accent2,       arrow: true  },
  { text: "Cerebras-hosted Gemma 4",        color: THEME.accent,        arrow: true  },
  { text: "Minecraft executor backend",     color: THEME.mc.xpGreen,    arrow: true  },
  { text: "verification + memory",          color: THEME.warn,          arrow: true  },
  { text: "next plan",                      color: THEME.text,          arrow: true  },
];

const ROW_STAGGER = 13;
const ROWS_START = 8;

export const ArchitectureScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Footer
  const footerOpacity = interpolate(frame, [100, 116], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Final Mine0 title
  const titleOpacity = interpolate(frame, [118, 135], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const titleScale = spring({
    fps,
    frame: Math.max(0, frame - 118),
    config: { stiffness: 60, damping: 14 },
    durationInFrames: 28,
    from: 0.9,
    to: 1,
  });

  return (
    <SceneFade durationInFrames={D} fadeOutFrames={0}>
      <AbsoluteFill
        style={{
          background: `linear-gradient(180deg, #060910 0%, #080c14 100%)`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 200px",
        }}
      >
        {/* Pixel grid */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            ...THEME.pixelGrid,
            opacity: 0.2,
          }}
        />

        {/* Grass strip at bottom — echoes title scene */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 6,
            background: `linear-gradient(90deg, ${THEME.mc.xpDark}, ${THEME.mc.xpGreen}, ${THEME.mc.xpDark})`,
            boxShadow: `0 0 10px ${THEME.mc.xpGreen}44`,
          }}
        />

        {/* Flow */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            width: "100%",
            maxWidth: 880,
            marginBottom: 28,
          }}
        >
          {FLOW.map((row, i) => {
            const startF = ROWS_START + i * ROW_STAGGER;
            const rowOpacity = interpolate(frame, [startF, startF + 10], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            const rowX = interpolate(frame, [startF, startF + 16], [-24, 0], {
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
                  paddingLeft: row.arrow ? 32 : 0,
                }}
              >
                {row.arrow && (
                  <span
                    style={{
                      color: row.color,
                      fontSize: 26,
                      opacity: 0.65,
                      lineHeight: 1,
                    }}
                  >
                    →
                  </span>
                )}
                <span
                  style={{
                    fontFamily: !row.arrow ? THEME.fontSans : THEME.fontMono,
                    fontSize: !row.arrow ? 40 : 28,
                    fontWeight: !row.arrow ? 700 : 400,
                    color: row.color,
                    letterSpacing: !row.arrow ? "-0.02em" : "0.01em",
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
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: `rgba(0,0,0,0.6)`,
            border: `2px solid ${THEME.mc.stoneDark}`,
            borderTop: `2px solid ${THEME.mc.stoneLight}`,
            borderLeft: `4px solid ${THEME.accent}`,
            padding: "10px 20px",
            marginBottom: 28,
            alignSelf: "flex-start",
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              background: THEME.accent,
              boxShadow: `0 0 6px ${THEME.accent}`,
            }}
          />
          <span
            style={{
              fontFamily: THEME.fontMono,
              fontSize: 14,
              color: THEME.textMuted,
              letterSpacing: "0.02em",
            }}
          >
            Built with{" "}
            <span style={{ color: THEME.accent }}>Cerebras + Gemma 4</span>
            &nbsp;&nbsp;·&nbsp;&nbsp;
            <span style={{ color: THEME.textMuted }}>
              JARVIS-VLA backend integrated for visual embodied control
            </span>
          </span>
        </div>

        {/* Final title */}
        <div
          style={{
            opacity: titleOpacity,
            transform: `scale(${titleScale})`,
            textAlign: "center",
            alignSelf: "center",
          }}
        >
          <div
            style={{
              fontFamily: THEME.fontSans,
              fontWeight: 800,
              fontSize: 72,
              color: THEME.text,
              letterSpacing: "-0.04em",
              lineHeight: 1,
              textShadow: `0 0 40px ${THEME.mc.xpGreen}44`,
            }}
          >
            Mine<span style={{ color: THEME.mc.xpGreen }}>0</span>
          </div>
          <div
            style={{
              fontFamily: THEME.fontSans,
              fontSize: 20,
              color: THEME.textMuted,
              marginTop: 10,
              letterSpacing: "0.01em",
              lineHeight: 1.4,
            }}
          >
            Autonomous Minecraft agents with memory,
            <br />
            verification, and embodied execution.
          </div>
        </div>
      </AbsoluteFill>
    </SceneFade>
  );
};
