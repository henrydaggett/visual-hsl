import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { OrthographicCamera } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { HEIGHT, R } from '../lib/space';
import { useStore } from '../store';
import { pickSwatch } from './picking';
import { getView, publishView } from './projection';

export const CAMERA_DISTANCE = 10;
/** About 20° above the horizon, as in the sketch. */
export const DEFAULT_ELEVATION = (20 * Math.PI) / 180;
/** Puts the seed blues at the front left, as in the sketch. */
export const DEFAULT_AZIMUTH = (182 * Math.PI) / 180;

const MIN_ZOOM_FACTOR = 0.5;
const MAX_ZOOM_FACTOR = 6;
/** A press only counts as a click if the pointer moved less than this many pixels. */
const CLICK_SLOP = 4;
/** Fingers wobble more than a mouse. */
const TAP_SLOP = 10;

const DEG = Math.PI / 180;
/** The view settles onto these angles when released within SNAP_RANGE of one. */
const SNAP_RANGE = 4 * DEG;
/** Elevation: top, 45° above, straight on, 45° below, underside. */
const POLAR_SNAPS = [0, 45, 90, 135, 180].map((d) => d * DEG);
const AZIMUTH_STEP = 45 * DEG;

/** The snap angle within range of `angle`, or null. */
function snapTarget(angle: number, snaps: number[] | number): number | null {
  const nearest =
    typeof snaps === 'number'
      ? Math.round(angle / snaps) * snaps
      : snaps.reduce((a, b) => (Math.abs(b - angle) < Math.abs(a - angle) ? b : a));
  const d = Math.abs(nearest - angle);
  // Close enough already: leave it, so a settled view costs nothing.
  return d < SNAP_RANGE && d > 1e-4 ? nearest : null;
}

/** Zoom (pixels per world unit) at which the cylinder fills ~58% of the stage height
 *  in the default view, without getting too wide for a narrow stage. */
function defaultZoomFor(width: number, height: number) {
  const viewHeight = HEIGHT * Math.cos(DEFAULT_ELEVATION) + 2 * R * Math.sin(DEFAULT_ELEVATION);
  return Math.max(1, Math.min((0.58 * height) / viewHeight, (0.54 * width) / (2 * R)));
}

/** Camera framing, orbit, the per-frame publish for the overlay, and picking. */
export function Rig({ stage }: { stage: HTMLElement }) {
  const camera = useThree((s) => s.camera) as OrthographicCamera;
  const size = useThree((s) => s.size);
  const canvas = useThree((s) => s.gl.domElement);
  const dragging = useStore((s) => s.dragging);

  const [defaultZoom, setDefaultZoom] = useState(() => defaultZoomFor(size.width, size.height));
  const appliedDefault = useRef<number | null>(null);
  const controls = useRef<OrbitControlsImpl>(null);
  /** True while a rotate or zoom gesture is in progress; snapping waits for release. */
  const interacting = useRef(false);

  // Frame the cylinder on first size; on later resizes keep the user's zoom factor.
  useLayoutEffect(() => {
    const next = defaultZoomFor(size.width, size.height);
    const factor = appliedDefault.current === null ? 1 : camera.zoom / appliedDefault.current;
    camera.zoom = next * Math.min(MAX_ZOOM_FACTOR, Math.max(MIN_ZOOM_FACTOR, factor));
    camera.updateProjectionMatrix();
    appliedDefault.current = next;
    setDefaultZoom(next);
  }, [camera, size.width, size.height]);

  // Runs after OrbitControls' own update (drei registers that at priority -1).
  useFrame(() => {
    // Very gentle snapping: never during a gesture, only once released near a snap angle.
    // The setters go through the controls' damping, so the view eases onto the angle.
    const c = controls.current;
    if (c && !interacting.current && useStore.getState().dragging === null) {
      const polar = snapTarget(c.getPolarAngle(), POLAR_SNAPS);
      if (polar !== null) c.setPolarAngle(polar);
      const azimuth = snapTarget(c.getAzimuthalAngle(), AZIMUTH_STEP);
      if (azimuth !== null) c.setAzimuthalAngle(azimuth);
    }
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    publishView(camera, size.width, size.height);
  });

  // Picking. Done with native listeners on the stage rather than r3f's onClick /
  // onPointerMissed: OrbitControls captures the pointer on the stage, so the browser's
  // `click` is dispatched to the stage and never reaches r3f's listener on the canvas.
  useEffect(() => {
    let down: { x: number; y: number; id: number } | null = null;

    const local = (e: PointerEvent) => {
      const rect = stage.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    // Presses that start on an overlay control belong to that control, not to us.
    const onScene = (e: PointerEvent) => e.target === stage || e.target === canvas;
    const hit = (e: PointerEvent) => {
      const view = getView();
      if (!view) return null;
      const p = local(e);
      return pickSwatch(view, useStore.getState().scales, p.x, p.y, e.pointerType === 'touch');
    };

    const onDown = (e: PointerEvent) => {
      // A second finger means a pinch, which must never end as a tap.
      down = e.button === 0 && e.isPrimary && onScene(e) ? { x: e.clientX, y: e.clientY, id: e.pointerId } : null;
    };
    const onUp = (e: PointerEvent) => {
      const start = down;
      down = null;
      if (!start || start.id !== e.pointerId) return;
      const slop = e.pointerType === 'touch' ? TAP_SLOP : CLICK_SLOP;
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) >= slop) return;
      const state = useStore.getState();
      if (state.dragging !== null) return;
      state.select(hit(e));
    };
    const onCancel = () => {
      down = null;
    };
    const onMove = (e: PointerEvent) => {
      if (e.buttons !== 0) return;
      stage.style.cursor = onScene(e) && hit(e) ? 'pointer' : '';
    };

    stage.addEventListener('pointerdown', onDown);
    stage.addEventListener('pointerup', onUp);
    stage.addEventListener('pointercancel', onCancel);
    stage.addEventListener('pointermove', onMove);
    return () => {
      stage.removeEventListener('pointerdown', onDown);
      stage.removeEventListener('pointerup', onUp);
      stage.removeEventListener('pointercancel', onCancel);
      stage.removeEventListener('pointermove', onMove);
      stage.style.cursor = '';
    };
  }, [stage, canvas]);

  return (
    <OrbitControls
      ref={controls}
      onStart={() => (interacting.current = true)}
      onEnd={() => (interacting.current = false)}
      domElement={stage}
      enabled={dragging === null}
      enablePan={false}
      enableDamping
      dampingFactor={0.12}
      rotateSpeed={0.9}
      zoomSpeed={1}
      minZoom={defaultZoom * MIN_ZOOM_FACTOR}
      maxZoom={defaultZoom * MAX_ZOOM_FACTOR}
      minPolarAngle={0}
      maxPolarAngle={Math.PI}
    />
  );
}
