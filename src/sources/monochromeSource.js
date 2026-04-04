import { logInfo } from '../utils/logger';

const DEFAULT_TIMEOUT_MS = 6500;
const MAX_CANDIDATES = 12;

const latencyState = new Map();

function nowMs() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function splitCsv(value = '') {
  return String(value)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeBaseUrl(value) {
  return String(value || '').replace(/\/+$/, '');
}

function withTimeout(promiseFactory, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  return promiseFactory(controller.signal)
    .finally(() => {
      clearTimeout(timer);
    });
}

function extractStreamUrl(payload) {
  if (!payload) return '';
  if (typeof payload === 'string') return payload.trim();

  const direct = [
    payload.streamUrl,
    payload.url,
    payload.audioUrl,
    payload.directUrl,
    payload?.data?.streamUrl,
    payload?.data?.url,
  ].find((value) => typeof value === 'string' && /^https?:\/\//i.test(value.trim()));

  return direct ? direct.trim() : '';
}

async function resolveFromEndpoint(endpointUrl, timeoutMs) {
  return withTimeout(async (signal) => {
    const response = await fetch(endpointUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json, text/plain;q=0.9, */*;q=0.8',
      },
      signal,
    });

    if (!response.ok) {
      throw new Error(`Endpoint responded ${response.status}`);
    }

    const contentType = String(response.headers.get('content-type') || '').toLowerCase();

    if (contentType.includes('application/json')) {
      const payload = await response.json();
      const streamUrl = extractStreamUrl(payload);
      if (!streamUrl) throw new Error('No stream URL in JSON payload');
      return streamUrl;
    }

    const text = (await response.text()).trim();
    if (/^https?:\/\//i.test(text)) return text;
    throw new Error('Unsupported endpoint response format');
  }, timeoutMs);
}

async function verifyStreamUrl(streamUrl, timeoutMs = 5000) {
  if (!/^https?:\/\//i.test(streamUrl || '')) return false;

  try {
    const ok = await withTimeout(async (signal) => {
      const headResponse = await fetch(streamUrl, {
        method: 'HEAD',
        redirect: 'follow',
        signal,
      });

      if (!headResponse.ok) return false;
      const contentType = String(headResponse.headers.get('content-type') || '').toLowerCase();
      if (!contentType) return true;
      return contentType.startsWith('audio/') || contentType.includes('octet-stream') || contentType.includes('application/vnd.apple.mpegurl');
    }, timeoutMs);

    if (ok) return true;
  } catch {
    // Some hosts reject HEAD. Fall through to a byte-range probe.
  }

  try {
    return await withTimeout(async (signal) => {
      const rangeResponse = await fetch(streamUrl, {
        method: 'GET',
        headers: {
          Range: 'bytes=0-1',
        },
        redirect: 'follow',
        signal,
      });
      return rangeResponse.ok || rangeResponse.status === 206;
    }, timeoutMs);
  } catch {
    return false;
  }
}

function buildCandidates(videoId, endpointsCsv) {
  const rawEndpoints = splitCsv(endpointsCsv || import.meta.env.VITE_MONOCHROME_ENDPOINTS || '');

  const candidates = [];
  for (const endpoint of rawEndpoints) {
    if (endpoint.includes('{videoId}')) {
      candidates.push(endpoint.replaceAll('{videoId}', encodeURIComponent(videoId)));
      continue;
    }

    const base = normalizeBaseUrl(endpoint);
    if (!base) continue;

    candidates.push(`${base}/stream/${encodeURIComponent(videoId)}`);
    candidates.push(`${base}/api/stream/${encodeURIComponent(videoId)}`);
    candidates.push(`${base}/resolve/${encodeURIComponent(videoId)}`);
  }

  const unique = [...new Set(candidates)].slice(0, MAX_CANDIDATES);
  unique.sort((left, right) => {
    const leftMs = latencyState.get(left) ?? Number.POSITIVE_INFINITY;
    const rightMs = latencyState.get(right) ?? Number.POSITIVE_INFINITY;
    return leftMs - rightMs;
  });
  return unique;
}

async function probeEndpoint(endpointUrl, timeoutMs) {
  const startedAt = nowMs();
  const streamUrl = await resolveFromEndpoint(endpointUrl, timeoutMs);

  const verified = await verifyStreamUrl(streamUrl);
  if (!verified) {
    throw new Error('Resolved URL failed verification');
  }

  const elapsed = Math.max(1, Math.round(nowMs() - startedAt));
  const previous = latencyState.get(endpointUrl);
  const smoothed = previous ? Math.round(previous * 0.65 + elapsed * 0.35) : elapsed;
  latencyState.set(endpointUrl, smoothed);

  return {
    endpointUrl,
    streamUrl,
    elapsedMs: elapsed,
  };
}

export async function resolveMonochromeStream(videoId, options = {}) {
  if (!videoId) return null;

  const candidates = buildCandidates(videoId, options.endpoints);
  if (!candidates.length) return null;

  const timeoutMs = Math.max(1200, Number(options.timeoutMs || DEFAULT_TIMEOUT_MS));
  const probes = candidates.map((endpointUrl) => probeEndpoint(endpointUrl, timeoutMs));

  try {
    const best = await Promise.any(probes);
    logInfo('monochrome', 'Selected fastest working endpoint', {
      videoId,
      endpoint: best.endpointUrl,
      elapsedMs: best.elapsedMs,
    });

    return {
      streamUrl: best.streamUrl,
      streamSource: 'monochrome',
      endpoint: best.endpointUrl,
      measuredLatencyMs: best.elapsedMs,
      verified: true,
    };
  } catch {
    return null;
  }
}
