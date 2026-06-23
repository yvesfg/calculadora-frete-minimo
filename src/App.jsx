import React, { useState } from 'react';
import CalcPage from './pages/CalcPage.jsx';
import TablePage from './pages/TablePage.jsx';
import SheetPage from './pages/SheetPage.jsx';

const TABS = [
  { id:'calc',  label:'Calculadora', icon:'⚡' },
  { id:'table', label:'Tabelas ANTT', icon:'📊' },
  { id:'sheet', label:'Planilha',     icon:'📋' },
];

export default function App() {
  const [page, setPage] = useState('calc');

  return (
    <div className="app-wrap">
      <nav className="tab-nav">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`tab-btn${page === t.id ? ' active' : ''}`}
            onClick={() => setPage(t.id)}
          >
            <span>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
      <main style={{ flex:1, overflow:'auto' }}>
        {page === 'calc'  && <CalcPage />}
        {page === 'table' && <TablePage />}
        {page === 'sheet' && <SheetPage />}
      </main>
    </div>
  );
}
