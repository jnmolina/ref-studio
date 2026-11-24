import React from 'react';
import {
  Grid,
  Eye,
  Contrast,
  Layers,
  FlipHorizontal,
  FlipVertical,
  RotateCcw,
  Maximize2,
} from 'lucide-react';
import { CropRect, GridSettings, MoveTarget, OnionSkinSettings, TransformSettings } from '../types';

interface RightInspectorProps {
  imageOpacity: number;
  onImageOpacityChange: (v: number) => void;
  drawOpacity: number;
  onDrawOpacityChange: (v: number) => void;
  bwMode: boolean;
  onToggleBw: () => void;
  contrast: number;
  onContrastChange: (v: number) => void;
  grid: GridSettings;
  onGridChange: (g: GridSettings) => void;
  onion: OnionSkinSettings;
  onOnionChange: (o: OnionSkinSettings) => void;
  transform: TransformSettings;
  onTransformChange: (t: TransformSettings) => void;
  moveTarget: MoveTarget;
  onMoveTargetChange: (m: MoveTarget) => void;
  onResetTransform: () => void;
  crop: CropRect;
  onCropChange: (c: CropRect) => void;
  onResetCrop: () => void;
}

export const RightInspector: React.FC<RightInspectorProps> = ({
  imageOpacity,
  onImageOpacityChange,
  drawOpacity,
  onDrawOpacityChange,
  bwMode,
  onToggleBw,
  contrast,
  onContrastChange,
  grid,
  onGridChange,
  onion,
  onOnionChange,
  transform,
  onTransformChange,
  moveTarget,
  onMoveTargetChange,
  onResetTransform,
  crop,
  onCropChange,
  onResetCrop,
}) => {
  return (
    <aside className="inspector">
      {/* Opacity Section */}
      <section className="panel-section">
        <div className="section-title">
          <Eye size={14} />
          <span>Opacity</span>
        </div>

        <div className="control-row">
          <div className="control-header">
            <span>Reference Image</span>
            <span>{Math.round(imageOpacity * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.02}
            value={imageOpacity}
            onChange={(e) => onImageOpacityChange(Number(e.target.value))}
          />
        </div>

        <div className="control-row">
          <div className="control-header">
            <span>Drawover Layer</span>
            <span>{Math.round(drawOpacity * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.02}
            value={drawOpacity}
            onChange={(e) => onDrawOpacityChange(Number(e.target.value))}
          />
        </div>
      </section>

      {/* Value / Black & White Mode */}
      <section className="panel-section">
        <div className="section-title">
          <Contrast size={14} />
          <span>Value &amp; B&amp;W Study</span>
        </div>

        <div className="toggle-row">
          <span>Black &amp; White Mode</span>
          <button className={`toggle-pill ${bwMode ? 'on' : ''}`} onClick={onToggleBw}>
            {bwMode ? 'ON' : 'OFF'}
          </button>
        </div>

        <div className="control-row">
          <div className="control-header">
            <span>Contrast</span>
            <span>{contrast}%</span>
          </div>
          <input
            type="range"
            min={50}
            max={200}
            step={5}
            value={contrast}
            onChange={(e) => onContrastChange(Number(e.target.value))}
          />
        </div>
      </section>

      {/* Grid Overlay */}
      <section className="panel-section">
        <div className="section-title">
          <Grid size={14} />
          <span>Reference Grid</span>
          <button
            className={`toggle-pill ml-auto ${grid.enabled ? 'on' : ''}`}
            onClick={() => onGridChange({ ...grid, enabled: !grid.enabled })}
          >
            {grid.enabled ? 'ON' : 'OFF'}
          </button>
        </div>

        {grid.enabled && (
          <>
            <div className="control-row">
              <div className="control-header">
                <span>Grid Size</span>
                <span>
                  {grid.divisions}×{grid.divisions}
                </span>
              </div>
              <input
                type="range"
                min={2}
                max={24}
                step={1}
                value={grid.divisions}
                onChange={(e) => onGridChange({ ...grid, divisions: Number(e.target.value) })}
              />
            </div>

            <div className="control-row">
              <div className="control-header">
                <span>Grid Opacity</span>
                <span>{Math.round(grid.opacity * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.05}
                max={1}
                step={0.05}
                value={grid.opacity}
                onChange={(e) => onGridChange({ ...grid, opacity: Number(e.target.value) })}
              />
            </div>
          </>
        )}
      </section>

      {/* Onion Skin */}
      <section className="panel-section">
        <div className="section-title">
          <Layers size={14} />
          <span>Onion Skin</span>
        </div>

        <div className="btn-grid-2">
          <button
            className={`btn btn-sm ${onion.showBefore ? 'btn-accent' : 'btn-ghost'}`}
            onClick={() => onOnionChange({ ...onion, showBefore: !onion.showBefore })}
          >
            Before (Prev)
          </button>
          <button
            className={`btn btn-sm ${onion.showAfter ? 'btn-accent' : 'btn-ghost'}`}
            onClick={() => onOnionChange({ ...onion, showAfter: !onion.showAfter })}
          >
            After (Next)
          </button>
        </div>

        {(onion.showBefore || onion.showAfter) && (
          <>
            <div className="control-row" style={{ marginTop: 8 }}>
              <div className="control-header">
                <span>Ghost Opacity</span>
                <span>{Math.round(onion.opacity * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.05}
                max={0.85}
                step={0.05}
                value={onion.opacity}
                onChange={(e) => onOnionChange({ ...onion, opacity: Number(e.target.value) })}
              />
            </div>
            <div className="toggle-row">
              <span>Red / Cyan Tint</span>
              <button
                className={`toggle-pill ${onion.tinted ? 'on' : ''}`}
                onClick={() => onOnionChange({ ...onion, tinted: !onion.tinted })}
              >
                {onion.tinted ? 'ON' : 'OFF'}
              </button>
            </div>
          </>
        )}
      </section>

      {/* Real-time Zoom / Warp / Crop */}
      <section className="panel-section">
        <div className="section-title">
          <Maximize2 size={14} />
          <span>Zoom / Warp / Crop</span>
          <button
            className="btn-icon ml-auto"
            onClick={() => {
              onResetTransform();
              onResetCrop();
            }}
            title="Reset Transform & Crop"
          >
            <RotateCcw size={13} />
          </button>
        </div>

        <div className="control-row">
          <div className="control-header">
            <span>Hand Move Target</span>
          </div>
          <div className="btn-grid-2">
            <button
              className={`btn btn-sm ${moveTarget === 'main' ? 'btn-accent' : 'btn-ghost'}`}
              onClick={() => onMoveTargetChange('main')}
              title="Move only the active main image (keep onion-skinned frames anchored)"
            >
              Main Image
            </button>
            <button
              className={`btn btn-sm ${moveTarget === 'all' ? 'btn-accent' : 'btn-ghost'}`}
              onClick={() => onMoveTargetChange('all')}
              title="Move main image and all onion-skinned frames together"
            >
              All (Onion)
            </button>
          </div>
        </div>

        <div className="control-row">
          <div className="control-header">
            <span>Zoom</span>
            <span>{Math.round(transform.zoom * 100)}%</span>
          </div>
          <input
            type="range"
            min={0.25}
            max={4}
            step={0.05}
            value={transform.zoom}
            onChange={(e) => onTransformChange({ ...transform, zoom: Number(e.target.value) })}
          />
        </div>

        <div className="control-row">
          <div className="control-header">
            <span>Rotate</span>
            <span>{transform.rotate}°</span>
          </div>
          <input
            type="range"
            min={-180}
            max={180}
            step={1}
            value={transform.rotate}
            onChange={(e) => onTransformChange({ ...transform, rotate: Number(e.target.value) })}
          />
        </div>

        <div className="btn-grid-2" style={{ marginBottom: 8 }}>
          <button
            className={`btn btn-sm ${transform.flipH ? 'btn-accent' : 'btn-ghost'}`}
            onClick={() => onTransformChange({ ...transform, flipH: !transform.flipH })}
          >
            <FlipHorizontal size={13} /> Flip H
          </button>
          <button
            className={`btn btn-sm ${transform.flipV ? 'btn-accent' : 'btn-ghost'}`}
            onClick={() => onTransformChange({ ...transform, flipV: !transform.flipV })}
          >
            <FlipVertical size={13} /> Flip V
          </button>
        </div>

        <div className="control-row">
          <div className="control-header">
            <span>Warp Skew X / Y</span>
            <span>
              {transform.skewX}° / {transform.skewY}°
            </span>
          </div>
          <div className="dual-sliders">
            <input
              type="range"
              min={-40}
              max={40}
              value={transform.skewX}
              onChange={(e) => onTransformChange({ ...transform, skewX: Number(e.target.value) })}
            />
            <input
              type="range"
              min={-40}
              max={40}
              value={transform.skewY}
              onChange={(e) => onTransformChange({ ...transform, skewY: Number(e.target.value) })}
            />
          </div>
        </div>

        <div className="control-row">
          <div className="control-header">
            <span>Perspective Tilt X / Y</span>
            <span>
              {transform.tiltX}° / {transform.tiltY}°
            </span>
          </div>
          <div className="dual-sliders">
            <input
              type="range"
              min={-45}
              max={45}
              value={transform.tiltX}
              onChange={(e) => onTransformChange({ ...transform, tiltX: Number(e.target.value) })}
            />
            <input
              type="range"
              min={-45}
              max={45}
              value={transform.tiltY}
              onChange={(e) => onTransformChange({ ...transform, tiltY: Number(e.target.value) })}
            />
          </div>
        </div>

        <div className="control-row">
          <div className="control-header">
            <span>Realtime Crop (T/R/B/L)</span>
          </div>
          <div className="crop-sliders">
            <input
              type="range"
              min={0}
              max={45}
              value={crop.top}
              onChange={(e) => onCropChange({ ...crop, top: Number(e.target.value) })}
              title={`Top: ${crop.top}%`}
            />
            <input
              type="range"
              min={0}
              max={45}
              value={crop.right}
              onChange={(e) => onCropChange({ ...crop, right: Number(e.target.value) })}
              title={`Right: ${crop.right}%`}
            />
            <input
              type="range"
              min={0}
              max={45}
              value={crop.bottom}
              onChange={(e) => onCropChange({ ...crop, bottom: Number(e.target.value) })}
              title={`Bottom: ${crop.bottom}%`}
            />
            <input
              type="range"
              min={0}
              max={45}
              value={crop.left}
              onChange={(e) => onCropChange({ ...crop, left: Number(e.target.value) })}
              title={`Left: ${crop.left}%`}
            />
          </div>
        </div>
      </section>
    </aside>
  );
};
