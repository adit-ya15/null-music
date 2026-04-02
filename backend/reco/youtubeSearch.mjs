import { logger } from '../lib/logger.mjs';

function parseDuration(text) {
  if (!text) return 0;
  const parts = String(text).split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

function pickText(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (value && typeof value === 'object') {
      if (typeof value.text === 'string' && value.text.trim()) return value.text.trim();
      if (typeof value.name === 'string' && value.name.trim()) return value.name.trim();
      if (typeof value.toString === 'function') {
        const text = value.toString();
        if (typeof text === 'string' && text.trim() && text !== '[object Object]') {
          return text.trim();
        }
      }
    }
  }
  return '';
}

function pickThumbnail(song) {
  const thumbs = [
    ...(Array.isArray(song?.thumbnail) ? song.thumbnail : []),
    ...(Array.isArray(song?.thumbnails) ? song.thumbnails : []),
  ].filter((item) => item?.url);

  if (!thumbs.length) return '';

  thumbs.sort((a, b) => (Number(b.width || 0) * Number(b.height || 0)) - (Number(a.width || 0) * Number(a.height || 0)));
  return thumbs[0]?.url || '';
}

function mapInnertubeSong(song) {
  if (!song?.id) return null;
  return {
    id: `yt-${song.id}`,
    videoId: song.id,
    title: pickText(song.title, song.name) || 'Unknown Title',
    artist: song.artists?.map((a) => pickText(a?.name, a?.text, a)).filter(Boolean).join(', ') || 'Unknown Artist',
    album: pickText(song.album?.name, song.album?.text, song.album),
    coverArt: pickThumbnail(song),
    duration: parseDuration(song.duration?.text || song.duration || 0),
    source: 'youtube',
    // Leave streamUrl empty so the client uses its configured /api/yt pipe base.
  };
}

export async function searchYouTubeSongs(innertube, query, limit = 10) {
  if (!innertube || !query) return [];

  try {
    const searchResults = await innertube.music.search(query, { type: 'song' });
    const songs = searchResults?.songs?.contents || [];

    return songs
      .slice(0, Math.max(1, limit))
      .map(mapInnertubeSong)
      .filter(Boolean);
  } catch (err) {
    logger.warn('reco.youtubeSearch', 'search failed', { query, error: err?.message });
    return [];
  }
}
