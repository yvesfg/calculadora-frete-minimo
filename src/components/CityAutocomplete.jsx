import React, { useState, useEffect, useRef } from 'react';
import { fetchStates, fetchCities } from '../utils/geo.js';

export default function CityAutocomplete({ label, value, onChange }) {
  const [states, setStates]       = useState([]);
  const [cities, setCities]       = useState([]);
  const [query, setQuery]         = useState(value?.city || '');
  const [uf, setUf]               = useState(value?.uf || '');
  const [suggestions, setSug]     = useState([]);
  const [open, setOpen]           = useState(false);
  const [focused, setFocused]     = useState(0);
  const inputRef = useRef(null);
  const dropRef  = useRef(null);

  useEffect(() => { fetchStates().then(setStates); }, []);
  useEffect(() => {
    if (!uf) { setCities([]); return; }
    fetchCities(uf).then(setCities);
  }, [uf]);

  useEffect(() => {
    if (!query.trim() || query.length < 2) { setSug([]); return; }
    const q = query.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
    const filtered = cities
      .filter(c => c.nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').includes(q))
      .slice(0, 8);
    setSug(filtered);
    setOpen(filtered.length > 0);
    setFocused(0);
  }, [query, cities]);

  const selectCity = (c) => {
    setQuery(c.nome);
    setOpen(false);
    onChange({ uf, city: c.nome });
  };

  const handleKeyDown = (e) => {
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocused(f => Math.min(f+1, suggestions.length-1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setFocused(f => Math.max(f-1, 0)); }
    if (e.key === 'Enter' && suggestions[focused]) { selectCity(suggestions[focused]); }
    if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div>
      <label className="field-label">{label}</label>
      <div style={{ display:'grid', gridTemplateColumns:'80px 1fr', gap:6 }}>
        <select value={uf} onChange={e => { setUf(e.target.value); setQuery(''); onChange({ uf: e.target.value, city:'' }); }}>
          <option value="">UF</option>
          {states.map(s => <option key={s.sigla} value={s.sigla}>{s.sigla}</option>)}
        </select>
        <div style={{ position:'relative' }}>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder={uf ? 'Cidade…' : 'Selecione UF primeiro'}
            disabled={!uf}
          />
          {open && (
            <div className="ac-dropdown" ref={dropRef}>
              {suggestions.map((c, i) => (
                <div
                  key={c.id}
                  className={`ac-item${i === focused ? ' focused' : ''}`}
                  onMouseDown={() => selectCity(c)}
                >
                  <div>
                    <div className="ac-main">{c.nome}</div>
                    <div className="ac-sub">{uf}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
