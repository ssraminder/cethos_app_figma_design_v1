// Apply a diagonal text watermark (e.g. "DRAFT") to every page of a PDF.
// Pure JS via pdf-lib — works in Deno edge runtime.

import { PDFDocument, StandardFonts, degrees, rgb } from "https://esm.sh/pdf-lib@1.17.1";

export type WatermarkOpts = {
  text?: string;
  /** 0..1 (alpha). Default 0.18. */
  opacity?: number;
  /** Diagonal rotation in degrees. Default -45 (bottom-left → top-right). */
  rotation?: number;
  /** Hex color string ("#RRGGBB"). Default soft red ("#dc2626"). */
  colorHex?: string;
};

export async function applyDiagonalWatermark(
  pdfBytes: Uint8Array,
  opts: WatermarkOpts = {},
): Promise<Uint8Array> {
  const text = opts.text ?? "DRAFT";
  const opacity = opts.opacity ?? 0.18;
  const rotation = opts.rotation ?? -45;
  const { r, g, b } = hexToRgb(opts.colorHex ?? "#dc2626");

  const pdf = await PDFDocument.load(pdfBytes);
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);

  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();
    // Size the text so it spans roughly the full diagonal of the page.
    // pdf-lib measures text in font units; pick a size proportional to
    // the smaller page dimension so portrait + landscape both look right.
    const diagonal = Math.sqrt(width * width + height * height);
    const fontSize = Math.min(diagonal / (text.length * 0.45), Math.min(width, height) * 0.6);

    const textWidth = font.widthOfTextAtSize(text, fontSize);
    const textHeight = font.heightAtSize(fontSize);

    // Center the text on the page, then rotate around that center.
    const x = (width - textWidth) / 2;
    const y = (height - textHeight) / 2;

    page.drawText(text, {
      x,
      y,
      size: fontSize,
      font,
      color: rgb(r, g, b),
      opacity,
      rotate: degrees(rotation),
    });
  }

  return await pdf.save();
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = hex.replace(/^#/, "");
  if (m.length !== 6) return { r: 0.86, g: 0.15, b: 0.15 };
  const r = parseInt(m.slice(0, 2), 16) / 255;
  const g = parseInt(m.slice(2, 4), 16) / 255;
  const b = parseInt(m.slice(4, 6), 16) / 255;
  return { r, g, b };
}
