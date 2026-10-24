import VideoCard from './VideoCard.jsx';
import Icon from './Icon.jsx';

export default function Search({ ctx, search, onMore, onRetry, onBack }) {
  const { query, videos, loading, error, limit } = search;
  return (
    <div className="page">
      <header className="toolbar">
        <button className="icon-btn" onClick={onBack} aria-label="Back"><Icon name="arrowLeft" size={18} /></button>
        <h1 className="page-title">Results for “{query}”</h1>
        {loading && <span className="muted small"><span className="spinner inline" /> Searching YouTube…</span>}
      </header>

      {error && (
        <div className="banner error">
          <Icon name="alert" size={18} /> <span>{error}</span>
          <button className="btn sm" onClick={onRetry}>Try again</button>
        </div>
      )}

      {loading && videos.length === 0 ? (
        <div className="grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card skeleton"><div className="thumb" /><div className="sk-line" /><div className="sk-line short" /></div>
          ))}
        </div>
      ) : videos.length === 0 && !error ? (
        <div className="empty-hero small"><p>No videos found.</p></div>
      ) : (
        <>
          <div className="grid">
            {videos.map((v) => <VideoCard key={v.id} video={v} ctx={ctx} />)}
          </div>
          {videos.length >= limit && limit < 150 && (
            <div className="load-more">
              <button className="btn" onClick={onMore} disabled={loading}>{loading ? 'Loading…' : 'Show more results'}</button>
            </div>
          )}
        </>
      )}
      <p className="muted small search-note">Search runs through yt-dlp, so it doesn’t use any of your Google API quota.</p>
    </div>
  );
}
