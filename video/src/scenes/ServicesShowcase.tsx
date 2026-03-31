import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from "remotion";
import { COLORS } from "../constants";
import { FONT_FAMILY } from "../fonts";

const SERVICES = [
  { label: "Business Translation", icon: "📄" },
  { label: "Life Sciences &\nLinguistic Validation", icon: "🔬" },
  { label: "Technical Translation", icon: "⚙️" },
  { label: "Notary Public", icon: "✦" },
];

export const ServicesShowcase: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Title
  const titleSpring = spring({
    frame,
    fps,
    delay: 5,
    config: { damping: 200 },
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        fontFamily: FONT_FAMILY,
      }}
    >
      {/* Section title */}
      <div
        style={{
          position: "absolute",
          top: 180,
          textAlign: "center",
          opacity: interpolate(titleSpring, [0, 1], [0, 1]),
          transform: `translateY(${interpolate(titleSpring, [0, 1], [20, 0])}px)`,
        }}
      >
        <div
          style={{
            fontSize: 28,
            fontWeight: 300,
            color: COLORS.grayLight,
            letterSpacing: 6,
            textTransform: "uppercase",
          }}
        >
          Our Services
        </div>
      </div>

      {/* Service cards row */}
      <div
        style={{
          display: "flex",
          gap: 40,
          alignItems: "stretch",
          marginTop: 40,
        }}
      >
        {SERVICES.map((service, i) => {
          const cardSpring = spring({
            frame,
            fps,
            delay: 15 + i * 12,
            config: { damping: 20, stiffness: 200 },
          });
          const cardOpacity = interpolate(cardSpring, [0, 1], [0, 1]);
          const cardY = interpolate(cardSpring, [0, 1], [60, 0]);
          const cardScale = interpolate(cardSpring, [0, 1], [0.8, 1]);

          // Subtle hover-like glow per card
          const glowPhase = Math.sin((frame - i * 10) * 0.04);
          const borderOpacity = interpolate(glowPhase, [-1, 1], [0.2, 0.5]);

          return (
            <div
              key={i}
              style={{
                width: 340,
                padding: "48px 32px",
                borderRadius: 16,
                backgroundColor: `${COLORS.navyLight}CC`,
                border: `1px solid ${COLORS.gold}${Math.round(borderOpacity * 255)
                  .toString(16)
                  .padStart(2, "0")}`,
                opacity: cardOpacity,
                transform: `translateY(${cardY}px) scale(${cardScale})`,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                textAlign: "center",
                gap: 20,
                boxShadow: `0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 ${COLORS.gold}15`,
              }}
            >
              {/* Icon */}
              <div
                style={{
                  fontSize: service.icon === "✦" ? 40 : 48,
                  color: service.icon === "✦" ? COLORS.gold : undefined,
                }}
              >
                {service.icon}
              </div>

              {/* Gold accent line */}
              <div
                style={{
                  width: 40,
                  height: 2,
                  backgroundColor: COLORS.gold,
                  opacity: 0.6,
                }}
              />

              {/* Label */}
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 600,
                  color: COLORS.white,
                  lineHeight: 1.3,
                  letterSpacing: 1,
                  whiteSpace: "pre-line",
                }}
              >
                {service.label}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
