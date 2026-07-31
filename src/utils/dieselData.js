/* ═══════════════════════════════════════════════════════════
   Combustível — preço do diesel S10 e consumo médio
   ═══════════════════════════════════════════════════════════

   O preço por UF vem de duas camadas:

     1. TABELA EMBUTIDA (DIESEL_UF_BASE) — foto do levantamento
        semanal da ANP, funciona offline e no `vite dev`.
     2. ANP AO VIVO — o botão "Atualizar" chama /api/diesel-anp,
        que lê a planilha semanal da ANP server-side. O resultado
        fica em localStorage e passa a valer sobre a tabela.

   Para atualizar a camada 1 na mão: rode /api/diesel-anp no deploy,
   cole os valores em DIESEL_UF_BASE e ajuste DIESEL_SOURCE.semana*.

   Fonte: ANP — Série Histórica do Levantamento de Preços,
   arquivo semanal por estado.
*/

export const DIESEL_SOURCE = {
  fonte: 'ANP · Levantamento de Preços',
  url: 'https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/precos/precos-revenda-e-de-distribuicao-combustiveis/serie-historica-do-levantamento-de-precos',
  semanaInicio: '2026-07-19',
  semanaFim:    '2026-07-25',
  ref: 'jul/2026',
};

/* Preço médio de revenda do diesel S10, R$/l, por UF.
   Semana de 19 a 25/07/2026 (ANP). */
export const DIESEL_UF_BASE = {
  AC: 8.00, AL: 7.00, AP: 6.90, AM: 7.18, BA: 7.46, CE: 6.98,
  DF: 6.92, ES: 6.90, GO: 6.75, MA: 7.16, MT: 6.91, MS: 6.78,
  MG: 6.79, PA: 7.31, PB: 7.07, PR: 6.84, PE: 6.86, PI: 7.33,
  RJ: 7.07, RN: 7.21, RS: 6.60, RO: 7.31, RR: 7.42, SC: 6.83,
  SP: 6.93, SE: 6.86, TO: 6.94,
};

const media = (obj) => {
  const v = Object.values(obj);
  return v.reduce((s, x) => s + x, 0) / v.length;
};

export const MEDIA_NACIONAL_BASE = Math.round(media(DIESEL_UF_BASE) * 1000) / 1000;

/* ── Camada ao vivo (/api/diesel-anp) ──────────────────────── */

const LS_ANP = 'calc_fuel_anp';
let live = null; // { ufs, mediaNacional, semanaInicio, semanaFim, buscadoEm }

/** Aceita o payload do endpoint só se parecer mesmo com a planilha da ANP. */
function valido(p) {
  if (!p || typeof p !== 'object' || !p.ufs) return false;
  const entradas = Object.entries(p.ufs).filter(
    ([uf, v]) => uf in DIESEL_UF_BASE && typeof v === 'number' && v > 2 && v < 20
  );
  return entradas.length >= 20;
}

export function aplicarPrecosANP(payload) {
  if (!valido(payload)) throw new Error('resposta da ANP em formato inesperado');
  live = {
    ufs: payload.ufs,
    mediaNacional: payload.mediaNacional || media(payload.ufs),
    semanaInicio: payload.semanaInicio,
    semanaFim: payload.semanaFim,
    buscadoEm: payload.atualizadoEm || new Date().toISOString(),
  };
  try { localStorage.setItem(LS_ANP, JSON.stringify(live)); } catch { /* quota/privado */ }
  return live;
}

// Recupera a última consulta ao subir o app — evita bater na ANP a cada reload.
(function carregarCache() {
  try {
    const raw = localStorage.getItem(LS_ANP);
    if (!raw) return;
    const p = JSON.parse(raw);
    if (valido(p)) live = p;
  } catch { /* cache corrompido: segue com a tabela embutida */ }
})();

/** De onde está vindo o preço agora — o card mostra isso na tela. */
export function dieselMeta() {
  const semanaFim = live?.semanaFim || DIESEL_SOURCE.semanaFim;
  const d = new Date(semanaFim);
  const idadeDias = isNaN(d) ? null : Math.floor((Date.now() - d.getTime()) / 86400000);
  return {
    aoVivo: !!live,
    semanaInicio: live?.semanaInicio || DIESEL_SOURCE.semanaInicio,
    semanaFim,
    mediaNacional: live?.mediaNacional ?? MEDIA_NACIONAL_BASE,
    idadeDias,
  };
}

/** Preço do diesel na UF, em R$/l. Cai na média nacional se a UF for desconhecida. */
export function dieselUF(uf) {
  const k = String(uf || '').toUpperCase();
  if (live?.ufs?.[k]) return live.ufs[k];
  if (live) return live.mediaNacional;
  return DIESEL_UF_BASE[k] ?? MEDIA_NACIONAL_BASE;
}

/** Busca a semana mais recente na ANP via serverless. Só funciona no deploy. */
export async function buscarPrecosANP() {
  const r = await fetch('/api/diesel-anp', { headers: { Accept: 'application/json' } });
  // O `vite dev` não roda /api e devolve o próprio .js da função; no deploy,
  // um HTML aqui significaria página de erro da Vercel. Nos dois casos o
  // JSON.parse quebraria com uma mensagem inútil.
  if (!(r.headers.get('content-type') || '').includes('application/json')) {
    throw new Error('endpoint indisponível (só responde no deploy)');
  }
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
  if (!j) throw new Error('resposta ilegível');
  return aplicarPrecosANP(j);
}

/* ── Consumo médio por composição veicular ────────────────
   Valores de referência de mercado (carregado, estrada, S10).
   São só um ponto de partida: o campo é editável e o consumo
   real varia com relevo, peso, pneu e motorista. */
export const CONSUMO_PRESET = {
  2: 6.0,   // toco / 3/4
  3: 4.5,   // truck
  4: 3.2,   // bitruck
  5: 2.5,   // carreta simples
  6: 2.2,   // carreta / vanderleia
  7: 2.0,   // bitrem
  9: 1.8,   // rodotrem
};

/** Ganho de consumo rodando vazio (km/l vazio ≈ km/l carregado × fator). */
export const CONSUMO_VAZIO_FATOR = 1.3;

export function consumoPreset(axles) {
  return CONSUMO_PRESET[axles] ?? CONSUMO_PRESET[5];
}

/* ── Base usada pela ANTT no piso vigente ─────────────────
   A Res. 6.084/2026 recalculou o CCD considerando o preço médio
   do S10 apurado pela ANP na época da publicação. É o pivô da
   estimativa de "piso corrigido pelo diesel". */
export const ANTT_DIESEL_BASE = {
  preco: 6.97,                 // R$/l
  resolucao: 'Res. 6.084/2026',
  ref: 'jul/2026',
};

/**
 * Piso indicativo corrigido pela diferença entre o diesel local e o
 * diesel-base da resolução, usando o consumo informado pelo usuário.
 *
 *   Δ por km = (preço local − preço base) ÷ (km/l)
 *   piso corrigido = (CCD + Δ) × distância + CC
 *
 * NÃO é valor oficial — serve para dimensionar reajuste em negociação.
 */
export function calcPisoCorrigido(ccd, cc, dist, kmPorLitro, precoLocal) {
  if (!ccd || !dist || !kmPorLitro || !precoLocal) return null;
  const deltaKm = (precoLocal - ANTT_DIESEL_BASE.preco) / kmPorLitro;
  return (ccd + deltaKm) * dist + (cc || 0);
}

/**
 * Custo de combustível da viagem.
 * @param km            distância só da ida
 * @param kmPorLitro    consumo carregado
 * @param precoLitro    R$/l
 * @param retornoVazio  se true, soma o trecho de volta
 * @param kmPorLitroVazio consumo no retorno (default: carregado × fator)
 */
export function calcCombustivel(km, kmPorLitro, precoLitro, retornoVazio, kmPorLitroVazio) {
  if (!km || !kmPorLitro || !precoLitro) return null;
  const kmlVolta = kmPorLitroVazio || kmPorLitro * CONSUMO_VAZIO_FATOR;
  const litrosIda = km / kmPorLitro;
  const litrosVolta = retornoVazio ? km / kmlVolta : 0;
  const litros = litrosIda + litrosVolta;
  const kmTotal = retornoVazio ? km * 2 : km;
  return {
    litros,
    litrosIda,
    litrosVolta,
    kmTotal,
    custo: litros * precoLitro,
    custoPorKm: (litros * precoLitro) / kmTotal,
  };
}
