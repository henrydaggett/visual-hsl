import type { SpaceId } from '../lib/spaces';

/**
 * The animation between colour spaces. When the space changes, the old fog fades out into
 * a cloud of colour particles, each particle flies from where its colour sits in the old
 * space to where it sits in the new one, and the new fog fades in. The fog, the particle
 * cloud, the swatch dots and the controls all read the same timeline from here.
 */

export const DURATION = 900;
/** Old fog fades out over [0, FADE_OUT]; new fog fades in over [FADE_IN, DURATION]. */
const FADE_OUT = 150;
const FADE_IN = 750;
/** Colours travel over [TRAVEL_START, TRAVEL_END]. */
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
  /** Opacity of the old space's fog (1 → 0) and the new one's (0 → 1). */
  fogOld: number;
  fogNew: number;
  /** Opacity of the particle cloud. */
  cloud: number;
  /** How far along the journey colours are, 0–1, not yet eased. */
  travel: number;
};

const IDLE: Phase = { active: false, id: 0, from: null, to: null, fogOld: 0, fogNew: 1, cloud: 0, travel: 1 };

const ramp = (t: number, a: number, b: number) => Math.min(1, Math.max(0, (t - a) / (b - a)));

/** The phase `elapsed` milliseconds into an animation. */
export function phaseAt(elapsed: number, morph: Omit<Morph, 'start'>): Phase {
  if (elapsed >= DURATION || elapsed < 0) return IDLE;
  const fogOld = 1 - ramp(elapsed, 0, FADE_OUT);
  const fogNew = ramp(elapsed, FADE_IN, DURATION);
  return {
    active: true,
    id: morph.id,
    from: morph.from,
    to: morph.to,
    fogOld,
    fogNew,
    cloud: Math.min(1 - fogOld, 1 - fogNew),
    travel: ramp(elapsed, TRAVEL_START, TRAVEL_END),
  };
}

export function morphPhase(now = performance.now()): Phase {
  return current ? phaseAt(now - current.start, current) : IDLE;
}

/** Ease in and out (cubic). The particle shader uses the same curve. */
export function ease(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}
