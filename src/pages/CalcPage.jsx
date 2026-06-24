import React, { useState, useEffect, useCallback } from 'react';
import {
  RAW, IDX, CARGO_LBL, CARGO_SECS, TBL_AXLES, TAX_PROFILES,
  resolveTable, findRow, calcPiso, fmtBRL, fmtNum,
} from '../utils/anttData.js';
import { geocode, calcDistance } from '../utils/geo.js';
import CityAutocomplete from '../components/CityAutocomplete.jsx';
import Icon from '../components/Icon.jsx';

const DEFAULT_INSS = 4.0;
const DEFAULT_TAX  = 'lr_pf';
const DEFAULT_MARGIN = 8;

export default function CalcPage() {
  const [orig, setOrig]   = useState({ uf:'', city:'' });
  const [dest, setDest]   = useState({ uf:'', city:'' });
  const [routes, setRoutes] = useState([]);
  const [routeIdx, setRouteIdx] = useState(0);
  const [distKm, setDistKm]   = useState('');
  const [manualDist, setManualDist] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoErr, setGeoErr]         = useState('');

  const [hp, setHp]       = useState(false);
  const [fc, setFc]       = useState(false);
  const [axles, setAxles] = useState(5);
  const [cargo, setCargo] = useState('carga_geral');

  const [margin, setMargin]     = useState(DEFAULT_MARGIN);
  const [taxProfile, setTax]    = useState(DEFAULT_TAX);
  const [inss, setInss]         = useState(DEFAULT_INSS);
  const [showEmb, setShowEmb]   = useState(false);
  const [embPrice, setEmbPrice] = useState('');

  const tbl  = resolveTable(hp, fc);
  const km   = parseFloat(String(distKm).replace(',', '.')) || 0;
  const row  = findRow(tbl, cargo, axles);
  const piso = calcPiso(row, km);

  const tp   = TAX_PROFILES[taxProfile];
  const totalTax = (tp?.pis || 0) + (tp?.cofins || 0) + inss / 100;

  // Scenario 1: markup over piso
  const price1 = piso ? piso * (1 + margin / 100) : null;
  // Scenario 2: real margin (gross)
  const price2 = piso ? piso / (1 - totalTax - margin / 100) : null;

  const net1 = price1 && piso ? price1 - piso : null;
  const net2 = price2 && piso ? price2 * (1 - totalTax) - piso : null;

  const emb = parseFloat(String(embPrice).replace(',','.')) || 0;
  const embVsP1 = price1 && emb ? emb - price1 : null;
  const embVsP2 = price2 && emb ? emb - price2 : null;

  const lookupRoutes = useCallback(async () => {
    if (!orig.uf || !orig.city || !dest.uf || !dest.city) return;
    setGeoLoading(true); setGeoErr('');
    try {
      const [o, d] = await Promise.all([geocode(orig.city, orig.uf), geocode(dest.city, dest.uf)]);
      const alts = await calcDistance(o, d);
      setRoutes(alts);
      setRouteIdx(0);
      setDistKm(String(alts[0].km));
    } catch (e) {
      setGeoErr(e.message);
    } finally {
      setGeoLoading(false);
    }
  }, [orig, dest]);

  useEffect(() => { lookupRoutes(); }, [lookupRoutes]);

  const axleOptions = TBL_AXLES[tbl] || [];

  return (
    <div className="page-content">
      <div className="calc-grid">
        {/* LEFT COLUMN — inputs */}
        <div>
          {/* Route card */}
          <div className="card">
            <div className="card-head">
              <div className="card-head-icon"><Icon name="rota" stroke="var(--accent)" size={17} /></div>
              <div>
                <div className="card-head-title">Rota</div>
                <div className="card-head-sub">Origem → Destino</div>
              </div>
            </div>
            <div className="card-body">
              <div style={{ position:'relative', paddingLeft:18, marginBottom:10 }}>
                <div className="route-line" />
                <div style={{ display:'flex', alignItems:'flex-start', gap:8, marginBottom:10 }}>
                  <div className="route-dot origin" />
                  <div style={{ flex:1 }}>
                    <CityAutocomplete label="Origem" value={orig} onChange={setOrig} />
                  </div>
                </div>
                <div style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
                  <div className="route-dot dest" />
                  <div style={{ flex:1 }}>
                    <CityAutocomplete label="Destino" value={dest} onChange={setDest} />
                  </div>
                </div>
              </div>

              {geoErr && <div className="err-banner">⚠ {geoErr}</div>}

              {geoLoading && (
                <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:11, color:'var(--text3)', marginTop:8 }}>
                  <span className="spinner" style={{ display:'inline-block', width:12, height:12, border:'2px solid var(--border2)', borderTopColor:'var(--accent)', borderRadius:'50%' }} />
                  Calculando rota…
                </div>
              )}

              {routes.length > 1 && (
                <div className="route-alts">
                  <div className="route-alts-title">🔀 Rotas alternativas</div>
                  {routes.map((rt, i) => (
                    <button
                      key={i}
                      className={`alt-route${routeIdx === i ? ' active' : ''}`}
                      onClick={() => { setRouteIdx(i); setDistKm(String(rt.km)); }}
                    >
                      <span className="alt-route-num">Rota {i + 1}</span>
                      <span className="alt-route-meta">{Math.floor(rt.durationMin / 60)}h{rt.durationMin % 60}min</span>
                      <span className="alt-route-val">{rt.km.toLocaleString('pt-BR')} km</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="dist-badge">
                <span style={{ fontSize:12 }}>📏</span>
                <span>Distância:</span>
                <input
                  value={distKm}
                  onChange={e => { setDistKm(e.target.value); setManualDist(true); }}
                  style={{ width:80, textAlign:'center', fontWeight:700, color:'var(--accent)' }}
                  placeholder="0"
                />
                <span style={{ color:'var(--text3)' }}>km</span>
                {manualDist && <span style={{ fontSize:9, color:'var(--text3)', marginLeft:'auto' }}>manual</span>}
              </div>
            </div>
          </div>

          {/* Vehicle card */}
          <div className="card">
            <div className="card-head">
              <div className="card-head-icon"><Icon name="veiculo" stroke="var(--accent)" size={17} /></div>
              <div>
                <div className="card-head-title">Composição Veicular</div>
                <div className="card-head-sub">Tipo de operação + eixos</div>
              </div>
            </div>
            <div className="card-body card-body--compact">
              <div className="veh-row">
                <div className="toggles-row toggles-row--mini">
                  <ToggleCard label="Alto Desempenho" sublabel="HP" value={hp} onChange={setHp} />
                  <ToggleCard label="Frete Cont." sublabel="FC" value={fc} onChange={setFc} />
                </div>
                <div className="veh-field">
                  <label className="field-label">Eixos</label>
                  <select
                    className="veh-select"
                    value={axleOptions.includes(axles) ? axles : ''}
                    onChange={e => setAxles(parseInt(e.target.value))}
                  >
                    {axleOptions.map(n => (
                      <option key={n} value={n}>{n} eixos</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="veh-tabela-row">
                <span className="field-label" style={{ marginBottom:0 }}>Tabela aplicada</span>
                <span className="veh-tabela-pill">Tabela {tbl}</span>
              </div>
            </div>
          </div>

          {/* Cargo card */}
          <div className="card">
            <div className="card-head">
              <div className="card-head-icon"><Icon name="carga" stroke="var(--accent)" size={17} /></div>
              <div>
                <div className="card-head-title">Tipo de Carga</div>
                <div className="card-head-sub">Categoria conforme ANTT</div>
              </div>
            </div>
            <div className="card-body card-body--compact">
              <select
                className="veh-select"
                value={cargo}
                onChange={e => setCargo(e.target.value)}
              >
                {CARGO_SECS.map(sec => (
                  <optgroup key={sec.label} label={sec.label}>
                    {sec.types.map(t => (
                      <option key={t} value={t}>{CARGO_LBL[t]}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN — results */}
        <div>
          {/* Main result */}
          <div className="result-card" style={{ marginBottom:12 }}>
            {!piso ? (
              <div className="result-empty">
                <span style={{ fontSize:32 }}>⚡</span>
                <div>
                  <strong style={{ color:'var(--text2)', display:'block' }}>Configure a rota e veículo</strong>
                  O piso ANTT aparecerá aqui
                </div>
              </div>
            ) : (
              <>
                <div className="result-hero">
                  <div>
                    <div className="result-label">Piso Tarifário ANTT</div>
                    <div className="result-value">{fmtBRL(piso)}</div>
                    <div className="result-value-sub">
                      {km > 0 ? `${fmtNum(piso / km, 4)}/km × ${km.toLocaleString('pt-BR')} km` : '—'}
                    </div>
                  </div>
                  <div className="result-table-pill">TAB {tbl}</div>
                </div>

                <div className="result-rows">
                  <div className="result-row">
                    <span className="result-row-label">📊 CCD</span>
                    <span className="result-row-val">R$ {fmtNum(row?.[IDX.CCD], 4)}/km</span>
                  </div>
                  <div className="result-row">
                    <span className="result-row-label">🔒 CC (custo fixo)</span>
                    <span className="result-row-val">{fmtBRL(row?.[IDX.CC])}</span>
                  </div>
                  <div className="result-row">
                    <span className="result-row-label">📦 {CARGO_LBL[cargo]}</span>
                    <span className="result-row-val">{axles} eixos</span>
                  </div>
                </div>

                <div className="result-note">
                  Piso = CCD × distância + CC &nbsp;·&nbsp; Res. ANTT 6.442/2021
                </div>

                {/* Margin calc */}
                <div className="margin-calc">
                  <div className="margin-calc-head">
                    <div className="margin-calc-icon">💰</div>
                    <span className="margin-calc-title">Simulação de Margem</span>
                    <div className="margin-inp-group">
                      <span className="margin-inp-label">Margem</span>
                      <input
                        className="margin-target-inp"
                        type="number" min={0} max={100}
                        value={margin}
                        onChange={e => setMargin(parseFloat(e.target.value) || 0)}
                      />
                      <span className="margin-inp-label">%</span>
                    </div>
                  </div>

                  <div className="margin-tax-config">
                    <div className="tax-inp-group">
                      <span>INSS:</span>
                      <input className="margin-inp-small" type="number" min={0} max={100} step={0.1} value={inss} onChange={e => setInss(parseFloat(e.target.value)||0)} />
                      <span>%</span>
                    </div>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:4, flex:1, justifyContent:'flex-end' }}>
                      {Object.entries(TAX_PROFILES).map(([k, v]) => (
                        <button key={k} className={`tax-pill${taxProfile===k?' active':''}`} onClick={() => setTax(k)}>
                          {v.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ padding:'10px 14px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                    <ScenarioCard
                      title="Markup s/ Piso"
                      subtitle={`Piso × (1 + ${margin}%)`}
                      price={price1}
                      net={net1}
                      piso={piso}
                      totalTax={totalTax}
                      inss={inss}
                      tp={tp}
                    />
                    <ScenarioCard
                      title="Margem Real"
                      subtitle={`Piso ÷ (1 − imp − ${margin}%)`}
                      price={price2}
                      net={net2}
                      piso={piso}
                      totalTax={totalTax}
                      inss={inss}
                      tp={tp}
                    />
                  </div>
                </div>

                {/* Embarcadora */}
                <div style={{ padding:'0 14px 14px' }}>
                  <div className="embarcadora-panel">
                    <div className="embarcadora-toggle" onClick={() => setShowEmb(v => !v)}>
                      <div className="embarcadora-toggle-icon">💼</div>
                      <div style={{ flex:1 }}>
                        <div className="embarcadora-toggle-label">Preço da Embarcadora</div>
                        <div className="embarcadora-toggle-hint">Compare o preço cotado com os pisos</div>
                      </div>
                      <span style={{ color:'var(--text3)', fontSize:12 }}>{showEmb ? '▲' : '▼'}</span>
                    </div>
                    {showEmb && (
                      <div className="embarcadora-body">
                        <div className="embarcadora-inp-row">
                          <span className="embarcadora-prefix">R$</span>
                          <input
                            className="embarcadora-inp"
                            type="number" min={0} step={0.01}
                            value={embPrice}
                            onChange={e => setEmbPrice(e.target.value)}
                            placeholder="0,00"
                          />
                        </div>
                        {emb > 0 && emb < piso && (
                          <div className="emb-warn-bar">
                            ⚠ Abaixo do piso ANTT ({fmtBRL(piso)}) — vedado por lei
                          </div>
                        )}
                        {emb > 0 && (
                          <>
                            <div className="emb-row">
                              <span className="emb-row-lbl">vs. Piso ANTT</span>
                              <span className="emb-row-val" style={{ color: emb >= piso ? 'var(--green)' : 'var(--red)' }}>
                                {fmtBRL(emb - piso)} ({fmtNum((emb - piso) / piso * 100)}%)
                              </span>
                            </div>
                            {price1 && (
                              <div className="emb-row">
                                <span className="emb-row-lbl">vs. Markup</span>
                                <span className="emb-row-val" style={{ color: embVsP1 >= 0 ? 'var(--green)' : 'var(--red)' }}>
                                  {fmtBRL(embVsP1)}
                                </span>
                              </div>
                            )}
                            {price2 && (
                              <div className="emb-row">
                                <span className="emb-row-lbl">vs. Margem Real</span>
                                <span className="emb-row-val" style={{ color: embVsP2 >= 0 ? 'var(--green)' : 'var(--red)' }}>
                                  {fmtBRL(embVsP2)}
                                </span>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="footer-note">
        Dados conforme <strong>Resolução ANTT nº 6.442/2021</strong>. Distâncias via OSRM + OpenStreetMap.
        Cidades via IBGE. Esta calculadora é uma ferramenta de apoio — confirme valores oficiais em &nbsp;
        <a href="https://www.antt.gov.br" target="_blank" rel="noreferrer">antt.gov.br</a>.
      </div>
    </div>
  );
}

function ToggleCard({ label, sublabel, value, onChange }) {
  return (
    <div className={`toggle-card${value ? ' on' : ''}`} onClick={() => onChange(!value)}>
      <span className="toggle-card-label">{label}</span>
      <div className="toggle-card-row">
        <div className="pill-switch" />
        <span className="toggle-card-val">{sublabel}: {value ? 'SIM' : 'NÃO'}</span>
      </div>
    </div>
  );
}

function ScenarioCard({ title, subtitle, price, net, piso, totalTax, inss, tp }) {
  return (
    <div className="margin-scenario">
      <div className="margin-scenario-head">
        <span className="margin-scenario-tag">{title}<br /><span style={{ color:'var(--text3)', fontSize:9 }}>{subtitle}</span></span>
        <span className="margin-scenario-price">{fmtBRL(price)}</span>
      </div>
      <div className="margin-detail-row">
        <span className="margin-detail-label">PIS</span>
        <span className="margin-detail-val">{fmtNum((tp?.pis || 0) * 100, 4)}%</span>
      </div>
      <div className="margin-detail-row">
        <span className="margin-detail-label">COFINS</span>
        <span className="margin-detail-val">{fmtNum((tp?.cofins || 0) * 100, 4)}%</span>
      </div>
      <div className="margin-detail-row">
        <span className="margin-detail-label">INSS</span>
        <span className="margin-detail-val">{fmtNum(inss, 1)}%</span>
      </div>
      <div className="margin-detail-row" style={{ borderBottom:'none' }}>
        <span className="margin-detail-label">Total enc.</span>
        <span className="margin-detail-val">{fmtNum(totalTax * 100, 2)}%</span>
      </div>
      <div className="margin-net-row">
        <span className="margin-net-label">Líquido</span>
        <span className="margin-net-val" style={{ color: net >= 0 ? 'var(--green)' : 'var(--red)' }}>
          {fmtBRL(net)}
          {piso && net != null ? (
            <span className="margin-net-pct" style={{ color:'var(--text3)' }}>
              ({fmtNum(net / piso * 100)}%)
            </span>
          ) : null}
        </span>
      </div>
    </div>
  );
}
