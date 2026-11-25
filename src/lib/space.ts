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

/**
 * Cylindrical coordinates `[angle in radians, world radius, world y]`, the form colours
 * are animated in so that a change of hue swings around the axis rather than cutting
 * through it.
 */
export type Cylindrical = [number, number, number];

/** Where an sRGB colour sits in a space, in cylindrical coordinates (unrounded). */
export function rgbToCylinder(space: SpaceId, rgb: [number, number, number]): Cylindrical {
  const { h, radius, l } = spaceOf(space).place(rgb);
  return [hueToAngle(h), radius * R, lightnessToY(l)];
}

export function toCylinder([x, y, z]: Vec3): Cylindrical {
  return [Math.atan2(z, x), Math.hypot(x, z), y];
}

/** Point `t` (0–1) of the way between two cylindrical positions, by the shorter turn. */
export function lerpCylinder(a: Cylindrical, b: Cylindrical, t: number): Vec3 {
  let turn = (b[0] - a[0]) % (2 * Math.PI);
  if (turn > Math.PI) turn -= 2 * Math.PI;
  else if (turn < -Math.PI) turn += 2 * Math.PI;
  const angle = a[0] + turn * t;
  const radius = a[1] + (b[1] - a[1]) * t;
  return [radius * Math.cos(angle), a[2] + (b[2] - a[2]) * t, radius * Math.sin(angle)];
}

export function hslToPosition(hsl: HSL, space: SpaceId = 'hsl'): Vec3 {
  const e = effective(space, hsl);
  return polar(e.h, spaceOf(space).radius(e) * R, lightnessToY(e.l));
}
