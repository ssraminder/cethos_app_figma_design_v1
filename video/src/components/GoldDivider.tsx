import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { COLORS } from "../constants";

export const GoldDivider: React.FC<{ delay?: number; width?: number }> = ({
  delay = 20,
  width = 120,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame,
    fps,
    delay,
    config: { damping: 200 },
  });

  const lineWidth = interpolate(progress, [0, 1], [0, width]);

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: 12,
        marginTop: 20,
        marginBottom: 20,
      }}
    >
      <div
        style={{
          height: 2,
          width: lineWidth,
          background: `linear-gradient(to right, transparent, ${COLORS.gold})`,
        }}
      />
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          backgroundColor: COLORS.gold,
          opacity: progress,
          transform: `scale(${progress})`,
        }}
      />
      <div
        style={{
          height: 2,
          width: lineWidth,
          background: `linear-gradient(to left, transparent, ${COLORS.gold})`,
        }}
      />
    </div>
  );
};
