/** Shared tick style and a pooled set of <line> elements, written imperatively per frame. */

export const TICK = 11;
export const TICK_SELECTED = 26;
/** Neighbouring ticks ease towards the selected style over this many pixels. */
const BUMP_PX = 36;
/** Ordinary ticks closer than this (px) to the selected tick are dropped, so it stays clean. */
const CLEARANCE = 3;
/** A level of ticks starts to fade in at SPACING_MIN px apart and is solid at SPACING_FULL. */
const SPACING_MIN = 4.5;
const SPACING_FULL = 8;
/** Tick levels, in units. Each is a multiple of the one before, so levels nest. */
const LEVELS = [1, 5, 10, 20];
const GREY = 150; // #969696
/**
 * The cylinder outline's grey. It is darker than the page but lighter than the colours
 * inside the cylinder, so a line in it reads dark on the page and light on colour.
 */
export const OUTLINE_GREY = 210; // #d2d2d2
const INK = 17; // #111

const SVG_NS = 'http://www.w3.org/2000/svg';

const levelWeight = (level: number, pixelsPerUnit: number) => {
  const t = (level * pixelsPerUnit - SPACING_MIN) / (SPACING_FULL - SPACING_MIN);
  return Math.min(1, Math.max(0, t));
};

/**
 * Finest tick step (in units) worth drawing at this scale. Density follows zoom: zoomed
 * out, only every 20th, 10th or 5th unit has a tick; zoomed in, every unit does.
 */
export function pickStep(pixelsPerUnit: number): number {
  for (const level of LEVELS) if (levelWeight(level, pixelsPerUnit) > 0) return level;
  return LEVELS[LEVELS.length - 1];
}

/**
 * Opacity of the tick at whole value `value`. Ticks of a finer level fade in as zooming
 * makes room for them, instead of popping.
 */
export function tickWeight(value: number, pixelsPerUnit: number): number {
  for (let i = LEVELS.length - 1; i >= 0; i--)
    if (value % LEVELS[i] === 0)
      return i === LEVELS.length - 1 ? 1 : levelWeight(LEVELS[i], pixelsPerUnit);
  return 0;
}

/**
 * Length and colour of an ordinary tick `distance` units from the selected value, or null
 * if it would collide with the selected tick. `bump` (0–1) is how strongly neighbours ease
 * towards the selected style: 0 leaves every ordinary tick short and grey, which is the
 * resting state; it rises to 1 while that scale is being dragged. `grey` is the resting
 * colour.
 */
export function tickStyle(distance: number, pixelsPerUnit: number, bump: number, grey = GREY) {
  const px = distance * pixelsPerUnit;
  if (px < CLEARANCE) return null;
  const t = Math.max(0, 1 - px / BUMP_PX);
  // Peaked rather than flat-topped, so the selected tick still stands clear of the bump.
  const e = t * t * bump;
  const c = Math.round(grey + (INK - grey) * e);
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
