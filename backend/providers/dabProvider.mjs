import axios from 'axios';
import { logger } from '../lib/logger.mjs';
import { pickBestTrackMatch } from '../../shared/trackMatch.js';
import { isStreamAlive } from '../utils/validateStream.mjs';

function trim(value) {
  return String(value || '').trim();
}

function trimTrailingSlash(value) {
  return trim(value).replace(/\/+$/, '');
}

function splitCsv(value) {
  return trim(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function encodePathSegment(value) {
  return encodeURIComponent(String(value ?? ''));
}

function substituteTemplate(template, values = {}) {
  let result = String(template || '');
  for (const [key, value] of Object.entries(values)) {
    result = result.replaceAll(`{${key}}`, encodePathSegment(value));
  }
  return result;
}

function joinUrl(baseUrl, pathOrUrl) {
  const value = trim(pathOrUrl);
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return `${trimTrailingSlash(baseUrl)}/${value.replace(/^\/+/, '')}`;
}

function getNestedValue(input, path) {
  if (!input || !path) return undefined;
  const parts = String(path)
    .split('.')
    .map((part) => part.trim())
    .filter(Boolean);

  let current = input;
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function collectSearchItems(payload) {
  if (!payload || typeof payload !== 'object') return [];

  const configuredPaths = splitCsv(
    process.env.DAB_SEARCH_RESULT_PATHS ||
    'results,data.results,data,data.items,items,songs,tracks'
  );

  for (const path of configuredPaths) {
    const found = getNestedValue(payload, path);
    if (Array.isArray(found) && found.length) {
      return found;
    }
  }

  for (const key of ['results', 'items', 'tracks', 'songs', 'data']) {
    const value = payload[key];
    if (Array.isArray(value) && value.length) return value;
  }

  return [];
}

function firstDefined(...values) {
  return values.find((value) => value != null && value !== '');
}

function getCandidateId(candidate) {
  return firstDefined(
    candidate?.id,
    candidate?._id,
    candidate?.trackId,
    candidate?.track_id,
    candidate?.songId,
    candidate?.song_id,
  );
}

function getCandidateTitle(candidate) {
  return firstDefined(
    candidate?.title,
    candidate?.name,
    candidate?.track,
    candidate?.song,
    candidate?.attributes?.title,
  ) || '';
}

function getCandidateArtist(candidate) {
  const artistValue = firstDefined(
    candidate?.artist,
    candidate?.author,
    candidate?.artists,
    candidate?.artist_name,
    candidate?.subtitle,
    candidate?.attributes?.artist,
  );

  if (Array.isArray(artistValue)) {
    return artistValue
      .map((item) => (typeof item === 'string' ? item : item?.name || item?.title || ''))
      .filter(Boolean)
      .join(', ');
  }

  return String(artistValue || '');
}

function getCandidateStreamUrl(candidate) {
  return trim(firstDefined(
    candidate?.streamUrl,
    candidate?.stream_url,
    candidate?.downloadUrl,
    candidate?.download_url,
    candidate?.url,
    candidate?.audioUrl,
    candidate?.audio_url,
    candidate?.playUrl,
    candidate?.play_url,
    candidate?.file?.url,
    candidate?.download?.url,
    candidate?.stream?.url,
  ));
}

function buildAuthHeaders() {
  const headers = {};
  const apiKey = trim(process.env.DAB_API_KEY || process.env.DAB_KEY);
  const bearerToken = trim(process.env.DAB_BEARER_TOKEN || process.env.DAB_TOKEN);
  const authHeaderName = trim(process.env.DAB_AUTH_HEADER || 'Authorization');

  if (apiKey) {
    headers[trim(process.env.DAB_API_KEY_HEADER || 'x-api-key')] = apiKey;
  }

  if (bearerToken) {
    headers[authHeaderName] = bearerToken.toLowerCase().startsWith('bearer ')
      ? bearerToken
      : `Bearer ${bearerToken}`;
  }

  return headers;
}

function getBaseUrl() {
  return trimTrailingSlash(process.env.DAB_API_URL || process.env.DAB_BASE_URL || '');
}

export function hasDabConfig() {
  return Boolean(getBaseUrl());
}

export async function dabDebugSearch(title, artist = '', options = {}) {
  const baseUrl = getBaseUrl();
  const videoId = trim(options.videoId || '');
  if (!baseUrl || !title) {
    return {
      ok: false,
      error: !baseUrl ? 'DAB is not configured' : 'title is required',
      query: `${artist ? `${artist} ` : ''}${title}`.trim(),
      hasConfig: Boolean(baseUrl),
    };
  }

  const searchPath = trim(process.env.DAB_SEARCH_PATH || '/search');
  const queryParam = trim(process.env.DAB_SEARCH_QUERY_PARAM || 'q');
  const limitParam = trim(process.env.DAB_SEARCH_LIMIT_PARAM || 'limit');
  const timeoutMs = Math.max(1000, Number(process.env.DAB_TIMEOUT_MS || 8000));
  const searchUrl = joinUrl(baseUrl, searchPath);
  const query = `${artist ? `${artist} ` : ''}${title}`.trim();

  const client = axios.create({
    timeout: timeoutMs,
    headers: {
      Accept: 'application/json',
      ...buildAuthHeaders(),
    },
  });

  try {
    const response = await client.get(searchUrl, {
      params: {
        [queryParam]: query,
        ...(limitParam ? { [limitParam]: Number(process.env.DAB_SEARCH_LIMIT || 8) } : {}),
      },
    });

    const items = collectSearchItems(response?.data);
    const match = pickBestTrackMatch(items, { title, artist }, {
      getTitle: getCandidateTitle,
      getArtist: getCandidateArtist,
    });

    const matchedCandidate = match?.candidate || null;
    const rawStreamUrl = matchedCandidate
      ? getCandidateStreamUrl(matchedCandidate) || await resolveCandidateViaDetails(client, baseUrl, matchedCandidate)
      : '';
    const streamAlive = rawStreamUrl ? await isStreamAlive(rawStreamUrl) : false;

    return {
      ok: Boolean(match && rawStreamUrl && streamAlive),
      hasConfig: true,
      videoId,
      query,
      searchUrl,
      resultCount: items.length,
      matched: Boolean(match),
      matchedCandidate: matchedCandidate
        ? {
            id: getCandidateId(matchedCandidate),
            title: getCandidateTitle(matchedCandidate),
            artist: getCandidateArtist(matchedCandidate),
          }
        : null,
      streamUrlFound: Boolean(rawStreamUrl),
      streamAlive,
      streamUrlPreview: rawStreamUrl ? `${rawStreamUrl.slice(0, 120)}...` : '',
    };
  } catch (error) {
    return {
      ok: false,
      hasConfig: true,
      videoId,
      query,
      searchUrl,
      error: error?.message || 'DAB search failed',
    };
  }
}

async function resolveCandidateViaDetails(client, baseUrl, candidate) {
  const candidateId = getCandidateId(candidate);
  if (!candidateId) return '';

  const detailTemplates = splitCsv(
    process.env.DAB_STREAM_URL_TEMPLATES ||
    process.env.DAB_TRACK_URL_TEMPLATES ||
    ''
  );

  for (const template of detailTemplates) {
    const url = joinUrl(baseUrl, substituteTemplate(template, { id: candidateId }));
    try {
      const response = await client.get(url);
      const payload = response?.data;

      const directUrl = getCandidateStreamUrl(payload);
      if (directUrl) return directUrl;

      const nestedPaths = splitCsv(
        process.env.DAB_STREAM_URL_PATHS ||
        'url,streamUrl,stream_url,downloadUrl,download_url,data.url,data.streamUrl,data.stream_url,data.downloadUrl,data.download_url'
      );

      for (const path of nestedPaths) {
        const maybeUrl = trim(getNestedValue(payload, path));
        if (maybeUrl) return maybeUrl;
      }
    } catch (error) {
      logger.debug('dab', 'DAB detail lookup failed', {
        url,
        error: error?.message,
      });
    }
  }

  return '';
}

export async function dabGetAudioUrl(videoId, title, artist) {
  const baseUrl = getBaseUrl();
  if (!baseUrl || !title) return null;

  const searchPath = trim(process.env.DAB_SEARCH_PATH || '/search');
  const queryParam = trim(process.env.DAB_SEARCH_QUERY_PARAM || 'q');
  const limitParam = trim(process.env.DAB_SEARCH_LIMIT_PARAM || 'limit');
  const timeoutMs = Math.max(1000, Number(process.env.DAB_TIMEOUT_MS || 8000));
  const searchUrl = joinUrl(baseUrl, searchPath);

  const client = axios.create({
    timeout: timeoutMs,
    headers: {
      Accept: 'application/json',
      ...buildAuthHeaders(),
    },
  });

  const query = `${artist ? `${artist} ` : ''}${title}`.trim();

  try {
    const response = await client.get(searchUrl, {
      params: {
        [queryParam]: query,
        ...(limitParam ? { [limitParam]: Number(process.env.DAB_SEARCH_LIMIT || 8) } : {}),
      },
    });

    const items = collectSearchItems(response?.data);
    if (!items.length) {
      logger.debug('dab', 'No DAB search results', { videoId, query });
      return null;
    }

    const match = pickBestTrackMatch(items, { title, artist }, {
      getTitle: getCandidateTitle,
      getArtist: getCandidateArtist,
    });

    if (!match) {
      logger.info('dab', 'Rejected low-confidence DAB fallback', { videoId, query });
      return null;
    }

    const streamUrl = getCandidateStreamUrl(match.candidate) ||
      await resolveCandidateViaDetails(client, baseUrl, match.candidate);

    if (!streamUrl) {
      logger.info('dab', 'Matched DAB item had no usable stream URL', {
        videoId,
        query,
        candidateId: getCandidateId(match.candidate),
      });
      return null;
    }

    const alive = await isStreamAlive(streamUrl);
    if (!alive) {
      logger.warn('dab', 'DAB stream URL failed validation', {
        videoId,
        query,
        candidateId: getCandidateId(match.candidate),
      });
      return null;
    }

    logger.info('dab', 'Resolved stream via DAB fallback', {
      videoId,
      query,
      candidateId: getCandidateId(match.candidate),
    });
    return streamUrl;
  } catch (error) {
    logger.warn('dab', 'DAB lookup failed', {
      videoId,
      query,
      error: error?.message,
    });
    return null;
  }
}
