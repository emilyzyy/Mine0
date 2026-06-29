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
import { Placeholder } from "../components/Placeholder";

const D = SCENE_DURATIONS.mainDemo; // 630 frames

interface Props {
  hasUiTree: boolean;
  hasMcPov: boolean;
  hasSideBySide: boolean;
}

// Animated callouts over the left panel
const CALLOUTS = [
  { text: "next subgoal selected",   color: THEME.accent,    startF: 80  },
  { text: "memory updated",          color: THEME.mc.xpGreen,startF: 180 },
  { text: "verification running",    color: THEME.warn,      startF: 280 },
  { text: "replan triggered",        color: THEME.accent2,   startF: 380 },
  { text: "next subgoal selected",   color: THEME.accent,    startF: 480 },
  { text: "memory updated",          color: THEME.mc.xpGreen,startF: 560 },
];

// MC panel label
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
      border: `2px solid`,
      borderColor: `${THEME.mc.stoneLight} ${THEME.mc.stoneDark} ${THEME.mc.stoneDark} ${THEME.mc.stoneLight}`,
      flexShrink: 0,
    }}
  >
    <div
      style={{
        width: 8,
        height: 8,
        background: color,
        boxShadow: `0 0 6px ${color}`,
      }}
    />
    <div>
      <div
        style={{
          fontFamily: THEME.fontMono,
          fontSize: 13,
          color: color,
          letterSpacing: "0.08em",
          lineHeight: 1.1,
        }}
      >
        {text}
      </div>
      <div
        style={{
          fontFamily: THEME.fontMono,
          fontSize: 10,
          color: THEME.textDim,
          letterSpacing: "0.04em",
          lineHeight: 1.1,
        }}
      >
        {sub}
      </div>
    </div>
  </div>
);

export const MainDemoScene: React.FC<Props> = ({
  hasUiTree,
  hasMcPov,
  hasSideBySide,
}) => {
  const frame = useCurrentFrame();

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

  // Live indicator pulse
  const livePulse = interpolate(
    Math.sin((frame / 18) * Math.PI),
    [-1, 1],
    [0.5, 1]
  );

  // "Watch the plan change..." text
  const watchOpacity = interpolate(frame, [62, 82], [0, 1], {
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
                color: THEME.mc.xpGreen,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                marginBottom: 4,
              }}
            >
              — live execution
            </div>
            <div
              style={{
                fontSize: 40,
                fontWeight: 700,
                color: THEME.text,
                letterSpacing: "-0.02em",
                lineHeight: 1.1,
              }}
            >
              Watch the plan change{" "}
              <span style={{ color: THEME.mc.xpGreen }}>
                while the world changes.
              </span>
            </div>
          </div>

          {/* Running badge */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "rgba(0,0,0,0.6)",
              border: `2px solid`,
              borderColor: `${THEME.mc.stoneLight} ${THEME.mc.stoneDark} ${THEME.mc.stoneDark} ${THEME.mc.stoneLight}`,
              padding: "10px 18px",
              gap: 10,
            }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                background: THEME.mc.xpGreen,
                boxShadow: `0 0 8px ${THEME.mc.xpGreen}`,
                opacity: livePulse,
              }}
            />
            <span
              style={{
                fontFamily: THEME.fontMono,
                fontSize: 14,
                color: THEME.mc.xpGreen,
                letterSpacing: "0.08em",
              }}
            >
              AGENT RUNNING
            </span>
          </div>
        </div>

        {/* Panel area */}
        <div
          style={{
            flex: 1,
            padding: "6px 50px 60px",
            opacity: panelIn,
            display: "flex",
            gap: 14,
            minHeight: 0,
          }}
        >
          {hasSideBySide ? (
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                gap: 8,
                minWidth: 0,
              }}
            >
              <McLabel
                text="TASK / WORLD MODEL"
                sub="live execution view"
                color={THEME.accent}
                opacity={overlayIn}
              />
              <div
                style={{
                  flex: 1,
                  border: `2px solid ${THEME.mc.stoneDark}`,
                  borderTop: `3px solid ${THEME.mc.stoneLight}`,
                  overflow: "hidden",
                  position: "relative",
                  minHeight: 0,
                }}
              >
                <OffthreadVideo
                  src={staticFile("clips/side_by_side.mp4")}
                  muted
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </div>
            </div>
          ) : (
            <>
              {/* Left panel — Task Map */}
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  minWidth: 0,
                  position: "relative",
                }}
              >
                <McLabel
                  text="TASK MAP"
                  sub="Live task / world model"
                  color={THEME.accent2}
                  opacity={overlayIn}
                />
                <div
                  style={{
                    flex: 1,
                    border: `2px solid ${THEME.mc.stoneDark}`,
                    borderTop: `3px solid ${THEME.mc.stoneLight}`,
                    overflow: "hidden",
                    position: "relative",
                    minHeight: 0,
                  }}
                >
                  {hasUiTree ? (
                    <OffthreadVideo
                      src={staticFile("clips/ui_tree.mp4")}
                      muted
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                      }}
                    />
                  ) : (
                    <Placeholder
                      label="INSERT UI DECISION TREE RECORDING"
                      accent={THEME.accent2}
                    />
                  )}

                  {/* Animated callout chips over panel */}
                  {CALLOUTS.map((c, i) => {
                    const vis = interpolate(
                      frame,
                      [c.startF, c.startF + 12, c.startF + 60, c.startF + 80],
                      [0, 1, 1, 0],
                      {
                        extrapolateLeft: "clamp",
                        extrapolateRight: "clamp",
                      }
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
                          pointerEvents: "none",
                        }}
                      >
                        › {c.text}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right panel — World View */}
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  minWidth: 0,
                }}
              >
                <McLabel
                  text="WORLD VIEW"
                  sub="Minecraft execution"
                  color={THEME.mc.xpGreen}
                  opacity={overlayIn}
                />
                <div
                  style={{
                    flex: 1,
                    border: `2px solid ${THEME.mc.stoneDark}`,
                    borderTop: `3px solid ${THEME.mc.stoneLight}`,
                    overflow: "hidden",
                    position: "relative",
                    minHeight: 0,
                  }}
                >
                  {hasMcPov ? (
                    <OffthreadVideo
                      src={staticFile("clips/minecraft_pov.mp4")}
                      muted
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    <Placeholder
                      label="INSERT MINECRAFT POV RECORDING"
                      accent={THEME.mc.xpGreen}
                    />
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Caption below panels */}
        <div
          style={{
            opacity: watchOpacity,
            position: "absolute",
            bottom: 62,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
            pointerEvents: "none",
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
            <span style={{ color: THEME.accent }}>Cerebras/Gemma plans in text</span>
            <span>·</span>
            <span>JARVIS-VLA or Mineflayer acts in-world</span>
            <span>·</span>
            <span style={{ color: THEME.mc.xpGreen }}>verifier checks progress</span>
          </div>
        </div>
      </AbsoluteFill>
    </SceneFade>
  );
};
