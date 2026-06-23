import React, { useEffect, useRef } from 'react';

export default function LoginOverlay({ googleClientId, onCredential }) {
  const btnRef = useRef(null);

  useEffect(() => {
    const render = () => {
      if (!window.google?.accounts?.id || !btnRef.current) {
        setTimeout(render, 200);
        return;
      }
      // Re-initialize here (LoginOverlay owns the auth config)
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: ({ credential }) => onCredential(credential),
        auto_select: false,
      });
      window.google.accounts.id.renderButton(btnRef.current, {
        theme: 'filled_black', size: 'large', text: 'signin_with',
        shape: 'rectangular', locale: 'pt-BR', width: 280,
      });
    };
    render();
  }, []);

  return (
    <div style={{
      minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center',
      background:'var(--bg)', padding:16,
    }}>
      <div style={{
        background:'var(--card)', border:'1px solid var(--border)',
        borderRadius:16, padding:'40px 32px', maxWidth:360, width:'100%',
        textAlign:'center', boxShadow:'0 24px 64px rgba(0,0,0,.4)',
      }}>
        <div style={{
          width:52, height:52, borderRadius:14, background:'var(--accent)',
          display:'flex', alignItems:'center', justifyContent:'center',
          margin:'0 auto 20px', fontSize:24, fontWeight:900, color:'#0b0e11',
        }}>F</div>

        <h1 style={{ fontSize:20, fontWeight:800, color:'var(--text)', marginBottom:6, letterSpacing:'-.03em' }}>
          Frete Mínimo ANTT
        </h1>
        <p style={{ fontSize:12, color:'var(--text3)', marginBottom:28, lineHeight:1.6 }}>
          Calculadora de piso tarifário conforme<br />
          Resolução ANTT nº 6.442/2021
        </p>

        <div ref={btnRef} style={{ display:'flex', justifyContent:'center', marginBottom:16 }} />

        <p style={{ fontSize:10, color:'var(--text3)', marginTop:16, lineHeight:1.6 }}>
          Acesso restrito a usuários autorizados.<br />
          Solicite ao administrador se necessário.
        </p>
      </div>
    </div>
  );
}
