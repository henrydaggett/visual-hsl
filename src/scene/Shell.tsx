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
import { KAPPA, MAX_CHROMA, REF_U, REF_V } from '../lib/hsluv';
import { CHROMA_WALL } from '../lib/oklch';
import { spaceOf } from '../lib/spaces';
import { HEIGHT, R, lightnessToY, polar, type Vec3 } from '../lib/space';
import { selectedSwatch, useStore } from '../store';

/** Fog density per world unit of depth: idle, and while a colour is selected. */
const DENSITY_IDLE = 1.4;
const DENSITY_SELECTED = 0.6;
/** Saturation boost applied to the blended fog colour: 1 leaves it as it is. */
const VIVID = 1.25;
const SLICE_OPACITY = 0.34;
const FADE_SECONDS = 0.2;

const vertexShader = /* glsl */ `
  varying vec3 vPos;
  void main() {
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Colour of a point inside the cylinder, in the current colour space. Hue is the angle
// about Y (x = r cos θ, z = r sin θ, as in space.ts) and lightness the height, in both
// spaces. The distance from the axis is HSL saturation, or CIELUV chroma for HSLuv, where
// only part of the cylinder holds real colours: anything sRGB cannot show is left empty,
// which gives the HSLuv solid its lumpy shape. The result is sRGB.
const colourChunk = /* glsl */ `
  uniform float uRadius;
  uniform float uHeight;
  uniform float uSpace; // the space's "shader" index in spaces.ts

  float channel(float n, float h, float a, float l) {
    float k = mod(n + h * 12.0, 12.0);
    return l - a * max(-1.0, min(min(k - 3.0, 9.0 - k), 1.0));
  }

  // The colours are sRGB; three's output conversion expects linear.
  vec3 srgbToLinear(vec3 c) {
    return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
  }
  vec3 linearToSrgb(vec3 c) {
    return mix(12.92 * c, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  }

  // rgb in xyz; w is how colourful the point is (0 for greys, 1 for the strongest colours).
  // inside is 1 where the space has a colour at this point, 0 where it does not.
  vec4 colourHsl(vec3 p, out float inside) {
    float h = fract(atan(p.z, p.x) / 6.283185307179586);
    float s = clamp(length(p.xz) / uRadius, 0.0, 1.0);
    float l = clamp(p.y / uHeight + 0.5, 0.0, 1.0);
    float a = s * min(l, 1.0 - l);
    vec3 rgb = vec3(channel(0.0, h, a, l), channel(8.0, h, a, l), channel(4.0, h, a, l));
    inside = 1.0;
    return vec4(clamp(rgb, 0.0, 1.0), 2.0 * a);
  }

  vec4 colourHsluv(vec3 p, out float inside) {
    inside = 0.0;
    float L = clamp(p.y / uHeight + 0.5, 0.0, 1.0) * 100.0;
    float C = length(p.xz) / uRadius * ${MAX_CHROMA.toFixed(1)};
    if (L < 0.05) return vec4(0.0);
    float ang = atan(p.z, p.x);
    // LCh(uv) -> Luv -> XYZ -> linear sRGB.
    float varU = C * cos(ang) / (13.0 * L) + ${REF_U};
    float varV = C * sin(ang) / (13.0 * L) + ${REF_V};
    if (abs(varV) < 1e-4) return vec4(0.0);
    float Y = L <= 8.0 ? L / ${KAPPA} : pow((L + 16.0) / 116.0, 3.0);
    float X = -9.0 * Y * varU / ((varU - 4.0) * varV - varU * varV);
    float Z = (9.0 * Y - 15.0 * varV * Y - varV * X) / (3.0 * varV);
    vec3 lin = vec3(
      3.240969941904521 * X - 1.537383177570093 * Y - 0.498610760293 * Z,
      -0.96924363628087 * X + 1.87596750150772 * Y + 0.041555057407175 * Z,
      0.055630079696993 * X - 0.20397695888897 * Y + 1.056971514242878 * Z
    );
    // In gamut only if every channel is within 0–1; a thin soft edge avoids stair-steps.
    float lo = min(min(lin.r, lin.g), lin.b);
    float hi = max(max(lin.r, lin.g), lin.b);
    // The low side is judged relative to luminance: near black every channel is tiny, and
    // an absolute tolerance would let the whole floor of the cylinder count as in gamut.
    inside = smoothstep(-0.04, 0.0, lo / Y) * (1.0 - smoothstep(1.0, 1.015, hi));
    return vec4(linearToSrgb(clamp(lin, 0.0, 1.0)), clamp(C / 95.0, 0.0, 1.0));
  }

  // HSV: the top of the cylinder is the full-strength colours, with white at its centre.
  vec4 colourHsv(vec3 p, out float inside) {
    float h = fract(atan(p.z, p.x) / 6.283185307179586) * 6.0;
    float s = clamp(length(p.xz) / uRadius, 0.0, 1.0);
    float v = clamp(p.y / uHeight + 0.5, 0.0, 1.0);
    vec3 k = mod(vec3(5.0, 3.0, 1.0) + h, 6.0);
    vec3 rgb = v - v * s * clamp(min(k, 4.0 - k), 0.0, 1.0);
    inside = 1.0;
    return vec4(rgb, s * v);
  }

  // OKLCH: radius is Oklab chroma. As with HSLuv, only what sRGB can show is filled.
  vec4 colourOklch(vec3 p, out float inside) {
    inside = 0.0;
    float L = clamp(p.y / uHeight + 0.5, 0.0, 1.0);
    float C = length(p.xz) / uRadius * ${CHROMA_WALL};
    if (L < 0.001) return vec4(0.0);
    float ang = atan(p.z, p.x);
    float a = C * cos(ang);
    float b = C * sin(ang);
    vec3 lms = vec3(
      L + 0.3963377774 * a + 0.2158037573 * b,
      L - 0.1055613458 * a - 0.0638541728 * b,
      L - 0.0894841775 * a - 1.2914855480 * b
    );
    lms = lms * lms * lms;
    vec3 lin = vec3(
      4.0767416621 * lms.x - 3.3077115913 * lms.y + 0.2309699292 * lms.z,
      -1.2684380046 * lms.x + 2.6097574011 * lms.y - 0.3413193965 * lms.z,
      -0.0041960863 * lms.x - 0.7034186147 * lms.y + 1.7076147010 * lms.z
    );
    float lo = min(min(lin.r, lin.g), lin.b);
    float hi = max(max(lin.r, lin.g), lin.b);
    // Judged relative to luminance (about L cubed), as in HSLuv, so black stays empty.
    inside = smoothstep(-0.04, 0.0, lo / (L * L * L)) * (1.0 - smoothstep(1.0, 1.015, hi));
    return vec4(linearToSrgb(clamp(lin, 0.0, 1.0)), clamp(C / 0.17, 0.0, 1.0));
  }

  vec4 colourAt(vec3 p, out float inside) {
    if (uSpace > 2.5) return colourOklch(p, inside);
    if (uSpace > 1.5) return colourHsv(p, inside);
    if (uSpace > 0.5) return colourHsluv(p, inside);
    return colourHsl(p, inside);
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
  ${colourChunk}

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
      float inside;
      vec4 c = colourAt(p, inside);
      float sa = 1.0 - exp(-uDensity * inside * (0.12 + 0.88 * c.w) * dt);
      colour += (1.0 - alpha) * sa * c.rgb;
      alpha += (1.0 - alpha) * sa;
    }
    // Blending many colours along a ray greys them out; push the result back away from
    // its own grey to keep the fog vivid.
    vec3 fog = colour / max(alpha, 1e-4);
    float grey = dot(fog, vec3(0.299, 0.587, 0.114));
    fog = clamp(mix(vec3(grey), fog, ${VIVID.toFixed(2)}), 0.0, 1.0);
    gl_FragColor = vec4(srgbToLinear(fog), alpha);
    #include <colorspace_fragment>
  }
`;

const sliceFragment = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vPos;
  ${colourChunk}

  void main() {
    float inside;
    vec3 rgb = colourAt(vPos, inside).rgb;
    gl_FragColor = vec4(srgbToLinear(rgb), uOpacity * inside);
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
          uSpace: { value: 0 },
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
    const state = useStore.getState();
    const space = spaceOf(state.space);
    u.uSpace.value = space.shader;
    // Solids smaller than the cylinder get thicker fog to match.
    const boost = space.density;
    const target = (selectedSwatch(state) ? DENSITY_SELECTED : DENSITY_IDLE) * boost;
    u.uDensity.value = approach(u.uDensity.value, target, DENSITY_IDLE * boost, delta);
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
          uSpace: { value: 0 },
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
    const state = useStore.getState();
    const swatch = selectedSwatch(state);
    material.uniforms.uSpace.value = spaceOf(state.space).shader;
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

  const style = { color: '#d2d2d2', lineWidth: 1, toneMapped: false, transparent: true, renderOrder: 2 };
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
