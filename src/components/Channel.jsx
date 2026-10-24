import { useCallback, useEffect, useState } from 'react';
import VideoCard from './VideoCard.jsx';
import Icon from './Icon.jsx';
import { formatViews } from '../util.js';

// Remember loaded channels for this session so Back is instant.
const cache = new Map();

const fmtSubs = (n) => (n == null ? '' : formatViews(n).replace(/views?$/, n === 1 ? 'subscriber' : 'subscribers'));

export default function Channel({ ctx, channel, onBack }) {
  const cached = cache.get(channel.id);
  const [info, setInfo] = useState(cached?.info || null);
  const [videos, setVideos] = useState(cached?.videos || []);
  const [next, setNext] = useState(cached?.next ?? null);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState(null);

  const load = useCallback(async (page) => {
    setLoading(true);
    setError(null);
    try {
      const res = await ctx.api.loadChannel(channel.id, page || null);
      setInfo((cur) => res.info || cur);
      setVideos((cur) => {
        const merged = page ? [...cur, ...res.videos.filter((v) => !cur.some((c) => c.id === v.id))] : res.videos;
        cache.set(channel.id, { info: res.info || cache.get(channel.id)?.info, videos: merged, next: res.next });
        return merged;
      });
      setNext(res.next);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [ctx.api, channel.id]);

  useEffect(() => { if (!cached) load(null); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const title = info?.title || channel.title;
  const avatar = info?.avatar || channel.avatar;

  return (
    <div className="page channel-page">
      <header className="toolbar">
        <button className="icon-btn" onClick={onBack} aria-label="Back"><Icon name="arrowLeft" size={18} /></button>
        <h1 className="page-title">{title}</h1>
      </header>

      {info?.banner && <div className="ch-banner" style={{ backgroundImage: `url("${info.banner}")` }} />}
      <div className="ch-header">
        {avatar ? <img className="ch-header-avatar" src={avatar} alt="" /> : <span className="ch-header-avatar fallback">{title?.[0]}</span>}
        <div className="grow">
          <h2>{title}</h2>
          <div className="muted small">
            {[info?.handle, fmtSubs(info?.subscribers), info?.videoCount ? `${info.videoCount.toLocaleString()} videos` : null].filter(Boolean).join(' · ')}
          </div>
          {info?.description && <p className="ch-desc">{info.description}</p>}
        </div>
        <div className="ch-actions">
          {info?.subscribed && <span className="pill ok"><Icon name="check" size={12} strokeWidth={2.4} /> Subscribed</span>}
          <button className="btn ghost sm" onClick={() => ctx.api.openExternal(`https://www.youtube.com/channel/${channel.id}`)}>
            <Icon name="external" size={15} /> YouTube
          </button>
        </div>
      </div>

      <h3 className="section-title">Videos</h3>

      {error && (
        <div className="banner error">
          <Icon name="alert" size={18} /> <span>{error}</span>
          <button className="btn sm" onClick={() => load(videos.length ? next : null)}>Try again</button>
        </div>
      )}

      {loading && videos.length === 0 ? (
        <div className="grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card skeleton"><div className="thumb" /><div className="sk-line" /><div className="sk-line short" /></div>
          ))}
        </div>
      ) : videos.length === 0 && !error ? (
        <div className="empty-hero small"><p>No videos to show.</p></div>
      ) : (
        <>
          <div className="grid">
            {videos.map((v) => <VideoCard key={v.id} video={v} ctx={ctx} hideChannel />)}
          </div>
          {next && (
            <div className="load-more">
              <button className="btn" onClick={() => load(next)} disabled={loading}>{loading ? 'Loading…' : 'Load more'}</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
