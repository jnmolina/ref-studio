import { GifMode, RefImage } from '../types';

const VIDEO_URL_RE =
  /(ytimg\.com|youtube\.com|youtu\.be|vimeocdn\.com|vimeo\.com|tiktok\.com|tiktokcdn\.com|dailymotion\.com|dmcdn\.net|jtvnw\.net|twitch\.tv|\/vi\/[a-zA-Z0-9_-]+\/|hqdefault|mqdefault|sddefault|maxresdefault|video_thumb|videothumb|\/video\/|streamable\.com)/i;

const GIF_URL_RE = /\.gif(\?|#|$)/i;

export type InputKind = 'video' | 'pinterest' | 'image-url' | 'web-url' | 'search';

export function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

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
    (/^[a-zA-Z0-9_.-]{2,40}\/[a-zA-Z0-9_.-]{2,60}\/?$/.test(s) &&
      !/\.(com|org|net|io|edu|gov)\//i.test(s))
  ) {
    return 'pinterest';
  }

  // 4. Any other web page URL or domain (e.g. livlily.blogspot.com, film-grab.com)
  if (
    /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(s) ||
    /^[a-z0-9-]+\.(blogspot\.com|com|org|net|io)(\/.*)?$/i.test(s)
  ) {
    return 'web-url';
  }

  return 'search';
}

export function isStaticHost(): boolean {
  return typeof window !== 'undefined' && window.location.hostname.endsWith('github.io');
}

/**
 * Native browser JSONP fetcher for Blogger/Blogspot sites (e.g. livlily.blogspot.com).
 * Works 100% client-side on GitHub Pages without any CORS proxy!
 */
function fetchBloggerJsonp(origin: string, startIndex: number, maxResults: number): Promise<any> {
  return new Promise((resolve, reject) => {
    const cbName = `__blogger_cb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const script = document.createElement('script');
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Blogger feed timeout'));
    }, 10000);

    const cleanup = () => {
      clearTimeout(timer);
      delete (window as any)[cbName];
      script.remove();
    };

    (window as any)[cbName] = (data: any) => {
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error('Blogger JSONP script failed'));
    };

    script.src = `${origin}/feeds/posts/default?alt=json-in-script&callback=${cbName}&start-index=${startIndex}&max-results=${maxResults}`;
    document.head.appendChild(script);
  });
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
  random?: boolean;
}): Promise<{ provider: string; images: RefImage[] }> {
  const {
    query,
    count = 35,
    safeSearch = true,
    gifMode = 'exclude',
    sites = [],
    googleApiKey,
    googleCx,
    random = false,
  } = options;

  const siteClause =
    sites.length === 1
      ? `site:${sites[0]}`
      : sites.length > 1
      ? `(${sites.map((s) => `site:${s}`).join(' OR ')})`
      : '';
  const baseQuery = gifMode === 'only' ? `${query} gif` : query;
  const effectiveQuery = siteClause ? `${baseQuery} ${siteClause}` : baseQuery;

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
      return { provider: 'google-cse', images: random ? shuffleArray(results) : results };
    }
  }

  const combined: RefImage[] = [];
  const seen = new Set<string>();

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
        if (
          gifMode !== 'only' &&
          ((info.width && info.width < 400) || (info.height && info.height < 400))
        ) {
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

  const finalImages = random ? shuffleArray(combined) : combined;
  return {
    provider: finalImages[0]?.source || 'web',
    images: finalImages.slice(0, count),
  };
}

/**
 * Fetch Pinterest board pins directly in the browser using Pinterest's CORS-enabled Pidgets API,
 * with HTML proxy fallback for single pins or board sections.
 */
export async function clientFetchPinterest(
  rawInput: string,
  count = 50,
  random = false
): Promise<RefImage[]> {
  let boardUrl = rawInput.trim();
  if (!/^https?:\/\//i.test(boardUrl)) {
    const cleanPath = boardUrl
      .replace(/^(www\.)?pinterest\.[a-z.]+\//i, '')
      .replace(/^\/+|\/+$/g, '');
    boardUrl = `https://www.pinterest.com/${cleanPath}/`;
  }

  const seenKeys = new Set<string>();
  let images: RefImage[] = [];

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

  if (images.length === 0) {
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
  }

  if (images.length === 0) {
    throw new Error(
      'Could not load pins from that Pinterest URL. Make sure it is a public board (e.g. pinterest.com/username/board-name).'
    );
  }

  if (random) images = shuffleArray(images);
  return images.slice(0, count);
}

/**
 * Extract images from any direct image URL, Blogger archive (e.g. livlily.blogspot.com),
 * WordPress media archive (e.g. film-grab.com), or public webpage link in browser mode.
 */
export async function clientExtractUrlImages(
  rawUrl: string,
  count = 40,
  random = false
): Promise<RefImage[]> {
  let trimmed = rawUrl.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `https://${trimmed}`;
  }

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

  const parsedTarget = new URL(trimmed);
  const origin = parsedTarget.origin;

  // 1. Native JSONP for Blogger / Blogspot sites (e.g. livlily.blogspot.com)
  if (/\.blogspot\.[a-z.]+$/i.test(parsedTarget.hostname)) {
    try {
      let startIndex = 1;
      if (random) {
        const meta = await fetchBloggerJsonp(origin, 1, 1);
        const total = parseInt(meta?.feed?.['openSearch$totalResults']?.['$t'] || '1', 10) || 1;
        if (total > 15) {
          startIndex = Math.floor(Math.random() * Math.max(1, total - 15)) + 1;
        }
      }
      const feedData = await fetchBloggerJsonp(origin, startIndex, 25);
      const entries = feedData?.feed?.entry || [];
      let blogImages: RefImage[] = [];
      const seenBlog = new Set<string>();

      for (const entry of entries) {
        const postTitle = entry?.title?.['$t'] || 'Blog Reference';
        const altLink = (entry?.link || []).find((l: any) => l.rel === 'alternate')?.href || trimmed;
        const htmlContent = entry?.content?.['$t'] || entry?.summary?.['$t'] || '';
        const imgRegex = /https?:\/\/[^"'\s<>]+\.(?:jpg|jpeg|png|webp|gif)/gi;
        let m;
        while ((m = imgRegex.exec(htmlContent)) !== null) {
          const rawImg = m[0];
          if (/(favicon|icon|avatar|badge|tracker|1x1)/i.test(rawImg)) continue;
          const hiRes = rawImg
            .replace(/\/s\d+(-[a-z]+)?\//i, '/s1600/')
            .replace(/=s\d+(-[a-z]+)?$/i, '=s1600');
          if (seenBlog.has(hiRes)) continue;
          seenBlog.add(hiRes);
          blogImages.push({
            id: `blog-${Date.now()}-${blogImages.length}-${Math.random().toString(36).slice(2, 6)}`,
            url: hiRes,
            pageUrl: altLink,
            thumbnail: rawImg,
            title: postTitle,
            width: 1200,
            height: 900,
            source: parsedTarget.hostname,
            addedAt: Date.now(),
          });
        }
      }
      if (blogImages.length > 0) {
        if (random) blogImages = shuffleArray(blogImages);
        return blogImages.slice(0, count);
      }
    } catch {
      // Fall through to proxy HTML extraction
    }
  }

  // 2. WordPress REST API via CORS proxy (e.g. film-grab.com)
  if (/film-grab\.com$/i.test(parsedTarget.hostname)) {
    const randPage = random ? Math.floor(Math.random() * 85) + 1 : 1;
    const wpApiUrl = `${origin}/wp-json/wp/v2/media?per_page=50&page=${randPage}`;
    const wpProxies = [
      `https://api.allorigins.win/raw?url=${encodeURIComponent(wpApiUrl)}`,
      `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(wpApiUrl)}`,
      `https://corsproxy.io/?${encodeURIComponent(wpApiUrl)}`,
    ];
    for (const pUrl of wpProxies) {
      try {
        const res = await fetch(pUrl);
        if (res.ok) {
          const mediaItems = await res.json();
          if (Array.isArray(mediaItems) && mediaItems.length > 0) {
            let wpImages: RefImage[] = [];
            for (const item of mediaItems) {
              const srcUrl =
                item?.media_details?.sizes?.full?.source_url ||
                item?.source_url ||
                item?.guid?.rendered;
              if (!srcUrl || !/\.(jpg|jpeg|png|webp)/i.test(srcUrl)) continue;
              const thumbUrl =
                item?.media_details?.sizes?.medium_large?.source_url ||
                item?.media_details?.sizes?.medium?.source_url ||
                srcUrl;
              wpImages.push({
                id: `wp-${Date.now()}-${wpImages.length}-${Math.random().toString(36).slice(2, 6)}`,
                url: srcUrl,
                pageUrl: item?.link || trimmed,
                thumbnail: thumbUrl,
                title: (item?.title?.rendered || 'Film Still').replace(/&#8211;|&#8212;/g, '—'),
                width: item?.media_details?.width || 1280,
                height: item?.media_details?.height || 720,
                source: 'film-grab.com',
                addedAt: Date.now(),
              });
            }
            if (wpImages.length > 0) {
              if (random) wpImages = shuffleArray(wpImages);
              return wpImages.slice(0, count);
            }
          }
        }
      } catch {
        // try next proxy
      }
    }
  }

  // 3. Generic webpage HTML extraction
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
  let images: RefImage[] = [];

  const addImage = (rawSrc: string, label = '') => {
    if (!rawSrc || images.length >= count * 2) return;
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
        source: parsedTarget.hostname.replace(/^www\./, ''),
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
  while ((m = imgTagRegex.exec(html)) !== null) {
    addImage(m[1]);
  }

  const rawImgRegex = /https?:\/\/[^"'\s<>\\]+\.(?:jpg|jpeg|png|webp|gif)(?:\?[^"'\s<>\\]*)?/gi;
  while ((m = rawImgRegex.exec(html)) !== null) {
    addImage(m[0]);
  }

  if (random) images = shuffleArray(images);
  return images.slice(0, count);
}
