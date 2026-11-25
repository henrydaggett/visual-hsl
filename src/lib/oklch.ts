/**
 * OKLCH: Björn Ottosson's Oklab in cylindrical form. Lightness 0–1, chroma from 0 (grey)
 * to roughly 0.32 for the strongest sRGB colours, hue in degrees.
 */

/** CSS defines 100% chroma as 0.4; a swatch's whole-number `s` is a percentage of this. */
export const CHROMA_FULL = 0.4;
/** Chroma that maps to the cylinder wall. A little above sRGB's largest (≈0.32). */
export const CHROMA_WALL = 0.33;

const toLinear = (c: number) => (c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92);
export const fromLinear = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** Linear sRGB for Oklab lightness `L` (0–1), chroma `C` and hue `h` (degrees). */
export function oklchToLinear(L: number, C: number, h: number): [number, number, number] {
  const hr = (h * Math.PI) / 180;
  const a = C * Math.cos(hr);
  const b = C * Math.sin(hr);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/**
 * Inside sRGB, with a hair of tolerance. Around blue, a line of constant hue dips about
 * 0.0007 below zero in red on its way out to the fully saturated colour; without the
 * tolerance the gamut would appear to end there and pure blue would be unreachable.
 * Colours in that sliver are clipped, which changes them by less than can be seen. The
 * lower bound scales with luminance (about L cubed), because near black every channel is
 * tiny and a fixed allowance would let chroma run far past the real edge.
 */
const inGamut = (rgb: number[], L: number) =>
  rgb.every((c) => c >= -0.02 * L ** 3 && c <= 1.002);

/**
 * Largest chroma inside sRGB at lightness `L` (0–1) and hue `h` (degrees).
 */
export function maxChroma(L: number, h: number): number {
  if (L <= 0 || L >= 1) return 0;
  const STEPS = 80;
  let hi = CHROMA_FULL;
  let lo = 0;
  for (let i = STEPS; i > 0; i--) {
    const c = (CHROMA_FULL * i) / STEPS;
    if (inGamut(oklchToLinear(L, c, h), L)) {
      lo = c;
      break;
    }
    hi = c;
  }
  if (lo === CHROMA_FULL) return lo;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklchToLinear(L, mid, h), L)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** sRGB (0–1 per channel). Chroma beyond the gamut is pulled back to its edge. */
export function oklchToRgb(L: number, C: number, h: number): [number, number, number] {
  const c = Math.min(C, maxChroma(L, h));
  return oklchToLinear(L, c, h).map((v) => Math.min(1, Math.max(0, fromLinear(v)))) as [
    number,
    number,
    number,
  ];
}

/** OKLCH (unrounded) for sRGB channels in 0–1. Greys come back with C = 0 and h = 0. */
export function rgbToOklch(r: number, g: number, b: number): { L: number; C: number; h: number } {
  const R = toLinear(r);
  const G = toLinear(g);
  const B = toLinear(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.hypot(a, bb);
  if (C < 1e-7) return { L, C: 0, h: 0 };
  return { L, C, h: ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360 };
}
