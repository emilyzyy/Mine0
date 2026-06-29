import React from "react";
import {
  AbsoluteFill,
  interpolate,
  OffthreadVideo,
  staticFile,
  useCurrentFrame,
  Easing,
} from "remotion";
import { THEME, SCENE_DURATIONS } from "../theme";
import { SceneFade } from "../components/SceneFade";
import { TaskTreeReplay } from "../components/TaskTreeReplay";
import { MinecraftPovReplay } from "../components/MinecraftPovReplay";
import { DEMO_EVENTS, getRecentEvents } from "../components/demoTimeline";

const D = SCENE_DURATIONS.mainDemo; // 630 frames

interface Props {
  hasUiTree: boolean;
  hasMcPov: boolean;
  hasSideBySide: boolean;
  demoAssetMode: "auto" | "mock" | "clips";
}

// Tag colors for the event log strip
const TAG_COLORS: Record<string, string> = {
  GOAL:  THEME.accent2,
  PLAN:  THEME.mc.xpGreen,
  STATE: THEME.warn,
  ACT:   THEME.accent,
  VER:   THEME.accent,
  MEM:   THEME.mc.enchantPurp,
};

// MC panel label chip
const McLabel: React.FC<{ text: string; sub: string; color: string; opacity: number }> = ({
  text, sub, color, opacity,
}) => (
  <div
    style={{
      opacity,
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "6px 12px",
      background: "rgba(0,0,0,0.7)",
      border: "2px solid",
      borderColor: `${THEME.mc.stoneLight} ${THEME.mc.stoneDark} ${THEME.mc.stoneDark} ${THEME.mc.stoneLight}`,
      flexShrink: 0,
    }}
  >
    <div style={{ width: 8, height: 8, background: color, boxShadow: `0 0 6px ${color}` }} />
    <div>
      <div style={{ fontFamily: THEME.fontMono, fontSize: 13, color, letterSpacing: "0.08em", lineHeight: 1.1 }}>
        {text}
      </div>
      <div style={{ fontFamily: THEME.fontMono, fontSize: 10, color: THEME.textDim, letterSpacing: "0.04em", lineHeight: 1.1 }}>
        {sub}
      </div>
    </div>
  </div>
);

// Animated callout chips — only shown over clip panels (not replay)
const CALLOUTS = [
  { text: "next subgoal selected", color: THEME.accent,     startF: 80  },
  { text: "memory updated",        color: THEME.mc.xpGreen, startF: 180 },
  { text: "verification running",  color: THEME.warn,       startF: 280 },
  { text: "replan triggered",      color: THEME.accent2,    startF: 380 },
  { text: "next subgoal selected", color: THEME.accent,     startF: 480 },
  { text: "memory updated",        color: THEME.mc.xpGreen, startF: 560 },
];

export const MainDemoScene: React.FC<Props> = ({
  hasUiTree,
  hasMcPov,
  hasSideBySide,
  demoAssetMode,
}) => {
  const frame = useCurrentFrame();

  // Decide rendering mode
  const hasAnyClip = hasUiTree || hasMcPov || hasSideBySide;
  const showReplay =
    demoAssetMode === "mock" ||
    (demoAssetMode !== "clips" && !hasAnyClip);

  const headerIn = interpolate(frame, [8, 26], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.quad),
  });

  const panelIn = interpolate(frame, [20, 48], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.quad),
  });

  const overlayIn = interpolate(frame, [55, 80], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Live/replay indicator pulse
  const livePulse = interpolate(Math.sin((frame / 18) * Math.PI), [-1, 1], [0.5, 1]);

  // Event log: visible events for the replay strip
  const visibleEvents = getRecentEvents(frame, 4);

  // Caption opacity (clips mode only)
  const captionOpacity = interpolate(frame, [62, 82], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SceneFade durationInFrames={D}>
      <AbsoluteFill
        style={{
          background: "#070b12",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Top header bar */}
        <div
          style={{
            opacity: headerIn,
            padding: "22px 50px 12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <div>
            <div
              style={{
                fontFamily: THEME.fontMono,
                fontSize: 14,
                color: showReplay ? THEME.accent : THEME.mc.xpGreen,
                letterSpacing: "0.14em",
                textTransform: "uppercase" as const,
                marginBottom: 4,
              }}
            >
              {showReplay ? "— system walkthrough" : "— live execution"}
            </div>
            <div
              style={{
                fontSize: 38,
                fontWeight: 700,
                color: THEME.text,
                letterSpacing: "-0.02em",
                lineHeight: 1.1,
              }}
            >
              {showReplay
                ? <>Craft and equip an iron helmet <span style={{ color: THEME.mc.xpGreen }}>before nightfall.</span></>
                : <>Watch the plan change <span style={{ color: THEME.mc.xpGreen }}>while the world changes.</span></>}
            </div>
          </div>

          {/* Badge */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "rgba(0,0,0,0.6)",
              border: "2px solid",
              borderColor: `${THEME.mc.stoneLight} ${THEME.mc.stoneDark} ${THEME.mc.stoneDark} ${THEME.mc.stoneLight}`,
              padding: "10px 18px",
            }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                background: showReplay ? THEME.accent : THEME.mc.xpGreen,
                boxShadow: `0 0 8px ${showReplay ? THEME.accent : THEME.mc.xpGreen}`,
                opacity: livePulse,
              }}
            />
            <span
              style={{
                fontFamily: THEME.fontMono,
                fontSize: 14,
                color: showReplay ? THEME.accent : THEME.mc.xpGreen,
                letterSpacing: "0.08em",
              }}
            >
              {showReplay ? "DEMO REPLAY" : "AGENT RUNNING"}
            </span>
          </div>
        </div>

        {/* Panel area */}
        <div
          style={{
            flex: 1,
            padding: showReplay ? "6px 50px 96px" : "6px 50px 60px",
            opacity: panelIn,
            display: "flex",
            gap: 14,
            minHeight: 0,
          }}
        >
          {hasSideBySide && !showReplay ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column" as const, gap: 8, minWidth: 0 }}>
              <McLabel text="TASK / WORLD MODEL" sub="live execution view" color={THEME.accent} opacity={overlayIn} />
              <div style={{ flex: 1, border: `2px solid ${THEME.mc.stoneDark}`, borderTop: `3px solid ${THEME.mc.stoneLight}`, overflow: "hidden", position: "relative" as const, minHeight: 0 }}>
                <OffthreadVideo src={staticFile("clips/side_by_side.mp4")} muted style={{ width: "100%", height: "100%", objectFit: "cover" as const }} />
              </div>
            </div>
          ) : (
            <>
              {/* Left panel */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column" as const, gap: 8, minWidth: 0, position: "relative" as const }}>
                <McLabel
                  text="TASK MAP"
                  sub={showReplay ? "animated task / world model" : "Live task / world model"}
                  color={THEME.accent2}
                  opacity={overlayIn}
                />
                <div
                  style={{
                    flex: 1,
                    border: `2px solid ${THEME.mc.stoneDark}`,
                    borderTop: `3px solid ${THEME.mc.stoneLight}`,
                    overflow: "hidden",
                    position: "relative" as const,
                    minHeight: 0,
                  }}
                >
                  {hasUiTree && !showReplay ? (
                    <OffthreadVideo
                      src={staticFile("clips/ui_tree.mp4")}
                      muted
                      style={{ width: "100%", height: "100%", objectFit: "contain" as const }}
                    />
                  ) : (
                    <TaskTreeReplay />
                  )}

                  {/* Callout chips — only in clip mode */}
                  {!showReplay && CALLOUTS.map((c, i) => {
                    const vis = interpolate(
                      frame,
                      [c.startF, c.startF + 12, c.startF + 60, c.startF + 80],
                      [0, 1, 1, 0],
                      { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
                    );
                    if (vis <= 0) return null;
                    return (
                      <div
                        key={i}
                        style={{
                          position: "absolute",
                          bottom: 16 + (i % 3) * 44,
                          left: 12,
                          opacity: vis,
                          background: "rgba(0,0,0,0.82)",
                          border: `1px solid ${c.color}55`,
                          padding: "6px 14px",
                          fontFamily: THEME.fontMono,
                          fontSize: 14,
                          color: c.color,
                          letterSpacing: "0.04em",
                          pointerEvents: "none" as const,
                        }}
                      >
                        › {c.text}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right panel */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column" as const, gap: 8, minWidth: 0 }}>
                <McLabel
                  text="WORLD VIEW"
                  sub={showReplay ? "stylized execution walkthrough" : "Minecraft execution"}
                  color={THEME.mc.xpGreen}
                  opacity={overlayIn}
                />
                <div
                  style={{
                    flex: 1,
                    border: `2px solid ${THEME.mc.stoneDark}`,
                    borderTop: `3px solid ${THEME.mc.stoneLight}`,
                    overflow: "hidden",
                    position: "relative" as const,
                    minHeight: 0,
                  }}
                >
                  {hasMcPov && !showReplay ? (
                    <OffthreadVideo
                      src={staticFile("clips/minecraft_pov.mp4")}
                      muted
                      style={{ width: "100%", height: "100%", objectFit: "cover" as const }}
                    />
                  ) : (
                    <MinecraftPovReplay />
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Event log strip (replay mode) — sits above SystemHud */}
        {showReplay && (
          <div
            style={{
              position: "absolute",
              bottom: 58,
              left: 50,
              right: 50,
              height: 30,
              display: "flex",
              alignItems: "center",
              gap: 16,
              overflow: "hidden",
              pointerEvents: "none" as const,
            }}
          >
            {visibleEvents.map((ev, i) => {
              const isLatest = i === visibleEvents.length - 1;
              const evFade = interpolate(frame, [ev.frame, ev.frame + 10], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });
              const tagColor = TAG_COLORS[ev.tag] ?? THEME.textMuted;
              return (
                <div
                  key={`${ev.frame}-${ev.tag}`}
                  style={{
                    opacity: evFade * (isLatest ? 1 : 0.45),
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      fontFamily: THEME.fontMono,
                      fontSize: 10,
                      color: tagColor,
                      background: `${tagColor}18`,
                      border: `1px solid ${tagColor}44`,
                      padding: "1px 6px",
                      letterSpacing: "0.07em",
                    }}
                  >
                    {ev.tag}
                  </span>
                  <span
                    style={{
                      fontFamily: THEME.fontMono,
                      fontSize: 11,
                      color: isLatest ? THEME.textMuted : THEME.textDim,
                      letterSpacing: "0.02em",
                      maxWidth: 220,
                      overflow: "hidden",
                      whiteSpace: "nowrap" as const,
                      textOverflow: "ellipsis",
                    }}
                  >
                    {ev.text}
                  </span>
                  {i < visibleEvents.length - 1 && (
                    <span style={{ color: THEME.textDim, fontSize: 10, opacity: 0.4 }}>·</span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Caption (clips mode only) */}
        {!showReplay && (
          <div
            style={{
              opacity: captionOpacity,
              position: "absolute",
              bottom: 62,
              left: 0,
              right: 0,
              display: "flex",
              justifyContent: "center",
              pointerEvents: "none" as const,
            }}
          >
            <div
              style={{
                fontFamily: THEME.fontMono,
                fontSize: 15,
                color: THEME.textDim,
                display: "flex",
                gap: 16,
                alignItems: "center",
              }}
            >
              <span style={{ color: THEME.accent }}>Cerebras/Gemma plans from structured context</span>
              <span>·</span>
              <span>JARVIS-VLA or Mineflayer acts in-world</span>
              <span>·</span>
              <span style={{ color: THEME.mc.xpGreen }}>verifier checks progress</span>
            </div>
          </div>
        )}
      </AbsoluteFill>
    </SceneFade>
  );
};
