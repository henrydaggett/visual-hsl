import type { SpaceId } from '../lib/spaces';

/**
 * The animation between colour spaces. When the space changes, the fog hands over from its
 * formula for the old space to a grid of colours (fogGrid.ts), every colour travels from
 * where it sits in the old space to where it sits in the new one, so the fog itself flows
 * into its new shape, and the fog hands back to the formula for the new space. The fog,
 * the swatch dots and the controls all read the same timeline from here.
 */

export const DURATION = 900;
/** Fog hands over to the grid over [0, GRID_IN], and back over [GRID_OUT, DURATION]. */
const GRID_IN = 100;
const GRID_OUT = 800;
/** Colours travel over [TRAVEL_START, TRAVEL_END], between the two hand-overs. */
const TRAVEL_START = 100;
const TRAVEL_END = 800;

type Morph = { id: number; from: SpaceId; to: SpaceId; start: number };

let current: Morph | null = null;
let count = 0;

const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Starts the animation from one space to another. Replaces any animation in progress. */
export function startMorph(from: SpaceId, to: SpaceId, now = performance.now()) {
  current = from === to || reducedMotion() ? null : { id: ++count, from, to, start: now };
}

export type Phase = {
  /** True while the animation runs. */
  active: boolean;
  /** Changes with every new animation, so per-animation work can be done once. */
  id: number;
  from: SpaceId | null;
  to: SpaceId | null;
  /** The space whose formula the fog uses when it is not drawn from the grid. */
  formula: SpaceId | null;
  /** How much of the fog comes from the grid of moving colours: 0 → 1 → 0. */
  grid: number;
  /** How far along the journey colours are, 0–1, not yet eased. */
  travel: number;
};

const IDLE: Phase = { active: false, id: 0, from: null, to: null, formula: null, grid: 0, travel: 1 };

const ramp = (t: number, a: number, b: number) => Math.min(1, Math.max(0, (t - a) / (b - a)));

/** The phase `elapsed` milliseconds into an animation. */
export function phaseAt(elapsed: number, morph: Omit<Morph, 'start'>): Phase {
  if (elapsed >= DURATION || elapsed < 0) return IDLE;
  return {
    active: true,
    id: morph.id,
    from: morph.from,
    to: morph.to,
    formula: elapsed < DURATION / 2 ? morph.from : morph.to,
    grid: Math.min(ramp(elapsed, 0, GRID_IN), 1 - ramp(elapsed, GRID_OUT, DURATION)),
    travel: ramp(elapsed, TRAVEL_START, TRAVEL_END),
  };
}

export function morphPhase(now = performance.now()): Phase {
  return current ? phaseAt(now - current.start, current) : IDLE;
}

/** Ease in and out (cubic). The splat shader uses the same curve. */
export function ease(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}
