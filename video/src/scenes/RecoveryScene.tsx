import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
} from "remotion";
import { THEME, SCENE_DURATIONS } from "../theme";
import { SceneFade } from "../components/SceneFade";

const D = SCENE_DURATIONS.recovery; // 210 frames

// In-game event log style
interface EventLine {
  prefix: string;
  text: string;
  color: string;
  delay: number;
  isHighlight?: boolean;
}

const EVENTS: EventLine[] = [
  { prefix: "[WARN]", text: "got stuck repeating action",            color: THEME.warn,          delay: 20 },
  { prefix: "     ",  text: "scan_for_zombie × 3 — no change",       color: THEME.textDim,       delay: 40 },
  { prefix: "[VER] ", text: "verifier caught it",                    color: THEME.accent,        delay: 65 },
  { prefix: "[MEM] ", text: "failure logged to memory",              color: THEME.mc.enchantPurp,delay: 88 },
  { prefix: "[PLAN]", text: "new strategy selected",                 color: THEME.mc.xpGreen,    delay: 112, isHighlight: true },
  { prefix: "     ",  text: "active_subtask → orient_to_zombie",     color: THEME.mc.xpGreen,    delay: 128 },
];

// Seeded redstone sparks for the "strategy changed" moment
const RSPARKS = Array.from({ length: 12 }, (_, i) => ({
  x: 960 + (i * 127.3 - 600) % 500,
  y: 600 + (i * 79.1 - 300) % 200,
  color: i % 2 === 0 ? THEME.mc.redstone : THEME.mc.xpGreen,
}));

export const RecoveryScene: React.FC = () => {
  const frame = useCurrentFrame();

  const headerOpacity = interpolate(frame, [5, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Redstone pulse when highlight event appears
  const highlightEvent = EVENTS.find((e) => e.isHighlight);
  const strategyFrame = highlightEvent?.delay ?? 112;
  const pulseFraction = interpolate(
    frame,
    [strategyFrame, strategyFrame + 30],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const pulseGlow = interpolate(pulseFraction, [0, 0.3, 1], [0, 0.8, 0]);

  // Caption
  const captionOpacity = interpolate(frame, [170, 188], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Cursor blink
  const cursorVisible = Math.floor(frame / 11) % 2 === 0;
  const lastEvent = EVENTS[EVENTS.length - 1];
  const showCursor = frame > lastEvent.delay && frame < lastEvent.delay + 30;

  return (
    <SceneFade durationInFrames={D}>
      <AbsoluteFill
        style={{
          background: `linear-gradient(180deg, #060910 0%, #0A1020 100%)`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 120px",
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

        {/* Redstone pulse flash */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `radial-gradient(ellipse 60% 40% at 50% 70%, ${THEME.mc.xpGreen}${Math.round(pulseGlow * 80).toString(16).padStart(2, "0")} 0%, transparent 70%)`,
            pointerEvents: "none",
          }}
        />

        {/* Redstone sparks */}
        {pulseFraction > 0 && pulseFraction < 0.9 && (
          <svg
            style={{ position: "absolute", inset: 0 }}
            width={1920}
            height={1080}
          >
            {RSPARKS.map((s, i) => {
              const t = (pulseFraction * 30 - i * 1.5);
              if (t < 0 || t > 20) return null;
              const prog = t / 20;
              const yOff = -prog * 60;
              const op = interpolate(prog, [0, 0.2, 0.8, 1], [0, 0.9, 0.6, 0]);
              return (
                <rect
                  key={i}
                  x={s.x}
                  y={s.y + yOff}
                  width={5}
                  height={5}
                  fill={s.color}
                  opacity={op}
                />
              );
            })}
          </svg>
        )}

        <AbsoluteFill
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "0 120px",
          }}
        >
          {/* Header */}
          <div
            style={{
              opacity: headerOpacity,
              marginBottom: 36,
            }}
          >
            <div
              style={{
                fontFamily: THEME.fontMono,
                fontSize: 15,
                color: THEME.mc.redstone,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                marginBottom: 10,
              }}
            >
              — failure recovery
            </div>
            <div
              style={{
                fontSize: 50,
                fontWeight: 700,
                color: THEME.text,
                letterSpacing: "-0.02em",
                lineHeight: 1.1,
              }}
            >
              Getting stuck is data.
              <br />
              <span style={{ color: THEME.mc.xpGreen }}>Mine0 uses it to replan.</span>
            </div>
          </div>

          {/* In-game event log */}
          <div
            style={{
              background: "rgba(0, 0, 0, 0.7)",
              border: `2px solid ${THEME.mc.stoneDark}`,
              borderLeft: `4px solid ${THEME.mc.redstone}`,
              borderTop: `2px solid ${THEME.mc.stoneLight}`,
              borderRight: `2px solid ${THEME.mc.stoneLight}`,
              padding: "18px 22px 18px 20px",
            }}
          >
            {/* Log header */}
            <div
              style={{
                fontFamily: THEME.fontMono,
                fontSize: 12,
                color: THEME.textDim,
                letterSpacing: "0.1em",
                marginBottom: 14,
                borderBottom: `1px solid ${THEME.mc.stoneDark}`,
                paddingBottom: 8,
              }}
            >
              MINE0 AGENT LOG — RECOVERY EVENT
            </div>

            {EVENTS.map((ev, i) => {
              const lineOpacity = interpolate(
                frame,
                [ev.delay, ev.delay + 10],
                [0, 1],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
              );
              const isLast = i === EVENTS.length - 1;

              return (
                <div
                  key={i}
                  style={{
                    opacity: lineOpacity,
                    display: "flex",
                    alignItems: "baseline",
                    gap: 14,
                    marginBottom: ev.isHighlight ? 2 : 8,
                    background: ev.isHighlight
                      ? `rgba(94,189,59,0.08)`
                      : "transparent",
                    padding: ev.isHighlight ? "4px 6px" : "0",
                    borderLeft: ev.isHighlight
                      ? `2px solid ${THEME.mc.xpGreen}`
                      : "2px solid transparent",
                  }}
                >
                  <span
                    style={{
                      fontFamily: THEME.fontMono,
                      fontSize: 14,
                      color: ev.color,
                      opacity: 0.8,
                      minWidth: 58,
                      flexShrink: 0,
                    }}
                  >
                    {ev.prefix}
                  </span>
                  <span
                    style={{
                      fontFamily: THEME.fontMono,
                      fontSize: 20,
                      color: ev.color,
                      lineHeight: 1.4,
                    }}
                  >
                    {ev.text}
                    {isLast && showCursor && cursorVisible && (
                      <span
                        style={{
                          display: "inline-block",
                          width: 11,
                          height: 22,
                          background: THEME.mc.xpGreen,
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

          {/* HUD tag */}
          <div
            style={{
              opacity: interpolate(frame, [155, 172], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
              marginTop: 16,
              display: "flex",
              gap: 12,
              flexWrap: "wrap" as const,
            }}
          >
            {[
              { text: "failure → memory", color: THEME.mc.enchantPurp },
              { text: "→", color: THEME.textDim },
              { text: "memory → new plan", color: THEME.mc.xpGreen },
              { text: "→", color: THEME.textDim },
              { text: "subgoal regenerated", color: THEME.accent },
            ].map((item, i) =>
              item.text === "→" ? (
                <span
                  key={i}
                  style={{
                    fontFamily: THEME.fontMono,
                    fontSize: 16,
                    color: item.color,
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
                    color: item.color,
                    padding: "4px 12px",
                    background: `${item.color}11`,
                    border: `1px solid ${item.color}33`,
                    letterSpacing: "0.05em",
                  }}
                >
                  {item.text}
                </div>
              )
            )}
          </div>

          {/* Caption */}
          <div
            style={{
              opacity: captionOpacity,
              marginTop: 28,
              textAlign: "center",
              fontFamily: THEME.fontSans,
              fontSize: 21,
              color: THEME.textMuted,
            }}
          >
            Instead of repeating the same action,{" "}
            <span style={{ color: THEME.mc.xpGreen }}>
              Mine0 changes strategy.
            </span>
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    </SceneFade>
  );
};
