import { Canvas } from '@react-three/fiber';
import { Points } from './Points';
import { CAMERA_DISTANCE, DEFAULT_AZIMUTH, DEFAULT_ELEVATION, Rig } from './Rig';
import { Rims, Shell } from './Shell';

const cameraPosition: [number, number, number] = [
  CAMERA_DISTANCE * Math.cos(DEFAULT_ELEVATION) * Math.cos(DEFAULT_AZIMUTH),
  CAMERA_DISTANCE * Math.sin(DEFAULT_ELEVATION),
  CAMERA_DISTANCE * Math.cos(DEFAULT_ELEVATION) * Math.sin(DEFAULT_AZIMUTH),
];

/** The 3D scene. `stage` is the element that wraps both the canvas and the controls
 *  overlay; OrbitControls and picking listen on it. */
export function Scene({ stage }: { stage: HTMLElement }) {
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
      <Rims />
      <Points />
    </Canvas>
  );
}
