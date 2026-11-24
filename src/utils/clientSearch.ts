import { GifMode, RefImage } from '../types';

const VIDEO_URL_RE =
  /(ytimg\.com|youtube\.com|youtu\.be|vimeocdn\.com|vimeo\.com|tiktok\.com|tiktokcdn\.com|dailymotion\.com|dmcdn\.net|jtvnw\.net|twitch\.tv|\/vi\/[a-zA-Z0-9_-]+\/|hqdefault|mqdefault|sddefault|maxresdefault|video_thumb|videothumb|\/video\/|streamable\.com)/i;

const GIF_URL_RE = /\.gif(\?|#|$)/i;

export function isStaticHost(): boolean {
  return typeof window !== 'undefined' && window.location.hostname.endsWith('github.io');
}

/**
 * Serverless browser-side image search fallback for GitHub Pages.
 * Uses Google CSE (if configured), Openverse API, and Wikimedia Commons API (all CORS-enabled).
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
 * Serverless browser-side Pinterest board loader fallback for GitHub Pages.
 */
export async function clientFetchPinterest(boardUrl: string, count = 50): Promise<RefImage[]> {
  const proxies = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(boardUrl)}`,
    `https://corsproxy.io/?${encodeURIComponent(boardUrl)}`,
  ];

  let html = '';
  for (const proxyUrl of proxies) {
    try {
      const res = await fetch(proxyUrl);
      if (res.ok) {
        html = await res.text();
        if (html.includes('pinimg.com')) break;
      }
    } catch {
      // try next proxy
    }
  }

  if (!html) {
    throw new Error('Could not load Pinterest board in browser mode.');
  }

  const seenKeys = new Set<string>();
  const images: RefImage[] = [];
  const pinRegex =
    /https:\/\/i\.pinimg\.com\/(?:originals|736x|564x|474x|236x)\/[a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]+\.(?:jpg|jpeg|png|webp)/gi;
  let m;
  while ((m = pinRegex.exec(html)) !== null && images.length < count) {
    const raw = m[0];
    const keyMatch = raw.match(/\/([a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]+\.[a-z]+)/i);
    const key = keyMatch ? keyMatch[1] : raw;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    const hiResUrl = raw.replace(/\/(75x75_RS|136x136|170x|236x|474x)\//i, '/736x/');
    const thumbUrl = raw.replace(/\/(originals|736x)\//i, '/474x/');
    images.push({
      id: `pin-${Date.now()}-${images.length}-${Math.random().toString(36).slice(2, 6)}`,
      url: hiResUrl,
      pageUrl: boardUrl,
      thumbnail: thumbUrl,
      title: `Pinterest Pin ${images.length + 1}`,
      width: 736,
      height: 736,
      source: 'pinterest',
      addedAt: Date.now(),
    });
  }

  return images;
}
