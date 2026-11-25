import type { HSL } from './color';
import { type SpaceId, effective, spaceOf } from './spaces';

/**
 * The one place that maps HSL onto the cylinder. World units, Y up, cylinder centred
 * on the origin. Nothing else may hard-code this mapping.
 */
export const R = 1.05;
export const HEIGHT = 2.4;

export type Vec3 = [number, number, number];

/** Lightness 0–100 → world y (black at the bottom, white at the top). */
export const lightnessToY = (l: number) => (l / 100 - 0.5) * HEIGHT;

/** Hue in degrees → angle around the Y axis in radians. */
export const hueToAngle = (h: number) => (h * Math.PI) / 180;

/** Point at hue `h` (degrees), world radius `radius`, world height `y`. */
export function polar(h: number, radius: number, y: number): Vec3 {
  const a = hueToAngle(h);
  return [radius * Math.cos(a), y, radius * Math.sin(a)];
}

/** World radius of the most saturated real colour at this hue and lightness. */
export function reachRadius(space: SpaceId, h: number, l: number) {
  const sp = spaceOf(space);
  return sp.radius({ h, s: sp.maxS(h, l), l }) * R;
}

export function hslToPosition(hsl: HSL, space: SpaceId = 'hsl'): Vec3 {
  const e = effective(space, hsl);
  return polar(e.h, spaceOf(space).radius(e) * R, lightnessToY(e.l));
}
