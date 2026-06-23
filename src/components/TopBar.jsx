import React, { useState } from 'react';

export default function TopBar({ user, onSignOut }) {
  const [open, setOpen] = useState(false);
  const initials = (user?.name || user?.email || '?')
    .split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase();

  return (
    <header style={{
      display:'flex', alignItems:'center', justifyContent:'space-between',
      padding:'0 16px', height:48, background:'var(--surface)',
      borderBottom:'1px solid var(--border)', flexShrink:0,
    }}>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <div style={{
          width:26, height:26, borderRadius:6,
          background:'var(--accent)', display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:12, fontWeight:900, color:'#0b0e11', letterSpacing:'-.02em',
        }}>F</div>
        <span style={{ fontWeight:700, fontSize:13, color:'var(--text)', letterSpacing:'-.01em' }}>
          Frete Mínimo
        </span>
        <span style={{
          fontSize:9, fontWeight:700, color:'var(--accent)', background:'var(--accent-dim)',
          border:'1px solid var(--accent-ring)', padding:'1px 6px', borderRadius:9999,
          letterSpacing:'.06em',
        }}>ANTT</span>
      </div>

      <div style={{ position:'relative' }}>
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            display:'flex', alignItems:'center', gap:7,
            background:'transparent', border:'none', cursor:'pointer', padding:'4px 6px',
            borderRadius:'var(--r)', transition:'background var(--ease)',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.04)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          {user?.picture
            ? <img src={user.picture} alt="" style={{ width:26, height:26, borderRadius:'50%', border:'1px solid var(--border2)' }} />
            : (
              <div style={{
                width:26, height:26, borderRadius:'50%', background:'var(--card2)',
                border:'1px solid var(--border2)', display:'flex', alignItems:'center',
                justifyContent:'center', fontSize:10, fontWeight:700, color:'var(--text2)',
              }}>{initials}</div>
            )
          }
          <span style={{ fontSize:12, color:'var(--text2)', maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {user?.name || user?.email}
          </span>
          <span style={{ color:'var(--text3)', fontSize:10 }}>▾</span>
        </button>

        {open && (
          <>
            <div style={{ position:'fixed', inset:0, zIndex:98 }} onClick={() => setOpen(false)} />
            <div style={{
              position:'absolute', top:'calc(100% + 6px)', right:0, zIndex:99,
              background:'var(--card2)', border:'1px solid var(--border2)',
              borderRadius:'var(--r-lg)', boxShadow:'0 8px 32px rgba(0,0,0,.5)',
              minWidth:180, overflow:'hidden',
            }}>
              <div style={{ padding:'10px 12px', borderBottom:'1px solid var(--border)' }}>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--text)' }}>{user?.name}</div>
                <div style={{ fontSize:10, color:'var(--text3)', marginTop:2 }}>{user?.email}</div>
                <div style={{
                  display:'inline-flex', alignItems:'center', gap:4,
                  marginTop:6, padding:'2px 8px', borderRadius:9999,
                  fontSize:9, fontWeight:700,
                  ...(user?.role === 'admin'
                    ? { background:'rgba(251,191,36,.1)', border:'1px solid rgba(251,191,36,.25)', color:'var(--orange)' }
                    : { background:'var(--accent-dim)', border:'1px solid var(--accent-ring)', color:'var(--text2)' }),
                }}>
                  <span style={{ width:5, height:5, borderRadius:'50%', background:'currentColor' }} />
                  {user?.role === 'admin' ? 'Admin' : 'Usuário'}
                </div>
              </div>
              <button
                onClick={() => { setOpen(false); onSignOut(); }}
                style={{
                  width:'100%', padding:'9px 12px', background:'transparent',
                  border:'none', cursor:'pointer', font:'inherit',
                  fontSize:12, color:'var(--red)', textAlign:'left',
                  transition:'background var(--ease)',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--red-dim)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                ↩ Sair
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
