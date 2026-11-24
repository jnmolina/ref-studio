import React from 'react';
import { X, Download, Trash2, FolderArchive, ExternalLink } from 'lucide-react';
import { RefImage } from '../types';
import { getProxiedUrl } from '../utils/exportUtils';

interface ArchiveDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  images: RefImage[];
  currentIndex: number;
  onSelectIndex: (idx: number) => void;
  onDownloadOne: (img: RefImage, idx: number) => void;
  onRemoveOne: (id: string) => void;
  onDownloadAll: () => void;
}

export const ArchiveDrawer: React.FC<ArchiveDrawerProps> = ({
  isOpen,
  onClose,
  images,
  currentIndex,
  onSelectIndex,
  onDownloadOne,
  onRemoveOne,
  onDownloadAll,
}) => {
  if (!isOpen) return null;

  return (
    <div className="archive-drawer">
      <div className="archive-header">
        <div>
          <h3>Session Archive ({images.length})</h3>
          <p className="archive-sub">In-memory only · nothing is stored on disk</p>
        </div>
        <div className="archive-actions">
          <button
            className="btn btn-primary btn-sm"
            onClick={onDownloadAll}
            disabled={images.length === 0}
          >
            <FolderArchive size={13} />
            <span>Export All ZIP</span>
          </button>
          <button className="btn-icon" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
      </div>

      {images.length === 0 ? (
        <div className="archive-empty">No images in this session yet. Search a theme to begin.</div>
      ) : (
        <div className="archive-grid">
          {images.map((img, idx) => (
            <div
              key={img.id}
              className={`archive-card ${idx === currentIndex ? 'active' : ''}`}
              onClick={() => onSelectIndex(idx)}
            >
              <img src={getProxiedUrl(img.thumbnail)} alt={img.title} loading="lazy" />
              <div className="archive-card-overlay">
                <span className="archive-idx">#{idx + 1}</span>
                <div className="archive-card-btns">
                  {/^https?:\/\//i.test(img.pageUrl || img.url) && (
                    <a
                      href={img.pageUrl || img.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mini-btn"
                      title="Open source page"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink size={12} />
                    </a>
                  )}
                  <button
                    className="mini-btn"
                    title="Download image"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDownloadOne(img, idx);
                    }}
                  >
                    <Download size={12} />
                  </button>
                  <button
                    className="mini-btn danger"
                    title="Remove from session"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveOne(img.id);
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
