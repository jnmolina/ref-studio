declare module 'gifuct-js' {
  export interface ParsedFrame {
    dims: {
      width: number;
      height: number;
      top: number;
      left: number;
    };
    delay: number;
    disposalType: number;
    patch: Uint8ClampedArray;
    transparentIndex?: number;
  }

  export function parseGIF(arrayBuffer: ArrayBuffer): unknown;
  export function decompressFrames(gif: unknown, buildImagePatch?: boolean): ParsedFrame[];
}
