import axios from 'axios';
import { logger } from '../lib/logger.mjs';
import { pickBestTrackMatch } from '../../shared/trackMatch.js';
import { isStreamAlive } from '../utils/validateStream.mjs';

const SAAVN_BASE_URL = 'https://saavn.sumit.co/api';

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function getDownloadUrl(song) {
  const urls = Array.isArray(song?.downloadUrl) ? song.downloadUrl : [];
  const sorted = [...urls].sort((a, b) => {
    const score = (item) => {
      const match = String(item?.quality || '').match(/(\d+)/);
      return match ? Number(match[1]) : 0;
    };
    return score(b) - score(a);
  });

  return sorted[0]?.url || '';
}

export async function saavnGetAudioUrl(videoId, title, artist) {
  const query = `${artist ? `${artist} ` : ''}${title || ''}`.trim();
  if (!query || !title) return null;

  try {
    const response = await axios.get(`${SAAVN_BASE_URL}/search/songs`, {
      params: { query, limit: 8 },
      timeout: 8000,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'AuraMusicPlayer/1.0',
      },
    });

    const results = response?.data?.data?.results;
    if (!Array.isArray(results) || results.length === 0) {
      logger.debug('saavn', 'No Saavn search results', { videoId, query });
      return null;
    }

    const match = pickBestTrackMatch(results, { title, artist }, {
      getTitle: (song) => decodeHtml(song?.name || song?.title || ''),
      getArtist: (song) => decodeHtml(song?.primaryArtists || song?.singers || song?.artist || ''),
    });

    if (!match) {
      logger.info('saavn', 'Rejected low-confidence Saavn fallback', { videoId, query });
      return null;
    }

    const streamUrl = getDownloadUrl(match.candidate);
    if (!streamUrl) {
      logger.info('saavn', 'Matched Saavn track had no stream URL', { videoId, query });
      return null;
    }

    const alive = await isStreamAlive(streamUrl);
    if (!alive) {
      logger.warn('saavn', 'Saavn stream URL failed validation', { videoId, query });
      return null;
    }

    logger.info('saavn', 'Resolved stream via Saavn fallback', { videoId, query });
    return streamUrl;
  } catch (error) {
    logger.warn('saavn', 'Saavn lookup failed', {
      videoId,
      query,
      error: error?.message,
    });
    return null;
  }
}
