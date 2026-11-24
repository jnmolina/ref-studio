# RefStudio — Ephemeral Reference & Motion Study App

A standalone desktop & web reference viewer for artists and animators—zero image or search storage.

## Features
- **Ephemeral Image & Pinterest Board Search:** Search themes or paste a public Pinterest board URL; nothing is stored on disk.
- **Golden List:** Save, edit, and group favorite reference sites and scope searches to any group or site.
- **Thumbs Up / Down:** Hide unwanted images permanently (`localStorage` URLs only) and avoid duplicates on append.
- **Slideshow Timer (30s–5m):** Play/pause, step forward/back, and browse the session archive.
- **Motion Study Timeline & Extreme Keyframes:** Unpack animated GIFs or videos (URL, local file, or browser tab capture) into frame-by-frame timelines, mark **Extreme Keyframes (`K`)**, flip (`[` / `]`), and toggle **Extremes Only** mode.
- **Drawover & Studio Tools:** Freehand pen, shapes, configurable grid, independent image/drawover opacity, onion skinning, B&W value mode, real-time zoom/warp/crop, and PNG/ZIP/session-link export.

## Portable Desktop App
Run `dist-desktop/RefStudio 1.0.0.exe` (Windows x64) to launch RefStudio in its own standalone window.

## Development
```bash
npm install
npm run dev        # Web app + API server
npm run build      # Production web build
npm run build:desktop  # Build portable Windows desktop .exe
```
