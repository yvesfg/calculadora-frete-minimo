# Changelog

## 2026-09-28 — Filtro por base/permissão nas demais funções de frete (Supabase)

**Solicitado:** aplicar o mesmo filtro nas outras funções que alteram fretes.

**Implementado (só banco):**
- Backup das 7 definições em `_backup_funcoes_20260928`.
- Guard `_frete_guard(token, id)`: sessão (marca autor p/ auditoria) + admin ou `perms.editar` + base do registro permitida.
- Aplicado no início de `excluir_frete`, `patch_frete`, `marcar_transbordo_frete`, `limpar_transbordo_frete`, `vincular_contrato_frete`, `definir_competencia_frete` e `vincular_cte` (este também confere o CTe de referência). Corpos das funções intactos. `editar_frete` já era só admin.
- Testado em transação desfeita: todas negam outra base e sem `perms.editar`; própria base e admin funcionam; alterações aparecem na `auditoria` com o autor.

## 2026-09-28 — Permissões liberadas + auditoria (Supabase)

**Solicitado:** liberar importar/editar para todos os operadores; auditoria de quem alterou o quê e quando, visível só para o admin.

**Implementado (só banco):**
- Tabela `auditoria` (em, tabela, operação, registro, usuário, papel, antes/depois — no UPDATE só os campos alterados). RLS sem políticas e sem grants: nada pela API; leitura só pelo painel do Supabase.
- Trigger `_auditar` em `frete_conferencia` e `co_usuarios` (ignora senha, token/sessão e `atualizado_em`; troca só de sessão não gera registro). Pega toda alteração, venha de qualquer função ou do painel.
- `_validar_token_e_base` marca o usuário da sessão na transação (`app.co_usuario_id/nome`) → todas as RPCs com token identificam o autor. Backup da versão anterior em `_backup_funcoes_20260928`.
- `perms.importar/editar = true` para os 5 operadores que não tinham (auditado).
- Testado: alteração via RPC gravou usuário, papel `anon` e só o campo alterado; anon não lê a auditoria.

## 2026-09-28 — Funções `*_frete_*` (Controle Operacional): filtro por base e permissão

**Solicitado:** aplicar filtro por base e exigir permissão para escrever (opção a: admin ou `perms.importar`/`perms.editar`).

**Implementado (só banco):**
- Backup das definições anteriores em `_backup_funcoes_20260928` (fechada para a API; para restaurar, executar a coluna `def`).
- Helper `_frete_sessao(token)`: reaproveita `_validar_token_e_base` (sessão/expiração) e devolve admin, bases, pode_importar, pode_editar.
- `listar_frete_periodos/pendentes/sinalizados`: só registros das bases do usuário (admin vê tudo).
- `inserir_frete_lote`: exige admin ou `perms.importar`; recusa o lote se alguma linha for de base não permitida.
- `atualizar_frete_lote`: exige admin ou `perms.editar`; recusa o lote se algum registro for de base não permitida.
- Testado em transação desfeita: operador de 1 base vê 3.361/0 (outra base), admin 4.506/4.506; sem perms → insert/update negados; com perms → própria base ok, outra base negada; token falso negado.
- Impacto: 5 operadores sem `perms.importar/editar` perderam a escrita até terem as permissões marcadas.

## 2026-09-28 — Lockdown de `frete_usuarios` (Supabase)

**Solicitado:** fechar `frete_usuarios`, que deixava qualquer um com a chave anon ler e-mails, incluir e apagar usuários.

**Implementado (só banco; app sem mudança):**
- Backup: `frete_usuarios_backup_20260928` (2 linhas), sem acesso pela API.
- Removidas as políticas abertas (select/insert/delete para todos); anon sem nenhum acesso. Leitura/escrita só para admin da calculadora (`is_calc_admin()`).
- Verificado antes: nenhum acesso a `frete_usuarios` pela API nas últimas 24 h; no código só a `AdminPage` (não usada pelo app — legado do login Google, junto com `TopBar`/`LoginOverlay`).
- `is_calc_admin()` deixou de ser executável por anon.
- Testado no banco: anon negado (ler/incluir), viewer vê 0 e não inclui, admin vê 2.

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
