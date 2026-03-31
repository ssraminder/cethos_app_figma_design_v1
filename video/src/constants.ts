// Video specs
export const VIDEO_WIDTH = 1920;
export const VIDEO_HEIGHT = 1080;
export const VIDEO_FPS = 30;
export const TOTAL_DURATION_SECONDS = 30;
export const TOTAL_FRAMES = TOTAL_DURATION_SECONDS * VIDEO_FPS; // 900

// Scene durations (in frames) — 5 scenes with 4 transitions
// Each transition is 15 frames (0.5s), overlapping adjacent scenes
export const TRANSITION_DURATION = 15;
export const SCENE_DURATION = 192; // ~6.4s per scene
// Total = 5 * 192 - 4 * 15 = 960 - 60 = 900 frames ✓

// Color palette
export const COLORS = {
  navy: "#0A1628",
  navyLight: "#132244",
  white: "#FFFFFF",
  gold: "#C8A951",
  goldLight: "#E8D48B",
  goldDark: "#9A7B2E",
  gray: "#8B95A5",
  grayLight: "#C5CCD6",
} as const;

// Music timing markers (frame numbers for background music sync)
export const MUSIC_MARKERS = {
  intro: 0, // 0s — soft build
  coreDrop: 192, // ~6.4s — first emphasis beat
  servicesRise: 369, // ~12.3s — energy builds
  irccAccent: 546, // ~18.2s — authority moment
  closingCrescendo: 723, // ~24.1s — final swell
  end: 900, // 30s — fade out
} as const;
