import React from 'react';
import ReactDOM from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import App from './App.jsx';
import { PlayerProvider } from './context/PlayerContext.jsx';
import './index.css';

// Default to dark (Apple Music style). Persist user preference.
const savedTheme = localStorage.getItem('aura-theme') || 'dark';
document.documentElement.dataset.theme = savedTheme;

// Global error handlers — show crash info on screen so we can debug black-screen issues
window.onerror = (msg, src, line, col, err) => {
  const el = document.getElementById('root');
  if (el) el.innerHTML = `<pre style="color:red;padding:24px;white-space:pre-wrap;font-size:13px;">CRASH: ${msg}\n${src}:${line}:${col}\n${err?.stack || ''}</pre>`;
};
window.addEventListener('unhandledrejection', (e) => {
  const msg = String(e.reason?.message || e.reason || '');
  // Don't blank the page for expected Capacitor plugin-not-on-web errors
  if (msg.includes('not implemented on web')) return;
  const el = document.getElementById('root');
  if (el) el.innerHTML = `<pre style="color:orange;padding:24px;white-space:pre-wrap;font-size:13px;">Unhandled rejection:\n${e.reason?.stack || e.reason}</pre>`;
});

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return React.createElement('pre', { style: { color: 'red', padding: 24, whiteSpace: 'pre-wrap', fontSize: 13 } },
        `React Error:\n${this.state.error.message}\n\n${this.state.error.stack}`);
    }
    return this.props.children;
  }
}

if (Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then((regs) => Promise.all(regs.map((reg) => reg.unregister())))
    .catch(() => {});

  if ('caches' in window) {
    caches.keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .catch(() => {});
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <PlayerProvider>
        <App />
      </PlayerProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
