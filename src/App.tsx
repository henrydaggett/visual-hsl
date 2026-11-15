import { useState } from 'react';
import { ControlsOverlay } from './controls/ControlsOverlay';
import { formatHsl, hslToHex } from './lib/color';
import { Panel } from './panel/Panel';
import { Scene } from './scene/Scene';
import { selectedSwatch, useStore } from './store';

export function App() {
  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  // Only matters on narrow screens, where the panel is a full-page sheet.
  const [panelOpen, setPanelOpen] = useState(false);
  return (
    <div className={panelOpen ? 'app is-panel-open' : 'app'}>
      <div className="stage" ref={setStage}>
        {stage && <Scene stage={stage} />}
        <ControlsOverlay />
      </div>
      <button
        type="button"
        className="panel-toggle"
        aria-label="Show colours"
        aria-expanded={panelOpen}
        onClick={() => setPanelOpen(true)}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
          <rect x="2" y="2" width="5" height="5" rx="1" fill="currentColor" />
          <rect x="2" y="7.5" width="5" height="5" rx="1" fill="currentColor" opacity="0.6" />
          <rect x="2" y="13" width="5" height="5" rx="1" fill="currentColor" opacity="0.3" />
          <path d="M10 4.5h8M10 10h8M10 15.5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      <Readout />
      <Panel onClose={() => setPanelOpen(false)} />
    </div>
  );
}

/** Narrow screens only: the selected colour's values, since the panel is hidden there. */
function Readout() {
  const swatch = useStore(selectedSwatch);
  if (!swatch) return null;
  const hex = hslToHex(swatch.hsl);
  return (
    <div className="readout" aria-live="off">
      <span className="readout-chip" style={{ background: hex }} />
      <span className="readout-hex">{hex}</span>
      <span className="readout-hsl">{formatHsl(swatch.hsl)}</span>
    </div>
  );
}
