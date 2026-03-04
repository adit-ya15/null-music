import { Music, TrendingUp, Library, Heart, Plus, X, Clock } from 'lucide-react';
import { useState } from 'react';

export default function Sidebar({
    activeTab, setActiveTab,
    playlists, onCreatePlaylist, onDeletePlaylist
}) {
    const [showModal, setShowModal] = useState(false);
    const [newName, setNewName] = useState('');

    const handleCreate = () => {
        const name = newName.trim();
        if (!name) return;
        onCreatePlaylist(name);
        setNewName('');
        setShowModal(false);
    };

    return (
        <aside className="sidebar glass-panel">
            <div className="logo-container">
                <h1 className="logo-text">Aura</h1>
            </div>

            <nav className="nav-menu">
                <div className={`nav-item ${activeTab === 'discover' ? 'active' : ''}`} onClick={() => setActiveTab('discover')}>
                    <Music className="icon" size={20} />
                    <span>Discover</span>
                </div>
                <div className={`nav-item ${activeTab === 'trending' ? 'active' : ''}`} onClick={() => setActiveTab('trending')}>
                    <TrendingUp className="icon" size={20} />
                    <span>Trending</span>
                </div>
                <div className={`nav-item ${activeTab === 'library' ? 'active' : ''}`} onClick={() => setActiveTab('library')}>
                    <Library className="icon" size={20} />
                    <span>Library</span>
                </div>
                <div className={`nav-item ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
                    <Clock className="icon" size={20} />
                    <span>Recently Played</span>
                </div>
            </nav>

            <div className="playlists-section">
                <div className="playlists-header">
                    <h3 className="section-title">YOUR PLAYLISTS</h3>
                    <button className="icon-btn add-playlist-btn" onClick={() => setShowModal(true)} title="Create Playlist">
                        <Plus size={16} />
                    </button>
                </div>

                {/* Favorites (always first) */}
                <div
                    className={`playlist-item ${activeTab === 'favorites' ? 'active-playlist' : ''}`}
                    onClick={() => setActiveTab('favorites')}
                >
                    <Heart size={14} style={{ color: 'var(--primary-500)', flexShrink: 0 }} />
                    <span>Favorites</span>
                </div>

                {/* User playlists */}
                {playlists.map(pl => (
                    <div
                        key={pl.id}
                        className={`playlist-item ${activeTab === `playlist-${pl.id}` ? 'active-playlist' : ''}`}
                        onClick={() => setActiveTab(`playlist-${pl.id}`)}
                    >
                        <span className="playlist-color" style={{ backgroundColor: pl.color }} />
                        <span className="playlist-name">{pl.name}</span>
                        <button
                            className="playlist-delete-btn"
                            onClick={(e) => { e.stopPropagation(); onDeletePlaylist(pl.id); }}
                            title="Delete playlist"
                        >
                            <X size={12} />
                        </button>
                    </div>
                ))}
            </div>

            {/* Create Playlist Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal glass-panel" onClick={e => e.stopPropagation()}>
                        <h3>Create Playlist</h3>
                        <input
                            className="modal-input"
                            type="text"
                            placeholder="Playlist name…"
                            value={newName}
                            onChange={e => setNewName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleCreate()}
                            autoFocus
                        />
                        <div className="modal-actions">
                            <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                            <button className="btn-primary" onClick={handleCreate}>Create</button>
                        </div>
                    </div>
                </div>
            )}
        </aside>
    );
}
