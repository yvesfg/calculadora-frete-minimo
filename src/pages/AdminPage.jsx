import React, { useState, useEffect } from 'react';
import { supaFetch } from '../lib/supabase.js';

export default function AdminPage({ user }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole]   = useState('user');
  const [adding, setAdding]     = useState(false);
  const [status, setStatus]     = useState('');

  const load = async () => {
    setLoading(true); setErr('');
    try {
      const rows = await supaFetch('GET', 'frete_usuarios?select=email,role&order=email.asc');
      setUsers(rows || []);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const addUser = async () => {
    if (!newEmail.trim()) return;
    setAdding(true); setStatus('');
    try {
      await supaFetch('POST', 'frete_usuarios', { email: newEmail.trim().toLowerCase(), role: newRole });
      setStatus('ok:Usuário adicionado!');
      setNewEmail(''); setNewRole('user');
      load();
    } catch (e) { setStatus('err:' + e.message); }
    finally { setAdding(false); }
  };

  const removeUser = async (email) => {
    if (!confirm(`Remover ${email}?`)) return;
    try {
      await supaFetch('DELETE', `frete_usuarios?email=eq.${encodeURIComponent(email)}`);
      load();
    } catch (e) { alert(e.message); }
  };

  const changeRole = async (email, role) => {
    try {
      await supaFetch('PATCH', `frete_usuarios?email=eq.${encodeURIComponent(email)}`, { role });
      setUsers(u => u.map(x => x.email === email ? { ...x, role } : x));
    } catch (e) { alert(e.message); }
  };

  const [ok, msg] = status.startsWith('ok:') ? [true, status.slice(3)] : [false, status.slice(4)];

  return (
    <div className="page-content">
      <div className="admin-section">
        <div className="admin-section-head">Usuários com acesso</div>
        <div className="admin-section-body">
          {err && <div className="err-banner" style={{ marginBottom:10 }}>⚠ {err}</div>}
          {loading
            ? <div style={{ color:'var(--text3)', fontSize:12 }}>Carregando…</div>
            : users.map(u => (
              <div key={u.email} className="user-item">
                <div className="user-avatar-sm">
                  {(u.email[0] || '?').toUpperCase()}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <span className="user-email-txt">{u.email}</span>
                  {u.email === user?.email && <span className="user-you-tag">(você)</span>}
                </div>
                <select
                  value={u.role}
                  onChange={e => changeRole(u.email, e.target.value)}
                  style={{ width:'auto', padding:'3px 6px', fontSize:11 }}
                  disabled={u.email === user?.email}
                >
                  <option value="user">user</option>
                  <option value="admin">admin</option>
                </select>
                {u.email !== user?.email && (
                  <button className="btn btn-danger" style={{ padding:'4px 10px', fontSize:10 }} onClick={() => removeUser(u.email)}>
                    Remover
                  </button>
                )}
              </div>
            ))
          }
        </div>
      </div>

      <div className="admin-section">
        <div className="admin-section-head">Adicionar usuário</div>
        <div className="admin-section-body">
          <div style={{ display:'grid', gridTemplateColumns:'1fr 100px auto', gap:8, alignItems:'end' }}>
            <div>
              <label className="field-label">Email</label>
              <input
                type="email" value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                placeholder="usuario@empresa.com"
                onKeyDown={e => e.key === 'Enter' && addUser()}
              />
            </div>
            <div>
              <label className="field-label">Papel</label>
              <select value={newRole} onChange={e => setNewRole(e.target.value)}>
                <option value="user">user</option>
                <option value="admin">admin</option>
              </select>
            </div>
            <button
              className="btn btn-primary"
              style={{ width:'auto', padding:'8px 16px' }}
              onClick={addUser}
              disabled={adding || !newEmail.trim()}
            >
              {adding ? '…' : '+ Adicionar'}
            </button>
          </div>
          {status && (
            <div className={`admin-status ${ok ? 'ok' : 'err'}`}>
              {ok ? '✓' : '✗'} {msg}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
