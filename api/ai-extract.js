// ─────────────────────────────────────────────────────────
//  PROXY DE IA — encaminha para o gateway central yf-ai-gateway.
//  O cliente (SPA) chama /api/ai-extract sem nunca ver o token;
//  o x-ai-token vive só aqui, na env do projeto na Vercel.
//
//  Envs (Vercel → Settings → Environment Variables):
//    AI_GATEWAY_URL    (opcional) default https://yf-ai-gateway.vercel.app/api/extract
//    AI_GATEWAY_TOKEN  deve bater com o AI_GATEWAY_TOKEN do gateway
// ─────────────────────────────────────────────────────────

export const config = { api: { bodyParser: { sizeLimit: "8mb" } } };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método não permitido" });
    return;
  }
  const url = process.env.AI_GATEWAY_URL || "https://yf-ai-gateway.vercel.app/api/extract";
  const token = process.env.AI_GATEWAY_TOKEN || "";
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { "x-ai-token": token } : {}) },
      body: JSON.stringify(req.body || {}),
    });
    const text = await r.text();
    res.status(r.status).setHeader("Content-Type", "application/json");
    res.send(text);
  } catch (e) {
    res.status(502).json({ error: e.message || "Falha ao falar com o gateway de IA" });
  }
}
