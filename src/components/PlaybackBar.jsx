import { usePlayer } from '../context/PlayerContext';
import { Play, Pause, SkipForward, SkipBack, Volume2, VolumeX, Shuffle, Repeat, Repeat1 } from 'lucide-react';

export default function PlaybackBar({ onOpenLyrics, onOpenQueue }) {
    const {
        currentTrack, isPlaying, progress, duration, volume,
        isLoading, shuffleMode, repeatMode,
        togglePlay, setVolume, seekTo, skipNext, skipPrev,
        toggleShuffle, cycleRepeat
    } = usePlayer();

    const formatTime = (seconds) => {
        if (isNaN(seconds)) return '0:00';
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const handleProgressClick = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const pct = Math.max(0, Math.min(1, x / rect.width));
        if (duration) seekTo(pct * duration);
    };

    const handleVolumeClick = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        setVolume(Math.max(0, Math.min(1, x / rect.width)));
    };

    const RepeatIcon = repeatMode === 'one' ? Repeat1 : Repeat;

    return (
        <footer className="playback-bar glass-panel">
            {/* ── Now Playing ── */}
            <div className="now-playing">
                {currentTrack ? (
                    <>
                        <div
                            className="playing-cover"
                            style={{
                                backgroundImage: `url(${currentTrack.coverArt})`,
                            }}
                        />
                        <div className="playing-info">
                            <h4 className="playing-title">{currentTrack.title}</h4>
                            <p className="playing-artist">{currentTrack.artist}</p>
                        </div>
                    </>
                ) : (
                    <div className="playing-skeleton">Select a track to start listening</div>
                )}
            </div>

            {/* ── Controls ── */}
            <div className="player-controls">
                <div className="control-buttons">
                    <button
                        className={`control-btn icon-btn ${shuffleMode ? 'control-active' : ''}`}
                        onClick={toggleShuffle}
                        title="Shuffle"
                    >
                        <Shuffle size={16} />
                    </button>

                    <button className="control-btn icon-btn" onClick={skipPrev} title="Previous">
                        <SkipBack size={20} fill="currentColor" />
                    </button>

                    <button
                        className="control-btn play-pause-btn"
                        onClick={togglePlay}
                        disabled={!currentTrack}
                    >
                        {isLoading ? (
                            <div className="spinner" />
                        ) : isPlaying ? (
                            <Pause size={20} fill="black" />
                        ) : (
                            <Play size={20} fill="black" style={{ marginLeft: 2 }} />
                        )}
                    </button>

                    <button className="control-btn icon-btn" onClick={skipNext} title="Next">
                        <SkipForward size={20} fill="currentColor" />
                    </button>

                    <button
                        className={`control-btn icon-btn ${repeatMode !== 'off' ? 'control-active' : ''}`}
                        onClick={cycleRepeat}
                        title={`Repeat: ${repeatMode}`}
                    >
                        <RepeatIcon size={16} />
                    </button>
                </div>

                <div className="progress-container">
                    <span className="time current">{formatTime(progress)}</span>
                    <div className="progress-bar-bg" onClick={handleProgressClick}>
                        <div
                            className="progress-bar-fill"
                            style={{ width: `${duration ? (progress / duration) * 100 : 0}%` }}
                        >
                            <div className="progress-thumb" />
                        </div>
                    </div>
                    <span className="time total">{formatTime(duration || currentTrack?.duration || 0)}</span>
                </div>
            </div>

            {/* ── Volume & Extras ── */}
            <div className="extra-controls">
                <button
                    className="icon-btn"
                    onClick={onOpenQueue}
                    title="Up Next Queue"
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                </button>
                <button
                    className="icon-btn"
                    onClick={onOpenLyrics}
                    title="Lyrics"
                    disabled={!currentTrack || currentTrack.source !== 'saavn' || !currentTrack.hasLyrics}
                    style={{ opacity: (!currentTrack || currentTrack.source !== 'saavn' || !currentTrack.hasLyrics) ? 0.3 : 1 }}
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-2-5.5V9.5l5 2.5-5 2.5z" /></svg>
                </button>
                <button className="icon-btn" onClick={() => setVolume(volume > 0 ? 0 : 0.8)}>
                    {volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
                </button>
                <div className="volume-bar-bg" onClick={handleVolumeClick}>
                    <div className="volume-bar-fill" style={{ width: `${volume * 100}%` }}>
                        <div className="progress-thumb" />
                    </div>
                </div>
            </div>
        </footer>
    );
}
