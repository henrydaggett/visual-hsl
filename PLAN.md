# Visual HSL — build plan

A single-page tool for placing colours in a 3D HSL cylinder and fine-tuning them with
three on-model axis controls. Reference sketch: [`docs/sketch.jpg`](docs/sketch.jpg).

Status: plan only, nothing is built yet. Section 9 lists the assumptions that the owner has
not confirmed.

## 1. What we are building

- **Left / main area:** a 3D HSL cylinder on a light grey page. Drag to rotate, scroll to
  zoom. The cylinder is drawn faintly so the plotted colours inside it are readable.
- **Right panel:** a column of colour squares (max 12), each showing hex and HSL, with a
  `+` button at the bottom. Seeded with a few blues.
- **Each colour** is a small solid sphere at its HSL position inside the cylinder.
- **Selecting a colour** (click the sphere or the square) fades the cylinder further and
  shows three tick-mark controls, one per axis, which are dragged to move the colour.

The brief says "sphere" in places, but the sketch and the control descriptions are a
cylinder, which is also the natural shape of HSL. This plan builds a cylinder.

## 2. Stack

| Concern | Choice | Why |
|---|---|---|
| App | Vite + React + TypeScript | As requested, TS for the shared contracts below |
| 3D | `three`, `@react-three/fiber`, `@react-three/drei` | `OrbitControls` gives rotate and zoom |
| State | `zustand` | One store read by the canvas, the overlay and the panel |
| Controls | One SVG overlay above the canvas | See section 5 |
| Tests | `vitest` for colour maths, Playwright for a smoke check | Chromium is preinstalled in cloud sessions |

No UI kit, no router. Plain CSS (one file, CSS variables).

## 3. Geometry and camera

**Mapping** (world units, Y up, cylinder centred on the origin):

- Radius `R = 1`, height `HEIGHT = 2.4`.
- Lightness → height: `y = (l / 100 - 0.5) * HEIGHT` (black at the bottom, white at the top).
- Hue → angle around Y: `θ = h` degrees.
- Saturation → distance from the axis: `r = (s / 100) * R`.
- `position = (r·cos θ, y, r·sin θ)`.

This lives in one module, `src/lib/space.ts` (`hslToPosition`, plus the constants), and
nothing else may hard-code the mapping.

**Camera: orthographic.** This is a deliberate choice. With an orthographic camera and
OrbitControls' locked up-vector:

- the cylinder axis is always vertical on screen,
- the cylinder's on-screen half-width is always exactly `R × zoom` pixels,
- world-vertical lines are always screen-vertical.

Those three facts make the "lightness ruler is always on the left, 24px away" rule and the
"vertical ticks" rules exact and cheap. A perspective camera would make all three
approximate.

**Orbit:** rotate with left-drag, zoom with the wheel (`camera.zoom`, clamped to roughly
0.5×–6× of the default), pan disabled, damping on. Full polar range so the top and
underside are both reachable. Default view: about 20° above the horizon, as in the sketch.
OrbitControls is attached to the wrapper element that contains both the canvas and the
overlay, so the wheel zooms even when the pointer is over a control.

## 4. Scene contents

1. **Cylinder shell.** Side wall plus top and bottom caps, coloured by a small shader that
   computes HSL→RGB from the fragment position (so colour is exact, not interpolated).
   Transparent, double-sided, `depthWrite: false`. Opacity is one uniform:
   about `0.22` with nothing selected, easing to about `0.07` when a colour is selected
   (200ms).
2. **Outline.** Thin grey rings at the top and bottom rims so the shape reads even when
   the shell is nearly invisible.
3. **Colour points.** One sphere per swatch (radius ≈ `0.035`), unlit `MeshBasicMaterial`
   in the exact colour, with a thin dark outline so pale colours stay visible against the
   grey page. The selected one gets a slightly larger ring.
4. **Selection guides** (only while selected, thin grey lines, drawn in the overlay):
   - the cross-section circle of the cylinder at the selected lightness,
   - the radius line from the axis to the cylinder wall at the selected hue,
   - the half-plane rectangle through that radius from top to bottom (the "slice" in the
     sketch), at low opacity.

**Picking:** click a sphere to select, click empty space to deselect. A click only counts
if the pointer moved less than 4px between down and up, so rotating never selects or
deselects by accident.

## 5. The three controls

All three share one visual language and one implementation approach.

**Approach: a single SVG overlay, positioned over the canvas, redrawn every frame.**
World-space points are projected to pixels with the live camera and written straight to
SVG attributes (imperatively, in `useFrame`, not through React state). Reasons:

- crisp, constant-width lines at any zoom (WebGL lines are stuck at 1px, and thick-line
  workarounds blur),
- pixel-exact lengths and gaps such as "24px from the cylinder",
- ordinary DOM pointer events and cursors for dragging,
- one stylesheet for all three controls.

The overlay has `pointer-events: none`, and only the control hit areas turn it back on.

**Shared tick style**

| Element | Style |
|---|---|
| Ordinary tick | 8px long, 1px, `#b5b5b5` |
| Selected tick | 20px long, 2px, `#111` |
| Neighbouring ticks | Length and darkness ease up towards the selected value over about ±6 units, so the selection reads as a bump that slides along the scale |
| Value label | 12px tabular numerals next to the selected tick (`62`, `80` in the sketch) |
| Hit area | Invisible 24px-wide stroke along the control |

Tick spacing is chosen per frame from `{1, 2, 5, 10}` units so that neighbours are never
closer than about 4px on screen. The selected tick is its own element placed at the exact
value, so it is correct whatever the spacing.

While a control is being dragged: orbit is disabled, the camera does not move, and the
colour sphere, panel text and tick emphasis all update live.

### 5a. Lightness — screen-fixed ruler on the left

- Always visible on the left of the cylinder, whatever the rotation. It does not rotate
  with the model. It does follow zoom, so it keeps lining up with the cylinder.
- `x = projectedAxisX − R × zoom − 24px`.
- The tick for lightness `l` sits at the screen `y` of the axis point at that height, so
  the selected tick lines up with the cross-section circle.
- Ticks are horizontal, right-aligned towards the cylinder.
- Drag vertically: `Δl = −Δy / rulerPixelHeight × 100`. The drag is relative (grabbing
  anywhere on the ruler does not make the value jump).
- With nothing selected the ruler is still drawn (all grey) but is inert.

### 5b. Hue — ring around the cylinder at the selected lightness

- Appears only while a colour is selected.
- A circle in world space at the selected height, with radius `R + 24px / zoom`, so it
  stays 24px outside the cylinder on screen at any zoom.
- Ticks are vertical (parallel to the cylinder axis) and centred on the ring. The selected
  tick is the longer black vertical line at the colour's hue.
- Ticks on the far side of the ring are drawn at about 35% opacity so the ring reads as 3D.
- Drag around the ring. Primary mapping: intersect the pointer ray with the plane
  `y = selected height`, take the angle about the axis, and apply the change in angle
  since the last event (relative, wraps at 360). When the ring is seen nearly edge-on
  (plane within about 10° of the view direction) that intersection is unstable, so fall
  back to projecting the pointer movement onto the on-screen tangent of the ring at the
  current hue.

### 5c. Saturation — ticks standing on the radius line

- Appears only while a colour is selected.
- Baseline: the radius line from the axis to the wall, at the selected hue and height.
- Ticks stand vertically on top of that line (base on the line, pointing up), from 0 at
  the axis to 100 at the wall. The selected tick is the longer black one, directly above
  the colour sphere, with the value label above it.
- Drag along the line: project the pointer movement onto the on-screen direction of the
  radius, `Δs = (Δpointer · dir) / radiusPixelLength × 100`. When the radius points almost
  straight at the camera its on-screen length approaches zero, so clamp the divisor
  (minimum about 40px) to keep the control usable rather than explosive.

## 6. Right-hand panel

- Fixed-width panel on the right, the canvas takes the rest.
- A **scale** is a column: a vertical stack of 72px squares filled with the colour. Next
  to each square: hex (`#2F6FED`) and `hsl(217, 84%, 56%)` in small monospace text.
- Click a square to select it (same selection as clicking the sphere). The selected square
  gets a dark outline.
- `+` button under the last square. It duplicates the selected colour (or the last one if
  nothing is selected), nudges lightness by 8 so the new point is not hidden behind the
  old one, and selects it. Hidden when the column has 12.
- A small `×` appears on hover to remove a colour. `Delete`/`Backspace` removes the
  selected one. `Escape` deselects.
- **Multiple columns:** the data model and the panel layout are built for an array of
  scales from day one (the panel maps over `scales` and lays columns out side by side).
  Version 1 ships with one scale and no "add column" button.

**Seed data** (one scale, "Blue"):

| h | s | l |
|---|---|---|
| 215 | 90 | 92 |
| 215 | 88 | 78 |
| 215 | 85 | 62 |
| 215 | 85 | 48 |
| 215 | 80 | 34 |
| 215 | 75 | 20 |

## 7. State and shared contracts

```ts
// src/lib/color.ts
type HSL = { h: number; s: number; l: number }; // h 0–359, s and l 0–100, integers
hslToHex(hsl): string
hslToRgb(hsl): [number, number, number]        // 0–1, for three.js
formatHsl(hsl): string                          // "hsl(215, 85%, 62%)"

// src/store.ts (zustand)
type Swatch = { id: string; hsl: HSL };
type Scale  = { id: string; name: string; swatches: Swatch[] };   // max 12 swatches
type Selection = { scaleId: string; swatchId: string } | null;

state:   scales: Scale[]; selection: Selection; dragging: 'h' | 's' | 'l' | null
actions: select(sel), addSwatch(scaleId), removeSwatch(scaleId, swatchId),
         updateSelected(patch: Partial<HSL>)   // clamps s and l, wraps h, rounds
```

- **HSL is the source of truth; hex is always derived.** Storing hex would lose the hue
  whenever saturation hits 0 or lightness hits 0 or 100, and the point would jump.
- Values are integers. Drags accumulate a fractional remainder internally so slow drags
  still move.
- `scales` is saved to `localStorage` and restored on load, falling back to the seed.

**Page styling:** background `#ececec`, panel on the same grey with a hairline divider,
text `#111` / `#777`, system UI font, monospace for values.

## 8. Work packages for the build agents

Package A must land first because the repository is empty. B, C and D can then run in
parallel: they only meet at the store and at `space.ts`, and each owns its own files.

| # | Package | Owns | Done when |
|---|---|---|---|
| A | Scaffold and foundations | `package.json`, Vite config, `src/main.tsx`, `src/App.tsx` (two-pane layout with placeholders), `src/styles.css`, `src/lib/color.ts`, `src/lib/space.ts`, `src/store.ts`, unit tests | `npm run dev`, `npm run build` and `npm test` pass. Colour round-trips and clamping are unit-tested. Seed data loads. |
| B | 3D scene | `src/scene/*` (canvas, camera and orbit, cylinder shader, outline, points, picking), plus `src/scene/projection.ts` exposing the live camera for the overlay | Cylinder renders faintly, rotates and zooms. Seed blues appear at the right positions. Click selects and deselects. Shell fades on selection. |
| C | Panel | `src/panel/*` | Squares with hex and HSL, selection synced with the store, add, remove, the 12 cap, keyboard shortcuts, persistence. |
| D | Axis controls | `src/controls/*` (overlay, tick renderer, lightness ruler, hue ring, saturation line, guides, drag maths) | All three controls behave as in section 5, at any rotation and zoom, and the model stays still while dragging. |
| E | Integration and QA | Wiring in `App.tsx`, Playwright smoke test, README | Checklist below passes, with screenshots attached. |

Contract between B and D: `projection.ts` exports a ref holding the current camera and
canvas size, and `worldToScreen(vec3) → {x, y}` / `screenToRay(x, y)`. D reads it inside
its own frame loop. D can develop against a fixed mock camera until B lands.

**Acceptance checklist (package E)**

- [ ] Rotating to any angle, the lightness ruler stays on the left, 24px from the
      cylinder edge, and lines up with the cylinder's top and bottom.
- [ ] Zooming with the wheel keeps all three controls attached to the model.
- [ ] Dragging each control changes only its own axis; the camera does not move; the
      sphere, the square, hex and HSL text update live.
- [ ] Hue wraps cleanly through 0/360. Saturation and lightness stop at 0 and 100.
- [ ] Dragging saturation to 0 and back keeps the original hue.
- [ ] Hue and saturation controls stay usable when viewed from directly above and from
      side-on.
- [ ] Add up to 12, the `+` disappears at 12, remove works, reload restores the colours.
- [ ] Rotating the model never changes the selection.

## 9. Assumptions to confirm

These are defaults chosen so the build is not blocked. Each is cheap to change now and
more expensive later.

1. **Cylinder, not sphere** (see section 1).
2. **Hue tick orientation.** The brief says both "a longer horizontal one for the selected
   one" and "the lines should be vertical". This plan makes every hue tick vertical,
   including the selected one.
3. **Lightness ruler when nothing is selected:** shown, grey and inert. The alternative is
   to hide it until a colour is selected.
4. **Only the cylinder fades on selection.** The other colour points stay at full
   strength so the scale can still be read as a whole.
5. **Whole-number HSL values** (no decimals).
6. **Remove and persistence** were not in the brief but are included because the tool is
   awkward without them.
7. **Not in version 1:** typing a hex value to edit, adding more columns from the UI,
   lines connecting the points of a scale, export. The data model leaves room for each.
