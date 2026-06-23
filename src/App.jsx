import React, { useState, useEffect, useCallback } from 'react';
import { supaFetch } from './lib/supabase.js';
import TopBar from './components/TopBar.jsx';
import LoginOverlay from './components/LoginOverlay.jsx';
import CalcPage from './pages/CalcPage.jsx';
import TablePage from './pages/TablePage.jsx';
import SheetPage from './pages/SheetPage.jsx';
import AdminPage from './pages/AdminPage.jsx';

const GOOGLE_CLIENT_ID = '977507812731-0uf4n9do7lod3uq53lh5n1a6dd19h60p.apps.googleusercontent.com';

const TABS = [
  { id:'calc',  label:'Calculadora', icon:'⚡' },
  { id:'table', label:'Tabelas ANTT', icon:'📊' },
  { id:'sheet', label:'Planilha', icon:'📋' },
  { id:'admin', label:'Admin', icon:'⚙', adminOnly: true },
];

export default function App() {
  const [user, setUser]   = useState(null);   // { email, role, name, picture }
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [page, setPage]   = useState('calc');
  const [updateNotice, setUpdateNotice] = useState(null);

  const doSignIn = useCallback(async (credential) => {
    const payload = JSON.parse(atob(credential.split('.')[1]));
    const email = payload.email?.toLowerCase();
    try {
      const rows = await supaFetch('GET', `frete_usuarios?email=eq.${encodeURIComponent(email)}&select=email,role`);
      if (!rows?.length) {
        alert('Acesso negado. Solicite ao administrador.');
        return;
      }
      const u = {
        email,
        role: rows[0].role,
        name: payload.name || email,
        picture: payload.picture || null,
      };
      setUser(u);
      setAuthed(true);
      sessionStorage.setItem('calc_user', JSON.stringify(u));
    } catch (e) {
      alert('Erro ao verificar acesso: ' + e.message);
    }
  }, []);

  const doSignOut = useCallback(() => {
    setUser(null);
    setAuthed(false);
    sessionStorage.removeItem('calc_user');
    if (window.google?.accounts?.id) {
      window.google.accounts.id.disableAutoSelect();
    }
  }, []);

  useEffect(() => {
    const saved = sessionStorage.getItem('calc_user');
    if (saved) {
      try {
        const u = JSON.parse(saved);
        setUser(u);
        setAuthed(true);
      } catch {}
    }
    setLoading(false);
  }, []);

  // Check for app update (version stored in sessionStorage)
  useEffect(() => {
    const VER = '2.0.0';
    const prev = localStorage.getItem('calc_ver');
    if (prev && prev !== VER) setUpdateNotice(`Aplicativo atualizado para v${VER}`);
    localStorage.setItem('calc_ver', VER);
  }, []);

  const tabs = TABS.filter(t => !t.adminOnly || user?.role === 'admin');

  if (!authed) {
    return <LoginOverlay onCredential={doSignIn} googleClientId={GOOGLE_CLIENT_ID} />;
  }

  return (
    <div className="app-wrap">
      <TopBar user={user} onSignOut={doSignOut} />
      {updateNotice && (
        <div className="update-banner">
          <strong>✨ {updateNotice}</strong>
          <span> — interface redesenhada em React + CO Design System</span>
          <button className="update-banner-close" onClick={() => setUpdateNotice(null)}>×</button>
        </div>
      )}
      <nav className="tab-nav">
        {tabs.map(t => (
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
        {page === 'calc'  && <CalcPage  user={user} />}
        {page === 'table' && <TablePage />}
        {page === 'sheet' && <SheetPage user={user} />}
        {page === 'admin' && user?.role === 'admin' && <AdminPage user={user} />}
      </main>
    </div>
  );
}
