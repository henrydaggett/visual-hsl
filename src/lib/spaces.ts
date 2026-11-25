import { type HSL, formatHsl, hslToRgb, normalizeHsl, parseHexRgb, rgbHue, rgbToHsl } from './color';
import { MAX_CHROMA, hsluvToRgb, maxChroma as hsluvMaxChroma, rgbToHsluv } from './hsluv';
import {
  CHROMA_FULL,
  CHROMA_WALL,
  maxChroma as oklchMaxChroma,
  oklchToRgb,
  rgbToOklch,
} from './oklch';

/**
 * Colour spaces. A swatch is three whole numbers: `h` (0–359) around the cylinder, `l`
 * (0–100) up it, and `s` (0–100) out from the axis. Each space reads them in its own way.
 * Everything that turns those numbers into a colour, a position or a label goes through
 * here.
 */
export type SpaceId = 'hsl' | 'hsv' | 'hsluv' | 'oklch';

type RGB = [number, number, number];

/**
 * Where a colour sits in a space, unrounded: hue in degrees, distance from the axis as a
 * share of the cylinder's radius, and lightness 0–100. Used to animate between spaces,
 * where rounding to whole numbers would make colours visibly snap to a grid.
 */
export type Place = { h: number; radius: number; l: number };

type ColourSpace = {
  id: SpaceId;
  label: string;
  toRgb: (hsl: HSL) => RGB;
  /** Greys keep `previous`'s hue, and colours with no saturation of their own keep its `s`. */
  fromRgb: (rgb: RGB, previous?: HSL) => HSL;
  /**
   * Largest `s` that is a real colour at this hue and lightness. 100 where `s` is a
   * percentage of what is possible (HSL, HSV, HSLuv); the gamut edge where `s` is an
   * absolute amount (OKLCH chroma).
   */
  maxS: (h: number, l: number) => number;
  /** Distance from the axis, as a share of the cylinder's radius. */
  radius: (hsl: HSL) => number;
  /** Where an sRGB colour sits in this space, unrounded. */
  place: (rgb: RGB) => Place;
  format: (hsl: HSL) => string;
  /** How the middle value reads on its scale. */
  sLabel: (s: number) => string;
  /** Index of this space's colour function in the volume shader (Shell.tsx). */
  shader: number;
  /** Fog density multiplier: spaces whose solid is smaller than the cylinder get more. */
  density: number;
};

const grey = (rgb: RGB) => Math.max(...rgb) - Math.min(...rgb) < 1e-9;

/** HSV to sRGB, all in 0–1 except h in degrees. */
function hsvToRgb(h: number, s: number, v: number): RGB {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [f(5), f(3), f(1)];
}

export const SPACES: ColourSpace[] = [
  {
    id: 'hsl',
    label: 'HSL',
    toRgb: hslToRgb,
    fromRgb: (rgb, previous) => rgbToHsl(...rgb, previous),
    maxS: () => 100,
    radius: ({ s }) => s / 100,
    place: ([r, g, b]) => {
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const l = (max + min) / 2;
      const d = max - min;
      const radius = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
      return { h: rgbHue(r, g, b), radius, l: l * 100 };
    },
    format: formatHsl,
    sLabel: String,
    shader: 0,
    density: 1,
  },
  {
    id: 'hsv',
    label: 'HSV',
    toRgb: ({ h, s, l }) => hsvToRgb(h, s / 100, l / 100),
    fromRgb: (rgb, previous) => {
      const max = Math.max(...rgb);
      const d = max - Math.min(...rgb);
      // Hue is the same angle in HSL and HSV, so borrow it from there.
      const h = d === 0 ? (previous?.h ?? 0) : rgbToHsl(...rgb).h;
      // Black has no saturation of its own.
      const s = max === 0 ? (previous?.s ?? 0) : (d / max) * 100;
      return normalizeHsl({ h, s, l: max * 100 });
    },
    maxS: () => 100,
    radius: ({ s }) => s / 100,
    place: ([r, g, b]) => {
      const max = Math.max(r, g, b);
      const d = max - Math.min(r, g, b);
      return { h: rgbHue(r, g, b), radius: max === 0 ? 0 : d / max, l: max * 100 };
    },
    format: ({ h, s, l }) => `hsv(${h}, ${s}%, ${l}%)`,
    sLabel: String,
    shader: 2,
    density: 1,
  },
  {
    id: 'hsluv',
    label: 'HSLuv',
    toRgb: ({ h, s, l }) => hsluvToRgb(h, s, l),
    fromRgb: (rgb, previous) => {
      const { h, s, l } = rgbToHsluv(...rgb);
      const isGrey = grey(rgb);
      const flat = isGrey && (rgb[0] === 0 || rgb[0] === 1);
      return normalizeHsl({
        h: isGrey ? (previous?.h ?? 0) : h,
        s: flat ? (previous?.s ?? 0) : isGrey ? 0 : s,
        l,
      });
    },
    maxS: () => 100,
    // Radius is CIELUV chroma, so the colours form a lumpy solid inside the cylinder.
    radius: ({ h, s, l }) => ((s / 100) * hsluvMaxChroma(l, h)) / MAX_CHROMA,
    place: (rgb) => {
      const { h, s, l } = rgbToHsluv(...rgb);
      return { h, radius: ((s / 100) * hsluvMaxChroma(l, h)) / MAX_CHROMA, l };
    },
    format: ({ h, s, l }) => `hsluv(${h}, ${s}%, ${l}%)`,
    sLabel: String,
    shader: 1,
    density: 1.7,
  },
  {
    id: 'oklch',
    label: 'OKLCH',
    // `l` is lightness in percent; `s` is chroma as a percentage of 0.4, as in CSS.
    toRgb: ({ h, s, l }) => oklchToRgb(l / 100, (s / 100) * CHROMA_FULL, h),
    fromRgb: (rgb, previous) => {
      const { L, C, h } = rgbToOklch(...rgb);
      const isGrey = grey(rgb);
      const flat = isGrey && (rgb[0] === 0 || rgb[0] === 1);
      return normalizeHsl({
        h: isGrey ? (previous?.h ?? 0) : h,
        s: flat ? (previous?.s ?? 0) : isGrey ? 0 : (C / CHROMA_FULL) * 100,
        l: L * 100,
      });
    },
    maxS: (h, l) => (oklchMaxChroma(l / 100, h) / CHROMA_FULL) * 100,
    radius: ({ s }) => ((s / 100) * CHROMA_FULL) / CHROMA_WALL,
    place: (rgb) => {
      const { L, C, h } = rgbToOklch(...rgb);
      return { h, radius: C / CHROMA_WALL, l: L * 100 };
    },
    format: ({ h, s, l }) => `oklch(${l}% ${chroma(s)} ${h})`,
    sLabel: (s) => chroma(s),
    shader: 3,
    density: 1.7,
  },
];

/** Chroma for a whole-number percentage of 0.4, the way CSS writes it. */
function chroma(s: number): string {
  return ((s / 100) * CHROMA_FULL).toFixed(3).replace(/0$/, '');
}

export const spaceOf = (id: SpaceId): ColourSpace => SPACES.find((sp) => sp.id === id) ?? SPACES[0];

/**
 * The numbers as they are actually shown. In OKLCH a swatch can hold more chroma than
 * exists at its current hue and lightness (after dragging either of those); it is drawn
 * at the gamut edge, and gets its chroma back if it is moved to where that fits again.
 */
export function effective(space: SpaceId, hsl: HSL): HSL {
  const max = spaceOf(space).maxS(hsl.h, hsl.l);
  return hsl.s <= max ? hsl : { ...hsl, s: Math.floor(max) };
}

export const toRgb = (space: SpaceId, hsl: HSL): RGB => spaceOf(space).toRgb(effective(space, hsl));

export function toHex(space: SpaceId, hsl: HSL): string {
  return (
    '#' +
    toRgb(space, hsl)
      .map((c) => Math.round(c * 255).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

export const formatIn = (space: SpaceId, hsl: HSL): string =>
  spaceOf(space).format(effective(space, hsl));

/** A typed hex as this space's numbers, or null if it is not a valid hex. */
export function fromHex(space: SpaceId, text: string, previous?: HSL): HSL | null {
  const rgb = parseHexRgb(text);
  return rgb ? spaceOf(space).fromRgb(rgb, previous) : null;
}

/** The same colour expressed in another space (rounded to that space's whole numbers). */
export function convert(from: SpaceId, to: SpaceId, hsl: HSL): HSL {
  return from === to ? hsl : spaceOf(to).fromRgb(toRgb(from, hsl), hsl);
}
