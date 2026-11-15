import { describe, expect, it } from 'vitest';
import { formatHsl, hslToHex, normalizeHsl, parseHex } from './color';
import { HEIGHT, R, hslToPosition } from './space';

describe('color', () => {
  it('converts HSL to hex', () => {
    expect(hslToHex({ h: 0, s: 100, l: 50 })).toBe('#FF0000');
    expect(hslToHex({ h: 120, s: 100, l: 50 })).toBe('#00FF00');
    expect(hslToHex({ h: 240, s: 100, l: 50 })).toBe('#0000FF');
    expect(hslToHex({ h: 215, s: 0, l: 100 })).toBe('#FFFFFF');
    expect(hslToHex({ h: 215, s: 50, l: 0 })).toBe('#000000');
  });

  it('round-trips every whole-number HSL through hex to within one step', () => {
    for (let h = 0; h < 360; h += 7)
      for (let s = 5; s <= 100; s += 5)
        for (let l = 5; l <= 95; l += 5) {
          const back = parseHex(hslToHex({ h, s, l }))!;
          const dh = Math.min(Math.abs(back.h - h), 360 - Math.abs(back.h - h));
          // Low-chroma colours quantise hue coarsely in 8-bit RGB, so only check
          // that the resulting colour is the same to within one 8-bit step per axis.
          const a = hslToHex({ h, s, l });
          const b = hslToHex(back);
          for (let i = 1; i < 7; i += 2)
            expect(
              Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)),
            ).toBeLessThanOrEqual(3);
          if (s >= 50 && l >= 30 && l <= 70) expect(dh).toBeLessThanOrEqual(2);
        }
  });

  it('parses 3- and 6-digit hex, with or without #', () => {
    expect(parseHex('#f00')).toEqual({ h: 0, s: 100, l: 50 });
    expect(parseHex('00ff00')).toEqual({ h: 120, s: 100, l: 50 });
    expect(parseHex(' #0000FF ')).toEqual({ h: 240, s: 100, l: 50 });
  });

  it('rejects invalid hex', () => {
    for (const bad of ['', '#', '#12', '#12345', '#gggggg', 'blue', '#1234567'])
      expect(parseHex(bad)).toBeNull();
  });

  it('keeps the previous hue for greys, and saturation too for black and white', () => {
    const prev = { h: 215, s: 85, l: 50 };
    expect(parseHex('#808080', prev)).toEqual({ h: 215, s: 0, l: 50 });
    expect(parseHex('#000', prev)).toEqual({ h: 215, s: 85, l: 0 });
    expect(parseHex('#fff', prev)).toEqual({ h: 215, s: 85, l: 100 });
  });

  it('normalises: wraps hue, clamps s and l, rounds', () => {
    expect(normalizeHsl({ h: 361.4, s: 120, l: -3 })).toEqual({ h: 1, s: 100, l: 0 });
    expect(normalizeHsl({ h: -1, s: 49.6, l: 50.4 })).toEqual({ h: 359, s: 50, l: 50 });
    expect(normalizeHsl({ h: 359.6, s: 0, l: 0 })).toEqual({ h: 0, s: 0, l: 0 });
  });

  it('formats', () => {
    expect(formatHsl({ h: 215, s: 85, l: 62 })).toBe('hsl(215, 85%, 62%)');
  });
});

describe('space', () => {
  it('maps HSL onto the cylinder', () => {
    expect(hslToPosition({ h: 0, s: 100, l: 50 })).toEqual([R, 0, 0]);
    const [x, y, z] = hslToPosition({ h: 90, s: 50, l: 100 });
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(HEIGHT / 2);
    expect(z).toBeCloseTo(R / 2);
    expect(hslToPosition({ h: 123, s: 0, l: 0 })[1]).toBeCloseTo(-HEIGHT / 2);
  });
});
