import { Heart, MoreHorizontal, Play } from 'lucide-react';

export default function TrackCard({
  track,
  isActive,
  isPlaying,
  isFav,
  onPlay,
  onFav,
  onContextMenu,
  variant = 'list', // 'list' | 'tile'
}) {
  if (!track) return null;

  const coverUrl = track.coverArt || '';

  if (variant === 'tile') {
    return (
      <div className="tile-card" onClick={() => onPlay?.(track)}>
        <div
          className="tile-cover"
          style={coverUrl ? { backgroundImage: `url(${coverUrl})` } : undefined}
        >
          {isActive && isPlaying && (
            <div className="playing-overlay">
              <div className="eq-bar">
                <span /><span /><span /><span />
              </div>
            </div>
          )}
        </div>
        <div className="tile-title">{track.title || 'Untitled'}</div>
        <div className="tile-artist">{track.artist || 'Unknown'}</div>
      </div>
    );
  }

  // List row (default)
  return (
    <div
      className={`track-card${isActive ? ' track-card--active' : ''}`}
      onClick={() => onPlay?.(track)}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu?.(e, track);
      }}
    >
      <div className="cover-art-wrapper">
        <div
          className="cover-art"
          style={coverUrl ? { backgroundImage: `url(${coverUrl})` } : undefined}
        >
          {track.source && (
            <span className={`source-badge badge-${track.source === 'saavn' ? 'sv' : 'yt'}`}>
              {track.source === 'saavn' ? 'SV' : 'YT'}
            </span>
          )}

          {isActive && isPlaying ? (
            <div className="playing-overlay">
              <div className="eq-bar">
                <span /><span /><span /><span />
              </div>
            </div>
          ) : (
            <div className="cover-play-overlay">
              <div className="cover-play-circle">
                <Play size={18} fill="#fff" color="#fff" />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="track-info">
        <div className="track-text">
          <div className="track-title">{track.title || 'Untitled'}</div>
          <div className="artist-name">{track.artist || 'Unknown'}</div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {isFav && (
            <button
              className="fav-btn fav-btn--active"
              onClick={(e) => { e.stopPropagation(); onFav?.(track); }}
              title="Remove from favorites"
            >
              <Heart size={16} fill="currentColor" />
            </button>
          )}
          <button
            className="track-menu-btn"
            onClick={(e) => {
              e.stopPropagation();
              onContextMenu?.(e, track);
            }}
            title="More options"
          >
            <MoreHorizontal size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
