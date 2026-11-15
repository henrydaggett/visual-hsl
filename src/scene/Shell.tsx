import { Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import {
  BackSide,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  type Group,
  type Mesh,
  ShaderMaterial,
  Vector3,
} from 'three';
import { HEIGHT, R, lightnessToY, polar, type Vec3 } from '../lib/space';
import { selectedSwatch, useStore } from '../store';

/** Fog density per world unit of depth: idle, and while a colour is selected. */
const DENSITY_IDLE = 0.95;
const DENSITY_SELECTED = 0.2;
const SLICE_OPACITY = 0.42;
const FADE_SECONDS = 0.2;

const vertexShader = /* glsl */ `
  varying vec3 vPos;
  void main() {
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Hue from the angle about Y (x = r cos θ, z = r sin θ, as in space.ts), saturation from
// the distance to the axis, lightness from the height. The result is sRGB.
const hslChunk = /* glsl */ `
  uniform float uRadius;
  uniform float uHeight;

  float channel(float n, float h, float a, float l) {
    float k = mod(n + h * 12.0, 12.0);
    return l - a * max(-1.0, min(min(k - 3.0, 9.0 - k), 1.0));
  }

  // rgb in xyz, chroma (0 for greys, 1 for the pure hues) in w.
  vec4 colourAt(vec3 p) {
    float h = fract(atan(p.z, p.x) / 6.283185307179586);
    float s = clamp(length(p.xz) / uRadius, 0.0, 1.0);
    float l = clamp(p.y / uHeight + 0.5, 0.0, 1.0);
    float a = s * min(l, 1.0 - l);
    vec3 rgb = vec3(channel(0.0, h, a, l), channel(8.0, h, a, l), channel(4.0, h, a, l));
    return vec4(clamp(rgb, 0.0, 1.0), 2.0 * a);
  }

  // The colours are sRGB; three's output conversion expects linear.
  vec3 srgbToLinear(vec3 c) {
    return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
  }
`;

// The volume. Only back faces are drawn, so each pixel gets one fragment at the point
// where its view ray leaves the cylinder. From there the ray is traced back towards the
// camera to where it entered, and the colours along it are composited front to back.
// Greys, black and white are thinner than saturated colours, so the cylinder reads as
// full of colour rather than full of mud.
const volumeFragment = /* glsl */ `
  uniform float uDensity;
  uniform vec3 uToCamera;
  varying vec3 vPos;
  ${hslChunk}

  const int STEPS = 40;

  void main() {
    vec3 d = uToCamera;
    // Distance back along the ray to where it entered: the wall or a cap, whichever
    // comes first.
    float t = 1e6;
    float a = dot(d.xz, d.xz);
    if (a > 1e-8) {
      float b = dot(vPos.xz, d.xz);
      float c = dot(vPos.xz, vPos.xz) - uRadius * uRadius;
      t = (-b + sqrt(max(b * b - a * c, 0.0))) / a;
    }
    if (d.y > 1e-6) t = min(t, (0.5 * uHeight - vPos.y) / d.y);
    if (d.y < -1e-6) t = min(t, (-0.5 * uHeight - vPos.y) / d.y);
    t = max(t, 0.0);

    float dt = t / float(STEPS);
    // Jitter the sample positions per pixel so the steps do not show as bands.
    float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    vec3 colour = vec3(0.0);
    float alpha = 0.0;
    for (int i = 0; i < STEPS; i++) {
      vec3 p = vPos + d * (t - (float(i) + jitter) * dt);
      vec4 c = colourAt(p);
      float sa = 1.0 - exp(-uDensity * (0.12 + 0.88 * c.w) * dt);
      colour += (1.0 - alpha) * sa * c.rgb;
      alpha += (1.0 - alpha) * sa;
    }
    gl_FragColor = vec4(srgbToLinear(colour / max(alpha, 1e-4)), alpha);
    #include <colorspace_fragment>
  }
`;

const sliceFragment = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vPos;
  ${hslChunk}

  void main() {
    gl_FragColor = vec4(srgbToLinear(colourAt(vPos).rgb), uOpacity);
    #include <colorspace_fragment>
  }
`;

const approach = (value: number, target: number, range: number, delta: number) => {
  const step = (range / FADE_SECONDS) * Math.min(delta, 0.1);
  return value + Math.max(-step, Math.min(step, target - value));
};

/** The HSL cylinder as a translucent volume of colour. */
export function Shell() {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader,
        fragmentShader: volumeFragment,
        uniforms: {
          uDensity: { value: DENSITY_IDLE },
          uToCamera: { value: new Vector3(0, 0, 1) },
          uRadius: { value: R },
          uHeight: { value: HEIGHT },
        },
        transparent: true,
        side: BackSide,
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
      }),
    [],
  );
  const geometry = useMemo(() => new CylinderGeometry(R, R, HEIGHT, 128, 1, false), []);

  useFrame(({ camera }, delta) => {
    const u = material.uniforms;
    const target = selectedSwatch(useStore.getState()) ? DENSITY_SELECTED : DENSITY_IDLE;
    u.uDensity.value = approach(u.uDensity.value, target, DENSITY_IDLE - DENSITY_SELECTED, delta);
    // Orthographic: every view ray is parallel, pointing from the scene to the camera.
    camera.getWorldDirection(u.uToCamera.value).negate();
  });

  return <mesh geometry={geometry} material={material} renderOrder={0} />;
}

/**
 * While a colour is selected: the cross-section of the cylinder at its lightness, filled
 * with the real hue and saturation wheel for that level.
 */
export function Slice() {
  const mesh = useRef<Mesh>(null);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: /* glsl */ `
          varying vec3 vPos;
          void main() {
            // World position, so the colour follows the disc's height.
            vPos = (modelMatrix * vec4(position, 1.0)).xyz;
            gl_Position = projectionMatrix * viewMatrix * vec4(vPos, 1.0);
          }
        `,
        fragmentShader: sliceFragment,
        uniforms: {
          uOpacity: { value: 0 },
          uRadius: { value: R },
          uHeight: { value: HEIGHT },
        },
        transparent: true,
        side: DoubleSide,
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
      }),
    [],
  );
  const geometry = useMemo(() => new CircleGeometry(R, 128).rotateX(-Math.PI / 2), []);

  useFrame((_, delta) => {
    const swatch = selectedSwatch(useStore.getState());
    const u = material.uniforms.uOpacity;
    u.value = approach(u.value, swatch ? SLICE_OPACITY : 0, SLICE_OPACITY, delta);
    if (!mesh.current) return;
    if (swatch) mesh.current.position.y = lightnessToY(swatch.hsl.l);
    mesh.current.visible = u.value > 0.001;
  });

  return <mesh ref={mesh} geometry={geometry} material={material} renderOrder={1} visible={false} />;
}

const ring = (y: number): Vec3[] =>
  Array.from({ length: 181 }, (_, i) => polar(i * 2, R, y));

/**
 * Thin grey outline so the shape reads even when the volume is nearly gone: rings at the
 * rims, plus the two vertical sides of the silhouette. The sides are turned every frame to
 * stay at the left and right edges as seen from the camera.
 */
export function Rims() {
  const top = useMemo(() => ring(HEIGHT / 2), []);
  const bottom = useMemo(() => ring(-HEIGHT / 2), []);
  const sides = useRef<Group>(null);
  const side = (x: number): Vec3[] => [
    [x, -HEIGHT / 2, 0],
    [x, HEIGHT / 2, 0],
  ];
  const direction = useMemo(() => new Vector3(), []);

  useFrame(({ camera }) => {
    camera.getWorldDirection(direction);
    // Puts the group's x axis at right angles to the view direction.
    if (sides.current) sides.current.rotation.y = Math.atan2(direction.x, direction.z);
  });

  const style = { color: '#9c9c9c', lineWidth: 1, toneMapped: false, transparent: true, renderOrder: 2 };
  return (
    <>
      <Line points={top} {...style} />
      <Line points={bottom} {...style} />
      <group ref={sides}>
        <Line points={side(-R)} {...style} />
        <Line points={side(R)} {...style} />
      </group>
    </>
  );
}
