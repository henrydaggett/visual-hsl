import { type HSL, formatHsl, hslToRgb, normalizeHsl, parseHexRgb, rgbToHsl } from './color';
import { MAX_CHROMA, hsluvToRgb, maxChroma, rgbToHsluv } from './hsluv';

/**
 * Colour spaces. Each one reads a swatch's three numbers (hue, saturation, lightness) in
 * its own way. Everything that turns those numbers into a colour or a position goes
 * through here.
 */
export type SpaceId = 'hsl' | 'hsluv';

type RGB = [number, number, number];

type ColourSpace = {
  id: SpaceId;
  label: string;
  toRgb: (hsl: HSL) => RGB;
  /** Greys keep `previous`'s hue, and black/white its saturation too. */
  fromRgb: (rgb: RGB, previous?: HSL) => HSL;
  /**
   * Where saturation 100 lies at this hue and lightness, as a share of the cylinder's
   * radius. 1 everywhere for HSL; for HSLuv it is the edge of the sRGB gamut, so the
   * colours form a lumpy solid inside the cylinder.
   */
  reach: (h: number, l: number) => number;
  format: (hsl: HSL) => string;
};

export const SPACES: ColourSpace[] = [
  {
    id: 'hsl',
    label: 'HSL',
    toRgb: hslToRgb,
    fromRgb: (rgb, previous) => rgbToHsl(...rgb, previous),
    reach: () => 1,
    format: formatHsl,
  },
  {
    id: 'hsluv',
    label: 'HSLuv',
    toRgb: ({ h, s, l }) => hsluvToRgb(h, s, l),
    fromRgb: (rgb, previous) => {
      const { h, s, l } = rgbToHsluv(...rgb);
      const grey = Math.max(...rgb) - Math.min(...rgb) < 1e-9;
      const flat = grey && (rgb[0] === 0 || rgb[0] === 1);
      return normalizeHsl({
        h: grey ? (previous?.h ?? 0) : h,
        s: flat ? (previous?.s ?? 0) : grey ? 0 : s,
        l,
      });
    },
    reach: (h, l) => maxChroma(l, h) / MAX_CHROMA,
    format: ({ h, s, l }) => `hsluv(${h}, ${s}%, ${l}%)`,
  },
];

export const spaceOf = (id: SpaceId): ColourSpace => SPACES.find((sp) => sp.id === id) ?? SPACES[0];

export const toRgb = (space: SpaceId, hsl: HSL): RGB => spaceOf(space).toRgb(hsl);

export function toHex(space: SpaceId, hsl: HSL): string {
  return (
    '#' +
    toRgb(space, hsl)
      .map((c) => Math.round(c * 255).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

export const formatIn = (space: SpaceId, hsl: HSL): string => spaceOf(space).format(hsl);

/** A typed hex as this space's numbers, or null if it is not a valid hex. */
export function fromHex(space: SpaceId, text: string, previous?: HSL): HSL | null {
  const rgb = parseHexRgb(text);
  return rgb ? spaceOf(space).fromRgb(rgb, previous) : null;
}

/** The same colour expressed in another space (rounded to that space's whole numbers). */
export function convert(from: SpaceId, to: SpaceId, hsl: HSL): HSL {
  return from === to ? hsl : spaceOf(to).fromRgb(toRgb(from, hsl), hsl);
}
