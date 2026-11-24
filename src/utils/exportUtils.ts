import JSZip from 'jszip';
import { RefImage } from '../types';

export function getProxiedUrl(url: string, pageUrl?: string): string {
  if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('/api/')) {
    return url;
  }
  const refPart = pageUrl && /^https?:\/\//i.test(pageUrl) ? `&ref=${encodeURIComponent(pageUrl)}` : '';
  return `/api/proxy?url=${encodeURIComponent(url)}${refPart}`;
}

export function getImageFallbackChain(img: RefImage): string[] {
  const candidates = [
    getProxiedUrl(img.url, img.pageUrl),
    img.url,
    ...(img.thumbnail && img.thumbnail !== img.url
      ? [getProxiedUrl(img.thumbnail, img.pageUrl), img.thumbnail]
      : []),
  ];
  return Array.from(new Set(candidates));
}

function triggerDownload(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
}

export async function downloadSingleImage(image: RefImage, index: number) {
  const res = await fetch(getProxiedUrl(image.url));
  if (!res.ok) throw new Error('Failed to fetch image for download');
  const blob = await res.blob();
  const ext = blob.type.split('/')[1]?.split(';')[0] || 'jpg';
  const safeTitle = image.title.replace(/[^a-z0-9_-]+/gi, '_').slice(0, 40) || 'reference';
  triggerDownload(blob, `${String(index + 1).padStart(2, '0')}_${safeTitle}.${ext}`);
}

export async function downloadCanvasComposite(
  stageElement: HTMLElement | null,
  drawCanvas: HTMLCanvasElement | null,
  image: RefImage,
  index: number,
  options: {
    bwMode: boolean;
    contrast: number;
    imageOpacity: number;
    drawOpacity: number;
  }
) {
  // Render a clean composite of the reference image (via proxy) + drawover canvas
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = getProxiedUrl(image.url);

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Could not load image for composite export'));
  });

  const width = stageElement?.clientWidth || img.naturalWidth || 1280;
  const height = stageElement?.clientHeight || img.naturalHeight || 720;

  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d');
  if (!ctx) return;

  ctx.fillStyle = '#111215';
  ctx.fillRect(0, 0, width, height);

  // Fit image inside stage preserving aspect ratio
  const scale = Math.min(width / img.naturalWidth, height / img.naturalHeight);
  const drawW = img.naturalWidth * scale;
  const drawH = img.naturalHeight * scale;
  const dx = (width - drawW) / 2;
  const dy = (height - drawH) / 2;

  ctx.save();
  ctx.globalAlpha = options.imageOpacity;
  if (options.bwMode) {
    ctx.filter = `grayscale(100%) contrast(${options.contrast}%)`;
  } else if (options.contrast !== 100) {
    ctx.filter = `contrast(${options.contrast}%)`;
  }
  ctx.drawImage(img, dx, dy, drawW, drawH);
  ctx.restore();

  if (drawCanvas) {
    ctx.save();
    ctx.globalAlpha = options.drawOpacity;
    ctx.drawImage(drawCanvas, 0, 0, width, height);
    ctx.restore();
  }

  const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/png'));
  if (blob) {
    const safeTitle = image.title.replace(/[^a-z0-9_-]+/gi, '_').slice(0, 40) || 'study';
    triggerDownload(blob, `study_${String(index + 1).padStart(2, '0')}_${safeTitle}.png`);
  }
}

export async function downloadAllAsZip(
  images: RefImage[],
  onProgress?: (done: number, total: number) => void
) {
  const zip = new JSZip();
  let completed = 0;

  await Promise.all(
    images.map(async (image, idx) => {
      try {
        const res = await fetch(getProxiedUrl(image.url));
        if (!res.ok) return;
        const blob = await res.blob();
        const ext = blob.type.split('/')[1]?.split(';')[0] || 'jpg';
        const safeTitle = image.title.replace(/[^a-z0-9_-]+/gi, '_').slice(0, 36) || 'ref';
        zip.file(`${String(idx + 1).padStart(2, '0')}_${safeTitle}.${ext}`, blob);
      } catch {
        // Skip unreachable upstream images gracefully
      } finally {
        completed += 1;
        onProgress?.(completed, images.length);
      }
    })
  );

  const content = await zip.generateAsync({ type: 'blob' });
  triggerDownload(content, `refstudio_session_${images.length}_images.zip`);
}
