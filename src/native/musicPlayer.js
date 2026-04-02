import { Capacitor, registerPlugin } from '@capacitor/core';

const nativeMusicPlayer = registerPlugin('MusicPlayer');

function createWebMusicPlayer() {
  const listeners = new Map();
  let listenerSeq = 0;
  let audio = null;
  let statusTimer = null;
  let currentTrack = null;

  const ensureAudio = () => {
    if (audio) return audio;

    audio = new Audio();
    audio.preload = 'auto';
    audio.crossOrigin = 'anonymous';

    audio.addEventListener('timeupdate', emitStatusUpdate);
    audio.addEventListener('loadedmetadata', emitStatusUpdate);
    audio.addEventListener('durationchange', emitStatusUpdate);
    audio.addEventListener('ended', () => {
      emit('statusUpdate', {
        position: Number.isFinite(audio?.duration) ? audio.duration : 0,
        duration: Number.isFinite(audio?.duration) ? audio.duration : 0,
      });
      stopStatusTimer();
      emit('nextTrack', {});
    });
    audio.addEventListener('error', () => {
      stopStatusTimer();
      const mediaError = audio?.error;
      const message =
        mediaError?.message ||
        (typeof mediaError?.code === 'number'
          ? `Playback failed (HTMLMediaError ${mediaError.code})`
          : 'Playback failed');
      emit('playbackError', { message });
    });
    audio.addEventListener('play', startStatusTimer);
    audio.addEventListener('pause', () => {
      emitStatusUpdate();
      stopStatusTimer();
    });

    return audio;
  };

  const emit = (eventName, payload) => {
    const eventListeners = listeners.get(eventName);
    if (!eventListeners || eventListeners.size === 0) return;
    eventListeners.forEach((listener) => {
      try {
        listener(payload);
      } catch {
        // Ignore listener errors so playback keeps running.
      }
    });
  };

  function emitStatusUpdate() {
    if (!audio) return;
    emit('statusUpdate', {
      position: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
      duration: Number.isFinite(audio.duration) ? audio.duration : 0,
    });
  }

  function stopStatusTimer() {
    if (statusTimer) {
      window.clearInterval(statusTimer);
      statusTimer = null;
    }
  }

  function startStatusTimer() {
    stopStatusTimer();
    emitStatusUpdate();
    statusTimer = window.setInterval(emitStatusUpdate, 1000);
  }

  return {
    async play({ url, title = 'Aura Music', artist = 'Unknown Artist', artwork = '' } = {}) {
      if (!url) {
        throw new Error('Track URL is required');
      }

      const player = ensureAudio();
      currentTrack = { url, title, artist, artwork };

      if (player.src !== url) {
        player.src = url;
      }

      player.currentTime = 0;
      await player.play();
      emitStatusUpdate();
      return { playing: true };
    },

    async pause() {
      if (!audio) return { playing: false };
      audio.pause();
      return { playing: false };
    },

    async resume() {
      const player = ensureAudio();
      if (!player.src && currentTrack?.url) {
        player.src = currentTrack.url;
      }
      await player.play();
      emitStatusUpdate();
      return { playing: true };
    },

    async seek({ position = 0 } = {}) {
      const player = ensureAudio();
      player.currentTime = Math.max(0, Number(position) || 0);
      emitStatusUpdate();
      return { position: player.currentTime };
    },

    async setQueue() {
      return { ok: true };
    },

    async getEqualizerState() {
      return {
        available: false,
        enabled: false,
        currentPreset: 0,
        presets: [],
        message: 'Equalizer is available in the Android app.',
      };
    },

    async setEqualizerEnabled() {
      return this.getEqualizerState();
    },

    async setEqualizerPreset() {
      return this.getEqualizerState();
    },

    async getDownloadedTracks() {
      return { tracks: [], summary: { count: 0, totalBytes: 0 } };
    },

    async downloadTrack() {
      return { track: null };
    },

    async cancelDownload({ id } = {}) {
      return { id };
    },

    async deleteDownloadedTrack() {
      return { deleted: false, summary: { count: 0, totalBytes: 0 } };
    },

    async addListener(eventName, listener) {
      const eventListeners = listeners.get(eventName) || new Map();
      const id = ++listenerSeq;
      eventListeners.set(id, listener);
      listeners.set(eventName, eventListeners);

      return {
        remove: async () => {
          const active = listeners.get(eventName);
          if (!active) return;
          active.delete(id);
          if (active.size === 0) {
            listeners.delete(eventName);
          }
        },
      };
    },
  };
}

export const MusicPlayer = Capacitor.isNativePlatform()
  ? nativeMusicPlayer
  : createWebMusicPlayer();
