# Changelog

## 2026-09-28 — Aviso de nova resolução: fim do falso positivo

**Solicitado:** "Atualizar base" falhou com "nenhum coeficiente encontrado" para a Res. 6.085/2026; entender se os coeficientes mudaram.

**Implementado:**
- Diagnóstico: a Res. 6.085/2026 trata da **estrutura organizacional da ANTT**, não do piso — coeficientes da 6.084 seguem valendo. O aviso disparou porque o corpo cita "coeficientes dos pisos mínimos" ao listar atribuições de uma gerência.
- `ementaDoHtml` / `ehResolucaoDoPiso` (anttUpdate.js): decide pela ementa; sem ementa legível, mantém a busca no texto (prefere avisar a perder resolução). Tolera acento corrompido.
- `api/antt-check.js` usa `ehResolucaoDoPiso`; resoluções de outro assunto são puladas e a varredura continua.
- Testes: 20 (fixture com trecho real da 6.085).

## 2026-09-28 — Base ANTT: só admin altera + segurança

**Solicitado:** somente admin pode atualizar/voltar a base; reforçar a segurança.

**Implementado:**
- Supabase: escrita direta em `frete_antt_base` revogada (anon/authenticated só leem). Alterações só pelas RPCs `antt_base_aplicar` / `antt_base_voltar` (SECURITY DEFINER), que exigem `is_calc_admin()` = admin ativo do módulo `calculadora` em `hub_user_modulos` (usuário do token do Hub).
- Backup + base ativa gravados numa única transação; backup = base geral anterior.
- Auditoria append-only `frete_antt_base_log` (ação, resolução, anterior, usuário, data); só admin lê.
- App: botões "Atualizar base"/"Voltar" só para admin; não-admin vê "Peça a um admin…". Leitura da base continua pública (chave anon).
- Testes: 17 (inclui não-admin recusado sem alterar a base e 2ª atualização com backup correto). SQL validado simulando admin, viewer e escrita direta.

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
