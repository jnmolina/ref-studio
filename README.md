# RefStudio — Ephemeral Reference & Motion Study App

**Live Web App:** [https://jnmolina.github.io/ref-studio/](https://jnmolina.github.io/ref-studio/)  
**Portable Windows Desktop App:** [`dist-desktop/RefStudio 1.0.0.exe`](dist-desktop/RefStudio%201.0.0.exe)

A minimal, zero-storage reference viewer and motion-study tool for artists and animators. Fetched images and search queries live only in memory and are never written to disk.

---

## Key Features

- **Theme Search, Pinterest Boards & Web Links**
  - **Theme Search:** Stream high-resolution reference images (excluding blurry thumbnails and video thumbnails), with **No GIFs / + GIFs / GIFs Only** and **SafeSearch / NSFW** filters.
  - **Pinterest Boards:** Paste any public board URL (`https://www.pinterest.com/username/board-name/`) or shorthand (`username/board-name`) into the search bar or **Board / Links** modal.
  - **Webpage & Direct Image/GIF Links:** Paste any webpage URL to extract its images, or paste one or more direct `.jpg` / `.png` / `.webp` / `.gif` URLs (one per line).
- **Golden List (`★`)**
  - Add, edit, and group your favorite reference websites and restrict searches to any group or site.
- **Thumbs Up / Down (`👍` / `👎`)**
  - Hide unwanted images permanently (`localStorage` URLs only) and automatically deduplicate when appending to a session.
- **Slideshow & Session Archive**
  - Configurable timer (`30s` to `5m`), Play/Pause (`Space`), Prev/Next (`←` / `→`), and an in-memory **Session Archive** drawer.
- **Motion Study Timeline & Extreme Keyframes**
  - **GIF Frame-by-Frame:** Unpack any animated GIF into individual timeline frames (`Make Main Timeline` or `+ Insert`).
  - **Video & YouTube Shorts Capture:** Extract frames from direct video URLs (`.mp4` / `.webm` / `.mov`), local video files, or live **Browser Tab / Screen Capture** (`4` / `8` / `12` / `24 fps`).
  - **Traditional Animation Flipping:** Mark **Extreme Keyframes** (`K` or right-click/Shift+click thumbnails), flip between extremes (`[` / `]`), toggle **Extremes Only** mode, and loop at `8` / `12` / `24 fps`.
- **Drawover & Studio Inspector**
  - Freehand pen (`B`), eraser (`E`), line (`L`), arrow (`A`), rectangle (`R`), circle (`C`), and interactive crop.
  - Configurable reference grid (`2×2`–`24×24`), independent image & drawover opacity, **Black & White + Contrast** value study mode, **Onion Skin** (`Before` / `After` with red/cyan tint), and real-time **Zoom / Rotate / Flip / Skew / 3D Perspective Tilt** (move `Main Image` or `All Onion-Skinned`).
- **Export & Zero-Storage Sharing**
  - Download the current original image, export a composite PNG (`Image + Drawover`), download the entire session as a `.zip`, copy a compressed `#s=...` share link, or export/import a `.refstudio.json` session file.

---

## Running RefStudio

### 1. On the Web (No Install)
Open **[https://jnmolina.github.io/ref-studio/](https://jnmolina.github.io/ref-studio/)** in any desktop or mobile browser (on mobile, use **Add to Home Screen** to install as a fullscreen PWA).

### 2. Portable Windows Desktop App
Download and run **[`dist-desktop/RefStudio 1.0.0.exe`](dist-desktop/RefStudio%201.0.0.exe)** to launch RefStudio in its own standalone desktop window.

### 3. Local Development
```bash
npm install
npm run dev            # Start Vite frontend + local Express search/proxy server
npm run build          # Build production web bundle (dist/)
npm run build:desktop  # Build standalone portable Windows executable
```
