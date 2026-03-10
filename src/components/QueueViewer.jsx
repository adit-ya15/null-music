import React from 'react';
import { usePlayer } from '../context/PlayerContext';
import { Play, X, Trash2 } from 'lucide-react';

const FALLBACK_COVER = 'https://placehold.co/120x120/27272a/71717a?text=%E2%99%AA';

export default function QueueViewer({ isOpen, onClose }) {
  const { queue, queueIndex, playTrack, isPlaying, removeFromQueue, clearQueue } = usePlayer();

  if (!isOpen) return null;

  return (
    <>
      <div className="queue-overlay" onClick={onClose} />
      <div className="queue-drawer glass-panel" role="dialog" aria-modal="true" aria-labelledby="queue-title">
        <div className="queue-header">
          <h2 id="queue-title">Up Next</h2>
          <div className="queue-header-actions">
            {queue.length > 1 && (
              <button className="queue-clear-btn" onClick={clearQueue} aria-label="Clear queue" title="Clear queue" type="button">
                <Trash2 size={16} />
              </button>
            )}
            <button className="close-btn" onClick={onClose} aria-label="Close queue" type="button">
              &times;
            </button>
          </div>
        </div>

        <div className="queue-list" role="listbox" aria-label="Queue tracks">
          {queue.length === 0 ? (
            <div className="empty-state">No tracks in queue.</div>
          ) : (
            queue.map((track, i) => {
              const isActive = i === queueIndex;
              return (
                <div
                  key={track.id + i}
                  className={`queue-item ${isActive ? 'active' : ''} queue-item-enter`}
                  style={{ animationDelay: `${Math.min(i * 24, 220)}ms` }}
                >
                  <button
                    className="queue-item-play"
                    onClick={() => playTrack(track, queue, { mode: 'list' })}
                    role="option"
                    aria-selected={isActive}
                    aria-label={`Play queued track ${track.title} by ${track.artist}`}
                    type="button"
                  >
                    <div className="queue-cover">
                      <img
                        src={track.coverArt || FALLBACK_COVER}
                        alt=""
                        onError={(e) => {
                          e.currentTarget.src = FALLBACK_COVER;
                        }}
                      />
                      {isActive && isPlaying && (
                        <div className="eq-overlay">
                          <span className="eq-bar small">
                            <span></span>
                            <span></span>
                            <span></span>
                          </span>
                        </div>
                      )}
                      {!isActive && (
                        <div className="play-overlay">
                          <Play fill="white" size={16} />
                        </div>
                      )}
                    </div>
                    <div className="queue-info">
                      <h4>{track.title}</h4>
                      <p>{track.artist}</p>
                    </div>
                  </button>
                  {!isActive && (
                    <button
                      className="queue-remove-btn"
                      onClick={() => removeFromQueue(i)}
                      aria-label={`Remove ${track.title} from queue`}
                      title="Remove from queue"
                      type="button"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
