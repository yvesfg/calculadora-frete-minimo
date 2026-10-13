// ─────────────────────────────────────────────────────────
//  Só quem está logado no Hub usa as rotas /api.
//  As rotas de IA repassam ao gateway com o NOSSO token (AI_HUB_TOKEN); sem
//  esta checagem, qualquer um na internet chamava /api/ai-extract e gastava a
//  conta.
//
//  Rápido de propósito: o Supabase assina o login com chave pública (ES256,
//  /auth/v1/.well-known/jwks.json). A assinatura é conferida aqui mesmo, sem
//  ida ao Supabase — a chave pública vem uma vez por instância e fica em memória.
//  Se a conferência local não fechar (token antigo HS256, chave girada…), cai na
//  consulta a /auth/v1/user, e o "sim" fica em cache até o token vencer.
//  Mesmo arquivo no controle-operacional (api/_auth.js) — mudou aqui, muda lá.
//  Arquivo com "_" na frente: a Vercel não publica como rota.
// ─────────────────────────────────────────────────────────

const SUPA_URL = (process.env.VITE_SUPABASE_URL || "https://qdrhkkjawklqfsoyxhpd.supabase.co").replace(/\/$/, "");
// Chave anon (pública — já vai no bundle do app). Só identifica o projeto.
const SUPA_ANON = process.env.VITE_SUPABASE_KEY
  || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkcmhra2phd2tscWZzb3l4aHBkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1OTY2ODQsImV4cCI6MjA4OTE3MjY4NH0.zHl9-Ei9IDBcxzoZDz650E4JsBeV0HsQqTDgDZ4K1B8";

const b64url = (s) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
const lerParte = (s) => { try { return JSON.parse(b64url(s).toString("utf8")); } catch { return null; } };

let _jwks = null; // Promise<Map<kid, CryptoKey>>
async function chavePublica(kid, fetchFn) {
  const carregar = async () => {
    const r = await fetchFn(`${SUPA_URL}/auth/v1/.well-known/jwks.json`);
    const { keys = [] } = r.ok ? await r.json() : {};
    const mapa = new Map();
    for (const k of keys) {
      if (k.kty !== "EC" || k.crv !== "P-256") continue;
      mapa.set(k.kid, await crypto.subtle.importKey("jwk", k, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]));
    }
    return mapa;
  };
  if (!_jwks) _jwks = carregar().catch((e) => { _jwks = null; throw e; });
  let mapa = await _jwks;
  if (!mapa.has(kid)) { _jwks = carregar().catch((e) => { _jwks = null; throw e; }); mapa = await _jwks; } // chave girada
  return mapa.get(kid) || null;
}

// true só quando a assinatura ES256 confere e o token é deste projeto, de usuário e não venceu.
async function conferirLocal(token, fetchFn) {
  const partes = token.split(".");
  if (partes.length !== 3) return false;
  const [h, p, s] = partes;
  const cab = lerParte(h), dados = lerParte(p);
  if (cab?.alg !== "ES256" || !cab.kid || !dados) return false;
  if (!(dados.exp * 1000 > Date.now()) || dados.iss !== `${SUPA_URL}/auth/v1` || !dados.sub || dados.role !== "authenticated") return false;
  const chave = await chavePublica(cab.kid, fetchFn);
  if (!chave) return false;
  return crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, chave, b64url(s), new TextEncoder().encode(`${h}.${p}`));
}

const _validos = new Map(); // token → exp (ms), só para o caminho pela rede
function lembrar(token) {
  const exp = lerParte(token.split(".")[1] || "")?.exp;
  if (typeof exp !== "number") return;
  if (_validos.size > 500) _validos.clear();
  _validos.set(token, exp * 1000);
}

export async function usuarioLogado(req, fetchFn = fetch) {
  const auth = String(req.headers?.authorization || "");
  const m = auth.match(/^Bearer\s+(\S+)/);
  if (!m) return false;
  const token = m[1];
  if ((_validos.get(token) || 0) > Date.now()) return true;
  try { if (await conferirLocal(token, fetchFn)) return true; } catch { /* cai na consulta */ }
  try {
    const r = await fetchFn(`${SUPA_URL}/auth/v1/user`, { headers: { apikey: SUPA_ANON, Authorization: auth } });
    if (!r.ok) return false;
    const u = await r.json().catch(() => null);
    if (!u?.id) return false;
    lembrar(token);
    return true;
  } catch { return false; }
}

// Responde 401 e devolve false quando não há login — uso: if (!(await exigirLogin(req, res))) return;
export async function exigirLogin(req, res, fetchFn = fetch) {
  if (await usuarioLogado(req, fetchFn)) return true;
  res.status(401).json({ error: "Sessão expirada — entre de novo pelo Hub." });
  return false;
}
