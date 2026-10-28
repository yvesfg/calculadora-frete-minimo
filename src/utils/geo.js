const IBGE_BASE = 'https://servicodados.ibge.gov.br/api/v1';
const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';

export async function fetchStates() {
  const r = await fetch(`${IBGE_BASE}/localidades/estados?orderBy=nome`);
  return r.json();
}

export async function fetchCities(uf) {
  const r = await fetch(`${IBGE_BASE}/localidades/estados/${uf}/municipios?orderBy=nome`);
  return r.json();
}

// Cidade não muda de lugar: guarda na memória da aba para não repetir a consulta
// a cada entrega mexida (o Nominatim limita a 1 pedido por segundo).
const geoCache = new Map();

export async function geocode(city, uf) {
  const chave = `${uf}|${city}`;
  if (geoCache.has(chave)) return geoCache.get(chave);
  const ponto = await geocodeRede(city, uf);
  geoCache.set(chave, ponto);
  return ponto;
}

async function geocodeRede(city, uf) {
  const q = encodeURIComponent(`${city}, ${uf}, Brasil`);
  const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`);
  const j = await r.json();
  if (!j.length) throw new Error('Geocodificação falhou');
  return { lat: parseFloat(j[0].lat), lon: parseFloat(j[0].lon) };
}

// pontos: [{ lat, lon }] na ordem — origem, entregas, destino. Cada rota vem com
// um "leg" por trecho. O OSRM só devolve rotas alternativas com 2 pontos; com
// entregas no meio vem uma rota só.
export async function calcDistance(pontos) {
  const coords = pontos.map(p => `${p.lon},${p.lat}`).join(';');
  const url = `${OSRM_BASE}/${coords}?overview=false&alternatives=${pontos.length === 2}`;
  const r = await fetch(url);
  const j = await r.json();
  if (j.code !== 'Ok' || !j.routes?.length) throw new Error('OSRM falhou');
  return j.routes.map((rt, i) => ({
    index: i,
    km: Math.round(rt.distance / 1000),
    durationMin: Math.round(rt.duration / 60),
    legs: rt.legs.map(l => ({ km: Math.round(l.distance / 1000), durationMin: Math.round(l.duration / 60) })),
  }));
}
