import { createClient } from '@supabase/supabase-js';

const SUPA_URL = import.meta.env.VITE_SUPA_URL || 'https://qdrhkkjawklqfsoyxhpd.supabase.co';
const SUPA_KEY = import.meta.env.VITE_SUPA_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkcmhra2phd2tscWZzb3l4aHBkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1OTY2ODQsImV4cCI6MjA4OTE3MjY4NH0.zHl9-Ei9IDBcxzoZDz650E4JsBeV0HsQqTDgDZ4K1B8';

export const supa = createClient(SUPA_URL, SUPA_KEY);

export async function supaFetch(method, path, body) {
  const url = SUPA_URL + '/rest/v1/' + path;
  const prefer = method === 'POST'
    ? 'return=representation,resolution=merge-duplicates'
    : method === 'DELETE' ? 'return=minimal' : 'return=representation';
  const res = await fetch(url, {
    method,
    headers: {
      apikey: SUPA_KEY,
      Authorization: 'Bearer ' + SUPA_KEY,
      'Content-Type': 'application/json',
      Prefer: prefer,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) { const t = await res.text(); throw new Error(t); }
  return res.status === 204 ? null : res.json();
}
