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

export async function geocode(city, uf) {
  const q = encodeURIComponent(`${city}, ${uf}, Brasil`);
  const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`);
  const j = await r.json();
  if (!j.length) throw new Error('Geocodificação falhou');
  return { lat: parseFloat(j[0].lat), lon: parseFloat(j[0].lon) };
}

export async function calcDistance(orig, dest) {
  const url = `${OSRM_BASE}/${orig.lon},${orig.lat};${dest.lon},${dest.lat}?overview=false&alternatives=true`;
  const r = await fetch(url);
  const j = await r.json();
  if (j.code !== 'Ok' || !j.routes?.length) throw new Error('OSRM falhou');
  return j.routes.map((rt, i) => ({
    index: i,
    km: Math.round(rt.distance / 1000),
    durationMin: Math.round(rt.duration / 60),
  }));
}
