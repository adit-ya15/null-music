import axios from 'axios';

// Proxied through Vite dev server to bypass CORS
const SAAVN_API_BASE = '/api/saavn';

export const saavnApi = {
    // Search for songs
    searchSongs: async (query, limit = 10) => {
        try {
            const response = await axios.get(`${SAAVN_API_BASE}/search/songs`, {
                params: { query, limit },
                timeout: 10000
            });
            return response.data?.data?.results || [];
        } catch (error) {
            console.error("Saavn Search Error:", error);
            return [];
        }
    },

    // Get Top Charts / Trending
    getTrending: async () => {
        try {
            const response = await axios.get(`${SAAVN_API_BASE}/modules`, { timeout: 10000 });
            const data = response.data?.data;

            // Try charts first
            const charts = data?.charts || [];
            if (charts.length > 0) {
                const chartId = charts[0].id;
                const chartDetails = await axios.get(`${SAAVN_API_BASE}/playlists`, {
                    params: { id: chartId },
                    timeout: 10000
                });
                const songs = chartDetails.data?.data?.songs || [];
                if (songs.length > 0) return songs;
            }

            // Fallback: try trending playlists
            const trending = data?.trending || {};
            const trendingSongs = trending.songs || [];
            if (trendingSongs.length > 0) return trendingSongs;

            // Fallback: try albums
            const albums = data?.albums || [];
            if (albums.length > 0) {
                const albumDetails = await axios.get(`${SAAVN_API_BASE}/albums`, {
                    params: { id: albums[0].id },
                    timeout: 10000
                });
                return albumDetails.data?.data?.songs || [];
            }

            // Last fallback: search for popular music
            const fallback = await axios.get(`${SAAVN_API_BASE}/search/songs`, {
                params: { query: 'trending hits', limit: 20 },
                timeout: 10000
            });
            return fallback.data?.data?.results || [];
        } catch (error) {
            console.error("Saavn Trending Error:", error);
            try {
                const fallback = await axios.get(`${SAAVN_API_BASE}/search/songs`, {
                    params: { query: 'top hits 2025', limit: 20 },
                    timeout: 10000
                });
                return fallback.data?.data?.results || [];
            } catch {
                return [];
            }
        }
    },

    // Format a Saavn song to our app's standard track object
    formatTrack: (saavnSong) => {
        const downloadUrls = saavnSong.downloadUrl || [];
        const highestQuality = downloadUrls.slice(-1)[0]?.url || '';

        const images = saavnSong.image || [];
        const bestImage = images.find(img => img.quality === '500x500')?.url ||
            images.slice(-1)[0]?.url || '';

        return {
            id: saavnSong.id,
            title: saavnSong.name,
            artist: saavnSong.primaryArtists || saavnSong.singers || 'Unknown',
            album: saavnSong.album?.name || 'Unknown Album',
            coverArt: bestImage,
            streamUrl: highestQuality,
            duration: parseInt(saavnSong.duration, 10),
            source: 'saavn',
            hasLyrics: saavnSong.hasLyrics === 'true' || saavnSong.hasLyrics === true
        };
    },

    // Search suggestions (returns songs, albums, artists)
    getSearchSuggestions: async (query) => {
        try {
            const response = await axios.get(`${SAAVN_API_BASE}/search`, {
                params: { query },
                timeout: 5000
            });
            const data = response.data?.data || {};
            const suggestions = [];

            // Top query result
            const topResults = data.topQuery?.results || [];
            topResults.forEach(item => {
                suggestions.push({
                    id: item.id,
                    title: item.title,
                    type: item.type,
                    description: item.description || '',
                    image: item.image?.find(i => i.quality === '150x150')?.url
                        || item.image?.slice(-1)[0]?.url || ''
                });
            });

            // Song results
            const songs = data.songs?.results || [];
            songs.forEach(item => {
                suggestions.push({
                    id: item.id,
                    title: item.title,
                    type: 'song',
                    description: item.description || item.primaryArtists || '',
                    image: item.image?.find(i => i.quality === '150x150')?.url
                        || item.image?.slice(-1)[0]?.url || ''
                });
            });

            // Album results
            const albums = data.albums?.results || [];
            albums.slice(0, 2).forEach(item => {
                suggestions.push({
                    id: item.id,
                    title: item.title,
                    type: 'album',
                    description: item.description || item.artist || '',
                    image: item.image?.find(i => i.quality === '150x150')?.url
                        || item.image?.slice(-1)[0]?.url || ''
                });
            });

            return suggestions.slice(0, 8);
        } catch (error) {
            console.error("Saavn Suggestions Error:", error);
            return [];
        }
    },

    // Fetch Lyrics for a Saavn track
    getLyrics: async (trackId) => {
        try {
            const response = await axios.get(`${SAAVN_API_BASE}/songs/${trackId}/lyrics`, {
                timeout: 5000
            });
            return response.data?.data?.lyrics || null;
        } catch (error) {
            console.error("Saavn Lyrics Error:", error);
            return null;
        }
    }
};
