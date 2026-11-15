import { converter } from 'culori';
import { describe, expect, it } from 'vitest';
import { CHROMA_WALL, maxChroma, oklchToRgb, rgbToOklch } from './oklch';
import { SPACES, convert, effective, formatIn, fromHex, toHex, toRgb } from './spaces';

const refOklch = converter('oklch');
const refRgb = converter('rgb');
const refHsv = converter('hsv');

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const near = (a: string, b: string, steps: number) =>
  channels(a).every((c, i) => Math.abs(c - channels(b)[i]) <= steps);

describe('oklch', () => {
  it('matches the reference implementation', () => {
    for (const [r, g, b] of [[1, 0, 0], [0, 1, 0], [0, 0, 1], [0.2, 0.4, 0.9], [0.8, 0.7, 0.1], [0.3, 0.3, 0.32]]) {
      const ours = rgbToOklch(r, g, b);
      const theirs = refOklch({ mode: 'rgb', r, g, b })!;
      expect(ours.L).toBeCloseTo(theirs.l, 4);
      expect(ours.C).toBeCloseTo(theirs.c, 4);
      expect(ours.h).toBeCloseTo(theirs.h!, 1);
      const back = oklchToRgb(ours.L, ours.C, ours.h);
      [r, g, b].forEach((c, i) => expect(back[i]).toBeCloseTo(c, 4));
    }
    const rgb = refRgb({ mode: 'oklch', l: 0.6, c: 0.12, h: 250 })!;
    const ours = oklchToRgb(0.6, 0.12, 250);
    [rgb.r, rgb.g, rgb.b].forEach((c, i) => expect(ours[i]).toBeCloseTo(c, 4));
  });

  it('finds the gamut edge, and every sRGB colour fits inside the cylinder', () => {
    const red = rgbToOklch(1, 0, 0);
    expect(maxChroma(red.L, red.h)).toBeCloseTo(red.C, 2);
    let max = 0;
    for (let h = 0; h < 360; h += 2) for (let l = 2; l < 100; l += 2) max = Math.max(max, maxChroma(l / 100, h));
    expect(max).toBeLessThanOrEqual(CHROMA_WALL);
    expect(max).toBeGreaterThan(CHROMA_WALL * 0.9);
  });

  it('draws chroma beyond the gamut at its edge, without forgetting it', () => {
    const wild = { h: 250, s: 90, l: 95 };
    const shown = effective('oklch', wild);
    expect(shown.s).toBeLessThan(20);
    expect(toHex('oklch', wild)).toBe(toHex('oklch', shown));
    expect(effective('oklch', { h: 250, s: 30, l: 55 }).s).toBe(30);
  });

  it('formats the way CSS writes it', () => {
    expect(formatIn('oklch', { h: 259, s: 47, l: 62 })).toBe('oklch(62% 0.188 259)');
    expect(formatIn('oklch', { h: 30, s: 25, l: 50 })).toBe('oklch(50% 0.10 30)');
  });
});

describe('hsv', () => {
  it('matches the reference implementation', () => {
    for (const hsl of [{ h: 0, s: 100, l: 100 }, { h: 217, s: 65, l: 95 }, { h: 120, s: 40, l: 30 }, { h: 300, s: 0, l: 50 }]) {
      const ours = toRgb('hsv', hsl);
      const theirs = refRgb({ mode: 'hsv', h: hsl.h, s: hsl.s / 100, v: hsl.l / 100 })!;
      [theirs.r, theirs.g, theirs.b].forEach((c, i) => expect(ours[i]).toBeCloseTo(c, 6));
    }
    const back = fromHex('hsv', '#3366CC')!;
    const theirs = refHsv('#3366CC')!;
    expect(back).toEqual({ h: Math.round(theirs.h!), s: Math.round(theirs.s * 100), l: Math.round(theirs.v * 100) });
  });

  it('keeps hue for greys, and saturation too for black', () => {
    const prev = { h: 200, s: 70, l: 60 };
    expect(fromHex('hsv', '#808080', prev)).toEqual({ h: 200, s: 0, l: 50 });
    expect(fromHex('hsv', '#000', prev)).toEqual({ h: 200, s: 70, l: 0 });
  });
});

describe('spaces', () => {
  it('converts a colour between every pair of spaces to nearly the same hex', () => {
    const start = { h: 217, s: 86, l: 64 };
    const hex = toHex('hsl', start);
    for (const a of SPACES) {
      const inA = convert('hsl', a.id, start);
      expect(near(toHex(a.id, inA), hex, 5)).toBe(true);
      for (const b of SPACES) expect(near(toHex(b.id, convert(a.id, b.id, inA)), hex, 8)).toBe(true);
    }
  });
});
