import React, { useState } from 'react';
import { RAW, IDX, CARGO_LBL, CARGO_SECS, TBL_AXLES, TBL_DESCS, fmtNum } from '../utils/anttData.js';

const TABLES = ['A','B','C','D'];

export default function TablePage() {
  const [tbl, setTbl]     = useState('A');
  const [cargo, setCargo] = useState('carga_geral');
  const [hl, setHl]       = useState(null); // highlight axles
  const [axleFilter, setAxleFilter] = useState(null); // null = todos

  const rows = RAW.filter(r => r[IDX.TBL] === tbl && r[IDX.CARGO] === cargo);
  const axles = (TBL_AXLES[tbl] || []).filter(a => axleFilter === null || a === axleFilter);

  const allCargos = CARGO_SECS.flatMap(s => s.types);

  return (
    <div className="page-content">
      {/* Table selector */}
      <div className="tbl-tabs">
        {TABLES.map(t => (
          <button key={t} className={`tbl-tab${tbl===t?' active':''}`} onClick={() => { setTbl(t); setAxleFilter(null); }}>
            Tabela {t}
          </button>
        ))}
      </div>
      <p className="tbl-desc">{TBL_DESCS[tbl]}</p>

      {/* Axle filter */}
      <div style={{ marginBottom:10, display:'flex', flexWrap:'wrap', gap:5, alignItems:'center' }}>
        <span style={{ fontSize:9, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.06em' }}>Eixos:</span>
        <button
          className={`tax-pill${axleFilter === null ? ' active' : ''}`}
          onClick={() => setAxleFilter(null)}
        >Todos</button>
        {(TBL_AXLES[tbl] || []).map(a => (
          <button
            key={a}
            className={`tax-pill${axleFilter === a ? ' active' : ''}`}
            onClick={() => setAxleFilter(axleFilter === a ? null : a)}
          >{a} eixos</button>
        ))}
      </div>

      {/* Cargo selector */}
      <div style={{ marginBottom:12, display:'flex', flexWrap:'wrap', gap:5 }}>
        {CARGO_SECS.map(sec => (
          <React.Fragment key={sec.label}>
            <span style={{
              fontSize:9, fontWeight:700, color:'var(--text3)', textTransform:'uppercase',
              letterSpacing:'.06em', alignSelf:'center', paddingRight:2,
            }}>{sec.label}:</span>
            {sec.types.map(t => (
              <button
                key={t}
                className={`tax-pill${cargo===t?' active':''}`}
                onClick={() => setCargo(t)}
              >{CARGO_LBL[t]}</button>
            ))}
          </React.Fragment>
        ))}
      </div>

      {/* Table */}
      <div className="tbl-scroll">
        <table className="antt-table">
          <thead>
            <tr>
              <th>Carga</th>
              {axles.map(a => (
                <th
                  key={a}
                  style={{ cursor:'pointer' }}
                  onClick={() => setHl(hl === a ? null : a)}
                >
                  {a} eixos {hl === a ? '▼' : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CARGO_SECS.map(sec => {
              const secRows = sec.types.map(ct => {
                const row = RAW.filter(r => r[IDX.TBL] === tbl && r[IDX.CARGO] === ct);
                return { ct, row };
              }).filter(({ row }) => row.length > 0);

              if (!secRows.length) return null;
              return (
                <React.Fragment key={sec.label}>
                  <tr className="sec-hdr">
                    <td colSpan={axles.length + 1}>{sec.label}</td>
                  </tr>
                  {secRows.map(({ ct, row }) => (
                    <tr key={ct} className={ct === cargo ? 'row-hl' : ''}>
                      <td>{CARGO_LBL[ct]}</td>
                      {axles.map(a => {
                        const r = row.find(x => x[IDX.AXLES] === a);
                        return (
                          <td key={a} className={hl === a ? 'cell-hl' : ''}>
                            {r
                              ? <>
                                  <span className="cell-ccd">{fmtNum(r[IDX.CCD], 4)}</span>
                                  <span className="cell-cc">{fmtNum(r[IDX.CC], 2)}</span>
                                </>
                              : <span className="cell-na">—</span>
                            }
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="footer-note" style={{ marginTop:12 }}>
        Valores em R$/km (CCD) e R$ fixo (CC). Clicar em um eixo destaca a coluna.
        Res. ANTT 6.076/2026 + Portaria SUROC 4/2026 · vigor mar/2026.
      </div>
    </div>
  );
}
