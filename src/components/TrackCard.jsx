import { Heart } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';

export default function TrackCard({ track, isFavorite, onToggleFavorite, trackList }) {
    const { currentTrack, isPlaying, playTrack } = usePlayer();
    const isActive = currentTrack?.id === track.id;

    const handlePlay = () => {
        playTrack(track, trackList);
    };

    return (
        <div
            className={`track-card glass-panel ${isActive ? 'track-card--active' : ''}`}
            onClick={handlePlay}
        >
            <div
                className="cover-art"
                style={{
                    backgroundImage: `url(${track.coverArt || 'https://placehold.co/300x300/27272a/71717a?text=♪'})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    position: 'relative'
                }}
            >
                {/* Source badge */}
                <span className={`source-badge ${track.source === 'youtube' ? 'badge-yt' : 'badge-sv'}`}>
                    {track.source}
                </span>

                {/* Play overlay on active */}
                {isActive && (
                    <div className="playing-overlay">
                        <div className="eq-bar"><span /><span /><span /></div>
                    </div>
                )}
            </div>

            <div className="track-info">
                <div className="track-text">
                    <h4 className="track-title" title={track.title}>{track.title}</h4>
                    <p className="artist-name" title={track.artist}>{track.artist}</p>
                </div>
                <button
                    className={`fav-btn ${isFavorite ? 'fav-btn--active' : ''}`}
                    onClick={(e) => { e.stopPropagation(); onToggleFavorite(track); }}
                >
                    <Heart size={18} fill={isFavorite ? 'currentColor' : 'none'} />
                </button>
            </div>
        </div>
    );
}
