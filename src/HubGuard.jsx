import React, { useState, useEffect } from 'react';

const HUB_URL = import.meta.env.VITE_HUB_URL || 'https://controle-operacional-omega.vercel.app';
const SESS_KEY = 'hub_token';

function isValidJwt(token) {
  try {
    const p = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof p.exp === 'number' && p.exp * 1000 > Date.now();
  } catch { return false; }
}

export function useHubAuth() {
  const [ok, setOk] = useState(null); // null=loading, true=authed, false=denied

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token  = params.get('hub_token');
    if (token) {
      if (isValidJwt(token)) {
        sessionStorage.setItem(SESS_KEY, token);
        window.history.replaceState({}, '', window.location.pathname + window.location.hash);
        setOk(true);
        return;
      }
    }
    const stored = sessionStorage.getItem(SESS_KEY);
    setOk(stored ? isValidJwt(stored) : false);
  }, []);

  return ok;
}

export function HubGate({ children }) {
  const ok = useHubAuth();

  if (ok === null) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0b0e11' }}>
        <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid #2b3139', borderTopColor: '#fcd535', animation: 'spin .8s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (!ok) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0b0e11', padding: 16 }}>
        <div style={{ background: '#1e2329', border: '1px solid #2b3139', borderRadius: 16, padding: '40px 32px', maxWidth: 360, width: '100%', textAlign: 'center', boxShadow: '0 24px 64px rgba(0,0,0,.5)' }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(252,213,53,.1)', border: '1px solid rgba(252,213,53,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 22 }}>
            🔒
          </div>
          <h1 style={{ fontSize: 18, fontWeight: 800, color: '#eaecef', margin: '0 0 8px', fontFamily: 'Inter, system-ui, sans-serif' }}>
            Acesso via Hub
          </h1>
          <p style={{ fontSize: 12, color: '#929aa5', lineHeight: 1.6, margin: '0 0 24px', fontFamily: 'Inter, system-ui, sans-serif' }}>
            Este módulo é acessado pelo Hub YFGroup.<br />
            Faça login para continuar.
          </p>
          <a
            href={HUB_URL}
            style={{ display: 'block', background: '#fcd535', color: '#0b0e11', borderRadius: 8, padding: '10px 0', fontWeight: 700, fontSize: 13, textDecoration: 'none', fontFamily: 'Inter, system-ui, sans-serif', transition: '140ms ease' }}
          >
            Ir para o Hub YFGroup
          </a>
        </div>
      </div>
    );
  }

  return children;
}
