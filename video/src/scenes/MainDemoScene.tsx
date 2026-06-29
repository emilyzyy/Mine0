import React from "react";
import {
  AbsoluteFill,
  interpolate,
  OffthreadVideo,
  staticFile,
  Easing,
  useCurrentFrame,
} from "remotion";
import { THEME, SCENE_DURATIONS } from "../theme";
import { SceneFade } from "../components/SceneFade";
import { Placeholder } from "../components/Placeholder";

const D = SCENE_DURATIONS.mainDemo; // 480 frames

interface Props {
  hasUiTree: boolean;
  hasMcPov: boolean;
  hasSideBySide: boolean;
}

export const MainDemoScene: React.FC<Props> = ({
  hasUiTree,
  hasMcPov,
  hasSideBySide,
}) => {
  const frame = useCurrentFrame();

  const headerOpacity = interpolate(frame, [8, 28], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const panelOpacity = interpolate(frame, [18, 45], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.quad),
  });

  const overlayOpacity = interpolate(frame, [70, 95], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Live indicator pulse
  const livePulse = interpolate(
    Math.sin((frame / 20) * Math.PI),
    [-1, 1],
    [0.5, 1]
  );

  return (
    <SceneFade durationInFrames={D}>
      <AbsoluteFill style={{ display: "flex", flexDirection: "column" }}>
        {/* Top header bar */}
        <div
          style={{
            opacity: headerOpacity,
            padding: "28px 60px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <div>
            <span
              style={{
                fontFamily: THEME.fontMono,
                fontSize: 16,
                color: THEME.accent,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
              — live demo
            </span>
            <div
              style={{
                fontSize: 42,
                fontWeight: 700,
                color: THEME.text,
                lineHeight: 1.1,
                marginTop: 4,
              }}
            >
              The decision tree is alive
              <br />
              <span style={{ color: THEME.accent }}>while the agent acts</span>
            </div>
          </div>

          {/* Live indicator */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "rgba(34,197,94,0.1)",
              border: "1px solid rgba(34,197,94,0.3)",
              borderRadius: 24,
              padding: "10px 20px",
            }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: THEME.accent3,
                opacity: livePulse,
              }}
            />
            <span
              style={{
                fontFamily: THEME.fontMono,
                fontSize: 16,
                color: THEME.accent3,
                letterSpacing: "0.05em",
              }}
            >
              RUNNING
            </span>
          </div>
        </div>

        {/* Main video area */}
        <div
          style={{
            flex: 1,
            padding: "8px 60px 16px",
            opacity: panelOpacity,
            display: "flex",
            gap: 16,
            minHeight: 0,
          }}
        >
          {hasSideBySide ? (
            /* Single combined recording */
            <div
              style={{
                flex: 1,
                borderRadius: 12,
                overflow: "hidden",
                border: `1px solid ${THEME.bgCardBorder}`,
                position: "relative",
              }}
            >
              <OffthreadVideo
                src={staticFile("clips/side_by_side.mp4")}
                muted
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </div>
          ) : (
            /* Side-by-side panels */
            <>
              {/* Left — UI / decision tree */}
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  minWidth: 0,
                }}
              >
                <PanelLabel
                  text="Planner / Memory / Verifier"
                  color={THEME.accent2}
                  opacity={overlayOpacity}
                />
                <div
                  style={{
                    flex: 1,
                    borderRadius: 12,
                    overflow: "hidden",
                    border: `1px solid ${THEME.accent2}44`,
                    position: "relative",
                    minHeight: 0,
                  }}
                >
                  {hasUiTree ? (
                    <OffthreadVideo
                      src={staticFile("clips/ui_tree.mp4")}
                      muted
                      style={{ width: "100%", height: "100%", objectFit: "contain" }}
                    />
                  ) : (
                    <Placeholder
                      label="INSERT UI DECISION TREE RECORDING"
                      accent={THEME.accent2}
                    />
                  )}
                </div>
              </div>

              {/* Right — Minecraft POV */}
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  minWidth: 0,
                }}
              >
                <PanelLabel
                  text="Minecraft Execution"
                  color={THEME.accent3}
                  opacity={overlayOpacity}
                />
                <div
                  style={{
                    flex: 1,
                    borderRadius: 12,
                    overflow: "hidden",
                    border: `1px solid ${THEME.accent3}44`,
                    position: "relative",
                    minHeight: 0,
                  }}
                >
                  {hasMcPov ? (
                    <OffthreadVideo
                      src={staticFile("clips/minecraft_pov.mp4")}
                      muted
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <Placeholder
                      label="INSERT MINECRAFT POV RECORDING"
                      accent={THEME.accent3}
                    />
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Bottom overlay caption */}
        <div
          style={{
            opacity: overlayOpacity,
            padding: "0 60px 28px",
            display: "flex",
            alignItems: "center",
            gap: 16,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              flex: 1,
              height: 1,
              background: `linear-gradient(90deg, ${THEME.accent}44, transparent)`,
            }}
          />
          <div
            style={{
              fontFamily: THEME.fontMono,
              fontSize: 17,
              color: THEME.textMuted,
              whiteSpace: "nowrap",
            }}
          >
            Cerebras/Gemma plans in text &nbsp;·&nbsp; JARVIS-VLA or Mineflayer acts in-world
          </div>
          <div
            style={{
              flex: 1,
              height: 1,
              background: `linear-gradient(90deg, transparent, ${THEME.accent}44)`,
            }}
          />
        </div>
      </AbsoluteFill>
    </SceneFade>
  );
};

const PanelLabel: React.FC<{
  text: string;
  color: string;
  opacity: number;
}> = ({ text, color, opacity }) => (
  <div
    style={{
      opacity,
      display: "flex",
      alignItems: "center",
      gap: 8,
      flexShrink: 0,
    }}
  >
    <div
      style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: color,
      }}
    />
    <span
      style={{
        fontFamily: THEME.fontMono,
        fontSize: 15,
        color: color,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
      }}
    >
      {text}
    </span>
  </div>
);
