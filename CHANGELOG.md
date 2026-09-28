# Changelog

## 2026-09-28 — Base ANTT geral (Supabase)

**Solicitado:** a atualização da base valer para todos, não só para o navegador de quem clicou.

**Implementado:**
- Tabela Supabase `frete_antt_base` (`ativa` / `backup`); anon lê/grava, DELETE bloqueado (padrão `co_config`).
- `src/utils/anttStore.js` — store Supabase (reusa `supaFetch`, import dinâmico).
- `anttUpdate.js` — aplicar/voltar/backup gravam no store compartilhado; `sincronizarBase` lê a base geral (inválida → embutida). localStorage virou só cache.
- `main.jsx` — sincroniza a base geral antes do 1º render (espera até 3 s).
- Testes: 15 (inclui "outro usuário recebe a nova base" e falha de gravação).

## 2026-09-28 — Atualizar base ANTT pela nova resolução

**Solicitado:** botão "Atualizar base" na aba Tabelas ANTT quando o aviso detecta nova resolução; backup da base atual; download dos coeficientes no portal oficial (via servidor por CORS); validação completa (tabelas A–D × eixos × cargas) abortando sem mexer na base; gravar a resolução ativa e sumir o aviso; botão para voltar à anterior; testes.

**Implementado:**
- `api/antt-coeficientes.js` — baixa a resolução no anttlegis (mesma URL do aviso), extrai CCD/CC e só responde 200 com todas as combinações válidas (422 com a lista de faltas caso contrário).
- `src/utils/anttUpdate.js` — parser do HTML, `validarCoeficientes` (presença, número > 0, faixa 0,5×–2× da base), `aplicarResolucao` (backup em `antt_base_backup` → base ativa em `antt_base_ativa`), `voltarResolucaoAnterior`, reaplicação no carregamento. Mesmo padrão de camada ao vivo + localStorage do diesel.
- `TablePage.jsx` — botões "Atualizar base" e "↩ Voltar para …" (reaproveitam as classes do botão ANP); erro na tela com os itens faltantes.
- Testes em `src/utils/anttUpdate.test.js` (`npm test`, vitest).
- Observação: a validação usa as combinações da base atual (ex.: Tabela A tem eixos 2–7 e 9; não há 8 eixos na ANTT).
