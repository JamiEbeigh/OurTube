import { useMemo, useState } from 'react';
import Icon from './Icon.jsx';
import KebabMenu from './KebabMenu.jsx';
import { formatBytes, formatDuration, ytUrl } from '../util.js';

export default function Music({ ctx }) {
  const { library, progress, api, audioNow } = ctx;
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');

  const audioPlaylists = Object.values(library.savedPlaylists || {}).filter((p) => p.mode === 'audio');

  const tracks = useMemo(() => {
    const all = library.audio || {};
    let ids;
    if (filter === 'all') {
      ids = Object.keys(all).sort((a, b) => (all[b].addedAt || 0) - (all[a].addedAt || 0));
    } else {
      ids = (library.savedPlaylists[filter]?.videoIds || []).filter((id) => all[id]);
    }
    const q = query.trim().toLowerCase();
    return ids.map((id) => all[id]).filter((t) => !q || t.title.toLowerCase().includes(q) || (t.channelTitle || '').toLowerCase().includes(q));
  }, [library.audio, library.savedPlaylists, filter, query]);

  const readyIds = tracks.filter((t) => t.status === 'ready').map((t) => t.id);
  const playingId = audioNow ? audioNow.ids[audioNow.index] : null;
  const totalSize = tracks.reduce((s, t) => s + (t.size || 0), 0);

  const playFrom = (id) => {
    const i = readyIds.indexOf(id);
    if (i >= 0) ctx.playAudio(readyIds, i);
  };

  return (
    <div className="page">
      <header className="toolbar">
        <h1 className="page-title">Music</h1>
        <span className="muted small">
          {tracks.length} track{tracks.length === 1 ? '' : 's'}{totalSize ? ` · ${formatBytes(totalSize)}` : ''}
        </span>
        <div className="toolbar-right">
          {readyIds.length > 0 && (
            <>
              <button className="btn primary" onClick={() => ctx.playAudio(readyIds, 0)}><Icon name="play" size={14} /> Play all</button>
              <button className="btn" onClick={() => {
                const shuffled = [...readyIds].sort(() => Math.random() - 0.5);
                ctx.playAudio(shuffled, 0);
              }}><Icon name="shuffle" size={15} /> Shuffle</button>
            </>
          )}
          <button className="btn ghost" onClick={() => api.openFolder('audio')}><Icon name="folder" size={16} /> Open folder</button>
        </div>
      </header>
      <p className="muted blurb">
        Audio you download from a video’s ⋮ menu, or from a playlist saved as audio. Files include cover art and titles,
        so they also work in Apple Music and other players.
      </p>

      {(audioPlaylists.length > 0 || Object.keys(library.audio || {}).length > 8) && (
        <div className="chips">
          <button className={`chip ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>All</button>
          {audioPlaylists.map((p) => (
            <button key={p.id} className={`chip ${filter === p.id ? 'on' : ''}`} onClick={() => setFilter(p.id)}>{p.title}</button>
          ))}
          <div className="search chip-search">
            <Icon name="search" size={15} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter" />
          </div>
        </div>
      )}

      {tracks.length === 0 ? (
        <div className="empty-hero small">
          <p>{query ? 'No tracks match that filter.' : 'No music yet. Pick “Download audio” from any video’s ⋮ menu, or open a playlist and choose “Download all → Audio”.'}</p>
        </div>
      ) : (
        <ol className="tracks">
          {tracks.map((t, i) => {
            const p = progress[`a:${t.id}`];
            const isNow = t.id === playingId;
            return (
              <li key={t.id} className={`track ${isNow ? 'now' : ''}`} onDoubleClick={() => t.status === 'ready' && playFrom(t.id)}>
                <span className="track-num">
                  {isNow ? <span className="eq"><i /><i /><i /></span> : (
                    <>
                      <span className="n">{i + 1}</span>
                      {t.status === 'ready' && <button className="track-play" onClick={() => playFrom(t.id)} aria-label="Play"><Icon name="play" size={14} /></button>}
                    </>
                  )}
                </span>
                <div className="track-cover">{t.thumbnail && <img src={t.thumbnail} alt="" loading="lazy" />}</div>
                <div className="track-text">
                  <div className="track-title">{t.title}</div>
                  <div className="muted small">
                    {t.channelId
                      ? <button className="channel-name" onClick={() => ctx.openChannel({ id: t.channelId, title: t.channelTitle, avatar: t.channelAvatar })}>{t.channelTitle}</button>
                      : t.channelTitle}
                  </div>
                </div>
                <div className="track-status">
                  {t.status === 'downloading' && <span className="pill busy">{p?.stage && p.stage !== 'Downloading' ? p.stage : `Downloading ${Math.round(p?.percent || 0)}%`}</span>}
                  {t.status === 'pending' && <span className="pill">Waiting to download</span>}
                  {t.status === 'error' && <span className="pill err" title={t.error}>Failed: {t.error}</span>}
                  {t.status === 'ready' && t.size ? <span className="muted small">{formatBytes(t.size)}</span> : null}
                </div>
                <span className="track-dur muted small">{t.duration ? formatDuration(t.duration) : ''}</span>
                <div className="track-actions">
                  {t.status === 'error' && <button className="btn sm" onClick={() => api.retryAudio(t.id)}><Icon name="retry" size={14} /> Retry</button>}
                  <KebabMenu
                    items={[
                      ...(t.status === 'ready' ? [
                        { label: 'Play', icon: 'play', onClick: () => playFrom(t.id) },
                        { label: 'Show file', icon: 'folder', onClick: () => api.showAudioInFolder(t.id) },
                      ] : []),
                      { label: 'Watch video', icon: 'video', onClick: () => ctx.play(t) },
                      { label: 'Open on YouTube', icon: 'external', onClick: () => api.openExternal(ytUrl(t.id)) },
                      ...(t.status === 'downloading' ? [{ label: 'Cancel download', icon: 'close', onClick: () => api.cancelDownload(`a:${t.id}`) }] : []),
                      { label: 'Delete', icon: 'trash', onClick: () => api.deleteAudio(t.id) },
                    ]}
                  />
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
