import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveMonochromeStream } from '../src/sources/monochromeSource.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('resolveMonochromeStream picks a working endpoint and verifies stream URL', async () => {
  const originalFetch = global.fetch;

  try {
    global.fetch = async (url, options = {}) => {
      const asString = String(url);

      if (asString.includes('/resolve/')) {
        if (asString.includes('fast.endpoint')) {
          await sleep(5);
          return new Response(JSON.stringify({ streamUrl: 'https://cdn.fast/audio.webm' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        await sleep(30);
        return new Response(JSON.stringify({ streamUrl: 'https://cdn.slow/audio.webm' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (options.method === 'HEAD' && asString.includes('cdn.fast')) {
        return new Response(null, {
          status: 200,
          headers: { 'content-type': 'audio/webm' },
        });
      }

      if (options.method === 'HEAD' && asString.includes('cdn.slow')) {
        return new Response(null, {
          status: 200,
          headers: { 'content-type': 'audio/webm' },
        });
      }

      return new Response(null, { status: 404 });
    };

    const resolved = await resolveMonochromeStream('abc123def45', {
      endpoints: 'https://slow.endpoint/resolve/{videoId},https://fast.endpoint/resolve/{videoId}',
      timeoutMs: 3000,
    });

    assert.ok(resolved);
    assert.equal(resolved.streamSource, 'monochrome');
    assert.equal(resolved.streamUrl, 'https://cdn.fast/audio.webm');
    assert.equal(resolved.verified, true);
  } finally {
    global.fetch = originalFetch;
  }
});

test('resolveMonochromeStream returns null when endpoints fail validation', async () => {
  const originalFetch = global.fetch;

  try {
    global.fetch = async (url, options = {}) => {
      const asString = String(url);
      if (asString.includes('/resolve/')) {
        return new Response(JSON.stringify({ streamUrl: 'https://cdn.invalid/audio.bin' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (options.method === 'HEAD') {
        return new Response(null, {
          status: 200,
          headers: { 'content-type': 'text/html' },
        });
      }

      if (options.method === 'GET' && options.headers?.Range) {
        return new Response(null, { status: 500 });
      }

      return new Response(null, { status: 404 });
    };

    const resolved = await resolveMonochromeStream('abc123def45', {
      endpoints: 'https://only.endpoint/resolve/{videoId}',
      timeoutMs: 2000,
    });

    assert.equal(resolved, null);
  } finally {
    global.fetch = originalFetch;
  }
});
