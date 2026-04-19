/** WCAG-style contrast vs black (#000). Used for Concept C contrast-wrap (PREVIEW_CONCEPT_C). */

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.replace("#", "").trim();
  if (h.length === 3) {
    return {
      r: parseInt(h[0] + h[0], 16),
      g: parseInt(h[1] + h[1], 16),
      b: parseInt(h[2] + h[2], 16),
    };
  }
  if (h.length === 6) {
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }
  return null;
}

function luminance(r: number, g: number, b: number): number {
  const srgb = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

/** Contrast ratio of `hex` foreground on #000 background. */
export function contrastOnBlack(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 21;
  const L1 = luminance(rgb.r, rgb.g, rgb.b) + 0.05;
  const L2 = 0.05;
  return L1 / L2;
}

export function needsContrastWrapOnBlack(hex: string, min = 4.5): boolean {
  return contrastOnBlack(hex) < min;
}
