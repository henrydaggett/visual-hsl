import { useEffect, useRef, useState } from 'react';
import { formatIn, toHex } from '../lib/spaces';
import { MAX_SWATCHES, type Scale, type Swatch, useStore } from '../store';
import './panel.css';

/** `onClose` dismisses the panel on narrow screens, where it is a full-page sheet. */
export function Panel({ onClose }: { onClose: () => void }) {
  const scales = useStore((s) => s.scales);
  useShortcuts();
  return (
    <aside className="panel" aria-label="Colour scales">
      <header className="panel-header">
        <span>Colours</span>
        <button type="button" className="panel-close" aria-label="Close colours" onClick={onClose}>
          ×
        </button>
      </header>
      <div className="panel-scales">
        {scales.map((scale) => (
          <ScaleColumn key={scale.id} scale={scale} onClose={onClose} />
        ))}
      </div>
    </aside>
  );
}

/** Delete/Backspace removes the selected swatch, Escape deselects. Ignored while typing. */
function useShortcuts() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (
        t instanceof HTMLElement &&
        (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
      )
        return;
      const { selection, removeSwatch, select } = useStore.getState();
      if (!selection) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        removeSwatch(selection.scaleId, selection.swatchId);
      } else if (e.key === 'Escape') {
        select(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}

function ScaleColumn({ scale, onClose }: { scale: Scale; onClose: () => void }) {
  const addSwatch = useStore((s) => s.addSwatch);
  const selectedId = useStore((s) =>
    s.selection?.scaleId === scale.id ? s.selection.swatchId : null,
  );
  return (
    <section className="scale" aria-label={`${scale.name} scale`}>
      <h2 className="scale-name">{scale.name}</h2>
      <ul className="scale-list">
        {scale.swatches.map((swatch, i) => (
          <SwatchRow
            key={swatch.id}
            scaleId={scale.id}
            swatch={swatch}
            index={i}
            selected={swatch.id === selectedId}
            onClose={onClose}
          />
        ))}
      </ul>
      {scale.swatches.length < MAX_SWATCHES && (
        <button
          type="button"
          className="swatch-add"
          aria-label={`Add colour to ${scale.name}`}
          title="Add colour"
          onClick={() => addSwatch(scale.id)}
        >
          +
        </button>
      )}
    </section>
  );
}

function SwatchRow({
  scaleId,
  swatch,
  index,
  selected,
  onClose,
}: {
  scaleId: string;
  swatch: Swatch;
  index: number;
  selected: boolean;
  onClose: () => void;
}) {
  const select = useStore((s) => s.select);
  const removeSwatch = useStore((s) => s.removeSwatch);
  const space = useStore((s) => s.space);
  const hex = toHex(space, swatch.hsl);
  const rowRef = useRef<HTMLLIElement>(null);
  const pick = () => select({ scaleId, swatchId: swatch.id });

  // Selection can come from the 3D scene; keep the selected row in view.
  useEffect(() => {
    if (selected) rowRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  return (
    <li
      ref={rowRef}
      className={selected ? 'swatch is-selected' : 'swatch'}
      aria-current={selected ? 'true' : undefined}
      onClick={pick}
    >
      <button
        type="button"
        className="swatch-chip"
        style={{ background: hex }}
        aria-pressed={selected}
        aria-label={`Colour ${index + 1}, ${hex}`}
        // Tapping the square goes back to the model on narrow screens (no-op on wide).
        onClick={onClose}
      />
      <div className="swatch-meta">
        <HexField scaleId={scaleId} swatchId={swatch.id} hex={hex} index={index} onFocus={pick} />
        <span className="swatch-hsl">{formatIn(space, swatch.hsl)}</span>
      </div>
      <button
        type="button"
        className="swatch-remove"
        aria-label={`Remove colour ${index + 1}, ${hex}`}
        title="Remove"
        onClick={(e) => {
          e.stopPropagation();
          removeSwatch(scaleId, swatch.id);
        }}
      >
        ×
      </button>
    </li>
  );
}

function HexField({
  scaleId,
  swatchId,
  hex,
  index,
  onFocus,
}: {
  scaleId: string;
  swatchId: string;
  hex: string;
  index: number;
  onFocus: () => void;
}) {
  const setHex = useStore((s) => s.setHex);
  // null = not edited: the field shows the store's derived hex live.
  const [draft, setDraftState] = useState<string | null>(null);
  const draftRef = useRef<string | null>(null);
  const setDraft = (v: string | null) => {
    draftRef.current = v;
    setDraftState(v);
  };

  const commit = () => {
    const text = draftRef.current;
    setDraft(null); // show the derived value again, whether or not the commit succeeds
    if (text === null) return;
    const typed = text.trim().replace(/^#/, '').toUpperCase();
    // Unchanged text: do not round-trip through hex, that could shift the HSL.
    if ('#' + typed === hex) return;
    setHex(scaleId, swatchId, text);
  };

  return (
    <input
      className="swatch-hex"
      type="text"
      value={draft ?? hex}
      size={7}
      maxLength={9}
      spellCheck={false}
      autoComplete="off"
      autoCapitalize="off"
      aria-label={`Hex value of colour ${index + 1}`}
      onClick={(e) => e.stopPropagation()}
      onFocus={onFocus}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          setDraft(null);
          e.currentTarget.blur();
        }
      }}
    />
  );
}
