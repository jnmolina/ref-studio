import { RefImage } from '../types';
import { isStaticHost } from './clientSearch';

export interface VideoExtractOptions {
  fps?: number;
  maxFrames?: number;
  onProgress?: (done: number, total: number) => void;
}

export async function resolveVideoSource(rawUrl: string): Promise<{
  proxiedUrl: string;
  pageUrl: string;
  title: string;
}> {
  if (isStaticHost()) {
    return {
      proxiedUrl: rawUrl,
      pageUrl: rawUrl,
      title: rawUrl.split('/').filter(Boolean).pop() || 'Video Study',
    };
  }
  const res = await fetch(`/api/video-resolve?url=${encodeURIComponent(rawUrl)}`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Could not resolve video URL.');
  }
  const proxiedUrl = `/api/video-proxy?url=${encodeURIComponent(data.videoUrl)}&ref=${encodeURIComponent(
    data.pageUrl || data.videoUrl
  )}`;
  let title = 'Video Study';
  try {
    const pathname = new URL(data.videoUrl).pathname;
    const base = pathname.split('/').filter(Boolean).pop();
    if (base) title = base;
  } catch {
    // ignore
  }
  return { proxiedUrl, pageUrl: data.pageUrl || rawUrl, title };
}

/**
 * Extracts frames from a video source (proxied URL or local objectURL) in memory.
 */
export async function extractVideoFrames(
  videoSrc: string,
  title: string,
  pageUrl?: string,
  options: VideoExtractOptions = {}
): Promise<RefImage[]> {
  const fps = options.fps ?? 8;
  const maxFrames = options.maxFrames ?? 60;

  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = videoSrc;

  await new Promise<void>((resolve, reject) => {
    const onLoaded = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error('Browser could not decode this video format or stream.'));
    };
    const cleanup = () => {
      video.removeEventListener('loadedmetadata', onLoaded);
      video.removeEventListener('error', onErr);
    };
    video.addEventListener('loadedmetadata', onLoaded);
    video.addEventListener('error', onErr);
  });

  let duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
  if (!Number.isFinite(video.duration) || duration === 0) {
    // Chromium MediaRecorder WebM blobs often report Infinity duration until seeked
    await new Promise<void>((resolve) => {
      const onDur = () => {
        if (Number.isFinite(video.duration) && video.duration > 0) {
          video.removeEventListener('durationchange', onDur);
          video.removeEventListener('timeupdate', onDur);
          resolve();
        }
      };
      video.addEventListener('durationchange', onDur);
      video.addEventListener('timeupdate', onDur);
      video.currentTime = 1e101;
      setTimeout(resolve, 1500);
    });
    video.currentTime = 0;
    duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
  }

  if (duration === 0 || video.videoWidth === 0 || video.videoHeight === 0) {
    throw new Error('Video has invalid duration or dimensions.');
  }

  // Compute sample timestamps (evenly spread across duration if total exceeds maxFrames)
  const rawCount = Math.max(1, Math.floor(duration * fps));
  const totalFrames = Math.min(maxFrames, rawCount);
  const step = totalFrames > 1 ? duration / totalFrames : 0;

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  const frames: RefImage[] = [];
  const batchId = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  for (let i = 0; i < totalFrames; i++) {
    const t = Math.min(duration - 0.02, i * step);
    await new Promise<void>((resolve, reject) => {
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked);
        video.removeEventListener('error', onErr);
        resolve();
      };
      const onErr = () => {
        video.removeEventListener('seeked', onSeeked);
        video.removeEventListener('error', onErr);
        reject(new Error('Failed seeking video frame'));
      };
      video.addEventListener('seeked', onSeeked);
      video.addEventListener('error', onErr);
      video.currentTime = Math.max(0, t);
    });

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.92)
    );

    if (blob) {
      const blobUrl = URL.createObjectURL(blob);
      frames.push({
        id: `vid-${batchId}-f${i + 1}`,
        url: blobUrl,
        pageUrl,
        thumbnail: blobUrl,
        title: `${title} — ${t.toFixed(2)}s (F${i + 1}/${totalFrames})`,
        width: canvas.width,
        height: canvas.height,
        source: 'video-frame',
        addedAt: Date.now(),
      });
    }

    options.onProgress?.(i + 1, totalFrames);
  }

  return frames;
}

export interface ScreenRecorderHandle {
  stop: () => void;
  promise: Promise<Blob>;
}

/**
 * Records a browser tab or window at full native framerate via MediaRecorder
 * (does not throttle when RefStudio is in a background tab).
 */
export async function startScreenCapture(): Promise<ScreenRecorderHandle> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error('Screen/tab capture is not supported in this browser.');
  }

  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: { ideal: 30, max: 30 } },
    audio: false,
  });

  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm';

  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 6_000_000,
  });
  const chunks: BlobPart[] = [];

  const promise = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    recorder.onerror = () => {
      stream.getTracks().forEach((t) => t.stop());
      reject(new Error('Screen recording failed.'));
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      resolve(new Blob(chunks, { type: mimeType }));
    };
  });

  const [videoTrack] = stream.getVideoTracks();
  if (videoTrack) {
    videoTrack.onended = () => {
      if (recorder.state !== 'inactive') recorder.stop();
    };
  }

  recorder.start(250);

  return {
    stop: () => {
      if (recorder.state !== 'inactive') recorder.stop();
    },
    promise,
  };
}
