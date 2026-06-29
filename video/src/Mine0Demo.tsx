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
import { SystemHud } from "./components/SystemHud";

export const Mine0Demo: React.FC<DemoProps> = (props) => {
  return (
    <AbsoluteFill
      style={{
        background: THEME.bg,
        fontFamily: THEME.fontSans,
      }}
    >
      {/* ── Scenes ── */}
      <Sequence from={SCENE_STARTS.title} durationInFrames={SCENE_DURATIONS.title} name="Title">
        <TitleScene />
      </Sequence>

      <Sequence from={SCENE_STARTS.objective} durationInFrames={SCENE_DURATIONS.objective} name="Objective">
        <ObjectiveScene objective={props.objective} />
      </Sequence>

      <Sequence from={SCENE_STARTS.agentCrew} durationInFrames={SCENE_DURATIONS.agentCrew} name="AgentCrew">
        <DecisionTreeScene />
      </Sequence>

      <Sequence from={SCENE_STARTS.mainDemo} durationInFrames={SCENE_DURATIONS.mainDemo} name="MainDemo">
        <MainDemoScene
          hasUiTree={props.hasUiTree}
          hasMcPov={props.hasMcPov}
          hasSideBySide={props.hasSideBySide}
        />
      </Sequence>

      <Sequence from={SCENE_STARTS.useCases} durationInFrames={SCENE_DURATIONS.useCases} name="UseCases">
        <ClosedLoopScene />
      </Sequence>

      <Sequence from={SCENE_STARTS.recovery} durationInFrames={SCENE_DURATIONS.recovery} name="Recovery">
        <RecoveryScene />
      </Sequence>

      <Sequence from={SCENE_STARTS.architecture} durationInFrames={SCENE_DURATIONS.architecture} name="Architecture">
        <ArchitectureScene />
      </Sequence>

      {/* ── Persistent HUD: visible during agent crew → recovery ── */}
      <Sequence
        from={SCENE_STARTS.agentCrew}
        durationInFrames={
          SCENE_DURATIONS.agentCrew +
          SCENE_DURATIONS.mainDemo +
          SCENE_DURATIONS.useCases +
          SCENE_DURATIONS.recovery
        }
        name="SystemHud"
      >
        <SystemHud />
      </Sequence>
    </AbsoluteFill>
  );
};
