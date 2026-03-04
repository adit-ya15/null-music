import React, { useEffect, useState } from 'react';
import { saavnApi } from '../api/saavn';
import { usePlayer } from '../context/PlayerContext';

const LyricsModal = ({ isOpen, onClose }) => {
    const { currentTrack } = usePlayer();
    const [lyrics, setLyrics] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchLyrics = async () => {
            if (!isOpen || !currentTrack) return;

            // Only Saavn tracks might have lyrics from our API
            if (currentTrack.source !== 'saavn') {
                setLyrics("Lyrics are only available for Saavn tracks.");
                return;
            }

            setIsLoading(true);
            setError(null);

            try {
                const fetchedLyrics = await saavnApi.getLyrics(currentTrack.id);
                if (fetchedLyrics) {
                    // Clean up HTML line breaks from the API replacing them with newlines
                    const cleanLyrics = fetchedLyrics.replace(/<br\s*[\/]?>/gi, '\n');
                    setLyrics(cleanLyrics);
                } else {
                    setLyrics("No lyrics found for this track.");
                }
            } catch (err) {
                setError("Failed to load lyrics.");
            } finally {
                setIsLoading(false);
            }
        };

        fetchLyrics();
    }, [isOpen, currentTrack]);

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content lyrics-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>Lyrics - {currentTrack?.title}</h2>
                    <button className="close-btn" onClick={onClose}>&times;</button>
                </div>
                <div className="modal-body lyrics-body">
                    {isLoading ? (
                        <div className="spinner"></div>
                    ) : error ? (
                        <p className="error-text">{error}</p>
                    ) : (
                        <pre className="lyrics-text">{lyrics}</pre>
                    )}
                </div>
            </div>
        </div>
    );
};

export default LyricsModal;
