import { GifMode, RefImage } from '../types';

const VIDEO_URL_RE =
  /(ytimg\.com|youtube\.com|youtu\.be|vimeocdn\.com|vimeo\.com|tiktok\.com|tiktokcdn\.com|dailymotion\.com|dmcdn\.net|jtvnw\.net|twitch\.tv|\/vi\/[a-zA-Z0-9_-]+\/|hqdefault|mqdefault|sddefault|maxresdefault|video_thumb|videothumb|\/video\/|streamable\.com)/i;

const GIF_URL_RE = /\.gif(\?|#|$)/i;

export type InputKind = 'video' | 'pinterest' | 'image-url' | 'web-url' | 'search';

export function detectInputKind(raw: string): InputKind {
  const s = raw.trim();
  if (!s) return 'search';

  // 1. Video URLs (direct video files or YouTube / Shorts / Vimeo / TikTok)
  if (
    /^https?:\/\/.+\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i.test(s) ||
    /^https?:\/\/(www\.|m\.)?(youtube\.com\/(watch|shorts\/)|youtu\.be\/|vimeo\.com\/|tiktok\.com\/)/i.test(s)
  ) {
    return 'video';
  }

  // 2. Direct image or GIF URL
  if (
    /^https?:\/\/.+\.(jpg|jpeg|png|webp|gif|avif)(\?|#|$)/i.test(s) ||
    /^https?:\/\/i\.pinimg\.com\//i.test(s)
  ) {
    return 'image-url';
  }

  // 3. Pinterest board/pin URL or "username/board-name" shorthand
  if (
    /^https?:\/\/([a-z0-9-]+\.)?(pinterest\.[a-z.]+|pin\.it)\//i.test(s) ||
    /^(www\.)?pinterest\.[a-z.]+\/[^/\s]+\/[^/\s]+/i.test(s) ||
    (/^[a-zA-Z0-9_.-]{2,40}\/[a-zA-Z0-9_.-]{2,60}\/?$/.test(s) && !/\.(com|org|net|io|edu|gov)\//i.test(s))
  ) {
    return 'pinterest';
  }

  // 4. Any other web page URL
  if (/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(s)) {
    return 'web-url';
  }

  return 'search';
}

export function isStaticHost(): boolean {
  return typeof window !== 'undefined' && window.location.hostname.endsWith('github.io');
}

/**
 * Serverless browser-side image search fallback for GitHub Pages.
 */
export async function clientSearchImages(options: {
  query: string;
  count?: number;
  safeSearch?: boolean;
  gifMode?: GifMode;
  sites?: string[];
  googleApiKey?: string;
  googleCx?: string;
}): Promise<{ provider: string; images: RefImage[] }> {
  const {
    query,
    count = 35,
    safeSearch = true,
    gifMode = 'exclude',
    sites = [],
    googleApiKey,
    googleCx,
  } = options;

  const siteClause =
    sites.length === 1
      ? `site:${sites[0]}`
      : sites.length > 1
      ? `(${sites.map((s) => `site:${s}`).join(' OR ')})`
      : '';
  const baseQuery = gifMode === 'only' ? `${query} gif` : query;
  const effectiveQuery = siteClause ? `${baseQuery} ${siteClause}` : baseQuery;

  // 1. Google Custom Search JSON API (supports direct browser CORS)
  if (googleApiKey && googleCx) {
    const results: RefImage[] = [];
    for (let page = 0; page < 3 && results.length < count; page++) {
      const url = new URL('https://www.googleapis.com/customsearch/v1');
      url.searchParams.set('q', effectiveQuery);
      url.searchParams.set('searchType', 'image');
      url.searchParams.set('num', '10');
      url.searchParams.set('start', String(page * 10 + 1));
      url.searchParams.set('safe', safeSearch ? 'active' : 'off');
      url.searchParams.set('key', googleApiKey);
      url.searchParams.set('cx', googleCx);

      const res = await fetch(url.toString());
      if (!res.ok) break;
      const data = await res.json();
      for (const item of data.items || []) {
        if (!item.link || VIDEO_URL_RE.test(item.link)) continue;
        const isGif = GIF_URL_RE.test(item.link);
        if (gifMode === 'exclude' && isGif) continue;
        if (gifMode === 'only' && !isGif) continue;
        results.push({
          id: `cse-${Date.now()}-${results.length}-${Math.random().toString(36).slice(2, 6)}`,
          url: item.link,
          pageUrl: item.image?.contextLink || item.link,
          thumbnail: item.image?.thumbnailLink || item.link,
          title: item.title || query,
          width: item.image?.width || 800,
          height: item.image?.height || 800,
          source: 'google-cse',
          addedAt: Date.now(),
        });
      }
    }
    if (results.length > 0) {
      return { provider: 'google-cse', images: results };
    }
  }

  const combined: RefImage[] = [];
  const seen = new Set<string>();

  // 2. Openverse API (CORS-enabled creative commons & reference photos)
  if (gifMode !== 'only') {
    try {
      const ovUrl = new URL('https://api.openverse.org/v1/images/');
      ovUrl.searchParams.set('q', query);
      ovUrl.searchParams.set('page_size', '30');
      ovUrl.searchParams.set('mature', safeSearch ? 'false' : 'true');
      const ovRes = await fetch(ovUrl.toString());
      if (ovRes.ok) {
        const ovData = await ovRes.json();
        for (const item of ovData.results || []) {
          if (!item.url || seen.has(item.url) || VIDEO_URL_RE.test(item.url)) continue;
          const isGif = GIF_URL_RE.test(item.url);
          if (gifMode === 'exclude' && isGif) continue;
          if ((item.width && item.width < 400) || (item.height && item.height < 400)) continue;
          seen.add(item.url);
          combined.push({
            id: `ov-${Date.now()}-${combined.length}-${Math.random().toString(36).slice(2, 6)}`,
            url: item.url,
            pageUrl: item.foreign_landing_url || item.url,
            thumbnail: item.thumbnail || item.url,
            title: item.title || query,
            width: item.width || 800,
            height: item.height || 800,
            source: 'openverse',
            addedAt: Date.now(),
          });
        }
      }
    } catch {
      // Fall through to Wikimedia
    }
  }

  // 3. Wikimedia Commons API (CORS-enabled via origin=*, supports photos & animated GIFs)
  try {
    const wikiQuery = gifMode === 'only' ? `${query} filetype:gif` : query;
    const wikiUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(
      wikiQuery
    )}&gsrlimit=35&prop=imageinfo&iiprop=url|size|mime&format=json&origin=*`;
    const wikiRes = await fetch(wikiUrl);
    if (wikiRes.ok) {
      const wikiData = await wikiRes.json();
      const pages = Object.values((wikiData?.query?.pages || {}) as Record<string, any>);
      for (const p of pages) {
        const info = p.imageinfo?.[0];
        if (!info?.url || !info.mime?.startsWith('image/') || info.mime.includes('svg')) continue;
        if (seen.has(info.url)) continue;
        const isGif = info.mime.includes('gif') || GIF_URL_RE.test(info.url);
        if (gifMode === 'exclude' && isGif) continue;
        if (gifMode === 'only' && !isGif) continue;
        if (gifMode !== 'only' && ((info.width && info.width < 400) || (info.height && info.height < 400))) {
          continue;
        }
        seen.add(info.url);
        combined.push({
          id: `wm-${Date.now()}-${combined.length}-${Math.random().toString(36).slice(2, 6)}`,
          url: info.url,
          pageUrl: p.title
            ? `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title)}`
            : info.url,
          thumbnail: info.url,
          title: p.title?.replace(/^File:/, '') || query,
          width: info.width || 800,
          height: info.height || 800,
          source: 'wikimedia',
          addedAt: Date.now(),
        });
      }
    }
  } catch {
    // ignore
  }

  return {
    provider: combined[0]?.source || 'web',
    images: combined.slice(0, count),
  };
}

/**
 * Fetch Pinterest board pins directly in the browser using Pinterest's CORS-enabled Pidgets API,
 * with HTML proxy fallback for single pins or board sections.
 */
export async function clientFetchPinterest(rawInput: string, count = 50): Promise<RefImage[]> {
  let boardUrl = rawInput.trim();
  if (!/^https?:\/\//i.test(boardUrl)) {
    const cleanPath = boardUrl
      .replace(/^(www\.)?pinterest\.[a-z.]+\//i, '')
      .replace(/^\/+|\/+$/g, '');
    boardUrl = `https://www.pinterest.com/${cleanPath}/`;
  }

  const seenKeys = new Set<string>();
  const images: RefImage[] = [];

  const addPin = (rawUrl: string, title = '', pinId = '') => {
    if (!rawUrl || !/^https?:\/\//i.test(rawUrl)) return;
    const keyMatch = rawUrl.match(/\/([a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]+\.[a-z]+)/i);
    const key = keyMatch ? keyMatch[1] : rawUrl;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);

    const hiResUrl = rawUrl.replace(/\/(75x75_RS|136x136|170x|236x|474x|564x)\//i, '/736x/');
    const thumbUrl = rawUrl.replace(/\/(originals|736x)\//i, '/474x/');
    images.push({
      id: `pin-${Date.now()}-${images.length}-${Math.random().toString(36).slice(2, 6)}`,
      url: hiResUrl,
      pageUrl: pinId ? `https://www.pinterest.com/pin/${pinId}/` : boardUrl,
      thumbnail: thumbUrl,
      title: title || `Pinterest Pin ${images.length + 1}`,
      width: 736,
      height: 736,
      source: 'pinterest',
      addedAt: Date.now(),
    });
  };

  // 1. Direct CORS call to Pinterest Pidgets API (Access-Control-Allow-Origin: *)
  try {
    const parsed = new URL(boardUrl);
    const segs = parsed.pathname.split('/').filter(Boolean);
    if (segs.length >= 2 && segs[0].toLowerCase() !== 'pin' && segs[0].toLowerCase() !== 'search') {
      const user = encodeURIComponent(segs[0]);
      const board = encodeURIComponent(segs[1]);
      const pidgetRes = await fetch(
        `https://api.pinterest.com/v3/pidgets/boards/${user}/${board}/pins/?page_size=50`
      );
      if (pidgetRes.ok) {
        const pidgetData = await pidgetRes.json();
        for (const pin of pidgetData?.data?.pins || []) {
          if (images.length >= count) break;
          const imgObj = pin?.images || {};
          const best =
            imgObj['736x']?.url ||
            imgObj['564x']?.url ||
            imgObj['474x']?.url ||
            imgObj['236x']?.url;
          if (best) {
            const title = (pin.description || pin.rich_summary?.display_name || '').trim();
            addPin(best, title, pin.id || '');
          }
        }
      }
    }
  } catch {
    // Fall through to HTML proxy fallback
  }

  if (images.length > 0) {
    return images;
  }

  // 2. HTML proxy fallback (for single pins or board sections)
  const proxies = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(boardUrl)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(boardUrl)}`,
    `https://corsproxy.io/?${encodeURIComponent(boardUrl)}`,
  ];

  for (const proxyUrl of proxies) {
    try {
      const res = await fetch(proxyUrl);
      if (res.ok) {
        const html = await res.text();
        const pinRegex =
          /https:\/\/i\.pinimg\.com\/(?:originals|736x|564x|474x|236x)\/[a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]+\.(?:jpg|jpeg|png|webp|gif)/gi;
        let m;
        while ((m = pinRegex.exec(html)) !== null && images.length < count) {
          addPin(m[0]);
        }
        if (images.length > 0) break;
      }
    } catch {
      // try next proxy
    }
  }

  if (images.length === 0) {
    throw new Error(
      'Could not load pins from that Pinterest URL. Make sure it is a public board (e.g. pinterest.com/username/board-name).'
    );
  }

  return images;
}

/**
 * Extract images from any direct image URL or public webpage link in browser mode.
 */
export async function clientExtractUrlImages(targetUrl: string, count = 40): Promise<RefImage[]> {
  const trimmed = targetUrl.trim();
  if (
    /\.(jpg|jpeg|png|webp|gif|avif)(\?|#|$)/i.test(trimmed) ||
    /^https?:\/\/i\.pinimg\.com\//i.test(trimmed)
  ) {
    const filename = trimmed.split('/').pop()?.split('?')[0] || 'Reference Image';
    return [
      {
        id: `link-${Date.now()}-0`,
        url: trimmed,
        pageUrl: trimmed,
        thumbnail: trimmed,
        title: filename,
        width: 1000,
        height: 1000,
        source: 'direct-link',
        addedAt: Date.now(),
      },
    ];
  }

  const proxies = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(trimmed)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(trimmed)}`,
    `https://corsproxy.io/?${encodeURIComponent(trimmed)}`,
  ];

  let html = '';
  for (const proxyUrl of proxies) {
    try {
      const res = await fetch(proxyUrl);
      if (res.ok) {
        html = await res.text();
        if (html.length > 100) break;
      }
    } catch {
      // try next
    }
  }

  if (!html) {
    throw new Error('Could not read that webpage link. Try pasting a direct image URL or Pinterest board.');
  }

  const seen = new Set<string>();
  const images: RefImage[] = [];

  const addImage = (rawSrc: string, label = '') => {
    if (!rawSrc || images.length >= count) return;
    const cleaned = rawSrc.replace(/&amp;/g, '&').trim();
    if (cleaned.startsWith('data:') || cleaned.endsWith('.svg')) return;
    try {
      const abs = new URL(cleaned, trimmed).toString();
      if (!/^https?:\/\//i.test(abs) || seen.has(abs)) return;
      if (/(favicon|logo|icon|avatar|badge|pixel|tracker|spinner|1x1|sprite|emoji)/i.test(abs)) {
        return;
      }
      seen.add(abs);
      images.push({
        id: `page-${Date.now()}-${images.length}-${Math.random().toString(36).slice(2, 6)}`,
        url: abs,
        pageUrl: trimmed,
        thumbnail: abs,
        title: label || `Reference ${images.length + 1}`,
        width: 900,
        height: 900,
        source: 'web-link',
        addedAt: Date.now(),
      });
    } catch {
      // ignore
    }
  };

  const metaRegex =
    /<meta[^>]+(?:property|name)=["'](?:og:image|og:image:secure_url|twitter:image)["'][^>]+content=["']([^"']+)["']/gi;
  let m;
  while ((m = metaRegex.exec(html)) !== null) {
    addImage(m[1], 'Featured Image');
  }

  const imgTagRegex = /<img[^>]+(?:data-src|data-lazy-src|data-original|src)=["']([^"']+)["'][^>]*>/gi;
  while ((m = imgTagRegex.exec(html)) !== null && images.length < count) {
    addImage(m[1]);
  }

  const rawImgRegex = /https?:\/\/[^"'\s<>\\]+\.(?:jpg|jpeg|png|webp|gif)(?:\?[^"'\s<>\\]*)?/gi;
  while ((m = rawImgRegex.exec(html)) !== null && images.length < count) {
    addImage(m[0]);
  }

  return images;
}
