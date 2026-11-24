import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ExternalLink, ThumbsUp, ThumbsDown } from 'lucide-react';
import {
  CropRect,
  DrawElement,
  DrawTool,
  GridSettings,
  MoveTarget,
  OnionSkinSettings,
  Point,
  RefImage,
  TransformSettings,
} from '../types';
import { getImageFallbackChain, getProxiedUrl } from '../utils/exportUtils';

interface CanvasStageProps {
  currentImage: RefImage | null;
  prevImage: RefImage | null;
  nextImage: RefImage | null;
  activeTool: DrawTool;
  color: string;
  brushSize: number;
  elements: DrawElement[];
  onAddElement: (el: DrawElement) => void;
  imageOpacity: number;
  drawOpacity: number;
  bwMode: boolean;
  contrast: number;
  grid: GridSettings;
  onion: OnionSkinSettings;
  transform: TransformSettings;
  onTransformChange: (t: TransformSettings) => void;
  moveTarget: MoveTarget;
  onMoveTargetChange: (m: MoveTarget) => void;
  mainOffset: Point;
  prevOffset: Point;
  nextOffset: Point;
  onMainOffsetChange: (p: Point) => void;
  crop: CropRect;
  onCropChange: (c: CropRect) => void;
  stageRef: React.RefObject<HTMLDivElement | null>;
  drawCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  onQuickTheme: (theme: string) => void;
  onUnpackGif: (replaceTimeline: boolean) => void;
  gifExtractProgress: string | null;
  isLiked: boolean;
  onThumbsUp: () => void;
  onThumbsDown: () => void;
}

const QUICK_THEMES = [
  'dynamic figure drawing pose',
  'hand anatomy reference',
  'martial arts action pose',
  'horse galloping motion',
  'portrait chiaroscuro lighting',
];

function renderElement(ctx: CanvasRenderingContext2D, el: DrawElement) {
  if (el.points.length === 0) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = el.size;

  if (el.tool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = el.color;
  }

  const start = el.points[0];
  const end = el.points[el.points.length - 1];

  if (el.tool === 'pen' || el.tool === 'eraser') {
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    for (let i = 1; i < el.points.length; i++) {
      ctx.lineTo(el.points[i].x, el.points[i].y);
    }
    ctx.stroke();
  } else if (el.tool === 'line') {
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  } else if (el.tool === 'arrow') {
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const headLen = Math.max(10, el.size * 3.2);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.lineTo(end.x - headLen * Math.cos(angle - Math.PI / 6), end.y - headLen * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(end.x - headLen * Math.cos(angle + Math.PI / 6), end.y - headLen * Math.sin(angle + Math.PI / 6));
    ctx.stroke();
  } else if (el.tool === 'rect') {
    ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
  } else if (el.tool === 'circle') {
    const rx = Math.abs(end.x - start.x) / 2;
    const ry = Math.abs(end.y - start.y) / 2;
    const cx = (start.x + end.x) / 2;
    const cy = (start.y + end.y) / 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

export const CanvasStage: React.FC<CanvasStageProps> = ({
  currentImage,
  prevImage,
  nextImage,
  activeTool,
  color,
  brushSize,
  elements,
  onAddElement,
  imageOpacity,
  drawOpacity,
  bwMode,
  contrast,
  grid,
  onion,
  transform,
  onTransformChange,
  moveTarget,
  onMoveTargetChange,
  mainOffset,
  prevOffset,
  nextOffset,
  onMainOffsetChange,
  crop,
  onCropChange,
  stageRef,
  drawCanvasRef,
  onQuickTheme,
  onUnpackGif,
  gifExtractProgress,
  isLiked,
  onThumbsUp,
  onThumbsDown,
}) => {
  const [draftElement, setDraftElement] = useState<DrawElement | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [cropDragStart, setCropDragStart] = useState<Point | null>(null);
  const [cropDragEnd, setCropDragEnd] = useState<Point | null>(null);
  const [fallbackIdx, setFallbackIdx] = useState(0);
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  useEffect(() => {
    setFallbackIdx(0);
  }, [currentImage?.id]);

  const redrawCanvas = useCallback(() => {
    const canvas = drawCanvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;

    if (canvas.width !== stage.clientWidth || canvas.height !== stage.clientHeight) {
      canvas.width = stage.clientWidth;
      canvas.height = stage.clientHeight;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const el of elements) {
      renderElement(ctx, el);
    }
    if (draftElement) {
      renderElement(ctx, draftElement);
    }
  }, [drawCanvasRef, stageRef, elements, draftElement]);

  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(() => redrawCanvas());
    observer.observe(stage);
    return () => observer.disconnect();
  }, [stageRef, redrawCanvas]);

  const getLocalPoint = (e: React.PointerEvent): Point => {
    const rect = stageRef.current!.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!currentImage) return;
    const pt = getLocalPoint(e);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    if (activeTool === 'pan' || e.button === 1) {
      setIsPanning(true);
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        panX: moveTarget === 'main' ? mainOffset.x : transform.panX,
        panY: moveTarget === 'main' ? mainOffset.y : transform.panY,
      };
      return;
    }

    if (activeTool === 'crop') {
      setCropDragStart(pt);
      setCropDragEnd(pt);
      return;
    }

    const newEl: DrawElement = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      tool: activeTool,
      color,
      size: brushSize,
      points: [pt],
    };
    setDraftElement(newEl);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isPanning && panStartRef.current) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      if (moveTarget === 'main') {
        onMainOffsetChange({
          x: panStartRef.current.panX + dx,
          y: panStartRef.current.panY + dy,
        });
      } else {
        onTransformChange({
          ...transform,
          panX: panStartRef.current.panX + dx,
          panY: panStartRef.current.panY + dy,
        });
      }
      return;
    }

    if (activeTool === 'crop' && cropDragStart) {
      setCropDragEnd(getLocalPoint(e));
      return;
    }

    if (!draftElement) return;
    const pt = getLocalPoint(e);
    if (draftElement.tool === 'pen' || draftElement.tool === 'eraser') {
      setDraftElement({
        ...draftElement,
        points: [...draftElement.points, pt],
      });
    } else {
      setDraftElement({
        ...draftElement,
        points: [draftElement.points[0], pt],
      });
    }
  };

  const handlePointerUp = () => {
    if (isPanning) {
      setIsPanning(false);
      panStartRef.current = null;
      return;
    }

    if (activeTool === 'crop' && cropDragStart && cropDragEnd && stageRef.current) {
      const w = stageRef.current.clientWidth;
      const h = stageRef.current.clientHeight;
      const x1 = Math.min(cropDragStart.x, cropDragEnd.x);
      const x2 = Math.max(cropDragStart.x, cropDragEnd.x);
      const y1 = Math.min(cropDragStart.y, cropDragEnd.y);
      const y2 = Math.max(cropDragStart.y, cropDragEnd.y);

      if (x2 - x1 > 20 && y2 - y1 > 20) {
        onCropChange({
          left: Math.min(45, Math.max(0, Math.round((x1 / w) * 100))),
          right: Math.min(45, Math.max(0, Math.round(((w - x2) / w) * 100))),
          top: Math.min(45, Math.max(0, Math.round((y1 / h) * 100))),
          bottom: Math.min(45, Math.max(0, Math.round(((h - y2) / h) * 100))),
        });
      }
      setCropDragStart(null);
      setCropDragEnd(null);
      return;
    }

    if (draftElement) {
      onAddElement(draftElement);
      setDraftElement(null);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (!currentImage) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    const nextZoom = Math.min(4, Math.max(0.25, Number((transform.zoom + delta).toFixed(2))));
    onTransformChange({ ...transform, zoom: nextZoom });
  };

  const buildTransformStyle = (offset: Point) => `
    perspective(1100px)
    translate(${transform.panX + offset.x}px, ${transform.panY + offset.y}px)
    scale(${transform.zoom})
    rotate(${transform.rotate}deg)
    scaleX(${transform.flipH ? -1 : 1})
    scaleY(${transform.flipV ? -1 : 1})
    skew(${transform.skewX}deg, ${transform.skewY}deg)
    rotateX(${transform.tiltX}deg)
    rotateY(${transform.tiltY}deg)
  `;

  const imageFilterStyle = [
    bwMode ? 'grayscale(100%)' : '',
    contrast !== 100 ? `contrast(${contrast}%)` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const clipPathStyle = `inset(${crop.top}% ${crop.right}% ${crop.bottom}% ${crop.left}%)`;

  return (
    <div
      ref={stageRef}
      className={`canvas-stage tool-${activeTool}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onWheel={handleWheel}
    >
      {!currentImage ? (
        <div className="empty-stage">
          <h2>Ready for Study</h2>
          <p>
            Search any theme, paste a <strong>Pinterest board URL</strong>, or click{' '}
            <strong>Video</strong> to unpack a clip or YouTube Short.
          </p>
          <div className="quick-themes">
            {QUICK_THEMES.map((t) => (
              <button key={t} className="pill-lg" onClick={() => onQuickTheme(t)}>
                {t}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          {activeTool === 'pan' && (
            <div
              className="floating-pan-pill"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <span>Hand Move:</span>
              <button
                className={`pill ${moveTarget === 'main' ? 'active' : ''}`}
                onClick={() => onMoveTargetChange('main')}
              >
                Main Image
              </button>
              <button
                className={`pill ${moveTarget === 'all' ? 'active' : ''}`}
                onClick={() => onMoveTargetChange('all')}
              >
                All (Onion-Skinned)
              </button>
            </div>
          )}

          {currentImage &&
            /\.gif(\?|#|$)/i.test(currentImage.url) &&
            currentImage.source !== 'gif-frame' && (
              <div
                className="floating-gif-pill"
                onPointerDown={(e) => e.stopPropagation()}
              >
                <span>Animated GIF</span>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => onUnpackGif(true)}
                  disabled={Boolean(gifExtractProgress)}
                  title="Clear other search results and use only this GIF's frames as the timeline"
                >
                  {gifExtractProgress || 'Make Main Timeline'}
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => onUnpackGif(false)}
                  disabled={Boolean(gifExtractProgress)}
                  title="Insert GIF frames into the current timeline"
                >
                  + Insert
                </button>
              </div>
            )}

          {/* Onion Skin: Before */}
          {onion.showBefore && prevImage && (
            <img
              src={getProxiedUrl(prevImage.url)}
              alt="Previous frame onion skin"
              className="stage-image onion-layer"
              draggable={false}
              style={{
                opacity: onion.opacity,
                transform: buildTransformStyle(prevOffset),
                filter: onion.tinted
                  ? 'grayscale(100%) sepia(100%) hue-rotate(-50deg) saturate(300%)'
                  : 'grayscale(100%)',
              }}
            />
          )}

          {/* Onion Skin: After */}
          {onion.showAfter && nextImage && (
            <img
              src={getProxiedUrl(nextImage.url)}
              alt="Next frame onion skin"
              className="stage-image onion-layer"
              draggable={false}
              style={{
                opacity: onion.opacity,
                transform: buildTransformStyle(nextOffset),
                filter: onion.tinted
                  ? 'grayscale(100%) sepia(100%) hue-rotate(140deg) saturate(300%)'
                  : 'grayscale(100%)',
              }}
            />
          )}

          {/* Active Reference Image (with automatic proxy -> direct -> thumbnail fallback) */}
          {(() => {
            const chain = getImageFallbackChain(currentImage);
            const activeSrc = chain[fallbackIdx];
            if (!activeSrc) {
              return (
                <div className="empty-stage">
                  <h3>Image Blocked by Host</h3>
                  <p>This site prevented direct loading. Try the next frame or open the source directly.</p>
                </div>
              );
            }
            return (
              <img
                key={`${currentImage.id}-${fallbackIdx}`}
                src={activeSrc}
                referrerPolicy="no-referrer"
                alt={currentImage.title}
                className="stage-image main-image"
                draggable={false}
                onError={() => setFallbackIdx((i) => i + 1)}
                style={{
                  opacity: imageOpacity,
                  transform: buildTransformStyle(mainOffset),
                  filter: imageFilterStyle || undefined,
                  clipPath: clipPathStyle,
                }}
              />
            );
          })()}

          {/* Reference Grid Overlay */}
          {grid.enabled && (
            <svg className="grid-overlay" style={{ opacity: grid.opacity }}>
              {Array.from({ length: grid.divisions - 1 }).map((_, idx) => {
                const pct = ((idx + 1) / grid.divisions) * 100;
                return (
                  <React.Fragment key={idx}>
                    <line x1={`${pct}%`} y1="0%" x2={`${pct}%`} y2="100%" stroke={grid.color} strokeWidth="1" />
                    <line x1="0%" y1={`${pct}%`} x2="100%" y2={`${pct}%`} stroke={grid.color} strokeWidth="1" />
                  </React.Fragment>
                );
              })}
            </svg>
          )}

          {/* Drawover Canvas */}
          <canvas
            ref={drawCanvasRef}
            className="drawover-canvas"
            style={{ opacity: drawOpacity }}
          />

          {/* Interactive Crop Selection Box */}
          {activeTool === 'crop' && cropDragStart && cropDragEnd && (
            <div
              className="crop-marquee"
              style={{
                left: Math.min(cropDragStart.x, cropDragEnd.x),
                top: Math.min(cropDragStart.y, cropDragEnd.y),
                width: Math.abs(cropDragEnd.x - cropDragStart.x),
                height: Math.abs(cropDragEnd.y - cropDragStart.y),
              }}
            />
          )}

          {/* Direct Source Link */}
          {(() => {
            const sourceHref = currentImage.pageUrl || currentImage.url;
            if (!/^https?:\/\//i.test(sourceHref)) return null;
            let host = sourceHref;
            try {
              host = new URL(sourceHref).hostname.replace(/^www\./, '');
            } catch {
              // fallback to raw URL
            }
            return (
              <a
                href={sourceHref}
                target="_blank"
                rel="noopener noreferrer"
                className="source-link-pill"
                title={`Open source: ${sourceHref}`}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <ExternalLink size={12} />
                <span>{host}</span>
              </a>
            );
          })()}
          {/* Thumbs Up / Thumbs Down Rating Pill */}
          <div className="rating-pill" onPointerDown={(e) => e.stopPropagation()}>
            <button
              type="button"
              className={`rating-btn ${isLiked ? 'liked' : ''}`}
              onClick={onThumbsUp}
              title={isLiked ? 'Liked reference' : 'Thumbs up (keep / like)'}
            >
              <ThumbsUp size={13} />
            </button>
            <button
              type="button"
              className="rating-btn disliked"
              onClick={onThumbsDown}
              title="Thumbs down (hide & never show this image again)"
            >
              <ThumbsDown size={13} />
            </button>
          </div>
        </>
      )}
    </div>
  );
};
