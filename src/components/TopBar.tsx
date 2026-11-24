import React, { useState } from 'react';
import {
  Search,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Download,
  Archive,
  Settings,
  Loader2,
  ImageDown,
  Layers,
  FolderArchive,
  X,
  Share2,
  Check,
  FileJson,
  Upload,
  ShieldCheck,
  ShieldAlert,
  Video,
  Star,
  SlidersHorizontal,
  Clock,
  PanelRight,
  Link2,
} from 'lucide-react';
import { GifMode, GoldenSite } from '../types';
import { detectInputKind } from '../utils/clientSearch';

interface TopBarProps {
  query: string;
  onQueryChange: (q: string) => void;
  onSearch: (q: string) => void;
  isSearching: boolean;
  provider: string;
  totalImages: number;
  currentIndex: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  intervalSec: number;
  onIntervalChange: (sec: number) => void;
  timeRemainingSec: number;
  showArchive: boolean;
  onToggleArchive: () => void;
  onExportOriginal: () => void;
  onExportComposite: () => void;
  onExportAllZip: () => void;
  onCopyShareLink: () => void;
  shareCopied: boolean;
  onExportSessionFile: () => void;
  onImportSessionFile: (file: File) => void;
  exportProgress: string | null;
  googleApiKey: string;
  googleCx: string;
  onSaveGoogleCreds: (key: string, cx: string) => void;
  safeSearch: boolean;
  onToggleSafeSearch: () => void;
  gifMode: GifMode;
  onGifModeChange: (m: GifMode) => void;
  onOpenVideoModal: () => void;
  onOpenLinkModal: () => void;
  goldenSites: GoldenSite[];
  searchScope: string;
  onSearchScopeChange: (scope: string) => void;
  onOpenGoldenList: () => void;
  showInspector: boolean;
  onToggleInspector: () => void;
}

const TIMER_PRESETS = [
  { label: '30s', value: 30 },
  { label: '1m', value: 60 },
  { label: '2m', value: 120 },
  { label: '3m', value: 180 },
  { label: '5m', value: 300 },
];

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export const TopBar: React.FC<TopBarProps> = ({
  query,
  onQueryChange,
  onSearch,
  isSearching,
  totalImages,
  currentIndex,
  isPlaying,
  onTogglePlay,
  onPrev,
  onNext,
  intervalSec,
  onIntervalChange,
  timeRemainingSec,
  showArchive,
  onToggleArchive,
  onExportOriginal,
  onExportComposite,
  onExportAllZip,
  onCopyShareLink,
  shareCopied,
  onExportSessionFile,
  onImportSessionFile,
  exportProgress,
  googleApiKey,
  googleCx,
  onSaveGoogleCreds,
  safeSearch,
  onToggleSafeSearch,
  gifMode,
  onGifModeChange,
  onOpenVideoModal,
  onOpenLinkModal,
  goldenSites,
  searchScope,
  onSearchScopeChange,
  onOpenGoldenList,
  showInspector,
  onToggleInspector,
}) => {
  const [showFilters, setShowFilters] = useState(false);
  const [showTimerMenu, setShowTimerMenu] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [tempKey, setTempKey] = useState(googleApiKey);
  const [tempCx, setTempCx] = useState(googleCx);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) onSearch(query.trim());
  };

  const progressPct = intervalSec > 0 ? ((intervalSec - timeRemainingSec) / intervalSec) * 100 : 0;
  const activeFilterCount =
    (searchScope !== 'all' ? 1 : 0) + (gifMode !== 'exclude' ? 1 : 0) + (!safeSearch ? 1 : 0);
  const inputKind = detectInputKind(query);
  const submitLabel =
    inputKind === 'pinterest'
      ? 'Load Board'
      : inputKind === 'image-url' || inputKind === 'web-url'
      ? 'Load Link'
      : inputKind === 'video'
      ? 'Load Video'
      : 'Search';

  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="brand">
          <span className="brand-dot" />
          <span>RefStudio</span>
        </div>

        <form className="search-form" onSubmit={handleSubmit}>
          <Search size={15} className="search-icon" />
          <input
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search theme, or paste Pinterest board / image / webpage URL..."
            className="search-input"
          />
          {inputKind !== 'search' && (
            <span className="detected-kind-badge">
              {inputKind === 'pinterest'
                ? 'Pinterest'
                : inputKind === 'image-url'
                ? 'Image URL'
                : inputKind === 'video'
                ? 'Video'
                : 'Web Link'}
            </span>
          )}
          {query && (
            <button
              type="button"
              className="btn-clear-input"
              onClick={() => onQueryChange('')}
              title="Clear search"
            >
              <X size={13} />
            </button>
          )}
          <button type="submit" className="btn btn-primary btn-sm" disabled={isSearching || !query.trim()}>
            {isSearching ? <Loader2 size={14} className="spin" /> : submitLabel}
          </button>
        </form>

        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={onOpenLinkModal}
          title="Load a Pinterest board, webpage URL, or list of direct image/GIF links"
        >
          <Link2 size={13} />
          <span>Board / Links</span>
        </button>

        <div className="dropdown-wrap">
          <button
            type="button"
            className={`btn btn-sm ${activeFilterCount > 0 ? 'btn-accent' : 'btn-ghost'}`}
            onClick={() => setShowFilters((v) => !v)}
            title="Search Filters (Source Scope, GIFs, SafeSearch)"
          >
            <SlidersHorizontal size={13} />
            <span>Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}</span>
          </button>

          {showFilters && (
            <div className="popover-card" onMouseLeave={() => setShowFilters(false)}>
              <div className="popover-row">
                <span className="popover-label">Source Scope</span>
                <select
                  className="search-filter-select"
                  value={searchScope}
                  onChange={(e) => onSearchScopeChange(e.target.value)}
                >
                  <option value="all">All Web</option>
                  {goldenSites.length > 0 && (
                    <option value="golden-all">★ Golden List ({goldenSites.length})</option>
                  )}
                  {Array.from(new Set(goldenSites.map((s) => s.group || 'General')))
                    .sort()
                    .map((g) => (
                      <option key={g} value={`group:${g}`}>
                        ★ Group: {g}
                      </option>
                    ))}
                  {searchScope.startsWith('site:') && (
                    <option value={searchScope}>★ {searchScope.replace('site:', '')}</option>
                  )}
                </select>
              </div>

              <div className="popover-row">
                <span className="popover-label">GIFs</span>
                <select
                  className="search-filter-select"
                  value={gifMode}
                  onChange={(e) => onGifModeChange(e.target.value as GifMode)}
                >
                  <option value="exclude">No GIFs</option>
                  <option value="include">Include GIFs</option>
                  <option value="only">GIFs Only</option>
                </select>
              </div>

              <div className="popover-row">
                <span className="popover-label">SafeSearch</span>
                <button
                  type="button"
                  className={`btn btn-sm ${safeSearch ? 'btn-ghost' : 'btn-nsfw'}`}
                  onClick={onToggleSafeSearch}
                >
                  {safeSearch ? <ShieldCheck size={13} /> : <ShieldAlert size={13} />}
                  <span>{safeSearch ? 'Safe ON' : 'NSFW Allowed'}</span>
                </button>
              </div>

              <div className="popover-divider" />

              <button
                type="button"
                className="btn btn-sm btn-ghost"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => {
                  setShowFilters(false);
                  onOpenGoldenList();
                }}
              >
                <Star size={13} fill="#facc15" color="#facc15" />
                <span>Manage Golden List</span>
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={onOpenVideoModal}
          title="Load a video URL, local video, or capture a YouTube Short tab"
        >
          <Video size={13} />
          <span>Video</span>
        </button>
      </div>

      <div className="topbar-center">
        <div className="playback-group">
          <button
            className="btn-icon"
            onClick={onPrev}
            disabled={totalImages === 0}
            title="Previous image (Left Arrow)"
          >
            <SkipBack size={15} />
          </button>

          <button
            className={`btn btn-play ${isPlaying ? 'playing' : ''}`}
            onClick={onTogglePlay}
            disabled={totalImages === 0}
            title="Play / Pause Slideshow (Space)"
          >
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
            <span className="timer-readout">{formatTime(timeRemainingSec)}</span>
            <span className="timer-bar" style={{ width: `${Math.min(100, Math.max(0, progressPct))}%` }} />
          </button>

          <button
            className="btn-icon"
            onClick={onNext}
            disabled={totalImages === 0}
            title="Next image (Right Arrow)"
          >
            <SkipForward size={15} />
          </button>
        </div>

        <div className="dropdown-wrap">
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => setShowTimerMenu((v) => !v)}
            title="Set slideshow interval (30s – 5m)"
          >
            <Clock size={13} />
            <span>{intervalSec >= 60 ? `${Math.round(intervalSec / 60)}m` : `${intervalSec}s`}</span>
          </button>

          {showTimerMenu && (
            <div className="popover-card" onMouseLeave={() => setShowTimerMenu(false)}>
              <div className="preset-pills">
                {TIMER_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    className={`pill ${intervalSec === p.value ? 'active' : ''}`}
                    onClick={() => {
                      onIntervalChange(p.value);
                      setShowTimerMenu(false);
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="control-row" style={{ marginTop: 8 }}>
                <div className="control-header">
                  <span>Custom Timer</span>
                  <span>{formatTime(intervalSec)}</span>
                </div>
                <input
                  type="range"
                  min={30}
                  max={300}
                  step={5}
                  value={intervalSec}
                  onChange={(e) => onIntervalChange(Number(e.target.value))}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="topbar-right">
        <button
          className="btn-icon"
          onClick={onOpenGoldenList}
          title="Golden List — Favorite Reference Sites"
        >
          <Star size={16} fill={goldenSites.length > 0 ? '#facc15' : 'none'} color="#facc15" />
        </button>

        <button
          className={`btn btn-sm btn-ghost ${showArchive ? 'active' : ''}`}
          onClick={onToggleArchive}
          title="Session Archive Lookback"
        >
          <Archive size={14} />
          <span>{totalImages > 0 ? `${currentIndex + 1}/${totalImages}` : '0'}</span>
        </button>

        <button
          className={`btn btn-sm btn-ghost ${shareCopied ? 'active' : ''}`}
          onClick={onCopyShareLink}
          disabled={totalImages === 0}
          title="Copy shareable study link"
        >
          {shareCopied ? <Check size={14} /> : <Share2 size={14} />}
        </button>

        <div className="dropdown-wrap">
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => setShowExportMenu((v) => !v)}
            title="Export / Import"
          >
            <Download size={14} />
            {exportProgress && <span>{exportProgress}</span>}
          </button>

          {showExportMenu && (
            <div className="dropdown-menu" onMouseLeave={() => setShowExportMenu(false)}>
              {totalImages > 0 && (
                <>
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      setShowExportMenu(false);
                      onExportOriginal();
                    }}
                  >
                    <ImageDown size={14} />
                    <span>Download Current Image</span>
                  </button>
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      setShowExportMenu(false);
                      onExportComposite();
                    }}
                  >
                    <Layers size={14} />
                    <span>Export Study (Image + Drawover)</span>
                  </button>
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      setShowExportMenu(false);
                      onExportAllZip();
                    }}
                  >
                    <FolderArchive size={14} />
                    <span>Download All Session ({totalImages}) as ZIP</span>
                  </button>
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      setShowExportMenu(false);
                      onExportSessionFile();
                    }}
                  >
                    <FileJson size={14} />
                    <span>Export Session File (.json)</span>
                  </button>
                </>
              )}
              <label className="dropdown-item">
                <Upload size={14} />
                <span>Import Session File (.json)</span>
                <input
                  type="file"
                  accept=".json,application/json"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setShowExportMenu(false);
                      onImportSessionFile(file);
                    }
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
          )}
        </div>

        <button
          className={`btn-icon ${showInspector ? 'active-icon' : ''}`}
          onClick={onToggleInspector}
          title={showInspector ? 'Hide Studio Controls' : 'Show Studio Controls'}
        >
          <PanelRight size={16} />
        </button>

        <button
          className="btn-icon"
          onClick={() => {
            setTempKey(googleApiKey);
            setTempCx(googleCx);
            setShowSettings(true);
          }}
          title="Google Search API Settings (Optional)"
        >
          <Settings size={16} />
        </button>
      </div>

      {showSettings && (
        <div className="modal-backdrop" onClick={() => setShowSettings(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Search Settings</h3>
              <button className="btn-icon" onClick={() => setShowSettings(false)}>
                <X size={16} />
              </button>
            </div>
            <p className="modal-desc">
              RefStudio searches live in memory without storing any images or queries. Optionally
              provide a Google Custom Search JSON API Key &amp; Engine ID (CX) for official API quota.
            </p>
            <label className="field-label">
              Google API Key (optional)
              <input
                type="password"
                value={tempKey}
                onChange={(e) => setTempKey(e.target.value)}
                placeholder="AIza..."
                className="modal-input"
              />
            </label>
            <label className="field-label">
              Search Engine ID / CX (optional)
              <input
                type="text"
                value={tempCx}
                onChange={(e) => setTempCx(e.target.value)}
                placeholder="0123456789abcdef..."
                className="modal-input"
              />
            </label>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowSettings(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  onSaveGoogleCreds(tempKey.trim(), tempCx.trim());
                  setShowSettings(false);
                }}
              >
                Save for Session
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
