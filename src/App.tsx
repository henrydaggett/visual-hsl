import { useState } from 'react';
import { ControlsOverlay } from './controls/ControlsOverlay';
import { Panel } from './panel/Panel';
import { Scene } from './scene/Scene';

export function App() {
  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  return (
    <div className="app">
      <div className="stage" ref={setStage}>
        {stage && <Scene stage={stage} />}
        <ControlsOverlay />
      </div>
      <Panel />
    </div>
  );
}
