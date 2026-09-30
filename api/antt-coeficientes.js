// ─────────────────────────────────────────────────────────
//  COEFICIENTES DE UM ATO DO PISO ANTT (Resolução DG ou Portaria SUROC)
//  O navegador não pode ler o portal anttlegis (CORS), então este
//  endpoint baixa a resolução server-side, extrai CCD/CC das tabelas
//  A–D e só responde 200 se TODAS as combinações da base atual
//  (tabela × carga × eixos) vierem com números válidos.
//
//  Uso:  GET /api/antt-coeficientes?numero=6085&ano=2026          (resolução)
//        GET /api/antt-coeficientes?tipo=POR&numero=22&ano=2026   (portaria SUROC)
//  Resp: { tipo, numero, ano, vigor, url, rows }   (rows no formato de RAW)
//  Erro: 422 { error, erros[] } — dados incompletos; 502 — portal fora.
// ─────────────────────────────────────────────────────────

import { atoUrl, decodificarHtml, parseResolucaoHtml, validarCoeficientes, dataDaResolucao } from "../src/utils/anttUpdate.js";

async function baixar(url) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; frete-minimo/1.0)" },
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`ANTT respondeu HTTP ${r.status}`);
    return decodificarHtml(new Uint8Array(await r.arrayBuffer()), r.headers.get("content-type") || "");
  } finally {
    clearTimeout(to);
  }
}

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  const numero = parseInt(String(req.query.numero || "").replace(/\D/g, ""), 10);
  const ano    = parseInt(String(req.query.ano    || "").replace(/\D/g, ""), 10);
  const tipo   = String(req.query.tipo || "RES").toUpperCase() === "POR" ? "POR" : "RES";
  res.setHeader("Cache-Control", "no-store");
  if (!numero || !ano) return res.status(400).json({ error: "informe numero e ano" });

  const url = atoUrl({ tipo, numero, ano });
  let html;
  try {
    html = await baixar(url);
  } catch (e) {
    return res.status(502).json({ error: e.message || "falha ao consultar a ANTT" });
  }

  const v = validarCoeficientes(parseResolucaoHtml(html));
  if (!v.ok) {
    return res.status(422).json({
      error: `ato sem todos os coeficientes (${v.erros.length} problema(s))`,
      erros: v.erros.slice(0, 50),
    });
  }
  res.status(200).json({ tipo, numero, ano, vigor: dataDaResolucao(html), url, rows: v.rows });
}
