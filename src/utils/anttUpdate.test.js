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
  aplicarResolucao, voltarResolucaoAnterior, backupInfo, carregarBaseAtiva, sincronizarBase, dataDaResolucao,
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

// Store em memória = tabela frete_antt_base (compartilhada entre usuários).
const novoStore = () => {
  const db = new Map();
  return { db, async ler(id) { return db.get(id) ?? null; }, async gravar(id, v) { db.set(id, JSON.parse(JSON.stringify(v))); } };
};
const simulaOutroUsuario = () => { // outro navegador: memória e cache zerados
  mem.clear();
  RAW.splice(0, RAW.length, ...RAW_EMBUTIDA.map(r => [...r]));
  Object.assign(ANTT_SOURCE, SOURCE_EMBUTIDA);
};

describe('aplicarResolucao / voltarResolucaoAnterior', () => {
  it('substitui os coeficientes, grava a resolução ativa e faz backup da anterior', async () => {
    const st = novoStore();
    const antes = findRow('A', 'granel_solido', 2)[IDX.CCD];
    await aplicarResolucao(NOVAS, META, st);
    expect(findRow('A', 'granel_solido', 2)[IDX.CCD]).toBe(NOVAS[0][IDX.CCD]);
    expect(findRow('A', 'granel_solido', 2)[IDX.CCD]).not.toBe(antes);
    expect(ANTT_SOURCE.resolucao).toBe('Res. ANTT 6.085/2026');
    expect(ANTT_SOURCE.vigor).toBe('set/2026');
    expect(ANTT_SOURCE.url).toContain('numeroAto=00006085');
    expect(st.db.get('ativa').rows).toEqual(NOVAS);
    expect(st.db.get('backup').rows).toEqual(RAW_EMBUTIDA);
    expect(await backupInfo(st)).toMatchObject({ resolucao: SOURCE_EMBUTIDA.resolucao });
  });

  it('dados incompletos: lança erro e mantém a base anterior intacta', async () => {
    const st = novoStore();
    const incompletas = NOVAS.filter(r => !(r[IDX.TBL] === 'B' && r[IDX.AXLES] === 6));
    await expect(aplicarResolucao(incompletas, META, st)).rejects.toThrow(/dados incompletos/);
    expect(RAW).toEqual(RAW_EMBUTIDA);
    expect(ANTT_SOURCE.resolucao).toBe(SOURCE_EMBUTIDA.resolucao);
    expect(st.db.size).toBe(0); // nem backup nem base ativa gravados
  });

  it('falha ao gravar no store: base em uso não muda', async () => {
    const st = { async ler() { return null; }, async gravar() { throw new Error('offline'); } };
    await expect(aplicarResolucao(NOVAS, META, st)).rejects.toThrow(/offline/);
    expect(RAW).toEqual(RAW_EMBUTIDA);
  });

  it('é geral: outro usuário sincroniza e recebe a nova base', async () => {
    const st = novoStore();
    await aplicarResolucao(NOVAS, META, st);
    simulaOutroUsuario();
    expect(RAW).toEqual(RAW_EMBUTIDA);
    await sincronizarBase(st);
    expect(RAW).toEqual(NOVAS);
    expect(ANTT_SOURCE.resolucao).toBe('Res. ANTT 6.085/2026');
  });

  it('store com dado inválido: sincroniza para a base embutida', async () => {
    const st = novoStore();
    st.db.set('ativa', { rows: NOVAS.slice(0, 10), source: { resolucao: 'x' } });
    await sincronizarBase(st);
    expect(RAW).toEqual(RAW_EMBUTIDA);
  });

  it('cache local reaplica a última base antes do 1º render', async () => {
    await aplicarResolucao(NOVAS, META, novoStore());
    RAW.splice(0, RAW.length, ...RAW_EMBUTIDA.map(r => [...r])); // reload, mesmo navegador
    Object.assign(ANTT_SOURCE, SOURCE_EMBUTIDA);
    expect(carregarBaseAtiva()).toBe(true);
    expect(RAW).toEqual(NOVAS);
  });

  it('volta (para todos) para a resolução anterior usando o backup', async () => {
    const st = novoStore();
    await aplicarResolucao(NOVAS, META, st);
    await voltarResolucaoAnterior(st);
    expect(RAW).toEqual(RAW_EMBUTIDA);
    expect(ANTT_SOURCE.resolucao).toBe(SOURCE_EMBUTIDA.resolucao);
    expect(await backupInfo(st)).toBeNull();
    simulaOutroUsuario();
    await sincronizarBase(st);
    expect(RAW).toEqual(RAW_EMBUTIDA);
  });

  it('voltar sem backup falha sem mexer na base', async () => {
    await expect(voltarResolucaoAnterior(novoStore())).rejects.toThrow(/backup/);
    expect(RAW).toEqual(RAW_EMBUTIDA);
  });
});
