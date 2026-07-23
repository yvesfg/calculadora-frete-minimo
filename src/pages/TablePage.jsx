import React, { useState } from 'react';
import Dropdown from '../components/Dropdown.jsx';
import { RAW, IDX, CARGO_LBL, CARGO_SECS, TBL_AXLES, TBL_DESCS, ANTT_SOURCE, fmtNum } from '../utils/anttData.js';

const TABLES = ['A','B','C','D'];

export default function TablePage() {
  const [tbl, setTbl]     = useState('A');
  const [cargo, setCargo] = useState('carga_geral');
  const [hl, setHl]       = useState(null); // highlight axles
  const [axleFilter, setAxleFilter] = useState(null); // null = todos
  const [check, setCheck] = useState({ status: 'idle' }); // idle|loading|uptodate|newer|error

  // Nº e ano da resolução-base (ex.: 'Res. ANTT 6.084/2026' → 6084 / 2026)
  const baseNum = parseInt((ANTT_SOURCE.resolucao.match(/(\d[\d.]*)\/\d{4}/)?.[1] || '6084').replace(/\D/g, ''), 10);
  const baseAno = parseInt(ANTT_SOURCE.resolucao.match(/\/(\d{4})/)?.[1] || '2026', 10);
  const fmtRes  = n => String(n).replace(/(\d)(\d{3})$/, '$1.$2');
  const resLink = n => `https://anttlegis.antt.gov.br/action/ActionDatalegis.php?acao=abrirTextoAto&tipo=RES&numeroAto=${String(n).padStart(8,'0')}&seqAto=000&valorAno=${baseAno}&orgao=DG/ANTT/MT&cod_modulo=623&cod_menu=9230`;

  const verificar = async () => {
    setCheck({ status: 'loading' });
    try {
      const r = await fetch(`/api/antt-check?base=${baseNum}&ano=${baseAno}`);
      const d = await r.json();
      setCheck(d.newer ? { status: 'newer', latest: d.latest } : { status: 'uptodate' });
    } catch {
      setCheck({ status: 'error' });
    }
  };

  const rows = RAW.filter(r => r[IDX.TBL] === tbl && r[IDX.CARGO] === cargo);
  const axles = (TBL_AXLES[tbl] || []).filter(a => axleFilter === null || a === axleFilter);

  const allCargos = CARGO_SECS.flatMap(s => s.types);

  return (
    <div className="page-content">
      {/* Table selector */}
      <div className="tbl-selector-row">
        <div className="select-card tbl-select-card">
          <label className="field-label">Tabela ANTT</label>
          <select
            className="veh-select"
            value={tbl}
            onChange={e => { setTbl(e.target.value); setAxleFilter(null); }}
          >
            {TABLES.map(t => (
              <option key={t} value={t}>Tabela {t}</option>
            ))}
          </select>
        </div>
        <div
          className={`tbl-update-check${check.status==='newer'?' is-newer':''}${check.status==='uptodate'?' is-ok':''}`}
          title={`Base atual: ${ANTT_SOURCE.resolucao} (vigor ${ANTT_SOURCE.vigor})`}
        >
          <button type="button" className="tbl-update-check-main" onClick={verificar} disabled={check.status==='loading'}>
            {check.status==='loading' ? '⏳ Verificando na ANTT…'
              : check.status==='uptodate' ? '✅ Base atualizada — é a mais recente'
              : check.status==='newer' ? `⚠️ Nova resolução: Res. ${fmtRes(check.latest)}/${baseAno}`
              : check.status==='error' ? '❌ Não deu para verificar — abrir portaria'
              : '🔎 Verificar atualização na ANTT'}
          </button>
          <span className="tbl-update-check-sub">
            {check.status==='newer'
              ? <>Atualizar base · <a href={resLink(check.latest)} target="_blank" rel="noreferrer">ver Res. {fmtRes(check.latest)}</a></>
              : <>Base: {ANTT_SOURCE.resolucao} · vigor {ANTT_SOURCE.vigor} · <a href={ANTT_SOURCE.url} target="_blank" rel="noreferrer">portaria oficial</a></>}
          </span>
        </div>
      </div>
      <p className="tbl-desc">{TBL_DESCS[tbl]}</p>

      {/* Filtros: Eixos + Tipo de carga (dropdowns no lugar das pills) */}
      <div className="tbl-filter-row">
        <div className="select-card tbl-filter-card">
          <label className="field-label">Eixos</label>
          <Dropdown
            value={axleFilter === null ? '__all__' : axleFilter}
            onChange={v => setAxleFilter(v === '__all__' ? null : Number(v))}
            options={[
              { value:'__all__', label:'Todos os eixos' },
              ...(TBL_AXLES[tbl] || []).map(a => ({ value:a, label:`${a} eixos` })),
            ]}
          />
        </div>
        <div className="select-card tbl-filter-card">
          <label className="field-label">Tipo de carga</label>
          <Dropdown
            value={cargo}
            onChange={setCargo}
            groups={CARGO_SECS.map(sec => ({
              label: sec.label,
              options: sec.types.map(t => ({ value:t, label:CARGO_LBL[t] })),
            }))}
          />
        </div>
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
        {ANTT_SOURCE.resolucao} · {ANTT_SOURCE.portaria} · vigor {ANTT_SOURCE.vigor}.
      </div>
    </div>
  );
}
