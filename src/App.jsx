import React, { useState } from 'react';
import { HubGate } from './HubGuard.jsx';
import Icon from './components/Icon.jsx';
import CalcPage from './pages/CalcPage.jsx';
import TablePage from './pages/TablePage.jsx';
import SheetPage from './pages/SheetPage.jsx';

const TABS = [
  { id:'calc',  label:'Calculadora', icon:'raio' },
  { id:'table', label:'Tabelas ANTT', icon:'tabela' },
  { id:'sheet', label:'Planilha',     icon:'planilha' },
];

export default function App() {
  const [page, setPage] = useState('calc');

  return (
    <HubGate>
    <div className="app-wrap">
      <nav className="tab-nav">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`tab-btn${page === t.id ? ' active' : ''}`}
            onClick={() => setPage(t.id)}
          >
            <Icon name={t.icon} size={15} />
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
    </HubGate>
  );
}
