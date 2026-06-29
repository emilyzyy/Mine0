import React from "react";
import { Composition } from "remotion";
import { Mine0Demo } from "./Mine0Demo";
import type { DemoProps } from "./types";
import { FPS, TOTAL_FRAMES } from "./theme";

const defaultProps: DemoProps = {
  hasUiTree: false,
  hasMcPov: false,
  hasSideBySide: false,
  hasTerminal: false,
  hasLogo: false,
  objective: "Find resources, reason through subtasks, and act in Minecraft.",
};

export const Root: React.FC = () => {
  return (
    <Composition
      id="Mine0Demo"
      component={Mine0Demo}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={defaultProps}
    />
  );
};
