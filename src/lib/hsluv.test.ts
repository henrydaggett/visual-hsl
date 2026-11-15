import { Hsluv } from 'hsluv';
import { describe, expect, it } from 'vitest';
import { MAX_CHROMA, hsluvToRgb, maxChroma, rgbToHsluv } from './hsluv';
import { convert, fromHex, toHex } from './spaces';

/** The reference implementation (hsluv.org). */
function reference(h: number, s: number, l: number) {
  const c = new Hsluv();
  c.hsluv_h = h;
  c.hsluv_s = s;
  c.hsluv_l = l;
  c.hsluvToRgb();
  return [c.rgb_r, c.rgb_g, c.rgb_b];
}

describe('hsluv', () => {
  it('matches the reference implementation', () => {
    for (let h = 0; h < 360; h += 13)
      for (let s = 0; s <= 100; s += 20)
        for (let l = 3; l <= 97; l += 7) {
          const ours = hsluvToRgb(h, s, l);
          const theirs = reference(h, s, l);
          for (let i = 0; i < 3; i++) expect(ours[i]).toBeCloseTo(theirs[i], 6);
        }
  });

  it('converts known colours', () => {
    const red = rgbToHsluv(1, 0, 0);
    expect(red.h).toBeCloseTo(12.177, 2);
    expect(red.s).toBeCloseTo(100, 3);
    expect(red.l).toBeCloseTo(53.237, 2);
    expect(toHex('hsluv', { h: 12, s: 100, l: 53 })).toMatch(/^#F[0-9A-F]0[0-9A-F]0[0-9A-F]$/);
  });

  it('round-trips rgb through hsluv', () => {
    for (const rgb of [[0.2, 0.4, 0.9], [0.9, 0.1, 0.3], [0.1, 0.7, 0.2], [0.5, 0.5, 0.45]]) {
      const { h, s, l } = rgbToHsluv(rgb[0], rgb[1], rgb[2]);
      const back = hsluvToRgb(h, s, l);
      for (let i = 0; i < 3; i++) expect(back[i]).toBeCloseTo(rgb[i], 6);
    }
  });

  it('keeps every sRGB colour inside the cylinder', () => {
    let max = 0;
    for (let h = 0; h < 360; h += 1) for (let l = 1; l < 100; l += 1) max = Math.max(max, maxChroma(l, h));
    expect(max).toBeLessThanOrEqual(MAX_CHROMA);
    expect(max).toBeGreaterThan(MAX_CHROMA * 0.95);
  });

  it('keeps the previous hue for greys typed as hex', () => {
    expect(fromHex('hsluv', '#808080', { h: 250, s: 80, l: 40 })).toEqual({ h: 250, s: 0, l: 54 });
    expect(fromHex('hsluv', '#000', { h: 250, s: 80, l: 40 })).toEqual({ h: 250, s: 80, l: 0 });
  });

  it('converts between spaces to within a whisker of the same colour', () => {
    const hsl = { h: 217, s: 86, l: 64 };
    const a = toHex('hsl', hsl);
    const b = toHex('hsluv', convert('hsl', 'hsluv', hsl));
    for (let i = 1; i < 7; i += 2)
      expect(Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16))).toBeLessThanOrEqual(4);
  });
});
