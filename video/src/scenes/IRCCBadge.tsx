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

export const IRCCBadge: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Shield entrance
  const shieldSpring = spring({
    frame,
    fps,
    delay: 5,
    config: { damping: 15, stiffness: 100 },
  });
  const shieldScale = interpolate(shieldSpring, [0, 1], [0.4, 1]);
  const shieldOpacity = interpolate(shieldSpring, [0, 1], [0, 1]);

  // Text entrance
  const textSpring = spring({
    frame,
    fps,
    delay: 20,
    config: { damping: 200 },
  });

  // Subtitle
  const subSpring = spring({
    frame,
    fps,
    delay: 35,
    config: { damping: 200 },
  });

  // Rotating glow ring
  const glowRotation = frame * 0.8;
  const glowPulse = interpolate(
    Math.sin(frame * 0.05),
    [-1, 1],
    [0.4, 0.8]
  );

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        fontFamily: FONT_FAMILY,
      }}
    >
      {/* Rotating glow ring behind shield */}
      <div
        style={{
          position: "absolute",
          width: 280,
          height: 280,
          borderRadius: "50%",
          border: `2px solid ${COLORS.gold}`,
          opacity: glowPulse * shieldOpacity,
          transform: `rotate(${glowRotation}deg) scale(${shieldScale})`,
          borderStyle: "dashed",
        }}
      />

      {/* Shield icon */}
      <div
        style={{
          opacity: shieldOpacity,
          transform: `scale(${shieldScale})`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        {/* Shield shape using CSS */}
        <div
          style={{
            width: 160,
            height: 180,
            background: `linear-gradient(135deg, ${COLORS.gold} 0%, ${COLORS.goldDark} 100%)`,
            borderRadius: "10px 10px 80px 80px",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            boxShadow: `0 8px 40px ${COLORS.gold}44, inset 0 2px 0 ${COLORS.goldLight}88`,
            position: "relative",
          }}
        >
          {/* Inner shield */}
          <div
            style={{
              width: 130,
              height: 148,
              border: `2px solid ${COLORS.navy}44`,
              borderRadius: "6px 6px 65px 65px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              gap: 4,
            }}
          >
            {/* Checkmark */}
            <div
              style={{
                fontSize: 52,
                color: COLORS.navy,
                fontWeight: 800,
                lineHeight: 1,
              }}
            >
              ✓
            </div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 800,
                color: COLORS.navy,
                letterSpacing: 2,
                textTransform: "uppercase",
              }}
            >
              IRCC
            </div>
          </div>
        </div>
      </div>

      {/* Badge text */}
      <div
        style={{
          marginTop: 40,
          textAlign: "center",
          opacity: interpolate(textSpring, [0, 1], [0, 1]),
          transform: `translateY(${interpolate(textSpring, [0, 1], [20, 0])}px)`,
        }}
      >
        <div
          style={{
            fontSize: 22,
            fontWeight: 300,
            color: COLORS.grayLight,
            letterSpacing: 4,
            textTransform: "uppercase",
            marginBottom: 12,
          }}
        >
          Officially
        </div>
        <div
          style={{
            fontSize: 48,
            fontWeight: 700,
            color: COLORS.white,
            letterSpacing: 2,
          }}
        >
          IRCC-Accepted
        </div>
      </div>

      <GoldDivider delay={30} width={100} />

      <div
        style={{
          opacity: interpolate(subSpring, [0, 1], [0, 1]),
          transform: `translateY(${interpolate(subSpring, [0, 1], [15, 0])}px)`,
          fontSize: 28,
          fontWeight: 400,
          color: COLORS.goldLight,
          letterSpacing: 3,
        }}
      >
        Certified Translations
      </div>
    </AbsoluteFill>
  );
};
