const ABSOLUTE_URL_RE = /^[a-z][a-z\d+\-.]*:\/\//i;

function trimTrailingSlash(value = '') {
  return String(value || '').replace(/\/+$/, '');
}

function splitCsv(value = '') {
  return String(value || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function isAbsoluteUrl(value = '') {
  return ABSOLUTE_URL_RE.test(String(value));
}

function buildUrl(baseUrl, path, query = {}) {
  const normalizedBase = trimTrailingSlash(baseUrl);
  if (!normalizedBase) return '';

  if (/^https?:\/\//i.test(path)) return path;

  const base = new URL(`${normalizedBase}/`);
  const route = String(path || '').replace(/^\//, '');
  const url = new URL(route, base);

  Object.entries(query).forEach(([key, value]) => {
    if (value == null || value === '') return;
    url.searchParams.set(key, String(value));
  });

  return url.toString();
}

export function getConfiguredEndpoints(envKey, fallback = '') {
  const envValue = typeof import.meta !== 'undefined' ? (import.meta.env?.[envKey] || '') : '';
  return splitCsv(fallback || envValue || '');
}

export async function requestFromEndpoints({
  endpoints,
  path,
  query = {},
  method = 'GET',
  body,
  timeoutMs = 10000,
  headers = {},
  responseMode = 'json',
}) {
  const list = Array.isArray(endpoints) ? endpoints : splitCsv(endpoints);
  for (const endpoint of list) {
    const url = buildUrl(endpoint, path, query);
    if (!url) continue;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(url, {
        method,
        headers: {
          Accept: responseMode === 'text' ? 'text/plain, */*;q=0.8' : 'application/json, text/plain;q=0.9, */*;q=0.8',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!response.ok) continue;

      if (responseMode === 'text') {
        return { ok: true, endpoint, url, response, data: (await response.text()).trim() };
      }

      const contentType = String(response.headers.get('content-type') || '').toLowerCase();
      if (contentType.includes('application/json')) {
        return { ok: true, endpoint, url, response, data: await response.json() };
      }

      const text = (await response.text()).trim();
      if (text) {
        try {
          return { ok: true, endpoint, url, response, data: JSON.parse(text) };
        } catch {
          return { ok: true, endpoint, url, response, data: text };
        }
      }
    } catch {
      // try next endpoint
    }
  }

  return { ok: false, endpoint: null, url: null, response: null, data: null };
}

export async function validateStreamUrl(streamUrl, timeoutMs = 5000) {
  if (!isAbsoluteUrl(streamUrl)) return false;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const headResponse = await fetch(streamUrl, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (headResponse.ok) return true;
  } catch {
    // fall through to range probe
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const rangeResponse = await fetch(streamUrl, {
      method: 'GET',
      headers: { Range: 'bytes=0-1' },
      redirect: 'follow',
      signal: controller.signal,
    });
    clearTimeout(timer);
    return rangeResponse.ok || rangeResponse.status === 206;
  } catch {
    return false;
  }
}
