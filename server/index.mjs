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
    const isGif = GIF_URL_RE.test(u);
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
 * DuckDuckGo Images fallback (in-memory only, no storage).
 */
async function searchDuckDuckGoImages(query, count = 45, safeSearch = true) {
  const kp = safeSearch ? '1' : '-2';
  const p = safeSearch ? '1' : '-1';
  const pageRes = await fetch(`https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images&kp=${kp}`, {
    headers: { 'User-Agent': BROWSER_UA },
  });
  const html = await pageRes.text();
  const vqdMatch = html.match(/vqd=([\d-]+)/) || html.match(/vqd="([^"]+)"/);
  if (!vqdMatch) return [];

  const vqd = vqdMatch[1];
  const apiRes = await fetch(
    `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(query)}&vqd=${encodeURIComponent(vqd)}&f=,,,&p=${p}`,
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
      try {
        rawImages = await searchGoogleImagesHTML(effectiveQuery, fetchLimit, safeSearch);
      } catch (err) {
        console.warn('Google HTML search failed, trying fallback:', err.message);
      }

      if (rawImages.length === 0) {
        try {
          rawImages = await searchDuckDuckGoImages(effectiveQuery, fetchLimit, safeSearch);
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

    let images = filterAndRankImages(rawImages, { gifMode, minDim: 480 });
    if (images.length < 3 && rawImages.length > 0) {
      images = filterAndRankImages(rawImages, { gifMode, minDim: 300 });
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
 * Extract public pins from a Pinterest board or pin URL (in-memory only, zero storage).
 */
app.get('/api/pinterest', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const boardUrl = String(req.query.url || '').trim();
  const count = Math.min(parseInt(String(req.query.count || '40'), 10) || 40, 80);

  if (!boardUrl || !/^https?:\/\/(www\.)?(pinterest\.[a-z.]+|pin\.it)\//i.test(boardUrl)) {
    return res.status(400).json({ error: 'Please enter a valid Pinterest board or pin URL.' });
  }

  try {
    const pageRes = await fetch(boardUrl, {
      redirect: 'follow',
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!pageRes.ok) {
      return res.status(pageRes.status).json({ error: `Pinterest returned HTTP ${pageRes.status}` });
    }

    const html = await pageRes.text();
    const seenKeys = new Set();
    const images = [];

    const addPin = (imgUrl, title = '', pinId = '') => {
      if (!imgUrl || !/^https?:\/\//i.test(imgUrl)) return;
      // Deduplicate by pinimg hash path
      const keyMatch = imgUrl.match(/\/([a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]+\.[a-z]+)/i);
      const key = keyMatch ? keyMatch[1] : imgUrl;
      if (seenKeys.has(key)) return;
      seenKeys.add(key);

      // Prefer 736x or originals over tiny 236x thumbnails
      const hiResUrl = imgUrl.replace(/\/(75x75_RS|136x136|170x|236x|474x)\//i, '/736x/');
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

    // 1. Try parsing __PWS_DATA__ JSON embedded in the page
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
        // Fallback to regex extraction below
      }
    }

    // 2. Regex fallback for pinimg URLs in HTML/JSON scripts
    if (images.length < count) {
      const pinRegex = /https:\/\/i\.pinimg\.com\/(?:originals|736x|564x|474x|236x)\/[a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]+\.(?:jpg|jpeg|png|webp)/gi;
      let m;
      while ((m = pinRegex.exec(html)) !== null && images.length < count) {
        addPin(m[0]);
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
