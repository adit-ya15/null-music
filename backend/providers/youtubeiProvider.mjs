import { logger } from '../lib/logger.mjs';

function scoreAudioFormat(fmt) {
  // Prefer audio-only formats with higher bitrate.
  const isAudioOnly = !fmt.has_video;
  const bitrate = Number(fmt.bitrate || fmt.average_bitrate || 0);
  const mime = (fmt.mime_type || '').toString();
  const isOpus = mime.includes('opus');
  return (isAudioOnly ? 1_000_000 : 0) + (isOpus ? 10_000 : 0) + bitrate;
}

export async function youtubeiGetAudioUrl(innertube, videoId) {
  let info = null;
  try {
    info = await innertube.music.getInfo(videoId);
  } catch {
    // ignore, fall back below
  }

  // Some videos return incomplete streaming data via the Music endpoint.
  // Fallback to the regular getInfo() which often includes streaming data.
  if (!info?.streaming_data?.adaptive_formats?.length) {
    try {
      info = await innertube.getInfo(videoId);
    } catch {
      // ignore
    }
  }

  const formats = info?.streaming_data?.adaptive_formats || [];
  const audio = formats
    .filter((f) => f?.has_audio)
    .sort((a, b) => scoreAudioFormat(b) - scoreAudioFormat(a));

  const url = audio?.[0]?.url;
  if (!url) {
    logger.warn('provider.youtubei', 'No audio URL in streaming_data', { videoId });
    return null;
  }

  return url;
}
