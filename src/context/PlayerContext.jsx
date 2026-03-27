/* eslint-disable react-refresh/only-export-components */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef
} from "react";

import { Capacitor } from '@capacitor/core';

import { nativeMediaApi } from "../api/nativeMedia";
import { youtubeApi } from "../api/youtube";
import { saavnApi } from "../api/saavn";
import { recommendationsApi } from "../api/recommendations";
import { getOrCreateUserId } from "../utils/userId";

import {
  buildPlaybackSession,
  cycleSleepTimerValue,
  getPreviousQueueIndex,
  parseStoredSession,
  serializeSession
} from "../utils/playerState";
import {
  buildLocalRecommendations,
  loadStoredTrackCollections
} from "../utils/recommendationFallback";
import { MusicPlayer } from "../native/musicPlayer";

const PlayerContext = createContext();

/** Extract dominant color from an Image element using Canvas. */
function getColor(img) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const w = Math.min(img.naturalWidth || img.width, 50);
  const h = Math.min(img.naturalHeight || img.height, 50);
  canvas.width = w;
  canvas.height = h;
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  let r = 0, g = 0, b = 0, count = 0;
  for (let i = 0; i < data.length; i += 16) {
    if (data[i + 3] < 128) continue;
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    count++;
  }
  if (count === 0) return [0, 0, 0];
  return [Math.round(r / count), Math.round(g / count), Math.round(b / count)];
}

const FALLBACK_COVER =
  "https://placehold.co/500x500/27272a/71717a?text=%E2%99%AA";
const YOUTUBE_CACHE_PATH = "/api/yt/cache/";
const REMOTE_STREAM_RECHECK_MS = 12_000;
const MAX_RELIABILITY_EVENTS = 18;

function isYoutubeCacheUrl(url = "") {
  return typeof url === "string" && url.includes(YOUTUBE_CACHE_PATH);
}

export const usePlayer = () => useContext(PlayerContext);

export const PlayerProvider = ({ children }) => {

  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  const [queue, setQueue] = useState([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [queueMode, setQueueMode] = useState("list");

  const [shuffleMode, setShuffleMode] = useState(false);
  const [repeatMode, setRepeatMode] = useState("off");

  const [isLoading, setIsLoading] = useState(false);
  const [playbackError, setPlaybackError] = useState(null);
  const [dominantColor, setDominantColor] = useState("rgba(15,15,19,1)");

  const [autoRadioEnabled, setAutoRadioEnabled] = useState(() => {
    try {
      const stored = localStorage.getItem("aura-auto-radio");
      return stored == null ? true : stored === "true";
    } catch {
      return true;
    }
  });
  const [sleepTimerMinutes, setSleepTimerMinutes] = useState(null);
  const [volume, setVolumeState] = useState(0.8);
  const [equalizerState, setEqualizerState] = useState({
    available: false,
    enabled: false,
    currentPreset: 0,
    presets: [],
    message: "Equalizer is available in the Android app."
  });
  const [reliabilityDebug, setReliabilityDebug] = useState({
    lastResolved: null,
    lastPlayback: null,
    lastFallback: null,
    events: [],
  });

  const sleepTimerRef = useRef(null);
  const skipNextRef = useRef(null);
  const skipPrevRef = useRef(null);
  const playTrackRef = useRef(null);
  const queueModeRef = useRef(queueMode);
  const autoRadioEnabledRef = useRef(autoRadioEnabled);
  const isLoadingRef = useRef(isLoading);

  const playedIdsRef = useRef(new Set());
  const isFetchingRecsRef = useRef(false);
  const pendingRecsRef = useRef([]);
  const recoSnapshotRef = useRef({ ts: 0, userId: null, data: null });
  const currentTrackRef = useRef(null);
  const repeatModeRef = useRef(repeatMode);
  const loadAndPlayRef = useRef(null);
  const queueRef = useRef(queue);
  const queueIndexRef = useRef(queueIndex);
  const playSeqRef = useRef(0);
  const nativeQueueSyncSeqRef = useRef(0);
  const resolvedTrackMapRef = useRef(new Map());

  /* ── Gapless playback: pre-resolve next track URL ── */
  const preResolvedRef = useRef({ trackId: null, resolvedTrack: null, resolving: false });
  const preloadAudioRef = useRef(null);

  const recordReliabilityEvent = useCallback((kind, payload = {}) => {
    const entry = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      kind,
      at: Date.now(),
      ...payload,
    };

    setReliabilityDebug((prev) => ({
      lastResolved: kind === 'resolved' ? entry : prev.lastResolved,
      lastPlayback: kind === 'playing' || kind === 'error' ? entry : prev.lastPlayback,
      lastFallback: kind === 'fallback' ? entry : prev.lastFallback,
      events: [entry, ...(prev.events || [])].slice(0, MAX_RELIABILITY_EVENTS),
    }));
  }, []);

  const clearReliabilityEvents = useCallback(() => {
    setReliabilityDebug((prev) => ({
      ...prev,
      events: [],
    }));
  }, []);

  const getRecommendationSnapshot = useCallback(async () => {
    const userId = getOrCreateUserId();
    const now = Date.now();

    // Cache to avoid spamming the backend during autoplay and prefetch.
    if (
      recoSnapshotRef.current.data &&
      recoSnapshotRef.current.userId === userId &&
      now - recoSnapshotRef.current.ts < 2 * 60 * 1000
    ) {
      return recoSnapshotRef.current.data;
    }

    try {
      const res = await recommendationsApi.getRecommendationsSafe(userId);
      if (!res.ok || !res.data) return null;
      recoSnapshotRef.current = { ts: now, userId, data: res.data };
      return res.data;
    } catch {
      return null;
    }
  }, []);

  const mergeResolvedTrack = useCallback((baseTrack, patch = {}) => ({
    ...baseTrack,
    ...patch,
    title: patch.title || baseTrack?.title || "Unknown",
    artist: patch.artist || baseTrack?.artist || "Unknown",
    coverArt: patch.coverArt || baseTrack?.coverArt || FALLBACK_COVER,
    streamUrl: patch.streamUrl || baseTrack?.streamUrl || null,
    streamSource: patch.streamSource || baseTrack?.streamSource || null,
    cacheState: patch.cacheState || baseTrack?.cacheState || null,
    cacheCheckedAt: patch.cacheCheckedAt || baseTrack?.cacheCheckedAt || 0,
  }), []);

  const getResolvedTrackFromCache = useCallback((track) => {
    if (!track?.id) return track;
    const cachedTrack = resolvedTrackMapRef.current.get(track.id);
    return cachedTrack ? mergeResolvedTrack(track, cachedTrack) : track;
  }, [mergeResolvedTrack]);

  const persistResolvedTrack = useCallback((resolvedTrack) => {
    if (!resolvedTrack?.id) return;

    const mergedResolved = mergeResolvedTrack(resolvedTrack, resolvedTrack);
    resolvedTrackMapRef.current.set(resolvedTrack.id, mergedResolved);
    if (resolvedTrackMapRef.current.size > 250) {
      const oldestKey = resolvedTrackMapRef.current.keys().next().value;
      if (oldestKey) {
        resolvedTrackMapRef.current.delete(oldestKey);
      }
    }

    setQueue((prev) => {
      let changed = false;

      const next = prev.map((item) => {
        if (item.id !== resolvedTrack.id) return item;

        const merged = mergeResolvedTrack(item, resolvedTrack);
        if (
          item.streamUrl === merged.streamUrl &&
          item.title === merged.title &&
          item.artist === merged.artist &&
          item.coverArt === merged.coverArt
        ) {
          return item;
        }

        changed = true;
        return merged;
      });

      return changed ? next : prev;
    });

    setCurrentTrack((prev) => {
      if (!prev || prev.id !== resolvedTrack.id) return prev;

      const merged = mergeResolvedTrack(prev, resolvedTrack);
      if (
        prev.streamUrl === merged.streamUrl &&
        prev.title === merged.title &&
        prev.artist === merged.artist &&
        prev.coverArt === merged.coverArt
      ) {
        return prev;
      }

      currentTrackRef.current = merged;
      return merged;
    });
  }, [mergeResolvedTrack]);

  /* -------------------------- PLAY TRACK -------------------------- */

  const trySaavnFallback = useCallback(async (track) => {
    if (!track?.title) return null;
    const q = `${track.title} ${track.artist || ''}`.trim();
    if (!q) return null;

    // Attempt 1
    let result = await saavnApi.searchSongsSafe(q, 5);
    // If rate-limited or failed, retry once after 2s backoff
    if (!result.ok || !Array.isArray(result.data) || result.data.length === 0) {
      await new Promise((r) => setTimeout(r, 2000));
      result = await saavnApi.searchSongsSafe(q, 5);
    }
    if (!result.ok || !Array.isArray(result.data) || result.data.length === 0) return null;

    const saavnTrack = saavnApi.formatTrack(result.data[0]);
    return saavnTrack?.streamUrl || null;
  }, []);

  const resolvePlayableTrack = useCallback(async (track, options = {}) => {
    const { forceRefresh = false, record = true, reason = 'playback' } = options;
    if (!track) throw new Error("Track is required");

    track = getResolvedTrackFromCache(track);

    const isNative = Capacitor.isNativePlatform();
    const existingUrl = typeof track.streamUrl === "string" ? track.streamUrl.trim() : "";
    const isPipeUrl = existingUrl.includes("/api/yt/pipe/");
    const isCacheUrl = isYoutubeCacheUrl(existingUrl);
    const lastCacheCheck = Number(track.cacheCheckedAt || 0);
    const recentlyChecked = Date.now() - lastCacheCheck < REMOTE_STREAM_RECHECK_MS;

    if (!forceRefresh && existingUrl) {
      const shouldReuseExisting =
        track.source !== "youtube" ||
        !isNative ||
        isCacheUrl ||
        (!isPipeUrl && recentlyChecked);

      if (shouldReuseExisting) {
        return mergeResolvedTrack(track, { streamUrl: existingUrl });
      }
    }

    if (!forceRefresh && preResolvedRef.current.trackId === track.id && preResolvedRef.current.resolvedTrack) {
      return mergeResolvedTrack(track, preResolvedRef.current.resolvedTrack);
    }

    if (track.source !== "youtube") {
      if (!existingUrl) throw new Error("Stream unavailable");
      const resolved = mergeResolvedTrack(track, {
        streamUrl: existingUrl,
        streamSource: track.streamSource || track.source || 'direct',
      });
      if (record) {
        recordReliabilityEvent('resolved', {
          trackId: track.id,
          title: track.title,
          streamSource: resolved.streamSource || 'direct',
          cacheState: resolved.cacheState || (track.source === 'downloaded' ? 'offline' : null),
          reason,
          refreshed: forceRefresh,
          urlKind: resolved.streamUrl?.startsWith('file:') ? 'local-file' : 'direct',
        });
      }
      return resolved;
    }

    const videoId = track.videoId || track.id.replace(/^yt-/, "");
    const details = await youtubeApi.getStreamDetails(videoId, {
      preferDirect: isNative,
    });

    let streamUrl = details?.streamUrl || existingUrl || null;
    if (!streamUrl) {
      const saavnUrl = await trySaavnFallback(track);
      if (saavnUrl) streamUrl = saavnUrl;
    }

    if (!streamUrl) throw new Error("Stream unavailable");
    const resolved = mergeResolvedTrack(track, {
      streamUrl,
      streamSource: details?.streamSource || (isYoutubeCacheUrl(streamUrl) ? "disk-cache" : "unknown"),
      cacheState: details?.cacheState || (isYoutubeCacheUrl(streamUrl) ? "disk" : null),
      cacheCheckedAt: isNative ? Date.now() : lastCacheCheck,
    });
    if (record) {
      const fallbackSources = new Set(['piped', 'ytdl-core', 'soundcloud', 'yt-dlp']);
      recordReliabilityEvent('resolved', {
        trackId: track.id,
        title: track.title,
        streamSource: resolved.streamSource || 'unknown',
        cacheState: resolved.cacheState || null,
        reason,
        refreshed: forceRefresh,
        urlKind: isYoutubeCacheUrl(streamUrl) ? 'disk-cache' : 'remote',
      });
      if (fallbackSources.has(resolved.streamSource)) {
        recordReliabilityEvent('fallback', {
          trackId: track.id,
          title: track.title,
          streamSource: resolved.streamSource,
          message: `Resolved via ${resolved.streamSource} fallback.`,
        });
      }
    }
    return resolved;
  }, [getResolvedTrackFromCache, mergeResolvedTrack, recordReliabilityEvent, trySaavnFallback]);

  /** Pre-resolve stream URL for a track (used for gapless preloading). */
  const preResolveStream = useCallback(async (track) => {
    if (!track) return;
    const trackId = track.id;
    if (preResolvedRef.current.trackId === trackId) return; // already resolved/resolving
    preResolvedRef.current = { trackId, resolvedTrack: null, resolving: true };

    try {
      const resolvedTrack = await resolvePlayableTrack(track, { reason: 'preload' });
      if (resolvedTrack?.streamUrl) {
        persistResolvedTrack(resolvedTrack);
        preResolvedRef.current = { trackId, resolvedTrack, resolving: false };
        // Preload audio on web for instant start
        if (!Capacitor.isNativePlatform()) {
          try {
            if (preloadAudioRef.current) { preloadAudioRef.current.src = ''; }
            const audio = new Audio();
            audio.preload = 'auto';
            audio.src = resolvedTrack.streamUrl;
            preloadAudioRef.current = audio;
          } catch { /* ignore */ }
        }
      } else {
        preResolvedRef.current = { trackId: null, resolvedTrack: null, resolving: false };
      }
    } catch {
      preResolvedRef.current = { trackId: null, resolvedTrack: null, resolving: false };
    }
  }, [persistResolvedTrack, resolvePlayableTrack]);

  const loadAndPlay = useCallback(async (track) => {

    if (!track) return;

    const seq = ++playSeqRef.current;

    setIsLoading(true);
    setPlaybackError(null);

    try {
      await MusicPlayer.pause();
    } catch {
      // ignore (web/no plugin)
    }

    if (seq !== playSeqRef.current) return;

    setIsPlaying(false);
    setProgress(0);
    setDuration(0);
    recordReliabilityEvent('attempt', {
      trackId: track.id,
      title: track.title,
      message: 'Starting playback attempt.',
    });

    let resolvedTrack = track;

    try {
      if (preResolvedRef.current.trackId === track.id && preResolvedRef.current.resolvedTrack) {
        resolvedTrack = mergeResolvedTrack(track, preResolvedRef.current.resolvedTrack);
        preResolvedRef.current = { trackId: null, resolvedTrack: null, resolving: false };
      } else {
        resolvedTrack = await resolvePlayableTrack(track, { reason: 'playback' });
      }

      if (seq !== playSeqRef.current) return;

      await MusicPlayer.play({
        url: resolvedTrack.streamUrl,
        title: resolvedTrack.title,
        artist: resolvedTrack.artist,
        artwork: resolvedTrack.coverArt || FALLBACK_COVER
      });

      if (seq !== playSeqRef.current) return;

      persistResolvedTrack(resolvedTrack);
      setCurrentTrack(resolvedTrack);
      currentTrackRef.current = resolvedTrack;
      setIsPlaying(true);
      recordReliabilityEvent('playing', {
        trackId: resolvedTrack.id,
        title: resolvedTrack.title,
        streamSource: resolvedTrack.streamSource || resolvedTrack.source || 'unknown',
        cacheState: resolvedTrack.cacheState || null,
        message: 'Playback started successfully.',
      });

      // Track behavior (fire-and-forget)
      try {
        const userId = getOrCreateUserId();
        await recommendationsApi.trackSafe({ userId, song: resolvedTrack, action: 'play' });
      } catch {
        // ignore
      }

    } catch (error) {

      console.error("Playback error", error);
      if (seq !== playSeqRef.current) return;

      // Retry with Saavn once if YouTube playback failed.
      if (track?.source === 'youtube') {
        try {
          const refreshedTrack = await resolvePlayableTrack(track, { forceRefresh: true, reason: 'retry' });
          if (seq !== playSeqRef.current) return;
          if (refreshedTrack?.streamUrl && refreshedTrack.streamUrl !== resolvedTrack?.streamUrl) {
            await MusicPlayer.play({
              url: refreshedTrack.streamUrl,
              title: refreshedTrack.title,
              artist: refreshedTrack.artist,
              artwork: refreshedTrack.coverArt || FALLBACK_COVER
            });
            if (seq !== playSeqRef.current) return;
            persistResolvedTrack(refreshedTrack);
            setCurrentTrack(refreshedTrack);
            currentTrackRef.current = refreshedTrack;
            setIsPlaying(true);
            setPlaybackError(null);
            recordReliabilityEvent('fallback', {
              trackId: refreshedTrack.id,
              title: refreshedTrack.title,
              streamSource: refreshedTrack.streamSource || 'unknown',
              message: 'Recovered playback with a refreshed stream URL.',
            });
            recordReliabilityEvent('playing', {
              trackId: refreshedTrack.id,
              title: refreshedTrack.title,
              streamSource: refreshedTrack.streamSource || 'unknown',
              cacheState: refreshedTrack.cacheState || null,
              message: 'Playback recovered after refresh.',
            });
            return;
          }
        } catch {
          // ignore and continue to fallback
        }

        try {
          const saavnUrl = await trySaavnFallback(track);
          if (seq !== playSeqRef.current) return;
          if (saavnUrl && saavnUrl !== resolvedTrack?.streamUrl) {
            const fallbackTrack = mergeResolvedTrack(track, {
              streamUrl: saavnUrl,
              streamSource: 'saavn-fallback',
              cacheState: 'fallback',
            });
            await MusicPlayer.play({
              url: saavnUrl,
              title: fallbackTrack.title,
              artist: fallbackTrack.artist,
              artwork: fallbackTrack.coverArt || FALLBACK_COVER
            });
            if (seq !== playSeqRef.current) return;
            persistResolvedTrack(fallbackTrack);
            setCurrentTrack(fallbackTrack);
            currentTrackRef.current = fallbackTrack;
            setIsPlaying(true);
            setPlaybackError(null);
            recordReliabilityEvent('fallback', {
              trackId: fallbackTrack.id,
              title: fallbackTrack.title,
              streamSource: 'saavn-fallback',
              message: 'Recovered playback using the Saavn fallback stream.',
            });
            recordReliabilityEvent('playing', {
              trackId: fallbackTrack.id,
              title: fallbackTrack.title,
              streamSource: 'saavn-fallback',
              cacheState: 'fallback',
              message: 'Playback recovered with Saavn fallback.',
            });
            return;
          }
        } catch {
          // ignore
        }
      }

      setIsPlaying(false);
      setPlaybackError("Song not available");
      recordReliabilityEvent('error', {
        trackId: track.id,
        title: track.title,
        message: error?.message || 'Song not available',
      });

    } finally {

      if (seq === playSeqRef.current) {
        setIsLoading(false);
      }

    }

  }, [mergeResolvedTrack, persistResolvedTrack, recordReliabilityEvent, resolvePlayableTrack, trySaavnFallback]);

  /* -------------------------- PLAY SESSION -------------------------- */

  const playTrack = useCallback((track, trackList, options = {}) => {

    if (!track) return;

    const hydratedTrack = getResolvedTrackFromCache(track);
    const hydratedTrackList = Array.isArray(trackList)
      ? trackList.map((item) => getResolvedTrackFromCache(item))
      : trackList;

    const session = buildPlaybackSession({
      track: hydratedTrack,
      trackList: hydratedTrackList,
      mode: options.mode
    });

    setQueueMode(session.queueMode);
    setQueue(session.queue);
    setQueueIndex(session.queueIndex);

    pendingRecsRef.current = [];

    loadAndPlay(hydratedTrack);

  }, [getResolvedTrackFromCache, loadAndPlay]);

  /* -------------------------- TOGGLE PLAY -------------------------- */

  const togglePlay = useCallback(async () => {

    if (!currentTrack) return;
    if (isLoading) return;

    if (isPlaying) {

      await MusicPlayer.pause();
      setIsPlaying(false);

    } else {

      await MusicPlayer.resume();
      setIsPlaying(true);

    }

  }, [isPlaying, currentTrack, isLoading]);

  /* -------------------------- FETCH RECOMMENDATIONS (INFINITE AUTOPLAY) -------------------------- */

  const fetchRecommendations = useCallback(async (seedTrack) => {
    if (!seedTrack || isFetchingRecsRef.current) return [];
    isFetchingRecsRef.current = true;

    try {
      const results = [];
      const currentQueue = queueRef.current;
      const queueIds = new Set(currentQueue.map((track) => track.id));

      // Strategy 1: YouTube Music "Up Next" (highest-quality autoplay)
      const videoId = seedTrack.videoId || (seedTrack.source === 'youtube' ? seedTrack.id.replace(/^yt-/, '') : null);
      if (videoId) {
        try {
          const upNext = await youtubeApi.getUpNextSafe(videoId);
          if (upNext.ok) results.push(...upNext.data);
        } catch {
          // ignore
        }
      }

      // Strategy 2: Your backend recommendations (made-for-you / based-on-recent / trending)
      // These tend to be more stable than generic search fallbacks.
      if (results.length < 12) {
        const snapshot = await getRecommendationSnapshot();
        if (snapshot) {
          results.push(
            ...(snapshot.basedOnRecent || []),
            ...(snapshot.madeForYou || []),
            ...(snapshot.trending || [])
          );
        }
      }

      // Strategy 3: Saavn suggestions (if Saavn track)
      // Strategy 3: Targeted YouTube search by title (+ artist) as a last resort
      // Avoid artist-only search; it produces a lot of low-signal results.
      if (results.length < 16) {
        try {
          const q = `${seedTrack.title || ''} ${seedTrack.artist || ''}`.trim();
          if (q) {
            const similarRes = await youtubeApi.searchSongsSafe(q, 8);
            if (similarRes.ok) results.push(...similarRes.data);
          }
        } catch {
          // ignore
        }
      }

      if (results.length < 16) {
        const { history, favorites } = loadStoredTrackCollections();
        results.push(
          ...buildLocalRecommendations({
            seedTrack,
            history,
            favorites,
            limit: 12,
            excludeIds: [...queueIds, ...playedIdsRef.current],
          })
        );
      }

      // Deduplicate and filter out already played/queued tracks
      const seen = new Set();

      return results.filter(track => {
        if (!track?.id) return false;
        if (seen.has(track.id)) return false;
        if (queueIds.has(track.id)) return false;
        if (playedIdsRef.current.has(track.id)) return false;
        if (seedTrack?.id && track.id === seedTrack.id) return false;
        seen.add(track.id);
        return true;
      }).slice(0, 20);
    } catch (error) {
      console.error('Recommendation fetch failed:', error);
      return [];
    } finally {
      isFetchingRecsRef.current = false;
    }
  }, [getRecommendationSnapshot]);

  /* -------------------------- NEXT TRACK -------------------------- */

  const skipNext = useCallback(async () => {

    if (!queue.length) return;

    let nextIndex;

    if (shuffleMode) {
      if (queue.length <= 1) {
        nextIndex = 0;
      } else {
        do {
          nextIndex = Math.floor(Math.random() * queue.length);
        } while (nextIndex === queueIndex && queue.length > 1);
      }
      setQueueIndex(nextIndex);
      loadAndPlay(queue[nextIndex]);
      return;
    }

    nextIndex = queueIndex + 1;

    if (nextIndex < queue.length) {
      setQueueIndex(nextIndex);
      loadAndPlay(queue[nextIndex]);
      return;
    }

    // End of queue — autoplay with recommendations
    if (autoRadioEnabledRef.current) {
      try {
        const recs = pendingRecsRef.current.length > 0
          ? pendingRecsRef.current.splice(0)
          : await fetchRecommendations(currentTrack);

        if (recs.length > 0) {
          const newQueue = [...queue, ...recs];
          setQueue(newQueue);
          setQueueIndex(queue.length);
          loadAndPlay(recs[0]);
          return;
        }
      } catch {
        // ignore
      }
    }

    // Repeat all wraps around
    if (repeatMode === 'all' && queue.length > 0) {
      setQueueIndex(0);
      loadAndPlay(queue[0]);
      return;
    }

  }, [queue, queueIndex, shuffleMode, repeatMode, loadAndPlay, currentTrack, fetchRecommendations]);

  /* -------------------------- PREVIOUS -------------------------- */

  const skipPrev = useCallback(async () => {

    if (!queue.length) return;

    const prevIndex = getPreviousQueueIndex({
      queueIndex,
      queueLength: queue.length,
      queueMode,
      repeatMode
    });

    if (prevIndex == null) return;

    setQueueIndex(prevIndex);
    loadAndPlay(queue[prevIndex]);

  }, [queue, queueIndex, queueMode, repeatMode, loadAndPlay]);

  /* -------------------------- SEEK -------------------------- */

  const seekTo = useCallback(async (time) => {

    await MusicPlayer.seek({ position: time });
    setProgress(time);

  }, []);

  /* -------------------------- SHUFFLE -------------------------- */

  const toggleShuffle = useCallback(() => {

    setShuffleMode(v => !v);

  }, []);

  /* -------------------------- REPEAT -------------------------- */

  const cycleRepeat = useCallback(() => {

    setRepeatMode(v =>
      v === "off" ? "all" : v === "all" ? "one" : "off"
    );

  }, []);

  /* -------------------------- VOLUME CONTROL -------------------------- */

  const setVolume = useCallback(async (vol) => {
    const normalizedVol = Math.max(0, Math.min(1, vol));
    setVolumeState(normalizedVol);
    // Future: add native volume control when available
  }, []);

  const refreshEqualizerState = useCallback(async () => {
    try {
      const next = await nativeMediaApi.getEqualizerState();
      setEqualizerState({
        available: Boolean(next?.available),
        enabled: Boolean(next?.enabled),
        currentPreset: Number(next?.currentPreset || 0),
        presets: Array.isArray(next?.presets) ? next.presets : [],
        message: next?.message || "Start playback on Android to use the equalizer.",
      });
    } catch {
      setEqualizerState((prev) => ({
        ...prev,
        available: false,
        message: "Equalizer is currently unavailable.",
      }));
    }
  }, []);

  const setEqualizerEnabled = useCallback(async (enabled) => {
    const next = await nativeMediaApi.setEqualizerEnabled(Boolean(enabled));
    setEqualizerState({
      available: Boolean(next?.available),
      enabled: Boolean(next?.enabled),
      currentPreset: Number(next?.currentPreset || 0),
      presets: Array.isArray(next?.presets) ? next.presets : [],
      message: next?.message || "Start playback on Android to use the equalizer.",
    });
  }, []);

  const setEqualizerPreset = useCallback(async (preset) => {
    const next = await nativeMediaApi.setEqualizerPreset(Number(preset));
    setEqualizerState({
      available: Boolean(next?.available),
      enabled: Boolean(next?.enabled),
      currentPreset: Number(next?.currentPreset || 0),
      presets: Array.isArray(next?.presets) ? next.presets : [],
      message: next?.message || "Start playback on Android to use the equalizer.",
    });
  }, []);

  /* -------------------------- RECOMMENDATIONS FOR DISCOVER -------------------------- */

  const getRecommendationsFor = useCallback(async (seedTrack) => {
    if (!seedTrack) return [];

    try {
      const results = [];

      const videoId = seedTrack.videoId || (seedTrack.source === 'youtube' ? seedTrack.id.replace(/^yt-/, '') : null);
      if (videoId) {
        try {
          const upNext = await youtubeApi.getUpNextSafe(videoId);
          if (upNext.ok) results.push(...upNext.data);
        } catch {
          // ignore
        }
      }

      // Fill from backend recommendations to keep Discover mixes higher-quality.
      if (results.length < 10) {
        const snapshot = await getRecommendationSnapshot();
        if (snapshot) {
          results.push(
            ...(snapshot.basedOnRecent || []),
            ...(snapshot.madeForYou || [])
          );
        }
      }

      if (results.length < 5 && seedTrack.artist) {
        try {
          const artistRes = await youtubeApi.searchSongsSafe(seedTrack.artist, 8);
          if (artistRes.ok) results.push(...artistRes.data);
        } catch {
          // ignore
        }
      }

      // Deduplicate
      const seen = new Set();
      return results.filter(track => {
        if (!track?.id || seen.has(track.id) || track.id === seedTrack.id) return false;
        seen.add(track.id);
        return true;
      }).slice(0, 15);
    } catch {
      return [];
    }
  }, [getRecommendationSnapshot]);

  /* -------------------------- AUTO RADIO TOGGLE -------------------------- */

  const toggleAutoRadio = useCallback(() => {

    setAutoRadioEnabled(v => !v);

  }, []);

  /* ----------- KEEP REFS IN SYNC FOR NATIVE LISTENERS ----------- */

  useEffect(() => { skipNextRef.current = skipNext; }, [skipNext]);
  useEffect(() => { skipPrevRef.current = skipPrev; }, [skipPrev]);
  useEffect(() => { playTrackRef.current = playTrack; }, [playTrack]);
  useEffect(() => { queueModeRef.current = queueMode; }, [queueMode]);
  useEffect(() => { autoRadioEnabledRef.current = autoRadioEnabled; }, [autoRadioEnabled]);
  useEffect(() => { isLoadingRef.current = isLoading; }, [isLoading]);
  useEffect(() => { currentTrackRef.current = currentTrack; }, [currentTrack]);
  useEffect(() => { repeatModeRef.current = repeatMode; }, [repeatMode]);
  useEffect(() => { loadAndPlayRef.current = loadAndPlay; }, [loadAndPlay]);
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { queueIndexRef.current = queueIndex; }, [queueIndex]);

  useEffect(() => {
    try {
      localStorage.setItem("aura-auto-radio", String(autoRadioEnabled));
    } catch {
      // ignore storage failures
    }
  }, [autoRadioEnabled]);

  /* Track played IDs to avoid recommending already-heard songs */
  useEffect(() => {
    if (currentTrack?.id) {
      playedIdsRef.current.add(currentTrack.id);
      if (playedIdsRef.current.size > 200) {
        const arr = [...playedIdsRef.current];
        playedIdsRef.current = new Set(arr.slice(-100));
      }
    }
  }, [currentTrack]);

  useEffect(() => {
    refreshEqualizerState();
  }, [refreshEqualizerState, currentTrack?.id, isPlaying]);

  /* -------------------------- QUEUE MANAGEMENT -------------------------- */

  const removeFromQueue = useCallback((index) => {
    if (index < 0 || index >= queue.length) return;
    const newQueue = queue.filter((_, i) => i !== index);
    let newIndex = queueIndex;
    if (index < queueIndex) {
      newIndex = queueIndex - 1;
    } else if (index === queueIndex) {
      // Removing current track — play next or stop
      if (newQueue.length === 0) {
        setQueue([]);
        setQueueIndex(-1);
        return;
      }
      newIndex = Math.min(queueIndex, newQueue.length - 1);
      setQueue(newQueue);
      setQueueIndex(newIndex);
      loadAndPlay(newQueue[newIndex]);
      return;
    }
    setQueue(newQueue);
    setQueueIndex(newIndex);
  }, [queue, queueIndex, loadAndPlay]);

  const clearQueue = useCallback(() => {
    const current = queueIndex >= 0 && queueIndex < queue.length ? queue[queueIndex] : null;
    if (current) {
      setQueue([current]);
      setQueueIndex(0);
    } else {
      setQueue([]);
      setQueueIndex(-1);
    }
  }, [queue, queueIndex]);

  /* -------------------------- SLEEP TIMER WITH FADE -------------------------- */

  const fadeIntervalRef = useRef(null);

  const cycleSleepTimer = useCallback(() => {

    setSleepTimerMinutes(prev => {

      const next = cycleSleepTimerValue(prev);

      if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
      if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);

      if (next != null) {
        const fadeStart = Math.max(0, next * 60 * 1000 - 30000);

        sleepTimerRef.current = setTimeout(() => {
          // Start 30s volume fade-out
          let fadeVol = 0.8;
          fadeIntervalRef.current = setInterval(async () => {
            fadeVol -= 0.04;
            if (fadeVol <= 0) {
              clearInterval(fadeIntervalRef.current);
              await MusicPlayer.pause();
              setIsPlaying(false);
              setSleepTimerMinutes(null);
            }
          }, 1500);
        }, fadeStart);
      }

      return next;

    });

  }, []);

  /* -------------------------- DOMINANT COLOR -------------------------- */

  useEffect(() => {

    if (!currentTrack?.coverArt) {
      setDominantColor("rgba(15,15,19,1)");
      return;
    }

    const img = new Image();
    img.crossOrigin = "Anonymous";

    img.onload = () => {

      try {

        const color = getColor(img);

        if (Array.isArray(color)) {
          setDominantColor(`rgb(${color[0]},${color[1]},${color[2]})`);
        }

      } catch {
        setDominantColor("rgba(15,15,19,1)");
      }

    };

    img.src = currentTrack.coverArt;

  }, [currentTrack]);

  /* -------------------------- SESSION STORAGE -------------------------- */

  useEffect(() => {

    try {

      localStorage.setItem(
        "aura-player-session",
        serializeSession({
          queue,
          queueIndex,
          currentTrack
        })
      );

    } catch {
      // ignore
    }

  }, [queue, queueIndex, currentTrack]);

  useEffect(() => {

    const saved = parseStoredSession(
      localStorage.getItem("aura-player-session")
    );

    if (!saved) return;

    setQueue(saved.queue);
    setQueueIndex(saved.queueIndex);
    setCurrentTrack(saved.currentTrack);

  }, []);

  /* -------------------------- LOCK SCREEN CONTROLS & AUTOPLAY -------------------------- */

  useEffect(() => {
    let nextListener, prevListener, statusListener, errorListener, queueIndexListener;

    (async () => {
      try {
        nextListener = await MusicPlayer.addListener('nextTrack', () => {
          const repeat = repeatModeRef.current;

          // Natural track end with repeat-one: replay
          if (repeat === 'one') {
            const track = currentTrackRef.current;
            if (track) loadAndPlayRef.current?.(track);
            return;
          }

          // All other cases: skipNext handles autoplay, shuffle, repeat-all
          skipNextRef.current?.();
        });

        prevListener = await MusicPlayer.addListener('prevTrack', () => {
          skipPrevRef.current?.();
        });

        statusListener = await MusicPlayer.addListener('statusUpdate', (data) => {
          if (data.position != null) setProgress(data.position);
          if (data.duration != null) setDuration(data.duration);
        });

        errorListener = await MusicPlayer.addListener('playbackError', (data) => {
          const msg = data?.message ? String(data.message) : 'Song not available';
          setIsPlaying(false);
          setIsLoading(false);
          setPlaybackError(msg || 'Song not available');
          const activeTrack = currentTrackRef.current;
          recordReliabilityEvent('error', {
            trackId: activeTrack?.id || null,
            title: activeTrack?.title || 'Unknown',
            message: msg || 'Song not available',
          });
        });

        // Sync state when native background player auto-plays next track
        queueIndexListener = await MusicPlayer.addListener('queueIndexChanged', (data) => {
          const newIdx = data.index;
          if (newIdx >= 0 && newIdx < queueRef.current.length) {
            queueIndexRef.current = newIdx;
            setQueueIndex(newIdx);
            const track = queueRef.current[newIdx];
            setCurrentTrack(track);
            currentTrackRef.current = track;
            setIsPlaying(true);
            setProgress(0);
          }
        });
      } catch {
        // MusicPlayer plugin not available on web — ignore
      }
    })();

    return () => {
      nextListener?.remove?.();
      prevListener?.remove?.();
      statusListener?.remove?.();
      errorListener?.remove?.();
      queueIndexListener?.remove?.();
    };
  }, [recordReliabilityEvent]);

  /* -------------------------- PRE-FETCH RECOMMENDATIONS -------------------------- */

  useEffect(() => {
    if (!autoRadioEnabled || queue.length === 0) return;

    const remaining = queue.length - 1 - queueIndex;

    if (remaining <= 2 && !isFetchingRecsRef.current && pendingRecsRef.current.length === 0) {
      const seed = queue[queue.length - 1] || currentTrack;
      if (seed) {
        fetchRecommendations(seed).then(recs => {
          if (recs.length > 0) pendingRecsRef.current = recs;
        }).catch(() => {});
      }
    }
  }, [queueIndex, queue, autoRadioEnabled, currentTrack, fetchRecommendations]);

  useEffect(() => {
    if (!queue.length || queueIndex < 0) return;
    const nextTrack = queue[queueIndex + 1];
    if (nextTrack) {
      preResolveStream(nextTrack);
    }
  }, [queue, queueIndex, preResolveStream]);

  /* ----------- GAPLESS: Pre-resolve next track URL at 75% progress ----------- */

  useEffect(() => {
    if (!duration || duration <= 0 || !isPlaying) return;
    const pct = progress / duration;
    if (pct < 0.75 || pct > 0.98) return; // trigger window: 75–98%

    const nextIdx = queueIndexRef.current + 1;
    const q = queueRef.current;
    if (nextIdx >= q.length) return; // no next track

    const nextTrack = q[nextIdx];
    if (!nextTrack || preResolvedRef.current.trackId === nextTrack.id) return;

    preResolveStream(nextTrack);
  }, [progress, duration, isPlaying, preResolveStream]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (!isPlaying || currentTrack?.source !== 'youtube') return;

    const currentUrl = typeof currentTrack?.streamUrl === 'string' ? currentTrack.streamUrl : '';
    if (!currentUrl || isYoutubeCacheUrl(currentUrl)) return;

    const timer = setTimeout(() => {
      resolvePlayableTrack(currentTrack, { forceRefresh: true, reason: 'cache-promotion' })
        .then((refreshedTrack) => {
          if (!refreshedTrack?.streamUrl) return;
          persistResolvedTrack(refreshedTrack);
        })
        .catch(() => {});
    }, REMOTE_STREAM_RECHECK_MS);

    return () => clearTimeout(timer);
  }, [currentTrack, isPlaying, persistResolvedTrack, resolvePlayableTrack]);

  /* ----------- NATIVE: Sync queue to native for background autoplay ----------- */

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let cancelled = false;
    const syncSeq = ++nativeQueueSyncSeqRef.current;

    const syncNativeQueue = async () => {
      if (!queue.length || queueIndex < 0 || queueIndex >= queue.length) {
        try {
          await MusicPlayer.setQueue({ tracks: [], currentIndex: -1, offset: 0 });
        } catch {
          // ignore
        }
        return;
      }

      const offset = queueIndex;
      const queueWindow = queue.slice(offset, offset + 4);
      const preparedTracks = await Promise.all(queueWindow.map(async (item) => {
        try {
          return await resolvePlayableTrack(item, { record: false, reason: 'native-queue' });
        } catch {
          return item;
        }
      }));

      if (cancelled || syncSeq !== nativeQueueSyncSeqRef.current) return;

      preparedTracks.forEach((item) => {
        if (item?.streamUrl) persistResolvedTrack(item);
      });

      const nativeQueue = preparedTracks.map((item) => ({
        url: item.streamUrl || '',
        title: item.title || 'Unknown',
        artist: item.artist || 'Unknown',
        artwork: item.coverArt || '',
      }));

      try {
        await MusicPlayer.setQueue({ tracks: nativeQueue, currentIndex: 0, offset });
      } catch {
        // ignore
      }
    };

    syncNativeQueue();

    return () => {
      cancelled = true;
    };
  }, [queue, queueIndex, persistResolvedTrack, resolvePlayableTrack]);

  /* -------------------------- CONTEXT VALUE -------------------------- */

  const value = {

    currentTrack,
    isPlaying,
    progress,
    duration,
    volume,

    queue,
    queueIndex,
    queueMode,

    shuffleMode,
    repeatMode,

    dominantColor,
    isLoading,
    playbackError,

    autoRadioEnabled,
    sleepTimerMinutes,
    equalizerState,
    reliabilityDebug,

    playTrack,
    togglePlay,
    skipNext,
    skipPrev,
    seekTo,
    setVolume,

    toggleShuffle,
    cycleRepeat,
    toggleAutoRadio,
    getRecommendationsFor,
    refreshEqualizerState,
    setEqualizerEnabled,
    setEqualizerPreset,
    clearReliabilityEvents,

    cycleSleepTimer,
    setQueue,
    removeFromQueue,
    clearQueue

  };

  return (
    <PlayerContext.Provider value={value}>
      {children}
    </PlayerContext.Provider>
  );

};
