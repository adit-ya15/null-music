import React from 'react';
import { usePlayer } from '../context/PlayerContext';
import { Play } from 'lucide-react';

export default function QueueViewer({ isOpen, onClose }) {
    const { queue, queueIndex, playTrack, currentTrack, isPlaying } = usePlayer();

    if (!isOpen) return null;

    return (
        <>
            <div className="queue-overlay" onClick={onClose} />
            <div className="queue-drawer glass-panel">
                <div className="queue-header">
                    <h2>Up Next</h2>
                    <button className="close-btn" onClick={onClose}>&times;</button>
                </div>

                <div className="queue-list">
                    {queue.length === 0 ? (
                        <div className="empty-state">No tracks in queue.</div>
                    ) : (
                        queue.map((track, i) => {
                            const isActive = i === queueIndex;
                            return (
                                <div
                                    key={track.id + i}
                                    className={`queue-item ${isActive ? 'active' : ''}`}
                                    onClick={() => playTrack(track, queue)}
                                >
                                    <div className="queue-cover">
                                        <img src={track.coverArt} alt={track.title} />
                                        {isActive && isPlaying && (
                                            <div className="eq-overlay">
                                                <span className="eq-bar small">
                                                    <span></span><span></span><span></span>
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
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </>
    );
}
