import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

interface SceneFadeProps {
  children: React.ReactNode;
  durationInFrames: number;
  fadeInFrames?: number;
  fadeOutFrames?: number;
}

export const SceneFade: React.FC<SceneFadeProps> = ({
  children,
  durationInFrames,
  fadeInFrames = 12,
  fadeOutFrames = 12,
}) => {
  const frame = useCurrentFrame();

  // Build input/output ranges defensively so values are always strictly increasing.
  const fadeOutStart = durationInFrames - fadeOutFrames;
  const inputRange =
    fadeOutFrames === 0
      ? [0, fadeInFrames]
      : [0, fadeInFrames, fadeOutStart, durationInFrames];
  const outputRange =
    fadeOutFrames === 0 ? [0, 1] : [0, 1, 1, 0];

  const opacity = interpolate(frame, inputRange, outputRange, {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ opacity }}>
      {children}
    </AbsoluteFill>
  );
};
