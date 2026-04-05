import { friendlyErrorMessage, logError } from '../utils/logger';

const YT_PLAYLIST_IMPORT_ENDPOINT = String(import.meta?.env?.VITE_YOUTUBE_PLAYLIST_IMPORT_ENDPOINT || '/api/plugins/youtube-playlist').trim();

export function extractYoutubePlaylistId(value = '') {
  const text = String(value || '').trim();
  if (!text) return '';

  const decoded = (() => {
    try {
      return decodeURIComponent(text);
    } catch {
      return text;
    }
  })();

  const match = decoded.match(/(?:[?&]list=|\blist=)([a-zA-Z0-9_-]+)/);
  if (match?.[1]) return match[1];

  try {
    const parsed = new URL(decoded.startsWith('http') ? decoded : `https://www.youtube.com/playlist?list=${decoded}`);
    const id = String(parsed.searchParams.get('list') || '').trim();
    if (id) return id;
  } catch {
    // Ignore URL parse failures and continue with raw-id checks.
  }

  if (/^[a-zA-Z0-9_-]{10,}$/.test(text)) return text;
  return '';
}

export const youtubePlaylistsApi = {
  isConfigured: () => Boolean(YT_PLAYLIST_IMPORT_ENDPOINT),

  importByUrlSafe: async (urlOrId) => {
    if (!YT_PLAYLIST_IMPORT_ENDPOINT) {
      return { ok: false, data: [], error: 'YouTube playlist import endpoint is not configured.' };
    }

    const playlistId = extractYoutubePlaylistId(urlOrId);
    if (!playlistId) {
      return { ok: false, data: [], error: 'Invalid YouTube playlist URL or ID.' };
    }

    try {
      const endpoint = new URL(YT_PLAYLIST_IMPORT_ENDPOINT);
      endpoint.searchParams.set('list', playlistId);
      const response = await fetch(endpoint.toString(), { headers: { Accept: 'application/json' } });

      if (!response.ok) {
        return { ok: false, data: [], error: `Playlist importer responded with ${response.status}` };
      }

      const payload = await response.json();
      const entries = Array.isArray(payload?.entries) ? payload.entries : Array.isArray(payload) ? payload : [];
      return {
        ok: true,
        data: entries,
        error: null,
      };
    } catch (error) {
      logError('youtubePlaylists.importByUrlSafe', error);
      return { ok: false, data: [], error: friendlyErrorMessage(error, 'YouTube playlist import is unavailable right now.') };
    }
  },
};
