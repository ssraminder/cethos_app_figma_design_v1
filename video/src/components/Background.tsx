import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import { COLORS } from "../constants";

const PARTICLE_COUNT = 40;

type Particle = {
  x: number;
  y: number;
  size: number;
  speed: number;
  opacity: number;
  delay: number;
};

// Deterministic pseudo-random using seed
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

const particles: Particle[] = Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
  x: seededRandom(i * 7 + 1) * 100,
  y: seededRandom(i * 13 + 3) * 100,
  size: seededRandom(i * 19 + 5) * 3 + 1,
  speed: seededRandom(i * 23 + 7) * 0.3 + 0.1,
  opacity: seededRandom(i * 29 + 11) * 0.3 + 0.05,
  delay: seededRandom(i * 31 + 13) * 200,
}));

// Geometric hexagon grid
const HEXAGONS = 6;

export const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const globalOpacity = interpolate(
    frame,
    [0, 30, durationInFrames - 30, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill>
      {/* Gradient background */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at 50% 40%, ${COLORS.navyLight} 0%, ${COLORS.navy} 70%)`,
        }}
      />

      {/* Subtle geometric hexagons */}
      <AbsoluteFill style={{ opacity: globalOpacity * 0.08 }}>
        {Array.from({ length: HEXAGONS }, (_, i) => {
          const cx = 20 + (i % 3) * 30;
          const cy = 25 + Math.floor(i / 3) * 50;
          const rotation = interpolate(frame, [0, 900], [0, 60 + i * 15], {
            extrapolateRight: "clamp",
          });
          const scale = 1 + Math.sin((frame + i * 40) * 0.01) * 0.1;

          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: `${cx}%`,
                top: `${cy}%`,
                width: 200 + i * 40,
                height: 200 + i * 40,
                border: `1px solid ${COLORS.gold}`,
                borderRadius: "10%",
                transform: `translate(-50%, -50%) rotate(${rotation}deg) scale(${scale})`,
                opacity: 0.4,
              }}
            />
          );
        })}
      </AbsoluteFill>

      {/* Floating particles */}
      <AbsoluteFill style={{ opacity: globalOpacity }}>
        {particles.map((p, i) => {
          const yOffset = ((frame + p.delay) * p.speed) % 120 - 10;
          const xWobble = Math.sin((frame + p.delay) * 0.02) * 2;
          const pulse = interpolate(
            Math.sin((frame + p.delay) * 0.03),
            [-1, 1],
            [0.5, 1]
          );

          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: `${p.x + xWobble}%`,
                top: `${p.y - yOffset}%`,
                width: p.size,
                height: p.size,
                borderRadius: "50%",
                backgroundColor: i % 3 === 0 ? COLORS.gold : COLORS.white,
                opacity: p.opacity * pulse,
              }}
            />
          );
        })}
      </AbsoluteFill>

      {/* Subtle top/bottom vignette */}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(to bottom, rgba(10,22,40,0.6) 0%, transparent 20%, transparent 80%, rgba(10,22,40,0.6) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};
