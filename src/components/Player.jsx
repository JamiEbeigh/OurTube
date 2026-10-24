import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { formatDuration, timeAgo, ytUrl } from '../util.js';

const HIDE_AFTER = 2500;
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

const fmt = (s) => formatDuration(Number.isFinite(s) ? Math.max(0, s) : 0);
const readPref = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const writePref = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

function DownloadState({ rec, prog, onRetry, onCancel }) {
  if (rec.status === 'error') {
    return (
      <div className="dl-state">
        <Icon name="alert" size={32} />
        <p className="dl-title">Download failed</p>
        <p className="dl-sub">{rec.error}</p>
        <button className="btn primary" onClick={onRetry}><Icon name="retry" size={16} /> Try again</button>
      </div>
    );
  }
  const pct = prog?.percent || 0;
  return (
    <div className="dl-state">
      <div className="ring" style={{ '--p': pct }}><span>{Math.round(pct)}%</span></div>
      <p className="dl-title">{prog?.stage || 'Downloading…'}</p>
      <p className="dl-sub">{[prog?.speed, prog?.eta && prog.eta !== 'Unknown' ? `${prog.eta} left` : null].filter(Boolean).join(' · ')}</p>
      <button className="btn ghost sm" onClick={onCancel}>Cancel download</button>
    </div>
  );
}

function SeekBar({ time, duration, buffered, onSeek, onScrub, compact }) {
  const ref = useRef(null);
  const [hover, setHover] = useState(null);
  const dragging = useRef(false);
  const ratioAt = (e) => {
    const r = ref.current.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  };
  const played = duration ? (time / duration) * 100 : 0;
  const loaded = duration ? (buffered / duration) * 100 : 0;
  return (
    <div
      ref={ref}
      className={`seek ${compact ? 'compact' : ''}`}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => {
        e.stopPropagation();
        ref.current.setPointerCapture(e.pointerId);
        dragging.current = true;
        onScrub(true);
        onSeek(ratioAt(e) * duration);
      }}
      onPointerMove={(e) => {
        setHover(ratioAt(e));
        if (dragging.current) onSeek(ratioAt(e) * duration);
      }}
      onPointerUp={(e) => {
        dragging.current = false;
        ref.current.releasePointerCapture(e.pointerId);
        onScrub(false);
      }}
      onPointerLeave={() => setHover(null)}
    >
      <div className="seek-track">
        <div className="seek-loaded" style={{ width: `${loaded}%` }} />
        {hover != null && <div className="seek-hover" style={{ width: `${hover * 100}%` }} />}
        <div className="seek-played" style={{ width: `${played}%` }} />
        <div className="seek-thumb" style={{ left: `${played}%` }} />
      </div>
      {hover != null && !compact && duration > 0 && (
        <div className="seek-tip" style={{ left: `${hover * 100}%` }}>{fmt(hover * duration)}</div>
      )}
    </div>
  );
}

export default function Player({ ctx, id, expanded, onExpand, onMinimize, onClose, onEnded, onPausedChange }) {
  const { library, progress, api } = ctx;
  const rec = library.videos[id];
  const prog = progress[id];
  const ready = rec?.status === 'ready';

  const stageRef = useRef(null);
  const videoRef = useRef(null);
  const hideTimer = useRef(null);
  const clickTimer = useRef(null);

  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(() => readPref('volume', 1));
  const [muted, setMuted] = useState(() => readPref('muted', false));
  const [rate, setRate] = useState(() => readPref('rate', 1));
  const [active, setActive] = useState(true);
  const [overControls, setOverControls] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const [speedOpen, setSpeedOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  // The sidebar's "Now playing" bars only animate while the video plays.
  useEffect(() => { onPausedChange?.(!(ready && playing)); }, [ready, playing, onPausedChange]);
  useEffect(() => () => onPausedChange?.(false), [onPausedChange]);

  // One flag drives every overlay (buttons, title, seek bar) so they always
  // appear and disappear together.
  const visible = !playing || active || overControls || scrubbing || speedOpen;

  const poke = useCallback(() => {
    setActive(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setActive(false), HIDE_AFTER);
  }, []);
  useEffect(() => () => { clearTimeout(hideTimer.current); clearTimeout(clickTimer.current); }, []);
  useEffect(() => { poke(); }, [expanded, id, poke]);

  // Starting music pauses the video.
  useEffect(() => {
    const onAudio = () => videoRef.current?.pause();
    window.addEventListener('ourtube:audio-play', onAudio);
    return () => window.removeEventListener('ourtube:audio-play', onAudio);
  }, []);

  // Keep the element in sync with saved preferences.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = volume;
    v.muted = muted;
    v.playbackRate = rate;
  }, [volume, muted, rate, ready, id]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused || v.ended) v.play().catch(() => {});
    else v.pause();
    poke();
  }, [poke]);

  const seekTo = useCallback((t) => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(t)) return;
    v.currentTime = Math.min(Math.max(0, t), v.duration || t);
    setTime(v.currentTime);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else stageRef.current?.requestFullscreen().catch(() => {});
  }, []);

  useEffect(() => {
    const onFs = () => setFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  // Leaving the expanded view exits fullscreen.
  useEffect(() => {
    if (!expanded && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }, [expanded]);

  // Keyboard shortcuts (expanded player only).
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e) => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || document.querySelector('.modal')) return;
      const v = videoRef.current;
      switch (e.key) {
        case ' ': case 'k': e.preventDefault(); togglePlay(); break;
        case 'ArrowLeft': if (v) { e.preventDefault(); seekTo(v.currentTime - 5); poke(); } break;
        case 'ArrowRight': if (v) { e.preventDefault(); seekTo(v.currentTime + 5); poke(); } break;
        case 'j': if (v) { seekTo(v.currentTime - 10); poke(); } break;
        case 'l': if (v) { seekTo(v.currentTime + 10); poke(); } break;
        case 'm': setMuted((m) => { writePref('muted', !m); return !m; }); poke(); break;
        case 'f': toggleFullscreen(); break;
        case 'Escape': if (!document.fullscreenElement) onMinimize(); break;
        default:
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded, togglePlay, seekTo, toggleFullscreen, onMinimize, poke]);

  // OS media keys / Now Playing widget.
  useEffect(() => {
    if (!('mediaSession' in navigator) || !rec) return;
    navigator.mediaSession.metadata = new window.MediaMetadata({
      title: rec.title, artist: rec.channelTitle,
      artwork: rec.thumbnail ? [{ src: rec.thumbnail, sizes: '480x360', type: 'image/jpeg' }] : [],
    });
    navigator.mediaSession.setActionHandler('play', () => videoRef.current?.play());
    navigator.mediaSession.setActionHandler('pause', () => videoRef.current?.pause());
    navigator.mediaSession.setActionHandler('nexttrack', library.queue.length ? () => ctx.playNext() : null);
    return () => {
      for (const a of ['play', 'pause', 'nexttrack']) { try { navigator.mediaSession.setActionHandler(a, null); } catch {} }
    };
  }, [rec?.id, library.queue.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!rec) return null;
  const queue = library.queue.map((qid) => library.videos[qid]).filter(Boolean);
  const hasNext = queue.length > 0;

  // Expanded: single click toggles play, double click toggles fullscreen.
  // Mini: a click on the picture expands the player and never pauses it.
  const onSurfaceClick = (e) => {
    e.stopPropagation();
    if (!expanded) { onExpand(); return; }
    clearTimeout(clickTimer.current);
    clickTimer.current = setTimeout(togglePlay, 220);
  };
  const onSurfaceDouble = (e) => {
    e.stopPropagation();
    if (!expanded) return;
    clearTimeout(clickTimer.current);
    toggleFullscreen();
  };

  const stop = (e) => e.stopPropagation();
  const controlsHandlers = { onMouseEnter: () => setOverControls(true), onMouseLeave: () => setOverControls(false), onClick: stop, onDoubleClick: stop };
  const openChannel = () => ctx.openChannel({ id: rec.channelId, title: rec.channelTitle, avatar: rec.channelAvatar });

  return (
    <section className={`player ${expanded ? 'full' : 'mini'}`}>
      <div className="player-main">
        <div
          ref={stageRef}
          className={`stage ${visible ? 'controls-on' : 'controls-off'} ${fullscreen ? 'is-fs' : ''}`}
          onMouseMove={poke}
          onMouseEnter={poke}
          onMouseLeave={() => { clearTimeout(hideTimer.current); setActive(false); }}
        >
          {ready ? (
            <>
              <video
                key={id}
                ref={videoRef}
                src={`media://video/${encodeURIComponent(id)}`}
                autoPlay
                playsInline
                onClick={onSurfaceClick}
                onDoubleClick={onSurfaceDouble}
                onPlay={() => { setPlaying(true); window.dispatchEvent(new Event('ourtube:video-play')); }}
                onPause={() => setPlaying(false)}
                onEnded={() => { setPlaying(false); onEnded(); }}
                onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
                onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                onDurationChange={(e) => setDuration(e.currentTarget.duration)}
                onProgress={(e) => {
                  const b = e.currentTarget.buffered;
                  if (b.length) setBuffered(b.end(b.length - 1));
                }}
              />

              {expanded ? (
                <>
                  <div className="ov ov-top" {...controlsHandlers}>
                    <button className="ov-btn" onClick={onMinimize} title="Minimize (Esc)" aria-label="Minimize player">
                      <Icon name="minimize" size={20} />
                    </button>
                    <span className="ov-title">{fullscreen ? rec.title : ''}</span>
                    <button className="ov-btn" onClick={onClose} title="Close video" aria-label="Close video">
                      <Icon name="close" size={20} />
                    </button>
                  </div>
                  <div className="ov ov-bottom" {...controlsHandlers}>
                    <SeekBar time={time} duration={duration} buffered={buffered} onSeek={seekTo} onScrub={setScrubbing} />
                    <div className="ctl-row">
                      <button className="ov-btn" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause (k)' : 'Play (k)'}>
                        <Icon name={playing ? 'pause' : 'play'} size={20} />
                      </button>
                      {hasNext && (
                        <button className="ov-btn" onClick={() => ctx.playNext()} aria-label="Next in queue" title="Next in queue">
                          <Icon name="next" size={20} />
                        </button>
                      )}
                      <div className="vol">
                        <button
                          className="ov-btn"
                          onClick={() => setMuted((m) => { writePref('muted', !m); return !m; })}
                          aria-label={muted ? 'Unmute' : 'Mute'}
                          title={muted ? 'Unmute (m)' : 'Mute (m)'}
                        >
                          <Icon name={muted || volume === 0 ? 'mute' : 'volume'} size={20} />
                        </button>
                        <input
                          type="range" min="0" max="1" step="0.01" aria-label="Volume"
                          value={muted ? 0 : volume}
                          style={{ '--v': `${(muted ? 0 : volume) * 100}%` }}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setVolume(val); writePref('volume', val);
                            if (muted && val > 0) { setMuted(false); writePref('muted', false); }
                          }}
                        />
                      </div>
                      <span className="time">{fmt(time)} / {fmt(duration)}</span>
                      <span className="ctl-spacer" />
                      <div className="speed">
                        <button className="ov-btn text" onClick={() => setSpeedOpen((o) => !o)} aria-label="Playback speed" title="Playback speed">
                          {rate === 1 ? '1×' : `${rate}×`}
                        </button>
                        {speedOpen && (
                          <div className="speed-menu" onMouseLeave={() => setSpeedOpen(false)}>
                            {SPEEDS.map((s) => (
                              <button key={s} className={s === rate ? 'on' : ''} onClick={() => { setRate(s); writePref('rate', s); setSpeedOpen(false); }}>
                                {s === 1 ? 'Normal' : `${s}×`}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <button className="ov-btn" onClick={toggleFullscreen} aria-label="Fullscreen" title="Fullscreen (f)">
                        <Icon name={fullscreen ? 'collapse' : 'expand'} size={20} />
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="ov ov-top mini" {...controlsHandlers}>
                    <span className="ov-title clickable" onClick={onExpand}>{rec.title}</span>
                    <button className="ov-btn sm" onClick={onExpand} aria-label="Expand player" title="Expand"><Icon name="expand" size={16} /></button>
                    <button className="ov-btn sm" onClick={onClose} aria-label="Close video" title="Close video"><Icon name="close" size={16} /></button>
                  </div>
                  <div className="ov ov-bottom mini" {...controlsHandlers}>
                    <button className="ov-btn sm" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause' : 'Play'}>
                      <Icon name={playing ? 'pause' : 'play'} size={16} />
                    </button>
                    <SeekBar compact time={time} duration={duration} buffered={buffered} onSeek={seekTo} onScrub={setScrubbing} />
                    <span className="time sm">{fmt(time)} / {fmt(duration)}</span>
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <DownloadState rec={rec} prog={prog} onRetry={() => api.retryVideo(id)} onCancel={() => api.cancelDownload(id)} />
              <div className={`ov ov-top ${expanded ? '' : 'mini'} always`}>
                {expanded
                  ? <button className="ov-btn" onClick={onMinimize} aria-label="Minimize player"><Icon name="minimize" size={20} /></button>
                  : <span className="ov-title clickable" onClick={onExpand}>{rec.title}</span>}
                {expanded && <span className="ov-title" />}
                <button className={`ov-btn ${expanded ? '' : 'sm'}`} onClick={onClose} aria-label="Close video"><Icon name="close" size={expanded ? 20 : 16} /></button>
              </div>
            </>
          )}
        </div>

        {expanded && (
          <div className="player-info">
            <h1 className="player-title">{rec.title}</h1>
            <div className="player-meta">
              <button className="channel-link" onClick={openChannel} disabled={!rec.channelId} title="View channel">
                {rec.channelAvatar ? <img className="ch-avatar" src={rec.channelAvatar} alt="" /> : <span className="ch-avatar fallback">{rec.channelTitle?.[0]}</span>}
                <span>
                  <span className="ch-name">{rec.channelTitle}</span>
                  <span className="muted small block">
                    {[timeAgo(rec.publishedAt), rec.duration ? formatDuration(rec.duration) : null].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </button>
              <div className="player-links">
                {library.audio?.[id]?.status === 'ready'
                  ? <button className="btn ghost sm" onClick={() => { videoRef.current?.pause(); ctx.playAudio([id]); }}><Icon name="music" size={16} /> Play audio</button>
                  : <button className="btn ghost sm" disabled={!!library.audio?.[id] && library.audio[id].status !== 'error'} onClick={() => ctx.downloadAudio(rec)}>
                      <Icon name="music" size={16} /> {library.audio?.[id] && library.audio[id].status !== 'error' ? 'Downloading audio…' : 'Download audio'}
                    </button>}
                {ready && <button className="btn ghost sm" onClick={() => api.showInFolder(id)}><Icon name="folder" size={16} /> Show file</button>}
                <button className="btn ghost sm" onClick={() => api.openExternal(ytUrl(id))}><Icon name="external" size={16} /> YouTube</button>
              </div>
            </div>
            {rec.description && <p className="description">{rec.description}</p>}
          </div>
        )}
      </div>

      {expanded && (
        <aside className="up-next">
          <div className="up-next-head">
            <h2>Up next</h2>
            <span className="muted small">{queue.length ? `${queue.length} in queue` : 'Queue is empty'}</span>
          </div>
          {queue.length === 0 && (
            <p className="muted small pad">Click any video while this one plays to queue it. Queued videos download right away and play automatically when this one ends.</p>
          )}
          <ol className="queue-list">
            {queue.map((v, i) => {
              const p = progress[v.id];
              return (
                <li key={v.id} className="q-item">
                  <button className="q-thumb" onClick={() => ctx.playNow(v.id)} title="Play now">
                    <img src={v.thumbnail} alt="" />
                    <span className="q-play"><Icon name="play" size={18} /></span>
                    {v.status === 'downloading' && <span className="thumb-progress"><span style={{ width: `${p?.percent || 0}%` }} /></span>}
                  </button>
                  <div className="q-text">
                    <div className="q-title" title={v.title}>{v.title}</div>
                    <div className="muted small">
                      {v.status === 'ready' ? 'Ready' : v.status === 'error' ? 'Download failed' : v.status === 'downloading' ? `Downloading ${Math.round(p?.percent || 0)}%` : 'Waiting…'}
                    </div>
                  </div>
                  <div className="q-actions">
                    <button className="icon-btn sm" disabled={i === 0} onClick={() => api.queueMove(v.id, -1)} aria-label="Move up"><Icon name="up" size={14} /></button>
                    <button className="icon-btn sm" disabled={i === queue.length - 1} onClick={() => api.queueMove(v.id, 1)} aria-label="Move down"><Icon name="down" size={14} /></button>
                    <button className="icon-btn sm" onClick={() => api.queueDiscard(v.id, id)} aria-label="Remove from queue"><Icon name="close" size={14} /></button>
                  </div>
                </li>
              );
            })}
          </ol>
          {queue.length > 0 && (
            <button className="btn full-w" onClick={ctx.playNext}><Icon name="next" size={16} /> Skip to next</button>
          )}
        </aside>
      )}
    </section>
  );
}
