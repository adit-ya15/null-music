import { useEffect, useState } from 'react';
import { usePlayer } from '../context/PlayerContext';

export default function EqualizerModal({ isOpen, onClose }) {
  const {
    equalizerState,
    refreshEqualizerState,
    setEqualizerEnabled,
    setEqualizerPreset,
  } = usePlayer();
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return undefined;

    refreshEqualizerState();
    const timer = setTimeout(() => {
      refreshEqualizerState();
    }, 600);

    return () => clearTimeout(timer);
  }, [isOpen, refreshEqualizerState]);

  if (!isOpen) return null;

  const handleToggle = async () => {
    setIsSaving(true);
    try {
      await setEqualizerEnabled(!equalizerState.enabled);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePreset = async (presetIndex) => {
    setIsSaving(true);
    try {
      if (!equalizerState.enabled) {
        await setEqualizerEnabled(true);
      }
      await setEqualizerPreset(presetIndex);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content lyrics-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="equalizer-title"
      >
        <div className="modal-header">
          <h2 id="equalizer-title">Equalizer</h2>
          <button className="close-btn" onClick={onClose} aria-label="Close equalizer" type="button">
            &times;
          </button>
        </div>

        <div className="modal-body lyrics-body">
          {!equalizerState.available ? (
            <div className="lyrics-error-state">
              <p>{equalizerState.message || 'Start playback on Android to use the equalizer.'}</p>
              <button className="btn-secondary" onClick={refreshEqualizerState} type="button">
                Refresh
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <button
                className={`section-action-btn ${equalizerState.enabled ? 'control-active' : ''}`}
                onClick={handleToggle}
                disabled={isSaving}
                type="button"
                style={{ alignSelf: 'flex-start' }}
              >
                {equalizerState.enabled ? 'Disable EQ' : 'Enable EQ'}
              </button>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
                {equalizerState.presets.map((preset, index) => (
                  <button
                    key={`${preset}-${index}`}
                    className={`section-action-btn ${equalizerState.currentPreset === index ? 'control-active' : ''}`}
                    onClick={() => handlePreset(index)}
                    disabled={isSaving}
                    type="button"
                    style={{ justifyContent: 'center' }}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
