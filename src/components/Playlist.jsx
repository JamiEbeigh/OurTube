import { useCallback, useEffect, useState } from 'react';
import VideoCard from './VideoCard.jsx';
import Icon from './Icon.jsx';
import KebabMenu from './KebabMenu.jsx';
import { ConfirmModal } from './Modals.jsx';

// Loaded pages, remembered for this session so Back is instant.
const cache = new Map();

export default function Playlist({ ctx, playlist, onBack }) {
  const { api, library, guard, toast } = ctx;
  const cached = cache.get(playlist.id);
  const [videos, setVideos] = useState(cached?.videos || []);
  const [next, setNext] = useState(cached?.next ?? null);
  const [total, setTotal] = useState(cached?.total ?? playlist.count ?? null);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(null); // 'video' | 'audio' while fetching the full list
  const [confirmRemove, setConfirmRemove] = useState(false);

  const saved = library.savedPlaylists?.[playlist.id];

  const load = useCallback(async (pageToken) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.loadPlaylist(playlist.id, pageToken || null);
      setVideos((cur) => {
        const merged = pageToken ? [...cur, ...res.videos.filter((v) => !cur.some((c) => c.id === v.id))] : res.videos;
        cache.set(playlist.id, { videos: merged, next: res.next, total: res.total });
        return merged;
      });
      setNext(res.next);
      if (res.total != null) setTotal(res.total);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [api, playlist.id]);

  useEffect(() => { if (!cached) load(null); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Offline fallback: show the saved copy if the playlist can't be loaded.
  const savedVideos = saved
    ? saved.videoIds.map((id) => (saved.mode === 'audio' ? library.audio?.[id] : library.videos[id])).filter(Boolean)
    : [];
  const shown = videos.length ? videos : error ? savedVideos : [];

  const save = async (mode) => {
    setSaving(mode);
    const res = await guard(() => api.savePlaylist(
      { id: playlist.id, title: playlist.title, thumbnail: playlist.thumbnail, channelTitle: playlist.channelTitle },
      mode,
    ));
    setSaving(null);
    if (!res) return;
    if (saved && saved.mode === mode) {
      toast(res.added ? `Found ${res.added} new video${res.added === 1 ? '' : 's'}. Downloading now.` : 'Already up to date');
    } else {
      toast(`Downloading ${res.total} ${mode === 'audio' ? 'track' : 'video'}${res.total === 1 ? '' : 's'} from “${playlist.title}”`);
    }
  };

  // Download progress for the saved copy.
  let stats = null;
  if (saved) {
    const recs = saved.videoIds.map((id) => (saved.mode === 'audio' ? library.audio?.[id] : library.videos[id]));
    stats = {
      total: saved.videoIds.length,
      ready: recs.filter((r) => r?.status === 'ready').length,
      failed: recs.filter((r) => r?.status === 'error').length,
    };
    stats.busy = stats.total - stats.ready - stats.failed;
  }
  const audioReadyIds = saved?.mode === 'audio' ? saved.videoIds.filter((id) => library.audio?.[id]?.status === 'ready') : [];

  const downloadMenu = [
    { label: 'Videos', hint: 'Watch offline in OurTube', icon: 'video', onClick: () => save('video') },
    { label: 'Audio only', hint: 'For music. Saved to your Music page', icon: 'music', onClick: () => save('audio') },
  ];

  return (
    <div className="page">
      <header className="toolbar">
        <button className="icon-btn" onClick={onBack} aria-label="Back"><Icon name="arrowLeft" size={18} /></button>
        <h1 className="page-title">{playlist.title}</h1>
      </header>

      <div className="pl-header">
        <div className="pl-cover">
          {(playlist.thumbnail || shown[0]?.thumbnail) ? <img src={playlist.thumbnail || shown[0]?.thumbnail} alt="" /> : <Icon name={playlist.special === 'likes' ? 'heart' : 'playlist'} size={40} />}
          {total != null && <span className="pl-count">{total} video{total === 1 ? '' : 's'}</span>}
        </div>
        <div className="pl-info">
          <h2>{playlist.title}</h2>
          <div className="muted small">
            {[playlist.special === 'likes' ? 'Videos you liked on YouTube' : playlist.privacy ? capitalize(playlist.privacy) : null,
              total != null ? `${total} videos` : null].filter(Boolean).join(' · ')}
          </div>
          {playlist.description && <p className="ch-desc">{playlist.description}</p>}

          {saved ? (
            <div className="pl-saved">
              <div className="pl-saved-row">
                <Icon name={saved.mode === 'audio' ? 'music' : 'download'} size={16} />
                <span>
                  Saved for offline as <b>{saved.mode === 'audio' ? 'audio' : 'videos'}</b> · {stats.ready} of {stats.total} downloaded
                  {stats.failed > 0 && <span className="err-text"> · {stats.failed} failed</span>}
                </span>
              </div>
              <div className="pl-progress"><span style={{ width: `${stats.total ? (stats.ready / stats.total) * 100 : 0}%` }} /></div>
              <div className="btn-row wrap">
                {saved.mode === 'audio' && audioReadyIds.length > 0 && (
                  <button className="btn primary" onClick={() => ctx.playAudio(audioReadyIds, 0)}><Icon name="play" size={14} /> Play all</button>
                )}
                <button className="btn" disabled={!!saving} onClick={() => save(saved.mode)}>
                  <Icon name="refresh" size={15} className={saving ? 'spin' : ''} /> {saving ? 'Checking…' : 'Check for new videos'}
                </button>
                {stats.failed > 0 && <button className="btn" onClick={() => api.retryPlaylist(playlist.id)}><Icon name="retry" size={15} /> Retry failed</button>}
                {saved.mode === 'audio' && <button className="btn ghost" onClick={() => ctx.navigate('music')}><Icon name="music" size={15} /> Open in Music</button>}
                <button className="btn ghost danger" onClick={() => setConfirmRemove(true)}><Icon name="trash" size={15} /> Remove download</button>
              </div>
            </div>
          ) : (
            <div className="btn-row wrap pl-actions">
              {saving ? (
                <button className="btn primary" disabled><span className="spinner inline" /> Getting the full playlist…</button>
              ) : (
                <KebabMenu buttonLabel="Download all" buttonIcon="download" items={downloadMenu} />
              )}
              <button className="btn ghost" onClick={() => api.openExternal(`https://www.youtube.com/playlist?list=${playlist.id}`)}>
                <Icon name="external" size={15} /> YouTube
              </button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="banner error">
          <Icon name="alert" size={18} />
          <span>{error}{savedVideos.length ? ' Showing your downloaded copy.' : ''}</span>
          <button className="btn sm" onClick={() => load(videos.length ? next : null)}>Try again</button>
        </div>
      )}

      {loading && shown.length === 0 ? (
        <div className="grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card skeleton"><div className="thumb" /><div className="sk-line" /><div className="sk-line short" /></div>
          ))}
        </div>
      ) : shown.length === 0 && !error ? (
        <div className="empty-hero small"><p>This playlist is empty.</p></div>
      ) : (
        <>
          <div className="grid">
            {shown.map((v) => <VideoCard key={v.id} video={v} ctx={ctx} />)}
          </div>
          {next && videos.length > 0 && (
            <div className="load-more">
              <button className="btn" onClick={() => load(next)} disabled={loading}>{loading ? 'Loading…' : 'Load more'}</button>
            </div>
          )}
        </>
      )}

      {confirmRemove && (
        <ConfirmModal
          title={`Remove the offline copy of “${playlist.title}”?`}
          body={saved?.mode === 'audio'
            ? 'Tracks you also downloaded on their own stay in Music.'
            : 'Videos that are also in Watch Later, Downloaded or your queue are kept.'}
          options={[
            { label: 'Keep the files', value: 'keep' },
            { label: 'Delete the files', value: 'delete', danger: true, primary: true },
          ]}
          onChoose={(v) => { setConfirmRemove(false); api.unsavePlaylist(playlist.id, v === 'delete', ctx.current); }}
          onCancel={() => setConfirmRemove(false)}
        />
      )}
    </div>
  );
}

function capitalize(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
