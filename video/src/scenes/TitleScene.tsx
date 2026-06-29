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

export const TitleScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const sceneOpacity = interpolate(
    frame,
    [D - 18, D],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // "Mine0" title — spring scale + fade
  const titleScale = spring({
    fps,
    frame,
    config: { stiffness: 55, damping: 14, mass: 0.9 },
    durationInFrames: 45,
    from: 0.78,
    to: 1,
  });
  const titleOpacity = interpolate(frame, [0, 18], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Glow halo around title
  const glowOpacity = interpolate(frame, [10, 40], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const glowPulse = interpolate(
    Math.sin((frame / 45) * Math.PI),
    [-1, 1],
    [0.5, 0.8]
  );

  // Subtitle
  const subtitleOpacity = interpolate(frame, [28, 50], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const subtitleY = interpolate(frame, [28, 55], [24, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.quad),
  });

  // Tag line
  const tagOpacity = interpolate(frame, [50, 72], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Pulsing accent bar under title
  const barWidth = interpolate(frame, [35, 70], [0, 340], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Floating node dots in background
  const nodes = Array.from({ length: 12 }, (_, i) => {
    const angle = (i / 12) * Math.PI * 2;
    const radius = 380 + Math.sin(i * 1.7) * 80;
    const cx = 960 + Math.cos(angle) * radius;
    const cy = 540 + Math.sin(angle) * radius;
    const pulse = interpolate(
      Math.sin(((frame / 60 + i * 0.5) * Math.PI)),
      [-1, 1],
      [0.2, 0.55]
    );
    const appear = interpolate(frame, [i * 5, i * 5 + 20], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    return { cx, cy, pulse, appear };
  });

  return (
    <AbsoluteFill style={{ opacity: sceneOpacity }}>
      {/* Radial vignette */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 70% 70% at 50% 50%, transparent 30%, rgba(0,0,0,0.7) 100%)",
        }}
      />

      {/* Floating background nodes */}
      <svg
        style={{ position: "absolute", inset: 0 }}
        width={1920}
        height={1080}
      >
        {nodes.map((n, i) => (
          <g key={i} opacity={n.appear * n.pulse}>
            <circle
              cx={n.cx}
              cy={n.cy}
              r={5}
              fill={THEME.accent}
              opacity={0.7}
            />
            {i < nodes.length - 1 && (
              <line
                x1={n.cx}
                y1={n.cy}
                x2={nodes[(i + 1) % nodes.length].cx}
                y2={nodes[(i + 1) % nodes.length].cy}
                stroke={THEME.accent}
                strokeWidth={0.8}
                opacity={0.12}
              />
            )}
          </g>
        ))}
      </svg>

      {/* Center content */}
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 0,
        }}
      >
        {/* Glow behind title */}
        <div
          style={{
            position: "absolute",
            width: 600,
            height: 200,
            background: `radial-gradient(ellipse, ${THEME.accent}22, transparent 70%)`,
            opacity: glowOpacity * glowPulse,
          }}
        />

        {/* Main title */}
        <div
          style={{
            fontFamily: THEME.fontSans,
            fontWeight: 800,
            fontSize: 148,
            letterSpacing: "-0.04em",
            color: THEME.text,
            opacity: titleOpacity,
            transform: `scale(${titleScale})`,
            lineHeight: 1,
          }}
        >
          Mine
          <span style={{ color: THEME.accent }}>0</span>
        </div>

        {/* Accent bar */}
        <div
          style={{
            width: barWidth,
            height: 3,
            background: `linear-gradient(90deg, ${THEME.accent2}, ${THEME.accent})`,
            borderRadius: 2,
            marginTop: 16,
            marginBottom: 28,
          }}
        />

        {/* Subtitle */}
        <div
          style={{
            fontFamily: THEME.fontSans,
            fontWeight: 400,
            fontSize: 32,
            color: THEME.textMuted,
            opacity: subtitleOpacity,
            transform: `translateY(${subtitleY}px)`,
            letterSpacing: "0.02em",
          }}
        >
          Cerebras/Gemma-powered Minecraft agent orchestration
        </div>

        {/* Tag */}
        <div
          style={{
            marginTop: 32,
            display: "flex",
            gap: 12,
            opacity: tagOpacity,
          }}
        >
          {["Cerebras", "Gemma 4", "JARVIS-VLA", "Mineflayer"].map((tag) => (
            <span
              key={tag}
              style={{
                background: "rgba(34,211,238,0.08)",
                border: `1px solid ${THEME.accent}44`,
                borderRadius: 20,
                padding: "6px 18px",
                fontFamily: THEME.fontMono,
                fontSize: 16,
                color: THEME.accent,
                letterSpacing: "0.04em",
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
