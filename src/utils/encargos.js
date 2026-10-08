/* Encargos da transportadora sobre um frete: PIS/COFINS + INSS patronal.

   Até 08/10/2026 a calculadora somava PIS + COFINS + INSS numa alíquota só e aplicava
   tudo sobre o PREÇO. Dois erros:
   1. Lucro Real (não cumulativo, Leis 10.637/02 e 10.833/03): o DÉBITO é 9,25%
      (1,65% + 7,6%) sobre a receita sem ICMS, e o contrato do subcontratado gera CRÉDITO:
        PF (TAC) ou PJ do Simples → crédito presumido de 75% = 6,9375% (art. 3º, §§ 19-20);
        PJ do Lucro Real/Presumido → crédito cheio de 9,25% (art. 3º, II).
      Os perfis tinham a alíquota do CRÉDITO (6,9375%) no lugar da do débito, e nenhum crédito.
   2. INSS patronal (20% × 20% = 4%) incide sobre o que se paga ao autônomo PF — o
      CONTRATO —, não sobre o preço. Contratado PJ não gera esse encargo.
   Tudo é apurado no mês; aqui é a parte que cabe a este frete.

   Simples Nacional: PIS/COFINS estão dentro do DAS, sem crédito — os perfis SN ficam com
   débito e crédito zerados e só o INSS informado (contratação de PF). */

export const ALIQ_PIS = 0.0165;
export const ALIQ_COFINS = 0.076;
const DEB_LR = ALIQ_PIS + ALIQ_COFINS;
export const CRED_PRESUMIDO = DEB_LR * 0.75;

export const TAX_PROFILES = {
  lr_pf:    { label:'LR PF',    pis:ALIQ_PIS, cofins:ALIQ_COFINS, credito:CRED_PRESUMIDO, inss:true,  hint:'Lucro Real · contratado PF (TAC): crédito presumido + INSS' },
  lr_pj_sn: { label:'LR PJ SN', pis:ALIQ_PIS, cofins:ALIQ_COFINS, credito:CRED_PRESUMIDO, inss:false, hint:'Lucro Real · contratado PJ do Simples: crédito presumido' },
  lr_pj_lr: { label:'LR PJ LR', pis:ALIQ_PIS, cofins:ALIQ_COFINS, credito:DEB_LR,         inss:false, hint:'Lucro Real · contratado PJ do LR/LP: crédito cheio' },
  sn_mei:   { label:'SN MEI',   pis:0, cofins:0, credito:0, inss:true, hint:'Simples: PIS/COFINS dentro do DAS' },
  sn_anexo: { label:'SN Anexo', pis:0, cofins:0, credito:0, inss:true, hint:'Simples: PIS/COFINS dentro do DAS' },
  sn_nfse:  { label:'SN NFSe',  pis:0, cofins:0, credito:0, inss:true, hint:'Simples: PIS/COFINS dentro do DAS' },
};

/** Encargos de um frete com preço `preco` (sem ICMS) e contrato `contrato`. */
export function calcEncargos(tp, preco, contrato, inssPct) {
  const p = Number(preco) || 0, c = Number(contrato) || 0;
  const pis = p * (tp?.pis || 0);
  const cofins = p * (tp?.cofins || 0);
  const credito = c * (tp?.credito || 0);
  const inss = tp?.inss ? c * (Number(inssPct) || 0) / 100 : 0;
  const total = pis + cofins - credito + inss;
  return { pis, cofins, credito, inss, total, pctPreco: p ? total / p : 0 };
}

/** Preço que deixa `margem` (fração) de líquido sobre o próprio preço:
 *  P − (deb·P − cred·C + inss·C) − C = m·P  ⇒  P = C·(1 − cred + inss) / (1 − deb − m). */
export function precoMargemReal(tp, contrato, margem, inssPct) {
  const c = Number(contrato) || 0;
  if (!c) return null;
  const deb = (tp?.pis || 0) + (tp?.cofins || 0);
  const inss = tp?.inss ? (Number(inssPct) || 0) / 100 : 0;
  const den = 1 - deb - margem;
  return den > 0 ? c * (1 - (tp?.credito || 0) + inss) / den : null;
}
