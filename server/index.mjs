import express from 'express';
import cors from 'cors';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { exec } from 'child_process';
import { Readable } from 'stream';
import { fileURLToPath } from 'url';

const currentDir =
  typeof __dirname !== 'undefined'
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

const app = express();
const BASE_PORT = Number(process.env.PORT) || 3001;

app.use(cors());
app.use(express.json());

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const VIDEO_URL_RE =
  /(ytimg\.com|youtube\.com|youtu\.be|vimeocdn\.com|vimeo\.com|tiktok\.com|tiktokcdn\.com|dailymotion\.com|dmcdn\.net|jtvnw\.net|twitch\.tv|\/vi\/[a-zA-Z0-9_-]+\/|hqdefault|mqdefault|sddefault|maxresdefault|video_thumb|videothumb|\/video\/|streamable\.com)/i;

const BLURRY_URL_RE =
  /(encrypted-tbn|gstatic\.com|\/thumb\/|_thumb\.|_small\.|placeholder|avatar|favicon|w=1\d\d&|w=2\d\d&|s=1\d\d&)/i;

const GIF_URL_RE = /\.gif(\?|#|$)/i;

function filterAndRankImages(items, { gifMode = 'exclude', minDim = 480 } = {}) {
  const filtered = items.filter((item) => {
    const u = item.url || '';
    const title = item.title || '';

    // Exclude video thumbnails
    if (VIDEO_URL_RE.test(u) || /\b(youtube|tiktok|vimeo|mp4)\b/i.test(title)) {
      return false;
    }

    // Exclude blurry / low-res thumbnails
    if (BLURRY_URL_RE.test(u)) {
      return false;
    }
    if ((item.width > 0 && item.width < minDim) || (item.height > 0 && item.height < minDim)) {
      return false;
    }

    // GIF filtering
    const isGif = GIF_URL_RE.test(u) || item.isGif === true;
    if (gifMode === 'exclude' && isGif) return false;
    if (gifMode === 'only' && !isGif) return false;

    return true;
  });

  // Prefer higher-resolution, sharper images first
  return filtered.sort((a, b) => (b.width * b.height) - (a.width * a.height));
}

/**
 * Official Google Custom Search JSON API (if user supplies API key + CX).
 */
async function searchGoogleCSE(query, apiKey, cx, count = 25, safeSearch = true) {
  const results = [];
  const pages = Math.ceil(Math.min(count, 30) / 10);
  for (let i = 0; i < pages; i++) {
    const start = i * 10 + 1;
    const url = new URL('https://www.googleapis.com/customsearch/v1');
    url.searchParams.set('q', query);
    url.searchParams.set('searchType', 'image');
    url.searchParams.set('num', '10');
    url.searchParams.set('start', String(start));
    url.searchParams.set('safe', safeSearch ? 'active' : 'off');
    url.searchParams.set('key', apiKey);
    url.searchParams.set('cx', cx);

    const res = await fetch(url.toString());
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Google CSE error ${res.status}: ${errText}`);
    }
    const data = await res.json();
    if (Array.isArray(data.items)) {
      for (const item of data.items) {
        if (item.link) {
          results.push({
            id: `${Date.now()}-${results.length}-${Math.random().toString(36).slice(2, 7)}`,
            url: item.link,
            pageUrl: item.image?.contextLink || item.link,
            thumbnail: item.image?.thumbnailLink || item.link,
            title: item.title || query,
            width: item.image?.width || 0,
            height: item.image?.height || 0,
            source: 'google-cse',
          });
        }
      }
    }
  }
  return results;
}

/**
 * Live Google Images HTML search (in-memory only, no storage).
 */
async function searchGoogleImagesHTML(query, count = 45, safeSearch = true) {
  const safeParam = safeSearch ? 'active' : 'off';
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=isch&udm=2&safe=${safeParam}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': BROWSER_UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  if (!res.ok) {
    throw new Error(`Google Images HTTP ${res.status}`);
  }

  const html = await res.text();
  const seen = new Set();
  const results = [];

  // Extract full-res image URLs embedded in Google's AF_initDataCallback / script payloads
  const regex = /\["(https?:\/\/[^"\\]+)",(\d+),(\d+)\]/g;
  let match;
  while ((match = regex.exec(html)) !== null && results.length < count) {
    const rawUrl = match[1].replace(/\\u003d/g, '=').replace(/\\u0026/g, '&');
    const height = parseInt(match[2], 10);
    const width = parseInt(match[3], 10);

    // Filter out Google's own UI/thumbnail/static assets and tiny icons
    if (
      rawUrl.includes('gstatic.com') ||
      rawUrl.includes('google.com') ||
      rawUrl.includes('googleusercontent.com') ||
      rawUrl.includes('ggpht.com') ||
      width < 200 ||
      height < 200
    ) {
      continue;
    }

    if (!seen.has(rawUrl)) {
      seen.add(rawUrl);
      results.push({
        id: `${Date.now()}-${results.length}-${Math.random().toString(36).slice(2, 7)}`,
        url: rawUrl,
        thumbnail: rawUrl,
        title: `${query} (${results.length + 1})`,
        width,
        height,
        source: 'google',
      });
    }
  }

  return results;
}

/**
 * Bing Images async search (supports SafeSearch off via adlt=off and animated GIF filter via qft=+filterui:photo-animatedgif).
 */
async function searchBingImages(query, count = 45, safeSearch = true, gifMode = 'exclude') {
  const adlt = safeSearch ? 'strict' : 'off';
  const qft = gifMode === 'only' ? '&qft=+filterui:photo-animatedgif' : '';
  const url = `https://www.bing.com/images/async?q=${encodeURIComponent(query)}&first=0&count=${count}&adlt=${adlt}${qft}`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': BROWSER_UA,
      Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  if (!res.ok) return [];

  const html = await res.text();
  const results = [];
  const seen = new Set();

  // Extract m="{&quot;murl&quot;:...}" JSON blocks from Bing image cards
  const cardRegex = /\bm="(\{&quot;[^"]+\})"/g;
  let m;
  while ((m = cardRegex.exec(html)) !== null && results.length < count) {
    try {
      const decoded = m[1]
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&#39;/g, "'");
      const meta = JSON.parse(decoded);
      const imgUrl = meta.murl;
      if (!imgUrl || !/^https?:\/\//i.test(imgUrl) || seen.has(imgUrl)) continue;
      seen.add(imgUrl);

      const isGif = GIF_URL_RE.test(imgUrl) || gifMode === 'only';
      results.push({
        id: `bing-${Date.now()}-${results.length}-${Math.random().toString(36).slice(2, 7)}`,
        url: imgUrl,
        pageUrl: meta.purl || imgUrl,
        thumbnail: meta.turl || imgUrl,
        title: (meta.t || query).replace(/[\uE000-\uF8FF]/g, '').trim() || query,
        width: 900,
        height: 900,
        isGif,
        source: isGif ? 'bing-gif' : 'bing',
      });
    } catch {
      // ignore malformed card
    }
  }
  return results;
}

/**
 * DuckDuckGo Images fallback (in-memory only, no storage).
 */
async function searchDuckDuckGoImages(query, count = 45, safeSearch = true, gifMode = 'exclude') {
  const p = safeSearch ? '1' : '-1';
  const f = gifMode === 'only' ? ',,,type:gif,' : ',,,';
  const pageRes = await fetch(`https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`, {
    headers: { 'User-Agent': BROWSER_UA },
  });
  const html = await pageRes.text();
  const vqdMatch = html.match(/vqd=['"]?([\d-]+)['"]?/);
  if (!vqdMatch) return [];

  const vqd = vqdMatch[1];
  const apiRes = await fetch(
    `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(query)}&vqd=${encodeURIComponent(vqd)}&f=${f}&p=${p}`,
    {
      headers: {
        'User-Agent': BROWSER_UA,
        Referer: 'https://duckduckgo.com/',
      },
    }
  );
  if (!apiRes.ok) return [];
  const data = await apiRes.json();
  const results = [];
  for (const item of (data.results || []).slice(0, count)) {
    if (item.image) {
      results.push({
        id: `${Date.now()}-${results.length}-${Math.random().toString(36).slice(2, 7)}`,
        url: item.image,
        pageUrl: item.url || item.image,
        thumbnail: item.thumbnail || item.image,
        title: item.title || query,
        width: item.width || 0,
        height: item.height || 0,
        source: 'duckduckgo',
      });
    }
  }
  return results;
}

/**
 * Wikimedia Commons fallback (guaranteed CORS-friendly open reference images).
 */
async function searchWikimediaImages(query, count = 20) {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(
    query
  )}&gsrlimit=${count}&prop=imageinfo&iiprop=url|size|mime&format=json&origin=*`;
  const res = await fetch(url, { headers: { 'User-Agent': 'RefStudio/1.0' } });
  if (!res.ok) return [];
  const data = await res.json();
  const pages = Object.values(data?.query?.pages || {});
  const results = [];
  for (const p of pages) {
    const info = p.imageinfo?.[0];
    if (info?.url && info.mime?.startsWith('image/') && !info.mime.includes('svg')) {
      results.push({
        id: `${Date.now()}-${results.length}-${Math.random().toString(36).slice(2, 7)}`,
        url: info.url,
        pageUrl: p.title ? `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title)}` : info.url,
        thumbnail: info.url,
        title: p.title?.replace(/^File:/, '') || query,
        width: info.width || 0,
        height: info.height || 0,
        source: 'wikimedia',
      });
    }
  }
  return results;
}

app.get('/api/search', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const rawQuery = String(req.query.q || '').trim();
  const count = Math.min(parseInt(String(req.query.count || '25'), 10) || 25, 50);
  const safeSearch = String(req.query.safe ?? 'true') !== 'false';
  const gifParam = String(req.query.gifs || 'exclude');
  const gifMode = gifParam === 'only' || gifParam === 'include' ? gifParam : 'exclude';
  const googleApiKey = String(req.headers['x-google-api-key'] || process.env.GOOGLE_API_KEY || '').trim();
  const googleCx = String(req.headers['x-google-cx'] || process.env.GOOGLE_CX || '').trim();

  if (!rawQuery) {
    return res.status(400).json({ error: 'Missing query parameter q' });
  }

  const sitesParam = String(req.query.sites || '').trim();
  const siteList = sitesParam
    ? sitesParam
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 12)
    : [];
  const siteClause =
    siteList.length === 1
      ? `site:${siteList[0]}`
      : siteList.length > 1
      ? `(${siteList.map((s) => `site:${s}`).join(' OR ')})`
      : '';

  const baseQuery = gifMode === 'only' ? `${rawQuery} gif` : rawQuery;
  const effectiveQuery = siteClause ? `${baseQuery} ${siteClause}` : baseQuery;
  const fetchLimit = Math.max(count * 2, 45);

  try {
    let rawImages = [];
    let provider = 'google';

    if (googleApiKey && googleCx) {
      rawImages = await searchGoogleCSE(effectiveQuery, googleApiKey, googleCx, fetchLimit, safeSearch);
      provider = 'google-cse';
    } else {
      // For GIF-only or NSFW searches, Bing async supports native adlt=off and photo-animatedgif filters reliably
      if (gifMode === 'only' || !safeSearch) {
        try {
          rawImages = await searchBingImages(effectiveQuery, fetchLimit, safeSearch, gifMode);
          provider = 'bing';
        } catch (err) {
          console.warn('Bing search failed:', err.message);
        }
      }

      if (rawImages.length === 0) {
        try {
          rawImages = await searchGoogleImagesHTML(effectiveQuery, fetchLimit, safeSearch);
          provider = 'google';
        } catch (err) {
          console.warn('Google HTML search failed, trying fallback:', err.message);
        }
      }

      if (rawImages.length === 0) {
        try {
          rawImages = await searchBingImages(effectiveQuery, fetchLimit, safeSearch, gifMode);
          provider = 'bing';
        } catch (err) {
          console.warn('Bing fallback failed:', err.message);
        }
      }

      if (rawImages.length === 0) {
        try {
          rawImages = await searchDuckDuckGoImages(effectiveQuery, fetchLimit, safeSearch, gifMode);
          provider = 'duckduckgo';
        } catch (err) {
          console.warn('DuckDuckGo fallback failed:', err.message);
        }
      }

      if (rawImages.length === 0) {
        rawImages = await searchWikimediaImages(effectiveQuery, fetchLimit);
        provider = 'wikimedia';
      }
    }

    const minDim = gifMode === 'only' ? 200 : 480;
    let images = filterAndRankImages(rawImages, { gifMode, minDim });
    if (images.length < 3 && rawImages.length > 0) {
      images = filterAndRankImages(rawImages, { gifMode, minDim: 180 });
    }
    images = images.slice(0, count);

    return res.json({
      query: rawQuery,
      provider,
      safeSearch,
      gifMode,
      count: images.length,
      images,
    });
  } catch (err) {
    console.error('Search error:', err);
    return res.status(500).json({ error: err.message || 'Search failed' });
  }
});

/**
 * In-memory image proxy (streams bytes without storing anything on disk)
 * Enables CORS-safe canvas rendering, B&W filtering, and ZIP export.
 */
app.get('/api/proxy', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const targetUrl = String(req.query.url || '').trim();
  const refParam = String(req.query.ref || '').trim();
  if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
    return res.status(400).send('Invalid URL');
  }

  let referer = '';
  try {
    referer = refParam && /^https?:\/\//i.test(refParam)
      ? new URL(refParam).origin + '/'
      : new URL(targetUrl).origin + '/';
  } catch {
    referer = '';
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const upstream = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        ...(referer ? { Referer: referer } : {}),
      },
    });
    clearTimeout(timeout);

    if (!upstream.ok) {
      return res.status(upstream.status).send('Upstream error');
    }

    const contentType = upstream.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      return res.status(415).send('Not an image');
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.send(buffer);
  } catch (err) {
    return res.status(502).send('Failed to fetch image');
  }
});

/**
 * Extract public pins from a Pinterest board, user/board shorthand, or pin URL (in-memory only, zero storage).
 */
app.get('/api/pinterest', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  let boardUrl = String(req.query.url || '').trim();
  const count = Math.min(parseInt(String(req.query.count || '50'), 10) || 50, 80);

  if (!boardUrl) {
    return res.status(400).json({ error: 'Please enter a Pinterest board URL or username/board.' });
  }

  // Allow shorthand like "username/board-name"
  if (!/^https?:\/\//i.test(boardUrl)) {
    const cleanPath = boardUrl.replace(/^^(www\.)?pinterest\.[a-z.]+\//i, '').replace(/^\/+|\/+$/g, '');
    boardUrl = `https://www.pinterest.com/${cleanPath}/`;
  }

  try {
    const seenKeys = new Set();
    const images = [];

    const addPin = (imgUrl, title = '', pinId = '') => {
      if (!imgUrl || !/^https?:\/\//i.test(imgUrl)) return;
      const keyMatch = imgUrl.match(/\/([a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]+\.[a-z]+)/i);
      const key = keyMatch ? keyMatch[1] : imgUrl;
      if (seenKeys.has(key)) return;
      seenKeys.add(key);

      const hiResUrl = imgUrl.replace(/\/(75x75_RS|136x136|170x|236x|474x|564x)\//i, '/736x/');
      const thumbUrl = imgUrl.replace(/\/(originals|736x)\//i, '/474x/');

      images.push({
        id: `pin-${Date.now()}-${images.length}-${Math.random().toString(36).slice(2, 6)}`,
        url: hiResUrl,
        pageUrl: pinId ? `https://www.pinterest.com/pin/${pinId}/` : boardUrl,
        thumbnail: thumbUrl,
        title: title || `Pinterest Pin ${images.length + 1}`,
        width: 736,
        height: 736,
        source: 'pinterest',
      });
    };

    // Resolve pin.it shortlinks first so we get the real board/pin URL
    if (/^https?:\/\/(www\.)?pin\.it\//i.test(boardUrl)) {
      try {
        const redir = await fetch(boardUrl, {
          redirect: 'follow',
          headers: { 'User-Agent': BROWSER_UA },
        });
        if (redir.url) boardUrl = redir.url;
      } catch {
        // continue with original URL
      }
    }

    // 1. Try Pinterest's fast JSON Pidgets Board API first
    try {
      const parsedUrl = new URL(boardUrl);
      const segs = parsedUrl.pathname.split('/').filter(Boolean);
      if (segs.length >= 2 && segs[0].toLowerCase() !== 'pin' && segs[0].toLowerCase() !== 'search') {
        const user = encodeURIComponent(segs[0]);
        const board = encodeURIComponent(segs[1]);
        const pidgetRes = await fetch(
          `https://api.pinterest.com/v3/pidgets/boards/${user}/${board}/pins/?page_size=50`,
          { headers: { 'User-Agent': BROWSER_UA } }
        );
        if (pidgetRes.ok) {
          const pidgetData = await pidgetRes.json();
          const pins = pidgetData?.data?.pins || [];
          for (const pin of pins) {
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
      // Fall through to HTML parsing
    }

    // 2. If pidgets didn't return pins (e.g., single pin URL or board section), inspect HTML
    if (images.length === 0) {
      const pageRes = await fetch(boardUrl, {
        redirect: 'follow',
        headers: {
          'User-Agent': BROWSER_UA,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      if (pageRes.ok) {
        const html = await pageRes.text();
        const pwsMatch = html.match(/<script[^>]+id=["']__PWS_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
        if (pwsMatch) {
          try {
            const pws = JSON.parse(pwsMatch[1]);
            const walk = (node) => {
              if (!node || typeof node !== 'object' || images.length >= count) return;
              if (node.images && typeof node.images === 'object') {
                const best =
                  node.images.orig?.url ||
                  node.images['736x']?.url ||
                  node.images['564x']?.url ||
                  node.images['474x']?.url;
                if (best) {
                  addPin(best, node.grid_title || node.title || node.description || '', node.id || '');
                }
              }
              if (Array.isArray(node)) {
                for (const item of node) walk(item);
              } else {
                for (const val of Object.values(node)) walk(val);
              }
            };
            walk(pws);
          } catch {
            // Fallback to regex below
          }
        }

        if (images.length < count) {
          const pinRegex =
            /https:\/\/i\.pinimg\.com\/(?:originals|736x|564x|474x|236x)\/[a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]+\.(?:jpg|jpeg|png|webp|gif)/gi;
          let m;
          while ((m = pinRegex.exec(html)) !== null && images.length < count) {
            addPin(m[0]);
          }
        }
      }
    }

    if (String(req.query.random || '') === 'true') {
      for (let i = images.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [images[i], images[j]] = [images[j], images[i]];
      }
    }

    return res.json({
      url: boardUrl,
      provider: 'pinterest',
      count: images.length,
      images,
    });
  } catch (err) {
    return res.status(502).json({ error: err.message || 'Failed to load Pinterest board' });
  }
});

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Extract reference images from any webpage link, Blogger archive (e.g. livlily.blogspot.com),
 * WordPress media archive (e.g. film-grab.com), or direct image URL (in-memory only, zero storage).
 */
app.get('/api/extract-url', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const targetUrl = String(req.query.url || '').trim();
  const count = Math.min(parseInt(String(req.query.count || '40'), 10) || 40, 80);
  const isRandom = String(req.query.random || '') === 'true';

  if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
    return res.status(400).json({ error: 'Please enter a valid http(s) URL.' });
  }

  // If it's a direct image URL, return it immediately
  if (/\.(jpg|jpeg|png|webp|gif|avif)(\?|#|$)/i.test(targetUrl)) {
    const filename = targetUrl.split('/').pop()?.split('?')[0] || 'Reference Image';
    return res.json({
      url: targetUrl,
      provider: 'direct-link',
      count: 1,
      images: [
        {
          id: `link-${Date.now()}-0`,
          url: targetUrl,
          pageUrl: targetUrl,
          thumbnail: targetUrl,
          title: filename,
          width: 1000,
          height: 1000,
          source: 'direct-link',
        },
      ],
    });
  }

  try {
    const parsedTarget = new URL(targetUrl);
    const origin = parsedTarget.origin;

    // 1. Blogger / Blogspot sites (e.g. livlily.blogspot.com) — use Blogger JSON feed API for deep random pulls
    if (/\.blogspot\.[a-z.]+$/i.test(parsedTarget.hostname)) {
      try {
        let startIndex = 1;
        if (isRandom) {
          const metaRes = await fetch(`${origin}/feeds/posts/default?alt=json&max-results=1`, {
            headers: { 'User-Agent': BROWSER_UA },
          });
          if (metaRes.ok) {
            const metaJson = await metaRes.json();
            const total = parseInt(metaJson?.feed?.['openSearch$totalResults']?.['$t'] || '1', 10) || 1;
            if (total > 15) {
              startIndex = Math.floor(Math.random() * Math.max(1, total - 15)) + 1;
            }
          }
        }
        const feedRes = await fetch(
          `${origin}/feeds/posts/default?alt=json&start-index=${startIndex}&max-results=25`,
          { headers: { 'User-Agent': BROWSER_UA } }
        );
        if (feedRes.ok) {
          const feedJson = await feedRes.json();
          const entries = feedJson?.feed?.entry || [];
          const blogImages = [];
          const seenBlog = new Set();

          for (const entry of entries) {
            const postTitle = entry?.title?.['$t'] || 'Blog Reference';
            const altLink = (entry?.link || []).find((l) => l.rel === 'alternate')?.href || targetUrl;
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
              });
            }
          }

          if (blogImages.length > 0) {
            if (isRandom) shuffleInPlace(blogImages);
            const sliced = blogImages.slice(0, count);
            return res.json({
              url: targetUrl,
              provider: parsedTarget.hostname,
              count: sliced.length,
              images: sliced,
            });
          }
        }
      } catch {
        // Fall through to standard HTML extraction
      }
    }

    // 2. WordPress sites (e.g. film-grab.com) — use /wp-json/wp/v2/media for deep random film stills
    if (/film-grab\.com$/i.test(parsedTarget.hostname) || isRandom) {
      try {
        const randPage = isRandom ? Math.floor(Math.random() * 85) + 1 : 1;
        const wpRes = await fetch(`${origin}/wp-json/wp/v2/media?per_page=50&page=${randPage}`, {
          headers: { 'User-Agent': BROWSER_UA },
        });
        if (wpRes.ok && (wpRes.headers.get('content-type') || '').includes('json')) {
          const mediaItems = await wpRes.json();
          if (Array.isArray(mediaItems) && mediaItems.length > 0) {
            const wpImages = [];
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
                pageUrl: item?.link || targetUrl,
                thumbnail: thumbUrl,
                title: (item?.title?.rendered || 'Film Still').replace(/&#8211;|&#8212;/g, '—'),
                width: item?.media_details?.width || 1280,
                height: item?.media_details?.height || 720,
                source: parsedTarget.hostname.replace(/^www\./, ''),
              });
            }
            if (wpImages.length > 0) {
              if (isRandom) shuffleInPlace(wpImages);
              const sliced = wpImages.slice(0, count);
              return res.json({
                url: targetUrl,
                provider: parsedTarget.hostname.replace(/^www\./, ''),
                count: sliced.length,
                images: sliced,
              });
            }
          }
        }
      } catch {
        // Fall through to standard HTML extraction
      }
    }
    const pageRes = await fetch(targetUrl, {
      redirect: 'follow',
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!pageRes.ok) {
      return res.status(pageRes.status).json({ error: `Link returned HTTP ${pageRes.status}` });
    }

    const ct = pageRes.headers.get('content-type') || '';
    if (ct.startsWith('image/')) {
      return res.json({
        url: targetUrl,
        provider: 'direct-link',
        count: 1,
        images: [
          {
            id: `link-${Date.now()}-0`,
            url: targetUrl,
            pageUrl: targetUrl,
            thumbnail: targetUrl,
            title: targetUrl.split('/').pop() || 'Direct Image',
            width: 1000,
            height: 1000,
            source: 'direct-link',
          },
        ],
      });
    }

    const html = await pageRes.text();
    const seen = new Set();
    const images = [];

    const addImage = (rawSrc, label = '') => {
      if (!rawSrc || images.length >= count) return;
      const cleaned = rawSrc.replace(/&amp;/g, '&').trim();
      if (cleaned.startsWith('data:') || cleaned.endsWith('.svg')) return;
      try {
        const abs = new URL(cleaned, pageRes.url || targetUrl).toString();
        if (!/^https?:\/\//i.test(abs) || seen.has(abs)) return;
        if (/(favicon|logo|icon|avatar|badge|pixel|tracker|spinner|1x1|sprite|emoji)/i.test(abs)) {
          return;
        }
        seen.add(abs);
        images.push({
          id: `page-${Date.now()}-${images.length}-${Math.random().toString(36).slice(2, 6)}`,
          url: abs,
          pageUrl: pageRes.url || targetUrl,
          thumbnail: abs,
          title: label || `Reference ${images.length + 1}`,
          width: 900,
          height: 900,
          source: 'web-link',
        });
      } catch {
        // ignore invalid URLs
      }
    };

    // 1. OpenGraph / Twitter card hero images
    const metaRegex =
      /<meta[^>]+(?:property|name)=["'](?:og:image|og:image:secure_url|twitter:image)["'][^>]+content=["']([^"']+)["']/gi;
    let m;
    while ((m = metaRegex.exec(html)) !== null) {
      addImage(m[1], 'Featured Image');
    }

    // 2. <img src / data-src / data-lazy-src> tags
    const imgTagRegex = /<img[^>]+(?:data-src|data-lazy-src|data-original|src)=["']([^"']+)["'][^>]*>/gi;
    while ((m = imgTagRegex.exec(html)) !== null && images.length < count) {
      addImage(m[1]);
    }

    // 3. Direct high-res image URLs embedded in page scripts/JSON
    const rawImgRegex = /https?:\/\/[^"'\s<>\\]+\.(?:jpg|jpeg|png|webp|gif)(?:\?[^"'\s<>\\]*)?/gi;
    while ((m = rawImgRegex.exec(html)) !== null && images.length < count) {
      addImage(m[0]);
    }

    if (isRandom) shuffleInPlace(images);

    return res.json({
      url: targetUrl,
      provider: 'web-link',
      count: images.length,
      images,
    });
  } catch (err) {
    return res.status(502).json({ error: err.message || 'Failed to extract images from link' });
  }
});

/**
 * Resolve a video URL (direct .mp4/.webm/.mov or page with embedded video stream).
 */
app.get('/api/video-resolve', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const targetUrl = String(req.query.url || '').trim();
  if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
    return res.status(400).json({ error: 'Please enter a valid http(s) video URL.' });
  }

  if (/\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i.test(targetUrl)) {
    return res.json({ videoUrl: targetUrl, pageUrl: targetUrl });
  }

  try {
    const headRes = await fetch(targetUrl, {
      method: 'HEAD',
      headers: { 'User-Agent': BROWSER_UA },
    });
    const ct = headRes.headers.get('content-type') || '';
    if (ct.startsWith('video/')) {
      return res.json({ videoUrl: targetUrl, pageUrl: targetUrl });
    }
  } catch {
    // Fall through to HTML inspection
  }

  try {
    const pageRes = await fetch(targetUrl, {
      headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html,*/*' },
    });
    const ct = pageRes.headers.get('content-type') || '';
    if (ct.startsWith('video/')) {
      return res.json({ videoUrl: targetUrl, pageUrl: targetUrl });
    }
    const html = await pageRes.text();
    const ogMatch =
      html.match(/<meta[^>]+property=["']og:video(?::secure_url|:url)?["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:video(?::secure_url|:url)?["']/i);
    const srcMatch = html.match(/<(?:video|source)[^>]+src=["']([^"']+\.(?:mp4|webm|mov|m4v)(?:[^"']*)?)["']/i);
    const rawMatch = html.match(/https?:\/\/[^"'\s<>]+\.(?:mp4|webm|mov)(?:\?[^"'\s<>]*)?/i);

    const found = ogMatch?.[1] || srcMatch?.[1] || rawMatch?.[0];
    if (found && /\.(mp4|webm|mov|m4v)/i.test(found)) {
      const resolved = new URL(found, targetUrl).toString();
      return res.json({ videoUrl: resolved, pageUrl: targetUrl });
    }

    return res.status(422).json({
      error:
        'Could not find a direct video stream (.mp4/.webm/.mov) on that page. Paste a direct video file URL or choose a local video file.',
    });
  } catch {
    return res.status(502).json({ error: 'Failed to inspect video URL.' });
  }
});

/**
 * In-memory video stream proxy with Range support (zero disk storage).
 */
app.get('/api/video-proxy', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const targetUrl = String(req.query.url || '').trim();
  const refParam = String(req.query.ref || '').trim();
  if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
    return res.status(400).send('Invalid URL');
  }

  let referer = '';
  try {
    referer = refParam && /^https?:\/\//i.test(refParam)
      ? new URL(refParam).origin + '/'
      : new URL(targetUrl).origin + '/';
  } catch {
    referer = '';
  }

  try {
    const headers = {
      'User-Agent': BROWSER_UA,
      Accept: '*/*',
      ...(referer ? { Referer: referer } : {}),
    };
    if (req.headers.range) {
      headers.Range = String(req.headers.range);
    }

    const upstream = await fetch(targetUrl, { headers });
    if (!upstream.ok && upstream.status !== 206) {
      return res.status(upstream.status).send('Upstream video error');
    }

    res.status(upstream.status);
    res.setHeader('Access-Control-Allow-Origin', '*');
    const passHeaders = ['content-type', 'content-length', 'content-range', 'accept-ranges'];
    for (const h of passHeaders) {
      const val = upstream.headers.get(h);
      if (val) res.setHeader(h, val);
    }
    if (!upstream.headers.get('content-type')) {
      res.setHeader('Content-Type', 'video/mp4');
    }

    if (upstream.body) {
      Readable.fromWeb(upstream.body).pipe(res);
    } else {
      res.end();
    }
  } catch {
    return res.status(502).send('Failed to stream video');
  }
});

// Serve built frontend in production (when dist/ exists)
const distDir = path.resolve(currentDir, '../dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

function getLanIPs() {
  const ips = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        ips.push(net.address);
      }
    }
  }
  return ips;
}

function startServer(port) {
  const server = app.listen(port, '0.0.0.0', () => {
    const localUrl = `http://localhost:${port}`;
    console.log(`\nRefStudio running (in-memory only, zero disk storage):`);
    console.log(`  Local:   ${localUrl}`);
    for (const ip of getLanIPs()) {
      console.log(`  Mobile:  http://${ip}:${port}  (open on your phone on the same Wi-Fi)`);
    }
    console.log('');

    if (process.pkg) {
      const opener =
        process.platform === 'win32'
          ? `start "" "${localUrl}"`
          : process.platform === 'darwin'
          ? `open "${localUrl}"`
          : `xdg-open "${localUrl}"`;
      exec(opener);
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && !process.env.PORT && port < BASE_PORT + 15) {
      startServer(port + 1);
    } else {
      console.error('Server error:', err);
      process.exit(1);
    }
  });
}

startServer(BASE_PORT);
