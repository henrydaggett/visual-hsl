/**
 * h 0–359, s and l 0–100. Whole numbers. These three numbers are the source of truth for a
 * colour and hex is derived. They are read in the current colour space (see spaces.ts).
 */
export type HSL = { h: number; s: number; l: number };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Rounds to whole numbers, wraps hue into 0–359, clamps s and l to 0–100. */
export function normalizeHsl({ h, s, l }: HSL): HSL {
  return {
    h: ((Math.round(h) % 360) + 360) % 360,
    s: clamp(Math.round(s), 0, 100),
    l: clamp(Math.round(l), 0, 100),
  };
}

/** RGB channels in 0–1 (sRGB), ready for three.js. */
export function hslToRgb({ h, s, l }: HSL): [number, number, number] {
  const sat = s / 100;
  const lig = l / 100;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return lig - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}

export function hslToHex(hsl: HSL): string {
  return (
    '#' +
    hslToRgb(hsl)
      .map((c) => Math.round(c * 255).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

export function formatHsl({ h, s, l }: HSL): string {
  return `hsl(${h}, ${s}%, ${l}%)`;
}

/** sRGB channels (0–1) for a 3- or 6-digit hex (optional "#"), or null if invalid. */
export function parseHexRgb(text: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text.trim());
  if (!m) return null;
  const hex = m[1].length === 3 ? m[1].replace(/./g, '$&$&') : m[1];
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
}

/**
 * Whole-number HSL for sRGB channels in 0–1. Greys have no hue, and black/white have no
 * saturation either, so those components are taken from `previous` (the swatch being
 * edited) instead of collapsing to 0.
 */
export function rgbToHsl(r: number, g: number, b: number, previous?: HSL): HSL {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  if (d === 0) {
    const flat = l === 0 || l === 1;
    return normalizeHsl({
      h: previous?.h ?? 0,
      s: flat ? (previous?.s ?? 0) : 0,
      l: l * 100,
    });
  }
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return normalizeHsl({ h: h * 60, s: s * 100, l: l * 100 });
}

/** Hue in degrees (0–360, unrounded) of sRGB channels in 0–1; 0 for greys. */
export function rgbHue(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

/** Parses a hex into whole-number HSL, or null if invalid. See `rgbToHsl` for greys. */
export function parseHex(text: string, previous?: HSL): HSL | null {
  const rgb = parseHexRgb(text);
  return rgb ? rgbToHsl(...rgb, previous) : null;
}
