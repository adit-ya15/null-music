# Null

Open-source, Android-first music player focused on speed, resilient playback, and offline continuity.

## Highlights

- Fast search and metadata-rich discovery
- Fallback-aware playback pipeline for reliability
- Queue controls, smart dedupe, and queue optimization
- Offline downloads and resume state handling
- Lyrics, equalizer hooks, and Android media controls
- Account sync for favorites, playlists, and recent listening

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
