import { Composition } from "remotion";
import { CethosPromo } from "./CethosPromo";
import {
  VIDEO_WIDTH,
  VIDEO_HEIGHT,
  VIDEO_FPS,
  TOTAL_FRAMES,
} from "./constants";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="CethosPromo"
      component={CethosPromo}
      durationInFrames={TOTAL_FRAMES}
      fps={VIDEO_FPS}
      width={VIDEO_WIDTH}
      height={VIDEO_HEIGHT}
    />
  );
};
