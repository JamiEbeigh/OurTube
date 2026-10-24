import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';

function Modal({ children, onCancel, labelledBy }) {
  const ref = useRef(null);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel?.(); };
    window.addEventListener('keydown', onKey);
    ref.current?.querySelector('button.primary')?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel?.()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={labelledBy} ref={ref}>{children}</div>
    </div>
  );
}

export function CloseVideoModal({ video, onChoose, onCancel }) {
  const [remember, setRemember] = useState(false);
  return (
    <Modal onCancel={onCancel} labelledBy="close-title">
      <h2 id="close-title">Done with this video?</h2>
      {video && (
        <div className="modal-video">
          <img src={video.thumbnail} alt="" />
          <div>
            <div className="modal-video-title">{video.title}</div>
            <div className="muted small">{video.channelTitle}</div>
          </div>
        </div>
      )}
      <p className="muted">Choose what happens to the downloaded file.</p>
      <div className="choice-grid">
        <button className="choice" onClick={() => onChoose('delete', remember)}>
          <Icon name="trash" size={22} />
          <span className="choice-title">Delete file</span>
          <span className="choice-sub">Free up the space</span>
        </button>
        <button className="choice primary" onClick={() => onChoose('keep', remember)}>
          <Icon name="download" size={22} />
          <span className="choice-title">Keep in Downloaded</span>
          <span className="choice-sub">Move it to your Downloaded playlist</span>
        </button>
      </div>
      <label className="check">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        <span>Remember my decision <span className="muted small">(change it any time in Settings)</span></span>
      </label>
      <div className="modal-foot">
        <button className="btn ghost" onClick={onCancel}>Keep watching</button>
      </div>
    </Modal>
  );
}

export function QuitModal({ count, videos, onChoose, onCancel }) {
  return (
    <Modal onCancel={onCancel} labelledBy="quit-title">
      <h2 id="quit-title">You still have {count} video{count === 1 ? '' : 's'} in your queue</h2>
      <p className="muted">Save them for later, or delete the downloaded files before quitting?</p>
      {videos.length > 0 && (
        <ul className="quit-list">
          {videos.slice(0, 5).map((v) => <li key={v.id}><img src={v.thumbnail} alt="" /><span>{v.title}</span></li>)}
          {videos.length > 5 && <li className="muted small">…and {videos.length - 5} more</li>}
        </ul>
      )}
      <div className="modal-foot spread">
        <button className="btn ghost" onClick={onCancel}>Cancel</button>
        <div className="btn-row">
          <button className="btn danger" onClick={() => onChoose('delete')}><Icon name="trash" size={16} /> Delete files</button>
          <button className="btn primary" onClick={() => onChoose('watchLater')}><Icon name="clock" size={16} /> Add to Watch Later</button>
        </div>
      </div>
    </Modal>
  );
}

export function ConfirmModal({ title, body, options, onChoose, onCancel }) {
  return (
    <Modal onCancel={onCancel} labelledBy="confirm-title">
      <h2 id="confirm-title">{title}</h2>
      {body && <p className="muted">{body}</p>}
      <div className="modal-foot spread">
        <button className="btn ghost" onClick={onCancel}>Cancel</button>
        <div className="btn-row">
          {options.map((o) => (
            <button key={o.value} className={`btn ${o.primary ? 'primary' : ''} ${o.danger && !o.primary ? 'danger' : ''} ${o.danger && o.primary ? 'danger-fill' : ''}`} onClick={() => onChoose(o.value)}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
