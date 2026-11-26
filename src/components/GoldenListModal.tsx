import React, { useState } from 'react';
import { X, Plus, Pencil, Trash2, ExternalLink, Search, Check, Star, Folder, Dices } from 'lucide-react';
import { GoldenSite } from '../types';

interface GoldenListModalProps {
  isOpen: boolean;
  onClose: () => void;
  sites: GoldenSite[];
  onSaveSites: (sites: GoldenSite[]) => void;
  activeScope: string;
  onSelectScope: (scope: string) => void;
  onRandomPullFromSite: (domain: string) => void;
}

export function normalizeDomain(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  try {
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    return new URL(withProto).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return trimmed
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .split('/')[0]
      .toLowerCase();
  }
}

export const GoldenListModal: React.FC<GoldenListModalProps> = ({
  isOpen,
  onClose,
  sites,
  onSaveSites,
  activeScope,
  onSelectScope,
  onRandomPullFromSite,
}) => {
  const [nameInput, setNameInput] = useState('');
  const [domainInput, setDomainInput] = useState('');
  const [groupInput, setGroupInput] = useState('General');
  const [filterGroup, setFilterGroup] = useState<string>('ALL');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDomain, setEditDomain] = useState('');
  const [editGroup, setEditGroup] = useState('');

  if (!isOpen) return null;

  const groups = Array.from(new Set(sites.map((s) => s.group || 'General'))).sort();

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const domain = normalizeDomain(domainInput);
    if (!domain) return;
    const name = nameInput.trim() || domain;
    const group = groupInput.trim() || 'General';

    const newSite: GoldenSite = {
      id: `gs-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      domain,
      group,
    };
    onSaveSites([...sites, newSite]);
    setNameInput('');
    setDomainInput('');
  };

  const startEdit = (site: GoldenSite) => {
    setEditingId(site.id);
    setEditName(site.name);
    setEditDomain(site.domain);
    setEditGroup(site.group);
  };

  const saveEdit = (id: string) => {
    const domain = normalizeDomain(editDomain);
    if (!domain) return;
    onSaveSites(
      sites.map((s) =>
        s.id === id
          ? {
              ...s,
              name: editName.trim() || domain,
              domain,
              group: editGroup.trim() || 'General',
            }
          : s
      )
    );
    setEditingId(null);
  };

  const handleDelete = (id: string) => {
    onSaveSites(sites.filter((s) => s.id !== id));
  };

  const visibleGroups =
    filterGroup === 'ALL' ? groups : groups.filter((g) => g === filterGroup);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card golden-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Star size={16} color="#facc15" fill="#facc15" />
            <h3>Golden List — Favorite Reference Sites</h3>
          </div>
          <button className="btn-icon" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <p className="modal-desc">
          Save and group your favorite reference websites. Select any group or site to restrict
          searches to those sources, or open them directly.
        </p>

        {/* Add Site Form */}
        <form className="golden-add-form" onSubmit={handleAdd}>
          <input
            type="text"
            placeholder="Name (e.g. Line of Action)"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            className="modal-input"
          />
          <input
            type="text"
            placeholder="Domain or URL (e.g. line-of-action.com)"
            value={domainInput}
            onChange={(e) => setDomainInput(e.target.value)}
            className="modal-input"
            required
          />
          <input
            type="text"
            list="golden-group-suggestions"
            placeholder="Group (e.g. Poses)"
            value={groupInput}
            onChange={(e) => setGroupInput(e.target.value)}
            className="modal-input"
          />
          <datalist id="golden-group-suggestions">
            {groups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
          <button type="submit" className="btn btn-primary btn-sm">
            <Plus size={14} />
            <span>Add</span>
          </button>
        </form>

        {/* Group Filter Pills */}
        <div className="golden-group-tabs">
          <button
            className={`pill ${filterGroup === 'ALL' ? 'active' : ''}`}
            onClick={() => setFilterGroup('ALL')}
          >
            All ({sites.length})
          </button>
          {groups.map((g) => {
            const count = sites.filter((s) => (s.group || 'General') === g).length;
            return (
              <button
                key={g}
                className={`pill ${filterGroup === g ? 'active' : ''}`}
                onClick={() => setFilterGroup(g)}
              >
                {g} ({count})
              </button>
            );
          })}
        </div>

        {/* Grouped Sites List */}
        <div className="golden-list-scroll">
          {sites.length === 0 ? (
            <div className="archive-empty" style={{ padding: 24 }}>
              No sites in your Golden List yet. Add one above!
            </div>
          ) : (
            visibleGroups.map((groupName) => {
              const groupSites = sites.filter((s) => (s.group || 'General') === groupName);
              const groupScope = `group:${groupName}`;
              return (
                <div key={groupName} className="golden-group-block">
                  <div className="golden-group-header">
                    <span className="golden-group-title">
                      <Folder size={13} />
                      <span>{groupName}</span>
                    </span>
                    <button
                      className={`pill ${activeScope === groupScope ? 'active' : ''}`}
                      onClick={() => {
                        onSelectScope(groupScope);
                        onClose();
                      }}
                      title={`Search only sites in "${groupName}"`}
                    >
                      <Search size={10} style={{ marginRight: 4 }} />
                      {activeScope === groupScope ? 'Active Search Group' : 'Use Group in Search'}
                    </button>
                  </div>

                  {groupSites.map((site) => {
                    const siteScope = `site:${site.domain}`;
                    const isEditing = editingId === site.id;

                    if (isEditing) {
                      return (
                        <div key={site.id} className="golden-site-row editing">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="modal-input"
                            placeholder="Name"
                          />
                          <input
                            type="text"
                            value={editDomain}
                            onChange={(e) => setEditDomain(e.target.value)}
                            className="modal-input"
                            placeholder="Domain"
                          />
                          <input
                            type="text"
                            list="golden-group-suggestions"
                            value={editGroup}
                            onChange={(e) => setEditGroup(e.target.value)}
                            className="modal-input"
                            placeholder="Group"
                          />
                          <button
                            className="mini-btn"
                            style={{ background: 'var(--accent)' }}
                            onClick={() => saveEdit(site.id)}
                            title="Save"
                          >
                            <Check size={13} />
                          </button>
                          <button
                            className="mini-btn"
                            onClick={() => setEditingId(null)}
                            title="Cancel"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      );
                    }

                    return (
                      <div key={site.id} className="golden-site-row">
                        <div className="golden-site-info">
                          <span className="golden-site-name">{site.name}</span>
                          <span className="golden-site-domain">{site.domain}</span>
                        </div>
                        <div className="golden-site-actions">
                          <button
                            className="pill active"
                            onClick={() => {
                              onRandomPullFromSite(`https://${site.domain}`);
                              onClose();
                            }}
                            title={`Pull random practice images directly from ${site.domain}`}
                          >
                            <Dices size={11} style={{ marginRight: 3 }} />
                            Random Pull
                          </button>
                          <button
                            className={`pill ${activeScope === siteScope ? 'active' : ''}`}
                            onClick={() => {
                              onSelectScope(siteScope);
                              onClose();
                            }}
                            title={`Search only ${site.domain}`}
                          >
                            <Search size={10} style={{ marginRight: 3 }} />
                            Search
                          </button>
                          <a
                            href={`https://${site.domain}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mini-btn"
                            title={`Open https://${site.domain}`}
                          >
                            <ExternalLink size={12} />
                          </a>
                          <button
                            className="mini-btn"
                            onClick={() => startEdit(site)}
                            title="Edit site"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            className="mini-btn danger"
                            onClick={() => handleDelete(site.id)}
                            title="Remove site"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
