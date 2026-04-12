import { saavnApi } from '../api/saavn.js';
import { pickBestTrackMatch, scoreTrackCandidate } from '../../shared/trackMatch.js';

const STREAM_CACHE_TTL_MS = 10 * 60 * 1000;

function normalizeVideoId(track) {
  const raw = track?.videoId || track?.id || '';
  return String(raw).replace(/^yt-/, '').trim();
}

function isPreviewLength(track, streamUrl = '') {
  const duration = Number(track?.duration || 0);
  if (duration > 0 && duration <= 35) return true;

  const url = String(streamUrl || '').toLowerCase();
  return url.includes('preview') || url.includes('sample') || url.includes('30sec');
}

function buildSaavnQueries(track) {
  const title = String(track?.title || '').trim();
  const artist = String(track?.artist || '').trim();
  const album = String(track?.album || '').trim();

  const queries = [
    `${title} ${artist} ${album}`.trim(),
    `${title} ${artist}`.trim(),
    title,
  ].filter(Boolean);

  return [...new Set(queries)];
}

async function resolveSaavnFallbackTrack(track, options = {}) {
  const { allowConservative = false } = options;
  if (!saavnApi) return null;

  const queries = buildSaavnQueries(track);
  if (!queries.length) return null;

  const pooledCandidates = [];
  for (const query of queries) {
    const result = await saavnApi.searchSongsSafe(query, 12);
    if (!result?.data?.length) continue;
    const formatted = result.data
      .map((song) => saavnApi.formatTrack(song))
      .filter((song) => {
        if (!song?.streamUrl) return false;
        if (isPreviewLength(song, song.streamUrl)) return false;
        const duration = Number(song?.duration || 0);
        // Accept unknown durations because Saavn metadata can be incomplete.
        return duration === 0 || duration > 35;
      });
    pooledCandidates.push(...formatted);
    if (pooledCandidates.length >= 20) break;
  }

  const seen = new Set();
  const candidates = pooledCandidates.filter((song) => {
    const key = `${song?.id || ''}|${song?.title || ''}|${song?.artist || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (!candidates.length) return null;

  const confident = pickBestTrackMatch(candidates, track, {
    getTitle: (item) => item?.title,
    getArtist: (item) => item?.artist,
  });

  if (confident?.candidate) return confident.candidate;
  if (!allowConservative) return null;

  // If strict confidence fails, allow a conservative backup pick.
  const scored = candidates
    .map((candidate) => ({
      candidate,
      score: scoreTrackCandidate(track, candidate, {
        getTitle: (item) => item?.title,
        getArtist: (item) => item?.artist,
      }),
    }))
    .sort((left, right) => right.score.combinedScore - left.score.combinedScore);

  const backup = scored[0];
  if (!backup) return null;
  if (backup.score.titleScore < 0.54) return null;
  if (backup.score.combinedScore < 0.6) return null;
  if (backup.score.artistScore < 0.12) return null;
  return backup.candidate;
}

function withTimeoutValue(promise, timeoutMs, fallbackValue = null) {
  const ms = Math.max(300, Number(timeoutMs || 0));
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(fallbackValue), ms)),
  ]);
}

export function createMusicSources({
  youtubeApi,
  jamendoApi,
  soundcloudApi,
  monochromeResolver,
}) {
  const streamCache = new Map();

  function getCachedStream(videoId) {
    const cached = streamCache.get(videoId);
    if (!cached) return null;
    if (cached.expiresAt <= Date.now()) {
      streamCache.delete(videoId);
      return null;
    }
    return {
      streamUrl: cached.streamUrl,
      streamSource: cached.streamSource,
      verified: true,
      cacheState: 'memory',
    };
  }

  function setCachedStream(videoId, resolved) {
    if (!videoId || !resolved?.streamUrl) return;
    streamCache.set(videoId, {
      streamUrl: resolved.streamUrl,
      streamSource: resolved.streamSource || 'unknown',
      expiresAt: Date.now() + STREAM_CACHE_TTL_MS,
    });

    if (streamCache.size > 400) {
      const oldestKey = streamCache.keys().next().value;
      if (oldestKey) streamCache.delete(oldestKey);
    }
  }

  async function resolveYoutubePrimary(videoId, track) {
    if (!monochromeResolver) return null;

    const monochromePromise = monochromeResolver(videoId, {
      title: track?.title,
      artist: track?.artist,
    });
    const timeoutMs = Math.max(5000, Number(track?.monochromeTimeoutMs || 6500));
    const race = await Promise.race([
      monochromePromise,
      new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);

    // Return Monochrome if it succeeded with a full song
    if (race?.streamUrl && !isPreviewLength(track, race.streamUrl) && race?.resolutionMode !== 'search-fallback') {
      const nextResolved = {
        ...race,
        streamSource: race.streamSource || 'monochrome',
        monochromeAttempted: true,
      };
      setCachedStream(videoId, nextResolved);
      return nextResolved;
    }

    // Fall back to Saavn if Monochrome failed or returned preview
    const saavnResolved = await resolveSaavnFallbackTrack(track, { allowConservative: false });
    if (saavnResolved?.streamUrl) {
      const nextResolved = {
        streamUrl: saavnResolved.streamUrl,
        streamSource: saavnResolved.streamSource || 'saavn',
        title: saavnResolved.title || track?.title,
        artist: saavnResolved.artist || track?.artist,
        coverArt: saavnResolved.coverArt || track?.coverArt,
        duration: saavnResolved.duration || track?.duration,
        monochromeAttempted: true, // Mark that Monochrome was tried first
      };
      setCachedStream(videoId, nextResolved);
      return nextResolved;
    }

    return null;
  }

  async function resolveYoutubeSaavnConservative(videoId, track) {
    const saavnResolved = await resolveSaavnFallbackTrack(track, { allowConservative: true });
    if (!saavnResolved?.streamUrl) return null;

    const nextResolved = {
      streamUrl: saavnResolved.streamUrl,
      streamSource: saavnResolved.streamSource || 'saavn',
      title: saavnResolved.title || track?.title,
      artist: saavnResolved.artist || track?.artist,
      coverArt: saavnResolved.coverArt || track?.coverArt,
      duration: saavnResolved.duration || track?.duration,
    };
    setCachedStream(videoId, nextResolved);
    return nextResolved;
  }

  const youtubeSource = {
    id: 'youtube',
    async search(query, limit = 20) {
      return youtubeApi.searchSongsSafe(query, limit);
    },
    async getStreamUrl(track, options = {}) {
      const videoId = normalizeVideoId(track);
      if (!videoId) return null;

      const cached = getCachedStream(videoId);
      if (cached?.streamUrl) {
        return cached;
      }

      // Primary: Try Monochrome first, fallback to Saavn
      const resolvedPrimary = await resolveYoutubePrimary(videoId, track);
      if (resolvedPrimary?.streamUrl) {
        return resolvedPrimary;
      }

      // Final safety: Conservative Saavn (allow lower match confidence)
      const conservativeSaavn = await withTimeoutValue(
        resolveYoutubeSaavnConservative(videoId, track),
        4500,
        null
      );
      if (conservativeSaavn?.streamUrl) {
        return conservativeSaavn;
      }

      if (youtubeApi && youtubeApi.getStreamDetails) {
        const backendResolved = await youtubeApi.getStreamDetails(videoId, {
            ...options,
            title: track?.title,
            artist: track?.artist
        });
        if (backendResolved?.streamUrl || backendResolved?.directUrl) {
           return {
             streamUrl: backendResolved.streamUrl || backendResolved.directUrl,
             streamSource: backendResolved.streamSource || 'youtube-backend',
             cacheState: backendResolved.cacheState,
           };
        }
      }

      return null;
    },
  };

  const monochromeSource = {
    id: 'monochrome',
    async search() {
      return { ok: true, data: [], error: null };
    },
    async getStreamUrl(track) {
      const videoId = normalizeVideoId(track);
      if (!videoId) return null;
      if (!monochromeResolver) return null;
      return monochromeResolver(videoId, {
        title: track?.title,
        artist: track?.artist,
      });
    },
  };

  const jamendoSource = {
    id: 'jamendo',
    async search(query, limit = 20) {
      if (!jamendoApi) return { ok: false, data: [], error: 'Jamendo is unavailable.' };
      return jamendoApi.searchSongsSafe(query, limit);
    },
    async getStreamUrl(track) {
      if (!jamendoApi) return null;

      const resolved = await jamendoApi.resolveStreamSafe({
        url: track?.streamUrl || track?.url,
        title: track?.title,
        artist: track?.artist,
        trackId: track?.originalId || normalizeVideoId(track),
      });

      if (!resolved.ok || !resolved.data?.streamUrl) return null;

      return {
        streamUrl: resolved.data.streamUrl,
        streamSource: resolved.data.streamSource || 'jamendo',
        verified: true,
      };
    },
  };

  const soundcloudSource = {
    id: 'soundcloud',
    async search(query, limit = 20) {
      if (!soundcloudApi) return { ok: false, data: [], error: 'SoundCloud is unavailable.' };
      return soundcloudApi.searchSongsSafe(query, limit);
    },
    async getStreamUrl(track) {
      if (!soundcloudApi) return null;

      const resolved = await soundcloudApi.resolveStreamSafe({
        trackId: track?.originalId || String(track?.id || '').replace(/^sc-/, ''),
        transcodings: Array.isArray(track?.transcodings) ? track.transcodings : [],
      });

      if (!resolved.ok || !resolved.data?.streamUrl) return null;

      return {
        streamUrl: resolved.data.streamUrl,
        streamSource: resolved.data.streamSource || 'soundcloud',
        verified: true,
      };
    },
  };

  return {
    youtube: youtubeSource,
    monochrome: monochromeSource,
    jamendo: jamendoSource,
    soundcloud: soundcloudSource,
  };
}
