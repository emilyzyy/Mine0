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

const D = SCENE_DURATIONS.agentCrew; // 240 frames

// Inventory-slot agent cards — Minecraft aesthetic
interface AgentCard {
  name: string;
  role: string;
  color: string;
  iconColor: string;
  // Simple SVG path string for icon
  icon: string;
}

const AGENTS: AgentCard[] = [
  {
    name: "Scout",
    role: "Reads the world",
    color: THEME.accent,
    iconColor: THEME.accent,
    icon: "M20,10 L10,0 L0,10 L10,20 Z",  // diamond/compass shape
  },
  {
    name: "Planner",
    role: "Breaks down the goal",
    color: THEME.accent2,
    iconColor: THEME.accent2,
    icon: "M2,2 L18,2 L18,14 L2,14 Z M4,6 L16,6 M4,10 L12,10", // scroll/doc
  },
  {
    name: "Worker",
    role: "Acts in Minecraft",
    color: THEME.mc.xpGreen,
    iconColor: THEME.mc.xpGreen,
    icon: "M0,20 L4,8 L10,14 L16,2 L20,20 Z",  // pickaxe-ish
  },
  {
    name: "Verifier",
    role: "Checks if it worked",
    color: THEME.warn,
    iconColor: THEME.warn,
    icon: "M10,3 C5,3 1,7 1,10 C1,13 5,17 10,17 C15,17 19,13 19,10 C19,7 15,3 10,3 Z M10,8 C11.1,8 12,8.9 12,10 C12,11.1 11.1,12 10,12 C8.9,12 8,11.1 8,10 C8,8.9 8.9,8 10,8 Z",
  },
];

// Seeded spark positions
const SPARKS = Array.from({ length: 16 }, (_, i) => ({
  x: 200 + (i * 113.7) % 1520,
  y: 200 + (i * 87.3) % 600,
  startFrame: (i * 19) % 200,
  color: i % 3 === 0 ? THEME.mc.xpGreen : i % 3 === 1 ? THEME.mc.torchYellow : THEME.mc.xpDark,
}));

// Inventory slot CSS
const slotStyle = (color: string): React.CSSProperties => ({
  background: `rgba(30, 20, 20, 0.85)`,
  border: `2px solid`,
  borderColor: `${THEME.mc.stoneLight} ${THEME.mc.stoneDark} ${THEME.mc.stoneDark} ${THEME.mc.stoneLight}`,
  boxShadow: `inset 2px 2px 0 rgba(255,255,255,0.07), inset -2px -2px 0 rgba(0,0,0,0.4), 0 0 20px ${color}22`,
  padding: "28px 20px",
  display: "flex",
  flexDirection: "column" as const,
  alignItems: "center",
  gap: 14,
  flex: 1,
  minWidth: 0,
});

export const DecisionTreeScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headerOpacity = interpolate(frame, [5, 22], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Memory layer glow
  const memGlow = interpolate(
    Math.sin((frame / 50) * Math.PI),
    [-1, 1],
    [0.08, 0.18]
  );

  // Caption
  const captionOpacity = interpolate(frame, [195, 215], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SceneFade durationInFrames={D}>
      <AbsoluteFill
        style={{
          background: `linear-gradient(180deg, #060910 0%, #0A1020 100%)`,
        }}
      >
        {/* Pixel grid overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            ...THEME.pixelGrid,
            opacity: 0.3,
          }}
        />

        {/* Memory background glow layer */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `radial-gradient(ellipse 80% 60% at 50% 50%, ${THEME.mc.enchantPurp}${Math.round(memGlow * 255).toString(16).padStart(2, "0")} 0%, transparent 70%)`,
          }}
        />

        {/* Floating sparks (XP-orb style) */}
        <svg
          style={{ position: "absolute", inset: 0 }}
          width={1920}
          height={1080}
        >
          {SPARKS.map((s, i) => {
            const t = frame - s.startFrame;
            if (t < 0 || t > 90) return null;
            const progress = t / 90;
            const yRise = s.y - progress * 120;
            const opacity = interpolate(progress, [0, 0.2, 0.8, 1], [0, 0.8, 0.5, 0]);
            return (
              <rect
                key={i}
                x={s.x}
                y={yRise}
                width={4}
                height={4}
                fill={s.color}
                opacity={opacity}
              />
            );
          })}
        </svg>

        <AbsoluteFill
          style={{
            display: "flex",
            flexDirection: "column",
            padding: "0 80px",
            justifyContent: "center",
          }}
        >
          {/* Header */}
          <div
            style={{
              opacity: headerOpacity,
              marginBottom: 40,
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
              — the agent crew wakes up
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
              Mine0 coordinates a{" "}
              <span style={{ color: THEME.mc.xpGreen }}>crew of agents</span>
              ,
              <br />
              not a single one-shot bot.
            </div>
          </div>

          {/* Inventory card row */}
          <div
            style={{
              display: "flex",
              gap: 12,
              marginBottom: 28,
            }}
          >
            {AGENTS.map((agent, i) => {
              const startF = 30 + i * 28;
              const s = spring({
                fps,
                frame: Math.max(0, frame - startF),
                config: { stiffness: 62, damping: 14 },
                durationInFrames: 26,
                from: 0,
                to: 1,
              });
              const cardOpacity = interpolate(
                frame,
                [startF, startF + 10],
                [0, 1],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
              );
              return (
                <div
                  key={i}
                  style={{
                    ...slotStyle(agent.color),
                    opacity: cardOpacity,
                    transform: `translateY(${(1 - s) * 28}px)`,
                  }}
                >
                  {/* Icon (simple SVG) */}
                  <svg
                    width={40}
                    height={40}
                    viewBox="0 0 20 20"
                    style={{ overflow: "visible" }}
                  >
                    <path
                      d={agent.icon}
                      fill="none"
                      stroke={agent.iconColor}
                      strokeWidth={1.5}
                      opacity={0.9}
                    />
                    <rect
                      x={0}
                      y={0}
                      width={20}
                      height={20}
                      fill="none"
                      stroke={agent.iconColor}
                      strokeWidth={0.5}
                      opacity={0.2}
                    />
                  </svg>

                  {/* Name */}
                  <div
                    style={{
                      fontFamily: THEME.fontSans,
                      fontWeight: 700,
                      fontSize: 22,
                      color: agent.color,
                      textAlign: "center",
                      letterSpacing: "0.01em",
                    }}
                  >
                    {agent.name}
                  </div>

                  {/* Role */}
                  <div
                    style={{
                      fontFamily: THEME.fontSans,
                      fontSize: 15,
                      color: THEME.textMuted,
                      textAlign: "center",
                      lineHeight: 1.4,
                    }}
                  >
                    {agent.role}
                  </div>
                </div>
              );
            })}

            {/* Memory — wider card with glow */}
            {(() => {
              const startF = 30 + 4 * 28;
              const s = spring({
                fps,
                frame: Math.max(0, frame - startF),
                config: { stiffness: 62, damping: 14 },
                durationInFrames: 26,
                from: 0,
                to: 1,
              });
              const cardOpacity = interpolate(
                frame,
                [startF, startF + 10],
                [0, 1],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
              );
              const enchantPulse = interpolate(
                Math.sin((frame / 40) * Math.PI),
                [-1, 1],
                [0.12, 0.28]
              );
              return (
                <div
                  style={{
                    ...slotStyle(THEME.mc.enchantPurp),
                    opacity: cardOpacity,
                    transform: `translateY(${(1 - s) * 28}px)`,
                    boxShadow: `inset 2px 2px 0 rgba(255,255,255,0.07), inset -2px -2px 0 rgba(0,0,0,0.4), 0 0 30px ${THEME.mc.enchantPurp}${Math.round(enchantPulse * 255).toString(16).padStart(2, "0")}`,
                  }}
                >
                  <svg width={40} height={40} viewBox="0 0 20 20">
                    <rect x={2} y={2} width={16} height={16} fill="none" stroke={THEME.mc.enchantPurp} strokeWidth={1.5} opacity={0.9} />
                    <line x1={5} y1={7} x2={15} y2={7} stroke={THEME.mc.enchantPurp} strokeWidth={1} opacity={0.7} />
                    <line x1={5} y1={10} x2={15} y2={10} stroke={THEME.mc.enchantPurp} strokeWidth={1} opacity={0.7} />
                    <line x1={5} y1={13} x2={11} y2={13} stroke={THEME.mc.enchantPurp} strokeWidth={1} opacity={0.7} />
                  </svg>
                  <div style={{ fontFamily: THEME.fontSans, fontWeight: 700, fontSize: 22, color: THEME.mc.enchantPurp, textAlign: "center" }}>
                    Memory
                  </div>
                  <div style={{ fontFamily: THEME.fontSans, fontSize: 15, color: THEME.textMuted, textAlign: "center", lineHeight: 1.4 }}>
                    Learns what failed before
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Caption */}
          <div
            style={{
              opacity: captionOpacity,
              fontFamily: THEME.fontSans,
              fontSize: 21,
              color: THEME.textMuted,
              textAlign: "center",
            }}
          >
            Cerebras planning loop:{" "}
            <span style={{ color: THEME.mc.xpGreen }}>next subgoal ready.</span>
            &nbsp;&nbsp;·&nbsp;&nbsp;
            <span style={{ color: THEME.text }}>
              scan → collect → move → verify → replan
            </span>
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    </SceneFade>
  );
};
