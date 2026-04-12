import test from 'node:test';
import assert from 'node:assert/strict';

import { diversifyRankedRecommendations } from '../shared/recommendation.js';

test('diversifyRankedRecommendations spaces repeated artists apart', () => {
  const ranked = [
    { track: { id: '1', artist: 'Artist A' }, score: 9.6 },
    { track: { id: '2', artist: 'Artist A' }, score: 9.4 },
    { track: { id: '3', artist: 'Artist B' }, score: 9.3 },
    { track: { id: '4', artist: 'Artist C' }, score: 9.2 },
  ];

  const ordered = diversifyRankedRecommendations(ranked, {
    artistCooldown: 1,
    recentTracks: [{ artist: 'Artist A' }],
  });

  assert.equal(ordered[0].track.artist, 'Artist B');
  assert.notEqual(ordered[1].track.artist, 'Artist B');
  assert.notEqual(ordered[1].track.artist, 'Artist A');
});

test('diversifyRankedRecommendations keeps order when only one artist exists', () => {
  const ranked = [
    { track: { id: '1', artist: 'Solo Artist' }, score: 10 },
    { track: { id: '2', artist: 'Solo Artist' }, score: 9 },
  ];

  const ordered = diversifyRankedRecommendations(ranked, {
    artistCooldown: 1,
    recentTracks: [{ artist: 'Solo Artist' }],
  });

  assert.deepEqual(ordered.map((item) => item.track.id), ['1', '2']);
});

test('diversifyRankedRecommendations avoids placing same artist back-to-back when alternatives exist', () => {
  const ranked = [
    { track: { id: '1', artist: 'A' }, score: 9.9 },
    { track: { id: '2', artist: 'A' }, score: 9.8 },
    { track: { id: '3', artist: 'B' }, score: 9.7 },
    { track: { id: '4', artist: 'C' }, score: 9.6 },
    { track: { id: '5', artist: 'A' }, score: 9.5 },
  ];

  const ordered = diversifyRankedRecommendations(ranked, {
    artistCooldown: 2,
    recentTracks: [],
  }).map((item) => item.track);

  assert.notEqual(ordered[0].artist, ordered[1].artist);
  assert.notEqual(ordered[1].artist, ordered[2].artist);
  assert.notEqual(ordered[2].artist, ordered[3].artist);
});