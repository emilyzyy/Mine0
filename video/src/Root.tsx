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
  demoAssetMode: "auto",
};

// Remotion's Composition expects ComponentType<Record<string,unknown>>; double-cast to satisfy it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Mine0DemoComp = Mine0Demo as unknown as React.ComponentType<Record<string, unknown>>;

export const Root: React.FC = () => {
  return (
    <Composition
      id="Mine0Demo"
      component={Mine0DemoComp}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={defaultProps}
    />
  );
};
