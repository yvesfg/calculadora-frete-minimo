/* ── Custos e conversões comerciais que ficam FORA do piso ANTT ──────────
   O piso da Res. 6.084/2026 cobre apenas o deslocamento (CCD × km + CC).
   Seguro da carga (averbação/RCTR-C sobre o valor da NF) e ICMS do frete
   são negociados à parte — por isso vivem aqui e nunca alteram o piso. */

/** Taxa usual de seguro sobre o valor da nota fiscal, em % (0,024% da NF). */
export const SEGURO_TAXA_PADRAO = 0.024;

/** Alíquotas de ICMS de frete mais comuns (%). 12 = interestadual padrão. */
export const ICMS_PRESETS = [12, 7, 4, 17, 18, 20];
export const ICMS_PADRAO = 12;

/**
 * Custo do seguro da carga.
 * @param valorNF  valor da nota fiscal em R$
 * @param taxaPct  taxa em % sobre a NF (ex.: 0,024)
 * @returns {{ custo:number, taxaPct:number, valorNF:number }|null}
 */
export function calcSeguro(valorNF, taxaPct) {
  if (!valorNF || !taxaPct) return null;
  return { custo: valorNF * (taxaPct / 100), taxaPct, valorNF };
}

/**
 * ICMS do frete é imposto "por dentro": está embutido no valor do CTe.
 *
 *   líquido = bruto × (1 − alíquota)
 *   bruto   = líquido ÷ (1 − alíquota)
 *
 * @param valor      valor digitado pelo usuário
 * @param aliqPct    alíquota em %
 * @param jaTemIcms  true = o valor digitado é o bruto (CTe, com ICMS dentro)
 * @returns {{ bruto:number, liquido:number, icms:number, aliqPct:number }|null}
 */
export function aplicarICMS(valor, aliqPct, jaTemIcms) {
  if (!valor) return null;
  const a = (aliqPct || 0) / 100;
  if (a <= 0 || a >= 1) return { bruto: valor, liquido: valor, icms: 0, aliqPct: 0 };
  const bruto   = jaTemIcms ? valor : valor / (1 - a);
  const liquido = jaTemIcms ? valor * (1 - a) : valor;
  return { bruto, liquido, icms: bruto - liquido, aliqPct };
}
