import { HalfFloatType, LinearFilter, RGBAFormat, WebGLRenderTarget } from 'three';

/**
 * A coarse 3D grid of colour that the fog is drawn from while the colour space changes.
 *
 * The fog is normally a formula: for any point, the colour there in the current space.
 * Mid-change there is no formula, so instead the colours themselves are splatted into this
 * grid every frame at wherever they have got to (FogSplat.tsx), and the fog shader reads
 * the grid (Shell.tsx). The grid covers the cylinder's bounding box and is stored as a 2D
 * atlas: one tile per horizontal slice of the cylinder, tiles laid out in rows.
 */

/** Cells per side. */
export const N = 56;
/** Spare texels around each tile, so splats and filtering never reach the next tile. */
export const PAD = 2;
export const TILE = N + 2 * PAD;
export const COLS = 8;
export const ROWS = Math.ceil(N / COLS);
export const WIDTH = COLS * TILE;
export const HEIGHT_PX = ROWS * TILE;

/** Top-left texel of slice `k`'s tile (slice 0 is the bottom of the cylinder). */
export function sliceTileOrigin(k: number): [number, number] {
  return [(k % COLS) * TILE, Math.floor(k / COLS) * TILE];
}

/** A world point as grid cells: 0–N on every axis over the cylinder's bounding box. */
export function worldToCell(
  [x, y, z]: [number, number, number],
  radius: number,
  height: number,
): [number, number, number] {
  return [((x + radius) / (2 * radius)) * N, ((y + height / 2) / height) * N, ((z + radius) / (2 * radius)) * N];
}

/** GLSL constants and helpers shared by the splat pass and the fog shader. */
export const gridChunk = /* glsl */ `
  #define GRID_N ${N.toFixed(1)}
  #define GRID_PAD ${PAD.toFixed(1)}
  #define GRID_TILE ${TILE.toFixed(1)}
  #define GRID_COLS ${COLS.toFixed(1)}
  #define GRID_SIZE vec2(${WIDTH.toFixed(1)}, ${HEIGHT_PX.toFixed(1)})

  // Texel position (pixels from the atlas origin) of grid point (x, z) in slice k.
  vec2 gridTexel(float k, vec2 xz) {
    vec2 tile = vec2(mod(k, GRID_COLS), floor(k / GRID_COLS)) * GRID_TILE;
    return tile + GRID_PAD + xz;
  }
`;

let target: WebGLRenderTarget | null = null;

/** The atlas the colours are splatted into: (rgb · weight, weight) per texel. */
export function gridTarget(): WebGLRenderTarget {
  target ??= new WebGLRenderTarget(WIDTH, HEIGHT_PX, {
    type: HalfFloatType,
    format: RGBAFormat,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    depthBuffer: false,
    generateMipmaps: false,
  });
  return target;
}

/**
 * Summed weight at which a point counts as fully inside the colours. Below it the grid
 * fog thins out, which gives the moving shape soft edges.
 */
export const GRID_FULL = 1.2;

/** Set once the renderer is known to support drawing into half-float textures. */
export const grid = { supported: false };
