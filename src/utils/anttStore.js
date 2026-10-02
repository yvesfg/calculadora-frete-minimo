/* Store da base ANTT no Supabase (tabela frete_antt_base) — compartilhado
   por todos os usuários. Leitura livre; aplicar/voltar são RPCs que o banco
   só executa para admin do módulo "calculadora" (hub_user_modulos), com o
   usuário identificado pelo token do Hub. Separado de anttUpdate.js porque
   supabase.js usa import.meta.env e não roda na função serverless. */

const HUB_TOKEN = 'hub_token'; // mesma chave do HubGuard.jsx
const cfg = async () => import('../lib/supabase.js'); // fora do bundle inicial

// comUsuario=false (leitura pública) usa a chave anon: um token do Hub ruim não derruba a base geral.
async function rest(method, path, body, comUsuario = true) {
  const { SUPA_URL, SUPA_KEY } = await cfg();
  let token = SUPA_KEY;
  if (comUsuario) try { token = sessionStorage.getItem(HUB_TOKEN) || SUPA_KEY; } catch { /* sem sessão */ }
  const r = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    method,
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) {
    if (r.status === 401 || r.status === 403 || j?.code === '42501') {
      throw new Error(j?.code === '42501' ? 'apenas admin da calculadora pode alterar a base' : 'sessão do Hub expirada — entre de novo pelo Hub');
    }
    throw new Error(j?.message || `Supabase HTTP ${r.status}`);
  }
  return j;
}

export const storeSupabase = {
  async ler(id) {
    const r = await rest('GET', `frete_antt_base?id=eq.${id}&select=rows,source`, null, false);
    return r?.[0] || null;
  },
  async aplicar(ativa, backupInicial) {
    await rest('POST', 'rpc/antt_base_aplicar', {
      p_rows: ativa.rows, p_source: ativa.source,
      p_backup_rows: backupInicial.rows, p_backup_source: backupInicial.source,
    });
  },
  async voltar() {
    return rest('POST', 'rpc/antt_base_voltar', {});
  },
};

/* Preço do diesel da ANP (tabela frete_diesel_anp) — mesma regra: todos leem,
   só admin da calculadora grava (RPC diesel_anp_aplicar). */
export const dieselStore = {
  async ler() {
    const r = await rest('GET', 'frete_diesel_anp?id=eq.ativa&select=payload', null, false);
    return r?.[0]?.payload || null;
  },
  async salvar(payload) {
    await rest('POST', 'rpc/diesel_anp_aplicar', { p_payload: payload });
  },
};

/** Usuário atual é admin da calculadora? (só para exibir os botões; o banco é quem garante). */
export async function souAdminCalc() {
  try { return (await rest('POST', 'rpc/is_calc_admin', {})) === true; } catch { return false; }
}
