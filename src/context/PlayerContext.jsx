import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { getColor } from 'colorthief';
import { youtubeApi } from '../api/youtube';

const PlayerContext = createContext();

export const usePlayer = () => useContext(PlayerContext);

export const PlayerProvider = ({ children }) => {
    const [currentTrack, setCurrentTrack] = useState(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolumeState] = useState(0.8);
    const [queue, setQueue] = useState([]);
    const [queueIndex, setQueueIndex] = useState(-1);
    const [isLoading, setIsLoading] = useState(false);
    const [shuffleMode, setShuffleMode] = useState(false);
    const [repeatMode, setRepeatMode] = useState('off'); // 'off' | 'all' | 'one'
    const [dominantColor, setDominantColor] = useState('rgba(15, 15, 19, 1)');

    const audioRef = useRef(new Audio());

    // ── Play / Pause ──────────────────────────────
    const togglePlay = useCallback(() => {
        if (!currentTrack) return;
        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play().catch(e => console.error("Playback failed", e));
        }
        setIsPlaying(!isPlaying);
    }, [currentTrack, isPlaying]);

    // ── Load & play a stream URL ──────────────────
    const loadAndPlay = useCallback(async (track) => {
        setIsLoading(true);
        setCurrentTrack(track);
        setIsPlaying(false);
        audioRef.current.pause();

        try {
            let url = track.streamUrl;

            if (track.source === 'youtube' && !url) {
                const vid = track.videoId || track.id.replace(/^yt-/, '');
                const details = await youtubeApi.getStreamDetails(vid);
                if (details?.streamUrl) {
                    url = details.streamUrl;
                } else {
                    throw new Error("Could not fetch YouTube audio stream");
                }
            }

            if (url) {
                audioRef.current.src = url;
                audioRef.current.volume = volume;
                audioRef.current.currentTime = 0;
                await audioRef.current.play();
                setIsPlaying(true);
            }
        } catch (err) {
            console.error("Error playing track:", err);
        } finally {
            setIsLoading(false);
        }
    }, [volume]);

    // ── Play a track (and optionally set a new queue) ──
    const playTrack = useCallback((track, trackList) => {
        if (trackList && trackList.length > 0) {
            setQueue(trackList);
            const idx = trackList.findIndex(t => t.id === track.id);
            setQueueIndex(idx >= 0 ? idx : 0);
        }
        loadAndPlay(track);
    }, [loadAndPlay]);

    // ── Shuffle helper — pick a random index ──────
    const getShuffledIndex = useCallback((currentIdx, length) => {
        if (length <= 1) return 0;
        let next;
        do { next = Math.floor(Math.random() * length); } while (next === currentIdx);
        return next;
    }, []);

    // ── Skip Next ─────────────────────────────────
    const skipNext = useCallback(() => {
        if (queue.length === 0) return;
        let nextIdx;
        if (shuffleMode) {
            nextIdx = getShuffledIndex(queueIndex, queue.length);
        } else {
            nextIdx = queueIndex + 1;
            if (nextIdx >= queue.length) {
                if (repeatMode === 'all') nextIdx = 0;
                else return; // stop
            }
        }
        setQueueIndex(nextIdx);
        loadAndPlay(queue[nextIdx]);
    }, [queue, queueIndex, shuffleMode, repeatMode, loadAndPlay, getShuffledIndex]);

    // ── Skip Previous ─────────────────────────────
    const skipPrev = useCallback(() => {
        // If we're more than 3 seconds in, restart the current track
        if (audioRef.current.currentTime > 3) {
            audioRef.current.currentTime = 0;
            setProgress(0);
            return;
        }
        if (queue.length === 0) return;
        let prevIdx = queueIndex - 1;
        if (prevIdx < 0) {
            if (repeatMode === 'all') prevIdx = queue.length - 1;
            else { audioRef.current.currentTime = 0; setProgress(0); return; }
        }
        setQueueIndex(prevIdx);
        loadAndPlay(queue[prevIdx]);
    }, [queue, queueIndex, repeatMode, loadAndPlay]);

    // ── Seek ──────────────────────────────────────
    const seekTo = useCallback((time) => {
        audioRef.current.currentTime = time;
        setProgress(time);
    }, []);

    // ── Volume ────────────────────────────────────
    const setVolume = useCallback((v) => {
        setVolumeState(v);
        audioRef.current.volume = v;
    }, []);

    // ── Shuffle & Repeat toggles ──────────────────
    const toggleShuffle = useCallback(() => setShuffleMode(p => !p), []);
    const cycleRepeat = useCallback(() => {
        setRepeatMode(prev => prev === 'off' ? 'all' : prev === 'all' ? 'one' : 'off');
    }, []);

    // ── Audio element event listeners ─────────────
    useEffect(() => {
        const audio = audioRef.current;
        const onTimeUpdate = () => setProgress(audio.currentTime);
        const onLoadedMeta = () => setDuration(audio.duration);
        const onEnded = () => {
            if (repeatMode === 'one') {
                audio.currentTime = 0;
                audio.play();
                return;
            }
            setIsPlaying(false);
            // auto-advance
            if (queue.length > 0) {
                let nextIdx;
                if (shuffleMode) {
                    nextIdx = getShuffledIndex(queueIndex, queue.length);
                } else {
                    nextIdx = queueIndex + 1;
                    if (nextIdx >= queue.length) {
                        if (repeatMode === 'all') nextIdx = 0;
                        else return;
                    }
                }
                setQueueIndex(nextIdx);
                loadAndPlay(queue[nextIdx]);
            }
        };

        audio.addEventListener('timeupdate', onTimeUpdate);
        audio.addEventListener('loadedmetadata', onLoadedMeta);
        audio.addEventListener('ended', onEnded);
        return () => {
            audio.removeEventListener('timeupdate', onTimeUpdate);
            audio.removeEventListener('loadedmetadata', onLoadedMeta);
            audio.removeEventListener('ended', onEnded);
        };
    }, [queue, queueIndex, shuffleMode, repeatMode, loadAndPlay, getShuffledIndex]);

    // ── Media Session API ─────────────────────────
    useEffect(() => {
        if ('mediaSession' in navigator) {
            navigator.mediaSession.setActionHandler('play', togglePlay);
            navigator.mediaSession.setActionHandler('pause', togglePlay);
            navigator.mediaSession.setActionHandler('previoustrack', skipPrev);
            navigator.mediaSession.setActionHandler('nexttrack', skipNext);
            navigator.mediaSession.setActionHandler('seekto', (details) => {
                if (details.fastSeek && ('fastSeek' in audioRef.current)) {
                    audioRef.current.fastSeek(details.seekTime);
                    setProgress(details.seekTime);
                } else {
                    seekTo(details.seekTime);
                }
            });
        }
    }, [togglePlay, skipPrev, skipNext, seekTo]);

    useEffect(() => {
        if ('mediaSession' in navigator && currentTrack) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: currentTrack.title,
                artist: currentTrack.artist,
                album: currentTrack.album || 'Aura Player',
                artwork: currentTrack.coverArt ? [
                    { src: currentTrack.coverArt, sizes: '500x500', type: 'image/jpeg' },
                    { src: currentTrack.coverArt, sizes: '512x512', type: 'image/png' }
                ] : []
            });
        }
    }, [currentTrack]);

    // ── Dominant Color Extraction ─────────────────
    useEffect(() => {
        if (!currentTrack?.coverArt) {
            setDominantColor('rgba(15, 15, 19, 1)');
            return;
        }

        const img = new Image();
        img.crossOrigin = 'Anonymous';

        img.onload = async () => {
            try {
                const colorObj = await getColor(img);
                if (colorObj) {
                    if (typeof colorObj.css === 'function') {
                        setDominantColor(colorObj.css('rgb'));
                    } else if (Array.isArray(colorObj) && colorObj.length >= 3) {
                        setDominantColor(`rgb(${colorObj[0]}, ${colorObj[1]}, ${colorObj[2]})`);
                    } else {
                        setDominantColor('rgba(15, 15, 19, 1)');
                    }
                }
            } catch (err) {
                console.warn("ColorThief failed:", err);
                setDominantColor('rgba(15, 15, 19, 1)');
            }
        };

        img.onerror = () => {
            setDominantColor('rgba(15, 15, 19, 1)');
        };

        // If the URL is from our proxy or saavn, try to append a CORS proxy if necessary, 
        // but since we're using generic URLs, we just try to load it. 
        img.src = currentTrack.coverArt;
    }, [currentTrack]);

    const value = {
        currentTrack, isPlaying, progress, duration, volume, queue, queueIndex,
        isLoading, shuffleMode, repeatMode, dominantColor,
        togglePlay, playTrack, setVolume, seekTo,
        skipNext, skipPrev, toggleShuffle, cycleRepeat, setQueue
    };

    return (
        <PlayerContext.Provider value={value}>
            {children}
        </PlayerContext.Provider>
    );
};
