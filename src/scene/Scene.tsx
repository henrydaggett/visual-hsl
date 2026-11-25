import { Canvas } from '@react-three/fiber';
import { useEffect } from 'react';
import { useStore } from '../store';
import { startMorph } from './morph';
import { FogSplat } from './FogSplat';
import { Points } from './Points';
import { CAMERA_DISTANCE, DEFAULT_AZIMUTH, DEFAULT_ELEVATION, Rig } from './Rig';
import { Rims, Shell, Slice } from './Shell';

const cameraPosition: [number, number, number] = [
  CAMERA_DISTANCE * Math.cos(DEFAULT_ELEVATION) * Math.cos(DEFAULT_AZIMUTH),
  CAMERA_DISTANCE * Math.sin(DEFAULT_ELEVATION),
  CAMERA_DISTANCE * Math.cos(DEFAULT_ELEVATION) * Math.sin(DEFAULT_AZIMUTH),
];

/** The 3D scene. `stage` is the element that wraps both the canvas and the controls
 *  overlay; OrbitControls and picking listen on it. */
export function Scene({ stage }: { stage: HTMLElement }) {
  // Animate every change of colour space made after the page has loaded: from the picker,
  // or from undo.
  useEffect(
    () =>
      useStore.subscribe((state, previous) => {
        if (state.space !== previous.space) startMorph(previous.space, state.space);
      }),
    [],
  );
  return (
    <Canvas
      orthographic
      dpr={[1, 2]}
      gl={{ alpha: true, antialias: true }}
      camera={{ position: cameraPosition, near: 0.1, far: 100, zoom: 100 }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <Rig stage={stage} />
      <Shell />
      <Slice />
      <Rims />
      <FogSplat />
      <Points />
    </Canvas>
  );
}
