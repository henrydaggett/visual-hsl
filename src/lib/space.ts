import type { HSL } from './color';
import { type SpaceId, spaceOf } from './spaces';

/**
 * The one place that maps HSL onto the cylinder. World units, Y up, cylinder centred
 * on the origin. Nothing else may hard-code this mapping.
 */
export const R = 1;
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

/** World radius at which saturation 100 lies, for this hue and lightness. */
export const reachRadius = (space: SpaceId, h: number, l: number) => spaceOf(space).reach(h, l) * R;

export function hslToPosition({ h, s, l }: HSL, space: SpaceId = 'hsl'): Vec3 {
  return polar(h, (s / 100) * reachRadius(space, h, l), lightnessToY(l));
}
