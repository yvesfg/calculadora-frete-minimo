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
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0c0d10' }}>
        <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid #1b1e23', borderTopColor: '#f2c14e', animation: 'spin .8s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (!ok) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0c0d10', padding: 16 }}>
        <div style={{ background: '#14161a', border: '1px solid #1b1e23', borderRadius: 16, padding: '40px 32px', maxWidth: 360, width: '100%', textAlign: 'center', boxShadow: '0 24px 64px rgba(0,0,0,.5)' }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(242,193,78,.1)', border: '1px solid rgba(242,193,78,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 22 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f2c14e" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </div>
          <h1 style={{ fontSize: 18, fontWeight: 800, color: '#eceae4', margin: '0 0 8px', fontFamily: 'Sora, system-ui, sans-serif' }}>
            Acesso via Hub
          </h1>
          <p style={{ fontSize: 12, color: '#8d929c', lineHeight: 1.6, margin: '0 0 24px', fontFamily: 'Sora, system-ui, sans-serif' }}>
            Este módulo é acessado pelo Hub YFGroup.<br />
            Faça login para continuar.
          </p>
          <a
            href={HUB_URL}
            style={{ display: 'block', background: '#f2c14e', color: '#0c0d10', borderRadius: 8, padding: '10px 0', fontWeight: 700, fontSize: 13, textDecoration: 'none', fontFamily: 'Sora, system-ui, sans-serif', transition: '140ms ease' }}
          >
            Ir para o Hub YFGroup
          </a>
        </div>
      </div>
    );
  }

  return children;
}
