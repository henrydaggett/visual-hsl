import { useState } from 'react';
import { ControlsOverlay } from './controls/ControlsOverlay';
import { SPACES, type SpaceId, formatIn, spaceOf, toHex } from './lib/spaces';
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
      <SpacePicker />
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

/** Top left: which colour space the cylinder and every swatch's numbers are shown in. */
function SpacePicker() {
  const space = useStore((s) => s.space);
  const setSpace = useStore((s) => s.setSpace);
  return (
    <label className="space-picker">
      <span className="space-picker-label">Colour space</span>
      <span className="space-picker-value">{spaceOf(space).label}</span>
      <svg width="10" height="6" viewBox="0 0 10 6" aria-hidden="true">
        <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {/* The real control covers the whole button, invisibly, so a click anywhere on it
          opens the native picker. */}
      <select value={space} onChange={(e) => setSpace(e.target.value as SpaceId)}>
        {SPACES.map((sp) => (
          <option key={sp.id} value={sp.id}>
            {sp.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Narrow screens only: the selected colour's values, since the panel is hidden there. */
function Readout() {
  const swatch = useStore(selectedSwatch);
  const space = useStore((s) => s.space);
  if (!swatch) return null;
  const hex = toHex(space, swatch.hsl);
  return (
    <div className="readout" aria-live="off">
      <span className="readout-chip" style={{ background: hex }} />
      <span className="readout-hex">{hex}</span>
      <span className="readout-hsl">{formatIn(space, swatch.hsl)}</span>
    </div>
  );
}
