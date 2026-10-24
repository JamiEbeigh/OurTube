import { useMemo, useState } from 'react';
import VideoCard from './VideoCard.jsx';
import Icon from './Icon.jsx';
import { timeAgo } from '../util.js';

const PAGE = 60;

function coverageTitle(f) {
  const parts = [`${f.rss ?? 0} via RSS`];
  if (f.api) parts.push(`${f.api} via the YouTube API (RSS failed)`);
  if (f.cached) parts.push(`${f.cached} from the last successful refresh`);
  if (f.failed) parts.push(`${f.failed} failed`);
  return parts.join(', ');
}

export default function Feed({ ctx, feed, onRefresh, onOpenSettings }) {
  const { settings, auth } = ctx;
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [showErrors, setShowErrors] = useState(false);

  const videos = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = feed.videos || [];
    return q ? list.filter((v) => v.title.toLowerCase().includes(q) || v.channelTitle.toLowerCase().includes(q)) : list;
  }, [feed.videos, query]);

  const configured = settings && settings.googleClientId && settings.googleClientSecret;

  if (!auth.checking && !auth.signedIn) {
    return (
      <div className="page">
        <div className="empty-hero">
          <div className="empty-icon"><Icon name="key" size={34} /></div>
          <h1>{configured ? 'Sign in to see your feed' : 'Welcome to OurTube'}</h1>
          <p>
            {configured
              ? 'Sign in with your Google account to load the latest uploads from the channels you subscribe to.'
              : 'OurTube shows your YouTube subscriptions as a feed and downloads videos to your computer to watch. To read your subscriptions it needs a free Google Cloud key that you create yourself — it takes about 5 minutes, and the setup guide walks you through every click.'}
          </p>
          <button className="btn primary lg" onClick={onOpenSettings}>
            {configured ? 'Go to sign in' : 'Open setup guide'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="toolbar">
        <h1 className="page-title">Subscriptions</h1>
        <div className="search">
          <Icon name="search" size={17} />
          <input value={query} onChange={(e) => { setQuery(e.target.value); setShown(PAGE); }} placeholder="Filter by title or channel" />
          {query && <button className="icon-btn sm" onClick={() => setQuery('')} aria-label="Clear"><Icon name="close" size={14} /></button>}
        </div>
        <div className="toolbar-right">
          {feed.fetchedAt && (
            <span className="muted small" title={coverageTitle(feed)}>
              {feed.failed ? `${feed.channels - feed.failed} of ${feed.channels}` : feed.channels} channels · updated {timeAgo(feed.fetchedAt)}
            </span>
          )}
          <button className="btn" onClick={onRefresh} disabled={feed.loading}>
            <Icon name="refresh" size={16} className={feed.loading ? 'spin' : ''} /> {feed.loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      {feed.error && (
        <div className="banner error">
          <Icon name="alert" size={18} /> <span>{feed.error}</span>
          <button className="btn sm" onClick={onRefresh}>Try again</button>
        </div>
      )}
      {feed.errors?.length > 0 && !feed.loading && (
        <div className="banner warn">
          <Icon name="alert" size={18} />
          <span>
            {feed.failed
              ? `${feed.failed} channel${feed.failed > 1 ? 's' : ''} couldn’t be loaded this time. Try Refresh in a minute.`
              : 'Some details couldn’t be loaded this time.'}
          </span>
          <button className="btn sm ghost" onClick={() => setShowErrors((s) => !s)}>{showErrors ? 'Hide' : 'Details'}</button>
          {showErrors && <ul className="err-list">{feed.errors.slice(0, 30).map((e) => <li key={e}>{e}</li>)}</ul>}
        </div>
      )}

      {feed.loading && !feed.videos?.length ? (
        <div className="grid">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="card skeleton"><div className="thumb" /><div className="sk-line" /><div className="sk-line short" /></div>
          ))}
        </div>
      ) : videos.length === 0 ? (
        <div className="empty-hero small">
          <p>{query ? 'No videos match that filter.' : 'No videos yet. Subscribe to some channels on YouTube, then refresh.'}</p>
        </div>
      ) : (
        <>
          <div className="grid">
            {videos.slice(0, shown).map((v) => <VideoCard key={v.id} video={v} ctx={ctx} />)}
          </div>
          {shown < videos.length && (
            <div className="load-more">
              <button className="btn" onClick={() => setShown((s) => s + PAGE)}>Show more ({videos.length - shown} left)</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
