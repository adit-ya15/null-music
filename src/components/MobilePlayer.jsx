import React, { useState, useEffect } from 'react';
import { usePlayer } from '../context/PlayerContext';
import { ChevronDown, Play, Pause, SkipBack, SkipForward, Repeat, Shuffle, ListMusic, FileText } from 'lucide-react';

export default function MobilePlayer({ onOpenLyrics, onOpenQueue }) {
    const {
        currentTrack, isPlaying, progress, duration, isLoading,
        togglePlay, skipNext, skipPrev, seekTo,
        shuffleMode, repeatMode, toggleShuffle, cycleRepeat, dominantColor
    } = usePlayer();

    const [isExpanded, setIsExpanded] = useState(false);

    // ── Screen Wake Lock ──
    useEffect(() => {
        let wakeLock = null;
        const requestWakeLock = async () => {
            try {
                if ('wakeLock' in navigator && isExpanded) {
                    wakeLock = await navigator.wakeLock.request('screen');
                }
            } catch (err) {
                console.warn("Wake Lock error:", err.message);
            }
        };

        requestWakeLock();

        const handleVisibilityChange = () => {
            if (wakeLock !== null && document.visibilityState === 'visible') {
                requestWakeLock();
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            if (wakeLock !== null) {
                wakeLock.release().then(() => { wakeLock = null; });
            }
        };
    }, [isExpanded]);

    if (!currentTrack) return null;

    const formatTime = (time) => {
        if (!time && time !== 0) return '0:00';
        const m = Math.floor(time / 60);
        const s = Math.floor(time % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const handleProgressScrub = (e) => {
        const val = parseFloat(e.target.value);
        seekTo(val);
    };

    // Calculate a vibrant variant of the dominant color for the full screen glow
    const glowColor = dominantColor.replace('rgb', 'rgba').replace(')', ', 0.6)');

    return (
        <div className="mobile-player-wrapper">
            {/* MINI PLAYER (Bottom bar when collapsed) */}
            <div
                className={`mobile-mini-player ${isExpanded ? 'hidden' : ''}`}
                onClick={() => setIsExpanded(true)}
            >
                <div className="mini-progress-bar" style={{ width: `${(progress / duration) * 100}%` }} />
                <div className="mini-content">
                    <img src={currentTrack.coverArt} alt="cover" className="mini-cover" />
                    <div className="mini-info">
                        <div className="mini-title">{currentTrack.title}</div>
                        <div className="mini-artist">{currentTrack.artist}</div>
                    </div>
                    <div className="mini-controls" onClick={e => e.stopPropagation()}>
                        <button className="icon-btn" onClick={togglePlay} disabled={isLoading}>
                            {isLoading ? <div className="spinner" /> : isPlaying ? <Pause fill="currentColor" size={24} /> : <Play fill="currentColor" size={24} />}
                        </button>
                    </div>
                </div>
            </div>

            {/* FULL SCREEN PLAYER (When expanded) */}
            <div
                className={`mobile-full-player ${isExpanded ? 'expanded' : ''}`}
                style={{
                    background: `linear-gradient(to bottom, ${glowColor} 0%, var(--surface-100) 80%)`
                }}
            >
                <div className="full-header">
                    <button className="icon-btn" onClick={() => setIsExpanded(false)}>
                        <ChevronDown size={28} />
                    </button>
                    <span className="now-playing-text">Now Playing</span>
                    <div style={{ width: 28 }} />
                </div>

                <div className="full-art-container">
                    <img src={currentTrack.coverArt} alt="cover" className="full-cover" />
                </div>

                <div className="full-info">
                    <h2 className="full-title">{currentTrack.title}</h2>
                    <p className="full-artist">{currentTrack.artist}</p>
                </div>

                <div className="full-progress">
                    <input
                        type="range"
                        min={0}
                        max={duration || 100}
                        value={progress}
                        onChange={handleProgressScrub}
                        className="mobile-progress-slider"
                        style={{
                            background: `linear-gradient(to right, var(--text-100) ${(progress / duration) * 100}%, rgba(255,255,255,0.2) ${(progress / duration) * 100}%)`
                        }}
                    />
                    <div className="time-labels">
                        <span>{formatTime(progress)}</span>
                        <span>{formatTime(duration)}</span>
                    </div>
                </div>

                <div className="full-controls-main">
                    <button className={`icon-btn ${shuffleMode ? 'control-active' : ''}`} onClick={toggleShuffle}>
                        <Shuffle size={24} />
                    </button>
                    <button className="icon-btn" onClick={skipPrev}>
                        <SkipBack fill="currentColor" size={32} />
                    </button>
                    <button className="play-pause-btn-large" onClick={togglePlay} disabled={isLoading}>
                        {isLoading ? <div className="spinner" /> : isPlaying ? <Pause fill="currentColor" size={36} /> : <Play fill="currentColor" size={36} style={{ marginLeft: 4 }} />}
                    </button>
                    <button className="icon-btn" onClick={skipNext}>
                        <SkipForward fill="currentColor" size={32} />
                    </button>
                    <button className={`icon-btn ${repeatMode !== 'off' ? 'control-active' : ''}`} onClick={cycleRepeat}>
                        <Repeat size={24} />
                    </button>
                </div>

                <div className="full-controls-bottom">
                    <button className="icon-btn" onClick={() => { setIsExpanded(false); onOpenLyrics(); }}>
                        <FileText size={24} />
                    </button>
                    <button className="icon-btn" onClick={() => { setIsExpanded(false); onOpenQueue(); }}>
                        <ListMusic size={24} />
                    </button>
                </div>
            </div>
        </div>
    );
}
