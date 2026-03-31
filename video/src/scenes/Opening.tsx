import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  Easing,
} from "remotion";
import { COLORS } from "../constants";
import { FONT_FAMILY } from "../fonts";
import { GoldDivider } from "../components/GoldDivider";

export const Opening: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Logo ring animation
  const ringProgress = spring({
    frame,
    fps,
    config: { damping: 15, stiffness: 80 },
  });
  const ringScale = interpolate(ringProgress, [0, 1], [0.3, 1]);
  const ringOpacity = interpolate(ringProgress, [0, 1], [0, 1]);
  const ringRotation = interpolate(ringProgress, [0, 1], [-90, 0]);

  // Logo text reveal
  const logoSpring = spring({
    frame,
    fps,
    delay: 15,
    config: { damping: 200 },
  });
  const logoOpacity = interpolate(logoSpring, [0, 1], [0, 1]);
  const logoY = interpolate(logoSpring, [0, 1], [30, 0]);

  // Tagline
  const taglineSpring = spring({
    frame,
    fps,
    delay: 35,
    config: { damping: 200 },
  });
  const taglineOpacity = interpolate(taglineSpring, [0, 1], [0, 1]);
  const taglineY = interpolate(taglineSpring, [0, 1], [20, 0]);

  // Subtle glow pulse behind logo
  const glowPulse = interpolate(
    Math.sin(frame * 0.05),
    [-1, 1],
    [0.3, 0.6]
  );

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        fontFamily: FONT_FAMILY,
      }}
    >
      {/* Glow behind logo */}
      <div
        style={{
          position: "absolute",
          width: 400,
          height: 400,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${COLORS.gold}33 0%, transparent 70%)`,
          opacity: glowPulse * ringOpacity,
          transform: `scale(${ringScale * 1.5})`,
        }}
      />

      {/* Logo mark — stylized "C" ring */}
      <div
        style={{
          width: 140,
          height: 140,
          borderRadius: "50%",
          border: `4px solid ${COLORS.gold}`,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          opacity: ringOpacity,
          transform: `scale(${ringScale}) rotate(${ringRotation}deg)`,
          boxShadow: `0 0 40px ${COLORS.gold}44`,
        }}
      >
        <span
          style={{
            fontSize: 72,
            fontWeight: 800,
            color: COLORS.gold,
            letterSpacing: -2,
          }}
        >
          C
        </span>
      </div>

      {/* Company name */}
      <div
        style={{
          marginTop: 30,
          opacity: logoOpacity,
          transform: `translateY(${logoY}px)`,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 68,
            fontWeight: 700,
            color: COLORS.white,
            letterSpacing: 8,
            textTransform: "uppercase",
          }}
        >
          Cethos
        </div>
        <div
          style={{
            fontSize: 28,
            fontWeight: 300,
            color: COLORS.grayLight,
            letterSpacing: 14,
            textTransform: "uppercase",
            marginTop: -2,
          }}
        >
          Solutions
        </div>
      </div>

      {/* Divider */}
      <GoldDivider delay={45} width={100} />

      {/* Tagline */}
      <div
        style={{
          opacity: taglineOpacity,
          transform: `translateY(${taglineY}px)`,
          fontSize: 26,
          fontWeight: 400,
          color: COLORS.goldLight,
          letterSpacing: 3,
          fontStyle: "italic",
        }}
      >
        Bridging Languages, Building Trust
      </div>
    </AbsoluteFill>
  );
};
