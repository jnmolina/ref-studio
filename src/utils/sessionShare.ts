import { DrawElement, GridSettings, OnionSkinSettings, RefImage } from '../types';

export interface ShareableSession {
  v: 1;
  query?: string;
  images: RefImage[];
  currentIndex: number;
  intervalSec: number;
  drawingsByFrame: Record<string, DrawElement[]>;
  bwMode: boolean;
  contrast: number;
  grid: GridSettings;
  onion: OnionSkinSettings;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function encodeSessionToHash(session: ShareableSession): Promise<string> {
  const json = JSON.stringify(session);
  const rawBytes = new TextEncoder().encode(json);

  if (typeof CompressionStream !== 'undefined') {
    const cs = new CompressionStream('gzip');
    const writer = cs.writable.getWriter();
    writer.write(rawBytes);
    writer.close();
    const compressed = new Uint8Array(await new Response(cs.readable).arrayBuffer());
    return `#s=gz.${toBase64Url(compressed)}`;
  }

  return `#s=raw.${toBase64Url(rawBytes)}`;
}

export async function decodeSessionFromHash(hash: string): Promise<ShareableSession | null> {
  if (!hash.startsWith('#s=')) return null;
  const payload = hash.slice(3);

  try {
    let jsonText = '';
    if (payload.startsWith('gz.') && typeof DecompressionStream !== 'undefined') {
      const bytes = fromBase64Url(payload.slice(3));
      const ds = new DecompressionStream('gzip');
      const writer = ds.writable.getWriter();
      writer.write(bytes);
      writer.close();
      const decompressed = await new Response(ds.readable).arrayBuffer();
      jsonText = new TextDecoder().decode(decompressed);
    } else if (payload.startsWith('raw.')) {
      const bytes = fromBase64Url(payload.slice(4));
      jsonText = new TextDecoder().decode(bytes);
    } else {
      return null;
    }

    const parsed = JSON.parse(jsonText);
    if (parsed && parsed.v === 1 && Array.isArray(parsed.images)) {
      return parsed as ShareableSession;
    }
  } catch {
    return null;
  }
  return null;
}

export function exportSessionFile(session: ShareableSession) {
  const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `study_session_${session.images.length}_frames.refstudio.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
