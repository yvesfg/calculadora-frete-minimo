import { describe, it, expect } from 'vitest';
import { TAX_PROFILES, calcEncargos, precoMargemReal } from './encargos.js';

const lrPf = TAX_PROFILES.lr_pf;

describe('calcEncargos', () => {
  it('caso real CTRC 35931 (Rodorrica, LR, contratado PF): débito 9,25% s/ preço − crédito 6,9375% s/ contrato + INSS 4% s/ contrato', () => {
    const e = calcEncargos(lrPf, 13032.69, 11619, 4);
    expect(e.pis + e.cofins).toBeCloseTo(1205.52, 2);
    expect(e.credito).toBeCloseTo(806.07, 2);
    expect(e.inss).toBeCloseTo(464.76, 2);
    expect(e.total).toBeCloseTo(864.22, 2);
    // Líquido = 549,47 — a Conferência do CO dá 549,48 porque arredonda cada parcela.
    expect(13032.69 - 11619 - e.total).toBeCloseTo(549.47, 2);
  });
  it('PJ do LR: crédito cheio e sem INSS', () => {
    const e = calcEncargos(TAX_PROFILES.lr_pj_lr, 10000, 8000, 4);
    expect(e.credito).toBeCloseTo(740);
    expect(e.inss).toBe(0);
    expect(e.total).toBeCloseTo(185);
  });
  it('Simples: sem PIS/COFINS e sem crédito, INSS sobre o contrato', () => {
    const e = calcEncargos(TAX_PROFILES.sn_anexo, 10000, 8000, 4);
    expect(e.total).toBeCloseTo(320);
  });
});

describe('precoMargemReal', () => {
  it('o preço achado devolve exatamente a margem pedida', () => {
    for (const k of Object.keys(TAX_PROFILES)) {
      const tp = TAX_PROFILES[k];
      const P = precoMargemReal(tp, 10000, 0.15, 4);
      const net = P - calcEncargos(tp, P, 10000, 4).total - 10000;
      expect(net / P).toBeCloseTo(0.15, 10);
    }
  });
  it('margem impossível (≥ 1 − débito) não tem preço', () => {
    expect(precoMargemReal(lrPf, 10000, 0.95, 4)).toBeNull();
  });
});
