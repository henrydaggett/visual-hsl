import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { BackSide, Color, type Mesh, SRGBColorSpace, SphereGeometry } from 'three';
import { type HSL, hslToRgb } from '../lib/color';
import { hslToPosition } from '../lib/space';
import { useStore } from '../store';
import { POINT_RADIUS } from './picking';

const sphere = new SphereGeometry(1, 32, 20);
const OUTLINE_COLOR = new Color().setRGB(0.1, 0.1, 0.1, SRGBColorSpace);
/** Outline widths in screen pixels, whatever the zoom. */
const OUTLINE_PX = 1;
const OUTLINE_SELECTED_PX = 2.5;

/**
 * One colour point: an unlit sphere in the exact colour, inside a slightly larger dark
 * back-face hull that reads as an outline. Both are flagged transparent only so they draw
 * after the shell (which never writes depth) and are not tinted by it.
 */
function Point({ hsl, selected }: { hsl: HSL; selected: boolean }) {
  const outline = useRef<Mesh>(null);
  const { h, s, l } = hsl;
  const color = useMemo(() => {
    const [r, g, b] = hslToRgb({ h, s, l });
    return new Color().setRGB(r, g, b, SRGBColorSpace);
  }, [h, s, l]);

  useFrame(({ camera }) => {
    const px = selected ? OUTLINE_SELECTED_PX : OUTLINE_PX;
    outline.current?.scale.setScalar(POINT_RADIUS + px / camera.zoom);
  });

  return (
    <group position={hslToPosition(hsl)}>
      <mesh ref={outline} geometry={sphere} scale={POINT_RADIUS * 1.2} renderOrder={3}>
        <meshBasicMaterial color={OUTLINE_COLOR} side={BackSide} transparent toneMapped={false} />
      </mesh>
      <mesh geometry={sphere} scale={POINT_RADIUS} renderOrder={3}>
        <meshBasicMaterial color={color} transparent toneMapped={false} />
      </mesh>
    </group>
  );
}

/** One sphere per swatch, across all scales. */
export function Points() {
  const scales = useStore((s) => s.scales);
  const selection = useStore((s) => s.selection);
  return (
    <>
      {scales.map((scale) =>
        scale.swatches.map((swatch) => (
          <Point
            key={swatch.id}
            hsl={swatch.hsl}
            selected={selection?.scaleId === scale.id && selection.swatchId === swatch.id}
          />
        )),
      )}
    </>
  );
}
