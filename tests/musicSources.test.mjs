import test from 'node:test';
import assert from 'node:assert/strict';

import { createMusicSources } from '../src/sources/musicSources.js';

test('youtube source uses backend stream result when available', async () => {
  const youtubeApi = {
    async searchSongsSafe() {
      return { ok: true, data: [] };
    },
    async getStreamDetails() {
      return {
        streamUrl: 'https://media.example/yt-audio.webm',
        streamSource: 'yt-dlp',
        cacheState: 'remote',
      };
    },
  };

  const sources = createMusicSources({ youtubeApi });
  const resolved = await sources.youtube.getStreamUrl({ id: 'yt-abc123def45', title: 'Song', artist: 'Artist' });

  assert.ok(resolved);
  assert.equal(resolved.streamUrl, 'https://media.example/yt-audio.webm');
  assert.equal(resolved.streamSource, 'yt-dlp');
});

test('youtube source falls back to monochrome resolver when direct stream is unavailable', async () => {
  const youtubeApi = {
    async searchSongsSafe() {
      return { ok: true, data: [] };
    },
    async getStreamDetails() {
      return { streamUrl: null, streamSource: null, cacheState: null };
    },
  };

  const sources = createMusicSources({ youtubeApi });
  const originalGetStreamDetails = youtubeApi.getStreamDetails;
  youtubeApi.getStreamDetails = async () => originalGetStreamDetails();

  const resolved = await sources.youtube.getStreamUrl({ id: 'yt-xyz98765432', title: 'Song', artist: 'Artist' });
  assert.equal(resolved, null);
});

test('monochrome source resolves youtube ids', async () => {
  const youtubeApi = {
    async searchSongsSafe() {
      return { ok: true, data: [] };
    },
    async getStreamDetails() {
      return { streamUrl: null };
    },
  };

  const sources = createMusicSources({ youtubeApi });
  const resolved = await sources.monochrome.getStreamUrl({ id: 'yt-11111111111' });

  assert.equal(resolved, null);
});
