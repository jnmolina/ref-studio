import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  CropRect,
  DrawElement,
  DrawTool,
  GifMode,
  GoldenSite,
  GridSettings,
  MoveTarget,
  OnionSkinSettings,
  Point,
  RefImage,
  TransformSettings,
} from './types';
import { TopBar } from './components/TopBar';
import { ToolSidebar } from './components/ToolSidebar';
import { RightInspector } from './components/RightInspector';
import { CanvasStage } from './components/CanvasStage';
import { TimelineBar } from './components/TimelineBar';
import { ArchiveDrawer } from './components/ArchiveDrawer';
import { GoldenListModal } from './components/GoldenListModal';
import {
  downloadAllAsZip,
  downloadCanvasComposite,
  downloadSingleImage,
} from './utils/exportUtils';
import {
  decodeSessionFromHash,
  encodeSessionToHash,
  exportSessionFile,
  ShareableSession,
} from './utils/sessionShare';
import { extractGifFrames } from './utils/gifExtractor';
import {
  extractVideoFrames,
  resolveVideoSource,
  ScreenRecorderHandle,
  startScreenCapture,
} from './utils/videoExtractor';

const DEFAULT_TRANSFORM: TransformSettings = {
  zoom: 1,
  panX: 0,
  panY: 0,
  rotate: 0,
  flipH: false,
  flipV: false,
  skewX: 0,
  skewY: 0,
  tiltX: 0,
  tiltY: 0,
};

const DEFAULT_CROP: CropRect = { top: 0, right: 0, bottom: 0, left: 0 };

export function App() {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [provider, setProvider] = useState('');

  // Ephemeral session images (never stored on disk)
  const [images, setImages] = useState<RefImage[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Slideshow timer (30s to 300s)
  const [intervalSec, setIntervalSec] = useState(60);
  const [timeRemainingSec, setTimeRemainingSec] = useState(60);
  const [isPlaying, setIsPlaying] = useState(false);

  // Optional Google CSE creds in memory
  const [googleApiKey, setGoogleApiKey] = useState('');
  const [googleCx, setGoogleCx] = useState('');
  const [safeSearch, setSafeSearch] = useState(true);
  const [gifMode, setGifMode] = useState<GifMode>('exclude');

  // Drawover state per image id
  const [activeTool, setActiveTool] = useState<DrawTool>('pen');
  const [color, setColor] = useState('#ff4d4f');
  const [brushSize, setBrushSize] = useState(3);
  const [drawingsByFrame, setDrawingsByFrame] = useState<Record<string, DrawElement[]>>({});

  // Visual study controls
  const [imageOpacity, setImageOpacity] = useState(1);
  const [drawOpacity, setDrawOpacity] = useState(1);
  const [bwMode, setBwMode] = useState(false);
  const [contrast, setContrast] = useState(100);
  const [grid, setGrid] = useState<GridSettings>({
    enabled: false,
    divisions: 6,
    opacity: 0.35,
    color: '#38bdf8',
  });
  const [onion, setOnion] = useState<OnionSkinSettings>({
    showBefore: false,
    showAfter: false,
    opacity: 0.3,
    tinted: true,
  });
  const [transform, setTransform] = useState<TransformSettings>(DEFAULT_TRANSFORM);
  const [moveTarget, setMoveTarget] = useState<MoveTarget>('main');
  const [frameOffsets, setFrameOffsets] = useState<Record<string, Point>>({});
  const [crop, setCrop] = useState<CropRect>(DEFAULT_CROP);

  // UI drawers & export
  const [showArchive, setShowArchive] = useState(false);
  const [exportProgress, setExportProgress] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [pendingSearchTerm, setPendingSearchTerm] = useState<string | null>(null);
  const [gifExtractProgress, setGifExtractProgress] = useState<string | null>(null);
  const [motionFps, setMotionFps] = useState<number | null>(null);
  const [extremeIds, setExtremeIds] = useState<Record<string, boolean>>({});
  const [extremesOnly, setExtremesOnly] = useState(false);

  // Video Motion Study modal
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [videoUrlInput, setVideoUrlInput] = useState('');
  const [videoFps, setVideoFps] = useState(8);
  const [videoMaxFrames, setVideoMaxFrames] = useState(150);
  const [videoProgress, setVideoProgress] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [isRecordingScreen, setIsRecordingScreen] = useState(false);
  const screenRecorderRef = useRef<ScreenRecorderHandle | null>(null);

  // URL-only thumbs up/down preferences (no image files stored)
  const [likedUrls, setLikedUrls] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem('refstudio_liked_urls') || '{}');
    } catch {
      return {};
    }
  });
  const [dislikedUrls, setDislikedUrls] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem('refstudio_disliked_urls') || '{}');
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('refstudio_liked_urls', JSON.stringify(likedUrls));
    } catch {
      // ignore storage quota errors
    }
  }, [likedUrls]);

  useEffect(() => {
    try {
      localStorage.setItem('refstudio_disliked_urls', JSON.stringify(dislikedUrls));
    } catch {
      // ignore storage quota errors
    }
  }, [dislikedUrls]);

  // Golden List of favorite reference sites (URL/domain list only)
  const [goldenSites, setGoldenSites] = useState<GoldenSite[]>(() => {
    try {
      const saved = localStorage.getItem('refstudio_golden_sites');
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return [
      { id: 'gs-1', name: 'Line of Action', domain: 'line-of-action.com', group: 'Poses & Anatomy' },
      { id: 'gs-2', name: 'QuickPoses', domain: 'quickposes.com', group: 'Poses & Anatomy' },
      { id: 'gs-3', name: 'Pinterest', domain: 'pinterest.com', group: 'General Reference' },
      { id: 'gs-4', name: 'Wikimedia Commons', domain: 'commons.wikimedia.org', group: 'Open Archive' },
    ];
  });
  const [searchScope, setSearchScope] = useState<string>('all');
  const [showGoldenModal, setShowGoldenModal] = useState(false);
  const [showInspector, setShowInspector] = useState(true);

  useEffect(() => {
    try {
      localStorage.setItem('refstudio_golden_sites', JSON.stringify(goldenSites));
    } catch {
      // ignore
    }
  }, [goldenSites]);

  const stageRef = useRef<HTMLDivElement>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);

  const extremeIndices = images
    .map((img, i) => (extremeIds[img.id] ? i : -1))
    .filter((i) => i !== -1);

  const currentImage = images[currentIndex] || null;
  const prevImage = (() => {
    if (extremesOnly && extremeIndices.length > 0) {
      const prevExt = [...extremeIndices].reverse().find((i) => i < currentIndex);
      return prevExt !== undefined ? images[prevExt] : null;
    }
    return currentIndex > 0 ? images[currentIndex - 1] : null;
  })();
  const nextImage = (() => {
    if (extremesOnly && extremeIndices.length > 0) {
      const nextExt = extremeIndices.find((i) => i > currentIndex);
      return nextExt !== undefined ? images[nextExt] : null;
    }
    return currentIndex < images.length - 1 ? images[currentIndex + 1] : null;
  })();

  const executeSearch = useCallback(
    async (searchTerm: string, mode: 'replace' | 'append') => {
      setIsSearching(true);
      setSearchError(null);
      try {
        const headers: Record<string, string> = {};
        if (googleApiKey && googleCx) {
          headers['x-google-api-key'] = googleApiKey;
          headers['x-google-cx'] = googleCx;
        }
        const isPinterest = /^https?:\/\/(www\.)?(pinterest\.[a-z.]+|pin\.it)\//i.test(searchTerm);

        let res: Response;
        if (isPinterest) {
          res = await fetch(`/api/pinterest?url=${encodeURIComponent(searchTerm)}&count=60`);
        } else {
          let scopedSites: string[] = [];
          if (searchScope === 'golden-all') {
            scopedSites = goldenSites.map((s) => s.domain);
          } else if (searchScope.startsWith('group:')) {
            const grp = searchScope.slice(6);
            scopedSites = goldenSites
              .filter((s) => (s.group || 'General') === grp)
              .map((s) => s.domain);
          } else if (searchScope.startsWith('site:')) {
            scopedSites = [searchScope.slice(5)];
          }
          const sitesParam = scopedSites.length > 0 ? `&sites=${encodeURIComponent(scopedSites.join(','))}` : '';

          res = await fetch(
            `/api/search?q=${encodeURIComponent(searchTerm)}&count=40&safe=${safeSearch}&gifs=${gifMode}${sitesParam}`,
            { headers }
          );
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Search failed');

        if (!data.images || data.images.length === 0) {
          setSearchError(`No images found for "${searchTerm}". Try a different theme.`);
          return;
        }

        const existingUrls = mode === 'append' ? new Set(images.map((img) => img.url)) : new Set<string>();
        const seenBatch = new Set<string>();
        const stamped: RefImage[] = [];

        for (const img of data.images as RefImage[]) {
          if (dislikedUrls[img.url]) continue;
          if (existingUrls.has(img.url) || seenBatch.has(img.url)) continue;
          seenBatch.add(img.url);
          stamped.push({ ...img, addedAt: Date.now() });
        }

        if (stamped.length === 0) {
          setSearchError(`No new images for "${searchTerm}" (all results were already in your session or hidden).`);
          return;
        }

        if (mode === 'replace') {
          setImages(stamped);
          setCurrentIndex(0);
          setDrawingsByFrame({});
          setFrameOffsets({});
          setExtremeIds({});
          setExtremesOnly(false);
        } else {
          setImages((prev) => {
            const startIdx = prev.length;
            setCurrentIndex(startIdx);
            return [...prev, ...stamped];
          });
        }

        setProvider(data.provider || 'google');
        setTimeRemainingSec(intervalSec);
        setIsPlaying(true);
      } catch (err: any) {
        setSearchError(err.message || 'Failed to search images');
      } finally {
        setIsSearching(false);
      }
    },
    [googleApiKey, googleCx, intervalSec, safeSearch, gifMode, images, dislikedUrls, searchScope, goldenSites]
  );

  const handleSearch = useCallback(
    (searchTerm: string) => {
      if (/^https?:\/\/.+\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i.test(searchTerm)) {
        setVideoUrlInput(searchTerm);
        setVideoError(null);
        setShowVideoModal(true);
        return;
      }
      if (images.length > 0) {
        setPendingSearchTerm(searchTerm);
      } else {
        executeSearch(searchTerm, 'replace');
      }
    },
    [images.length, executeSearch]
  );

  const goToIndex = useCallback(
    (idx: number) => {
      if (images.length === 0) return;
      const clamped = (idx + images.length) % images.length;
      setCurrentIndex(clamped);
      setTimeRemainingSec(intervalSec);
    },
    [images.length, intervalSec]
  );

  const flipExtreme = useCallback(
    (dir: -1 | 1) => {
      if (extremeIndices.length === 0) return;
      if (dir === 1) {
        const nextExt = extremeIndices.find((i) => i > currentIndex);
        goToIndex(nextExt !== undefined ? nextExt : extremeIndices[0]);
      } else {
        const prevExt = [...extremeIndices].reverse().find((i) => i < currentIndex);
        goToIndex(prevExt !== undefined ? prevExt : extremeIndices[extremeIndices.length - 1]);
      }
    },
    [extremeIndices, currentIndex, goToIndex]
  );

  const stepFrame = useCallback(
    (dir: -1 | 1) => {
      if (extremesOnly && extremeIndices.length > 0) {
        flipExtreme(dir);
      } else {
        goToIndex(currentIndex + dir);
      }
    },
    [extremesOnly, extremeIndices.length, flipExtreme, goToIndex, currentIndex]
  );

  const toggleExtreme = useCallback((id: string) => {
    setExtremeIds((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      if (!next[id]) delete next[id];
      return next;
    });
  }, []);

  const handleNext = useCallback(() => stepFrame(1), [stepFrame]);
  const handlePrev = useCallback(() => stepFrame(-1), [stepFrame]);

  // Slideshow countdown
  useEffect(() => {
    if (!isPlaying || images.length === 0) return;
    const timer = setInterval(() => {
      setTimeRemainingSec((prev) => {
        if (prev <= 1) {
          setCurrentIndex((idx) => (idx + 1) % images.length);
          return intervalSec;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isPlaying, images.length, intervalSec]);

  // High-speed motion study loop (8 / 12 / 24 fps)
  useEffect(() => {
    if (!motionFps || images.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex((idx) => {
        if (extremesOnly && extremeIndices.length > 0) {
          const nextExt = extremeIndices.find((i) => i > idx);
          return nextExt !== undefined ? nextExt : extremeIndices[0];
        }
        return (idx + 1) % images.length;
      });
    }, Math.round(1000 / motionFps));
    return () => clearInterval(timer);
  }, [motionFps, images.length, extremesOnly, extremeIndices]);

  const handleIntervalChange = (sec: number) => {
    setIntervalSec(sec);
    setTimeRemainingSec(sec);
  };

  const currentElements = currentImage ? drawingsByFrame[currentImage.id] || [] : [];

  const handleAddElement = (el: DrawElement) => {
    if (!currentImage) return;
    setDrawingsByFrame((prev) => ({
      ...prev,
      [currentImage.id]: [...(prev[currentImage.id] || []), el],
    }));
  };

  const handleUndo = useCallback(() => {
    if (!currentImage) return;
    setDrawingsByFrame((prev) => {
      const list = prev[currentImage.id] || [];
      if (list.length === 0) return prev;
      return {
        ...prev,
        [currentImage.id]: list.slice(0, -1),
      };
    });
  }, [currentImage]);

  const handleClearDrawover = () => {
    if (!currentImage) return;
    setDrawingsByFrame((prev) => ({ ...prev, [currentImage.id]: [] }));
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((p) => !p);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
      } else if (e.key.toLowerCase() === 'k') {
        if (currentImage) toggleExtreme(currentImage.id);
      } else if (e.key === '[') {
        e.preventDefault();
        flipExtreme(-1);
      } else if (e.key === ']') {
        e.preventDefault();
        flipExtreme(1);
      } else if (e.key.toLowerCase() === 'v') setActiveTool('pan');
      else if (e.key.toLowerCase() === 'b') setActiveTool('pen');
      else if (e.key.toLowerCase() === 'e') setActiveTool('eraser');
      else if (e.key.toLowerCase() === 'l') setActiveTool('line');
      else if (e.key.toLowerCase() === 'a') setActiveTool('arrow');
      else if (e.key.toLowerCase() === 'r') setActiveTool('rect');
      else if (e.key.toLowerCase() === 'c') setActiveTool('circle');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleNext, handlePrev, handleUndo, currentImage, toggleExtreme, flipExtreme]);

  const handleExportOriginal = async () => {
    if (!currentImage) return;
    try {
      setExportProgress('Downloading...');
      await downloadSingleImage(currentImage, currentIndex);
    } finally {
      setExportProgress(null);
    }
  };

  const handleExportComposite = async () => {
    if (!currentImage) return;
    try {
      setExportProgress('Rendering PNG...');
      await downloadCanvasComposite(
        stageRef.current,
        drawCanvasRef.current,
        currentImage,
        currentIndex,
        { bwMode, contrast, imageOpacity, drawOpacity }
      );
    } finally {
      setExportProgress(null);
    }
  };

  const handleExportAllZip = async () => {
    if (images.length === 0) return;
    try {
      setExportProgress(`Zipping 0/${images.length}`);
      await downloadAllAsZip(images, (done, total) => {
        setExportProgress(`Zipping ${done}/${total}`);
      });
    } finally {
      setExportProgress(null);
    }
  };

  const applySharedSession = useCallback((session: ShareableSession) => {
    setImages(session.images);
    setCurrentIndex(Math.min(Math.max(0, session.currentIndex || 0), Math.max(0, session.images.length - 1)));
    setIntervalSec(session.intervalSec || 60);
    setTimeRemainingSec(session.intervalSec || 60);
    setDrawingsByFrame(session.drawingsByFrame || {});
    setBwMode(Boolean(session.bwMode));
    setContrast(session.contrast || 100);
    if (session.grid) setGrid(session.grid);
    if (session.onion) setOnion(session.onion);
    if (session.query) setQuery(session.query);
    setIsPlaying(false);
    setProvider('shared');
  }, []);

  useEffect(() => {
    if (window.location.hash.startsWith('#s=')) {
      decodeSessionFromHash(window.location.hash).then((session) => {
        if (session && session.images.length > 0) {
          applySharedSession(session);
        }
      });
    }
  }, [applySharedSession]);

  const buildSessionPayload = (): ShareableSession => ({
    v: 1,
    query,
    images,
    currentIndex,
    intervalSec,
    drawingsByFrame,
    bwMode,
    contrast,
    grid,
    onion,
  });

  const handleCopyShareLink = async () => {
    if (images.length === 0) return;
    const hash = await encodeSessionToHash(buildSessionPayload());
    const shareUrl = `${window.location.origin}${window.location.pathname}${hash}`;
    window.history.replaceState(null, '', hash);
    await navigator.clipboard.writeText(shareUrl);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  };

  const handleExportSessionFile = () => {
    if (images.length === 0) return;
    exportSessionFile(buildSessionPayload());
  };

  const handleImportSessionFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (parsed && parsed.v === 1 && Array.isArray(parsed.images)) {
        applySharedSession(parsed as ShareableSession);
      } else {
        setSearchError('Invalid RefStudio session file.');
      }
    } catch {
      setSearchError('Could not read session file.');
    }
  };

  const handleRemoveImage = (id: string) => {
    setImages((prev) => {
      const next = prev.filter((img) => img.id !== id);
      if (currentIndex >= next.length) {
        setCurrentIndex(Math.max(0, next.length - 1));
      }
      return next;
    });
  };

  const handleThumbsUp = () => {
    if (!currentImage) return;
    const url = currentImage.url;
    setLikedUrls((prev) => {
      const next = { ...prev, [url]: !prev[url] };
      if (!next[url]) delete next[url];
      return next;
    });
    setDislikedUrls((prev) => {
      if (!prev[url]) return prev;
      const next = { ...prev };
      delete next[url];
      return next;
    });
  };

  const handleThumbsDown = () => {
    if (!currentImage) return;
    const { id, url } = currentImage;
    setDislikedUrls((prev) => ({ ...prev, [url]: true }));
    setLikedUrls((prev) => {
      if (!prev[url]) return prev;
      const next = { ...prev };
      delete next[url];
      return next;
    });
    handleRemoveImage(id);
    setTimeRemainingSec(intervalSec);
  };

  const handleUnpackGif = async (replaceTimeline: boolean = true) => {
    if (!currentImage || gifExtractProgress) return;
    try {
      setIsPlaying(false);
      setMotionFps(null);
      setGifExtractProgress('Decoding GIF...');
      const result = await extractGifFrames(currentImage, (done, total) => {
        setGifExtractProgress(`Frame ${done}/${total}`);
      });
      if (result.frames.length > 0) {
        if (replaceTimeline) {
          setImages(result.frames);
          setCurrentIndex(0);
          setDrawingsByFrame({});
          setFrameOffsets({});
          setExtremeIds({});
          setExtremesOnly(false);
        } else {
          setImages((prev) => [
            ...prev.slice(0, currentIndex),
            ...result.frames,
            ...prev.slice(currentIndex + 1),
          ]);
        }
      }
    } catch (err: any) {
      setSearchError(err?.message || 'Failed to decode GIF frames');
    } finally {
      setGifExtractProgress(null);
    }
  };

  const applyVideoFrames = (frames: RefImage[], replaceTimeline: boolean) => {
    setIsPlaying(false);
    setMotionFps(null);
    if (replaceTimeline) {
      setImages(frames);
      setCurrentIndex(0);
      setDrawingsByFrame({});
      setFrameOffsets({});
      setExtremeIds({});
      setExtremesOnly(false);
    } else {
      setImages((prev) => {
        const startIdx = prev.length;
        setCurrentIndex(startIdx);
        return [...prev, ...frames];
      });
    }
    setProvider('video');
    setShowVideoModal(false);
  };

  const handleLoadVideoUrl = async (replaceTimeline: boolean) => {
    const trimmed = videoUrlInput.trim();
    if (!trimmed || videoProgress) return;
    setVideoError(null);
    try {
      setVideoProgress('Resolving video...');
      const { proxiedUrl, pageUrl, title } = await resolveVideoSource(trimmed);
      setVideoProgress('Extracting frames...');
      const frames = await extractVideoFrames(proxiedUrl, title, pageUrl, {
        fps: videoFps,
        maxFrames: videoMaxFrames,
        onProgress: (done, total) => setVideoProgress(`Frame ${done}/${total}`),
      });
      if (frames.length === 0) throw new Error('No frames extracted from video.');
      applyVideoFrames(frames, replaceTimeline);
    } catch (err: any) {
      setVideoError(err?.message || 'Failed to extract video frames.');
    } finally {
      setVideoProgress(null);
    }
  };

  const handleLoadVideoFile = async (file: File, replaceTimeline: boolean) => {
    if (videoProgress) return;
    setVideoError(null);
    const objectUrl = URL.createObjectURL(file);
    try {
      setVideoProgress('Extracting frames...');
      const frames = await extractVideoFrames(objectUrl, file.name, undefined, {
        fps: videoFps,
        maxFrames: videoMaxFrames,
        onProgress: (done, total) => setVideoProgress(`Frame ${done}/${total}`),
      });
      if (frames.length === 0) throw new Error('No frames extracted from video.');
      applyVideoFrames(frames, replaceTimeline);
    } catch (err: any) {
      setVideoError(err?.message || 'Failed to extract frames from local video.');
    } finally {
      URL.revokeObjectURL(objectUrl);
      setVideoProgress(null);
    }
  };

  const handleStartScreenRecord = async () => {
    if (videoProgress || isRecordingScreen) return;
    setVideoError(null);
    try {
      const handle = await startScreenCapture();
      screenRecorderRef.current = handle;
      setIsRecordingScreen(true);

      const blob = await handle.promise;
      setIsRecordingScreen(false);
      screenRecorderRef.current = null;

      if (blob.size === 0) {
        setVideoError('No video data was recorded.');
        return;
      }

      const objectUrl = URL.createObjectURL(blob);
      try {
        setVideoProgress('Extracting captured frames...');
        const frames = await extractVideoFrames(
          objectUrl,
          'Tab Capture',
          videoUrlInput.trim() || undefined,
          {
            fps: videoFps,
            maxFrames: videoMaxFrames,
            onProgress: (done, total) => setVideoProgress(`Frame ${done}/${total}`),
          }
        );
        if (frames.length === 0) throw new Error('No frames captured.');
        applyVideoFrames(frames, true);
      } finally {
        URL.revokeObjectURL(objectUrl);
        setVideoProgress(null);
      }
    } catch (err: any) {
      setIsRecordingScreen(false);
      screenRecorderRef.current = null;
      setVideoProgress(null);
      if (err?.name !== 'AbortError' && err?.name !== 'NotAllowedError') {
        setVideoError(err?.message || 'Screen capture failed.');
      }
    }
  };

  const handleStopScreenRecord = () => {
    screenRecorderRef.current?.stop();
  };

  return (
    <div className="app-shell">
      <TopBar
        query={query}
        onQueryChange={setQuery}
        onSearch={handleSearch}
        isSearching={isSearching}
        provider={provider}
        totalImages={images.length}
        currentIndex={currentIndex}
        isPlaying={isPlaying}
        onTogglePlay={() => setIsPlaying((p) => !p)}
        onPrev={handlePrev}
        onNext={handleNext}
        intervalSec={intervalSec}
        onIntervalChange={handleIntervalChange}
        timeRemainingSec={timeRemainingSec}
        showArchive={showArchive}
        onToggleArchive={() => setShowArchive((s) => !s)}
        onExportOriginal={handleExportOriginal}
        onExportComposite={handleExportComposite}
        onExportAllZip={handleExportAllZip}
        onCopyShareLink={handleCopyShareLink}
        shareCopied={shareCopied}
        onExportSessionFile={handleExportSessionFile}
        onImportSessionFile={handleImportSessionFile}
        exportProgress={exportProgress}
        googleApiKey={googleApiKey}
        googleCx={googleCx}
        onSaveGoogleCreds={(k, cx) => {
          setGoogleApiKey(k);
          setGoogleCx(cx);
        }}
        safeSearch={safeSearch}
        onToggleSafeSearch={() => setSafeSearch((s) => !s)}
        gifMode={gifMode}
        onGifModeChange={setGifMode}
        onOpenVideoModal={() => {
          setVideoError(null);
          setShowVideoModal(true);
        }}
        goldenSites={goldenSites}
        searchScope={searchScope}
        onSearchScopeChange={setSearchScope}
        onOpenGoldenList={() => setShowGoldenModal(true)}
        showInspector={showInspector}
        onToggleInspector={() => setShowInspector((s) => !s)}
      />

      {searchError && (
        <div className="error-banner">
          <span>{searchError}</span>
          <button onClick={() => setSearchError(null)}>Dismiss</button>
        </div>
      )}

      <div className="workspace-body">
        <ToolSidebar
          activeTool={activeTool}
          onSelectTool={setActiveTool}
          color={color}
          onColorChange={setColor}
          brushSize={brushSize}
          onBrushSizeChange={setBrushSize}
          canUndo={currentElements.length > 0}
          onUndo={handleUndo}
          onClearDrawover={handleClearDrawover}
        />

        <main className="stage-container">
          <CanvasStage
            currentImage={currentImage}
            prevImage={prevImage}
            nextImage={nextImage}
            activeTool={activeTool}
            color={color}
            brushSize={brushSize}
            elements={currentElements}
            onAddElement={handleAddElement}
            imageOpacity={imageOpacity}
            drawOpacity={drawOpacity}
            bwMode={bwMode}
            contrast={contrast}
            grid={grid}
            onion={onion}
            transform={transform}
            onTransformChange={setTransform}
            moveTarget={moveTarget}
            onMoveTargetChange={setMoveTarget}
            mainOffset={currentImage ? frameOffsets[currentImage.id] || { x: 0, y: 0 } : { x: 0, y: 0 }}
            prevOffset={prevImage ? frameOffsets[prevImage.id] || { x: 0, y: 0 } : { x: 0, y: 0 }}
            nextOffset={nextImage ? frameOffsets[nextImage.id] || { x: 0, y: 0 } : { x: 0, y: 0 }}
            onMainOffsetChange={(pt) => {
              if (!currentImage) return;
              setFrameOffsets((prev) => ({ ...prev, [currentImage.id]: pt }));
            }}
            crop={crop}
            onCropChange={setCrop}
            stageRef={stageRef}
            drawCanvasRef={drawCanvasRef}
            onQuickTheme={(t) => {
              setQuery(t);
              handleSearch(t);
            }}
            onUnpackGif={handleUnpackGif}
            gifExtractProgress={gifExtractProgress}
            isLiked={Boolean(currentImage && likedUrls[currentImage.url])}
            onThumbsUp={handleThumbsUp}
            onThumbsDown={handleThumbsDown}
          />

          <ArchiveDrawer
            isOpen={showArchive}
            onClose={() => setShowArchive(false)}
            images={images}
            currentIndex={currentIndex}
            onSelectIndex={(idx) => {
              goToIndex(idx);
              setShowArchive(false);
            }}
            onDownloadOne={downloadSingleImage}
            onRemoveOne={handleRemoveImage}
            onDownloadAll={handleExportAllZip}
          />
        </main>

        {showInspector && (
          <RightInspector
            imageOpacity={imageOpacity}
            onImageOpacityChange={setImageOpacity}
            drawOpacity={drawOpacity}
            onDrawOpacityChange={setDrawOpacity}
            bwMode={bwMode}
            onToggleBw={() => setBwMode((b) => !b)}
            contrast={contrast}
            onContrastChange={setContrast}
            grid={grid}
            onGridChange={setGrid}
            onion={onion}
            onOnionChange={setOnion}
            transform={transform}
            onTransformChange={setTransform}
            moveTarget={moveTarget}
            onMoveTargetChange={setMoveTarget}
            onResetTransform={() => {
              setTransform(DEFAULT_TRANSFORM);
              setFrameOffsets({});
            }}
            crop={crop}
            onCropChange={setCrop}
            onResetCrop={() => setCrop(DEFAULT_CROP)}
          />
        )}
      </div>

      <TimelineBar
        images={images}
        currentIndex={currentIndex}
        onSelectIndex={(idx) => {
          setMotionFps(null);
          goToIndex(idx);
        }}
        drawingsByFrame={drawingsByFrame}
        motionFps={motionFps}
        onMotionFpsChange={(fps) => {
          if (fps) setIsPlaying(false);
          setMotionFps(fps);
        }}
        onUnpackGif={handleUnpackGif}
        gifExtractProgress={gifExtractProgress}
        extremeIds={extremeIds}
        onToggleExtreme={toggleExtreme}
        extremesOnly={extremesOnly}
        onToggleExtremesOnly={() => setExtremesOnly((e) => !e)}
        onFlipExtreme={flipExtreme}
        onStepFrame={stepFrame}
      />

      {showVideoModal && (
        <div className="modal-backdrop" onClick={() => !videoProgress && setShowVideoModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Video Motion Study</h3>
            </div>
            <p className="modal-desc">
              Paste a direct video URL (<code>.mp4</code>, <code>.webm</code>, <code>.mov</code>) or
              pick a local video file to unpack frames onto the timeline in memory (zero storage).
            </p>
            <label className="field-label">
              Video URL
              <input
                type="url"
                value={videoUrlInput}
                onChange={(e) => setVideoUrlInput(e.target.value)}
                placeholder="https://example.com/motion-reference.mp4"
                className="modal-input"
              />
            </label>

            <div className="btn-grid-2">
              <label className="field-label">
                Sample Rate
                <select
                  className="modal-input"
                  value={videoFps}
                  onChange={(e) => setVideoFps(Number(e.target.value))}
                >
                  <option value={4}>4 fps (sparse)</option>
                  <option value={8}>8 fps (animation study)</option>
                  <option value={12}>12 fps (on twos)</option>
                  <option value={24}>24 fps (smooth)</option>
                </select>
              </label>

              <label className="field-label">
                Max Frames
                <select
                  className="modal-input"
                  value={videoMaxFrames}
                  onChange={(e) => setVideoMaxFrames(Number(e.target.value))}
                >
                  <option value={60}>60 frames</option>
                  <option value={150}>150 frames</option>
                  <option value={300}>300 frames</option>
                </select>
              </label>
            </div>

            <label className="btn btn-ghost btn-sm" style={{ justifyContent: 'center' }}>
              <span>Or Choose Local Video File (.mp4 / .webm / .mov)</span>
              <input
                type="file"
                accept="video/*"
                style={{ display: 'none' }}
                disabled={Boolean(videoProgress) || isRecordingScreen}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleLoadVideoFile(file, true);
                  e.target.value = '';
                }}
              />
            </label>

            {isRecordingScreen ? (
              <button
                type="button"
                className="btn btn-nsfw btn-sm"
                style={{ justifyContent: 'center' }}
                onClick={handleStopScreenRecord}
              >
                Recording Tab/Screen... Click to Stop &amp; Unpack Frames
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-accent btn-sm"
                style={{ justifyContent: 'center' }}
                disabled={Boolean(videoProgress)}
                onClick={handleStartScreenRecord}
              >
                Record Browser Tab / Screen (for YouTube Shorts, etc.)
              </button>
            )}

            {videoError && <div className="modal-error">{videoError}</div>}

            <div className="modal-actions">
              <button
                className="btn btn-ghost"
                disabled={Boolean(videoProgress)}
                onClick={() => setShowVideoModal(false)}
              >
                Cancel
              </button>
              {images.length > 0 && (
                <button
                  className="btn btn-ghost"
                  disabled={!videoUrlInput.trim() || Boolean(videoProgress)}
                  onClick={() => handleLoadVideoUrl(false)}
                >
                  Append
                </button>
              )}
              <button
                className="btn btn-primary"
                disabled={!videoUrlInput.trim() || Boolean(videoProgress)}
                onClick={() => handleLoadVideoUrl(true)}
              >
                {videoProgress || 'Make Main Timeline'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingSearchTerm && (
        <div className="modal-backdrop" onClick={() => setPendingSearchTerm(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>New Search: &ldquo;{pendingSearchTerm}&rdquo;</h3>
            </div>
            <p className="modal-desc">
              You currently have <strong>{images.length}</strong> image{images.length === 1 ? '' : 's'} in
              your session. Would you like to replace them or append the new search results?
            </p>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setPendingSearchTerm(null)}>
                Cancel
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  const term = pendingSearchTerm;
                  setPendingSearchTerm(null);
                  executeSearch(term, 'append');
                }}
              >
                Append to Session
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  const term = pendingSearchTerm;
                  setPendingSearchTerm(null);
                  executeSearch(term, 'replace');
                }}
              >
                Replace Session
              </button>
            </div>
          </div>
        </div>
      )}
      <GoldenListModal
        isOpen={showGoldenModal}
        onClose={() => setShowGoldenModal(false)}
        sites={goldenSites}
        onSaveSites={setGoldenSites}
        activeScope={searchScope}
        onSelectScope={setSearchScope}
      />
    </div>
  );
}

export default App;
