import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from "remotion";
import { COLORS } from "../constants";
import { FONT_FAMILY } from "../fonts";
import { GoldDivider } from "../components/GoldDivider";

export const CoreOffering: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // "Certified Translation" entrance
  const headingSpring = spring({
    frame,
    fps,
    delay: 5,
    config: { damping: 200 },
  });
  const headingOpacity = interpolate(headingSpring, [0, 1], [0, 1]);
  const headingY = interpolate(headingSpring, [0, 1], [40, 0]);

  // "95+" counter animation
  const counterSpring = spring({
    frame,
    fps,
    delay: 20,
    config: { damping: 200 },
  });
  const counterValue = Math.round(interpolate(counterSpring, [0, 1], [0, 95]));

  // "Languages" label
  const labelSpring = spring({
    frame,
    fps,
    delay: 35,
    config: { damping: 200 },
  });

  // Globe icon rings
  const globeSpring = spring({
    frame,
    fps,
    delay: 10,
    config: { damping: 15, stiffness: 80 },
  });

  // Pulsing glow on the number
  const numGlow = interpolate(
    Math.sin(frame * 0.06),
    [-1, 1],
    [0.6, 1]
  );

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        fontFamily: FONT_FAMILY,
      }}
    >
      {/* Globe illustration — concentric rings */}
      <div
        style={{
          position: "absolute",
          opacity: interpolate(globeSpring, [0, 1], [0, 0.08]),
          transform: `scale(${interpolate(globeSpring, [0, 1], [0.5, 1])})`,
        }}
      >
        {[300, 420, 540].map((size, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              width: size,
              height: size,
              borderRadius: "50%",
              border: `1px solid ${COLORS.gold}`,
              left: -size / 2,
              top: -size / 2,
              transform: `rotate(${frame * (0.2 + i * 0.1)}deg)`,
            }}
          />
        ))}
        {/* Horizontal ellipse */}
        <div
          style={{
            position: "absolute",
            width: 540,
            height: 200,
            borderRadius: "50%",
            border: `1px solid ${COLORS.gold}`,
            left: -270,
            top: -100,
            transform: `rotate(${23 + frame * 0.15}deg)`,
          }}
        />
      </div>

      {/* Heading */}
      <div
        style={{
          textAlign: "center",
          opacity: headingOpacity,
          transform: `translateY(${headingY}px)`,
        }}
      >
        <div
          style={{
            fontSize: 32,
            fontWeight: 300,
            color: COLORS.grayLight,
            letterSpacing: 6,
            textTransform: "uppercase",
            marginBottom: 16,
          }}
        >
          Certified Translation
        </div>
      </div>

      {/* Big number */}
      <div
        style={{
          textAlign: "center",
          opacity: interpolate(counterSpring, [0, 1], [0, 1]),
        }}
      >
        <span
          style={{
            fontSize: 160,
            fontWeight: 800,
            color: COLORS.gold,
            letterSpacing: -4,
            textShadow: `0 0 60px ${COLORS.gold}${Math.round(numGlow * 99)
              .toString()
              .padStart(2, "0")}`,
          }}
        >
          {counterValue}+
        </span>
      </div>

      <GoldDivider delay={30} width={80} />

      {/* "Languages" label */}
      <div
        style={{
          opacity: interpolate(labelSpring, [0, 1], [0, 1]),
          transform: `translateY(${interpolate(labelSpring, [0, 1], [15, 0])}px)`,
          fontSize: 42,
          fontWeight: 600,
          color: COLORS.white,
          letterSpacing: 10,
          textTransform: "uppercase",
        }}
      >
        Languages
      </div>
    </AbsoluteFill>
  );
};
