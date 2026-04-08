# Null

Open-source, Android-first music player focused on speed, resilient playback, and offline continuity.

## Highlights

- Fast search and metadata-rich discovery
- Fallback-aware playback pipeline for reliability
- Queue controls, smart dedupe, and queue optimization
- Offline downloads and resume state handling
- Lyrics, equalizer hooks, and Android media controls
- Account sync for favorites, playlists, and recent listening

## Features

### Core Playback

- Search, stream, and play music from multiple sources
- Queue management with next, previous, shuffle, and insert-next controls
- Playback resume state so users can continue where they left off
- Offline download support for saved tracks
- Reliability fallbacks when a source is unavailable

### Library and Discovery

- Favorites, playlists, recently played, and most-played views
- Personalized sections such as Made For You and trending mixes
- Search filters for songs, artists, albums, and playlists
- Download management and local library organization
- Radio-style station playback for quick discovery

### Listening Experience

- Lyrics view and equalizer integration hooks
- Android media controls and native playback support
- Playback profiles for data saver, balanced, and instant modes
- Auto-radio and queue optimization helpers
- Theme switching and mobile-first layout handling

### Account and Sync

- Sign up, login, and session persistence
- Favorites and playlist syncing across devices
- Listening history and library state persistence
- Feedback and issue reporting flows

### Music DNA

- Personalized Music DNA profile based on listening history
- Animated DNA helix visualization
- Genre, mood, tempo, acousticness, and decade analysis
- Sonic Twins recommendations for similar artists
- Shareable DNA card for social posting and discovery

### Platform and Reliability

- Android-first Capacitor shell with web fallback
- Backend fallback routes and metadata proxying
- Download and cache-aware architecture
- Rate limiting, auth, and request timeout protections

## Screenshots

| Home | Search | Queue |
| --- | --- | --- |
| ![Home](./screenshots/Screenshot_2026-04-06-01-02-22-34_917bf2ce991166cdda6fa7069f598386.jpg) | ![Search](./screenshots/Screenshot_2026-04-06-01-02-49-80_917bf2ce991166cdda6fa7069f598386.jpg) | ![Queue](./screenshots/Screenshot_2026-04-06-01-04-13-03_917bf2ce991166cdda6fa7069f598386.jpg) |

| Library | Playback | Features |
| --- | --- | --- |
| ![Library](./screenshots/Screenshot_2026-04-06-01-03-10-01_917bf2ce991166cdda6fa7069f598386.jpg) | ![Playback](./screenshots/Screenshot_2026-04-06-01-03-53-55_917bf2ce991166cdda6fa7069f598386.jpg) | ![Features](./screenshots/Screenshot_2026-04-06-01-04-35-28_917bf2ce991166cdda6fa7069f598386.jpg) |

## Tech Stack

- Frontend: React + Vite
- Android shell: Capacitor
- Backend API: Node.js + Express
- Android native playback modules in android/

## Repository Layout

- src/: React app and player state management
- android/: Capacitor Android shell and native integration
- backend/: provider, resolver, cache, auth, and utility modules
- server.mjs: API server entry point
- shared/: shared helpers used by multiple modules
- tests/: unit and integration tests

## Local Development

### Prerequisites

- Node.js 22+
- npm 10+
- Java 21 (for Android builds)
- Android SDK (for device builds)

### Install and Run

```powershell
npm install
npm run server
npm run dev
```

### Verify

```powershell
npm run lint
npm test
npm run build
```

## Android Build

### Debug APK

```powershell
npm run build
npx cap sync android
cd android
.\gradlew.bat assembleDebug
```

Output:

- android/app/build/outputs/apk/debug/app-debug.apk

### Release Build

Read full guide first:

- [RELEASE_AND_UPDATE_GUIDE.md](./RELEASE_AND_UPDATE_GUIDE.md)

## Release and Update Docs

- [RELEASE_AND_UPDATE_GUIDE.md](./RELEASE_AND_UPDATE_GUIDE.md)
- [OPEN_SOURCE_RELEASE_CHECKLIST.md](./OPEN_SOURCE_RELEASE_CHECKLIST.md)
- [CHANGELOG.md](./CHANGELOG.md)

## Architecture and Security

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [SECURITY.md](./SECURITY.md)
- [PRIVACY.md](./PRIVACY.md)

## Open Source Project Docs

- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
- [ROADMAP.md](./ROADMAP.md)

## Public Showcase Website

- Source files: [public/showcase/index.html](./public/showcase/index.html)
- Local URL: http://localhost:5173/showcase/index.html

## Environment

Use:

- .env.example for local setup
- .env.production.example for production defaults

Keep secrets out of git. Never commit:

- .env values
- cookies files
- android keystore credentials
- android/keystore.properties

## License

MIT. See [LICENSE](./LICENSE).
