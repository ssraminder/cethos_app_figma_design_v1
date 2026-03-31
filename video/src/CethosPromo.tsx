import { AbsoluteFill } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";

import { Background } from "./components/Background";
import { Opening } from "./scenes/Opening";
import { CoreOffering } from "./scenes/CoreOffering";
import { ServicesShowcase } from "./scenes/ServicesShowcase";
import { IRCCBadge } from "./scenes/IRCCBadge";
import { ClosingCTA } from "./scenes/ClosingCTA";
import { SCENE_DURATION, TRANSITION_DURATION } from "./constants";

export const CethosPromo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#0A1628" }}>
      {/* Persistent animated background behind all scenes */}
      <Background />

      {/* Scene sequence with transitions */}
      <TransitionSeries>
        {/* Scene 1: Opening — Logo reveal */}
        <TransitionSeries.Sequence durationInFrames={SCENE_DURATION}>
          <Opening />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: TRANSITION_DURATION })}
        />

        {/* Scene 2: Core Offering — 95+ Languages */}
        <TransitionSeries.Sequence durationInFrames={SCENE_DURATION}>
          <CoreOffering />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={slide({ direction: "from-right" })}
          timing={linearTiming({ durationInFrames: TRANSITION_DURATION })}
        />

        {/* Scene 3: Services Showcase */}
        <TransitionSeries.Sequence durationInFrames={SCENE_DURATION}>
          <ServicesShowcase />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: TRANSITION_DURATION })}
        />

        {/* Scene 4: IRCC Badge */}
        <TransitionSeries.Sequence durationInFrames={SCENE_DURATION}>
          <IRCCBadge />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={slide({ direction: "from-bottom" })}
          timing={linearTiming({ durationInFrames: TRANSITION_DURATION })}
        />

        {/* Scene 5: Closing CTA */}
        <TransitionSeries.Sequence durationInFrames={SCENE_DURATION}>
          <ClosingCTA />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
