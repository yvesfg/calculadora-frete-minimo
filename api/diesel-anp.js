// ─────────────────────────────────────────────────────────
//  PREÇO DO DIESEL POR UF — LEVANTAMENTO SEMANAL DA ANP
//  O navegador não consegue baixar/abrir a planilha da ANP (CORS +
//  12 MB de XLSX), então este endpoint faz isso server-side e devolve
//  só o que a calculadora precisa: R$/l por estado na semana mais nova.
//
//  Fonte: "Série Histórica do Levantamento de Preços" da ANP,
//  arquivo semanal por estado (uma linha por UF × produto × semana,
//  desde 30/12/2012). Cabeçalho na linha 18; a coluna que interessa
//  é PREÇO MÉDIO REVENDA (índice 7).
//
//  Custo: ~5 s de download + ~5 s de parse. Por isso a resposta é
//  cacheada na borda por 12 h — a ANP publica uma vez por semana.
//
//  Uso:  GET /api/diesel-anp            → diesel S10
//        GET /api/diesel-anp?produto=s500
//  Resp: { produto, semanaInicio, semanaFim, mediaNacional, ufs, postos }
// ─────────────────────────────────────────────────────────

import * as XLSX from "xlsx";

const PLANILHA =
  "https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/precos/" +
  "precos-revenda-e-de-distribuicao-combustiveis/shlp/semanal/semanal-estados-desde-2013.xlsx";

const HEADER_ROWS = 17; // linhas de cabeçalho institucional antes da tabela
const COL = { DT_INI: 0, DT_FIM: 1, ESTADO: 3, PRODUTO: 4, POSTOS: 5, PRECO: 7 };

const PRODUTOS = {
  s10:  "OLEO DIESEL S10",
  s500: "OLEO DIESEL",       // na planilha, "óleo diesel" = B S500 comum
};

const UF_POR_NOME = {
  ACRE: "AC", ALAGOAS: "AL", AMAPA: "AP", AMAZONAS: "AM", BAHIA: "BA",
  CEARA: "CE", "DISTRITO FEDERAL": "DF", "ESPIRITO SANTO": "ES", GOIAS: "GO",
  MARANHAO: "MA", "MATO GROSSO": "MT", "MATO GROSSO DO SUL": "MS",
  "MINAS GERAIS": "MG", PARA: "PA", PARAIBA: "PB", PARANA: "PR",
  PERNAMBUCO: "PE", PIAUI: "PI", "RIO DE JANEIRO": "RJ",
  "RIO GRANDE DO NORTE": "RN", "RIO GRANDE DO SUL": "RS", RONDONIA: "RO",
  RORAIMA: "RR", "SANTA CATARINA": "SC", "SAO PAULO": "SP", SERGIPE: "SE",
  TOCANTINS: "TO",
};

// A planilha vem sem acento, mas não custa normalizar antes de casar o nome.
const chave = (s) =>
  String(s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase().replace(/\s+/g, " ").trim();

// Serial do Excel → ISO (epoch do Excel = 30/12/1899).
const serialISO = (n) =>
  typeof n === "number"
    ? new Date(Math.round((n - 25569) * 86400000)).toISOString().slice(0, 10)
    : null;

async function baixarPlanilha() {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 25000);
  try {
    const r = await fetch(PLANILHA, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; frete-minimo/1.0)" },
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`ANP respondeu HTTP ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  } finally {
    clearTimeout(to);
  }
}

function extrair(buf, produtoAlvo) {
  // Sem estilos/datas/texto formatado: é o que derruba o parse de ~12 s p/ ~5 s.
  const wb = XLSX.read(buf, {
    type: "buffer",
    dense: true,
    cellDates: false,
    cellStyles: false,
    cellNF: false,
    cellText: false,
  });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error("planilha da ANP veio sem abas");

  const linhas = XLSX.utils.sheet_to_json(ws, { header: 1, range: HEADER_ROWS, raw: true });
  const doProduto = linhas.filter(
    (l) => chave(l[COL.PRODUTO]) === produtoAlvo && typeof l[COL.PRECO] === "number"
  );
  if (!doProduto.length) throw new Error(`produto "${produtoAlvo}" não encontrado na planilha`);

  // Linhas são cronológicas, mas não confio na ordem: pego a maior data inicial.
  const ultima = doProduto.reduce((max, l) => Math.max(max, l[COL.DT_INI]), 0);
  const semana = doProduto.filter((l) => l[COL.DT_INI] === ultima);

  const ufs = {}, postos = {};
  for (const l of semana) {
    const uf = UF_POR_NOME[chave(l[COL.ESTADO])];
    if (!uf) continue;
    ufs[uf] = Math.round(l[COL.PRECO] * 1000) / 1000;
    postos[uf] = l[COL.POSTOS] || 0;
  }

  const valores = Object.values(ufs);
  if (!valores.length) throw new Error("nenhuma UF reconhecida na semana mais recente");

  return {
    semanaInicio: serialISO(ultima),
    semanaFim: serialISO(semana[0][COL.DT_FIM]),
    // Média simples entre UFs — a nacional da ANP é ponderada por posto e
    // fica um pouco diferente; esta serve de fallback quando a UF é desconhecida.
    mediaNacional: Math.round((valores.reduce((s, v) => s + v, 0) / valores.length) * 1000) / 1000,
    ufs,
    postos,
  };
}

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  const chaveProduto = String(req.query?.produto || "s10").toLowerCase();
  const produtoAlvo = PRODUTOS[chaveProduto] || PRODUTOS.s10;

  try {
    const dados = extrair(await baixarPlanilha(), produtoAlvo);
    // A ANP publica 1× por semana: cacheia na borda e serve o antigo enquanto revalida.
    res.setHeader("Cache-Control", "public, s-maxage=43200, stale-while-revalidate=604800");
    res.status(200).json({
      fonte: "ANP · Levantamento de Preços (semanal por estado)",
      produto: produtoAlvo,
      atualizadoEm: new Date().toISOString(),
      ...dados,
    });
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({ error: e.message || "falha ao consultar a ANP" });
  }
}
