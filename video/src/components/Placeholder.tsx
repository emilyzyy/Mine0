import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { THEME } from "../theme";

interface PlaceholderProps {
  label: string;
  sublabel?: string;
  accent?: string;
}

export const Placeholder: React.FC<PlaceholderProps> = ({
  label,
  sublabel = "Drop clip into video/public/clips/ and rerun npm run render",
  accent = THEME.accent,
}) => {
  const frame = useCurrentFrame();

  // Slow breathe effect
  const breathe = interpolate(
    Math.sin((frame / 90) * Math.PI),
    [-1, 1],
    [0.45, 0.65]
  );

  // Moving scan line
  const scanY = (frame * 2) % 100; // 0–100% of height

  return (
    <AbsoluteFill
      style={{
        background: "#090f1a",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Grid overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `
            linear-gradient(rgba(34,211,238,0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(34,211,238,0.05) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
        }}
      />

      {/* Scan line */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: `${scanY}%`,
          height: 2,
          background: `linear-gradient(90deg, transparent, ${accent}22, ${accent}55, ${accent}22, transparent)`,
        }}
      />

      {/* Corner marks */}
      {[
        { top: 24, left: 24, borderTop: `2px solid ${accent}`, borderLeft: `2px solid ${accent}` },
        { top: 24, right: 24, borderTop: `2px solid ${accent}`, borderRight: `2px solid ${accent}` },
        { bottom: 24, left: 24, borderBottom: `2px solid ${accent}`, borderLeft: `2px solid ${accent}` },
        { bottom: 24, right: 24, borderBottom: `2px solid ${accent}`, borderRight: `2px solid ${accent}` },
      ].map((style, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            width: 32,
            height: 32,
            opacity: breathe,
            ...style,
          }}
        />
      ))}

      {/* Center dashed box */}
      <div
        style={{
          border: `2px dashed ${THEME.textDim}`,
          borderRadius: 8,
          padding: "40px 72px",
          textAlign: "center",
          opacity: breathe,
          maxWidth: "80%",
        }}
      >
        <div
          style={{
            color: THEME.textMuted,
            fontFamily: THEME.fontMono,
            fontSize: 26,
            letterSpacing: "0.06em",
            lineHeight: 1.3,
          }}
        >
          {label}
        </div>
        <div
          style={{
            color: THEME.textDim,
            fontFamily: THEME.fontMono,
            fontSize: 16,
            marginTop: 16,
            letterSpacing: "0.03em",
          }}
        >
          {sublabel}
        </div>
      </div>
    </AbsoluteFill>
  );
};
