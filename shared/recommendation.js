function normalizeRecommendationText(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getRecommendationArtistKey(track) {
  return normalizeRecommendationText(track?.artist || track?.author || 'unknown');
}

export function diversifyRankedRecommendations(items = [], options = {}) {
  const artistCooldown = Math.max(0, Number(options.artistCooldown ?? 1));
  const recentTracks = Array.isArray(options.recentTracks) ? options.recentTracks.filter(Boolean) : [];
  const recentArtists = recentTracks.map(getRecommendationArtistKey).filter(Boolean);
  const pool = (Array.isArray(items) ? items : [])
    .filter((item) => item?.track)
    .map((item, index) => ({
      ...item,
      index,
      artistKey: getRecommendationArtistKey(item.track),
    }));

  const selected = [];
  const artistWindow = [];

  while (pool.length > 0) {
    let bestIndex = 0;
    let bestValue = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < pool.length; index += 1) {
      const item = pool[index];
      const artistKey = item.artistKey;

      let penalty = 0;
      if (artistWindow.length > 0 && artistWindow[artistWindow.length - 1] === artistKey) {
        penalty += 0.7;
      }

      if (artistWindow.includes(artistKey)) {
        penalty += 0.35;
      }

      if (recentArtists.length > 0 && recentArtists[recentArtists.length - 1] === artistKey) {
        penalty += 0.9;
      }

      const recentMatches = recentArtists.filter((artist) => artist === artistKey).length;
      if (recentMatches > 0) {
        penalty += Math.min(0.45, recentMatches * 0.12);
      }

      const value = Number(item.score || 0) - penalty;
      if (value > bestValue) {
        bestValue = value;
        bestIndex = index;
      }
    }

    const [chosen] = pool.splice(bestIndex, 1);
    selected.push(chosen);

    if (artistCooldown > 0) {
      artistWindow.push(chosen.artistKey);
      while (artistWindow.length > artistCooldown) {
        artistWindow.shift();
      }
    }
  }

  return selected;
}