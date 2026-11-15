/** Shared tick style and a pooled set of <line> elements, written imperatively per frame. */

export const TICK = 8;
export const TICK_SELECTED = 20;
/** Neighbouring ticks ease towards the selected style over this many units. */
const BUMP_UNITS = 6;
/** Ordinary ticks closer than this (px) to the selected tick are dropped, so it stays clean. */
const CLEARANCE = 3;
const MIN_SPACING = 4;
const GREY = 181; // #b5b5b5
const INK = 17; // #111

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Smallest step from {1, 2, 5, 10} units whose ticks are at least ~4px apart on screen. */
export function pickStep(pixelsPerUnit: number): number {
  for (const step of [1, 2, 5]) if (step * pixelsPerUnit >= MIN_SPACING) return step;
  return 10;
}

/**
 * Length and colour of an ordinary tick `distance` units from the selected value, or null
 * if it would collide with the selected tick.
 */
export function tickStyle(distance: number, pixelsPerUnit: number) {
  if (distance * pixelsPerUnit < CLEARANCE) return null;
  const t = Math.max(0, 1 - distance / BUMP_UNITS);
  // Peaked rather than flat-topped, so the selected tick still stands clear of the bump.
  const e = t * t;
  const c = Math.round(GREY + (INK - GREY) * e);
  return { length: TICK + (TICK_SELECTED - TICK) * e, stroke: `rgb(${c},${c},${c})` };
}

export class TickPool {
  private lines: SVGLineElement[] = [];
  private used = 0;
  private shown = 0;

  constructor(private group: SVGGElement) {}

  begin() {
    this.used = 0;
  }

  add(x1: number, y1: number, x2: number, y2: number, stroke: string, opacity = 1) {
    let line = this.lines[this.used];
    if (!line) {
      line = document.createElementNS(SVG_NS, 'line');
      this.group.appendChild(line);
      this.lines.push(line);
    }
    this.used++;
    setLine(line, x1, y1, x2, y2);
    line.setAttribute('stroke', stroke);
    line.setAttribute('stroke-opacity', String(opacity));
  }

  end() {
    for (let i = this.used; i < this.shown; i++) this.lines[i].style.display = 'none';
    for (let i = this.shown; i < this.used; i++) this.lines[i].style.display = '';
    this.shown = this.used;
  }

  dispose() {
    this.group.replaceChildren();
    this.lines = [];
    this.used = this.shown = 0;
  }
}

const n = (v: number) => v.toFixed(2);

export function setLine(el: SVGElement, x1: number, y1: number, x2: number, y2: number) {
  el.setAttribute('x1', n(x1));
  el.setAttribute('y1', n(y1));
  el.setAttribute('x2', n(x2));
  el.setAttribute('y2', n(y2));
}

export function setEllipse(el: SVGElement, cx: number, cy: number, rx: number, ry: number) {
  el.setAttribute('cx', n(cx));
  el.setAttribute('cy', n(cy));
  el.setAttribute('rx', n(rx));
  // A zero radius disables rendering (and hit-testing), so keep a sliver when edge-on.
  el.setAttribute('ry', n(Math.max(ry, 0.5)));
}

export function setText(el: SVGTextElement, x: number, y: number, text: string) {
  el.setAttribute('x', n(x));
  el.setAttribute('y', n(y));
  if (el.textContent !== text) el.textContent = text;
}
