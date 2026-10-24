import Icon from './Icon.jsx';
import KebabMenu from './KebabMenu.jsx';
import { formatBytes, formatDuration, timeAgo, ytUrl } from '../util.js';

const META = {
  queue: {
    title: 'Queue',
    blurb: 'Videos here are downloaded right away and play one after another. When you quit, you’ll be asked whether to keep them in Watch Later or delete them.',
    empty: 'Nothing queued. Pick “Add to queue” from any video’s ⋮ menu.',
  },
  watchLater: {
    title: 'Watch Later',
    blurb: 'Saved for later and downloaded in the background, so they’re ready to play offline.',
    empty: 'Nothing saved yet. Pick “Add to Watch Later” from any video’s ⋮ menu.',
  },
  downloaded: {
    title: 'Downloaded',
    blurb: 'Videos you finished watching and chose to keep.',
    empty: 'Nothing here yet. When you close a video, choose “Keep in Downloaded” to save it here.',
  },
};

export default function Library({ ctx, list }) {
  const { library, progress, api, current } = ctx;
  const ids = list === 'queue' ? library.queue : library.playlists[list];
  const videos = ids.map((id) => library.videos[id]).filter(Boolean);
  const meta = META[list];
  const totalSize = videos.reduce((s, v) => s + (v.size || 0), 0);

  const remove = (v) => {
    if (list === 'queue') return api.queueDiscard(v.id, current);
    if (v.id === current) return ctx.toast('Close the video before deleting it.', 'error');
    return api.deleteVideo(v.id);
  };

  return (
    <div className="page">
      <header className="toolbar">
        <h1 className="page-title">{meta.title}</h1>
        <span className="muted small">
          {videos.length} video{videos.length === 1 ? '' : 's'}{totalSize ? ` · ${formatBytes(totalSize)}` : ''}
        </span>
        <div className="toolbar-right">
          {list === 'queue' && videos.length > 0 && (
            <button className="btn primary" onClick={() => ctx.playNow(videos[0].id)}>
              <Icon name="play" size={14} /> Play queue
            </button>
          )}
          <button className="btn ghost" onClick={() => api.openFolder('downloads')}><Icon name="folder" size={16} /> Open folder</button>
        </div>
      </header>
      <p className="muted blurb">{meta.blurb}</p>

      {videos.length === 0 ? (
        <div className="empty-hero small"><p>{meta.empty}</p></div>
      ) : (
        <ul className="rows">
          {videos.map((v, i) => {
            const p = progress[v.id];
            const status =
              v.id === current ? <span className="pill playing">Playing</span>
              : v.status === 'ready' ? <span className="pill ok">Ready{v.size ? ` · ${formatBytes(v.size)}` : ''}</span>
              : v.status === 'downloading' ? <span className="pill busy">{p?.stage || 'Downloading'} {Math.round(p?.percent || 0)}%</span>
              : v.status === 'error' ? <span className="pill err" title={v.error}>Failed: {v.error}</span>
              : <span className="pill">Waiting to download</span>;
            return (
              <li key={v.id} className="row">
                <button
                  className="row-thumb"
                  onClick={() => (list === 'queue' ? ctx.playNow(v.id) : ctx.play(v))}
                  title="Play"
                >
                  <img src={v.thumbnail} alt="" loading="lazy" />
                  {v.duration != null && <span className="duration">{formatDuration(v.duration)}</span>}
                  <span className="thumb-hover"><Icon name="play" size={22} /></span>
                  {v.status === 'downloading' && <span className="thumb-progress"><span style={{ width: `${p?.percent || 0}%` }} /></span>}
                </button>
                <div className="row-text">
                  <div className="row-title">{v.title}</div>
                  <div className="muted small">
                    {v.channelId
                      ? <button className="channel-name" onClick={() => ctx.openChannel({ id: v.channelId, title: v.channelTitle, avatar: v.channelAvatar })}>{v.channelTitle}</button>
                      : v.channelTitle}
                    {v.publishedAt ? ` · ${timeAgo(v.publishedAt)}` : ''}
                  </div>
                  <div className="row-status">{status}</div>
                </div>
                <div className="row-actions">
                  {list === 'queue' && (
                    <>
                      <button className="icon-btn" disabled={i === 0} onClick={() => api.queueMove(v.id, -1)} aria-label="Move up"><Icon name="up" size={16} /></button>
                      <button className="icon-btn" disabled={i === videos.length - 1} onClick={() => api.queueMove(v.id, 1)} aria-label="Move down"><Icon name="down" size={16} /></button>
                    </>
                  )}
                  {v.status === 'error' && <button className="btn sm" onClick={() => api.retryVideo(v.id)}><Icon name="retry" size={14} /> Retry</button>}
                  <KebabMenu
                    items={[
                      { label: 'Play now', icon: 'play', onClick: () => ctx.playNow(v.id) },
                      ...(list !== 'queue' ? [{ label: library.queue.includes(v.id) ? 'In queue' : 'Add to queue', icon: 'queue', disabled: library.queue.includes(v.id) || v.id === current, onClick: () => api.queueAdd(v.id) }] : []),
                      ...(list === 'downloaded' ? [{ label: 'Move to Watch Later', icon: 'clock', onClick: () => ctx.addToWatchLater(v) }] : []),
                      ...(v.status === 'ready' ? [{ label: 'Show file', icon: 'folder', onClick: () => api.showInFolder(v.id) }] : []),
                      ...(v.status === 'downloading' ? [{ label: 'Cancel download', icon: 'close', onClick: () => api.cancelDownload(v.id) }] : []),
                      { label: 'Open on YouTube', icon: 'external', onClick: () => api.openExternal(ytUrl(v.id)) },
                      { label: list === 'queue' ? 'Remove from queue' : 'Delete file', icon: 'trash', onClick: () => remove(v) },
                    ]}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
