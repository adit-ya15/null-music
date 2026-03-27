import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { Play, User, Shuffle, ListPlus, Sun, Moon, ChevronRight, Heart, Clock, Music, ListMusic, Disc3, Sparkles, SkipForward, Download, Settings, ShieldCheck, Smartphone, WifiOff, Trash2, X } from 'lucide-react';
import { usePlayer } from './context/PlayerContext';
import { youtubeApi } from './api/youtube';
import { nativeMediaApi } from './api/nativeMedia';
import { recommendationsApi } from './api/recommendations';
import { API_BASE } from './api/apiBase';
import { useLocalStorage } from './hooks/useLocalStorage';
import { buildHistory, insertTrackNext } from './utils/playerState';
import { getOrCreateUserId } from './utils/userId';
import Sidebar from './components/Sidebar';
import SearchBar from './components/SearchBar';
import TrackCard from './components/TrackCard';
import PlaybackBar from './components/PlaybackBar';
import EqualizerModal from './components/EqualizerModal';
import LyricsModal from './components/LyricsModal';
import QueueViewer from './components/QueueViewer';
import MobilePlayer from './components/MobilePlayer';
import AsyncState from './components/AsyncState';
import ReliabilityPanel from './components/ReliabilityPanel';
import { logError } from './utils/logger';
import { buildLocalRecommendations, dedupeTracks } from './utils/recommendationFallback';

const COLORS = ['#ec4899', '#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6', '#06b6d4'];
const randomColor = () => COLORS[Math.floor(Math.random() * COLORS.length)];
const onlyYoutube = (tracks) => (Array.isArray(tracks) ? tracks.filter((t) => t && t.source !== 'saavn') : []);
const buildFallbackTracks = ({ seedTrack = null, favorites = [], history = [], downloaded = [], limit = 20 }) => {
  const pool = seedTrack
    ? buildLocalRecommendations({ seedTrack, favorites: [...favorites, ...downloaded], history: [...downloaded, ...history], limit })
    : dedupeTracks([...downloaded, ...history, ...favorites]);
  return pool.slice(0, limit);
};
const formatBytes = (bytes = 0) => {
  if (!bytes) return '0 MB';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const precision = unitIndex <= 1 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
};
const formatDuration = (seconds = 0) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const total = Math.round(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};
const getTrackSourceId = (track) => {
  if (!track) return null;
  const raw = track.originalId || track.videoId || track.id;
  if (raw == null) return null;
  return String(raw).replace(/^download-/, '').replace(/^yt-/, '');
};
const isActiveDownloadStatus = (status) => ['queued', 'downloading', 'canceling'].includes(status);
const getDownloadStatusLabel = (job) => {
  if (!job) return 'Waiting';
  if (job.status === 'downloading') return `${Math.round(job.progress || 0)}%`;
  if (job.status === 'queued') return 'Queued';
  if (job.status === 'canceling') return 'Canceling';
  if (job.status === 'canceled') return 'Canceled';
  if (job.status === 'failed') return 'Failed';
  return 'Saved';
};

/* ── Radio station definitions ── */
const RADIO_STATIONS = [
  { id: 'bollywood', name: 'Bollywood Hits', query: 'Bollywood hits 2025', gradient: 'linear-gradient(135deg, #e91e63, #ff5722)' },
  { id: 'pop', name: 'Pop Hits', query: 'Pop hits 2025', gradient: 'linear-gradient(135deg, #2196f3, #00bcd4)' },
  { id: 'lofi', name: 'Lo-Fi Chill', query: 'Lofi chill beats', gradient: 'linear-gradient(135deg, #4caf50, #8bc34a)' },
  { id: 'hiphop', name: 'Hip Hop', query: 'Hip hop hits 2025', gradient: 'linear-gradient(135deg, #ff9800, #f44336)' },
  { id: 'rock', name: 'Rock Classics', query: 'Rock classics best', gradient: 'linear-gradient(135deg, #607d8b, #455a64)' },
  { id: 'indie', name: 'Indie Vibes', query: 'Indie music popular', gradient: 'linear-gradient(135deg, #9c27b0, #e91e63)' },
  { id: 'edm', name: 'EDM', query: 'EDM dance music 2025', gradient: 'linear-gradient(135deg, #00bcd4, #3f51b5)' },
  { id: 'devotional', name: 'Devotional', query: 'Devotional songs Hindi', gradient: 'linear-gradient(135deg, #ff9800, #ffc107)' },
  { id: 'punjabi', name: 'Punjabi', query: 'Punjabi songs 2025 hits', gradient: 'linear-gradient(135deg, #f44336, #e91e63)' },
  { id: 'retro', name: '90s Throwback', query: '90s hits throwback', gradient: 'linear-gradient(135deg, #795548, #ff9800)' },
  { id: 'your-station', name: 'Your Station', query: null, gradient: 'linear-gradient(135deg, #fc3c44, #a855f7)', isPersonal: true },
  { id: 'trending', name: 'Trending Now', query: 'Trending songs 2025', gradient: 'linear-gradient(135deg, #10b981, #06b6d4)' },
];

/* ── Library categories ── */
const LIBRARY_CATEGORIES = [
  { id: 'downloads', label: 'Downloads', icon: Download },
  { id: 'playlists', label: 'Playlists', icon: ListMusic },
  { id: 'favorites', label: 'Favorites', icon: Heart },
  { id: 'history', label: 'Recently Played', icon: Clock },
  { id: 'most-played', label: 'Most Played', icon: Music },
  { id: 'made-for-you', label: 'Made For You', icon: Sparkles },
  { id: 'settings', label: 'Settings & About', icon: Settings },
];

function App() {
  const {
    playTrack,
    currentTrack,
    getRecommendationsFor,
    togglePlay,
    skipNext,
    skipPrev,
    queue,
    queueIndex,
    setQueue,
    autoRadioEnabled,
    toggleAutoRadio,
  } = usePlayer();

  const [activeTab, setActiveTab] = useState('home');
  const [librarySubView, setLibrarySubView] = useState(null); // tracks sub-view within Library
  const [topTracks, setTopTracks] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [discoverSections, setDiscoverSections] = useState([]);
  const [personalMix, setPersonalMix] = useState(null);
  const [dailyMix, setDailyMix] = useState(null);
  const [madeForYou, setMadeForYou] = useState(null);
  const [basedOnRecent, setBasedOnRecent] = useState(null);
  const [downloadedTracks, setDownloadedTracks] = useState([]);
  const [downloadSummary, setDownloadSummary] = useState({ count: 0, totalBytes: 0 });
  const [downloadJobs, setDownloadJobs] = useState({});
  const [isOffline, setIsOffline] = useState(() => typeof navigator !== 'undefined' ? !navigator.onLine : false);
  const [isEqualizerOpen, setIsEqualizerOpen] = useState(false);
  const [isLyricsOpen, setIsLyricsOpen] = useState(false);
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [isTrendingLoading, setIsTrendingLoading] = useState(false);
  const [trendingError, setTrendingError] = useState(null);
  const [isDiscoverLoading, setIsDiscoverLoading] = useState(false);
  const [discoverError, setDiscoverError] = useState(null);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [radioLoading, setRadioLoading] = useState(null);
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('aura-theme') || document.documentElement.dataset.theme || 'dark';
    } catch {
      return document.documentElement.dataset.theme || 'dark';
    }
  });

  const [contextMenu, setContextMenu] = useState({ open: false, x: 0, y: 0, track: null, trackList: [] });
  const [contextMenuFocusIndex, setContextMenuFocusIndex] = useState(0);
  const contextMenuActionRefs = useRef([]);

  const [favorites, setFavorites] = useLocalStorage('aura-favorites', []);
  const [playlists, setPlaylists] = useLocalStorage('aura-playlists', []);
  const [history, setHistory] = useLocalStorage('aura-history', []);
  const [searchCache, setSearchCache] = useState({});
  const [playlistSubOpen, setPlaylistSubOpen] = useState(false);
  const platformLabel = Capacitor.isNativePlatform() ? 'Android app' : 'Web preview';

  const downloadedTrackMap = useMemo(() => {
    const next = new Map();
    for (const track of downloadedTracks) {
      const id = getTrackSourceId(track);
      if (id) next.set(id, track);
    }
    return next;
  }, [downloadedTracks]);

  const downloadJobList = useMemo(() => {
    const order = { downloading: 0, queued: 1, canceling: 2, failed: 3, canceled: 4 };
    return Object.values(downloadJobs).sort((a, b) => {
      const left = order[a.status] ?? 5;
      const right = order[b.status] ?? 5;
      return left - right;
    });
  }, [downloadJobs]);

  const activeDownloadCount = useMemo(
    () => downloadJobList.filter((job) => isActiveDownloadStatus(job.status)).length,
    [downloadJobList],
  );

  const getDownloadedEntry = useCallback((track) => {
    const id = getTrackSourceId(track);
    return id ? downloadedTrackMap.get(id) || null : null;
  }, [downloadedTrackMap]);

  const isTrackDownloaded = useCallback((track) => Boolean(getDownloadedEntry(track)), [getDownloadedEntry]);

  /* ════════════════ Theme toggle ════════════════ */
  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      localStorage.setItem('aura-theme', next);
      return next;
    });
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  /* ════════════════ Listening stats ════════════════ */
  const listeningStats = useMemo(() => {
    if (!history || history.length === 0) return { totalMinutes: 0, totalPlays: 0, topTracks: [], topArtists: [] };
    let totalDuration = 0;
    const trackMap = new Map();
    const artistMap = new Map();
    for (const track of history) {
      if (!track) continue;
      totalDuration += track.duration || 0;
      if (track.id) { const e = trackMap.get(track.id) || { track, count: 0 }; e.count += 1; trackMap.set(track.id, e); }
      if (track.artist) artistMap.set(track.artist, (artistMap.get(track.artist) || 0) + 1);
    }
    return {
      totalMinutes: Math.round(totalDuration / 60),
      totalPlays: history.length,
      topTracks: Array.from(trackMap.values()).sort((a, b) => b.count - a.count).slice(0, 3),
      topArtists: Array.from(artistMap.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 3),
    };
  }, [history]);

  const loadDownloads = useCallback(async () => {
    try {
      const result = await nativeMediaApi.getDownloadedTracks();
      setDownloadedTracks(Array.isArray(result?.tracks) ? result.tracks : []);
      setDownloadSummary(result?.summary || { count: 0, totalBytes: 0 });
    } catch {
      setDownloadedTracks([]);
      setDownloadSummary({ count: 0, totalBytes: 0 });
    }
  }, []);

  /* ════════════════ History tracking ════════════════ */
  useEffect(() => {
    if (!currentTrack) return;
    setHistory((prev) => buildHistory(prev, currentTrack));
  }, [currentTrack, setHistory]);

  useEffect(() => {
    let mounted = true;
    let progressListener;
    let completeListener;
    let failedListener;

    loadDownloads();

    const attachDownloadListeners = async () => {
      progressListener = await nativeMediaApi.onDownloadProgress((event) => {
        if (!mounted || !event?.id) return;
        setDownloadJobs((prev) => ({
          ...prev,
          [event.id]: {
            ...(prev[event.id] || {}),
            id: event.id,
            title: event.title || prev[event.id]?.title || 'Downloading track',
            progress: Number(event.progress || 0),
            status: event.status || 'downloading',
            message: '',
          },
        }));
      });

      completeListener = await nativeMediaApi.onDownloadCompleted((event) => {
        if (!mounted) return;
        if (event?.track) {
          setDownloadedTracks((prev) =>
            dedupeTracks([event.track, ...prev.filter((item) => getTrackSourceId(item) !== getTrackSourceId(event.track))])
          );
        }
        setDownloadSummary((prev) => event?.summary || prev);
        setDownloadJobs((prev) => {
          const next = { ...prev };
          const id = getTrackSourceId(event?.track);
          if (id) delete next[id];
          return next;
        });
      });

      failedListener = await nativeMediaApi.onDownloadFailed((event) => {
        if (!mounted || !event?.id) return;
        const nextStatus = event.status || (/cancel/i.test(event.message || '') ? 'canceled' : 'failed');
        setDownloadJobs((prev) => ({
          ...prev,
          [event.id]: {
            ...(prev[event.id] || {}),
            id: event.id,
            title: prev[event.id]?.title || 'Download',
            progress: prev[event.id]?.progress || 0,
            status: nextStatus,
            message: event.message || (nextStatus === 'canceled' ? 'Download canceled.' : 'Download failed.'),
          },
        }));
      });
    };

    attachDownloadListeners();

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      mounted = false;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      progressListener?.remove?.();
      completeListener?.remove?.();
      failedListener?.remove?.();
    };
  }, [loadDownloads]);

  /* ════════════════ Load trending ════════════════ */
  const loadTrending = useCallback(async () => {
    setIsTrendingLoading(true);
    setTrendingError(null);

    const seedTrack = downloadedTracks[0] || history[0] || favorites[0] || null;
    const localFallback = buildFallbackTracks({
      seedTrack,
      favorites,
      history,
      downloaded: downloadedTracks,
      limit: 20,
    });

    try {
      const userId = getOrCreateUserId();
      const recoRes = await recommendationsApi.getRecommendationsSafe(userId);
      if (recoRes.ok && recoRes.data?.trending?.length) {
        setTopTracks(onlyYoutube(recoRes.data.trending));
        return;
      }
      const ytFallback = await youtubeApi.searchSongsSafe('Top hits', 20);
      if (!ytFallback.ok) {
        if (localFallback.length) {
          setTopTracks(localFallback);
          return;
        }
        setTopTracks([]);
        setTrendingError(ytFallback.error || 'Unable to load trending songs.');
        return;
      }
      setTopTracks(onlyYoutube(ytFallback.data || []));
    } catch (error) {
      logError('app.loadTrending', error);
      if (localFallback.length) {
        setTopTracks(localFallback);
      } else {
        setTopTracks([]);
        setTrendingError('Unable to load trending songs.');
      }
    } finally { setIsTrendingLoading(false); }
  }, [downloadedTracks, favorites, history]);

  useEffect(() => { loadTrending(); }, [loadTrending]);

  /* ════════════════ Load discover (for Home + New) ════════════════ */
  const loadDiscover = useCallback(async () => {
    setIsDiscoverLoading(true);
    setDiscoverError(null);

    const seedTrack = downloadedTracks[0] || favorites[0] || history[0] || null;
    const localMixTracks = buildFallbackTracks({
      seedTrack,
      favorites,
      history,
      downloaded: downloadedTracks,
      limit: 20,
    });
    const localRecentTracks = dedupeTracks([...downloadedTracks, ...history]).slice(0, 12);

    try {
      const [newRes, popularRes] = await Promise.all([
        youtubeApi.searchSongsSafe('New releases', 8),
        youtubeApi.searchSongsSafe('Popular right now', 8),
      ]);
      if (!newRes.ok && !popularRes.ok) {
        if (localMixTracks.length) {
          const offlineSections = [
            { title: 'Recommended for You', tracks: localMixTracks },
          ];
          if (localRecentTracks.length) {
            offlineSections.push({ title: 'Recently Played', tracks: localRecentTracks });
          }
          setDiscoverSections(offlineSections);
        } else {
          setDiscoverSections([]);
          setDiscoverError('Could not load discover sections.');
        }
      } else {
        setDiscoverSections([
          { title: 'New Releases', tracks: onlyYoutube(newRes.data || []) },
          { title: 'Popular Right Now', tracks: onlyYoutube(popularRes.data || []) },
        ]);
      }

      if (seedTrack && getRecommendationsFor) {
        try {
          const recs = await getRecommendationsFor(seedTrack);
          if (recs?.length) {
            setPersonalMix({ title: `Because you listened to ${seedTrack.title}`, tracks: onlyYoutube(recs) });
          } else if (localMixTracks.length) {
            setPersonalMix({ title: `Because you listened to ${seedTrack.title}`, tracks: localMixTracks });
          } else {
            setPersonalMix(null);
          }
        } catch (e) { logError('app.personalMix', e); setPersonalMix(null); }
      } else setPersonalMix(null);

      const seenIds = new Set();
      const dmTracks = [];
      for (const t of onlyYoutube([...favorites, ...history])) {
        if (!t?.id || seenIds.has(t.id)) continue;
        seenIds.add(t.id);
        dmTracks.push(t);
        if (dmTracks.length >= 30) break;
      }
      setDailyMix(dmTracks.length ? { title: 'Daily Mix', tracks: dmTracks } : null);

      try {
        const userId = getOrCreateUserId();
        const recoRes = await recommendationsApi.getRecommendationsSafe(userId);
        if (recoRes.ok && recoRes.data) {
          setMadeForYou(recoRes.data.madeForYou?.length ? { title: 'Made for you', tracks: onlyYoutube(recoRes.data.madeForYou) } : null);
          setBasedOnRecent(recoRes.data.basedOnRecent?.length ? { title: 'Based on your recent plays', tracks: onlyYoutube(recoRes.data.basedOnRecent) } : null);
        } else {
          setMadeForYou(localMixTracks.length ? { title: 'Made for you', tracks: localMixTracks } : null);
          setBasedOnRecent(localRecentTracks.length ? { title: 'Based on your recent plays', tracks: localRecentTracks } : null);
        }
      } catch {
        setMadeForYou(localMixTracks.length ? { title: 'Made for you', tracks: localMixTracks } : null);
        setBasedOnRecent(localRecentTracks.length ? { title: 'Based on your recent plays', tracks: localRecentTracks } : null);
      }
    } catch (error) {
      logError('app.loadDiscover', error);
      if (localMixTracks.length) {
        const offlineSections = [{ title: 'Recommended for You', tracks: localMixTracks }];
        if (localRecentTracks.length) {
          offlineSections.push({ title: 'Recently Played', tracks: localRecentTracks });
        }
        setDiscoverError(null);
        setDiscoverSections(offlineSections);
        setMadeForYou({ title: 'Made for you', tracks: localMixTracks });
        setBasedOnRecent(localRecentTracks.length ? { title: 'Based on your recent plays', tracks: localRecentTracks } : null);
      } else {
        setDiscoverError('Discover is unavailable right now.');
        setDiscoverSections([]);
        setMadeForYou(null);
        setBasedOnRecent(null);
      }
      setPersonalMix(null);
      setDailyMix(null);
    } finally { setIsDiscoverLoading(false); }
  }, [downloadedTracks, favorites, history, getRecommendationsFor]);

  useEffect(() => { if (activeTab === 'home' || activeTab === 'new') loadDiscover(); }, [activeTab, loadDiscover]);

  /* ════════════════ Keyboard shortcuts ════════════════ */
  useEffect(() => {
    const handler = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
      else if (e.code === 'ArrowRight') { e.preventDefault(); skipNext(); }
      else if (e.code === 'ArrowLeft') { e.preventDefault(); skipPrev(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [togglePlay, skipNext, skipPrev]);

  /* ════════════════ Search ════════════════ */
  const handleSearch = useCallback(async (query, options = {}) => {
    const { force = false } = options;
    setSearchQuery(query);
    setActiveTab('search');
    const term = query.trim();
    if (!term) { setSearchResults([]); setSearchError(null); return; }
    if (!force && searchCache[term]) { setSearchResults(searchCache[term]); setSearchError(null); return; }
    setIsSearchLoading(true);
    setSearchError(null);
    try {
      const ytRes = await youtubeApi.searchSongsSafe(term, 20);
      if (!ytRes.ok) { setSearchResults([]); setSearchError(ytRes.error || 'Search unavailable.'); return; }
      const combined = onlyYoutube(ytRes.data || []);
      setSearchResults(combined);
      setSearchCache((prev) => ({ ...prev, [term]: combined }));
    } catch (error) {
      logError('app.handleSearch', error);
      setSearchResults([]);
      setSearchError('Search unavailable.');
    } finally { setIsSearchLoading(false); }
  }, [searchCache]);

  /* ════════════════ Favorites & playlists ════════════════ */
  const toggleFavorite = useCallback((track) => {
    setFavorites((prev) =>
      prev.some((f) => f.id === track.id) ? prev.filter((f) => f.id !== track.id) : [...prev, track]
    );
  }, [setFavorites]);

  const createPlaylist = (name) => {
    setPlaylists([...playlists, { id: Date.now().toString(), name, color: randomColor(), tracks: [] }]);
  };

  /* ════════════════ Radio station player ════════════════ */
  const playStation = useCallback(async (station) => {
    setRadioLoading(station.id);
    try {
      let tracks = [];
      if (station.isPersonal) {
        const userId = getOrCreateUserId();
        const recoRes = await recommendationsApi.getRecommendationsSafe(userId);
        if (recoRes.ok && recoRes.data) {
          tracks = onlyYoutube([
            ...(recoRes.data.madeForYou || []),
            ...(recoRes.data.basedOnRecent || []),
            ...(recoRes.data.trending || []),
          ]);
        }
        if (tracks.length === 0) {
          // Fallback: use favorites + history as seed
          tracks = dedupeTracks([...downloadedTracks, ...favorites, ...history]).slice(0, 20);
        }
      } else {
        const res = await youtubeApi.searchSongsSafe(station.query, 20);
        if (res.ok) tracks = onlyYoutube(res.data || []);
      }
      if (tracks.length > 0) {
        const shuffled = [...tracks].sort(() => Math.random() - 0.5);
        playTrack(shuffled[0], shuffled, { mode: 'radio' });
      }
    } catch (e) {
      logError('app.playStation', e);
    } finally { setRadioLoading(null); }
  }, [downloadedTracks, favorites, history, playTrack]);

  /* ════════════════ Context menu ════════════════ */
  const handleTrackContextMenu = (event, track, trackList) => {
    setContextMenu({ open: true, x: event.clientX, y: event.clientY, track, trackList: trackList || [] });
  };

  const closeContextMenu = useCallback(() => {
    setContextMenu((p) => ({ ...p, open: false, track: null }));
    setPlaylistSubOpen(false);
  }, []);

  const handlePlayNextFromMenu = useCallback(() => {
    const track = contextMenu.track;
    if (!track) return;
    if (!queue?.length || queueIndex < 0) { playTrack(track, [track]); closeContextMenu(); return; }
    setQueue((prev) => insertTrackNext(prev, queueIndex, track));
    closeContextMenu();
  }, [closeContextMenu, contextMenu.track, playTrack, queue, queueIndex, setQueue]);

  const handleStartRadioFromMenu = useCallback(() => {
    const track = contextMenu.track;
    if (!track) return;
    playTrack(track, contextMenu.trackList || [], { mode: 'radio' });
    closeContextMenu();
  }, [closeContextMenu, contextMenu.track, contextMenu.trackList, playTrack]);

  const handleToggleFavoriteFromMenu = useCallback(() => {
    if (contextMenu.track) toggleFavorite(contextMenu.track);
    closeContextMenu();
  }, [closeContextMenu, contextMenu.track, toggleFavorite]);

  const handleCancelDownload = useCallback(async (id) => {
    if (!id) return;
    setDownloadJobs((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || {}),
        id,
        status: 'canceling',
        message: '',
      },
    }));

    try {
      await nativeMediaApi.cancelDownload(id);
    } catch {
      setDownloadJobs((prev) => ({
        ...prev,
        [id]: {
          ...(prev[id] || {}),
          id,
          status: 'failed',
          message: 'Unable to cancel this download right now.',
        },
      }));
    }
  }, []);

  const handleDismissDownloadJob = useCallback((id) => {
    setDownloadJobs((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const handleDeleteDownloadedTrack = useCallback(async (track) => {
    const downloadedTrack = track?.source === 'downloaded' ? track : getDownloadedEntry(track);
    const downloadId = getTrackSourceId(downloadedTrack);
    if (!downloadedTrack || !downloadId) return false;

    try {
      const result = await nativeMediaApi.deleteDownloadedTrack(downloadId);
      if (result?.deleted) {
        setDownloadedTracks((prev) => prev.filter((item) => getTrackSourceId(item) !== downloadId));
        setDownloadSummary((prev) => result?.summary || prev);
      } else {
        await loadDownloads();
      }

      setDownloadJobs((prev) => {
        const next = { ...prev };
        delete next[downloadId];
        return next;
      });
      return Boolean(result?.deleted);
    } catch {
      return false;
    }
  }, [getDownloadedEntry, loadDownloads]);

  const handleDownloadTrack = useCallback(async () => {
    const track = contextMenu.track;
    if (!track) return;

    const existingDownload = getDownloadedEntry(track);
    if (existingDownload) {
      await handleDeleteDownloadedTrack(existingDownload);
      closeContextMenu();
      return;
    }

    const downloadUrl = track.source === 'youtube'
      ? `${API_BASE}/yt/download/${track.videoId || track.id?.replace(/^yt-/, '')}`
      : track.streamUrl;

    if (!downloadUrl) {
      closeContextMenu();
      return;
    }

    if (Capacitor.isNativePlatform()) {
      const downloadId = getTrackSourceId(track);
      setDownloadJobs((prev) => ({
        ...prev,
        [downloadId]: {
          id: downloadId,
          title: track.title || 'Untitled',
          progress: 0,
          status: 'queued',
          message: '',
        },
      }));
      closeContextMenu();

      void nativeMediaApi.downloadTrack({
        id: downloadId,
        title: track.title,
        artist: track.artist,
        album: track.album || '',
        artwork: track.coverArt || '',
        duration: track.duration || 0,
        url: downloadUrl,
      }).catch((error) => {
        const message = error?.message || 'Download failed.';
        setDownloadJobs((prev) => ({
          ...prev,
          [downloadId]: {
            ...(prev[downloadId] || {}),
            id: downloadId,
            title: track.title || 'Untitled',
            status: /cancel/i.test(message) ? 'canceled' : 'failed',
            message,
          },
        }));
      });
      return;
    }

    const link = document.createElement('a');
    link.href = downloadUrl;
    link.target = '_blank';
    link.rel = 'noopener';
    link.download = `${(track.title || 'track').replace(/[^\w\s-]+/g, '').trim() || 'track'}.m4a`;
    document.body.appendChild(link);
    link.click();
    link.remove();

    closeContextMenu();
  }, [closeContextMenu, contextMenu.track, getDownloadedEntry, handleDeleteDownloadedTrack]);

  const handleAddToPlaylist = useCallback((playlistId) => {
    const track = contextMenu.track;
    if (!track) return;
    setPlaylists((prev) => prev.map((pl) =>
      pl.id === playlistId && !pl.tracks.some((t) => t.id === track.id)
        ? { ...pl, tracks: [...pl.tracks, track] } : pl
    ));
    setPlaylistSubOpen(false);
    closeContextMenu();
  }, [closeContextMenu, contextMenu.track, setPlaylists]);

  const contextMenuActions = [handlePlayNextFromMenu, handleStartRadioFromMenu, handleDownloadTrack, handleToggleFavoriteFromMenu];

  useEffect(() => {
    if (!contextMenu.open) return;
    setContextMenuFocusIndex(0);
    const t = setTimeout(() => contextMenuActionRefs.current[0]?.focus(), 0);
    return () => clearTimeout(t);
  }, [contextMenu.open]);

  /* ════════════════ Computed track lists ════════════════ */
  const getMostPlayed = useMemo(() => {
    const counts = new Map();
    for (const t of history) { if (!t?.id) continue; const e = counts.get(t.id) || { track: t, count: 0 }; e.count += 1; counts.set(t.id, e); }
    return Array.from(counts.values()).sort((a, b) => b.count - a.count).map((e) => e.track);
  }, [history]);

  const handlePlayAll = useCallback((tracks) => {
    if (tracks.length > 0) playTrack(tracks[0], tracks);
  }, [playTrack]);

  const handleShuffleAll = useCallback((tracks) => {
    if (tracks.length > 0) {
      const s = [...tracks].sort(() => Math.random() - 0.5);
      playTrack(s[0], s);
    }
  }, [playTrack]);

  /* ════════════════ Tab change handler (reset sub-views) ════════════════ */
  const handleTabChange = useCallback((tab) => {
    setActiveTab(tab);
    setLibrarySubView(null);
  }, []);

  /* ════════════════ Render helpers ════════════════ */
  const renderTrackList = (tracks, title, options = {}) => {
    const {
      showActions = true,
      variant = 'list',
      playMode = variant === 'tile' ? 'radio' : 'list',
    } = options;
    const displayed = onlyYoutube(tracks).slice(0, 150);
    return (
      <section className="track-section">
        <div className="section-header">
          <h2>{title}</h2>
          {showActions && displayed.length > 1 && (
            <div className="section-header-actions">
              <button className="section-action-btn" onClick={() => handlePlayAll(displayed)} type="button"><Play size={14} /> Play</button>
              <button className="section-action-btn" onClick={() => handleShuffleAll(displayed)} type="button"><Shuffle size={14} /> Shuffle</button>
            </div>
          )}
        </div>
        {displayed.length === 0 ? (
          <div className="empty-state">No tracks available</div>
        ) : (
          <div className="track-grid" role="list">
            {displayed.map((track, index) => (
              <TrackCard
                key={track.id + index}
                track={track}
                isActive={currentTrack?.id === track.id}
                isPlaying={currentTrack?.id === track.id}
                isFav={favorites.some((f) => f.id === track.id)}
                isDownloaded={isTrackDownloaded(track)}
                onPlay={(t) => playTrack(t, displayed, { mode: playMode })}
                onFav={toggleFavorite}
                onContextMenu={(e, t) => handleTrackContextMenu(e, t, displayed)}
                variant={variant}
              />
            ))}
          </div>
        )}
      </section>
    );
  };

  const renderHorizontalSection = (tracks, title, options = {}) => {
    const { playMode = 'radio' } = options;
    const displayed = dedupeTracks(tracks || []).slice(0, 20);
    if (displayed.length === 0) return null;
    return (
      <section className="track-section" style={{ padding: 0 }}>
        <div className="section-header" style={{ padding: '0 16px' }}>
          <h2>{title}</h2>
        </div>
        <div className="horizontal-scroll">
          {displayed.map((track, i) => (
            <TrackCard
              key={track.id + i}
              track={track}
              isActive={currentTrack?.id === track.id}
              isPlaying={currentTrack?.id === track.id}
              isFav={favorites.some((f) => f.id === track.id)}
              isDownloaded={isTrackDownloaded(track)}
              onPlay={(t) => playTrack(t, displayed, { mode: playMode })}
              onFav={toggleFavorite}
              onContextMenu={(e, t) => handleTrackContextMenu(e, t, displayed)}
              variant="tile"
            />
          ))}
        </div>
      </section>
    );
  };

  const renderDownloadsView = () => (
    <>
      <section className="downloads-summary-card">
        <div className="downloads-summary-main">
          <p className="settings-eyebrow">Offline Library</p>
          <h2>Downloads</h2>
          <p>Save tracks to this device for faster replay, offline listening, and more reliable fallback recommendations.</p>
        </div>
        <div className="downloads-summary-stats">
          <div className="downloads-stat">
            <span className="downloads-stat-label">Saved</span>
            <strong>{downloadSummary.count}</strong>
          </div>
          <div className="downloads-stat">
            <span className="downloads-stat-label">Storage</span>
            <strong>{formatBytes(downloadSummary.totalBytes)}</strong>
          </div>
          <div className="downloads-stat">
            <span className="downloads-stat-label">Active</span>
            <strong>{activeDownloadCount}</strong>
          </div>
        </div>
      </section>

      {downloadJobList.length > 0 && (
        <section className="track-section">
          <div className="section-header">
            <h2>Download Activity</h2>
          </div>
          <div className="download-job-list">
            {downloadJobList.map((job) => (
              <div key={job.id} className="download-job-card">
                <div className="download-job-copy">
                  <div className="download-job-title-row">
                    <span className="download-job-title">{job.title || 'Download'}</span>
                    <span className="download-job-status">{getDownloadStatusLabel(job)}</span>
                  </div>
                  <div className="download-progress">
                    <div className="download-progress-fill" style={{ width: `${Math.max(0, Math.min(100, job.progress || 0))}%` }} />
                  </div>
                  {job.message && !isActiveDownloadStatus(job.status) && (
                    <p className="download-job-message">{job.message}</p>
                  )}
                </div>
                {isActiveDownloadStatus(job.status) ? (
                  <button className="download-job-action" onClick={() => handleCancelDownload(job.id)} type="button">
                    Cancel
                  </button>
                ) : (
                  <button className="download-job-action" onClick={() => handleDismissDownloadJob(job.id)} type="button">
                    <X size={14} />
                    Dismiss
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {downloadedTracks.length > 0 ? (
        <section className="track-section">
          <div className="section-header">
            <h2>Saved For Offline</h2>
            {downloadedTracks.length > 1 && (
              <div className="section-header-actions">
                <button className="section-action-btn" onClick={() => handlePlayAll(downloadedTracks)} type="button">
                  <Play size={14} /> Play
                </button>
                <button className="section-action-btn" onClick={() => handleShuffleAll(downloadedTracks)} type="button">
                  <Shuffle size={14} /> Shuffle
                </button>
              </div>
            )}
          </div>
          <div className="download-track-list">
            {downloadedTracks.map((track, index) => {
              const isCurrent = currentTrack?.id === track.id;
              const metaBits = [formatBytes(track.sizeBytes)];
              const durationLabel = formatDuration(track.duration);
              if (durationLabel) metaBits.push(durationLabel);

              return (
                <div key={track.id || `${track.originalId}-${index}`} className={`download-track-row${isCurrent ? ' download-track-row--active' : ''}`}>
                  <button
                    className="download-track-main"
                    onClick={() => playTrack(track, downloadedTracks, { mode: 'list' })}
                    type="button"
                  >
                    {track.coverArt ? (
                      <img src={track.coverArt} alt="" className="download-track-cover" />
                    ) : (
                      <div className="download-track-cover download-track-cover--placeholder">
                        <Music size={18} />
                      </div>
                    )}
                    <div className="download-track-copy">
                      <div className="download-track-title-row">
                        <span className="download-track-title">{track.title || 'Untitled'}</span>
                        <span className="track-status-pill track-status-pill--downloaded">Offline</span>
                      </div>
                      <p className="download-track-subtitle">{track.artist || 'Unknown'}</p>
                      <span className="download-track-meta">{metaBits.join(' · ')}</span>
                    </div>
                  </button>
                  <button
                    className="download-row-action"
                    onClick={() => handleDeleteDownloadedTrack(track)}
                    aria-label={`Delete ${track.title || 'track'} download`}
                    title={isCurrent ? 'Deleting the current playing download may interrupt playback.' : 'Delete download'}
                    type="button"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <div className="empty-state">
          Downloaded tracks will appear here for offline playback and quicker repeat listening.
        </div>
      )}
    </>
  );

  const renderSettingsView = () => (
    <section className="settings-panel">
      <div className="settings-hero">
        <div>
          <p className="settings-eyebrow">Aura Music</p>
          <h2>Settings &amp; About</h2>
          <p>Playback polish, offline controls, and the release notes that make the project easier to ship and easier to contribute to.</p>
        </div>
        <span className="settings-platform-pill">{platformLabel}</span>
      </div>

      <div className="settings-card">
        <div className="section-header">
          <h2>Playback</h2>
        </div>
        <div className="settings-row">
          <div className="settings-row-copy">
            <strong className="settings-row-title">Theme</strong>
            <span className="settings-row-text">Keep the app in {theme} mode across launches.</span>
          </div>
          <button className="section-action-btn" onClick={toggleTheme} type="button">
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
        </div>
        <div className="settings-row">
          <div className="settings-row-copy">
            <strong className="settings-row-title">Autoplay similar songs</strong>
            <span className="settings-row-text">Continue with related music when your queue or search radio runs out.</span>
          </div>
          <button className={`section-action-btn ${autoRadioEnabled ? 'control-active' : ''}`} onClick={toggleAutoRadio} type="button">
            {autoRadioEnabled ? 'On' : 'Off'}
          </button>
        </div>
        <div className="settings-row">
          <div className="settings-row-copy">
            <strong className="settings-row-title">Equalizer</strong>
            <span className="settings-row-text">Open the Android-native EQ presets without leaving the app.</span>
          </div>
          <button className="section-action-btn" onClick={() => setIsEqualizerOpen(true)} type="button">
            Open EQ
          </button>
        </div>
      </div>

      <div className="settings-card">
        <div className="section-header">
          <h2>Offline &amp; Device</h2>
        </div>
        <div className="settings-row">
          <div className="settings-row-copy">
            <strong className="settings-row-title">Downloads</strong>
            <span className="settings-row-text">{downloadSummary.count} saved tracks using {formatBytes(downloadSummary.totalBytes)} on this device.</span>
          </div>
          <button className="section-action-btn" onClick={() => setLibrarySubView('downloads')} type="button">
            Manage
          </button>
        </div>
        <div className="settings-row">
          <div className="settings-row-copy">
            <strong className="settings-row-title">Offline mode</strong>
            <span className="settings-row-text">{isOffline ? 'You are offline now, so the app will lean on downloads, favorites, and recent history.' : 'When the network drops, fallback mixes are built from downloads, favorites, and recent history.'}</span>
          </div>
          <span className={`track-status-pill ${isOffline ? 'track-status-pill--downloaded' : ''}`}>{isOffline ? 'Offline' : 'Online'}</span>
        </div>
      </div>

      <div className="settings-feature-grid">
        <div className="settings-feature-card">
          <ShieldCheck size={18} className="settings-feature-icon" />
          <strong>Playback reliability</strong>
          <p>Background playback, lockscreen controls, queue sync, and metadata updates stay aligned with the current track.</p>
        </div>
        <div className="settings-feature-card">
          <Smartphone size={18} className="settings-feature-icon" />
          <strong>Android-first extras</strong>
          <p>Widget, equalizer, native downloads, and device media controls work in the Android app with graceful fallbacks on web.</p>
        </div>
        <div className="settings-feature-card">
          <WifiOff size={18} className="settings-feature-icon" />
          <strong>Fallback behavior</strong>
          <p>Recommendations fall back to local listening signals and lyrics sync appears automatically when timed lyrics are available.</p>
        </div>
      </div>

      <div className="settings-card">
        <div className="section-header">
          <h2>Open Source Notes</h2>
        </div>
        <p className="settings-row-text">The repo now includes contributor templates, CI, a privacy note, a roadmap, and release-check docs so the project is easier to maintain in public.</p>
        <div className="settings-doc-list">
          <span className="settings-doc-chip">README.md</span>
          <span className="settings-doc-chip">PRIVACY.md</span>
          <span className="settings-doc-chip">ROADMAP.md</span>
          <span className="settings-doc-chip">OPEN_SOURCE_RELEASE_CHECKLIST.md</span>
        </div>
      </div>

      <ReliabilityPanel isOffline={isOffline} platformLabel={platformLabel} />
    </section>
  );

  const downloadCategoryMeta = activeDownloadCount > 0 ? `${activeDownloadCount} active` : downloadSummary.count > 0 ? `${downloadSummary.count} saved` : 'Offline ready';
  const contextTrackDownload = contextMenu.track ? getDownloadedEntry(contextMenu.track) : null;
  const contextDownloadLabel = contextTrackDownload ? 'Remove Download' : 'Download';

  /* ════════════════ RENDER ════════════════ */
  const tabTitle = activeTab === 'home' ? 'Home' : activeTab === 'new' ? 'New' : activeTab === 'radio' ? 'Radio' : activeTab === 'library' ? 'Library' : activeTab === 'search' ? 'Search' : '';

  return (
    <div className="app-container">
      <main className="main-content">
        {/* Top bar (not shown on search tab — search has its own) */}
        {activeTab !== 'search' && (
          <header className="top-bar">
            {librarySubView ? (
              <button className="icon-btn" onClick={() => setLibrarySubView(null)} style={{ fontSize: 16 }}>
                ← {tabTitle}
              </button>
            ) : (
              <h1 className="top-bar-title">{tabTitle}</h1>
            )}
            <div className="top-bar-actions">
              <button className="theme-toggle-btn" onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
                {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
              </button>
              <div className="user-profile" aria-label="User profile">
                <div className="avatar"><User size={16} color="white" /></div>
              </div>
            </div>
          </header>
        )}

        <div className="content-scroll">
          <div key={activeTab + (librarySubView || '')} className="tab-content-enter">

            {/* ═══════════ HOME TAB ═══════════ */}
            {activeTab === 'home' && (
              <>
                {isTrendingLoading && !topTracks.length && (
                  <AsyncState state="loading" title="Loading" message="Fetching trending songs..." />
                )}
                {!isTrendingLoading && trendingError && !topTracks.length && (
                  <AsyncState state="error" title="Could not load" message={trendingError} onRetry={loadTrending} />
                )}

                {isOffline && downloadedTracks.length > 0 && renderHorizontalSection(downloadedTracks, 'Offline Downloads', { playMode: 'list' })}
                {dailyMix && renderHorizontalSection(dailyMix.tracks, dailyMix.title)}
                {topTracks.length > 0 && renderTrackList(topTracks, 'Trending Songs')}
                {basedOnRecent && renderTrackList(basedOnRecent.tracks, basedOnRecent.title)}
                {personalMix && renderHorizontalSection(personalMix.tracks, personalMix.title)}
              </>
            )}

            {/* ═══════════ NEW TAB ═══════════ */}
            {activeTab === 'new' && (
              <>
                {isDiscoverLoading && !discoverSections.length && (
                  <AsyncState state="loading" title="Loading" message="Building discover..." />
                )}
                {!isDiscoverLoading && discoverError && !discoverSections.length && (
                  <AsyncState state="error" title="Could not load" message={discoverError} onRetry={loadDiscover} />
                )}

                {discoverSections.map((section, i) => (
                  i === 0
                    ? renderTrackList(section.tracks, section.title, { key: i })
                    : renderHorizontalSection(section.tracks, section.title)
                ))}

                {madeForYou && renderTrackList(madeForYou.tracks, madeForYou.title)}
              </>
            )}

            {/* ═══════════ RADIO TAB ═══════════ */}
            {activeTab === 'radio' && (
              <div className="radio-grid">
                {RADIO_STATIONS.map((station) => (
                  <button
                    key={station.id}
                    className="radio-card"
                    style={{ background: station.gradient }}
                    onClick={() => playStation(station)}
                    disabled={radioLoading === station.id}
                    type="button"
                  >
                    <div className="radio-card-title">
                      {radioLoading === station.id ? 'Loading...' : station.name}
                    </div>
                    <div className="radio-card-subtitle">
                      {station.isPersonal ? 'Based on your taste' : 'Tap to play'}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* ═══════════ LIBRARY TAB ═══════════ */}
            {activeTab === 'library' && !librarySubView && (
              <>
                <nav className="library-categories">
                  {LIBRARY_CATEGORIES.map((category) => (
                    <button key={category.id} className="library-category-item" onClick={() => setLibrarySubView(category.id)} type="button">
                      <category.icon size={22} className="library-category-icon" />
                      <span className="library-category-label">{category.label}</span>
                      {category.id === 'downloads' && (
                        <span className="library-category-meta">{downloadCategoryMeta}</span>
                      )}
                      <ChevronRight size={18} className="library-category-chevron" />
                    </button>
                  ))}
                  {playlists.map((pl) => (
                    <button key={pl.id} className="library-category-item" onClick={() => setLibrarySubView(`playlist-${pl.id}`)} type="button">
                      <Disc3 size={22} className="library-category-icon" style={{ color: pl.color }} />
                      <span className="library-category-label">{pl.name}</span>
                      <ChevronRight size={18} className="library-category-chevron" />
                    </button>
                  ))}
                </nav>

                {/* Recently Added */}
                {history.length > 0 && renderHorizontalSection(history.slice(0, 15), 'Recently Added')}
              </>
            )}

            {/* Library sub-views */}
            {activeTab === 'library' && librarySubView === 'downloads' && (
              renderDownloadsView()
            )}
            {activeTab === 'library' && librarySubView === 'favorites' && renderTrackList(favorites, 'Favorites')}
            {activeTab === 'library' && librarySubView === 'history' && (
              <>
                {history.length > 0 && (
                  <div className="history-stats">
                    <div className="history-stats-main">
                      <h3>Listening summary</h3>
                      <p>{listeningStats.totalMinutes} min · {listeningStats.totalPlays} plays</p>
                    </div>
                    <div className="history-stats-meta">
                      {listeningStats.topArtists.length > 0 && (
                        <div className="history-stat-column">
                          <span className="history-stat-label">Top artists</span>
                          <span className="history-stat-value">{listeningStats.topArtists.map((a) => a.name).join(', ')}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {renderTrackList(history, 'Recently Played')}
              </>
            )}
            {activeTab === 'library' && librarySubView === 'most-played' && renderTrackList(getMostPlayed, 'Most Played')}
            {activeTab === 'library' && librarySubView === 'playlists' && (
              <section className="track-section">
                <div className="section-header">
                  <h2>Playlists</h2>
                  <button className="section-action-btn" onClick={() => {
                    const name = prompt('Playlist name:');
                    if (name?.trim()) createPlaylist(name.trim());
                  }} type="button"><ListPlus size={14} /> New</button>
                </div>
                {playlists.length === 0 ? (
                  <div className="empty-state">No playlists yet. Create one!</div>
                ) : (
                  <nav className="library-categories">
                    {playlists.map((pl) => (
                      <button key={pl.id} className="library-category-item" onClick={() => setLibrarySubView(`playlist-${pl.id}`)} type="button">
                        <Disc3 size={22} style={{ color: pl.color }} />
                        <span className="library-category-label">{pl.name}</span>
                        <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--text-300)' }}>{pl.tracks.length}</span>
                        <ChevronRight size={18} className="library-category-chevron" />
                      </button>
                    ))}
                  </nav>
                )}
              </section>
            )}
            {activeTab === 'library' && librarySubView === 'made-for-you' && (
              madeForYou ? renderTrackList(madeForYou.tracks, madeForYou.title) : <div className="empty-state">Start listening to build your personalized mix</div>
            )}
            {activeTab === 'library' && librarySubView === 'settings' && renderSettingsView()}
            {activeTab === 'library' && librarySubView?.startsWith('playlist-') && (() => {
              const pl = playlists.find((p) => p.id === librarySubView.replace('playlist-', ''));
              if (!pl) return <div className="empty-state">Playlist not found</div>;
              return renderTrackList(pl.tracks, pl.name);
            })()}

            {/* ═══════════ SEARCH TAB ═══════════ */}
            {activeTab === 'search' && (
              <>
                <div className="search-screen-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                    <h1 className="top-bar-title" style={{ flex: 1 }}>Search</h1>
                    <button className="theme-toggle-btn" onClick={toggleTheme} title="Toggle theme">
                      {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
                    </button>
                  </div>
                  <SearchBar onSearch={handleSearch} />
                </div>

                {isSearchLoading && <AsyncState state="loading" title="Searching" message="Looking for songs..." />}
                {!isSearchLoading && searchError && !searchResults.length && (
                  <AsyncState state="error" title="Search failed" message={searchError} onRetry={() => handleSearch(searchQuery, { force: true })} />
                )}
                {!isSearchLoading && !searchError && searchResults.length === 0 && searchQuery && (
                  <div className="empty-state">No results for &ldquo;{searchQuery}&rdquo;</div>
                )}
                {searchResults.length > 0 && renderTrackList(searchResults, `Results for "${searchQuery}"`, { showActions: false, playMode: 'radio' })}

                {/* Browse suggestions when empty */}
                {!searchQuery && topTracks.length > 0 && renderTrackList(topTracks.slice(0, 10), 'Trending')}
              </>
            )}

          </div>
        </div>
      </main>

      {/* Bottom navigation */}
      <Sidebar activeTab={activeTab} onTabChange={handleTabChange} />

      {/* Players */}
      <PlaybackBar onOpenLyrics={() => setIsLyricsOpen(true)} onOpenQueue={() => setIsQueueOpen(true)} onOpenEqualizer={() => setIsEqualizerOpen(true)} />
      <MobilePlayer
        onOpenLyrics={() => setIsLyricsOpen(true)}
        onOpenQueue={() => setIsQueueOpen(true)}
        onOpenEqualizer={() => setIsEqualizerOpen(true)}
        isSuppressed={contextMenu.open}
      />
      <EqualizerModal isOpen={isEqualizerOpen} onClose={() => setIsEqualizerOpen(false)} />
      <LyricsModal isOpen={isLyricsOpen} onClose={() => setIsLyricsOpen(false)} />
      <QueueViewer isOpen={isQueueOpen} onClose={() => setIsQueueOpen(false)} />

      {/* Context Menu — Bottom Sheet */}
      {contextMenu.open && contextMenu.track && (
        <div className="track-context-menu-overlay" onClick={closeContextMenu}>
          <div
            className="track-context-menu"
            onClick={(e) => e.stopPropagation()}
            role="menu"
            aria-label="Track options"
            onKeyDown={(e) => {
              if (e.key === 'Escape') { e.preventDefault(); closeContextMenu(); return; }
              if (e.key === 'ArrowDown') { e.preventDefault(); const n = (contextMenuFocusIndex + 1) % contextMenuActions.length; setContextMenuFocusIndex(n); contextMenuActionRefs.current[n]?.focus(); }
              if (e.key === 'ArrowUp') { e.preventDefault(); const n = (contextMenuFocusIndex - 1 + contextMenuActions.length) % contextMenuActions.length; setContextMenuFocusIndex(n); contextMenuActionRefs.current[n]?.focus(); }
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); contextMenuActions[contextMenuFocusIndex]?.(); }
            }}
          >
            {/* Track info header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px 12px', borderBottom: '1px solid var(--divider)' }}>
              {contextMenu.track.coverArt && <img src={contextMenu.track.coverArt} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover' }} />}
              <div style={{ overflow: 'hidden' }}>
                <div style={{ fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{contextMenu.track.title}</div>
                <div style={{ fontSize: 13, color: 'var(--text-300)' }}>{contextMenu.track.artist}</div>
              </div>
            </div>

            <button className="track-context-item" onClick={handlePlayNextFromMenu} role="menuitem" ref={(el) => { contextMenuActionRefs.current[0] = el; }} type="button">
              <SkipForward size={18} /> Play Next
            </button>
            <button className="track-context-item" onClick={handleStartRadioFromMenu} role="menuitem" ref={(el) => { contextMenuActionRefs.current[1] = el; }} type="button">
              <Music size={18} /> Start Song Radio
            </button>
            <button className="track-context-item" onClick={handleDownloadTrack} role="menuitem" ref={(el) => { contextMenuActionRefs.current[2] = el; }} type="button">
              {contextTrackDownload ? <Trash2 size={18} /> : <Download size={18} />} {contextDownloadLabel}
            </button>
            <button className="track-context-item" onClick={handleToggleFavoriteFromMenu} role="menuitem" ref={(el) => { contextMenuActionRefs.current[3] = el; }} type="button">
              <Heart size={18} /> {favorites.some((f) => f.id === contextMenu.track.id) ? 'Remove from Favorites' : 'Add to Favorites'}
            </button>
            {playlists.length > 0 && (
              <div className="ctx-playlist-group">
                <button className="track-context-item ctx-playlist-toggle" onClick={() => setPlaylistSubOpen((p) => !p)} role="menuitem" type="button">
                  <ListPlus size={18} /> Add to Playlist
                </button>
                {playlistSubOpen && (
                  <div className="ctx-playlist-sub">
                    {playlists.map((pl) => (
                      <button key={pl.id} className="track-context-item ctx-playlist-item" onClick={() => handleAddToPlaylist(pl.id)} role="menuitem" type="button">
                        <span className="ctx-playlist-dot" style={{ background: pl.color }} />
                        {pl.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
