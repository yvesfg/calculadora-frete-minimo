// ─────────────────────────────────────────────────────────
//  COEFICIENTES DE UMA RESOLUÇÃO DO PISO ANTT
//  O navegador não pode ler o portal anttlegis (CORS), então este
//  endpoint baixa a resolução server-side, extrai CCD/CC das tabelas
//  A–D e só responde 200 se TODAS as combinações da base atual
//  (tabela × carga × eixos) vierem com números válidos.
//
//  Uso:  GET /api/antt-coeficientes?numero=6085&ano=2026
//  Resp: { numero, ano, vigor, url, rows }   (rows no formato de RAW)
//  Erro: 422 { error, erros[] } — dados incompletos; 502 — portal fora.
// ─────────────────────────────────────────────────────────

import { resUrl, parseResolucaoHtml, validarCoeficientes, dataDaResolucao } from "../src/utils/anttUpdate.js";

// O anttlegis costuma servir ISO-8859-1; UTF-8 com '�' indica charset errado.
function decodificar(buf, contentType) {
  const cs = (contentType.match(/charset=([\w-]+)/i)?.[1] || "").toLowerCase();
  if (cs && cs !== "utf-8" && cs !== "utf8") return new TextDecoder("latin1").decode(buf);
  const utf = new TextDecoder("utf-8").decode(buf);
  return utf.includes("�") ? new TextDecoder("latin1").decode(buf) : utf;
}

async function baixar(url) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; frete-minimo/1.0)" },
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`ANTT respondeu HTTP ${r.status}`);
    return decodificar(new Uint8Array(await r.arrayBuffer()), r.headers.get("content-type") || "");
  } finally {
    clearTimeout(to);
  }
}

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  const numero = parseInt(String(req.query.numero || "").replace(/\D/g, ""), 10);
  const ano    = parseInt(String(req.query.ano    || "").replace(/\D/g, ""), 10);
  res.setHeader("Cache-Control", "no-store");
  if (!numero || !ano) return res.status(400).json({ error: "informe numero e ano" });

  const url = resUrl(numero, ano);
  let html;
  try {
    html = await baixar(url);
  } catch (e) {
    return res.status(502).json({ error: e.message || "falha ao consultar a ANTT" });
  }

  const v = validarCoeficientes(parseResolucaoHtml(html));
  if (!v.ok) {
    return res.status(422).json({
      error: `resolução sem todos os coeficientes (${v.erros.length} problema(s))`,
      erros: v.erros.slice(0, 50),
    });
  }
  res.status(200).json({ numero, ano, vigor: dataDaResolucao(html), url, rows: v.rows });
}
