/* Store da base ANTT no Supabase (tabela frete_antt_base) — compartilhado
   por todos os usuários. Separado de anttUpdate.js porque supabase.js usa
   import.meta.env e não roda na função serverless. */
// Import dinâmico: mantém o supabase-js fora do bundle inicial.
const supaFetch = async (...a) => (await import('../lib/supabase.js')).supaFetch(...a);

export const storeSupabase = {
  async ler(id) {
    const r = await supaFetch('GET', `frete_antt_base?id=eq.${id}&select=rows,source`);
    return r?.[0] || null;
  },
  async gravar(id, { rows, source }) {
    // POST com resolution=merge-duplicates (supaFetch) = upsert pela PK.
    await supaFetch('POST', 'frete_antt_base', { id, rows, source, updated_at: new Date().toISOString() });
  },
};
