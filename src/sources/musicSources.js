import { resolveMonochromeStream } from './monochromeSource.js';

function normalizeVideoId(track) {
  const raw = track?.videoId || track?.id || '';
  return String(raw).replace(/^yt-/, '').trim();
}

export function createMusicSources({ youtubeApi, jamendoApi }) {
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
          verified: Boolean(details?.verified),
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

  return {
    youtube: youtubeSource,
    monochrome: monochromeSource,
    jamendo: jamendoSource,
  };
}
