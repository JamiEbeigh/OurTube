import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { formatDuration } from '../util.js';

const fmt = (s) => formatDuration(Number.isFinite(s) ? Math.max(0, s) : 0);
const readPref = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const writePref = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

// Music player pinned to the bottom of the window. Plays a list of downloaded
// audio tracks in order; starting a video pauses it (and vice versa).
export default function AudioBar({ ctx, now, onIndex, onClose }) {
  const { library, api } = ctx;
  const audioRef = useRef(null);
  const seekRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(() => readPref('audioVolume', 1));
  const [repeat, setRepeat] = useState(() => readPref('audioRepeat', false));

  const id = now.ids[now.index];
  const rec = library.audio?.[id];
  const ready = rec?.status === 'ready';
  const hasPrev = now.index > 0;
  const hasNext = now.index < now.ids.length - 1;

  useEffect(() => { if (audioRef.current) audioRef.current.volume = volume; }, [volume, id, ready]);

  // Pause when a video starts playing.
  useEffect(() => {
    const onVideo = () => audioRef.current?.pause();
    window.addEventListener('ourtube:video-play', onVideo);
    return () => window.removeEventListener('ourtube:video-play', onVideo);
  }, []);

  // Skip tracks that were deleted or failed.
  useEffect(() => {
    if (!rec || rec.status === 'error') {
      if (hasNext) onIndex(now.index + 1);
      else if (!rec) onClose();
    }
  }, [rec, rec?.status, hasNext, now.index, onIndex, onClose]);

  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => {}); else a.pause();
  }, []);

  const next = useCallback(() => {
    if (hasNext) onIndex(now.index + 1);
    else if (repeat) onIndex(0);
  }, [hasNext, repeat, now.index, onIndex]);

  const prev = useCallback(() => {
    const a = audioRef.current;
    if (a && a.currentTime > 3) { a.currentTime = 0; return; }
    if (hasPrev) onIndex(now.index - 1);
  }, [hasPrev, now.index, onIndex]);

  // OS media keys.
  useEffect(() => {
    if (!('mediaSession' in navigator) || !rec) return;
    navigator.mediaSession.metadata = new window.MediaMetadata({
      title: rec.title, artist: rec.channelTitle,
      artwork: rec.thumbnail ? [{ src: rec.thumbnail, sizes: '480x360', type: 'image/jpeg' }] : [],
    });
    navigator.mediaSession.setActionHandler('play', () => audioRef.current?.play());
    navigator.mediaSession.setActionHandler('pause', () => audioRef.current?.pause());
    navigator.mediaSession.setActionHandler('nexttrack', next);
    navigator.mediaSession.setActionHandler('previoustrack', prev);
  }, [rec?.id, next, prev]); // eslint-disable-line react-hooks/exhaustive-deps

  const seekAt = (e) => {
    const r = seekRef.current.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    if (audioRef.current && duration) audioRef.current.currentTime = ratio * duration;
  };

  if (!rec) return null;
  const pct = duration ? (time / duration) * 100 : 0;
  const prog = ctx.progress[`a:${id}`];

  return (
    <div className="audiobar" role="region" aria-label="Music player">
      {ready && (
        <audio
          key={id}
          ref={audioRef}
          src={`media://audio/${encodeURIComponent(id)}`}
          autoPlay
          onPlay={() => { setPlaying(true); window.dispatchEvent(new Event('ourtube:audio-play')); }}
          onPause={() => setPlaying(false)}
          onEnded={() => { setPlaying(false); if (hasNext || repeat) next(); }}
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        />
      )}
      <div className="ab-track">
        <div className="ab-cover">{rec.thumbnail && <img src={rec.thumbnail} alt="" />}</div>
        <div className="ab-text">
          <div className="ab-title" title={rec.title}>{rec.title}</div>
          <div className="ab-sub">
            {ready ? rec.channelTitle : `Downloading ${Math.round(prog?.percent || 0)}%…`}
            {now.ids.length > 1 && <span className="muted"> · {now.index + 1} of {now.ids.length}</span>}
          </div>
        </div>
      </div>

      <div className="ab-center">
        <div className="ab-buttons">
          <button className="icon-btn" onClick={prev} disabled={!hasPrev && time < 3} aria-label="Previous"><Icon name="prev" size={18} /></button>
          <button className="ab-play" onClick={toggle} disabled={!ready} aria-label={playing ? 'Pause' : 'Play'}>
            <Icon name={playing ? 'pause' : 'play'} size={20} />
          </button>
          <button className="icon-btn" onClick={next} disabled={!hasNext && !repeat} aria-label="Next"><Icon name="next" size={18} /></button>
          <button
            className={`icon-btn ${repeat ? 'on accent' : ''}`}
            onClick={() => setRepeat((r) => { writePref('audioRepeat', !r); return !r; })}
            aria-label="Repeat list"
            title={repeat ? 'Repeat is on' : 'Repeat the list'}
          >
            <Icon name="repeat" size={17} />
          </button>
        </div>
        <div className="ab-seek-row">
          <span className="time sm">{fmt(time)}</span>
          <div className="ab-seek" ref={seekRef} onClick={seekAt}>
            <div className="ab-seek-track"><div className="ab-seek-fill" style={{ width: `${pct}%` }} /></div>
          </div>
          <span className="time sm">{fmt(duration || rec.duration)}</span>
        </div>
      </div>

      <div className="ab-right">
        <Icon name={volume === 0 ? 'mute' : 'volume'} size={18} className="muted" />
        <input
          type="range" min="0" max="1" step="0.01" aria-label="Volume" value={volume}
          style={{ '--v': `${volume * 100}%` }}
          onChange={(e) => { const v = Number(e.target.value); setVolume(v); writePref('audioVolume', v); }}
        />
        {ready && <button className="icon-btn" onClick={() => api.showAudioInFolder(id)} aria-label="Show file" title="Show file"><Icon name="folder" size={17} /></button>}
        <button className="icon-btn" onClick={onClose} aria-label="Close music player" title="Close"><Icon name="close" size={17} /></button>
      </div>
    </div>
  );
}
