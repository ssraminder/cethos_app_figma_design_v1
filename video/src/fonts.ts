import { loadFont as loadInter } from "@remotion/google-fonts/Inter";

const { fontFamily: interFamily } = loadInter("normal", {
  weights: ["300", "400", "600", "700", "800"],
  subsets: ["latin"],
});

export const FONT_FAMILY = interFamily;
