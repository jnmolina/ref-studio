import { parseGIF, decompressFrames } from 'gifuct-js';
import { RefImage } from '../types';
import { getProxiedUrl } from './exportUtils';

export interface ExtractedGifResult {
  frames: RefImage[];
  totalFrames: number;
  width: number;
  height: number;
}

/**
 * Decodes an animated GIF in memory into individual frame RefImages (blob: URLs).
 * Properly handles frame bounding boxes and GIF disposal methods (0, 1, 2, 3).
 */
export async function extractGifFrames(
  gifImage: RefImage,
  onProgress?: (done: number, total: number) => void
): Promise<ExtractedGifResult> {
  const res = await fetch(getProxiedUrl(gifImage.url));
  if (!res.ok) {
    throw new Error(`Failed to fetch GIF (${res.status})`);
  }

  const buffer = await res.arrayBuffer();
  const parsed = parseGIF(buffer);
  const rawFrames = decompressFrames(parsed, true);

  if (!rawFrames || rawFrames.length === 0) {
    throw new Error('No frames found in this GIF.');
  }

  // Determine full canvas dimensions from frame bounds
  const fullWidth = Math.max(
    gifImage.width || 0,
    ...rawFrames.map((f) => f.dims.left + f.dims.width)
  );
  const fullHeight = Math.max(
    gifImage.height || 0,
    ...rawFrames.map((f) => f.dims.top + f.dims.height)
  );

  const compCanvas = document.createElement('canvas');
  compCanvas.width = fullWidth;
  compCanvas.height = fullHeight;
  const compCtx = compCanvas.getContext('2d', { willReadFrequently: true });
  if (!compCtx) throw new Error('Canvas 2D context unavailable');

  const patchCanvas = document.createElement('canvas');
  const patchCtx = patchCanvas.getContext('2d');
  if (!patchCtx) throw new Error('Patch canvas 2D context unavailable');

  const extracted: RefImage[] = [];
  let previousImageData: ImageData | null = null;

  for (let i = 0; i < rawFrames.length; i++) {
    const frame = rawFrames[i];
    const { width, height, left, top } = frame.dims;

    if (frame.disposalType === 3) {
      previousImageData = compCtx.getImageData(0, 0, fullWidth, fullHeight);
    }

    patchCanvas.width = width;
    patchCanvas.height = height;
    const imgData = patchCtx.createImageData(width, height);
    imgData.data.set(frame.patch);
    patchCtx.putImageData(imgData, 0, 0);

    compCtx.drawImage(patchCanvas, left, top);

    const blob = await new Promise<Blob | null>((resolve) =>
      compCanvas.toBlob(resolve, 'image/png')
    );

    if (blob) {
      const blobUrl = URL.createObjectURL(blob);
      extracted.push({
        id: `${gifImage.id}-f${i + 1}-${Math.random().toString(36).slice(2, 6)}`,
        url: blobUrl,
        pageUrl: gifImage.pageUrl || gifImage.url,
        thumbnail: blobUrl,
        title: `${gifImage.title} — Frame ${i + 1}/${rawFrames.length}`,
        width: fullWidth,
        height: fullHeight,
        source: 'gif-frame',
        addedAt: Date.now(),
      });
    }

    // Handle disposal for next frame
    if (frame.disposalType === 2) {
      compCtx.clearRect(left, top, width, height);
    } else if (frame.disposalType === 3 && previousImageData) {
      compCtx.putImageData(previousImageData, 0, 0);
      previousImageData = null;
    }

    onProgress?.(i + 1, rawFrames.length);
  }

  return {
    frames: extracted,
    totalFrames: extracted.length,
    width: fullWidth,
    height: fullHeight,
  };
}
