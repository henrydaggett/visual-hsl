import { Vector3 } from 'three';
import { hslToPosition } from '../lib/space';
import type { SpaceId } from '../lib/spaces';
import type { Scale, Selection } from '../store';
import type { View } from './projection';

/** World radius of a colour point. */
export const POINT_RADIUS = 0.035;
/** Extra pixels around a point that still count as a hit, and the minimum hit radius. */
const HIT_PADDING = 5;
const MIN_HIT_RADIUS = 14;
const MIN_HIT_RADIUS_TOUCH = 28;

const tmp = new Vector3();

/**
 * The swatch under a stage-relative screen point, or null. Orthographic, so a sphere is
 * exactly a circle of radius `POINT_RADIUS * zoom` on screen and picking can be done in
 * screen space. A direct hit on the nearest sphere wins; otherwise the closest point
 * within the padded radius.
 */
export function pickSwatch(
  view: View,
  scales: Scale[],
  space: SpaceId,
  sx: number,
  sy: number,
  touch = false,
): Selection {
  const radius = POINT_RADIUS * view.camera.zoom;
  const hitRadius = Math.max(radius + HIT_PADDING, touch ? MIN_HIT_RADIUS_TOUCH : MIN_HIT_RADIUS);
  let best: Selection = null;
  let bestScore = Infinity;
  for (const scale of scales) {
    for (const swatch of scale.swatches) {
      const [x, y, z] = hslToPosition(swatch.hsl, space);
      tmp.set(x, y, z).project(view.camera);
      const px = ((tmp.x + 1) / 2) * view.width;
      const py = ((1 - tmp.y) / 2) * view.height;
      const d = Math.hypot(px - sx, py - sy);
      if (d > hitRadius) continue;
      // Direct hits rank by depth (NDC z, smaller is nearer) and always beat near misses.
      const score = d <= radius ? tmp.z - 10 : d;
      if (score < bestScore) {
        bestScore = score;
        best = { scaleId: scale.id, swatchId: swatch.id };
      }
    }
  }
  return best;
}
