import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import logo from '../assets/logo.png';

function SearchBox({ onSearch, initial }) {
  const [q, setQ] = useState(initial || '');
  const ref = useRef(null);
  useEffect(() => { setQ(initial || ''); }, [initial]);
  // "/" or Cmd/Ctrl+K focuses the search box from anywhere.
  useEffect(() => {
    const onKey = (e) => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName);
      if ((e.key === '/' && !typing) || (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        ref.current?.focus();
        ref.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <form className="side-search" onSubmit={(e) => { e.preventDefault(); if (q.trim()) { onSearch(q); ref.current?.blur(); } }}>
      <Icon name="search" size={16} />
      <input ref={ref} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search YouTube" aria-label="Search YouTube" />
      {!q && <kbd>/</kbd>}
    </form>
  );
}

export default function Sidebar({ view, onNavigate, onSearch, searchQuery, library, activeDownloads, auth, playing, paused, playerExpanded, onShowPlayer, ytPlaylists, currentPlaylistId, onOpenPlaylist, onRefreshPlaylists }) {
  const items = [
    { key: 'home', label: 'Home', icon: 'home' },
    { key: 'queue', label: 'Queue', icon: 'queue', count: library.queue.length },
    { key: 'watchLater', label: 'Watch Later', icon: 'clock', count: library.playlists.watchLater.length },
    { key: 'downloaded', label: 'Downloaded', icon: 'download', count: library.playlists.downloaded.length },
    { key: 'music', label: 'Music', icon: 'music', count: Object.keys(library.audio || {}).length },
  ];
  const saved = library.savedPlaylists || {};
  const lists = ytPlaylists?.items || [];
  const fullView = playing && playerExpanded;
  return (
    <nav className="sidebar">
      <div className="brand">
        <img className="brand-logo" src={logo} alt="" />
        <span>OurTube</span>
      </div>

      <SearchBox onSearch={onSearch} initial={searchQuery} />

      <div className="nav-group">
        {playing && (
          <button className={`nav-item now-playing ${playerExpanded ? 'active' : ''}`} onClick={onShowPlayer}>
            <span className={`eq ${paused ? 'paused' : ''}`}><i /><i /><i /></span>
            <span>Now playing</span>
          </button>
        )}
        {items.map((it) => (
          <button
            key={it.key}
            className={`nav-item ${view === it.key && !(playing && playerExpanded) ? 'active' : ''}`}
            onClick={() => onNavigate(it.key)}
          >
            <Icon name={it.icon} />
            <span>{it.label}</span>
            {it.count > 0 && <span className="count">{it.count}</span>}
          </button>
        ))}
      </div>

      {(auth.signedIn || lists.length > 0) && (
        <div className="nav-section">
          <div className="nav-section-head">
            <span>Your playlists</span>
            <button className="icon-btn xs" onClick={onRefreshPlaylists} aria-label="Refresh playlists" title="Refresh playlists">
              <Icon name="refresh" size={13} className={ytPlaylists?.loading ? 'spin' : ''} />
            </button>
          </div>
          <div className="nav-scroll">
            {lists.length === 0 && (
              <div className="muted small nav-note">
                {ytPlaylists?.loading ? 'Loading…' : ytPlaylists?.error ? 'Couldn’t load playlists.' : 'No playlists on your account.'}
              </div>
            )}
            {lists.map((p) => {
              const s = saved[p.id];
              return (
                <button
                  key={p.id}
                  className={`nav-item sm ${currentPlaylistId === p.id && !fullView ? 'active' : ''}`}
                  onClick={() => onOpenPlaylist(p)}
                  title={p.title}
                >
                  <Icon name={p.special === 'likes' ? 'heart' : 'playlist'} size={18} />
                  <span className="nav-label">{p.title}</span>
                  {s && <Icon name={s.mode === 'audio' ? 'music' : 'download'} size={14} className="saved-mark" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="nav-spacer" />

      {activeDownloads > 0 && (
        <div className="dl-indicator">
          <span className="spinner" /> {activeDownloads} download{activeDownloads > 1 ? 's' : ''} in progress
        </div>
      )}

      <button
        className={`nav-item ${view === 'settings' && !(playing && playerExpanded) ? 'active' : ''}`}
        onClick={() => onNavigate('settings')}
      >
        <Icon name="settings" />
        <span>Settings</span>
      </button>

      <div className="account">
        {auth.signedIn && auth.profile ? (
          <>
            {auth.profile.avatar ? <img src={auth.profile.avatar} alt="" /> : <span className="avatar-fallback">{auth.profile.name?.[0]}</span>}
            <span className="account-name">{auth.profile.name}</span>
          </>
        ) : (
          <span className="muted small">{auth.checking ? 'Checking sign-in…' : auth.signedIn ? 'Signed in' : 'Not signed in'}</span>
        )}
      </div>
    </nav>
  );
}
