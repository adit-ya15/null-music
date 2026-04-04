import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Database, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { youtubeApi } from '../api/youtube';

const formatTime = (value) => {
  if (!value) return 'Never';
  try {
    return new Date(value).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return 'Unknown';
  }
};

const getUrlKind = (url = '', source = '') => {
  if (!url) return 'missing';
  if (url.startsWith('file:')) return 'local-file';
  if (url.includes('/api/yt/cache/')) return 'disk-cache';
  if (source === 'monochrome') return 'monochrome';
  if (source === 'soundcloud') return 'soundcloud';
  if (source === 'yt-dlp') return 'yt-dlp';
  if (source === 'downloaded') return 'downloaded';
  return 'remote';
};

export default function ReliabilityPanel({ isOffline, platformLabel }) {
  const {
    currentTrack,
    isPlaying,
    isLoading,
    playbackError,
    reliabilityDebug,
    clearReliabilityEvents,
  } = usePlayer();
  const [cacheProbe, setCacheProbe] = useState({
    loading: false,
    error: '',
    data: null,
    checkedAt: 0,
  });

  const isYoutubeTrack = currentTrack?.source === 'youtube' && Boolean(currentTrack?.videoId || currentTrack?.id);
  const videoId = currentTrack?.videoId || currentTrack?.id?.replace(/^yt-/, '') || null;

  const refreshProbe = useCallback(async () => {
    if (!isYoutubeTrack || !videoId) {
      setCacheProbe({ loading: false, error: '', data: null, checkedAt: Date.now() });
      return;
    }

    setCacheProbe((prev) => ({ ...prev, loading: true, error: '' }));
    const result = await youtubeApi.getCacheStatusSafe(videoId);
    if (!result.ok) {
      setCacheProbe({
        loading: false,
        error: result.error || 'Unable to fetch cache status.',
        data: null,
        checkedAt: Date.now(),
      });
      return;
    }

    setCacheProbe({
      loading: false,
      error: '',
      data: result.data,
      checkedAt: Date.now(),
    });
  }, [isYoutubeTrack, videoId]);

  useEffect(() => {
    const initial = setTimeout(() => {
      refreshProbe();
    }, 0);
    if (!isYoutubeTrack || !videoId) {
      return () => clearTimeout(initial);
    }

    const interval = setInterval(() => {
      refreshProbe();
    }, 5000);

    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [isYoutubeTrack, refreshProbe, videoId]);

  const playbackStateLabel = useMemo(() => {
    if (isLoading) return 'Buffering';
    if (isPlaying) return 'Playing';
    if (currentTrack) return 'Paused';
    return 'Idle';
  }, [currentTrack, isLoading, isPlaying]);

  const urlKind = getUrlKind(currentTrack?.streamUrl || '', currentTrack?.source || '');
  const backendCacheLabel = cacheProbe.data?.cached ? 'Cached on disk' : cacheProbe.data?.warming ? 'Warming in background' : 'Not cached yet';

  return (
    <section className="settings-card reliability-panel">
      <div className="section-header">
        <h2>Playback Diagnostics</h2>
        <div className="section-header-actions">
          <button className="section-action-btn" onClick={refreshProbe} type="button">
            <RefreshCw size={14} /> Refresh
          </button>
          <button className="section-action-btn" onClick={clearReliabilityEvents} type="button">
            <Trash2 size={14} /> Clear Log
          </button>
        </div>
      </div>

      <div className="diagnostic-grid">
        <div className="diagnostic-tile">
          <Activity size={16} className="settings-feature-icon" />
          <strong>Playback</strong>
          <span>{playbackStateLabel}</span>
          <small>{playbackError || 'No active playback error.'}</small>
        </div>
        <div className="diagnostic-tile">
          <Database size={16} className="settings-feature-icon" />
          <strong>Stream path</strong>
          <span>{currentTrack?.streamSource || currentTrack?.source || 'unknown'}</span>
          <small>{urlKind}</small>
        </div>
        <div className="diagnostic-tile">
          <ShieldCheck size={16} className="settings-feature-icon" />
          <strong>Cache state</strong>
          <span>{currentTrack?.cacheState || (currentTrack?.source === 'downloaded' ? 'offline' : 'unknown')}</span>
          <small>{backendCacheLabel}</small>
        </div>
      </div>

      <div className="settings-row">
        <div className="settings-row-copy">
          <strong className="settings-row-title">Current track</strong>
          <span className="settings-row-text">
            {currentTrack ? `${currentTrack.title} • ${currentTrack.artist || 'Unknown'}` : 'Start a track to inspect live playback diagnostics.'}
          </span>
        </div>
        <span className={`track-status-pill ${isOffline ? 'track-status-pill--downloaded' : ''}`}>
          {platformLabel}
        </span>
      </div>

      <div className="diagnostic-meta-grid">
        <div className="diagnostic-meta-card">
          <span className="downloads-stat-label">Backend cache probe</span>
          <strong>{cacheProbe.loading ? 'Checking…' : backendCacheLabel}</strong>
          <small>{cacheProbe.error || `Last checked ${formatTime(cacheProbe.checkedAt)}`}</small>
        </div>
        <div className="diagnostic-meta-card">
          <span className="downloads-stat-label">Last resolve</span>
          <strong>{reliabilityDebug.lastResolved?.streamSource || 'None yet'}</strong>
          <small>{reliabilityDebug.lastResolved ? `${reliabilityDebug.lastResolved.reason} • ${formatTime(reliabilityDebug.lastResolved.at)}` : 'No resolve event recorded yet.'}</small>
        </div>
        <div className="diagnostic-meta-card">
          <span className="downloads-stat-label">Last fallback</span>
          <strong>{reliabilityDebug.lastFallback?.streamSource || 'None'}</strong>
          <small>{reliabilityDebug.lastFallback?.message || 'No fallback was needed recently.'}</small>
        </div>
      </div>

      <div className="reliability-log">
        <div className="reliability-log-header">
          <strong>Recent events</strong>
          <span>{reliabilityDebug.events?.length || 0} entries</span>
        </div>
        {reliabilityDebug.events?.length ? (
          <div className="reliability-log-list">
            {reliabilityDebug.events.map((event) => (
              <div key={event.id} className="reliability-log-item">
                <div className="reliability-log-top">
                  <span className="reliability-log-kind">{event.kind}</span>
                  <span className="reliability-log-time">{formatTime(event.at)}</span>
                </div>
                <div className="reliability-log-message">
                  {event.message || `${event.title || 'Track'} via ${event.streamSource || event.reason || 'unknown'}`}
                </div>
                <div className="reliability-log-meta">
                  {event.title || 'Unknown'}
                  {event.streamSource ? ` • ${event.streamSource}` : ''}
                  {event.cacheState ? ` • ${event.cacheState}` : ''}
                  {event.reason ? ` • ${event.reason}` : ''}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">Play, skip, replay, and background the app to build a diagnostics history here.</div>
        )}
      </div>
    </section>
  );
}
