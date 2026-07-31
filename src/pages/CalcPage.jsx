import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  RAW, IDX, CARGO_LBL, CARGO_SECS, TBL_AXLES, TAX_PROFILES, ANTT_SOURCE,
  resolveTable, findRow, calcPiso, fmtBRL, fmtNum,
} from '../utils/anttData.js';
import {
  ANTT_DIESEL_BASE, CONSUMO_VAZIO_FATOR,
  dieselUF, dieselMeta, buscarPrecosANP, consumoPreset,
  calcCombustivel, calcPisoCorrigido,
} from '../utils/dieselData.js';
import { geocode, calcDistance } from '../utils/geo.js';
import CityAutocomplete from '../components/CityAutocomplete.jsx';
import Icon from '../components/Icon.jsx';
import Dropdown from '../components/Dropdown.jsx';

const DEFAULT_INSS = 4.0;
const DEFAULT_TAX  = 'lr_pf';
const DEFAULT_MARGIN = 8;

const num = v => parseFloat(String(v).replace(',', '.')) || 0;

// 2026-07-25 → 25/07
const diaMes = iso => {
  const [, m, d] = String(iso || '').split('-');
  return d && m ? `${d}/${m}` : '—';
};

const LS = {
  kml:   'calc_fuel_kml',
  modo:  'calc_fuel_modo',
  preco: 'calc_fuel_preco',
};

export default function CalcPage() {
  const [orig, setOrig]   = useState({ uf:'', city:'' });
  const [dest, setDest]   = useState({ uf:'', city:'' });
  const [routes, setRoutes] = useState([]);
  const [routeIdx, setRouteIdx] = useState(0);
  const [distKm, setDistKm]   = useState('');
  const [manualDist, setManualDist] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoErr, setGeoErr]         = useState('');
  const destRef = useRef(null);

  const [hp, setHp]       = useState(false);
  const [fc, setFc]       = useState(true); // padrão: composição veicular → Tabela A
  const [axles, setAxles] = useState(5);
  const [cargo, setCargo] = useState('carga_geral');
  const [pesoTon, setPesoTon] = useState('');

  const [margin, setMargin]     = useState(DEFAULT_MARGIN);
  const [taxProfile, setTax]    = useState(DEFAULT_TAX);
  const [inss, setInss]         = useState(DEFAULT_INSS);
  const [retornoVazio, setRetornoVazio] = useState(false);
  const [showEmb, setShowEmb]   = useState(false);
  const [embPrice, setEmbPrice] = useState('');

  // Combustível — consumo em km/l e preço do diesel (média regional ou manual)
  const [kmL, setKmL]           = useState(() => localStorage.getItem(LS.kml) || '');
  const [kmLAuto, setKmLAuto]   = useState(() => !localStorage.getItem(LS.kml));
  const [kmLVazio, setKmLVazio] = useState('');
  const [precoModo, setPrecoModo]     = useState(() => localStorage.getItem(LS.modo) || 'regiao');
  const [precoManual, setPrecoManual] = useState(() => localStorage.getItem(LS.preco) || '');
  const [dieselInfo, setDieselInfo]   = useState(() => dieselMeta());
  const [anp, setAnp] = useState(null); // { type:'load'|'ok'|'err', msg }

  const tbl  = resolveTable(hp, fc);
  const km   = parseFloat(String(distKm).replace(',', '.')) || 0;
  const row  = findRow(tbl, cargo, axles);
  const piso = calcPiso(row, km);

  const peso = parseFloat(String(pesoTon).replace(',', '.')) || 0;
  const pisoPorTon = piso && peso > 0 ? piso / peso : null;

  const tp   = TAX_PROFILES[taxProfile];
  const totalTax = (tp?.pis || 0) + (tp?.cofins || 0) + inss / 100;

  // Base de custeio p/ simulação de margem: opcionalmente considera o retorno vazio
  // (o transportador precisa cobrir o custo do trecho de volta sem carga)
  const pisoRetorno = row ? calcPiso(row, km * 2) : null;
  const costBasis = retornoVazio ? pisoRetorno : piso;

  // Scenario 1: markup over piso
  const price1 = costBasis ? costBasis * (1 + margin / 100) : null;
  // Scenario 2: real margin (gross)
  const price2 = costBasis ? costBasis / (1 - totalTax - margin / 100) : null;

  const net1 = price1 && costBasis ? price1 - costBasis : null;
  const net2 = price2 && costBasis ? price2 * (1 - totalTax) - costBasis : null;

  const emb = parseFloat(String(embPrice).replace(',','.')) || 0;
  const embVsP1 = price1 && emb ? emb - price1 : null;
  const embVsP2 = price2 && emb ? emb - price2 : null;

  // ── Combustível ────────────────────────────────────────────
  // O consumo acompanha os eixos enquanto o usuário não digitar o dele.
  useEffect(() => {
    if (kmLAuto) setKmL(fmtNum(consumoPreset(axles), 1));
  }, [axles, kmLAuto]);

  useEffect(() => {
    if (!kmLAuto) localStorage.setItem(LS.kml, kmL); else localStorage.removeItem(LS.kml);
  }, [kmL, kmLAuto]);
  useEffect(() => { localStorage.setItem(LS.modo, precoModo); }, [precoModo]);
  useEffect(() => { localStorage.setItem(LS.preco, precoManual); }, [precoManual]);

  const precoRegiao = orig.uf ? dieselUF(orig.uf) : dieselInfo.mediaNacional;
  const precoLitro  = precoModo === 'manual' ? num(precoManual) : precoRegiao;
  const kml         = num(kmL);
  const kmlVazio    = num(kmLVazio);

  // Puxa a semana mais recente da ANP (serverless — só responde no deploy).
  const atualizarANP = async () => {
    setAnp({ type: 'load', msg: 'Consultando ANP…' });
    try {
      await buscarPrecosANP();
      const m = dieselMeta();
      setDieselInfo(m);
      setAnp({ type: 'ok', msg: `ANP · semana de ${diaMes(m.semanaInicio)} a ${diaMes(m.semanaFim)}` });
    } catch (e) {
      setAnp({ type: 'err', msg: 'ANP: ' + e.message });
    }
  };

  const comb = calcCombustivel(km, kml, precoLitro, retornoVazio, kmlVazio || null);
  const combPct = comb && costBasis ? comb.custo / costBasis : null;

  // Piso corrigido: quanto o piso "deveria" ser com o diesel local (estimativa)
  const pisoCorr = calcPisoCorrigido(row?.[IDX.CCD], row?.[IDX.CC], km, kml, precoLitro);
  const pisoCorrDelta = pisoCorr && piso ? pisoCorr - piso : null;
  const mostraPisoCorr = pisoCorr && piso && Math.abs(pisoCorrDelta / piso) > 0.005;

  // Cotação da embarcadora que não sobra nem para o custo fixo de carga/descarga
  const embSobra = emb > 0 && comb ? emb - comb.custo : null;
  const embAfogado = embSobra != null && row && embSobra < row[IDX.CC];

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
                    <CityAutocomplete
                      label="Origem"
                      value={orig}
                      onChange={setOrig}
                      onCityDone={() => destRef.current?.focusUf()}
                    />
                  </div>
                </div>
                <div style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
                  <div className="route-dot dest" />
                  <div style={{ flex:1 }}>
                    <CityAutocomplete ref={destRef} label="Destino" value={dest} onChange={setDest} />
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
              <div className="toggles-row toggles-row--mini">
                <ToggleCard label="Composição Veicular" sublabel="Tab.A/C" value={fc} onChange={setFc} />
                <ToggleCard label="Alto Desempenho" sublabel="Tab.C/D" value={hp} onChange={setHp} />
                <div className="select-card">
                  <label className="field-label">Eixos</label>
                  <Dropdown
                    value={axles}
                    onChange={setAxles}
                    options={axleOptions.map(n => ({ value: n, label: `${n} eixos` }))}
                  />
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
              <Dropdown
                value={cargo}
                onChange={setCargo}
                groups={CARGO_SECS.map(sec => ({
                  label: sec.label,
                  options: sec.types.map(t => ({ value: t, label: CARGO_LBL[t] })),
                }))}
              />
              <div style={{ marginTop:10 }}>
                <label className="field-label">Peso da carga (opcional)</label>
                <div className="dist-badge" style={{ marginTop:0 }}>
                  <span style={{ fontSize:12 }}>⚖️</span>
                  <input
                    value={pesoTon}
                    onChange={e => setPesoTon(e.target.value)}
                    style={{ width:80, textAlign:'center', fontWeight:700, color:'var(--accent)' }}
                    placeholder="0"
                  />
                  <span style={{ color:'var(--text3)' }}>toneladas</span>
                </div>
              </div>
            </div>
          </div>

          {/* Fuel card */}
          <div className="card">
            <div className="card-head">
              <div className="card-head-icon"><Icon name="combustivel" stroke="var(--accent)" size={17} /></div>
              <div>
                <div className="card-head-title">Combustível</div>
                <div className="card-head-sub">Consumo médio + preço do diesel</div>
              </div>
            </div>
            <div className="card-body card-body--compact">
              <label className="field-label">Consumo médio</label>
              <div className="dist-badge" style={{ marginTop:0 }}>
                <span style={{ fontSize:12 }}>⛽</span>
                <input
                  value={kmL}
                  onChange={e => { setKmL(e.target.value); setKmLAuto(false); }}
                  style={{ width:70, textAlign:'center', fontWeight:700, color:'var(--accent)' }}
                  placeholder="0,0"
                />
                <span style={{ color:'var(--text3)' }}>km/l</span>
                {kmLAuto ? (
                  <span className="fuel-tag">padrão {axles} eixos</span>
                ) : (
                  <button className="fuel-reset" onClick={() => setKmLAuto(true)}>usar padrão</button>
                )}
              </div>

              <div className="fuel-modo-row">
                <label className="field-label" style={{ marginBottom:0 }}>Preço do diesel</label>
                <div className="fuel-modo-pills">
                  <button
                    className={`tax-pill${precoModo === 'regiao' ? ' active' : ''}`}
                    onClick={() => setPrecoModo('regiao')}
                  >Média da região</button>
                  <button
                    className={`tax-pill${precoModo === 'manual' ? ' active' : ''}`}
                    onClick={() => {
                      if (!precoManual) setPrecoManual(fmtNum(precoRegiao, 3));
                      setPrecoModo('manual');
                    }}
                  >Manual</button>
                </div>
              </div>

              <div className="dist-badge" style={{ marginTop:0 }}>
                <span style={{ fontSize:11, color:'var(--text2)', fontWeight:700 }}>R$</span>
                {precoModo === 'manual' ? (
                  <input
                    value={precoManual}
                    onChange={e => setPrecoManual(e.target.value)}
                    style={{ width:80, textAlign:'center', fontWeight:700, color:'var(--accent)' }}
                    placeholder="0,000"
                  />
                ) : (
                  <span style={{ fontWeight:700, color:'var(--accent)', minWidth:60, textAlign:'center' }}>
                    {fmtNum(precoRegiao, 3)}
                  </span>
                )}
                <span style={{ color:'var(--text3)' }}>/litro</span>
                {precoModo === 'regiao' && (
                  <span className="fuel-tag">
                    {orig.uf || 'Brasil'} · ANP {diaMes(dieselInfo.semanaFim)}
                    {dieselInfo.aoVivo && <span className="fuel-live">ao vivo</span>}
                  </span>
                )}
              </div>

              {precoModo === 'regiao' && (
                <div className="fuel-anp-row">
                  <button className="fuel-anp-btn" onClick={atualizarANP} disabled={anp?.type === 'load'}>
                    {anp?.type === 'load' ? 'Consultando…' : 'Atualizar pela ANP'}
                  </button>
                  {anp && anp.type !== 'load' && (
                    <span className={`fuel-anp-msg${anp.type === 'err' ? ' err' : ''}`}>{anp.msg}</span>
                  )}
                </div>
              )}

              {precoModo === 'regiao' && !orig.uf && (
                <div className="fuel-hint">Informe a origem para usar a média do estado.</div>
              )}
              {precoModo === 'regiao' && dieselInfo.idadeDias > 21 && (
                <div className="fuel-hint warn">
                  ⚠ Levantamento de {diaMes(dieselInfo.semanaFim)} ({dieselInfo.idadeDias} dias) — vale atualizar.
                </div>
              )}

              {retornoVazio && (
                <div style={{ marginTop:10 }}>
                  <label className="field-label">Consumo no retorno vazio (opcional)</label>
                  <div className="dist-badge" style={{ marginTop:0 }}>
                    <span style={{ fontSize:12 }}>🍃</span>
                    <input
                      value={kmLVazio}
                      onChange={e => setKmLVazio(e.target.value)}
                      style={{ width:70, textAlign:'center', fontWeight:700, color:'var(--accent)' }}
                      placeholder={kml ? fmtNum(kml * CONSUMO_VAZIO_FATOR, 1) : '0,0'}
                    />
                    <span style={{ color:'var(--text3)' }}>km/l</span>
                    <span className="fuel-tag">padrão +30%</span>
                  </div>
                </div>
              )}
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
                  {pisoPorTon != null && (
                    <div className="result-row">
                      <span className="result-row-label">⚖️ Peso informado</span>
                      <span className="result-row-val">{fmtNum(peso, 1)} ton · R$ {fmtNum(pisoPorTon, 2)}/ton</span>
                    </div>
                  )}
                </div>

                {comb && (
                  <div className="fuel-result">
                    <div className="fuel-result-head">
                      <Icon name="combustivel" stroke="var(--cyan)" size={14} />
                      <span className="fuel-result-title">Custo de combustível</span>
                      <span className="fuel-result-total">{fmtBRL(comb.custo)}</span>
                    </div>
                    <div className="result-row">
                      <span className="result-row-label">Litros estimados</span>
                      <span className="result-row-val">
                        {fmtNum(comb.litros, 0)} l
                        {retornoVazio && (
                          <span style={{ color:'var(--text3)', fontWeight:400, marginLeft:4 }}>
                            (ida {fmtNum(comb.litrosIda, 0)} + volta {fmtNum(comb.litrosVolta, 0)})
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="result-row">
                      <span className="result-row-label">Diesel por km</span>
                      <span className="result-row-val">
                        R$ {fmtNum(comb.custoPorKm, 3)}/km
                        <span style={{ color:'var(--text3)', fontWeight:400, marginLeft:4 }}>
                          · {fmtNum(kml, 1)} km/l a R$ {fmtNum(precoLitro, 3)}
                        </span>
                      </span>
                    </div>
                    {combPct != null && (
                      <div className="result-row">
                        <span className="result-row-label">% do {retornoVazio ? 'custeio' : 'piso'}</span>
                        <span className={`result-row-val${combPct > 0.6 ? ' warn' : ''}`}>
                          {fmtNum(combPct * 100, 1)}%
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {mostraPisoCorr && (
                  <div className={`piso-corr${pisoCorrDelta > 0 ? ' up' : ' down'}`}>
                    <div className="piso-corr-head">
                      <span className="piso-corr-label">Piso indicativo com o diesel local</span>
                      <span className="piso-corr-val">
                        {fmtBRL(pisoCorr)}
                        <span className="piso-corr-delta">
                          {pisoCorrDelta > 0 ? '+' : ''}{fmtNum(pisoCorrDelta / piso * 100, 1)}%
                        </span>
                      </span>
                    </div>
                    <div className="piso-corr-note">
                      Diesel a R$ {fmtNum(precoLitro, 3)}/l contra R$ {fmtNum(ANTT_DIESEL_BASE.preco, 2)}/l usados na{' '}
                      {ANTT_DIESEL_BASE.resolucao}, ao seu consumo de {fmtNum(kml, 1)} km/l.
                      <strong> Estimativa para negociação — o piso legal continua sendo o oficial.</strong>
                    </div>
                  </div>
                )}

                <div className="result-note">
                  Piso = CCD × distância + CC &nbsp;·&nbsp; {ANTT_SOURCE.resolucao}
                </div>
                <div className="result-note" style={{ paddingTop:0 }}>
                  🛣️ Pedágio não incluso no piso — deve ser pago à parte, conforme legislação.
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

                  <div
                    className={`margin-retorno-row${retornoVazio ? ' on' : ''}`}
                    onClick={() => setRetornoVazio(v => !v)}
                  >
                    <div className="pill-switch" />
                    <span>Considerar retorno vazio (ida + volta)</span>
                    {retornoVazio && km > 0 && (
                      <span className="margin-retorno-hint">{fmtNum(km * 2, 0)} km considerados</span>
                    )}
                  </div>

                  <div style={{ padding:'10px 14px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                    <ScenarioCard
                      title="Markup s/ Piso"
                      subtitle={`${retornoVazio ? 'Custeio (ida+volta)' : 'Piso'} × (1 + ${margin}%)`}
                      price={price1}
                      net={net1}
                      basis={costBasis}
                      totalTax={totalTax}
                      inss={inss}
                      tp={tp}
                      fuel={comb?.custo}
                    />
                    <ScenarioCard
                      title="Margem Real"
                      subtitle={`${retornoVazio ? 'Custeio (ida+volta)' : 'Piso'} ÷ (1 − imp − ${margin}%)`}
                      price={price2}
                      net={net2}
                      basis={costBasis}
                      totalTax={totalTax}
                      inss={inss}
                      tp={tp}
                      fuel={comb?.custo}
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
                        {embAfogado && (
                          <div className="emb-warn-bar emb-warn-bar--fuel">
                            🔥 Sobram {fmtBRL(embSobra)} depois do diesel — menos que o custo fixo de
                            carga/descarga ({fmtBRL(row[IDX.CC])}). Viagem no prejuízo.
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
                            {embSobra != null && (
                              <div className="emb-row">
                                <span className="emb-row-lbl">Sobra após diesel</span>
                                <span className="emb-row-val" style={{ color: embAfogado ? 'var(--red)' : 'var(--cyan)' }}>
                                  {fmtBRL(embSobra)}
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
        Dados conforme <strong>{ANTT_SOURCE.resolucao}</strong> ({ANTT_SOURCE.vigor}). Distâncias via OSRM + OpenStreetMap.
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

function ScenarioCard({ title, subtitle, price, net, basis, totalTax, inss, tp, fuel }) {
  // Bruto após imposto e diesel — os demais custos (pneu, manutenção,
  // motorista) já estão modelados dentro do piso, então não entram aqui.
  const posDiesel = price && fuel ? price * (1 - totalTax) - fuel : null;
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
          {basis && net != null ? (
            <span className="margin-net-pct" style={{ color:'var(--text3)' }}>
              ({fmtNum(net / basis * 100)}%)
            </span>
          ) : null}
        </span>
      </div>
      {posDiesel != null && (
        <div className="margin-fuel-row">
          <span className="margin-fuel-label">
            Após diesel
            <span className="margin-fuel-hint">recebido − imp. − {fmtBRL(fuel)}</span>
          </span>
          <span className="margin-fuel-val" style={{ color: posDiesel >= 0 ? 'var(--cyan)' : 'var(--red)' }}>
            {fmtBRL(posDiesel)}
          </span>
        </div>
      )}
    </div>
  );
}
