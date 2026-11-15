/**
 * HSLuv: hue, saturation and lightness built on CIELUV. Lightness is perceptual (L*), and
 * saturation is the share of the most chroma that sRGB can show at that hue and lightness.
 * Follows the reference implementation (hsluv.org); checked against it in the tests.
 */

const M = [
  [3.240969941904521, -1.537383177570093, -0.498610760293],
  [-0.96924363628087, 1.87596750150772, 0.041555057407175],
  [0.055630079696993, -0.20397695888897, 1.056971514242878],
];
const M_INV = [
  [0.41239079926595, 0.35758433938387, 0.18048078840183],
  [0.21263900587151, 0.71516867876775, 0.072192315360733],
  [0.019330818715591, 0.11919477979462, 0.95053215224966],
];
export const REF_U = 0.19783000664283;
export const REF_V = 0.46831999493879;
export const KAPPA = 903.2962962;
const EPSILON = 0.0088564516;

/** Chroma that maps to the cylinder wall. A little above sRGB's largest (≈179, at red). */
export const MAX_CHROMA = 180;

const toLinear = (c: number) => (c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92);
const fromLinear = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const lToY = (l: number) => (l <= 8 ? l / KAPPA : ((l + 16) / 116) ** 3);
const yToL = (y: number) => (y <= EPSILON ? y * KAPPA : 116 * Math.cbrt(y) - 16);

/** Largest chroma inside sRGB at lightness `l` (0–100) and hue `h` (degrees). */
export function maxChroma(l: number, h: number): number {
  if (l <= 0 || l >= 100) return 0;
  const hrad = (h * Math.PI) / 180;
  const sin = Math.sin(hrad);
  const cos = Math.cos(hrad);
  const sub1 = (l + 16) ** 3 / 1560896;
  const sub2 = sub1 > EPSILON ? sub1 : l / KAPPA;
  let min = Infinity;
  for (const [m1, m2, m3] of M) {
    for (let t = 0; t < 2; t++) {
      const top1 = (284517 * m1 - 94839 * m3) * sub2;
      const top2 = (838422 * m3 + 769860 * m2 + 731718 * m1) * l * sub2 - 769860 * t * l;
      const bottom = (632260 * m3 - 126452 * m2) * sub2 + 126452 * t;
      // Distance from the origin to this gamut edge along the hue direction.
      const length = top2 / bottom / (sin - (top1 / bottom) * cos);
      if (length >= 0 && length < min) min = length;
    }
  }
  return min;
}

/** sRGB (0–1 per channel) for HSLuv h (degrees), s and l (0–100). */
export function hsluvToRgb(h: number, s: number, l: number): [number, number, number] {
  if (l >= 100) return [1, 1, 1];
  if (l <= 0) return [0, 0, 0];
  const c = (maxChroma(l, h) / 100) * s;
  const hrad = (h * Math.PI) / 180;
  const u = Math.cos(hrad) * c;
  const v = Math.sin(hrad) * c;
  const varU = u / (13 * l) + REF_U;
  const varV = v / (13 * l) + REF_V;
  const y = lToY(l);
  const x = (-9 * y * varU) / ((varU - 4) * varV - varU * varV);
  const z = (9 * y - 15 * varV * y - varV * x) / (3 * varV);
  return M.map(([a, b, cc]) =>
    Math.min(1, Math.max(0, fromLinear(a * x + b * y + cc * z))),
  ) as [number, number, number];
}

/** HSLuv (unrounded) for sRGB channels in 0–1. Greys come back with s = 0 and h = 0. */
export function rgbToHsluv(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const lin = [toLinear(r), toLinear(g), toLinear(b)];
  const [x, y, z] = M_INV.map(([a, bb, c]) => a * lin[0] + bb * lin[1] + c * lin[2]);
  const l = yToL(y);
  if (l <= 1e-8) return { h: 0, s: 0, l: 0 };
  if (l >= 99.9999999) return { h: 0, s: 0, l: 100 };
  const divider = x + 15 * y + 3 * z;
  const u = 13 * l * ((4 * x) / divider - REF_U);
  const v = 13 * l * ((9 * y) / divider - REF_V);
  const c = Math.hypot(u, v);
  if (c < 1e-6) return { h: 0, s: 0, l };
  const h = ((Math.atan2(v, u) * 180) / Math.PI + 360) % 360;
  return { h, s: Math.min(100, (c / maxChroma(l, h)) * 100), l };
}
