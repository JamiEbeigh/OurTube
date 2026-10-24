import Icon from './Icon.jsx';
import KebabMenu from './KebabMenu.jsx';
import { formatDuration, formatViews, timeAgo, ytUrl } from '../util.js';

export default function VideoCard({ video, ctx, hideChannel = false }) {
  const { library, progress, current, pending } = ctx;
  const rec = library.videos[video.id];
  const inWatchLater = library.playlists.watchLater.includes(video.id);
  const inQueue = library.queue.includes(video.id);
  const prog = progress[video.id];
  const isPlaying = current === video.id;
  const audioRec = library.audio?.[video.id];
  const audioProg = progress[`a:${video.id}`];
  const busy = !!current || pending?.mode === 'open';

  let badge = null;
  if (isPlaying) badge = <span className="state-badge playing"><Icon name="play" size={11} /> Playing</span>;
  else if (rec?.status === 'ready') badge = <span className="state-badge ready"><Icon name="check" size={12} strokeWidth={2.4} /> Downloaded</span>;
  else if (rec?.status === 'downloading') badge = <span className="state-badge busy">{Math.round(prog?.percent || 0)}%</span>;
  else if (rec?.status === 'error') badge = <span className="state-badge err"><Icon name="alert" size={12} /> Failed</span>;

  const openChannel = (e) => {
    e.stopPropagation();
    ctx.openChannel({ id: video.channelId, title: video.channelTitle, avatar: video.channelAvatar });
  };
  const canOpenChannel = !hideChannel && !!video.channelId;

  return (
    <article
      className="card"
      onClick={() => ctx.play(video)}
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && ctx.play(video)}
      title={busy && !isPlaying ? 'Click to add to the queue' : undefined}
    >
      <div className="thumb">
        <img src={video.thumbnail} alt="" loading="lazy" />
        {video.duration != null && <span className="duration">{formatDuration(video.duration)}</span>}
        {badge}
        {(inWatchLater || inQueue || audioRec) && (
          <span className="list-flags">
            {audioRec && (
              <span title={audioRec.status === 'ready' ? 'Audio downloaded' : audioRec.status === 'error' ? 'Audio download failed' : `Downloading audio ${Math.round(audioProg?.percent || 0)}%`}
                className={audioRec.status === 'ready' ? 'ok' : audioRec.status === 'error' ? 'err' : 'busy'}>
                <Icon name="music" size={13} />
              </span>
            )}
            {inQueue && <span title="In queue"><Icon name="queue" size={14} /></span>}
            {inWatchLater && <span title="In Watch Later"><Icon name="clock" size={14} /></span>}
          </span>
        )}
        {rec?.status === 'downloading' && (
          <span className="thumb-progress"><span style={{ width: `${prog?.percent || 0}%` }} /></span>
        )}
        <span className="thumb-hover">
          <Icon name={busy && !isPlaying ? 'queue' : 'play'} size={28} />
          {busy && !isPlaying && <span className="thumb-hover-label">Add to queue</span>}
        </span>
      </div>
      <div className="card-body">
        {!hideChannel && (
          video.channelAvatar
            ? <img className={`ch-avatar ${canOpenChannel ? 'clickable' : ''}`} src={video.channelAvatar} alt="" loading="lazy" onClick={canOpenChannel ? openChannel : undefined} />
            : <span className={`ch-avatar fallback ${canOpenChannel ? 'clickable' : ''}`} onClick={canOpenChannel ? openChannel : undefined}>{video.channelTitle?.[0]}</span>
        )}
        <div className="card-text">
          <h3 className="card-title" title={video.title}>{video.title}</h3>
          {!hideChannel && (
            canOpenChannel
              ? <button className="card-meta channel-name" onClick={openChannel} title={`View ${video.channelTitle}`}>{video.channelTitle}</button>
              : <div className="card-meta">{video.channelTitle}</div>
          )}
          <div className="card-meta">
            {[formatViews(video.views), timeAgo(video.publishedAt)].filter(Boolean).join(' • ')}
          </div>
        </div>
        <KebabMenu
          items={[
            ...(busy && !isPlaying ? [{ label: 'Play now', hint: 'Stop the current video and switch', icon: 'play', onClick: () => ctx.playNow(video) }] : []),
            {
              label: inWatchLater ? 'In Watch Later' : 'Add to Watch Later',
              hint: inWatchLater ? null : 'Download and save for later',
              icon: 'clock',
              disabled: inWatchLater,
              onClick: () => ctx.addToWatchLater(video),
            },
            {
              label: inQueue ? 'In queue' : 'Add to queue',
              hint: inQueue ? null : 'Download now, play after current video',
              icon: 'queue',
              disabled: inQueue || isPlaying,
              onClick: () => ctx.addToQueue(video),
            },
            {
              label: audioRec?.status === 'ready' ? 'Play audio' : audioRec && audioRec.status !== 'error' ? 'Downloading audio…' : 'Download audio',
              hint: audioRec?.status === 'ready' ? 'Already in Music' : audioRec && audioRec.status !== 'error' ? null : 'Save just the sound (for music)',
              icon: 'music',
              disabled: !!audioRec && audioRec.status !== 'ready' && audioRec.status !== 'error',
              onClick: () => (audioRec?.status === 'ready' ? ctx.playAudio([video.id]) : ctx.downloadAudio(video)),
            },
            ...(canOpenChannel ? [{ label: 'Go to channel', icon: 'user', onClick: () => ctx.openChannel({ id: video.channelId, title: video.channelTitle, avatar: video.channelAvatar }) }] : []),
            { label: 'Open on YouTube', icon: 'external', onClick: () => ctx.api.openExternal(ytUrl(video.id)) },
          ]}
        />
      </div>
    </article>
  );
}
