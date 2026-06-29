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

const D = SCENE_DURATIONS.closedLoop; // 300 frames

interface CardDef {
  title: string;
  description: string;
  color: string;
  icon: string;
}

const CARDS: CardDef[] = [
  {
    title: "Planner Agent",
    description: "Decomposes the objective into an ordered subtask queue using Cerebras/Gemma.",
    color: THEME.accent2,
    icon: "◈",
  },
  {
    title: "Executor Backend",
    description: "Acts in Minecraft — JARVIS-VLA for embodied visual control, Mineflayer for reliable scripted control.",
    color: THEME.accent3,
    icon: "◉",
  },
  {
    title: "Verifier Agent",
    description: "Checks whether the subgoal succeeded. Issues tags: repetitive_action_loop, blocked, placement_failure.",
    color: THEME.warn,
    icon: "◎",
  },
  {
    title: "Memory Agent",
    description: "Records failures and prevents the same strategy from repeating in future planning cycles.",
    color: THEME.accent,
    icon: "◐",
  },
];

export const ClosedLoopScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headerOpacity = interpolate(frame, [5, 22], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Cards stagger in starting at frame 30, every 45 frames
  const cardStagger = 45;
  const cardStart = 28;

  // Loop arrow connecting card 4 back to card 1 appears at frame 220
  const loopArrowOpacity = interpolate(frame, [220, 245], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Caption
  const captionOpacity = interpolate(frame, [255, 278], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Animated cycle highlight — which card is "active" right now
  const cyclePos = frame >= 200
    ? ((frame - 200) / 38) % CARDS.length
    : -1;

  return (
    <SceneFade durationInFrames={D}>
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 120px",
        }}
      >
        {/* Header */}
        <div
          style={{
            opacity: headerOpacity,
            textAlign: "center",
            marginBottom: 60,
          }}
        >
          <div
            style={{
              fontFamily: THEME.fontMono,
              fontSize: 16,
              color: THEME.accent,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              marginBottom: 12,
            }}
          >
            — closed loop
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
            Plan&nbsp;
            <span style={{ color: THEME.accent2 }}>→</span>
            &nbsp;Act&nbsp;
            <span style={{ color: THEME.accent3 }}>→</span>
            &nbsp;Verify&nbsp;
            <span style={{ color: THEME.warn }}>→</span>
            &nbsp;Remember&nbsp;
            <span style={{ color: THEME.accent }}>→</span>
            &nbsp;Replan
          </div>
        </div>

        {/* Cards row */}
        <div
          style={{
            display: "flex",
            alignItems: "stretch",
            gap: 0,
            width: "100%",
          }}
        >
          {CARDS.map((card, i) => {
            const startF = cardStart + i * cardStagger;
            const s = spring({
              fps,
              frame: Math.max(0, frame - startF),
              config: { stiffness: 60, damping: 14 },
              durationInFrames: 30,
              from: 0,
              to: 1,
            });
            const cardOpacity = interpolate(frame, [startF, startF + 12], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });

            const isActive = cyclePos >= 0 && Math.floor(cyclePos) === i;
            const activeGlow = isActive ? 0.18 : 0.06;

            return (
              <React.Fragment key={i}>
                {i > 0 && (
                  /* Arrow between cards */
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      opacity: interpolate(
                        frame,
                        [cardStart + i * cardStagger - 10, cardStart + i * cardStagger + 20],
                        [0, 1],
                        { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
                      ),
                      flexShrink: 0,
                    }}
                  >
                    <div
                      style={{
                        width: 36,
                        height: 2,
                        background: `linear-gradient(90deg, ${CARDS[i - 1].color}66, ${card.color}66)`,
                      }}
                    />
                    <div style={{ color: card.color, fontSize: 20, opacity: 0.7 }}>▶</div>
                  </div>
                )}
                <div
                  style={{
                    flex: 1,
                    opacity: cardOpacity,
                    transform: `translateY(${(1 - s) * 30}px)`,
                    background: `rgba(${card.color === THEME.accent2
                      ? "124,58,237"
                      : card.color === THEME.accent3
                      ? "34,197,94"
                      : card.color === THEME.warn
                      ? "245,158,11"
                      : "34,211,238"
                    }, ${activeGlow})`,
                    border: `1px solid ${card.color}${isActive ? "88" : "33"}`,
                    borderRadius: 16,
                    padding: "28px 24px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                    transition: "none",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 32,
                        color: card.color,
                        opacity: 0.9,
                      }}
                    >
                      {card.icon}
                    </span>
                    <span
                      style={{
                        fontFamily: THEME.fontSans,
                        fontWeight: 700,
                        fontSize: 22,
                        color: card.color,
                      }}
                    >
                      {card.title}
                    </span>
                  </div>
                  <div
                    style={{
                      fontFamily: THEME.fontSans,
                      fontSize: 15,
                      color: THEME.textMuted,
                      lineHeight: 1.5,
                    }}
                  >
                    {card.description}
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </div>

        {/* Loop arrow: Memory → Planner */}
        <div
          style={{
            opacity: loopArrowOpacity,
            marginTop: 20,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div
            style={{
              width: 120,
              height: 2,
              background: `linear-gradient(90deg, ${THEME.accent}66, transparent)`,
            }}
          />
          <div
            style={{
              fontFamily: THEME.fontMono,
              fontSize: 14,
              color: THEME.textDim,
              letterSpacing: "0.06em",
            }}
          >
            ↺&nbsp; loops back to Planner Agent
          </div>
          <div
            style={{
              flex: 1,
              height: 2,
              background: `linear-gradient(90deg, transparent, ${THEME.accent}66)`,
            }}
          />
        </div>

        {/* Caption */}
        <div
          style={{
            opacity: captionOpacity,
            marginTop: 32,
            textAlign: "center",
            fontFamily: THEME.fontSans,
            fontSize: 21,
            color: THEME.textMuted,
            lineHeight: 1.4,
          }}
        >
          Mine0 closes the loop:&nbsp;
          <span style={{ color: THEME.text }}>
            plan → act → verify → remember → replan.
          </span>
        </div>
      </AbsoluteFill>
    </SceneFade>
  );
};
