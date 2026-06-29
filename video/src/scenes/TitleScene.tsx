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

const D = SCENE_DURATIONS.title; // 120 frames

// Seeded stars — fixed positions so they don't flicker frame-to-frame
const STARS = Array.from({ length: 90 }, (_, i) => ({
  x: (i * 239.7) % 1920,
  y: (i * 107.3) % 680,
  r: i % 5 === 0 ? 2.5 : i % 3 === 0 ? 1.8 : 1.2,
  opacity: 0.3 + (i % 7) * 0.09,
}));

// Redstone nodes — "waking up" animation
const NODES = Array.from({ length: 10 }, (_, i) => ({
  x: 180 + (i * 173.3) % 1560,
  y: 140 + (i * 97.7) % 540,
  delay: i * 8,
  color: i % 3 === 0 ? THEME.mc.redstone : i % 3 === 1 ? THEME.mc.xpGreen : THEME.accent,
}));

export const TitleScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const sceneOut = interpolate(frame, [D - 15, D], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // "What if Minecraft had an AI night crew?"
  const hookOpacity = interpolate(frame, [5, 22], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const hookY = interpolate(frame, [5, 25], [20, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.quad),
  });

  // "Mine0" title
  const titleScale = spring({
    fps,
    frame: Math.max(0, frame - 22),
    config: { stiffness: 55, damping: 13 },
    durationInFrames: 36,
    from: 0.8,
    to: 1,
  });
  const titleOpacity = interpolate(frame, [22, 38], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Subtitle
  const subOpacity = interpolate(frame, [42, 60], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // HUD flash
  const hudOpacity = interpolate(frame, [70, 85], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const hudPulse = interpolate(
    Math.sin((frame / 18) * Math.PI),
    [-1, 1],
    [0.6, 1]
  );

  // Redstone node activation
  const barWidth = interpolate(frame, [30, 65], [0, 360], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <AbsoluteFill style={{ opacity: sceneOut }}>
      {/* Night sky gradient */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(180deg, ${THEME.mc.nightSky} 0%, #0A1020 55%, #122210 80%, ${THEME.mc.grassSide}44 92%)`,
        }}
      />

      {/* Stars */}
      <svg
        style={{ position: "absolute", inset: 0 }}
        width={1920}
        height={1080}
      >
        {STARS.map((s, i) => {
          const twinkle = interpolate(
            Math.sin(((frame + i * 7) / 40) * Math.PI),
            [-1, 1],
            [s.opacity * 0.6, s.opacity]
          );
          return (
            <circle
              key={i}
              cx={s.x}
              cy={s.y}
              r={s.r}
              fill="#ffffff"
              opacity={twinkle}
            />
          );
        })}
      </svg>

      {/* Grass strip at bottom */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 100,
        }}
      >
        {/* Grass top layer */}
        <div
          style={{
            height: 24,
            background: THEME.mc.grassTop,
            ...THEME.pixelGrid,
          }}
        />
        {/* Dirt layer */}
        <div
          style={{
            height: 76,
            background: THEME.mc.dirtBrown,
            ...THEME.pixelGrid,
          }}
        />
      </div>

      {/* Subtle grid overlay on sky */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          bottom: 100,
          backgroundImage: `
            linear-gradient(rgba(34,211,238,0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(34,211,238,0.02) 1px, transparent 1px)
          `,
          backgroundSize: "64px 64px",
        }}
      />

      {/* Redstone nodes waking up */}
      <svg
        style={{ position: "absolute", inset: 0, bottom: 100 }}
        width={1920}
        height={980}
      >
        {NODES.map((node, i) => {
          const activated = interpolate(
            frame,
            [node.delay, node.delay + 18],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );
          const glow = interpolate(
            Math.sin(((frame - node.delay) / 25) * Math.PI),
            [-1, 1],
            [0.4, 0.9]
          ) * activated;

          // Draw connection to next node
          const nextNode = NODES[(i + 1) % NODES.length];
          const lineDraw = interpolate(
            frame,
            [node.delay + 12, node.delay + 35],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );
          const lineLen = Math.sqrt(
            (nextNode.x - node.x) ** 2 + (nextNode.y - node.y) ** 2
          );
          return (
            <g key={i}>
              {/* Connection line */}
              <line
                x1={node.x}
                y1={node.y}
                x2={nextNode.x}
                y2={nextNode.y}
                stroke={node.color}
                strokeWidth={1}
                opacity={lineDraw * 0.2}
                strokeDasharray={lineLen}
                strokeDashoffset={lineLen * (1 - lineDraw)}
              />
              {/* Node glow */}
              <circle
                cx={node.x}
                cy={node.y}
                r={10 * activated}
                fill={node.color}
                opacity={glow * 0.15}
              />
              {/* Node core */}
              <rect
                x={node.x - 4 * activated}
                y={node.y - 4 * activated}
                width={8 * activated}
                height={8 * activated}
                fill={node.color}
                opacity={glow}
              />
            </g>
          );
        })}
      </svg>

      {/* Center content */}
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          paddingBottom: 100,
        }}
      >
        {/* Hook line */}
        <div
          style={{
            opacity: hookOpacity,
            transform: `translateY(${hookY}px)`,
            fontFamily: THEME.fontSans,
            fontSize: 32,
            fontWeight: 400,
            color: THEME.textMuted,
            letterSpacing: "0.04em",
            marginBottom: 20,
            textAlign: "center",
          }}
        >
          What if Minecraft had an{" "}
          <span style={{ color: THEME.mc.xpGreen }}>AI night crew?</span>
        </div>

        {/* Mine0 title */}
        <div
          style={{
            opacity: titleOpacity,
            transform: `scale(${titleScale})`,
            fontFamily: THEME.fontSans,
            fontWeight: 800,
            fontSize: 130,
            letterSpacing: "-0.04em",
            color: THEME.text,
            lineHeight: 1,
            textShadow: `0 0 40px ${THEME.mc.xpGreen}33`,
          }}
        >
          Mine<span style={{ color: THEME.mc.xpGreen }}>0</span>
        </div>

        {/* Accent bar */}
        <div
          style={{
            width: barWidth,
            height: 3,
            background: `linear-gradient(90deg, ${THEME.mc.xpDark}, ${THEME.mc.xpGreen})`,
            boxShadow: `0 0 8px ${THEME.mc.xpGreen}`,
            marginTop: 16,
            marginBottom: 24,
          }}
        />

        {/* Subtitle */}
        <div
          style={{
            opacity: subOpacity,
            fontFamily: THEME.fontSans,
            fontWeight: 400,
            fontSize: 29,
            color: THEME.textMuted,
            textAlign: "center",
            letterSpacing: "0.01em",
          }}
        >
          Cerebras/Gemma-powered agents that{" "}
          <span style={{ color: THEME.text }}>plan, act, remember, and replan.</span>
        </div>

        {/* HUD flash */}
        <div
          style={{
            opacity: hudOpacity * hudPulse,
            marginTop: 36,
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "rgba(0,0,0,0.6)",
            border: `1px solid ${THEME.mc.xpGreen}44`,
            padding: "8px 20px",
          }}
        >
          <div
            style={{
              width: 7,
              height: 7,
              background: THEME.mc.xpGreen,
              boxShadow: `0 0 6px ${THEME.mc.xpGreen}`,
            }}
          />
          <span
            style={{
              fontFamily: THEME.fontMono,
              fontSize: 13,
              color: THEME.mc.xpGreen,
              letterSpacing: "0.08em",
            }}
          >
            Gemma / Cerebras planner online
          </span>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
