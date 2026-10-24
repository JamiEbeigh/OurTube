import Icon from './Icon.jsx';
import KebabMenu from './KebabMenu.jsx';

function statusLine(rec, prog) {
  if (!rec) return '';
  if (rec.status === 'ready') return 'Downloaded';
  if (rec.status === 'downloading' && prog?.stage && /Convert|cover|Merg/.test(prog.stage)) return prog.stage;
  if (rec.status === 'error') return 'Download failed';
  if (rec.status === 'downloading') {
    const pct = Math.round(prog?.percent || 0);
    return [prog?.stage && prog.stage !== 'Downloading' ? prog.stage : `Downloading ${pct}%`, prog?.speed].filter(Boolean).join(' · ');
  }
  return 'Waiting to download…';
}

function VideoToast({ t, ctx }) {
  const rec = t.audio ? ctx.library.audio?.[t.videoId] : ctx.library.videos[t.videoId];
  const prog = ctx.progress[t.audio ? `a:${t.videoId}` : t.videoId];
  const pct = rec?.status === 'ready' ? 100 : prog?.percent || 0;
  return (
    <>
      <div className="toast-thumb">
        {rec?.thumbnail && <img src={rec.thumbnail} alt="" />}
        {t.audio && <span className="toast-kind"><Icon name="music" size={12} /></span>}
        {rec && rec.status !== 'ready' && <span className="thumb-progress"><span style={{ width: `${pct}%` }} /></span>}
      </div>
      <div className="toast-text">
        <div className="toast-msg">{t.message}</div>
        {rec && <div className="toast-title" title={rec.title}>{rec.title}</div>}
        <div className="toast-sub">{statusLine(rec, prog)}</div>
      </div>
    </>
  );
}

export default function Toasts({ toasts, ctx, onDismiss, onHold }) {
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast ${t.kind}`}
          onMouseEnter={() => onHold(t.id, true)}
          onMouseLeave={() => onHold(t.id, false)}
        >
          {t.kind === 'video' ? <VideoToast t={t} ctx={ctx} /> : (
            <>
              {t.kind === 'error' && <Icon name="alert" size={16} />}
              <span className="toast-plain">{t.message}</span>
            </>
          )}
          {t.actions?.length > 0 && (
            <KebabMenu
              placement="up"
              label="Video options"
              items={t.actions.map((a) => ({ ...a, onClick: () => { onDismiss(t.id); a.onClick(); } }))}
            />
          )}
          {(t.kind === 'video' || t.kind === 'error') && (
            <button className="icon-btn sm" aria-label="Dismiss" onClick={() => onDismiss(t.id)}><Icon name="close" size={14} /></button>
          )}
        </div>
      ))}
    </div>
  );
}
