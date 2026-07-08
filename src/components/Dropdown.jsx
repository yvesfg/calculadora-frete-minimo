import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * Dropdown custom (substitui <select> nativo) — o popup de <option> do navegador
 * não respeita o tema escuro (fica com fundo branco/texto ilegível), então esta
 * lista é renderizada em HTML normal, estilizável como qualquer outro elemento do app.
 * O painel é montado via portal em <body>, com posição calculada a partir do gatilho —
 * os cards do app têm overflow:hidden (p/ cantos arredondados) e clipariam um painel
 * posicionado dentro deles.
 *
 * options: [{ value, label }]  OU  groups: [{ label, options:[{ value, label }] }]
 */
export default function Dropdown({ value, onChange, options, groups, className = '', placeholder = '—' }) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState(null);
  const rootRef = useRef(null);

  const flat = groups ? groups.flatMap(g => g.options) : (options || []);
  const current = flat.find(o => String(o.value) === String(value));

  const openPanel = () => {
    const r = rootRef.current?.getBoundingClientRect();
    if (r) setRect(r);
    setOpen(o => !o);
  };

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const reposition = () => {
      const r = rootRef.current?.getBoundingClientRect();
      if (r) setRect(r);
    };
    const onDocClick = e => {
      if (rootRef.current?.contains(e.target)) return;
      if (e.target.closest?.('.dd-panel')) return;
      close();
    };
    const onEsc = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    // Reposiciona (em vez de fechar) em scroll/resize — fechar aqui é frágil:
    // o próprio navegador pode rolar a página ao focar o gatilho, fechando
    // o painel um instante depois de abrir.
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open]);

  const pick = (v) => { onChange(v); setOpen(false); };

  const renderItem = (o) => (
    <div
      key={o.value}
      className={`dd-item${String(o.value) === String(value) ? ' selected' : ''}`}
      onClick={() => pick(o.value)}
    >
      {o.label}
    </div>
  );

  return (
    <div className={`dd-root${open ? ' open' : ''} ${className}`} ref={rootRef}>
      <button type="button" className="dd-trigger veh-select" onClick={openPanel}>
        <span className="dd-trigger-label">{current ? current.label : placeholder}</span>
      </button>
      {open && rect && createPortal(
        <div
          className="dd-panel"
          style={{ position: 'fixed', top: rect.bottom + 6, left: rect.left, width: rect.width }}
        >
          {groups
            ? groups.map(g => (
                <div key={g.label} className="dd-group">
                  <div className="dd-group-label">{g.label}</div>
                  {g.options.map(renderItem)}
                </div>
              ))
            : options.map(renderItem)}
        </div>,
        document.body
      )}
    </div>
  );
}
