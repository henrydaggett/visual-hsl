import { type OrthographicCamera, Vector3 } from 'three';

/**
 * Bridge between the 3D scene and the SVG controls overlay.
 *
 * The scene calls `publishView` once per rendered frame (after OrbitControls has
 * updated the camera). The overlay subscribes with `subscribeFrame` and redraws in
 * the callback, so the two never drift apart by a frame.
 *
 * Screen coordinates are CSS pixels relative to the top-left of the stage element
 * (the canvas and the overlay cover the same box).
 */
export type View = {
  camera: OrthographicCamera;
  width: number;
  height: number;
};

let view: View | null = null;
const listeners = new Set<(view: View) => void>();

export function publishView(camera: OrthographicCamera, width: number, height: number) {
  view = { camera, width, height };
  listeners.forEach((fn) => fn(view!));
}

export function getView(): View | null {
  return view;
}

export function subscribeFrame(fn: (view: View) => void): () => void {
  listeners.add(fn);
  if (view) fn(view);
  return () => void listeners.delete(fn);
}

const tmp = new Vector3();

export function worldToScreen(v: View, x: number, y: number, z: number) {
  tmp.set(x, y, z).project(v.camera);
  return { x: ((tmp.x + 1) / 2) * v.width, y: ((1 - tmp.y) / 2) * v.height };
}

/** Screen pixels per world unit (orthographic, so it is the same everywhere). */
export const pixelsPerUnit = (v: View) => v.camera.zoom;

/**
 * The ray under a screen point. Orthographic: every ray shares the camera's forward
 * direction, only the origin changes.
 */
export function screenToRay(v: View, sx: number, sy: number) {
  const origin = new Vector3((sx / v.width) * 2 - 1, 1 - (sy / v.height) * 2, -1).unproject(
    v.camera,
  );
  const direction = v.camera.getWorldDirection(new Vector3());
  return { origin, direction };
}
