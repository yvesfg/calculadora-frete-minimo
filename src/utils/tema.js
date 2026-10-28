/* Tema claro/escuro da calculadora (data-theme no <html>, tokens em index.css).
   Aberta pelo Hub, segue o tema do CO pelo ?tema= da URL; depois vale o que a
   pessoa escolher no botão sol/lua, guardado neste navegador. */
const LS_TEMA = 'calc_tema';

export function temaInicial() {
  let t = null;
  try {
    const daUrl = new URLSearchParams(window.location.search).get('tema');
    if (daUrl === 'light' || daUrl === 'dark') { localStorage.setItem(LS_TEMA, daUrl); return daUrl; }
    t = localStorage.getItem(LS_TEMA);
  } catch { /* sem storage: fica no escuro */ }
  return t === 'light' ? 'light' : 'dark';
}

export function aplicarTema(t) {
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem(LS_TEMA, t); } catch { /* sem storage */ }
}
