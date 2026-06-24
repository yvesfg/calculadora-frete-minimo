import React from "react";

// ── Catálogo de ícones SVG — mesmo padrão visual do sidebar do Controle Operacional
//    (viewBox 0 0 24 24, fill none, stroke currentColor, strokeWidth 1.7, cantos round).
//    Fonte única: trocar/adicionar ícone aqui propaga para todos os badges do app.
const PATHS = {
  rota: <><circle cx="12" cy="10" r="3"/><path d="M12 21s-7-5.686-7-11a7 7 0 0 1 14 0c0 5.314-7 11-7 11z"/></>,
  veiculo: <><rect x="1" y="3" width="15" height="13" rx="2"/><path d="m16 8 4 2 3 3v4h-7"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></>,
  carga: <><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="m3.27 6.96 8.73 5.04 8.73-5.04M12 22V12"/></>,
  resultado: <><path d="M3 3v18h18"/><rect x="7" y="11" width="3" height="6"/><rect x="12" y="7" width="3" height="10"/><rect x="17" y="4" width="3" height="13"/></>,
  planilha: <><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/></>,
  tabela: <><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/></>,
  upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></>,
  download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="3" x2="12" y2="15"/></>,
  raio: <><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></>,
  ia: <><circle cx="12" cy="12" r="3"/><path d="M20.188 10.934a8.5 8.5 0 1 0-.122 2.187"/><path d="M20 4v4h-4"/></>,
};

export default function Icon({ name, size = 18, stroke = "currentColor", width = 1.7, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={stroke} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" style={style}>
      {PATHS[name] || <circle cx="12" cy="12" r="9"/>}
    </svg>
  );
}
