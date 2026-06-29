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

const D = SCENE_DURATIONS.decisionTree; // 360 frames

// Hexagonal cycle layout centered at (960, 460), radius 240
const CX = 960;
const CY = 460;
const R = 240;

interface NodeDef {
  label: string;
  sublabel: string;
  color: string;
}

const NODES: NodeDef[] = [
  { label: "scan environment",    sublabel: "perceive world state",       color: THEME.accent   },
  { label: "choose next subtask", sublabel: "Gemma picks the next goal",  color: THEME.accent2  },
  { label: "execute action",      sublabel: "executor acts in Minecraft", color: THEME.accent3  },
  { label: "verify outcome",      sublabel: "verifier checks progress",   color: THEME.warn     },
  { label: "update memory",       sublabel: "prevent repeated failures",  color: THEME.accent   },
  { label: "replan",              sublabel: "if stalled, change strategy",color: THEME.accent2  },
];

function nodePos(i: number) {
  // Start at top (90°), clockwise
  const angle = (Math.PI / 2) - (i / NODES.length) * Math.PI * 2;
  return {
    x: CX + R * Math.cos(angle),
    y: CY - R * Math.sin(angle),
  };
}

// SVG line length between two points (for dash animation)
function lineLen(x1: number, y1: number, x2: number, y2: number) {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

export const DecisionTreeScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Each node appears with a stagger of 32 frames starting at frame 20
  const nodeAppearStart = 20;
  const nodeStagger = 32;

  // Lines start drawing after all nodes are visible (frame 220)
  const linesStart = 215;

  // Caption
  const captionOpacity = interpolate(frame, [270, 295], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const positions = NODES.map((_, i) => nodePos(i));

  return (
    <SceneFade durationInFrames={D}>
      <AbsoluteFill>
        {/* Section label */}
        <div
          style={{
            position: "absolute",
            top: 54,
            left: 100,
            fontFamily: THEME.fontMono,
            fontSize: 17,
            color: THEME.accent,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            opacity: interpolate(frame, [5, 22], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          — decision loop
        </div>

        {/* Heading */}
        <div
          style={{
            position: "absolute",
            top: 88,
            left: 100,
            fontSize: 48,
            fontWeight: 700,
            color: THEME.text,
            letterSpacing: "-0.02em",
            opacity: interpolate(frame, [8, 30], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          Gemma 4 on Cerebras expands the goal
          <br />
          <span style={{ color: THEME.accent }}>into live subtasks</span>
        </div>

        {/* SVG graph */}
        <svg
          style={{ position: "absolute", inset: 0 }}
          width={1920}
          height={1080}
        >
          <defs>
            {NODES.map((n, i) => (
              <marker
                key={i}
                id={`arrow-${i}`}
                markerWidth="8"
                markerHeight="8"
                refX="6"
                refY="3"
                orient="auto"
              >
                <path d="M0,0 L0,6 L8,3 z" fill={n.color} opacity={0.7} />
              </marker>
            ))}
          </defs>

          {/* Connection lines — draw after nodes appear */}
          {NODES.map((_, i) => {
            const from = positions[i];
            const to = positions[(i + 1) % NODES.length];
            const len = lineLen(from.x, from.y, to.x, to.y);
            const drawProgress = interpolate(
              frame,
              [linesStart + i * 12, linesStart + i * 12 + 30],
              [0, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.quad) }
            );
            const dashOffset = len * (1 - drawProgress);
            return (
              <line
                key={i}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={NODES[i].color}
                strokeWidth={2}
                opacity={0.5}
                strokeDasharray={len}
                strokeDashoffset={dashOffset}
                markerEnd={drawProgress > 0.9 ? `url(#arrow-${i})` : undefined}
              />
            );
          })}

          {/* Node circles */}
          {NODES.map((node, i) => {
            const pos = positions[i];
            const startFrame = nodeAppearStart + i * nodeStagger;
            const scale = spring({
              fps,
              frame: Math.max(0, frame - startFrame),
              config: { stiffness: 65, damping: 13 },
              durationInFrames: 28,
              from: 0,
              to: 1,
            });
            const opacity = interpolate(frame, [startFrame, startFrame + 12], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });

            return (
              <g key={i} opacity={opacity}>
                {/* Glow ring */}
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={46 * scale}
                  fill={node.color}
                  opacity={0.07}
                />
                {/* Main circle */}
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={36 * scale}
                  fill={THEME.bgCard}
                  stroke={node.color}
                  strokeWidth={2}
                />
                {/* Label */}
                <text
                  x={pos.x}
                  y={pos.y - 55 * scale}
                  textAnchor="middle"
                  fill={node.color}
                  fontSize={17}
                  fontFamily={THEME.fontMono}
                  opacity={scale}
                >
                  {node.label}
                </text>
                <text
                  x={pos.x}
                  y={pos.y + 68 * scale}
                  textAnchor="middle"
                  fill={THEME.textDim}
                  fontSize={13}
                  fontFamily={THEME.fontMono}
                  opacity={scale}
                >
                  {node.sublabel}
                </text>
                {/* Number dot */}
                <text
                  x={pos.x}
                  y={pos.y + 7}
                  textAnchor="middle"
                  fill={node.color}
                  fontSize={22}
                  fontFamily={THEME.fontSans}
                  fontWeight="700"
                >
                  {i + 1}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Caption bar */}
        <div
          style={{
            position: "absolute",
            bottom: 60,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
            opacity: captionOpacity,
          }}
        >
          <div
            style={{
              background: "rgba(0,0,0,0.6)",
              border: `1px solid ${THEME.accent}33`,
              borderRadius: 32,
              padding: "14px 40px",
              fontFamily: THEME.fontSans,
              fontSize: 22,
              color: THEME.textMuted,
              letterSpacing: "0.01em",
            }}
          >
            Gemma 4 on Cerebras expands the goal into live subtasks.&nbsp;
            <span style={{ color: THEME.accent }}>
              The loop runs until the objective is complete or stall is detected.
            </span>
          </div>
        </div>
      </AbsoluteFill>
    </SceneFade>
  );
};
