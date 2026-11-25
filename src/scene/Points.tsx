import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import type { Group } from 'three';
import {
  BackSide,
  Color,
  type Mesh,
  type MeshBasicMaterial,
  SRGBColorSpace,
  SphereGeometry,
} from 'three';
import type { HSL } from '../lib/color';
import { type SpaceId, toRgb } from '../lib/spaces';
import {
  type Cylindrical,
  hslToPosition,
  lerpCylinder,
  rgbToCylinder,
  toCylinder,
} from '../lib/space';
import { useStore } from '../store';
import { ease, morphPhase } from './morph';
import { POINT_RADIUS } from './picking';

const sphere = new SphereGeometry(1, 32, 20);
const OUTLINE_COLOR = new Color().setRGB(0.1, 0.1, 0.1, SRGBColorSpace);
/** Outline widths in screen pixels, whatever the zoom. */
const OUTLINE_PX = 0.6;
const OUTLINE_SELECTED_PX = 1.5;
/** Opacity of the other points while one is selected. */
const DIMMED = 0.22;
const FADE_SECONDS = 0.2;

/**
 * One colour point: an unlit sphere in the exact colour, inside a slightly larger dark
 * back-face hull that reads as an outline. Both are flagged transparent only so they draw
 * after the shell (which never writes depth) and are not tinted by it.
 */
function Point({
  hsl,
  space,
  selected,
  dimmed,
}: {
  hsl: HSL;
  space: SpaceId;
  selected: boolean;
  dimmed: boolean;
}) {
  const group = useRef<Group>(null);
  const outline = useRef<Mesh>(null);
  const fill = useRef<Mesh>(null);
  /** Where this dot set off from in the current change of space, and which change. */
  const journey = useRef<{ id: number; from: Cylindrical; to: Cylindrical } | null>(null);
  const position = hslToPosition(hsl, space);
  const opacity = useRef(dimmed ? DIMMED : 1);
  const { h, s, l } = hsl;
  const color = useMemo(() => {
    const [r, g, b] = toRgb(space, { h, s, l });
    return new Color().setRGB(r, g, b, SRGBColorSpace);
  }, [space, h, s, l]);

  useFrame(({ camera }, delta) => {
    // While the space changes, travel with the cloud from where this colour sat before.
    const phase = morphPhase();
    if (group.current) {
      if (phase.active && phase.from && phase.to === space) {
        if (journey.current?.id !== phase.id)
          journey.current = {
            id: phase.id,
            from: rgbToCylinder(phase.from, toRgb(space, hsl)),
            to: toCylinder(position),
          };
        group.current.position.set(...lerpCylinder(journey.current.from, journey.current.to, ease(phase.travel)));
      } else {
        group.current.position.set(...position);
      }
    }
    const px = selected ? OUTLINE_SELECTED_PX : OUTLINE_PX;
    outline.current?.scale.setScalar(POINT_RADIUS + px / camera.zoom);
    const step = ((1 - DIMMED) / FADE_SECONDS) * Math.min(delta, 0.1);
    const target = dimmed ? DIMMED : 1;
    opacity.current += Math.max(-step, Math.min(step, target - opacity.current));
    for (const mesh of [outline.current, fill.current])
      if (mesh) (mesh.material as MeshBasicMaterial).opacity = opacity.current;
  });

  return (
    <group ref={group} position={position}>
      {/* Fill first, so its depth hides the hull behind it and a faded point shows the
          page through its fill rather than the dark hull. */}
      <mesh ref={fill} geometry={sphere} scale={POINT_RADIUS} renderOrder={3}>
        <meshBasicMaterial color={color} transparent toneMapped={false} />
      </mesh>
      <mesh ref={outline} geometry={sphere} scale={POINT_RADIUS * 1.2} renderOrder={4}>
        <meshBasicMaterial color={OUTLINE_COLOR} side={BackSide} transparent toneMapped={false} />
      </mesh>
    </group>
  );
}

/** One sphere per swatch, across all scales. */
export function Points() {
  const scales = useStore((s) => s.scales);
  const selection = useStore((s) => s.selection);
  const space = useStore((s) => s.space);
  return (
    <>
      {scales.map((scale) =>
        scale.swatches.map((swatch) => (
          <Point
            key={swatch.id}
            hsl={swatch.hsl}
            space={space}
            selected={selection?.scaleId === scale.id && selection.swatchId === swatch.id}
            dimmed={selection !== null && selection.swatchId !== swatch.id}
          />
        )),
      )}
    </>
  );
}
