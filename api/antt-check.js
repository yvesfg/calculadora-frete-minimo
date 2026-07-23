// ─────────────────────────────────────────────────────────
//  CHECAGEM DE ATUALIZAÇÃO DA TABELA ANTT (piso mínimo)
//  O navegador não pode consultar o portal anttlegis (CORS), então
//  este endpoint varre server-side os números de resolução acima da
//  base atual e detecta se há uma resolução MAIS NOVA do piso.
//
//  Sinais observados no portal anttlegis (ActionDatalegis):
//    • resolução inexistente → página-placeholder curta (~25 KB)
//    • resolução real do piso  → página longa (100 KB+) citando a
//      Res. 5.867/2020 e os "Coeficiente(s)" de custo (CCD/CC).
//
//  Uso: GET /api/antt-check?base=6084&ano=2026
//  Resp: { current, ano, newer: bool, latest: number|null, checked }
// ─────────────────────────────────────────────────────────

const PORTAL = "https://anttlegis.antt.gov.br/action/ActionDatalegis.php";
const EMPTY_MAX = 40000; // bytes: acima disso a página tem conteúdo real
const SCAN_AHEAD = 40;   // teto de números a varrer acima da base
const STOP_GAP = 5;      // para após N inexistentes seguidos (fim do publicado)

function resUrl(numero, ano) {
  const n = String(numero).padStart(8, "0");
  return `${PORTAL}?acao=abrirTextoAto&tipo=RES&numeroAto=${n}&seqAto=000&valorAno=${ano}&orgao=DG/ANTT/MT&cod_modulo=623&cod_menu=9230`;
}

async function fetchRes(numero, ano) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 5000);
  try {
    const r = await fetch(resUrl(numero, ano), {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; frete-minimo/1.0)" },
      signal: ctrl.signal,
    });
    return await r.text();
  } catch {
    return "";
  } finally {
    clearTimeout(to);
  }
}

const isPiso = (html) => /5\.?867|Coeficiente|piso\s*m[íi]nimo/i.test(html);

export default async function handler(req, res) {
  const base = parseInt(String(req.query.base || "6084").replace(/\D/g, ""), 10) || 6084;
  const ano  = parseInt(String(req.query.ano  || "2026").replace(/\D/g, ""), 10) || 2026;

  let gap = 0, latest = null, checked = 0;
  for (let n = base + 1; n <= base + SCAN_AHEAD; n++) {
    const html = await fetchRes(n, ano);
    checked++;
    if (html.length < EMPTY_MAX) {
      if (++gap >= STOP_GAP) break; // chegamos ao fim das resoluções publicadas
      continue;
    }
    gap = 0;
    if (isPiso(html)) { latest = n; break; } // primeira resolução do piso mais nova
  }

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ current: base, ano, newer: latest !== null, latest, checked });
}
