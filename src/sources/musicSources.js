import { resolveMonochromeStream } from './monochromeSource.js';

function normalizeVideoId(track) {
  const raw = track?.videoId || track?.id || '';
  return String(raw).replace(/^yt-/, '').trim();
}

export function createMusicSources({ youtubeApi, soundcloudApi }) {
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

      if (soundcloudApi) {
        const sc = await soundcloudApi.resolveStreamSafe({
          title: track?.title,
          artist: track?.artist,
          trackId: videoId,
        });
        if (sc.ok && sc.data?.streamUrl) {
          return {
            streamUrl: sc.data.streamUrl,
            streamSource: sc.data.streamSource || 'soundcloud',
            cacheState: null,
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
      return resolveMonochromeStream(videoId);
    },
  };

  const soundcloudSource = {
    id: 'soundcloud',
    async search() {
      return { ok: true, data: [], error: null };
    },
    async getStreamUrl(track) {
      const streamUrl = typeof track?.streamUrl === 'string' ? track.streamUrl.trim() : '';
      if (!streamUrl) return null;
      return {
        streamUrl,
        streamSource: 'soundcloud',
      };
    },
    async resolveTrack(track) {
      if (!soundcloudApi) return null;
      return soundcloudApi.resolveStreamSafe({
        permalinkUrl: track?.permalinkUrl,
        url: track?.url,
        title: track?.title,
        artist: track?.artist,
        trackId: normalizeVideoId(track),
      });
    },
  };

  return {
    youtube: youtubeSource,
    monochrome: monochromeSource,
    soundcloud: soundcloudSource,
  };
}
