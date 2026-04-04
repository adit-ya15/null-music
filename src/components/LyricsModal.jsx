import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { lyricsApi } from '../api/lyrics';
import { saavnApi } from '../api/saavn';
import { usePlayer } from '../context/PlayerContext';
import { getActiveLyricIndex, parseSyncedLyrics } from '../utils/lyrics';

const LyricsModal = ({ isOpen, onClose }) => {
  const { currentTrack, progress, duration, seekTo } = usePlayer();
  const [lyrics, setLyrics] = useState({ plainLyrics: '', syncedLyrics: '', source: 'none' });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [autoFollow, setAutoFollow] = useState(true);
  const activeLineRef = useRef(null);

  const formatLyricTime = useCallback((seconds = 0) => {
    const safe = Math.max(0, Math.floor(Number(seconds) || 0));
    const mins = Math.floor(safe / 60);
    const secs = safe % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  const loadLyrics = useCallback(async () => {
    if (!isOpen || !currentTrack) return;

    setIsLoading(true);
    setError(null);

    try {
      const genericResult = await lyricsApi.getLyricsSafe({
        artist: currentTrack.artist,
        title: currentTrack.title,
        album: currentTrack.album || '',
        duration: currentTrack.duration || 0,
      });

      if (genericResult.ok && genericResult.data) {
        const nextLyrics = {
          plainLyrics: genericResult.data.plainLyrics || '',
          syncedLyrics: genericResult.data.syncedLyrics || '',
          source: genericResult.data.source || 'none',
        };

        if (nextLyrics.plainLyrics || nextLyrics.syncedLyrics) {
          setLyrics(nextLyrics);
          setError(null);
          return;
        }
      }

      if (currentTrack.source === 'saavn') {
        const saavnResult = await saavnApi.getLyricsSafe(currentTrack.id);
        if (saavnResult.ok && saavnResult.data) {
          const cleanLyrics = saavnResult.data.replace(/<br\s*[/]?>/gi, '\n');
          setLyrics({ plainLyrics: cleanLyrics, syncedLyrics: '', source: 'saavn' });
          setError(null);
          return;
        }
      }

      setLyrics({ plainLyrics: '', syncedLyrics: '', source: 'none' });
      setError(genericResult.error || 'No lyrics found for this track.');
    } catch {
      setError('Failed to load lyrics.');
      setLyrics({ plainLyrics: '', syncedLyrics: '', source: 'none' });
    } finally {
      setIsLoading(false);
    }
  }, [isOpen, currentTrack]);

  useEffect(() => {
    loadLyrics();
  }, [loadLyrics]);

  const syncedLines = useMemo(() => parseSyncedLyrics(lyrics.syncedLyrics), [lyrics.syncedLyrics]);
  const activeIndex = useMemo(() => getActiveLyricIndex(syncedLines, progress), [progress, syncedLines]);
  const lyricProgressPercent = useMemo(() => {
    if (!syncedLines.length) return 0;
    if (activeIndex < 0) return 0;
    return Math.min(100, Math.round(((activeIndex + 1) / syncedLines.length) * 100));
  }, [activeIndex, syncedLines]);
  const activeLine = activeIndex >= 0 ? syncedLines[activeIndex] : null;
  const nextLine = activeIndex >= 0 && activeIndex + 1 < syncedLines.length ? syncedLines[activeIndex + 1] : null;

  useEffect(() => {
    if (autoFollow && activeLineRef.current) {
      activeLineRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [activeIndex, autoFollow]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content lyrics-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lyrics-title"
      >
        <div className="modal-header">
          <div className="lyrics-headline">
            <h2 id="lyrics-title">Lyrics - {currentTrack?.title}</h2>
            <div className="lyrics-subline">
              <span>{currentTrack?.artist || 'Unknown Artist'}</span>
              <span className="lyrics-source-pill">{lyrics.source || 'none'}</span>
            </div>
          </div>
          <button className="close-btn" onClick={onClose} aria-label="Close lyrics" type="button">
            &times;
          </button>
        </div>
        <div className="modal-body lyrics-body">
          {isLoading ? (
            <div className="spinner"></div>
          ) : error ? (
            <div className="lyrics-error-state">
              <p className="error-text">{error}</p>
              <button type="button" className="btn-secondary" onClick={loadLyrics}>
                Retry
              </button>
            </div>
          ) : syncedLines.length > 0 ? (
            <>
              <div className="lyrics-sync-toolbar">
                <button
                  type="button"
                  className={`lyrics-follow-btn ${autoFollow ? 'lyrics-follow-btn--on' : ''}`}
                  onClick={() => setAutoFollow((value) => !value)}
                >
                  {autoFollow ? 'Auto-follow on' : 'Auto-follow off'}
                </button>
                <div className="lyrics-progress-strip" aria-hidden="true">
                  <span style={{ width: `${lyricProgressPercent}%` }} />
                </div>
                <span className="lyrics-progress-label">{lyricProgressPercent}%</span>
              </div>
              {(activeLine || nextLine) && (
                <div className="lyrics-now-next" role="status" aria-live="polite">
                  <p className="lyrics-now-line">
                    {activeLine ? activeLine.text : 'Waiting for first synced line...'}
                  </p>
                  {nextLine && (
                    <p className="lyrics-next-line">Next: {nextLine.text}</p>
                  )}
                </div>
              )}
              <div className="lyrics-synced" role="log" aria-live="polite">
              {syncedLines.map((line, index) => (
                <button
                  key={`${line.time}-${index}`}
                  ref={index === activeIndex ? activeLineRef : null}
                  className={`lyrics-line ${index === activeIndex ? 'lyrics-line--active' : ''}`}
                  onClick={() => seekTo(line.time)}
                  type="button"
                >
                  <span className="lyrics-line-time">{formatLyricTime(line.time)}</span>
                  <span className="lyrics-line-text">{line.text}</span>
                </button>
              ))}
              </div>
            </>
          ) : (
            <pre className="lyrics-text">{lyrics.plainLyrics || 'No lyrics found for this track.'}</pre>
          )}
          {duration > 0 && (
            <div className="lyrics-footer-time">{formatLyricTime(progress)} / {formatLyricTime(duration)}</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LyricsModal;

