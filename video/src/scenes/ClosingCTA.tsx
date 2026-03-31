import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from "remotion";
import { COLORS } from "../constants";
import { FONT_FAMILY } from "../fonts";

// Calgary skyline silhouette as an SVG path
const CalgarySkyline: React.FC<{ opacity: number }> = ({ opacity }) => (
  <svg
    viewBox="0 0 1920 300"
    style={{
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      opacity,
    }}
  >
    <defs>
      <linearGradient id="skylineGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={COLORS.navyLight} stopOpacity="0.9" />
        <stop offset="100%" stopColor={COLORS.navy} stopOpacity="1" />
      </linearGradient>
    </defs>
    <path
      d="M0,300 L0,240 L80,240 L80,200 L100,200 L100,180 L110,180 L110,200 L130,200 L130,240
         L200,240 L200,220 L220,220 L220,190 L230,190 L230,160 L240,160 L240,130 L250,125 L260,130
         L260,160 L270,160 L270,190 L280,190 L280,220 L300,220 L300,240
         L380,240 L380,210 L400,210 L400,180 L410,180 L410,150 L420,150 L420,120 L430,115
         L440,120 L440,150 L450,150 L450,180 L460,180 L460,210 L480,210 L480,240
         L560,240 L560,220 L580,220 L580,200 L600,200 L600,160 L610,160 L610,140
         L615,130 L620,140 L620,160 L630,160 L630,200 L650,200 L650,220 L670,220 L670,240
         L730,240 L730,200 L750,200 L750,170 L760,170 L760,100 L770,95 L775,60 L780,95
         L790,100 L790,170 L800,170 L800,200 L820,200 L820,240
         L900,240 L900,220 L920,220 L920,180 L935,180 L935,140 L945,140 L945,110
         L950,90 L955,110 L955,140 L965,140 L965,180 L980,180 L980,220 L1000,220 L1000,240
         L1080,240 L1080,210 L1100,210 L1100,170 L1120,170 L1120,150 L1130,145 L1140,150
         L1140,170 L1160,170 L1160,210 L1180,210 L1180,240
         L1260,240 L1260,220 L1280,220 L1280,190 L1300,190 L1300,160 L1310,155 L1320,160
         L1320,190 L1340,190 L1340,220 L1360,220 L1360,240
         L1440,240 L1440,200 L1460,200 L1460,170 L1480,170 L1480,140 L1490,130 L1495,80
         L1500,130 L1510,140 L1510,170 L1530,170 L1530,200 L1550,200 L1550,240
         L1620,240 L1620,220 L1640,220 L1640,200 L1660,200 L1660,220 L1680,220 L1680,240
         L1760,240 L1760,210 L1780,210 L1780,190 L1800,190 L1800,210 L1820,210 L1820,240
         L1920,240 L1920,300 Z"
      fill="url(#skylineGrad)"
    />
    {/* Tower spire accents in gold */}
    <line x1="775" y1="60" x2="775" y2="50" stroke={COLORS.gold} strokeWidth="2" opacity="0.6" />
    <line x1="950" y1="90" x2="950" y2="78" stroke={COLORS.gold} strokeWidth="2" opacity="0.6" />
    <line x1="1495" y1="80" x2="1495" y2="68" stroke={COLORS.gold} strokeWidth="2" opacity="0.6" />
  </svg>
);

export const ClosingCTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // CTA heading
  const ctaSpring = spring({
    frame,
    fps,
    delay: 5,
    config: { damping: 200 },
  });

  // URL / button
  const urlSpring = spring({
    frame,
    fps,
    delay: 25,
    config: { damping: 20, stiffness: 200 },
  });

  // Skyline
  const skylineSpring = spring({
    frame,
    fps,
    delay: 10,
    config: { damping: 200 },
  });
  const skylineY = interpolate(skylineSpring, [0, 1], [80, 0]);

  // Button glow pulse
  const buttonGlow = interpolate(
    Math.sin(frame * 0.08),
    [-1, 1],
    [0.5, 1]
  );

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        fontFamily: FONT_FAMILY,
      }}
    >
      {/* CTA content */}
      <div
        style={{
          textAlign: "center",
          marginTop: -80,
          zIndex: 2,
        }}
      >
        {/* Heading */}
        <div
          style={{
            opacity: interpolate(ctaSpring, [0, 1], [0, 1]),
            transform: `translateY(${interpolate(ctaSpring, [0, 1], [30, 0])}px)`,
            fontSize: 52,
            fontWeight: 700,
            color: COLORS.white,
            letterSpacing: 2,
            marginBottom: 16,
          }}
        >
          Get a Free Quote
        </div>

        {/* Subtext */}
        <div
          style={{
            opacity: interpolate(ctaSpring, [0, 1], [0, 1]),
            fontSize: 22,
            fontWeight: 300,
            color: COLORS.grayLight,
            letterSpacing: 3,
            marginBottom: 40,
          }}
        >
          Fast, Accurate, Certified
        </div>

        {/* URL Button */}
        <div
          style={{
            opacity: interpolate(urlSpring, [0, 1], [0, 1]),
            transform: `scale(${interpolate(urlSpring, [0, 1], [0.8, 1])})`,
          }}
        >
          <div
            style={{
              display: "inline-block",
              padding: "20px 60px",
              borderRadius: 50,
              background: `linear-gradient(135deg, ${COLORS.gold} 0%, ${COLORS.goldDark} 100%)`,
              boxShadow: `0 4px 30px ${COLORS.gold}${Math.round(buttonGlow * 99)
                .toString()
                .padStart(2, "0")}`,
              fontSize: 36,
              fontWeight: 700,
              color: COLORS.navy,
              letterSpacing: 2,
            }}
          >
            cethos.com
          </div>
        </div>
      </div>

      {/* Calgary skyline */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          transform: `translateY(${skylineY}px)`,
        }}
      >
        <CalgarySkyline opacity={interpolate(skylineSpring, [0, 1], [0, 0.5])} />
      </div>

      {/* Bottom bar */}
      <div
        style={{
          position: "absolute",
          bottom: 30,
          fontSize: 16,
          fontWeight: 300,
          color: COLORS.gray,
          letterSpacing: 2,
          opacity: interpolate(skylineSpring, [0, 1], [0, 0.6]),
          zIndex: 3,
        }}
      >
        Calgary, Alberta &nbsp;•&nbsp; Cethos Solutions Inc.
      </div>
    </AbsoluteFill>
  );
};
