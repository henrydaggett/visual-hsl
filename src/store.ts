import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { type HSL, normalizeHsl, parseHex } from './lib/color';

export type Swatch = { id: string; hsl: HSL };
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

type State = {
  scales: Scale[];
  selection: Selection;
  /** Which axis control is being dragged. Orbit is disabled while this is set. */
  dragging: Axis | null;
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
          swatches: sc.swatches.map((sw) =>
            sw.id !== swatchId ? sw : { ...sw, hsl: normalizeHsl(fn(sw.hsl)) },
          ),
        },
  );

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      scales: seedScales(),
      selection: null,
      dragging: null,

      select: (selection) => set({ selection }),
      setDragging: (dragging) => set({ dragging }),

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
        const l = base.l >= 8 ? base.l - 8 : base.l + 8;
        const swatch: Swatch = { id: newId(), hsl: normalizeHsl({ ...base, l }) };
        set({
          scales: scales.map((sc) =>
            sc.id === scaleId ? { ...sc, swatches: [...sc.swatches, swatch] } : sc,
          ),
          selection: { scaleId, swatchId: swatch.id },
        });
      },

      removeSwatch: (scaleId, swatchId) => {
        const { scales, selection } = get();
        set({
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
        set({
          scales: mapSwatch(scales, selection.scaleId, selection.swatchId, (hsl) => ({
            ...hsl,
            ...patch,
          })),
        });
      },

      setHex: (scaleId, swatchId, text) => {
        const { scales } = get();
        const current = scales
          .find((sc) => sc.id === scaleId)
          ?.swatches.find((sw) => sw.id === swatchId);
        if (!current) return false;
        const next = parseHex(text, current.hsl);
        if (!next) return false;
        set({ scales: mapSwatch(scales, scaleId, swatchId, () => next) });
        return true;
      },
    }),
    {
      name: 'visual-hsl:v1',
      partialize: (state) => ({ scales: state.scales }),
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
