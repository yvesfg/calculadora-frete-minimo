/* ═══════════════════════════════════════════════════════════
   Atualização da base ANTT (coeficientes CCD/CC) por resolução
   ═══════════════════════════════════════════════════════════

   Mesmo esquema de camadas do diesel (dieselData.js):

     1. BASE EMBUTIDA — RAW/ANTT_SOURCE em anttData.js.
     2. BASE ATIVA   — o botão "Atualizar base" chama
        /api/antt-coeficientes, valida e grava no Supabase
        (frete_antt_base) — vale para todos os usuários.
        Ao subir o app ela é reaplicada sobre RAW (in-place, para
        findRow/CalcPage/SheetPage continuarem funcionando sem mudança).

   Antes de aplicar, a base vigente vai para um backup; "Voltar"
   restaura exatamente esse backup.

   Este arquivo é puro (sem DOM): o parser também roda no servidor.
*/

import { RAW, IDX, ANTT_SOURCE } from './anttData.js';

// Cópias imutáveis da base embutida — referência de estrutura e fallback.
export const RAW_EMBUTIDA = RAW.map(r => [...r]);
export const SOURCE_EMBUTIDA = { ...ANTT_SOURCE };

export const PORTAL = 'https://anttlegis.antt.gov.br/action/ActionDatalegis.php';
export function resUrl(numero, ano) {
  const n = String(numero).padStart(8, '0');
  return `${PORTAL}?acao=abrirTextoAto&tipo=RES&numeroAto=${n}&seqAto=000&valorAno=${ano}&orgao=DG/ANTT/MT&cod_modulo=623&cod_menu=9230`;
}
export const fmtRes = n => String(n).replace(/(\d)(\d{3})$/, '$1.$2');

const chaveLinha = (tbl, cargo, axles) => `${tbl}|${cargo}|${axles}`;

/* ── Parser do HTML da resolução ─────────────────────────── */

const semAcento = s => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim();

/** Nome da carga no texto da ANTT → chave usada em RAW. Perigosa antes da comum. */
export function cargoDoTexto(txt) {
  const t = semAcento(txt);
  if (t.length > 80) return null;
  if (/pressuriz/.test(t)) return 'granel_pressurizada';
  const per = /perigos/.test(t);
  const p = per ? 'perigosa_' : '';
  if (/neogranel/.test(t)) return per ? null : 'neogranel';
  if (/granel solido/.test(t)) return p + 'granel_solido';
  if (/granel liquido/.test(t)) return p + 'granel_liquido';
  if (/frigorific|aquecid/.test(t)) return p + 'frigorificada';
  if (/conteineriz/.test(t)) return p + 'conteinerizada';
  if (/carga geral/.test(t)) return p + 'carga_geral';
  return null;
}

const decodeEnt = s => s
  .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"')
  .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
  .replace(/&([a-z])(acute|grave|circ|tilde|cedil|uml);/gi, '$1');

/** HTML → linhas de células (tabela → [[célula, ...], ...]). */
function linhasDeCelulas(html) {
  const txt = String(html)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/t[dh]\s*>/gi, '\u0001')
    .replace(/<\/tr\s*>|<br\s*\/?>|<\/p\s*>|<\/div\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  return decodeEnt(txt).split('\n')
    .map(l => l.split('\u0001').map(c => c.replace(/\s+/g, ' ').trim()))
    .map(cs => (cs.length > 1 && cs[cs.length - 1] === '' ? cs.slice(0, -1) : cs))
    .filter(cs => cs.some(c => c));
}

const RE_NUM = /^\d{1,3}(\.\d{3})*(,\d+)?$|^\d+(,\d+)?$/;
const RE_VAZIO = /^[-–—]$/;
const numBR = s => parseFloat(s.replace(/\./g, '').replace(',', '.'));

/**
 * Extrai [tbl, hp, fc, cargo, axles, CCD, CC] do HTML da resolução.
 * Estrutura esperada (Anexo II da Res. 5.867/2020): por tabela A–D,
 * cabeçalho com nº de eixos e, por carga, uma linha CCD (R$/km) e uma CC (R$).
 */
export function parseResolucaoHtml(html) {
  let tbl = null, eixos = null, cargo = null;
  const achados = new Map(); // chave → { ccd, cc }

  for (const cels of linhasDeCelulas(html)) {
    const primeira = cels.find(c => c) || '';
    const mTbl = primeira.length < 200 && primeira.match(/^tabela\s+([A-D])\b/i);
    if (mTbl) { tbl = mTbl[1].toUpperCase(); eixos = null; cargo = null; continue; }
    if (!tbl) continue;

    // Cabeçalho de eixos: células com inteiros 2–9 em ordem crescente.
    const ints = cels.filter(c => /^[2-9]$/.test(c)).map(Number);
    if (ints.length >= 3 && ints.every((v, i) => !i || v > ints[i - 1])
        && !cels.some(c => RE_NUM.test(c) && c.includes(','))) {
      eixos = ints; continue;
    }

    for (const c of cels) { const k = cargoDoTexto(c); if (k) { cargo = k; break; } }

    const rotulo = semAcento(cels.filter(c => !RE_NUM.test(c) && !RE_VAZIO.test(c)).join(' '));
    const tipo = /desloc|\bccd\b|r\$\s*\/\s*km/.test(rotulo) ? 'ccd'
      : /descarga|\bcc\b/.test(rotulo) ? 'cc' : null;
    if (!tipo || !cargo || !eixos) continue;

    const valores = cels.filter(c => RE_NUM.test(c) || RE_VAZIO.test(c));
    if (valores.length !== eixos.length) continue; // linha desalinhada: validação acusa a falta
    valores.forEach((v, i) => {
      if (RE_VAZIO.test(v)) return;
      const k = chaveLinha(tbl, cargo, eixos[i]);
      const cur = achados.get(k) || {};
      if (cur[tipo] == null) cur[tipo] = numBR(v); // primeira ocorrência vale
      achados.set(k, cur);
    });
  }

  const out = [];
  for (const [k, { ccd, cc }] of achados) {
    const [t, cg, ax] = k.split('|');
    const ref = RAW_EMBUTIDA.find(r => r[IDX.TBL] === t);
    out.push([t, ref ? ref[IDX.HP] : null, ref ? ref[IDX.FC] : null, cg, Number(ax), ccd, cc]);
  }
  return out;
}

/** "RESOLUÇÃO Nº 6.085, DE 15 DE SETEMBRO DE 2026" → 'set/2026' (null se não achar). */
export function dataDaResolucao(html) {
  const t = semAcento(String(html).replace(/<[^>]+>/g, ' '));
  const m = t.match(/\bde \d{1,2}o? de (janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro) de (\d{4})/);
  return m ? `${m[1].slice(0, 3)}/${m[2]}` : null; // slice(0,3) já dá jan, fev, mar…
}

/**
 * Ementa da resolução ("Dispõe sobre…"/"Atualiza…"): texto entre o último título
 * "RESOLUÇÃO … Nº x, DE …" e "A Diretoria Colegiada…/resolve". null se não achar.
 */
export function ementaDoHtml(html) {
  const t = String(html)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]+>/g, ' ');
  const txt = decodeEnt(t).replace(/\s+/g, ' ');
  const fim = txt.search(/a diretoria colegiada|,?\s*resolve\s*:/i);
  if (fim < 0) return null;
  const antes = txt.slice(0, fim);
  // \S tolera acento corrompido (página ISO-8859-1 lida como UTF-8 no antt-check).
  const titulos = [...antes.matchAll(/resolu\S{1,4}o\s+(?:antt\s+)?n\S{0,2}\s*[\d.]+\s*,\s*de\s+\d{1,2}\S?\s+de\s+\S+\s+de\s+\d{4}/gi)];
  if (!titulos.length) return null;
  const ult = titulos[titulos.length - 1];
  const ementa = antes.slice(ult.index + ult[0].length).trim();
  return ementa && ementa.length < 1000 ? ementa : null;
}

/**
 * A resolução trata do piso mínimo de frete? Decide pela EMENTA — o corpo de
 * outras resoluções pode citar "coeficientes dos pisos mínimos" de passagem
 * (ex.: Res. 6.085/2026, estrutura organizacional). Sem ementa legível,
 * cai na busca no texto todo (prefere falso aviso a perder uma resolução).
 */
export function ehResolucaoDoPiso(html) {
  const ementa = ementaDoHtml(html);
  if (ementa) return /piso|frete|5\.?867|coeficiente/i.test(ementa);
  return /5\.?867|Coeficiente|piso\s*m[íi]nimo/i.test(String(html));
}

/* ── Validação ───────────────────────────────────────────── */

const FAIXA = [0.5, 2]; // novo/anterior aceitável — pega coluna trocada ou CCD↔CC

/**
 * Exige todas as combinações tabela × carga × eixos da base de referência,
 * com CCD e CC numéricos, positivos e na faixa plausível.
 * Retorna { ok, erros, rows } — rows na ordem da referência.
 */
export function validarCoeficientes(novas, ref = RAW_EMBUTIDA) {
  const erros = [];
  if (!Array.isArray(novas) || !novas.length) {
    return { ok: false, erros: ['nenhum coeficiente encontrado na resolução'], rows: [] };
  }
  const mapa = new Map(novas.map(r => [chaveLinha(r[IDX.TBL], r[IDX.CARGO], r[IDX.AXLES]), r]));
  const rows = [];
  for (const r of ref) {
    const k = chaveLinha(r[IDX.TBL], r[IDX.CARGO], r[IDX.AXLES]);
    const n = mapa.get(k);
    const rot = `Tabela ${r[IDX.TBL]} · ${r[IDX.CARGO]} · ${r[IDX.AXLES]} eixos`;
    if (!n) { erros.push(`${rot}: ausente`); continue; }
    let ok = true;
    for (const [nome, i] of [['CCD', IDX.CCD], ['CC', IDX.CC]]) {
      const v = n[i];
      if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
        erros.push(`${rot}: ${nome} inválido (${v})`); ok = false; continue;
      }
      const razao = v / r[i];
      if (razao < FAIXA[0] || razao > FAIXA[1]) {
        erros.push(`${rot}: ${nome} fora da faixa (${v} vs ${r[i]})`); ok = false;
      }
    }
    if (ok) rows.push([r[IDX.TBL], r[IDX.HP], r[IDX.FC], r[IDX.CARGO], r[IDX.AXLES], n[IDX.CCD], n[IDX.CC]]);
  }
  return { ok: erros.length === 0, erros, rows: erros.length ? [] : rows };
}

/* ── Aplicar / voltar ────────────────────────────────────
   A base é GERAL: fica num "store" compartilhado (Supabase no app,
   ver anttStore.js). O localStorage é só cache para o 1º render.
   Store: { ler(id) → {rows, source}|null, aplicar(ativa, backupInicial),
   voltar() → {rows, source} }; ids 'ativa' e 'backup' (rows null = sem
   backup). No Supabase, aplicar/voltar são RPCs que só admin executa. */

const LS_CACHE = 'antt_base_ativa';
const ls = () => { try { return globalThis.localStorage || null; } catch { return null; } };
const cacheLer = () => { try { const v = ls()?.getItem(LS_CACHE); return v ? JSON.parse(v) : null; } catch { return null; } };
const cacheGravar = v => { try { v ? ls()?.setItem(LS_CACHE, JSON.stringify(v)) : ls()?.removeItem(LS_CACHE); } catch { /* cache é opcional */ } };

/** Store local (testes / fallback): mesma semântica das RPCs do Supabase. */
const lsGet = id => { try { const v = ls()?.getItem(`antt_store_${id}`); return v ? JSON.parse(v) : null; } catch { return null; } };
const lsSet = (id, v) => ls()?.setItem(`antt_store_${id}`, JSON.stringify(v));
export const storeLocal = {
  async ler(id) { return lsGet(id); },
  async aplicar(ativa, backupInicial) {
    const atual = lsGet('ativa');
    lsSet('backup', atual?.rows ? atual : backupInicial);
    lsSet('ativa', ativa);
  },
  async voltar() {
    const b = lsGet('backup');
    if (!b?.rows) throw new Error('sem backup');
    lsSet('ativa', b);
    lsSet('backup', { rows: null, source: null });
    return b;
  },
};

function aplicarNaMemoria(rows, source) {
  RAW.splice(0, RAW.length, ...rows.map(r => [...r]));
  Object.assign(ANTT_SOURCE, source);
}

const fotoAtual = () => ({ rows: RAW.map(r => [...r]), source: { ...ANTT_SOURCE } });
const valida = b => !!(b?.source && b?.rows && validarCoeficientes(b.rows).ok);

/**
 * Substitui os coeficientes pela nova resolução (para todos). Valida antes;
 * se falhar — validação ou gravação — lança erro e a base em uso não muda.
 * O backup da base vigente é gravado primeiro.
 */
export async function aplicarResolucao(novas, { numero, ano, vigor }, store = storeLocal) {
  const v = validarCoeficientes(novas);
  if (!v.ok) {
    const e = new Error(`dados incompletos: ${v.erros.length} problema(s) — ${v.erros.slice(0, 3).join('; ')}`);
    e.erros = v.erros;
    throw e;
  }
  const source = {
    ...SOURCE_EMBUTIDA,
    resolucao: `Res. ANTT ${fmtRes(numero)}/${ano}`,
    vigor: vigor || ANTT_SOURCE.vigor,
    url: resUrl(numero, ano),
  };
  const ativa = { rows: v.rows, source };
  await store.aplicar(ativa, fotoAtual()); // backup = ativa geral atual (ou a base em uso, se ainda não houver)
  aplicarNaMemoria(v.rows, source);
  cacheGravar(ativa);
  return source;
}

/** Resolução guardada no backup (null se não houver). */
export async function backupInfo(store = storeLocal) {
  const b = await store.ler('backup');
  return valida(b) ? b.source : null;
}

/** Volta (para todos) para a base guardada no backup. */
export async function voltarResolucaoAnterior(store = storeLocal) {
  const bk = await store.ler('backup');
  if (!valida(bk)) throw new Error('backup ausente ou corrompido');
  const b = await store.voltar();
  if (!valida(b)) throw new Error('backup restaurado inválido');
  aplicarNaMemoria(b.rows, b.source);
  cacheGravar(b);
  return b.source;
}

/** Cache local → memória, síncrono, antes do 1º render. */
export function carregarBaseAtiva() {
  const a = cacheLer();
  if (!valida(a)) return false;
  aplicarNaMemoria(a.rows, a.source);
  return true;
}
carregarBaseAtiva();

/**
 * Lê a base geral do store e aplica. Sem registro válido → base embutida.
 * Falha de rede → mantém o que está (cache ou embutida) e relança o erro.
 */
export async function sincronizarBase(store = storeLocal) {
  const a = await store.ler('ativa');
  const alvo = valida(a) ? a : { rows: RAW_EMBUTIDA, source: SOURCE_EMBUTIDA };
  aplicarNaMemoria(alvo.rows, alvo.source);
  cacheGravar(valida(a) ? a : null);
  return alvo.source;
}

/** Busca e aplica a resolução via serverless (CORS impede no navegador). */
export async function atualizarBase(numero, ano, store = storeLocal) {
  const r = await fetch(`/api/antt-coeficientes?numero=${numero}&ano=${ano}`, { headers: { Accept: 'application/json' } });
  if (!(r.headers.get('content-type') || '').includes('application/json')) {
    throw new Error('endpoint indisponível (só responde no deploy)');
  }
  const j = await r.json().catch(() => null);
  if (!r.ok) {
    const e = new Error(j?.error || `HTTP ${r.status}`);
    e.erros = j?.erros || [];
    throw e;
  }
  if (!j?.rows) throw new Error('resposta ilegível');
  return aplicarResolucao(j.rows, { numero, ano, vigor: j.vigor }, store);
}
