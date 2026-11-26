import React from 'react';
import {
  Film,
  ChevronLeft,
  ChevronRight,
  Play,
  Square,
  Star,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import { DrawElement, RefImage } from '../types';
import { getProxiedUrl } from '../utils/exportUtils';

interface TimelineBarProps {
  images: RefImage[];
  currentIndex: number;
  onSelectIndex: (idx: number) => void;
  drawingsByFrame: Record<string, DrawElement[]>;
  motionFps: number | null;
  onMotionFpsChange: (fps: number | null) => void;
  onUnpackGif: (replaceTimeline: boolean) => void;
  gifExtractProgress: string | null;
  extremeIds: Record<string, boolean>;
  onToggleExtreme: (id: string) => void;
  extremesOnly: boolean;
  onToggleExtremesOnly: () => void;
  onFlipExtreme: (dir: -1 | 1) => void;
  onStepFrame: (dir: -1 | 1) => void;
}

const FPS_OPTIONS = [8, 12, 24];

export const TimelineBar: React.FC<TimelineBarProps> = ({
  images,
  currentIndex,
  onSelectIndex,
  drawingsByFrame,
  motionFps,
  onMotionFpsChange,
  onUnpackGif,
  gifExtractProgress,
  extremeIds,
  onToggleExtreme,
  extremesOnly,
  onToggleExtremesOnly,
  onFlipExtreme,
  onStepFrame,
}) => {
  const currentImage = images[currentIndex];
  const isAnimatedGif =
    currentImage &&
    (/\.gif(\?|#|$)/i.test(currentImage.url) || currentImage.source === 'bing-gif') &&
    currentImage.source !== 'gif-frame';

  const extremeCount = images.filter((img) => extremeIds[img.id]).length;
  const isCurrentExtreme = currentImage ? Boolean(extremeIds[currentImage.id]) : false;

  return (
    <footer className="timeline-bar">
      <div className="timeline-meta">
        <Film size={14} />
        <span>Motion Study Timeline</span>

        {images.length > 0 && (
          <div className="timeline-step-controls">
            <button
              className="mini-btn"
              onClick={() => onStepFrame(-1)}
              title="Previous Frame (Left Arrow)"
            >
              <ChevronLeft size={13} />
            </button>
            <button
              className="mini-btn"
              onClick={() => onStepFrame(1)}
              title="Next Frame (Right Arrow)"
            >
              <ChevronRight size={13} />
            </button>

            <span className="tl-sep" />

            <button
              className={`pill ${isCurrentExtreme ? 'extreme-active' : ''}`}
              onClick={() => currentImage && onToggleExtreme(currentImage.id)}
              title="Mark/Unmark current frame as Extreme Keyframe (K) — or right-click any thumbnail"
            >
              <Star size={10} fill={isCurrentExtreme ? 'currentColor' : 'none'} style={{ marginRight: 3 }} />
              Extreme
            </button>

            <button
              className="mini-btn"
              onClick={() => onFlipExtreme(-1)}
              disabled={extremeCount === 0}
              title="Flip to Previous Extreme ([)"
            >
              <SkipBack size={12} />
            </button>
            <button
              className="mini-btn"
              onClick={() => onFlipExtreme(1)}
              disabled={extremeCount === 0}
              title="Flip to Next Extreme (])"
            >
              <SkipForward size={12} />
            </button>

            <button
              className={`pill ${extremesOnly ? 'extreme-active' : ''}`}
              onClick={onToggleExtremesOnly}
              disabled={extremeCount === 0}
              title="Skip non-extreme frames during stepping, onion skinning, and loop playback"
            >
              Extremes Only ({extremeCount})
            </button>

            <span className="tl-sep" />

            <span className="fps-label">Loop:</span>
            {motionFps ? (
              <button
                className="pill active"
                onClick={() => onMotionFpsChange(null)}
                title="Stop motion loop"
              >
                <Square size={9} style={{ marginRight: 3 }} />
                {motionFps} fps
              </button>
            ) : (
              FPS_OPTIONS.map((fps) => (
                <button
                  key={fps}
                  className="pill"
                  onClick={() => onMotionFpsChange(fps)}
                  title={`Play timeline at ${fps} fps`}
                >
                  <Play size={9} style={{ marginRight: 2 }} />
                  {fps}
                </button>
              ))
            )}

            {isAnimatedGif && (
              <button
                className="pill active"
                onClick={() => onUnpackGif(true)}
                disabled={Boolean(gifExtractProgress)}
                title="Replace timeline with this GIF's individual frames"
              >
                {gifExtractProgress || 'Make Main Timeline'}
              </button>
            )}
          </div>
        )}

        <span className="frame-counter">
          {images.length > 0 ? `Frame ${currentIndex + 1} / ${images.length}` : '0 frames'}
        </span>
      </div>

      {images.length > 0 && (
        <div className="timeline-track-wrap">
          <input
            type="range"
            min={0}
            max={Math.max(0, images.length - 1)}
            step={1}
            value={currentIndex}
            onChange={(e) => onSelectIndex(Number(e.target.value))}
            className="timeline-scrubber"
            title="Scrub between keyframes"
          />

          <div className="keyframe-strip">
            {images.map((img, idx) => {
              const hasDraw = (drawingsByFrame[img.id]?.length || 0) > 0;
              const isExtreme = Boolean(extremeIds[img.id]);
              const isDimmed = extremesOnly && !isExtreme;

              return (
                <button
                  key={img.id}
                  className={`keyframe-node ${idx === currentIndex ? 'active' : ''} ${
                    isExtreme ? 'extreme' : ''
                  } ${isDimmed ? 'dimmed' : ''}`}
                  onClick={(e) => {
                    if (e.shiftKey) {
                      onToggleExtreme(img.id);
                    } else {
                      onSelectIndex(idx);
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onToggleExtreme(img.id);
                  }}
                  title={`Keyframe ${idx + 1}${isExtreme ? ' (Extreme)' : ''} — Right-click or Shift+Click to toggle Extreme`}
                >
                  <img src={getProxiedUrl(img.thumbnail)} alt={`F${idx + 1}`} loading="lazy" />
                  <span className="kf-label">F{idx + 1}</span>
                  {isExtreme && <span className="kf-extreme-star" title="Extreme Keyframe">★</span>}
                  {hasDraw && <span className="kf-drawn-dot" title="Has drawover" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </footer>
  );
};
