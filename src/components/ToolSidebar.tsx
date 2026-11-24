import React from 'react';
import {
  Hand,
  Pencil,
  Eraser,
  Minus,
  ArrowUpRight,
  Square,
  Circle,
  Crop,
  Undo2,
  Trash2,
} from 'lucide-react';
import { DrawTool } from '../types';

interface ToolSidebarProps {
  activeTool: DrawTool;
  onSelectTool: (t: DrawTool) => void;
  color: string;
  onColorChange: (c: string) => void;
  brushSize: number;
  onBrushSizeChange: (s: number) => void;
  canUndo: boolean;
  onUndo: () => void;
  onClearDrawover: () => void;
}

const COLORS = ['#ff4d4f', '#38bdf8', '#facc15', '#4ade80', '#ffffff', '#000000'];

const TOOLS: { id: DrawTool; icon: React.ReactNode; label: string }[] = [
  { id: 'pan', icon: <Hand size={17} />, label: 'Pan / Move (V)' },
  { id: 'pen', icon: <Pencil size={17} />, label: 'Freehand Draw (B)' },
  { id: 'eraser', icon: <Eraser size={17} />, label: 'Eraser (E)' },
  { id: 'line', icon: <Minus size={17} />, label: 'Line (L)' },
  { id: 'arrow', icon: <ArrowUpRight size={17} />, label: 'Arrow (A)' },
  { id: 'rect', icon: <Square size={17} />, label: 'Rectangle (R)' },
  { id: 'circle', icon: <Circle size={17} />, label: 'Circle / Ellipse (C)' },
  { id: 'crop', icon: <Crop size={17} />, label: 'Interactive Crop' },
];

export const ToolSidebar: React.FC<ToolSidebarProps> = ({
  activeTool,
  onSelectTool,
  color,
  onColorChange,
  brushSize,
  onBrushSizeChange,
  canUndo,
  onUndo,
  onClearDrawover,
}) => {
  return (
    <aside className="tool-sidebar">
      <div className="tool-group">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={`tool-btn ${activeTool === t.id ? 'active' : ''}`}
            onClick={() => onSelectTool(t.id)}
            title={t.label}
          >
            {t.icon}
          </button>
        ))}
      </div>

      <div className="tool-divider" />

      <div className="color-swatches" title="Drawover Color">
        {COLORS.map((c) => (
          <button
            key={c}
            className={`swatch ${color === c ? 'active' : ''}`}
            style={{ backgroundColor: c }}
            onClick={() => onColorChange(c)}
          />
        ))}
        <input
          type="color"
          value={color}
          onChange={(e) => onColorChange(e.target.value)}
          className="color-picker-native"
          title="Custom Color"
        />
      </div>

      <div className="brush-size-wrap" title={`Stroke Width: ${brushSize}px`}>
        <span className="mini-label">{brushSize}px</span>
        <input
          type="range"
          min={1}
          max={24}
          value={brushSize}
          onChange={(e) => onBrushSizeChange(Number(e.target.value))}
          className="vertical-slider"
        />
      </div>

      <div className="tool-divider" />

      <div className="tool-group">
        <button className="tool-btn" onClick={onUndo} disabled={!canUndo} title="Undo Stroke (Ctrl+Z)">
          <Undo2 size={17} />
        </button>
        <button className="tool-btn danger" onClick={onClearDrawover} title="Clear Drawover on Frame">
          <Trash2 size={17} />
        </button>
      </div>
    </aside>
  );
};
