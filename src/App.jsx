import { useState, useEffect } from 'react';
import { usePlayer } from './context/PlayerContext';
import { saavnApi } from './api/saavn';
import { youtubeApi } from './api/youtube';
import { useLocalStorage } from './hooks/useLocalStorage';
import { Play, User, Plus } from 'lucide-react';

import Sidebar from './components/Sidebar';
import SearchBar from './components/SearchBar';
import TrackCard from './components/TrackCard';
import PlaybackBar from './components/PlaybackBar';
import LyricsModal from './components/LyricsModal';
import QueueViewer from './components/QueueViewer';
import MobilePlayer from './components/MobilePlayer';

// ── Helper: random color for playlists ──
const COLORS = ['#ec4899', '#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6', '#06b6d4'];
const randomColor = () => COLORS[Math.floor(Math.random() * COLORS.length)];

function App() {
  const { playTrack, currentTrack, dominantColor } = usePlayer();

  const [activeTab, setActiveTab] = useState('trending');
  const [topTracks, setTopTracks] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [discoverSections, setDiscoverSections] = useState([]);
  const [isLyricsOpen, setIsLyricsOpen] = useState(false);
  const [isQueueOpen, setIsQueueOpen] = useState(false);

  // Persistence
  const [favorites, setFavorites] = useLocalStorage('aura-favorites', []);
  const [playlists, setPlaylists] = useLocalStorage('aura-playlists', []);
  const [history, setHistory] = useLocalStorage('aura-history', []);
  // Each playlist: { id, name, color, tracks: [] }

  // ── Track History ──
  useEffect(() => {
    if (!currentTrack) return;

    setHistory(prevHistory => {
      // Remove track if it exists, to move it to the front
      const filtered = prevHistory.filter(t => t.id !== currentTrack.id);
      const newHistory = [currentTrack, ...filtered];
      // Keep only top 20
      return newHistory.slice(0, 20);
    });
  }, [currentTrack, setHistory]);

  // ── Load trending on mount ──
  useEffect(() => {
    (async () => {
      const saavnTrending = await saavnApi.getTrending();
      if (saavnTrending?.length) setTopTracks(saavnTrending.map(saavnApi.formatTrack));
    })();
  }, []);

  // ── Load discover sections ──
  useEffect(() => {
    if (activeTab !== 'discover') return;
    (async () => {
      const [saavnNew, saavnPopular] = await Promise.all([
        saavnApi.searchSongs('new releases 2026', 8),
        saavnApi.searchSongs('popular hits', 8)
      ]);
      setDiscoverSections([
        { title: 'New Releases', tracks: (saavnNew || []).map(saavnApi.formatTrack) },
        { title: 'Popular Right Now', tracks: (saavnPopular || []).map(saavnApi.formatTrack) }
      ]);
    })();
  }, [activeTab]);

  // ── Search handler ──
  const handleSearch = async (query) => {
    setSearchQuery(query);
    setActiveTab('search');
    // Fetch from both Saavn and YouTube in parallel
    const [saavnRes, ytRes] = await Promise.all([
      saavnApi.searchSongs(query),
      youtubeApi.searchSongs(query, 10).catch(() => [])
    ]);
    const saavnTracks = (saavnRes || []).map(saavnApi.formatTrack);
    const ytTracks = ytRes || [];
    // Merge: Saavn first, then YouTube
    setSearchResults([...saavnTracks, ...ytTracks]);
  };

  // ── Favorites ──
  const toggleFavorite = (track) => {
    if (favorites.some(f => f.id === track.id)) {
      setFavorites(favorites.filter(f => f.id !== track.id));
    } else {
      setFavorites([...favorites, track]);
    }
  };

  // ── Playlist CRUD ──
  const createPlaylist = (name) => {
    const pl = { id: Date.now().toString(), name, color: randomColor(), tracks: [] };
    setPlaylists([...playlists, pl]);
  };
  const deletePlaylist = (id) => {
    setPlaylists(playlists.filter(p => p.id !== id));
    if (activeTab === `playlist-${id}`) setActiveTab('trending');
  };
  const addToPlaylist = (playlistId, track) => {
    setPlaylists(playlists.map(p => {
      if (p.id !== playlistId) return p;
      if (p.tracks.some(t => t.id === track.id)) return p;
      return { ...p, tracks: [...p.tracks, track] };
    }));
  };
  const removeFromPlaylist = (playlistId, trackId) => {
    setPlaylists(playlists.map(p => {
      if (p.id !== playlistId) return p;
      return { ...p, tracks: p.tracks.filter(t => t.id !== trackId) };
    }));
  };

  // ── Determine displayed tracks ──
  let displayedTracks = [];
  let sectionTitle = 'Top Tracks';
  const playlistMatch = activeTab.match(/^playlist-(.+)$/);

  if (activeTab === 'search') {
    displayedTracks = searchResults;
    sectionTitle = `Results for "${searchQuery}"`;
  } else if (activeTab === 'favorites') {
    displayedTracks = favorites;
    sectionTitle = 'Your Favorites';
  } else if (activeTab === 'history') {
    displayedTracks = history;
    sectionTitle = 'Recently Played';
  } else if (playlistMatch) {
    const pl = playlists.find(p => p.id === playlistMatch[1]);
    displayedTracks = pl?.tracks || [];
    sectionTitle = pl?.name || 'Playlist';
  } else if (activeTab === 'trending' || activeTab === 'library') {
    displayedTracks = topTracks;
    sectionTitle = activeTab === 'library' ? 'Your Library' : 'Top Tracks';
  }

  // Convert rgb to rgba for the subtle background glow
  const glowColor = dominantColor.replace('rgb', 'rgba').replace(')', ', 0.15)');

  return (
    <div
      className="app-container"
      style={{ '--dominant-color': glowColor }}
    >
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        playlists={playlists}
        onCreatePlaylist={createPlaylist}
        onDeletePlaylist={deletePlaylist}
      />

      <main className="main-content">
        <header className="top-bar">
          <SearchBar onSearch={handleSearch} />
          <div className="user-profile">
            <div className="avatar">
              <User size={20} color="white" />
            </div>
          </div>
        </header>

        <div className="content-scroll">
          {/* ── Discover Tab ── */}
          {activeTab === 'discover' && (
            <div className="discover-view">
              {discoverSections.length === 0 && (
                <div className="empty-state">Loading curated picks…</div>
              )}
              {discoverSections.map((section, si) => (
                <section key={si} className="track-section">
                  <div className="section-header">
                    <h2>{section.title}</h2>
                  </div>
                  <div className="track-grid">
                    {section.tracks.map((track, ti) => (
                      <TrackCard
                        key={track.id + ti}
                        track={track}
                        trackList={section.tracks}
                        isFavorite={favorites.some(f => f.id === track.id)}
                        onToggleFavorite={toggleFavorite}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}

          {/* ── Hero banner (Trending) ── */}
          {activeTab === 'trending' && (
            <section className="hero-section glass-panel">
              <div className="hero-content">
                <h2>Trending Now</h2>
                <p>Discover the most played tracks globally</p>
                <button className="play-button" onClick={() => topTracks.length > 0 && playTrack(topTracks[0], topTracks)}>
                  <Play size={18} style={{ marginRight: 8, display: 'inline', verticalAlign: 'text-bottom' }} />
                  Play Top Chart
                </button>
              </div>
              <div className="hero-decoration" />
            </section>
          )}

          {/* ── Track Grid (all tabs except discover) ── */}
          {activeTab !== 'discover' && (
            <section className="track-section">
              <div className="section-header">
                <h2>{sectionTitle}</h2>
                {playlistMatch && playlists.find(p => p.id === playlistMatch[1]) && (
                  <span className="track-count">{displayedTracks.length} tracks</span>
                )}
              </div>

              <div className="track-grid">
                {displayedTracks.map((track, i) => (
                  <TrackCard
                    key={track.id + i}
                    track={track}
                    trackList={displayedTracks}
                    isFavorite={favorites.some(f => f.id === track.id)}
                    onToggleFavorite={toggleFavorite}
                  />
                ))}

                {displayedTracks.length === 0 && (
                  <div className="empty-state">
                    {activeTab === 'search' ? 'No results found.' :
                      activeTab === 'favorites' ? "You haven't added any favorites yet." :
                        playlistMatch ? 'This playlist is empty. Search for songs and add them!' :
                          'Loading trending tracks…'}
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      </main>
      <PlaybackBar
        onOpenLyrics={() => setIsLyricsOpen(true)}
        onOpenQueue={() => setIsQueueOpen(true)}
      />

      <MobilePlayer
        onOpenLyrics={() => setIsLyricsOpen(true)}
        onOpenQueue={() => setIsQueueOpen(true)}
      />

      <LyricsModal isOpen={isLyricsOpen} onClose={() => setIsLyricsOpen(false)} />
      <QueueViewer isOpen={isQueueOpen} onClose={() => setIsQueueOpen(false)} />
    </div>
  );
}

export default App;
