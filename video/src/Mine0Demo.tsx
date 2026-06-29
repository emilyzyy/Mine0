import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import type { DemoProps } from "./types";
import { THEME, SCENE_STARTS, SCENE_DURATIONS } from "./theme";
import { TitleScene } from "./scenes/TitleScene";
import { ObjectiveScene } from "./scenes/ObjectiveScene";
import { DecisionTreeScene } from "./scenes/DecisionTreeScene";
import { MainDemoScene } from "./scenes/MainDemoScene";
import { ClosedLoopScene } from "./scenes/ClosedLoopScene";
import { RecoveryScene } from "./scenes/RecoveryScene";
import { ArchitectureScene } from "./scenes/ArchitectureScene";

export const Mine0Demo: React.FC<DemoProps> = (props) => {
  return (
    <AbsoluteFill
      style={{
        background: THEME.bg,
        ...THEME.gridBg,
        fontFamily: THEME.fontSans,
      }}
    >
      <Sequence
        from={SCENE_STARTS.title}
        durationInFrames={SCENE_DURATIONS.title}
        name="Title"
      >
        <TitleScene />
      </Sequence>

      <Sequence
        from={SCENE_STARTS.objective}
        durationInFrames={SCENE_DURATIONS.objective}
        name="Objective"
      >
        <ObjectiveScene objective={props.objective} />
      </Sequence>

      <Sequence
        from={SCENE_STARTS.decisionTree}
        durationInFrames={SCENE_DURATIONS.decisionTree}
        name="DecisionTree"
      >
        <DecisionTreeScene />
      </Sequence>

      <Sequence
        from={SCENE_STARTS.mainDemo}
        durationInFrames={SCENE_DURATIONS.mainDemo}
        name="MainDemo"
      >
        <MainDemoScene
          hasUiTree={props.hasUiTree}
          hasMcPov={props.hasMcPov}
          hasSideBySide={props.hasSideBySide}
        />
      </Sequence>

      <Sequence
        from={SCENE_STARTS.closedLoop}
        durationInFrames={SCENE_DURATIONS.closedLoop}
        name="ClosedLoop"
      >
        <ClosedLoopScene />
      </Sequence>

      <Sequence
        from={SCENE_STARTS.recovery}
        durationInFrames={SCENE_DURATIONS.recovery}
        name="Recovery"
      >
        <RecoveryScene />
      </Sequence>

      <Sequence
        from={SCENE_STARTS.architecture}
        durationInFrames={SCENE_DURATIONS.architecture}
        name="Architecture"
      >
        <ArchitectureScene />
      </Sequence>
    </AbsoluteFill>
  );
};
