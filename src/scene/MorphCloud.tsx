import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { BufferAttribute, BufferGeometry, type Points, ShaderMaterial } from 'three';
import { HEIGHT, rgbToCylinder } from '../lib/space';
import { morphPhase } from './morph';

/** Colours sampled per side of the sRGB cube; the cloud has this many cubed. */
const SIDE = 26;
const COUNT = SIDE ** 3;
/** Particle diameter in CSS pixels. */
const SIZE_PX = 3.2;
const PEAK_OPACITY = 0.6;
/** Share of the journey by which the last particles set off after the first. */
const STAGGER = 0.25;

/** Small deterministic generator, so the cloud is the same on every visit. */
function random(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

const vertexShader = /* glsl */ `
  attribute vec3 aRgb;
  attribute vec3 aFrom; // angle, radius, y in the old space
  attribute vec3 aTo;   // the same in the new space
  attribute float aDelay;
  uniform float uTravel;
  uniform float uSize;
  varying vec3 vRgb;

  float ease(float t) {
    return t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0;
  }

  void main() {
    float t = ease(clamp((uTravel - aDelay * ${STAGGER.toFixed(2)}) / ${(1 - STAGGER).toFixed(2)}, 0.0, 1.0));
    // Turn the shorter way round the axis.
    float turn = mod(aTo.x - aFrom.x + 3.141592653589793, 6.283185307179586) - 3.141592653589793;
    float angle = aFrom.x + turn * t;
    float radius = mix(aFrom.y, aTo.y, t);
    vec3 p = vec3(radius * cos(angle), mix(aFrom.z, aTo.z, t), radius * sin(angle));
    vRgb = aRgb;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = uSize;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vRgb;

  vec3 srgbToLinear(vec3 c) {
    return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
  }

  void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float d = dot(c, c);
    if (d > 1.0) discard;
    gl_FragColor = vec4(srgbToLinear(vRgb), uOpacity * (1.0 - smoothstep(0.45, 1.0, d)));
    #include <colorspace_fragment>
  }
`;

/**
 * While the colour space changes: a cloud of colours sampled from all of sRGB, each flying
 * from where it sits in the old space to where it sits in the new one. Hidden otherwise.
 */
export function MorphCloud() {
  const points = useRef<Points>(null);
  const filled = useRef(0);
  const dpr = useThree((s) => s.viewport.dpr);

  const [geometry, rgb] = useMemo(() => {
    const next = random(7);
    const rgb: [number, number, number][] = [];
    const colours = new Float32Array(COUNT * 3);
    let i = 0;
    for (let r = 0; r < SIDE; r++)
      for (let g = 0; g < SIDE; g++)
        for (let b = 0; b < SIDE; b++, i++) {
          // Jittered within each cell, so the cloud has no visible grid.
          const c: [number, number, number] = [
            (r + next()) / SIDE,
            (g + next()) / SIDE,
            (b + next()) / SIDE,
          ];
          rgb.push(c);
          colours.set(c, i * 3);
        }
    const geometry = new BufferGeometry();
    // Positions are computed in the shader; three still wants this attribute to exist.
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(COUNT * 3), 3));
    geometry.setAttribute('aRgb', new BufferAttribute(colours, 3));
    geometry.setAttribute('aFrom', new BufferAttribute(new Float32Array(COUNT * 3), 3));
    geometry.setAttribute('aTo', new BufferAttribute(new Float32Array(COUNT * 3), 3));
    geometry.setAttribute('aDelay', new BufferAttribute(new Float32Array(COUNT), 1));
    return [geometry, rgb] as const;
  }, []);

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: { uTravel: { value: 0 }, uOpacity: { value: 0 }, uSize: { value: SIZE_PX } },
        transparent: true,
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
      }),
    [],
  );

  useFrame(() => {
    const cloud = points.current;
    if (!cloud) return;
    const phase = morphPhase();
    cloud.visible = phase.active && phase.cloud > 0.001;
    if (!phase.active || !phase.from || !phase.to) return;

    // Once per animation: where every colour starts and ends.
    if (filled.current !== phase.id) {
      filled.current = phase.id;
      const from = geometry.getAttribute('aFrom') as BufferAttribute;
      const to = geometry.getAttribute('aTo') as BufferAttribute;
      const delay = geometry.getAttribute('aDelay') as BufferAttribute;
      for (let i = 0; i < COUNT; i++) {
        const a = rgbToCylinder(phase.from, rgb[i]);
        from.setXYZ(i, a[0], a[1], a[2]);
        const b = rgbToCylinder(phase.to, rgb[i]);
        to.setXYZ(i, b[0], b[1], b[2]);
        // Dark colours set off first, light ones last.
        delay.setX(i, a[2] / HEIGHT + 0.5);
      }
      from.needsUpdate = true;
      to.needsUpdate = true;
      delay.needsUpdate = true;
    }

    material.uniforms.uTravel.value = phase.travel;
    material.uniforms.uOpacity.value = phase.cloud * PEAK_OPACITY;
    material.uniforms.uSize.value = SIZE_PX * dpr;
  });

  return (
    <points
      ref={points}
      geometry={geometry}
      material={material}
      renderOrder={2}
      frustumCulled={false}
      visible={false}
    />
  );
}
