export interface RefImage {
  id: string;
  url: string;
  pageUrl?: string;
  thumbnail: string;
  title: string;
  width: number;
  height: number;
  source: string;
  addedAt: number;
}

export type DrawTool =
  | 'pan'
  | 'pen'
  | 'eraser'
  | 'line'
  | 'arrow'
  | 'rect'
  | 'circle'
  | 'crop';

export interface Point {
  x: number;
  y: number;
}

export interface DrawElement {
  id: string;
  tool: Exclude<DrawTool, 'pan' | 'crop'>;
  color: string;
  size: number;
  points: Point[];
}

export interface GridSettings {
  enabled: boolean;
  divisions: number; // 2 to 24
  opacity: number; // 0 to 1
  color: string;
}

export interface OnionSkinSettings {
  showBefore: boolean;
  showAfter: boolean;
  opacity: number; // 0 to 1
  tinted: boolean; // red for before, cyan for after
}

export type MoveTarget = 'all' | 'main';
export type GifMode = 'exclude' | 'include' | 'only';

export interface TransformSettings {
  zoom: number; // 0.2 to 4
  panX: number;
  panY: number;
  rotate: number; // -180 to 180
  flipH: boolean;
  flipV: boolean;
  skewX: number; // -45 to 45 deg
  skewY: number; // -45 to 45 deg
  tiltX: number; // -45 to 45 deg (3D perspective)
  tiltY: number; // -45 to 45 deg (3D perspective)
}

export interface CropRect {
  top: number; // 0 to 50 (%)
  right: number; // 0 to 50 (%)
  bottom: number; // 0 to 50 (%)
  left: number; // 0 to 50 (%)
}

export interface GoldenSite {
  id: string;
  name: string;
  domain: string;
  group: string;
}
