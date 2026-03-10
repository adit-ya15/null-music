// ═══════════════════════════════════════════════════════
// Aura Music Server
// YouTube Music backend using youtubei.js + yt-dlp
// ═══════════════════════════════════════════════════════

import express from "express";
import { Innertube } from "youtubei.js";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import { fileURLToPath } from "url";
import { createProxyMiddleware } from "http-proxy-middleware";

const execFileAsync = promisify(execFile);

const PORT = process.env.PORT || 3001;
const app = express();

const YT_DLP_BIN = process.env.YT_DLP_BIN || "yt-dlp";
const YT_COOKIES_FILE = process.env.YT_COOKIES_FILE;
const YT_SOURCE_ADDRESS = process.env.YT_SOURCE_ADDRESS;
const YT_EXTRACTOR_ARGS =
    process.env.YT_EXTRACTOR_ARGS || "youtube:player-client=default,mweb";

// resolve dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// cache for stream urls
const streamCache = new Map();
const CACHE_TTL = 1000 * 60 * 30;

// ─────────────────────────────────────────────
// Note: youtubei.js handles URL deciphering natively on Node.js
// ─────────────────────────────────────────────

let yt = null;

async function getYT() {
    if (!yt) {
        console.log("Creating Innertube session...");

        yt = await Innertube.create({
            lang: "en",
            location: "IN",
            retrieve_player: true,
            generate_session_locally: true,
        });

        console.log("YouTube session ready");
    }

    return yt;
}

// ─────────────────────────────────────────────
// basic cors
// ─────────────────────────────────────────────

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, Accept"
    );
    next();
});

// ─────────────────────────────────────────────
// saavn proxy
// ─────────────────────────────────────────────

app.use(
    "/api/saavn",
    createProxyMiddleware({
        target: "https://saavn.sumit.co",
        changeOrigin: true,
        // Express strips the mount path (`/api/saavn`) before proxying,
        // so we must prepend `/api` for the upstream Saavn API.
        pathRewrite: (path) => `/api${path}`
    })
);

// ─────────────────────────────────────────────
// search songs
// ─────────────────────────────────────────────

app.get("/api/yt/search", async (req, res) => {
    const { query, limit = 20 } = req.query;

    if (!query) return res.json({ results: [] });

    try {
        const innertube = await getYT();

        const searchResults = await innertube.music.search(query, {
            type: "song",
        });

        const songs = searchResults.songs?.contents || [];

        const results = songs.slice(0, parseInt(limit)).map((song) => ({
            id: song.id,
            title: song.title || "Unknown",
            artist:
                song.artists?.map((a) => a.name).join(", ") || "Unknown",
            artists:
                song.artists?.map((a) => ({
                    name: a.name,
                    id: a.channel_id,
                })) || [],
            album: song.album?.name || "YouTube Music",
            duration: parseDuration(song.duration?.text),
            durationText: song.duration?.text || "",
            thumbnail: song.thumbnails?.[0]?.url || "",
            thumbnails: song.thumbnails || [],
        }));

        res.json({ results });
    } catch (err) {
        console.error("Search error:", err.message);
        res.status(500).json({ results: [] });
    }
});

// ─────────────────────────────────────────────
// stream endpoint with cache
// ─────────────────────────────────────────────

app.get("/api/yt/stream/:videoId", async (req, res) => {
    const { videoId } = req.params;

    if (!videoId) return res.status(400).json({ error: "videoId required" });

    const cached = streamCache.get(videoId);

    if (cached && cached.expiry > Date.now()) {
        return res.json(cached.data);
    }

    try {
        const innertube = await getYT();
        const info = await innertube.music.getInfo(videoId);

        const best = info.chooseFormat({ type: 'audio', quality: 'best' });

        if (!best) {
            return res.json({
                videoId,
                streamUrl: null,
            });
        }

        let streamUrl = best.url;

        if (!streamUrl && best.decipher) {
            streamUrl = await best.decipher(innertube.session?.player);
        }

        const responseData = {
            videoId,
            title: info.basic_info?.title,
            author: info.basic_info?.author,
            duration: info.basic_info?.duration,
            thumbnail: info.basic_info?.thumbnail?.[0]?.url,
            streamUrl: String(streamUrl),
            mimeType: best.mime_type,
            bitrate: best.bitrate,
        };

        streamCache.set(videoId, {
            data: responseData,
            expiry: Date.now() + CACHE_TTL,
        });

        res.json(responseData);
    } catch (err) {
        console.error("Stream error:", err.message);
        res.status(500).json({ streamUrl: null });
    }
});

// ─────────────────────────────────────────────
// suggestions
// ─────────────────────────────────────────────

app.get("/api/yt/suggestions", async (req, res) => {
    const { query } = req.query;

    if (!query) return res.json({ suggestions: [] });

    try {
        const innertube = await getYT();
        const raw = await innertube.music.getSearchSuggestions(query);

        const suggestions = [];

        for (const section of raw || []) {
            for (const item of section.contents || []) {
                if (item.type === "SearchSuggestion") {
                    suggestions.push({
                        type: "query",
                        text: item.suggestion?.text || "",
                    });
                }
            }
        }

        res.json({ suggestions: suggestions.slice(0, 10) });
    } catch {
        res.json({ suggestions: [] });
    }
});

// ─────────────────────────────────────────────
// trending songs
// ─────────────────────────────────────────────

app.get("/api/yt/trending", async (req, res) => {
    try {
        const innertube = await getYT();
        const home = await innertube.music.getHomeFeed();

        const songs = [];

        for (const section of home.sections || []) {
            for (const item of section.contents || []) {
                if (item.id && item.title) {
                    songs.push({
                        id: item.id,
                        title: item.title,
                        artist:
                            item.artists?.map((a) => a.name).join(", ") || "",
                        thumbnail: item.thumbnail?.[0]?.url,
                    });
                }
            }
        }

        res.json({ results: songs.slice(0, 20) });
    } catch {
        res.json({ results: [] });
    }
});

// ─────────────────────────────────────────────
// lyrics api
// ─────────────────────────────────────────────

app.get("/api/yt/lyrics", async (req, res) => {
    const { artist, title } = req.query;

    if (!artist || !title) return res.json({ lyrics: "" });

    try {
        const r = await fetch(
            `https://api.lyrics.ovh/v1/${artist}/${title}`
        );

        const data = await r.json();

        res.json(data);
    } catch {
        res.json({ lyrics: "" });
    }
});

// ─────────────────────────────────────────────
// yt-dlp — get stream URL (cached)
// ─────────────────────────────────────────────

async function getStreamUrl(videoId) {
    const cached = streamCache.get(videoId);
    if (cached && cached.expiry > Date.now()) return cached.url;

    const args = [
        "-f",
        "bestaudio",
        "--extractor-args",
        YT_EXTRACTOR_ARGS,
        "--get-url",
    ];

    if (YT_COOKIES_FILE) {
        args.push("--cookies", YT_COOKIES_FILE);
    }

    if (YT_SOURCE_ADDRESS) {
        args.push("--source-address", YT_SOURCE_ADDRESS);
    }

    args.push(`https://music.youtube.com/watch?v=${videoId}`);

    const { stdout } = await execFileAsync(YT_DLP_BIN, args, { timeout: 15000 });

    const url = stdout.trim();
    if (!url) throw new Error("yt-dlp returned no URL");

    streamCache.set(videoId, { url, expiry: Date.now() + CACHE_TTL });
    return url;
}

// ─────────────────────────────────────────────
// pipe stream — server-side piped audio via yt-dlp
// ─────────────────────────────────────────────

app.get("/api/yt/pipe/:videoId", async (req, res) => {
    const { videoId } = req.params;
    if (!videoId) return res.status(400).send("videoId required");

    try {
        const streamUrl = await getStreamUrl(videoId);

        // Forward range header from client for seeking
        const headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        };
        if (req.headers.range) {
            headers.Range = req.headers.range;
        }

        const upstream = await fetch(streamUrl, { headers });

        res.status(upstream.status);

        // Forward essential headers
        const fwd = ["content-type", "content-length", "content-range", "accept-ranges"];
        fwd.forEach((h) => {
            const v = upstream.headers.get(h);
            if (v) res.setHeader(h, v);
        });

        if (!upstream.headers.get("accept-ranges")) {
            res.setHeader("Accept-Ranges", "bytes");
        }

        // Pipe the body
        const reader = upstream.body.getReader();
        const pump = async () => {
            while (true) {
                const { done, value } = await reader.read();
                if (done) { res.end(); return; }
                if (!res.write(value)) {
                    await new Promise((r) => res.once("drain", r));
                }
            }
        };

        pump().catch((err) => {
            console.error("Pipe error:", err.message);
            if (!res.headersSent) res.status(500).send("Stream error");
            else res.end();
        });

        req.on("close", () => {
            reader.cancel().catch(() => { });
        });
    } catch (err) {
        console.error("Pipe error:", err.message);
        if (!res.headersSent) res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────
// up-next / radio recommendations
// ─────────────────────────────────────────────

app.get("/api/yt/up-next/:videoId", async (req, res) => {
    const { videoId } = req.params;
    if (!videoId) return res.status(400).json({ results: [] });

    try {
        const innertube = await getYT();
        const upNext = await innertube.music.getUpNext(videoId, true);
        const items = upNext?.contents || [];
        const results = [];

        for (const item of items) {
            try {
                const id = item.video_id || item.id;
                if (!id || id === videoId) continue;

                results.push({
                    id,
                    title: item.title?.text || item.title || "Unknown",
                    artist:
                        item.artists
                            ?.map((a) => a.name?.text || a.name || "")
                            .join(", ") ||
                        item.author?.text ||
                        item.author ||
                        "Unknown",
                    artists:
                        item.artists?.map((a) => ({
                            name: a.name?.text || a.name,
                            id: a.channel_id,
                        })) || [],
                    album:
                        item.album?.name?.text ||
                        item.album?.name ||
                        item.album?.text ||
                        "YouTube Music",
                    duration: parseDuration(
                        item.duration?.text || item.duration
                    ),
                    durationText:
                        item.duration?.text || item.duration || "",
                    thumbnail: item.thumbnails?.[0]?.url || "",
                    thumbnails: item.thumbnails || [],
                });
            } catch {
                // skip malformed items
            }
        }

        res.json({ results: results.slice(0, 25) });
    } catch (err) {
        console.error("Up-next error:", err.message);
        res.json({ results: [] });
    }
});

// ─────────────────────────────────────────────
// health
// ─────────────────────────────────────────────

app.get("/api/yt/health", (req, res) => {
    res.json({
        status: "ok",
        cacheSize: streamCache.size,
        hasSession: !!yt,
    });
});

// ─────────────────────────────────────────────
// duration parser
// ─────────────────────────────────────────────

function parseDuration(text) {
    if (!text) return 0;

    const parts = text.split(":").map(Number);

    if (parts.length === 3)
        return parts[0] * 3600 + parts[1] * 60 + parts[2];

    if (parts.length === 2)
        return parts[0] * 60 + parts[1];

    return parts[0] || 0;
}

// ─────────────────────────────────────────────
// serve frontend

// ─────────────────────────────────────────────
// serve frontend
// ─────────────────────────────────────────────

app.use(express.static(path.join(__dirname, "dist")));

// SPA fallback (but ignore API routes)
app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(__dirname, "dist", "index.html"));
});

// ─────────────────────────────────────────────
// start server
// ─────────────────────────────────────────────

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Aura server running on port ${PORT}`);

    getYT().catch((err) =>
        console.error("Session init error:", err.message)
    );
});

