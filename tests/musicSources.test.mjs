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

  const soundcloudApi = {
    async resolveStreamSafe() {
      return { ok: false, data: null, error: 'not needed' };
    },
  };

  const sources = createMusicSources({ youtubeApi, soundcloudApi });
  const resolved = await sources.youtube.getStreamUrl({ id: 'yt-abc123def45', title: 'Song', artist: 'Artist' });

  assert.ok(resolved);
  assert.equal(resolved.streamUrl, 'https://media.example/yt-audio.webm');
  assert.equal(resolved.streamSource, 'yt-dlp');
});

test('youtube source falls back to soundcloud resolver when direct stream is unavailable', async () => {
  const youtubeApi = {
    async searchSongsSafe() {
      return { ok: true, data: [] };
    },
    async getStreamDetails() {
      return { streamUrl: null, streamSource: null, cacheState: null };
    },
  };

  const soundcloudApi = {
    async resolveStreamSafe() {
      return {
        ok: true,
        data: {
          streamUrl: 'https://media.example/sc-audio.mp3',
          streamSource: 'soundcloud',
        },
        error: null,
      };
    },
  };

  const sources = createMusicSources({ youtubeApi, soundcloudApi });
  const resolved = await sources.youtube.getStreamUrl({ id: 'yt-xyz98765432', title: 'Song', artist: 'Artist' });

  assert.ok(resolved);
  assert.equal(resolved.streamUrl, 'https://media.example/sc-audio.mp3');
  assert.equal(resolved.streamSource, 'soundcloud');
});

test('soundcloud source resolveTrack delegates to soundcloudApi', async () => {
  const youtubeApi = {
    async searchSongsSafe() {
      return { ok: true, data: [] };
    },
    async getStreamDetails() {
      return { streamUrl: null };
    },
  };

  const soundcloudApi = {
    async resolveStreamSafe(payload) {
      return { ok: true, data: { streamUrl: 'https://sc.local/audio', streamSource: 'soundcloud' }, payload };
    },
  };

  const sources = createMusicSources({ youtubeApi, soundcloudApi });
  const track = { id: 'sc-111', permalinkUrl: 'https://soundcloud.com/user/track', title: 'Track', artist: 'User' };
  const resolved = await sources.soundcloud.resolveTrack(track);

  assert.equal(resolved.ok, true);
  assert.equal(resolved.data.streamUrl, 'https://sc.local/audio');
});
