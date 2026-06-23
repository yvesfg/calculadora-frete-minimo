import React, { useState, useRef } from 'react';
import { RAW, IDX, CARGO_LBL, resolveTable, findRow, calcPiso, fmtBRL, fmtNum } from '../utils/anttData.js';
import { geocode, calcDistance } from '../utils/geo.js';

const DEFAULT_AXLES   = 5;
const DEFAULT_CARGO   = 'carga_geral';
const DEFAULT_HP      = false;
const DEFAULT_FC      = false;

function parseSheet(text) {
  const lines = text.trim().split('\n');
  return lines.map(line => {
    const cols = line.split(/[\t;,]/).map(c => c.trim());
    return {
      uf_orig:  cols[0] || '',
      city_orig: cols[1] || '',
      uf_dest:  cols[2] || '',
      city_dest: cols[3] || '',
      dist_km:  parseFloat(cols[4]) || 0,
      axles:    parseInt(cols[5])   || DEFAULT_AXLES,
      cargo:    cols[6]             || DEFAULT_CARGO,
    };
  }).filter(r => r.uf_orig && r.city_orig && r.uf_dest && r.city_dest);
}

export default function SheetPage() {
  const [text, setText]       = useState('');
  const [rows, setRows]       = useState([]);
  const [hp, setHp]           = useState(DEFAULT_HP);
  const [fc, setFc]           = useState(DEFAULT_FC);
  const [processing, setProc] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const textRef = useRef(null);

  const processRows = async (parsed) => {
    setProc(true); setProgress(0);
    const results = [];
    for (let i = 0; i < parsed.length; i++) {
      const r = parsed[i];
      let km = r.dist_km;
      let err = '';
      if (!km) {
        try {
          const [o, d] = await Promise.all([
            geocode(r.city_orig, r.uf_orig),
            geocode(r.city_dest, r.uf_dest),
          ]);
          const alts = await calcDistance(o, d);
          km = alts[0].km;
        } catch (e) {
          err = e.message;
        }
      }
      const tbl  = resolveTable(hp, fc);
      const axles = r.axles || DEFAULT_AXLES;
      const cargo = r.cargo || DEFAULT_CARGO;
      const row   = findRow(tbl, cargo, axles);
      const piso  = calcPiso(row, km);
      results.push({ ...r, km, tbl, row, piso, err });
      setProgress(Math.round((i + 1) / parsed.length * 100));
    }
    setRows(results);
    setProc(false);
  };

  const handleProcess = () => {
    const parsed = parseSheet(text);
    if (!parsed.length) return;
    processRows(parsed);
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setText(ev.target.result);
    reader.readAsText(file, 'UTF-8');
  };

  const exportCSV = () => {
    const header = 'UF_orig,Cidade_orig,UF_dest,Cidade_dest,Distância_km,Eixos,TipoCarga,Tabela,CCD,CC,Piso_ANTT';
    const lines  = rows.map(r => [
      r.uf_orig, r.city_orig, r.uf_dest, r.city_dest,
      r.km, r.axles, r.cargo,
      r.tbl,
      r.row?.[IDX.CCD] || '',
      r.row?.[IDX.CC] || '',
      r.piso ? fmtNum(r.piso).replace('.','').replace(',','.') : '',
    ].join(','));
    const blob = new Blob([[header, ...lines].join('\n')], { type:'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `frete-minimo-${Date.now()}.csv`;
    a.click();
  };

  const totalPiso = rows.reduce((acc, r) => acc + (r.piso || 0), 0);

  return (
    <div className="page-content">
      <div className="card">
        <div className="card-head">
          <div className="card-head-icon">📋</div>
          <div>
            <div className="card-head-title">Cálculo em Lote</div>
            <div className="card-head-sub">Cole uma planilha ou arraste um arquivo CSV/TSV</div>
          </div>
        </div>
        <div className="card-body">
          <div
            className={`paste-zone${dragOver ? ' drag-over' : ''}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => textRef.current?.focus()}
          >
            <textarea
              ref={textRef}
              value={text}
              onChange={e => setText(e.target.value)}
              style={{
                width:'100%', minHeight:120, background:'transparent', border:'none',
                color:'var(--text)', fontFamily:'var(--font)', fontSize:12,
                resize:'vertical', outline:'none',
              }}
              placeholder={`Cole aqui ou arraste um arquivo…\n\nColunas: UF_orig  Cidade_orig  UF_dest  Cidade_dest  Distância(km)*  Eixos*  TipoCarga*\n* opcionais — distância calculada via OSRM se omitida`}
            />
          </div>

          <div style={{ display:'flex', gap:8, marginTop:10, flexWrap:'wrap', alignItems:'center' }}>
            <label style={{ fontSize:11, color:'var(--text3)', display:'flex', alignItems:'center', gap:4 }}>
              <input type="checkbox" checked={hp} onChange={e => setHp(e.target.checked)} />
              Alto Desempenho (HP)
            </label>
            <label style={{ fontSize:11, color:'var(--text3)', display:'flex', alignItems:'center', gap:4 }}>
              <input type="checkbox" checked={fc} onChange={e => setFc(e.target.checked)} />
              Frete Contratado (FC)
            </label>
            <button
              className="btn btn-primary"
              style={{ marginLeft:'auto', width:'auto', padding:'8px 20px' }}
              onClick={handleProcess}
              disabled={!text.trim() || processing}
            >
              {processing ? `Calculando… ${progress}%` : '⚡ Calcular'}
            </button>
            {rows.length > 0 && (
              <button className="btn btn-ghost" onClick={exportCSV}>
                ↓ Exportar CSV
              </button>
            )}
          </div>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="card">
          <div className="card-head">
            <div className="card-head-icon">📊</div>
            <div>
              <div className="card-head-title">Resultados — {rows.length} rotas</div>
              <div className="card-head-sub">Total: {fmtBRL(totalPiso)}</div>
            </div>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table className="sheet-table">
              <thead>
                <tr>
                  <th>Origem</th>
                  <th>Destino</th>
                  <th>Dist.</th>
                  <th>Eixos</th>
                  <th>Tab</th>
                  <th>Piso ANTT</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>
                      <span className="td-uf">{r.uf_orig}</span>
                      <span className="td-cidade"> {r.city_orig}</span>
                    </td>
                    <td>
                      <span className="td-uf">{r.uf_dest}</span>
                      <span className="td-cidade"> {r.city_dest}</span>
                    </td>
                    <td className="td-num">{r.km ? `${r.km.toLocaleString('pt-BR')} km` : '—'}</td>
                    <td className="td-num">{r.axles}</td>
                    <td className="td-num" style={{ fontWeight:700, color:'var(--accent)' }}>{r.tbl}</td>
                    <td className="td-piso">
                      {r.err
                        ? <span style={{ color:'var(--red)', fontSize:10 }}>{r.err}</span>
                        : r.piso ? fmtBRL(r.piso) : <span className="td-empty">—</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5} className="td-total-lbl">Total</td>
                  <td className="td-piso">{fmtBRL(totalPiso)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <div className="footer-note">
        Formato: colunas separadas por tab, ponto-e-vírgula ou vírgula. Cabeçalho opcional (ignorado se não-numérico).
        Distância calculada automaticamente via OSRM quando omitida. Eixos padrão: {DEFAULT_AXLES}. Carga padrão: {CARGO_LBL[DEFAULT_CARGO]}.
      </div>
    </div>
  );
}
