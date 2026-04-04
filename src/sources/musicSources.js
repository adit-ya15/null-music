import { resolveMonochromeStream } from './monochromeSource.js';

function normalizeVideoId(track) {
  const raw = track?.videoId || track?.id || '';
  return String(raw).replace(/^yt-/, '').trim();
}

export function createMusicSources({ youtubeApi }) {
  const youtubeSource = {
    id: 'youtube',
    async search(query, limit = 20) {
      return youtubeApi.searchSongsSafe(query, limit);
    },
    async getStreamUrl(track) {
      const videoId = normalizeVideoId(track);
      if (!videoId) return null;

      const monochrome = await resolveMonochromeStream(videoId);
      if (monochrome?.streamUrl) {
        return monochrome;
      }

      const details = await youtubeApi.getStreamDetails(videoId, { preferDirect: true });
      const streamUrl = typeof details?.streamUrl === 'string' ? details.streamUrl.trim() : '';
      if (streamUrl) {
        return {
          streamUrl,
          streamSource: details?.streamSource || 'youtube-direct',
          cacheState: details?.cacheState || null,
        };
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
      return resolveMonochromeStream(videoId);
    },
  };

  return {
    youtube: youtubeSource,
    monochrome: monochromeSource,
  };
}
