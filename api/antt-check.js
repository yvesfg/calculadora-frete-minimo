// ─────────────────────────────────────────────────────────
//  CHECAGEM DE ATUALIZAÇÃO DA TABELA ANTT (piso mínimo)
//  O navegador não pode consultar o portal anttlegis (CORS), então
//  este endpoint varre server-side os atos acima dos últimos conhecidos.
//
//  Os coeficientes mudam por DUAS séries com numeração própria:
//    • RES — Resolução DG (revisão da tabela), ex.: 6.084/2026
//    • POR — Portaria SUROC (reajuste pelo diesel), ex.: 22/2026;
//            numeração zera a cada ano e tem buracos de até ~10 números.
//
//  Sinais observados no portal anttlegis (ActionDatalegis):
//    • ato inexistente → página-placeholder curta (~25 KB)
//    • ato do piso     → tabelas A–D completas; decide-se pelo próprio
//      parser (ehAtoDoPiso), não por palavra-chave: outras portarias
//      SUROC citam "pisos mínimos" de passagem.
//
//  Uso:  GET /api/antt-check?res=6084&resAno=2026&por=17&porAno=2026
//  Resp: { newer, latest: { tipo, numero, ano, data, rotulo, url } | null, checked }
// ─────────────────────────────────────────────────────────

import { atoUrl, rotuloAto, decodificarHtml, ehAtoDoPiso, dataDoAto } from "../src/utils/anttUpdate.js";
import { ANTT_SOURCE } from "../src/utils/anttData.js";

const EMPTY_MAX = 40000; // bytes: acima disso a página tem conteúdo real
const SCAN_AHEAD = 40;   // teto de números a varrer acima do último conhecido
const LOTE = 6;          // requisições em paralelo por rodada
const STOP_GAP = { RES: 5, POR: 12 }; // inexistentes seguidos = fim do publicado

export const config = { maxDuration: 60 };

async function baixar(url) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; frete-minimo/1.0)" },
      signal: ctrl.signal,
    });
    return decodificarHtml(new Uint8Array(await r.arrayBuffer()), r.headers.get("content-type") || "");
  } catch {
    return "";
  } finally {
    clearTimeout(to);
  }
}

/** Atos do piso acima de `desde` numa série/ano, em ordem de número. */
async function varrer(tipo, desde, ano) {
  const achados = [];
  let gap = 0, checked = 0;
  for (let ini = desde + 1; ini <= desde + SCAN_AHEAD && gap < STOP_GAP[tipo]; ini += LOTE) {
    const nums = Array.from({ length: LOTE }, (_, i) => ini + i);
    const htmls = await Promise.all(nums.map(numero => baixar(atoUrl({ tipo, numero, ano }))));
    for (let i = 0; i < nums.length; i++) {
      checked++;
      if (htmls[i].length < EMPTY_MAX) {
        if (++gap >= STOP_GAP[tipo]) break;
        continue;
      }
      gap = 0;
      if (ehAtoDoPiso(htmls[i])) achados.push({ tipo, numero: nums[i], ano, data: dataDoAto(htmls[i]) });
    }
  }
  return { achados, checked };
}

const int = (v, def) => parseInt(String(v ?? "").replace(/\D/g, ""), 10) || def;

export default async function handler(req, res) {
  const c = ANTT_SOURCE.cursor;
  const q = req.query;
  const cur = {
    res: int(q.res ?? q.base, c.res), resAno: int(q.resAno ?? q.ano, c.resAno),
    por: int(q.por, c.por), porAno: int(q.porAno, c.porAno),
  };
  const anoAtual = new Date().getFullYear();

  const buscas = [varrer("RES", cur.res, cur.resAno), varrer("POR", cur.por, cur.porAno)];
  // Virada de ano: resolução continua a numeração; portaria recomeça do 1.
  if (anoAtual > cur.resAno) buscas.push(varrer("RES", cur.res, anoAtual));
  if (anoAtual > cur.porAno) buscas.push(varrer("POR", 0, anoAtual));
  const rs = await Promise.all(buscas);

  const achados = rs.flatMap(r => r.achados);
  // Mais novo por data do ato; sem data, fica atrás dos datados.
  achados.sort((a, b) => (a.data || "").localeCompare(b.data || ""));
  const ult = achados[achados.length - 1] || null;
  const latest = ult && { ...ult, rotulo: rotuloAto(ult), url: atoUrl(ult) };

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ newer: !!latest, latest, checked: rs.reduce((s, r) => s + r.checked, 0) });
}
