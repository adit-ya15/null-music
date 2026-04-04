import axios from 'axios';
import { friendlyErrorMessage, logError } from '../utils/logger';
import { buildApiUrl } from './apiBase';

const requestSoundcloud = async (tag, path, config, fallbackMessage) => {
  try {
    const response = await axios.get(buildApiUrl(`/soundcloud${path}`), config);
    return { ok: true, response, error: null };
  } catch (error) {
    logError(tag, error, { path, params: config?.params });
    return {
      ok: false,
      response: null,
      error: friendlyErrorMessage(error, fallbackMessage),
    };
  }
};

export const soundcloudApi = {
  searchSongsSafe: async (query, limit = 10) => {
    const result = await requestSoundcloud(
      'soundcloud.searchSongs',
      '/search',
      { params: { query, limit }, timeout: 12000 },
      'SoundCloud search is unavailable right now.'
    );

    if (!result.ok) {
      return { ok: false, data: [], error: result.error };
    }

    return {
      ok: true,
      data: result.response?.data?.results || [],
      error: null,
    };
  },

  resolveStreamSafe: async ({ permalinkUrl, url, title, artist, trackId }) => {
    try {
      const response = await axios.post(
        buildApiUrl('/soundcloud/resolve'),
        { permalinkUrl, url, title, artist, trackId },
        { timeout: 15000 }
      );

      const streamUrl = typeof response?.data?.streamUrl === 'string' ? response.data.streamUrl.trim() : '';
      if (!streamUrl) {
        return { ok: false, data: null, error: 'SoundCloud stream unavailable.' };
      }

      return {
        ok: true,
        data: {
          streamUrl,
          streamSource: response?.data?.streamSource || 'soundcloud',
        },
        error: null,
      };
    } catch (error) {
      logError('soundcloud.resolveStream', error, { permalinkUrl, title, artist, trackId });
      return {
        ok: false,
        data: null,
        error: friendlyErrorMessage(error, 'Could not resolve SoundCloud stream right now.'),
      };
    }
  },
};
