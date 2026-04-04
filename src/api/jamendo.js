import { friendlyErrorMessage, logError } from '../utils/logger';
import { validateStreamUrl } from './endpointClient';

const JAMENDO_BASE = String(import.meta?.env?.VITE_JAMENDO_BASE || 'https://api.jamendo.com/v3.0').replace(/\/+$/, '');
const JAMENDO_CLIENT_ID = String(import.meta?.env?.VITE_JAMENDO_CLIENT_ID || '').trim();

function normalizeJamendoTrack(item = {}) {
  const id = String(item.id || '').trim();
  const title = String(item.name || item.title || 'Unknown Title').trim();
  const artist = String(item.artist_name || item.artist || 'Unknown Artist').trim();
  const coverArt = String(item.image || item.album_image || '').trim();
  const streamUrl = String(item.audio || item.audiodownload || '').trim();

  return {
    id: id ? `jm-${id}` : `jm-${title.replace(/\s+/g, '-').toLowerCase()}`,
    originalId: id || '',
    title,
    artist,
    album: String(item.album_name || '').trim(),
    coverArt,
    duration: Number(item.duration || 0),
    source: 'jamendo',
    streamUrl: streamUrl || null,
  };
}

async function jamendoRequest(params = {}) {
  if (!JAMENDO_CLIENT_ID) {
    return {
      ok: false,
      data: null,
      error: 'Jamendo is not configured. Set VITE_JAMENDO_CLIENT_ID.',
    };
  }

  try {
    const url = new URL(`${JAMENDO_BASE}/tracks/`);
    url.searchParams.set('client_id', JAMENDO_CLIENT_ID);
    url.searchParams.set('format', 'json');
    url.searchParams.set('audioformat', 'mp32');
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    });

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      return {
        ok: false,
        data: null,
        error: `Jamendo responded with ${response.status}`,
      };
    }

    const payload = await response.json();
    return {
      ok: true,
      data: payload,
      error: null,
    };
  } catch (error) {
    logError('jamendo.request', error, { base: JAMENDO_BASE });
    return {
      ok: false,
      data: null,
      error: friendlyErrorMessage(error, 'Jamendo is unavailable right now.'),
    };
  }
}

export const jamendoApi = {
  searchSongsSafe: async (query, limit = 12) => {
    const result = await jamendoRequest({ namesearch: query, limit });
    if (!result.ok) {
      return { ok: false, data: [], error: result.error };
    }

    const rows = Array.isArray(result.data?.results) ? result.data.results : [];
    return {
      ok: true,
      data: rows.map(normalizeJamendoTrack),
      error: null,
    };
  },

  resolveStreamSafe: async ({ url, trackId }) => {
    const streamUrl = String(url || '').trim();
    if (streamUrl) {
      const valid = await validateStreamUrl(streamUrl);
      if (valid) {
        return {
          ok: true,
          data: { streamUrl, streamSource: 'jamendo' },
          error: null,
        };
      }
    }

    const id = String(trackId || '').trim();
    if (!id) {
      return { ok: false, data: null, error: 'Jamendo stream unavailable.' };
    }

    const result = await jamendoRequest({ id, limit: 1 });
    if (!result.ok) {
      return { ok: false, data: null, error: result.error };
    }

    const rows = Array.isArray(result.data?.results) ? result.data.results : [];
    const candidateUrl = String(rows[0]?.audio || rows[0]?.audiodownload || '').trim();
    const valid = candidateUrl ? await validateStreamUrl(candidateUrl) : false;

    if (!valid) {
      return { ok: false, data: null, error: 'Jamendo stream is invalid or unavailable.' };
    }

    return {
      ok: true,
      data: { streamUrl: candidateUrl, streamSource: 'jamendo' },
      error: null,
    };
  },
};
