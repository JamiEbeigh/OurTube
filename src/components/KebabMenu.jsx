import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';

// items: [{ label, icon, onClick, disabled, hint }]
export default function KebabMenu({ items, label = 'More actions', placement = 'down', buttonLabel, buttonIcon }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div className="kebab" ref={ref} onClick={(e) => e.stopPropagation()}>
      {buttonLabel ? (
        <button className="btn primary" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((o) => !o)}>
          {buttonIcon && <Icon name={buttonIcon} size={16} />} {buttonLabel} <Icon name="minimize" size={14} />
        </button>
      ) : (
        <button className={`icon-btn ${open ? 'on' : ''}`} aria-label={label} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <Icon name="dots" size={18} />
        </button>
      )}
      {open && (
        <div className={`menu ${placement} ${buttonLabel ? 'left' : ''}`} role="menu">
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              className="menu-item"
              disabled={it.disabled}
              onClick={() => { setOpen(false); it.onClick?.(); }}
            >
              <Icon name={it.icon} size={18} />
              <span className="menu-label">
                {it.label}
                {it.hint && <span className="menu-hint">{it.hint}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
