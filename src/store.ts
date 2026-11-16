import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { type HSL, normalizeHsl } from './lib/color';
import { type SpaceId, convert, fromHex } from './lib/spaces';

export type Swatch = {
  id: string;
  /** Hue, saturation and lightness, read in the store's current colour space. */
  hsl: HSL;
  /**
   * The numbers this swatch had in other colour spaces it has been shown in. Switching to
   * one of them restores those numbers exactly, so toggling spaces never drifts. Cleared
   * as soon as the colour is edited, since they no longer describe it.
   */
  memo?: Partial<Record<SpaceId, HSL>>;
};
export type Scale = { id: string; name: string; swatches: Swatch[] };
export type Selection = { scaleId: string; swatchId: string } | null;
export type Axis = 'h' | 's' | 'l';

export const MAX_SWATCHES = 12;

const newId = () => crypto.randomUUID();

export const seedScales = (): Scale[] => [
  {
    id: newId(),
    name: 'Blue',
    swatches: (
      [
        [212, 95, 92],
        [214, 90, 79],
        [217, 86, 64],
        [220, 82, 50],
        [223, 78, 36],
        [226, 72, 22],
      ] as const
    ).map(([h, s, l]) => ({ id: newId(), hsl: { h, s, l } })),
  },
];

/** What undo restores: the colours and the space their numbers are read in. */
type Snapshot = { scales: Scale[]; space: SpaceId };
const UNDO_LIMIT = 100;

type State = {
  /** The colour space every swatch's numbers are read in. */
  space: SpaceId;
  scales: Scale[];
  selection: Selection;
  /** Which axis control is being dragged. Orbit is disabled while this is set. */
  dragging: Axis | null;
  /** Earlier states of the colours and colour space, oldest first. Not saved. */
  past: Snapshot[];
  /** Steps back to before the last change. A whole drag counts as one change. */
  undo: () => void;
  /** Switches colour space, re-expressing every swatch so it keeps its colour. */
  setSpace: (space: SpaceId) => void;
  select: (selection: Selection) => void;
  setDragging: (axis: Axis | null) => void;
  /** Duplicates the selected swatch (or the last one), nudges lightness, selects it. */
  addSwatch: (scaleId: string) => void;
  removeSwatch: (scaleId: string, swatchId: string) => void;
  /** Patches the selected swatch. Wraps h, clamps s and l, rounds to whole numbers. */
  updateSelected: (patch: Partial<HSL>) => void;
  /** Returns false (and changes nothing) if `text` is not a valid hex. */
  setHex: (scaleId: string, swatchId: string, text: string) => boolean;
};

const mapSwatch = (
  scales: Scale[],
  scaleId: string,
  swatchId: string,
  fn: (hsl: HSL) => HSL,
): Scale[] =>
  scales.map((sc) =>
    sc.id !== scaleId
      ? sc
      : {
          ...sc,
          swatches: sc.swatches.map((sw) => {
            if (sw.id !== swatchId) return sw;
            const hsl = normalizeHsl(fn(sw.hsl));
            const same = hsl.h === sw.hsl.h && hsl.s === sw.hsl.s && hsl.l === sw.hsl.l;
            // An edit: the numbers remembered from other spaces no longer apply.
            return same ? sw : { id: sw.id, hsl };
          }),
        },
  );

export const useStore = create<State>()(
  persist(
    (set, get) => {
      /** True once the drag in progress has recorded its undo step. */
      let dragRecorded = false;
      /**
       * Applies a change to the colours or the space, remembering the state before it for
       * undo. Changes that leave everything as it was are not remembered, and a drag, which
       * arrives as many small changes, is remembered once.
       */
      const record = (next: Partial<State>) => {
        const state = get();
        const before: Snapshot = { scales: state.scales, space: state.space };
        const after: Snapshot = {
          scales: next.scales ?? state.scales,
          space: next.space ?? state.space,
        };
        const changed = JSON.stringify(before) !== JSON.stringify(after);
        const remember = changed && !(state.dragging !== null && dragRecorded);
        if (changed && state.dragging !== null) dragRecorded = true;
        set({
          ...next,
          past: remember ? [...state.past, before].slice(-UNDO_LIMIT) : state.past,
        });
      };

      return {
      space: 'hsl',
      past: [],

      undo: () => {
        const { past, selection } = get();
        const last = past[past.length - 1];
        if (!last) return;
        const exists =
          selection &&
          last.scales.some(
            (sc) => sc.id === selection.scaleId && sc.swatches.some((sw) => sw.id === selection.swatchId),
          );
        set({
          scales: last.scales,
          space: last.space,
          past: past.slice(0, -1),
          selection: exists ? selection : null,
        });
      },

      scales: seedScales(),
      selection: null,
      dragging: null,

      setSpace: (next) => {
        const { space, scales } = get();
        if (next === space) return;
        record({
          space: next,
          scales: scales.map((sc) => ({
            ...sc,
            swatches: sc.swatches.map((sw) => ({
              id: sw.id,
              hsl: sw.memo?.[next] ?? convert(space, next, sw.hsl),
              memo: { ...sw.memo, [space]: sw.hsl },
            })),
          })),
        });
      },

      select: (selection) => set({ selection }),
      setDragging: (dragging) => {
        dragRecorded = false;
        set({ dragging });
      },

      addSwatch: (scaleId) => {
        const { scales, selection } = get();
        const scale = scales.find((sc) => sc.id === scaleId);
        if (!scale || scale.swatches.length >= MAX_SWATCHES) return;
        const source =
          (selection?.scaleId === scaleId &&
            scale.swatches.find((sw) => sw.id === selection.swatchId)) ||
          scale.swatches[scale.swatches.length - 1];
        const base = source?.hsl ?? { h: 215, s: 85, l: 50 };
        // Nudge so the new point is not hidden behind its source.
        // Step darker in 8s to the first free lightness, then lighter if none is left.
        const taken = (l: number) =>
          scale.swatches.some(
            (sw) => sw.hsl.h === base.h && sw.hsl.s === base.s && sw.hsl.l === l,
          );
        const candidates = [];
        for (let l = base.l - 8; l >= 0; l -= 8) candidates.push(l);
        for (let l = base.l + 8; l <= 100; l += 8) candidates.push(l);
        const l = candidates.find((c) => !taken(c)) ?? base.l;
        const swatch: Swatch = { id: newId(), hsl: normalizeHsl({ ...base, l }) };
        record({
          scales: scales.map((sc) =>
            sc.id === scaleId ? { ...sc, swatches: [...sc.swatches, swatch] } : sc,
          ),
          selection: { scaleId, swatchId: swatch.id },
        });
      },

      removeSwatch: (scaleId, swatchId) => {
        const { scales, selection } = get();
        record({
          scales: scales.map((sc) =>
            sc.id === scaleId
              ? { ...sc, swatches: sc.swatches.filter((sw) => sw.id !== swatchId) }
              : sc,
          ),
          selection: selection?.swatchId === swatchId ? null : selection,
        });
      },

      updateSelected: (patch) => {
        const { scales, selection } = get();
        if (!selection) return;
        record({
          scales: mapSwatch(scales, selection.scaleId, selection.swatchId, (hsl) => ({
            ...hsl,
            ...patch,
          })),
        });
      },

      setHex: (scaleId, swatchId, text) => {
        const { scales, space } = get();
        const current = scales
          .find((sc) => sc.id === scaleId)
          ?.swatches.find((sw) => sw.id === swatchId);
        if (!current) return false;
        const next = fromHex(space, text, current.hsl);
        if (!next) return false;
        record({ scales: mapSwatch(scales, scaleId, swatchId, () => next) });
        return true;
      },
      };
    },
    {
      name: 'visual-hsl:v1',
      version: 2,
      // Version 1 kept a differently shaped memo; drop it rather than misread it.
      migrate: (persisted) => {
        const state = persisted as { scales?: Scale[] };
        state.scales?.forEach((sc) => sc.swatches.forEach((sw) => delete sw.memo));
        return state;
      },
      partialize: (state) => ({ scales: state.scales, space: state.space }),
    },
  ),
);

/** The selected swatch, or null. */
export function selectedSwatch(state: Pick<State, 'scales' | 'selection'>): Swatch | null {
  const { scales, selection } = state;
  if (!selection) return null;
  return (
    scales
      .find((sc) => sc.id === selection.scaleId)
      ?.swatches.find((sw) => sw.id === selection.swatchId) ?? null
  );
}
