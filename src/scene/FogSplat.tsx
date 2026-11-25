import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  BufferAttribute,
  Camera,
  Color,
  CustomBlending,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  OneFactor,
  Points,
  Scene,
  ShaderMaterial,
} from 'three';
import { type SpaceId, spaceOf } from '../lib/spaces';
import { HEIGHT, R, rgbToCylinder } from '../lib/space';
import { gridChunk, grid, gridTarget } from './fogGrid';
import { morphPhase } from './morph';

/**
 * Colours sampled evenly through each space's solid. A change of space uses the old
 * space's sample and the new one's together, so the fog is evenly filled at both ends of
 * the journey (sampling evenly in RGB instead leaves dark regions of HSL sparse and lumpy).
 */
const PER_SPACE = 24000;
const COUNT = PER_SPACE * 2;
/** Share of the journey by which the last colours set off after the first. */
const STAGGER = 0.15;
/** Splat footprint, in grid texels. */
const SPLAT_PX = 7;
/** Spread across neighbouring slices, in cells. */
const SLICE_SIGMA = 1.1;

/** Small deterministic generator, so the sample is the same on every visit. */
function random(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

/** sRGB colours spread evenly through a space's solid, worked out on first use. */
const samples = new Map<SpaceId, Float32Array>();
function sampleOf(space: SpaceId): Float32Array {
  let out = samples.get(space);
  if (out) return out;
  out = new Float32Array(PER_SPACE * 3);
  const next = random(11);
  const sp = spaceOf(space);
  for (let n = 0; n < PER_SPACE; ) {
    // A random point in the cylinder: even in area across the disc, even in height.
    const radius = Math.sqrt(next());
    const rgb = sp.colourAt({ h: next() * 360, radius, l: next() * 100 });
    if (rgb) out.set(rgb, 3 * n++);
  }
  samples.set(space, out);
  return out;
}

/** Where every colour of one space's sample sits in another space, worked out on first use. */
const placed = new Map<string, Float32Array>();
function placement(sample: SpaceId, space: SpaceId): Float32Array {
  const key = `${sample}>${space}`;
  let out = placed.get(key);
  if (out) return out;
  const rgb = sampleOf(sample);
  out = new Float32Array(PER_SPACE * 3);
  for (let i = 0; i < PER_SPACE; i++)
    out.set(rgbToCylinder(space, [rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]]), i * 3);
  placed.set(key, out);
  return out;
}

const vertexShader = /* glsl */ `
  attribute float aSlice;  // -2 to 2: which nearby slice this copy splats into
  attribute vec3 aRgb;
  attribute vec3 aFrom;    // angle, radius, y in the old space
  attribute vec3 aTo;      // the same in the new space
  uniform float uTravel;
  uniform float uRadius;
  uniform float uHeight;
  varying vec3 vRgb;
  varying float vWeight;
  varying vec2 vTile;
  ${gridChunk}

  float ease(float t) {
    return t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0;
  }

  void main() {
    // Dark colours set off first, light ones last.
    float delay = aFrom.z / uHeight + 0.5;
    float t = ease(clamp((uTravel - delay * ${STAGGER.toFixed(2)}) / ${(1 - STAGGER).toFixed(2)}, 0.0, 1.0));
    float turn = mod(aTo.x - aFrom.x + 3.141592653589793, 6.283185307179586) - 3.141592653589793;
    float angle = aFrom.x + turn * t;
    float radius = mix(aFrom.y, aTo.y, t);
    vec3 p = vec3(radius * cos(angle), mix(aFrom.z, aTo.z, t), radius * sin(angle));

    vec3 cell = vec3(
      (p.x + uRadius) / (2.0 * uRadius),
      (p.y + 0.5 * uHeight) / uHeight,
      (p.z + uRadius) / (2.0 * uRadius)
    ) * GRID_N;
    float k = floor(cell.y) + aSlice;
    if (k < 0.0 || k > GRID_N - 1.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // off the target: nothing drawn
      gl_PointSize = 0.0;
      return;
    }
    float d = (cell.y - (k + 0.5)) / ${SLICE_SIGMA.toFixed(2)};
    vWeight = exp(-0.5 * d * d);
    vRgb = aRgb;
    vTile = gridTexel(k, vec2(0.0)) - GRID_PAD;
    vec2 texel = gridTexel(k, cell.xz);
    gl_Position = vec4(texel / GRID_SIZE * 2.0 - 1.0, 0.0, 1.0);
    gl_PointSize = ${SPLAT_PX.toFixed(1)};
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vRgb;
  varying float vWeight;
  varying vec2 vTile;
  ${gridChunk}

  void main() {
    // Never spill into the next slice's tile.
    vec2 local = gl_FragCoord.xy - vTile;
    if (any(lessThan(local, vec2(0.0))) || any(greaterThanEqual(local, vec2(GRID_TILE)))) discard;
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float w = vWeight * exp(-2.0 * dot(c, c));
    gl_FragColor = vec4(vRgb * w, w);
  }
`;

/**
 * While the colour space changes: splats every sampled colour, at wherever it has got to
 * on its way to the new space, into the fog grid the fog shader reads. Draws nothing on
 * screen itself, and does nothing at all when no change is in progress.
 */
export function FogSplat() {
  const gl = useThree((s) => s.gl);

  const [scene, camera, geometry, material] = useMemo(() => {
    const geometry = new InstancedBufferGeometry();
    geometry.instanceCount = COUNT;
    // Five copies of every colour, one per nearby slice.
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(15), 3));
    geometry.setAttribute('aSlice', new BufferAttribute(new Float32Array([-2, -1, 0, 1, 2]), 1));
    geometry.setAttribute('aRgb', new InstancedBufferAttribute(new Float32Array(COUNT * 3), 3));
    geometry.setAttribute('aFrom', new InstancedBufferAttribute(new Float32Array(COUNT * 3), 3));
    geometry.setAttribute('aTo', new InstancedBufferAttribute(new Float32Array(COUNT * 3), 3));
    const material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: { uTravel: { value: 0 }, uRadius: { value: R }, uHeight: { value: HEIGHT } },
      // Plain sums: (rgb · w, w) accumulate so the fog can take the average colour.
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneFactor,
      blendSrcAlpha: OneFactor,
      blendDstAlpha: OneFactor,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });
    const points = new Points(geometry, material);
    points.frustumCulled = false;
    const scene = new Scene();
    scene.add(points);
    return [scene, new Camera(), geometry, material] as const;
  }, []);

  useEffect(() => {
    grid.supported = gl.extensions.has('EXT_color_buffer_float') || gl.extensions.has('EXT_color_buffer_half_float');
  }, [gl]);

  const clearColour = useMemo(() => new Color(), []);
  const filled = useRef(0);

  useFrame(() => {
    const phase = morphPhase();
    if (!grid.supported || !phase.active || !phase.from || !phase.to || phase.grid <= 0) return;

    // Once per change of space: where every colour starts and ends.
    if (filled.current !== phase.id) {
      filled.current = phase.id;
      const { from, to } = phase;
      const fill = (name: string, first: Float32Array, second: Float32Array) => {
        const attr = geometry.getAttribute(name) as InstancedBufferAttribute;
        (attr.array as Float32Array).set(first);
        (attr.array as Float32Array).set(second, first.length);
        attr.needsUpdate = true;
      };
      fill('aRgb', sampleOf(from), sampleOf(to));
      fill('aFrom', placement(from, from), placement(to, from));
      fill('aTo', placement(from, to), placement(to, to));
    }
    material.uniforms.uTravel.value = phase.travel;

    const previous = gl.getRenderTarget();
    gl.getClearColor(clearColour);
    const previousAlpha = gl.getClearAlpha();
    gl.setRenderTarget(gridTarget());
    gl.setClearColor(0x000000, 0);
    gl.clear(true, false, false);
    gl.render(scene, camera);
    gl.setRenderTarget(previous);
    gl.setClearColor(clearColour, previousAlpha);
  });

  return null;
}
