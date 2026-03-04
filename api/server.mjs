// ═══════════════════════════════════════════════════════════
// YouTube Music Backend — powered by youtubei.js
// Runs as a local Express server, Vite proxies /api/yt to it
// ═══════════════════════════════════════════════════════════

import express from 'express';
import { Innertube, Platform } from 'youtubei.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { createProxyMiddleware } from 'http-proxy-middleware';

const PORT = process.env.PORT || 3001;
const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── JS evaluator for URL deciphering ──
Platform.shim.eval = async (data, env) => {
    const properties = [];
    if (env.n) properties.push(`n: exportedVars.nFunction("${env.n}")`);
    if (env.sig) properties.push(`sig: exportedVars.sigFunction("${env.sig}")`);
    const code = `${data.output}\nreturn { ${properties.join(', ')} }`;
    return new Function(code)();
};

let yt = null;

async function getYT() {
    if (!yt) {
        console.log('[YT Server] Creating Innertube session...');
        yt = await Innertube.create({
            lang: 'en',
            location: 'IN',
            retrieve_player: true,
            generate_session_locally: true
        });
        console.log('[YT Server] Session ready');
    }
    return yt;
}

// ── CORS for local dev & requests ──
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// ── Saavn Proxy (Production) ──
app.use('/api/saavn', createProxyMiddleware({
    target: 'https://saavn.sumit.co',
    changeOrigin: true,
    pathRewrite: { '^/api/saavn': '/api' },
}));

// ── Search songs ──
app.get('/api/yt/search', async (req, res) => {
    const { query, limit = 20 } = req.query;
    if (!query) return res.json({ results: [] });

    try {
        const innertube = await getYT();
        const searchResults = await innertube.music.search(query, { type: 'song' });
        const songs = searchResults.songs?.contents || [];

        const results = songs.slice(0, parseInt(limit)).map(song => ({
            id: song.id,
            title: song.title || 'Unknown',
            artists: song.artists?.map(a => ({ name: a.name, id: a.channel_id })) || [],
            artist: song.artists?.map(a => a.name).join(', ') || 'Unknown',
            album: song.album?.name || 'YouTube Music',
            duration: parseDuration(song.duration?.text),
            durationText: song.duration?.text || '',
            thumbnail: song.thumbnails?.[0]?.url || '',
            thumbnails: song.thumbnails || []
        }));

        res.json({ results });
    } catch (err) {
        console.error('[YT Server] Search error:', err.message);
        res.status(500).json({ error: err.message, results: [] });
    }
});

// ── Get stream URL for a video ID ──
app.get('/api/yt/stream/:videoId', async (req, res) => {
    const { videoId } = req.params;
    if (!videoId) return res.status(400).json({ error: 'videoId required' });

    try {
        const innertube = await getYT();
        const info = await innertube.music.getInfo(videoId);

        const allFormats = info.streaming_data?.adaptive_formats || [];
        const audioFormats = allFormats.filter(f => f.mime_type?.startsWith('audio/'));

        // Prefer mp4a (AAC) for audio element compatibility, then opus
        const best = audioFormats.find(f => f.mime_type?.includes('mp4a'))
            || audioFormats.find(f => f.mime_type?.includes('opus'))
            || audioFormats[0];

        if (!best) {
            return res.json({
                videoId,
                title: info.basic_info?.title,
                streamUrl: null,
                error: 'No audio formats available'
            });
        }

        // Decipher the URL
        let streamUrl = best.url;
        if (!streamUrl && best.decipher) {
            streamUrl = await best.decipher(innertube.session?.player);
        }

        res.json({
            videoId,
            title: info.basic_info?.title || 'Unknown',
            author: info.basic_info?.author || 'Unknown',
            duration: info.basic_info?.duration || 0,
            thumbnail: info.basic_info?.thumbnail?.[0]?.url || '',
            streamUrl: streamUrl ? String(streamUrl) : null,
            mimeType: best.mime_type,
            bitrate: best.bitrate
        });
    } catch (err) {
        console.error('[YT Server] Stream error:', err.message);
        res.status(500).json({ error: err.message, streamUrl: null });
    }
});

// ── Search suggestions ──
app.get('/api/yt/suggestions', async (req, res) => {
    const { query } = req.query;
    if (!query) return res.json({ suggestions: [] });

    try {
        const innertube = await getYT();
        const raw = await innertube.music.getSearchSuggestions(query);

        const suggestions = [];
        for (const section of (raw || [])) {
            const contents = section.contents || [];
            for (const item of contents) {
                if (item.type === 'SearchSuggestion') {
                    suggestions.push({
                        type: 'query',
                        text: item.suggestion?.text || ''
                    });
                } else if (item.type === 'MusicResponsiveListItem') {
                    suggestions.push({
                        type: item.item_type || 'unknown',
                        id: item.id,
                        title: item.title || item.name || '',
                        artist: item.artists?.map(a => a.name).join(', ') || item.author?.name || '',
                        thumbnail: item.thumbnail?.contents?.[0]?.url || ''
                    });
                }
            }
        }

        res.json({ suggestions: suggestions.slice(0, 10) });
    } catch (err) {
        console.error('[YT Server] Suggestions error:', err.message);
        res.json({ suggestions: [] });
    }
});

// ── Proxy audio stream (to bypass CORS on googlevideo.com) ──
app.get('/api/yt/proxy-stream', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).send('URL required');

    try {
        const response = await fetch(url, {
            headers: {
                'Range': req.headers.range || 'bytes=0-',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        // Forward status and relevant headers
        res.status(response.status);
        const ct = response.headers.get('content-type');
        if (ct) res.setHeader('Content-Type', ct);
        const cl = response.headers.get('content-length');
        if (cl) res.setHeader('Content-Length', cl);
        const cr = response.headers.get('content-range');
        if (cr) res.setHeader('Content-Range', cr);
        res.setHeader('Accept-Ranges', 'bytes');

        // Pipe the stream
        const reader = response.body.getReader();
        const pump = async () => {
            while (true) {
                const { done, value } = await reader.read();
                if (done) { res.end(); return; }
                if (!res.write(value)) {
                    await new Promise(resolve => res.once('drain', resolve));
                }
            }
        };
        pump().catch(() => res.end());
    } catch (err) {
        console.error('[YT Server] Proxy error:', err.message);
        res.status(500).send('Proxy error');
    }
});

// ── Health check ──
app.get('/api/yt/health', (_req, res) => {
    res.json({ status: 'ok', hasSession: !!yt });
});

// ── Duration parser: "3:22" → 202 ──
function parseDuration(text) {
    if (!text) return 0;
    const parts = text.split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] || 0;
}

// ── Serve Static Assets (Production) ──
app.use(express.static(path.join(__dirname, 'dist')));

app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// ── Start server ──
app.listen(PORT, () => {
    console.log(`[Aura Server] Running on http://localhost:${PORT}`);
    // Pre-warm the session
    getYT().catch(err => console.error('[YT Server] Session init error:', err.message));
});
