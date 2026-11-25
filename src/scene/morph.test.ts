import { describe, expect, it } from 'vitest';
import { SPACES, fromHex, toRgb } from '../lib/spaces';
import { hslToPosition, lerpCylinder, rgbToCylinder, toCylinder } from '../lib/space';
import { DURATION, ease, phaseAt } from './morph';

describe('placing colours for the animation', () => {
  it('puts a colour where the swatch with those numbers is drawn, in every space', () => {
    for (const hex of ['#5491F2', '#E8452C', '#2BD36A', '#F4E04D', '#6B2C91', '#7F7F7F']) {
      for (const sp of SPACES) {
        const hsl = fromHex(sp.id, hex)!;
        const [x, y, z] = lerpCylinder(rgbToCylinder(sp.id, toRgb(sp.id, hsl)), [0, 0, 0], 0);
        const [px, py, pz] = hslToPosition(hsl, sp.id);
        // Whole-number rounding of the swatch moves it by well under 2% of the cylinder.
        expect(Math.hypot(x - px, y - py, z - pz)).toBeLessThan(0.03);
      }
    }
  });

  it('puts greys on the axis', () => {
    for (const sp of SPACES) expect(rgbToCylinder(sp.id, [0.4, 0.4, 0.4])[1]).toBeCloseTo(0, 6);
  });

  it('turns the shorter way round the axis', () => {
    const half = lerpCylinder([(350 * Math.PI) / 180, 1, 0], [(10 * Math.PI) / 180, 1, 0], 0.5);
    expect(toCylinder(half)[0]).toBeCloseTo(0, 6);
  });
});

describe('timeline', () => {
  const m = { id: 1, from: 'hsl' as const, to: 'oklch' as const };
  it('starts on the old fog, flies, and ends on the new fog', () => {
    expect(phaseAt(0, m)).toMatchObject({ active: true, fogOld: 1, fogNew: 0, cloud: 0, travel: 0 });
    expect(phaseAt(450, m)).toMatchObject({ fogOld: 0, fogNew: 0, cloud: 1, travel: 0.5 });
    expect(phaseAt(DURATION, m)).toMatchObject({ active: false, fogNew: 1, travel: 1 });
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.5)).toBeCloseTo(0.5);
  });
});
