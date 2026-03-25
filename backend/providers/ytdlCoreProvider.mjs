import ytdl from '@distube/ytdl-core';
import { logger } from '../lib/logger.mjs';

function scoreAudioFormat(fmt) {
  // Prefer audio-only formats with higher bitrate.
  const mime = (fmt.mimeType || fmt.mime_type || '').toString();
  const bitrate = Number(fmt.bitrate || fmt.averageBitrate || fmt.average_bitrate || 0);
  const isAudioOnly = !fmt.hasVideo && !fmt.has_video && mime.startsWith('audio/');
  const isOpus = mime.includes('opus');
  return (isAudioOnly ? 1_000_000 : 0) + (isOpus ? 10_000 : 0) + bitrate;
}

export async function ytdlCoreGetAudioUrl(videoId) {
  if (!videoId) return null;

  try {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const info = await ytdl.getInfo(url);

    const formats = Array.isArray(info?.formats) ? info.formats : [];
    const audio = formats
      .filter((f) => {
        const mime = (f?.mimeType || '').toString();
        return mime.startsWith('audio/') || (!f?.hasVideo && f?.audioBitrate);
      })
      .sort((a, b) => scoreAudioFormat(b) - scoreAudioFormat(a));

    const best = audio[0];
    const audioUrl = best?.url;
    if (!audioUrl) {
      logger.warn('provider.ytdlcore', 'No audio format URL', { videoId });
      return null;
    }

    return audioUrl;
  } catch (err) {
    logger.warn('provider.ytdlcore', 'ytdl-core failed', { videoId, error: err?.message });
    return null;
  }
}
