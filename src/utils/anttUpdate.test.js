import { describe, it, expect, beforeEach } from 'vitest';

// localStorage falso (vitest roda em Node) — precisa existir antes de importar o módulo.
const mem = new Map();
globalThis.localStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: k => mem.delete(k),
};

const { RAW, IDX, ANTT_SOURCE, TBL_AXLES, CARGO_LBL, findRow } = await import('./anttData.js');
const {
  RAW_EMBUTIDA, SOURCE_EMBUTIDA, parseResolucaoHtml, validarCoeficientes, cargoDoTexto,
  aplicarResolucao, voltarResolucaoAnterior, temBackup, carregarBaseAtiva, dataDaResolucao,
} = await import('./anttUpdate.js');

const NOME = {
  granel_solido: 'Granel sólido', granel_liquido: 'Granel líquido',
  frigorificada: 'Frigorificada ou Aquecida', conteinerizada: 'Conteinerizada',
  carga_geral: 'Carga Geral', neogranel: 'Neogranel',
  perigosa_granel_solido: 'Perigosa (granel sólido)', perigosa_granel_liquido: 'Perigosa (granel líquido)',
  perigosa_frigorificada: 'Perigosa (frigorificada ou aquecida)', perigosa_conteinerizada: 'Perigosa (conteinerizada)',
  perigosa_carga_geral: 'Perigosa (carga geral)', granel_pressurizada: 'Carga Granel Pressurizada',
};
const br = (v, d) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

// Monta um HTML no layout do Anexo II (tabela → cabeçalho de eixos → CCD/CC por carga).
function htmlResolucao(rows, { omitir = null } = {}) {
  let h = '<html><body><p>RESOLUÇÃO Nº 6.085, DE 15 DE SETEMBRO DE 2026</p>';
  for (const t of ['A', 'B', 'C', 'D']) {
    const ax = TBL_AXLES[t];
    h += `<p>Tabela ${t} - Transporte rodoviário de carga lotação</p><table>`;
    h += `<tr><td>Tipo de carga</td><td>Coeficiente de custo</td><td>Unidade</td>${ax.map(a => `<td>${a}</td>`).join('')}</tr>`;
    for (const cg of Object.keys(CARGO_LBL)) {
      const cel = i => ax.map(a => {
        const r = rows.find(x => x[IDX.TBL] === t && x[IDX.CARGO] === cg && x[IDX.AXLES] === a);
        if (!r || (omitir && omitir(r))) return '<td>-</td>';
        return `<td>${br(r[i], i === IDX.CCD ? 4 : 2)}</td>`;
      }).join('');
      h += `<tr><td rowspan="2">${NOME[cg]}</td><td>Deslocamento (CCD)</td><td>R$/km</td>${cel(IDX.CCD)}</tr>`;
      h += `<tr><td>Carga e descarga (CC)</td><td>R$</td>${cel(IDX.CC)}</tr>`;
    }
    h += '</table>';
  }
  return h + '</body></html>';
}

// Nova resolução simulada: +5% em tudo (diferente o bastante para detectar troca).
const NOVAS = RAW_EMBUTIDA.map(r => {
  const n = [...r];
  n[IDX.CCD] = Math.round(r[IDX.CCD] * 1.05 * 10000) / 10000;
  n[IDX.CC] = Math.round(r[IDX.CC] * 1.05 * 100) / 100;
  return n;
});
const META = { numero: 6085, ano: 2026, vigor: 'set/2026' };

beforeEach(() => {
  mem.clear();
  RAW.splice(0, RAW.length, ...RAW_EMBUTIDA.map(r => [...r]));
  Object.assign(ANTT_SOURCE, SOURCE_EMBUTIDA);
});

describe('cargoDoTexto', () => {
  it('distingue perigosa da comum e reconhece todas as cargas', () => {
    for (const [k, nome] of Object.entries(NOME)) expect(cargoDoTexto(nome)).toBe(k);
    expect(cargoDoTexto('Carga e descarga (CC)')).toBeNull();
  });
});

describe('parseResolucaoHtml + validarCoeficientes', () => {
  it('extrai todas as combinações com os valores exatos', () => {
    const v = validarCoeficientes(parseResolucaoHtml(htmlResolucao(NOVAS)));
    expect(v.erros).toEqual([]);
    expect(v.ok).toBe(true);
    expect(v.rows).toEqual(NOVAS);
  });

  it('lê a data da resolução', () => {
    expect(dataDaResolucao(htmlResolucao(NOVAS))).toBe('set/2026');
  });

  it('falha se faltar um eixo de uma tabela', () => {
    const html = htmlResolucao(NOVAS, { omitir: r => r[IDX.TBL] === 'C' && r[IDX.AXLES] === 9 });
    const v = validarCoeficientes(parseResolucaoHtml(html));
    expect(v.ok).toBe(false);
    expect(v.rows).toEqual([]);
    expect(v.erros.some(e => e.includes('Tabela C') && e.includes('9 eixos') && e.includes('ausente'))).toBe(true);
  });

  it('falha se faltar uma tabela inteira', () => {
    const html = htmlResolucao(NOVAS).replace(/Tabela D[\s\S]*<\/table>/, '');
    const v = validarCoeficientes(parseResolucaoHtml(html));
    expect(v.ok).toBe(false);
    expect(v.erros.filter(e => e.startsWith('Tabela D')).length)
      .toBe(RAW_EMBUTIDA.filter(r => r[IDX.TBL] === 'D').length);
  });

  it('falha com número inválido, zero ou fora da faixa (ex.: CCD↔CC trocados)', () => {
    const ruim = NOVAS.map(r => [...r]);
    ruim[0][IDX.CCD] = NaN;
    ruim[1][IDX.CC] = 0;
    ruim[2][IDX.CCD] = ruim[2][IDX.CC];
    const v = validarCoeficientes(ruim);
    expect(v.ok).toBe(false);
    expect(v.erros).toHaveLength(3);
  });

  it('falha com resposta vazia', () => {
    expect(validarCoeficientes([]).ok).toBe(false);
    expect(validarCoeficientes(parseResolucaoHtml('<html>nada</html>')).ok).toBe(false);
  });
});

describe('aplicarResolucao / voltarResolucaoAnterior', () => {
  it('substitui os coeficientes, grava a resolução ativa e faz backup da anterior', () => {
    const antes = findRow('A', 'granel_solido', 2)[IDX.CCD];
    aplicarResolucao(NOVAS, META);
    expect(findRow('A', 'granel_solido', 2)[IDX.CCD]).toBe(NOVAS[0][IDX.CCD]);
    expect(findRow('A', 'granel_solido', 2)[IDX.CCD]).not.toBe(antes);
    expect(ANTT_SOURCE.resolucao).toBe('Res. ANTT 6.085/2026');
    expect(ANTT_SOURCE.vigor).toBe('set/2026');
    expect(ANTT_SOURCE.url).toContain('numeroAto=00006085');
    expect(temBackup()).toBe(true);
    expect(JSON.parse(mem.get('antt_base_backup')).rows).toEqual(RAW_EMBUTIDA);
  });

  it('dados incompletos: lança erro e mantém a base anterior intacta', () => {
    const incompletas = NOVAS.filter(r => !(r[IDX.TBL] === 'B' && r[IDX.AXLES] === 6));
    expect(() => aplicarResolucao(incompletas, META)).toThrow(/dados incompletos/);
    expect(RAW).toEqual(RAW_EMBUTIDA);
    expect(ANTT_SOURCE.resolucao).toBe(SOURCE_EMBUTIDA.resolucao);
    expect(mem.size).toBe(0); // nem backup nem base ativa gravados
  });

  it('reaplica a base ativa ao recarregar o app', () => {
    aplicarResolucao(NOVAS, META);
    RAW.splice(0, RAW.length, ...RAW_EMBUTIDA.map(r => [...r])); // simula reload
    Object.assign(ANTT_SOURCE, SOURCE_EMBUTIDA);
    expect(carregarBaseAtiva()).toBe(true);
    expect(RAW).toEqual(NOVAS);
    expect(ANTT_SOURCE.resolucao).toBe('Res. ANTT 6.085/2026');
  });

  it('volta para a resolução anterior usando o backup', () => {
    aplicarResolucao(NOVAS, META);
    voltarResolucaoAnterior();
    expect(RAW).toEqual(RAW_EMBUTIDA);
    expect(ANTT_SOURCE.resolucao).toBe(SOURCE_EMBUTIDA.resolucao);
    expect(mem.has('antt_base_ativa')).toBe(false);
    expect(temBackup()).toBe(false);
  });

  it('voltar sem backup falha sem mexer na base', () => {
    expect(() => voltarResolucaoAnterior()).toThrow(/backup/);
    expect(RAW).toEqual(RAW_EMBUTIDA);
  });
});
