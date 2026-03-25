import { logger } from '../lib/logger.mjs';

function parseDuration(text) {
  if (!text) return 0;
  const parts = String(text).split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

function mapInnertubeSong(song) {
  if (!song?.id) return null;
  return {
    id: `yt-${song.id}`,
    videoId: song.id,
    title: typeof song.title === 'string' ? song.title : (song.title?.toString?.() || song.title?.text || "Unknown"),
    artist: song.artists?.map((a) => a.name).join(', ') || 'YouTube Artist',
    album: song.album?.name || 'YouTube Music',
    coverArt: song.thumbnail?.[0]?.url || song.thumbnails?.[0]?.url || '',
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
