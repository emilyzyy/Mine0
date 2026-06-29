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

const D = SCENE_DURATIONS.useCases; // 300 frames

// Minecraft-style advancement / quest tiles
interface UseCaseTile {
  title: string;
  caption: string;
  color: string;
  // Simple SVG icon
  icon: React.ReactNode;
}

const TILES: UseCaseTile[] = [
  {
    title: "Resource run",
    caption: "Farm while you're away",
    color: THEME.mc.xpGreen,
    icon: (
      <svg width={32} height={32} viewBox="0 0 20 20">
        <rect x={3} y={3} width={5} height={5} fill="#5A9C1A" />
        <rect x={8} y={3} width={5} height={5} fill="#875C27" />
        <rect x={3} y={8} width={5} height={5} fill="#875C27" />
        <rect x={8} y={8} width={5} height={5} fill="#5A9C1A" />
        <rect x={13} y={5} width={4} height={10} fill={THEME.mc.xpGreen} opacity={0.6} />
      </svg>
    ),
  },
  {
    title: "Explore terrain",
    caption: "Scout unknown biomes",
    color: THEME.accent,
    icon: (
      <svg width={32} height={32} viewBox="0 0 20 20">
        <circle cx={10} cy={10} r={7} fill="none" stroke={THEME.accent} strokeWidth={1.5} />
        <line x1={10} y1={3} x2={10} y2={7} stroke={THEME.accent} strokeWidth={1.5} />
        <line x1={10} y1={13} x2={10} y2={17} stroke={THEME.accent} strokeWidth={1.5} />
        <line x1={3} y1={10} x2={7} y2={10} stroke={THEME.accent} strokeWidth={1.5} />
        <line x1={13} y1={10} x2={17} y2={10} stroke={THEME.accent} strokeWidth={1.5} />
        <circle cx={10} cy={10} r={2} fill={THEME.accent} />
      </svg>
    ),
  },
  {
    title: "Recover from failure",
    caption: "Stalls become new plans",
    color: THEME.warn,
    icon: (
      <svg width={32} height={32} viewBox="0 0 20 20">
        <path
          d="M10,3 L15,8 L13,8 C13,11.5 10.5,14 7,14 C9,12 10,10 10,8 L8,8 Z"
          fill={THEME.warn}
          opacity={0.9}
        />
      </svg>
    ),
  },
  {
    title: "Chain long tasks",
    caption: "Multi-step autonomous work",
    color: THEME.accent2,
    icon: (
      <svg width={32} height={32} viewBox="0 0 20 20">
        <rect x={2} y={7} width={5} height={5} fill="none" stroke={THEME.accent2} strokeWidth={1.5} />
        <rect x={8} y={7} width={5} height={5} fill="none" stroke={THEME.accent2} strokeWidth={1.5} />
        <rect x={14} y={7} width={5} height={5} fill="none" stroke={THEME.accent2} strokeWidth={1.5} />
        <line x1={7} y1={9.5} x2={8} y2={9.5} stroke={THEME.accent2} strokeWidth={1.5} />
        <line x1={13} y1={9.5} x2={14} y2={9.5} stroke={THEME.accent2} strokeWidth={1.5} />
      </svg>
    ),
  },
  {
    title: "Swap execution backend",
    caption: "JARVIS-VLA or Mineflayer",
    color: THEME.mc.diamond,
    icon: (
      <svg width={32} height={32} viewBox="0 0 20 20">
        <rect x={2} y={5} width={7} height={5} fill="none" stroke={THEME.mc.diamond} strokeWidth={1.5} />
        <rect x={11} y={10} width={7} height={5} fill="none" stroke={THEME.mc.diamond} strokeWidth={1.5} />
        <path d="M9,7.5 L11,7.5 L11,6 L14,8 L11,10 L11,8.5 L9,8.5 Z" fill={THEME.mc.diamond} opacity={0.7} />
      </svg>
    ),
  },
];

// Advancement tile style (Minecraft UI inspired)
const tileBg = (color: string): React.CSSProperties => ({
  background: `linear-gradient(135deg, rgba(10,18,10,0.95) 0%, rgba(8,12,8,0.95) 100%)`,
  border: `2px solid`,
  borderColor: `${THEME.mc.stoneLight} ${THEME.mc.stoneDark} ${THEME.mc.stoneDark} ${THEME.mc.stoneLight}`,
  boxShadow: `0 0 18px ${color}22, inset 0 0 40px ${color}08`,
  padding: "20px 16px",
  display: "flex",
  flexDirection: "column" as const,
  gap: 10,
  flex: 1,
  minWidth: 0,
});

export const ClosedLoopScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headerOpacity = interpolate(frame, [5, 22], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Caption
  const captionOpacity = interpolate(frame, [260, 278], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SceneFade durationInFrames={D}>
      <AbsoluteFill
        style={{
          background: `linear-gradient(180deg, #060910 0%, #0A1020 100%)`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 70px",
        }}
      >
        {/* Pixel grid */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            ...THEME.pixelGrid,
            opacity: 0.25,
          }}
        />

        {/* Header */}
        <div
          style={{
            opacity: headerOpacity,
            textAlign: "center",
            marginBottom: 44,
          }}
        >
          <div
            style={{
              fontFamily: THEME.fontMono,
              fontSize: 15,
              color: THEME.mc.xpGreen,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              marginBottom: 10,
            }}
          >
            — what mine0 can do
          </div>
          <div
            style={{
              fontSize: 52,
              fontWeight: 700,
              color: THEME.text,
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
            }}
          >
            Mine0 turns open-ended Minecraft goals
            <br />
            into{" "}
            <span style={{ color: THEME.mc.xpGreen }}>persistent agent work.</span>
          </div>
        </div>

        {/* Advancement tiles */}
        <div
          style={{
            display: "flex",
            gap: 12,
            width: "100%",
          }}
        >
          {TILES.map((tile, i) => {
            const startF = 30 + i * 28;
            const s = spring({
              fps,
              frame: Math.max(0, frame - startF),
              config: { stiffness: 60, damping: 14 },
              durationInFrames: 26,
              from: 0,
              to: 1,
            });
            const tileOpacity = interpolate(
              frame,
              [startF, startF + 10],
              [0, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
            );

            return (
              <div
                key={i}
                style={{
                  ...tileBg(tile.color),
                  opacity: tileOpacity,
                  transform: `translateY(${(1 - s) * 24}px)`,
                }}
              >
                {/* Icon */}
                <div style={{ display: "flex", justifyContent: "center" }}>
                  {tile.icon}
                </div>

                {/* Title */}
                <div
                  style={{
                    fontFamily: THEME.fontSans,
                    fontWeight: 700,
                    fontSize: 18,
                    color: tile.color,
                    textAlign: "center",
                    lineHeight: 1.2,
                  }}
                >
                  {tile.title}
                </div>

                {/* Caption */}
                <div
                  style={{
                    fontFamily: THEME.fontSans,
                    fontSize: 13,
                    color: THEME.textMuted,
                    textAlign: "center",
                    lineHeight: 1.4,
                  }}
                >
                  {tile.caption}
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom caption */}
        <div
          style={{
            opacity: captionOpacity,
            marginTop: 36,
            textAlign: "center",
            fontFamily: THEME.fontSans,
            fontSize: 22,
            color: THEME.textMuted,
            lineHeight: 1.5,
          }}
        >
          Give it a job.{" "}
          <span style={{ color: THEME.text }}>
            It builds the plan, watches what happened, and keeps going.
          </span>
        </div>
      </AbsoluteFill>
    </SceneFade>
  );
};
