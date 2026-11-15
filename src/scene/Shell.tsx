import { Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import { BackSide, CylinderGeometry, FrontSide, ShaderMaterial, type Side } from 'three';
import { HEIGHT, R, polar, type Vec3 } from '../lib/space';
import { selectedSwatch, useStore } from '../store';

const OPACITY_IDLE = 0.22;
const OPACITY_SELECTED = 0.07;
const FADE_SECONDS = 0.2;

const vertexShader = /* glsl */ `
  varying vec3 vPos;
  void main() {
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Hue from the angle about Y (x = r cos θ, z = r sin θ, as in space.ts), saturation from
// the distance to the axis, lightness from the height. The HSL→RGB result is sRGB, so it
// is converted to linear before three's output conversion turns it back into sRGB.
const fragmentShader = /* glsl */ `
  uniform float uOpacity;
  uniform float uRadius;
  uniform float uHeight;
  varying vec3 vPos;

  float channel(float n, float h, float a, float l) {
    float k = mod(n + h * 12.0, 12.0);
    return l - a * max(-1.0, min(min(k - 3.0, 9.0 - k), 1.0));
  }

  vec3 srgbToLinear(vec3 c) {
    return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
  }

  void main() {
    float h = fract(atan(vPos.z, vPos.x) / 6.283185307179586);
    float s = clamp(length(vPos.xz) / uRadius, 0.0, 1.0);
    float l = clamp(vPos.y / uHeight + 0.5, 0.0, 1.0);
    float a = s * min(l, 1.0 - l);
    vec3 rgb = vec3(channel(0.0, h, a, l), channel(8.0, h, a, l), channel(4.0, h, a, l));
    gl_FragColor = vec4(srgbToLinear(clamp(rgb, 0.0, 1.0)), uOpacity);
    #include <colorspace_fragment>
  }
`;

/**
 * The translucent HSL cylinder: side wall plus caps, coloured per fragment. Drawn as two
 * passes over one geometry, inside faces first and then outside faces, so the blending
 * order is the same everywhere (a single double-sided pass leaves a visible seam).
 */
export function Shell() {
  const [inner, outer, uOpacity] = useMemo(() => {
    const uOpacity = { value: OPACITY_IDLE };
    const make = (side: Side) =>
      new ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: { uOpacity, uRadius: { value: R }, uHeight: { value: HEIGHT } },
        transparent: true,
        side,
        depthWrite: false,
        toneMapped: false,
      });
    return [make(BackSide), make(FrontSide), uOpacity] as const;
  }, []);
  const geometry = useMemo(() => new CylinderGeometry(R, R, HEIGHT, 128, 1, false), []);

  useFrame((_, delta) => {
    const target = selectedSwatch(useStore.getState()) ? OPACITY_SELECTED : OPACITY_IDLE;
    const step = ((OPACITY_IDLE - OPACITY_SELECTED) / FADE_SECONDS) * Math.min(delta, 0.1);
    uOpacity.value += Math.max(-step, Math.min(step, target - uOpacity.value));
  });

  return (
    <>
      <mesh geometry={geometry} material={inner} renderOrder={0} />
      <mesh geometry={geometry} material={outer} renderOrder={1} />
    </>
  );
}

const ring = (y: number): Vec3[] =>
  Array.from({ length: 181 }, (_, i) => polar(i * 2, R, y));

/** Thin grey rings at the rims so the shape reads even when the shell is nearly gone.
 *  Drawn after the shell so the dark bottom cap does not swallow the lower one. */
export function Rims() {
  const top = useMemo(() => ring(HEIGHT / 2), []);
  const bottom = useMemo(() => ring(-HEIGHT / 2), []);
  return (
    <>
      <Line points={top} color="#9c9c9c" lineWidth={1} toneMapped={false} transparent renderOrder={2} />
      <Line points={bottom} color="#9c9c9c" lineWidth={1} toneMapped={false} transparent renderOrder={2} />
    </>
  );
}
