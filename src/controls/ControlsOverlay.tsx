import { useEffect, useRef } from 'react';
import { Vector3 } from 'three';
import { HEIGHT, R, type Vec3, lightnessToY, polar } from '../lib/space';
import {
  type View,
  getView,
  pixelsPerUnit,
  screenToRay,
  subscribeFrame,
  worldToScreen,
} from '../scene/projection';
import { type Axis, selectedSwatch, useStore } from '../store';
import {
  TICK_SELECTED,
  TickPool,
  pickStep,
  setEllipse,
  setLine,
  setText,
  tickStyle,
  tickWeight,
} from './ticks';
import './controls.css';

/** Screen gap between the cylinder and the lightness ruler / hue ring. */
const GAP = 24;
/** Smallest on-screen length used as a drag divisor, so foreshortened controls stay usable. */
const MIN_DRAG_PX = 40;
const FAR_OPACITY = 0.35;
/** Time for a scale's neighbour bump to ease in or out. */
const BUMP_MS = 150;
const EDGE_ON = Math.sin((10 * Math.PI) / 180);

type Pt = { x: number; y: number };

/**
 * The camera is orthographic, so projection is affine: screen = o + x·ex + y·ey + z·ez.
 * Four projections per frame give the basis, and everything else is arithmetic.
 */
type Frame = { o: Pt; ex: Pt; ey: Pt; ez: Pt; ppu: number; dir: Vector3 };

const viewDir = new Vector3();

function frameOf(view: View): Frame {
  const o = worldToScreen(view, 0, 0, 0);
  const px = worldToScreen(view, 1, 0, 0);
  const py = worldToScreen(view, 0, 1, 0);
  const pz = worldToScreen(view, 0, 0, 1);
  return {
    o,
    ex: { x: px.x - o.x, y: px.y - o.y },
    ey: { x: py.x - o.x, y: py.y - o.y },
    ez: { x: pz.x - o.x, y: pz.y - o.y },
    ppu: pixelsPerUnit(view),
    dir: view.camera.getWorldDirection(viewDir),
  };
}

const at = (f: Frame, [x, y, z]: Vec3): Pt => ({
  x: f.o.x + x * f.ex.x + y * f.ey.x + z * f.ez.x,
  y: f.o.y + x * f.ex.y + y * f.ey.y + z * f.ez.y,
});

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
/** Shortest distance between two hues, in degrees. */
const hueDistance = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};
/** World radius of the hue ring: 24px outside the cylinder at any zoom. */
const ringRadius = (f: Frame) => R + GAP / f.ppu;
/** On-screen height of the lightness ruler (0 when looking straight down the axis). */
const rulerHeight = (f: Frame) => Math.abs(HEIGHT * f.ey.y);

/** Resize cursor matching the on-screen direction of a line. */
function cursorAlong(dx: number, dy: number) {
  const a = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 180;
  if (a < 22.5 || a >= 157.5) return 'ew-resize';
  if (a < 67.5) return 'nwse-resize';
  if (a < 112.5) return 'ns-resize';
  return 'nesw-resize';
}

type Drag = { axis: Axis; pointerId: number; value: number; x: number; y: number };

export function ControlsOverlay() {
  const svg = useRef<SVGSVGElement>(null);
  const root = useRef<SVGGElement>(null);

  const guideCircle = useRef<SVGEllipseElement>(null);
  const radiusLine = useRef<SVGLineElement>(null);

  const lTicks = useRef<SVGGElement>(null);
  const hTicks = useRef<SVGGElement>(null);
  const sTicks = useRef<SVGGElement>(null);
  const lSelected = useRef<SVGLineElement>(null);
  const hSelected = useRef<SVGLineElement>(null);
  const sSelected = useRef<SVGLineElement>(null);
  const lLabel = useRef<SVGTextElement>(null);
  const hLabel = useRef<SVGTextElement>(null);
  const sLabel = useRef<SVGTextElement>(null);
  const lHit = useRef<SVGLineElement>(null);
  const hHit = useRef<SVGEllipseElement>(null);
  const sHit = useRef<SVGLineElement>(null);

  useEffect(() => {
    const pools = {
      l: new TickPool(lTicks.current!),
      h: new TickPool(hTicks.current!),
      s: new TickPool(sTicks.current!),
    };
    /** How far each scale's neighbour bump has eased in (0–1). Only the scale being
     *  dragged shows it; at rest just the selected tick is long. */
    const bump = { l: 0, h: 0, s: 0 };
    let lastDraw = performance.now();
    /** Last well-defined on-screen direction of the saturation radius. */
    let sDir: Pt = { x: 1, y: 0 };

    // ---------------------------------------------------------------- drawing

    function draw() {
      const view = getView();
      const swatch = selectedSwatch(useStore.getState());
      const group = root.current!;
      if (!view || !swatch) {
        group.style.display = 'none';
        return;
      }
      group.style.display = '';

      const now = performance.now();
      const ease = Math.min(1, (now - lastDraw) / BUMP_MS);
      lastDraw = now;
      const dragging = useStore.getState().dragging;
      for (const axis of ['l', 'h', 's'] as const) {
        const target = dragging === axis ? 1 : 0;
        bump[axis] += Math.max(-ease, Math.min(ease, target - bump[axis]));
      }

      const { h, s, l } = swatch.hsl;
      const f = frameOf(view);
      const y = lightnessToY(l);
      const yTop = lightnessToY(100);
      const yBottom = lightnessToY(0);
      const axis = at(f, [0, y, 0]);
      const wall = at(f, polar(h, R, y));

      // Guide: the cross-section circle at the selected lightness.
      const spanX = Math.hypot(f.ex.x, f.ez.x);
      const spanY = Math.hypot(f.ex.y, f.ez.y);
      setEllipse(guideCircle.current!, axis.x, axis.y, R * spanX, R * spanY);

      // Lightness: screen-fixed vertical ruler left of the cylinder.
      {
        const x = f.o.x - R * f.ppu - GAP;
        const top = at(f, [0, yTop, 0]).y;
        const bottom = at(f, [0, yBottom, 0]).y;
        const perUnit = Math.abs(bottom - top) / 100;
        const step = pickStep(perUnit);
        const pool = pools.l;
        pool.begin();
        for (let v = 0; v <= 100; v += step) {
          const style = tickStyle(Math.abs(v - l), perUnit, bump.l);
          if (!style) continue;
          const ty = bottom + ((top - bottom) * v) / 100;
          pool.add(x - style.length, ty, x, ty, style.stroke, tickWeight(v, perUnit));
        }
        pool.end();
        setLine(lSelected.current!, x - TICK_SELECTED, axis.y, x, axis.y);
        setText(lLabel.current!, x - TICK_SELECTED - 6, axis.y, String(l));
        // Centred left of the ruler line so a strip stays free of the hue ring, which
        // touches the ruler at the selected lightness. The pad keeps it grabbable when the
        // view is top-down and the ruler has no height.
        setLine(lHit.current!, x - 16, top - 6, x - 16, bottom + 6);
      }

      // Hue: ring 24px outside the cylinder at the selected height; every tick vertical.
      {
        const rr = ringRadius(f);
        const perDegree = (rr * f.ppu * Math.PI) / 180; // along the major axis: stable
        const step = pickStep(perDegree);
        const farness = (deg: number) => {
          const [nx, , nz] = polar(deg, 1, 0);
          return nx * f.dir.x + nz * f.dir.z; // > 0: pointing away from the camera
        };
        const opacity = (deg: number) =>
          1 - (1 - FAR_OPACITY) * smoothstep(0, 0.12, farness(deg));
        const pool = pools.h;
        pool.begin();
        for (let deg = 0; deg < 360; deg += step) {
          const style = tickStyle(hueDistance(deg, h), perDegree, bump.h);
          if (!style) continue;
          const p = at(f, polar(deg, rr, y));
          const half = style.length / 2;
          pool.add(
            p.x,
            p.y - half,
            p.x,
            p.y + half,
            style.stroke,
            opacity(deg) * tickWeight(deg, perDegree),
          );
        }
        pool.end();
        const p = at(f, polar(h, rr, y));
        const half = TICK_SELECTED / 2;
        setLine(hSelected.current!, p.x, p.y - half, p.x, p.y + half);
        // Dimmed less than its neighbours: it has to stay findable on the far side.
        hSelected.current!.setAttribute('stroke-opacity', String(Math.max(opacity(h), 0.6)));
        // Label on the outside of the ring, away from its centre.
        const out = Math.hypot(p.x - axis.x, p.y - axis.y) || 1;
        setText(
          hLabel.current!,
          p.x + ((p.x - axis.x) / out) * 20,
          p.y + ((p.y - axis.y) / out) * (half + 10),
          `${h}°`,
        );
        setEllipse(hHit.current!, axis.x, axis.y, rr * spanX, rr * spanY);
      }

      // Saturation: ticks standing on the radius line, 0 at the axis to 100 at the wall.
      {
        const dx = wall.x - axis.x;
        const dy = wall.y - axis.y;
        const length = Math.hypot(dx, dy);
        if (length > 1) sDir = { x: dx / length, y: dy / length };
        const perUnit = length / 100;
        const step = pickStep(perUnit);
        setLine(radiusLine.current!, axis.x, axis.y, wall.x, wall.y);
        const pool = pools.s;
        pool.begin();
        for (let v = 0; v <= 100; v += step) {
          const style = tickStyle(Math.abs(v - s), perUnit, bump.s);
          if (!style) continue;
          const bx = axis.x + (dx * v) / 100;
          const by = axis.y + (dy * v) / 100;
          pool.add(bx, by, bx, by - style.length, style.stroke, tickWeight(v, perUnit));
        }
        pool.end();
        const bx = axis.x + (dx * s) / 100;
        const by = axis.y + (dy * s) / 100;
        setLine(sSelected.current!, bx, by, bx, by - TICK_SELECTED);
        setText(sLabel.current!, bx, by - TICK_SELECTED - 9, String(s));
        // When the radius points at the camera, keep a grabbable stub around it.
        const pad = Math.max(0, (GAP - length) / 2);
        setLine(
          sHit.current!,
          axis.x - sDir.x * pad,
          axis.y - sDir.y * pad,
          wall.x + sDir.x * pad,
          wall.y + sDir.y * pad,
        );
        sHit.current!.style.cursor = cursorAlong(sDir.x, sDir.y);
      }
    }

    // --------------------------------------------------------------- dragging

    let drag: Drag | null = null;

    const pointerPos = (e: PointerEvent): Pt => {
      const box = svg.current!.getBoundingClientRect();
      return { x: e.clientX - box.left, y: e.clientY - box.top };
    };

    /** Change in hue (degrees) for a pointer move from `a` to `b`. */
    function hueDelta(view: View, f: Frame, hue: number, y: number, a: Pt, b: Pt) {
      const angleAt = (p: Pt) => {
        const { origin, direction } = screenToRay(view, p.x, p.y);
        const t = (y - origin.y) / direction.y;
        return Math.atan2(origin.z + t * direction.z, origin.x + t * direction.x);
      };
      if (Math.abs(f.dir.y) >= EDGE_ON) {
        let d = angleAt(b) - angleAt(a);
        if (d > Math.PI) d -= 2 * Math.PI;
        else if (d < -Math.PI) d += 2 * Math.PI;
        return (d * 180) / Math.PI;
      }
      // Ring nearly edge-on: the plane intersection is unstable, so follow the on-screen
      // tangent of the ring at the current hue instead. Taken in ~1px steps because the
      // tangent turns quickly near the ends of the flattened ring; without that a fast
      // move overshoots the end and the hue jumps back and forth.
      const rr = ringRadius(f);
      const steps = Math.min(200, Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y))));
      const mx = (b.x - a.x) / steps;
      const my = (b.y - a.y) / steps;
      let moved = 0;
      for (let i = 0; i < steps; i++) {
        const p0 = at(f, polar(hue + moved - 0.5, rr, y));
        const p1 = at(f, polar(hue + moved + 0.5, rr, y));
        const tx = p1.x - p0.x;
        const ty = p1.y - p0.y;
        const perDegree = Math.hypot(tx, ty);
        if (perDegree < 1e-6) continue;
        const along = (mx * tx + my * ty) / perDegree;
        moved += along / Math.max(perDegree, (MIN_DRAG_PX * Math.PI) / 180);
      }
      return moved;
    }

    function onMove(e: PointerEvent) {
      if (!drag || e.pointerId !== drag.pointerId) return;
      e.stopPropagation();
      const view = getView();
      const swatch = selectedSwatch(useStore.getState());
      if (!view || !swatch) return;
      const f = frameOf(view);
      const p = pointerPos(e);
      const prev = { x: drag.x, y: drag.y };
      drag.x = p.x;
      drag.y = p.y;
      const { updateSelected } = useStore.getState();

      // The drag accumulates in a float; the store keeps the rounded value.
      if (drag.axis === 'l') {
        const dl = (-(p.y - prev.y) / Math.max(rulerHeight(f), MIN_DRAG_PX)) * 100;
        drag.value = clamp(drag.value + dl, 0, 100);
        updateSelected({ l: drag.value });
      } else if (drag.axis === 's') {
        const y = lightnessToY(swatch.hsl.l);
        const a = at(f, [0, y, 0]);
        const w = at(f, polar(swatch.hsl.h, R, y));
        const length = Math.hypot(w.x - a.x, w.y - a.y);
        const along = (p.x - prev.x) * sDir.x + (p.y - prev.y) * sDir.y;
        drag.value = clamp(drag.value + (along / Math.max(length, MIN_DRAG_PX)) * 100, 0, 100);
        updateSelected({ s: drag.value });
      } else {
        const y = lightnessToY(swatch.hsl.l);
        drag.value += hueDelta(view, f, drag.value, y, prev, p);
        updateSelected({ h: drag.value });
      }
    }

    function endDrag(e: PointerEvent) {
      if (!drag || e.pointerId !== drag.pointerId) return;
      e.stopPropagation();
      const target = e.currentTarget as Element;
      drag = null;
      if (target.hasPointerCapture(e.pointerId)) target.releasePointerCapture(e.pointerId);
      useStore.getState().setDragging(null);
    }

    // Native listeners: OrbitControls listens natively on the stage (an ancestor), so
    // React's synthetic stopPropagation would run too late to keep it from rotating.
    function bind(el: SVGElement, axis: Axis) {
      const onDown = (e: PointerEvent) => {
        if (e.button !== 0 || drag) return;
        const swatch = selectedSwatch(useStore.getState());
        if (!swatch) return;
        e.stopPropagation();
        e.preventDefault();
        const p = pointerPos(e);
        drag = { axis, pointerId: e.pointerId, value: swatch.hsl[axis], x: p.x, y: p.y };
        el.setPointerCapture(e.pointerId);
        useStore.getState().setDragging(axis);
      };
      // Keeps the scene from treating the end of a drag as a click on empty space.
      const swallow = (e: Event) => e.stopPropagation();
      el.addEventListener('pointerdown', onDown);
      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerup', endDrag);
      el.addEventListener('pointercancel', endDrag);
      el.addEventListener('lostpointercapture', endDrag);
      el.addEventListener('click', swallow);
      return () => {
        el.removeEventListener('pointerdown', onDown);
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerup', endDrag);
        el.removeEventListener('pointercancel', endDrag);
        el.removeEventListener('lostpointercapture', endDrag);
        el.removeEventListener('click', swallow);
      };
    }

    const unbind = [bind(lHit.current!, 'l'), bind(hHit.current!, 'h'), bind(sHit.current!, 's')];
    const unsubscribeFrame = subscribeFrame(draw);
    // Selection or colour changes must redraw even if the scene publishes no frame.
    const unsubscribeStore = useStore.subscribe(draw);
    draw();

    return () => {
      unsubscribeFrame();
      unsubscribeStore();
      unbind.forEach((fn) => fn());
      if (drag) {
        drag = null;
        useStore.getState().setDragging(null);
      }
      pools.l.dispose();
      pools.h.dispose();
      pools.s.dispose();
    };
  }, []);

  // DOM order is paint and hit order: saturation over hue over lightness.
  return (
    <svg ref={svg} className="controls" aria-hidden="true">
      <g ref={root} style={{ display: 'none' }}>
        <ellipse ref={guideCircle} className="controls-guide is-circle" />

        <g ref={lTicks} className="controls-ticks" />
        <line ref={lSelected} className="controls-selected" />
        <line ref={lHit} className="controls-hit is-l" />

        <g ref={hTicks} className="controls-ticks" />
        <line ref={hSelected} className="controls-selected" />
        <ellipse ref={hHit} className="controls-hit is-h" />

        <line ref={radiusLine} className="controls-guide is-radius" />
        <g ref={sTicks} className="controls-ticks" />
        <line ref={sSelected} className="controls-selected" />
        <line ref={sHit} className="controls-hit is-s" />

        <text ref={lLabel} className="controls-label" textAnchor="end" />
        <text ref={hLabel} className="controls-label" textAnchor="middle" />
        <text ref={sLabel} className="controls-label" textAnchor="middle" />
      </g>
    </svg>
  );
}
