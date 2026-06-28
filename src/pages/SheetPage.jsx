import React, { useState, useRef } from 'react';
import { RAW, IDX, CARGO_LBL, resolveTable, findRow, calcPiso, fmtBRL, fmtNum } from '../utils/anttData.js';
import { geocode, calcDistance } from '../utils/geo.js';
import Icon from '../components/Icon.jsx';

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
  // UF sempre 2 letras — descarta cabeçalho e linhas inválidas automaticamente.
  }).filter(r => /^[A-Za-z]{2}$/.test(r.uf_orig) && r.city_orig && /^[A-Za-z]{2}$/.test(r.uf_dest) && r.city_dest);
}

// Converte as linhas extraídas pela IA / Excel no mesmo CSV que o textarea entende.
function rowsToText(rows) {
  return rows.map(r => [
    r.uf_orig, r.city_orig, r.uf_dest, r.city_dest,
    r.dist_km || '', r.axles || '', r.cargo || '',
  ].join(';')).join('\n');
}

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// Reduz a foto antes de mandar pra IA — payload menor, leitura igual.
function downscaleImage(dataUrl, maxPx = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, maxPx / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('Não foi possível ler a imagem'));
    img.src = dataUrl;
  });
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

export default function SheetPage() {
  const [text, setText]       = useState('');
  const [rows, setRows]       = useState([]);
  const [hp, setHp]           = useState(DEFAULT_HP);
  const [fc, setFc]           = useState(true); // padrão: composição veicular → Tabela A
  const [processing, setProc] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [intake, setIntake]   = useState(null); // { type:'load'|'ok'|'err', msg }
  const textRef = useRef(null);
  const fileRef = useRef(null);

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

  // ── Roteia o arquivo conforme o tipo ──────────────────────
  const handleFile = async (file) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setIntake({ type: 'err', msg: 'Arquivo muito grande — máx. 10 MB' });
      return;
    }
    const name = file.name.toLowerCase();
    const isImg = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf' || name.endsWith('.pdf');
    const isXlsx = /\.(xlsx|xls)$/.test(name);

    if (isImg || isPdf) return intakeIA(file, isPdf);
    if (isXlsx)         return readXlsx(file);
    // CSV / TSV / TXT — vai direto pro campo.
    const reader = new FileReader();
    reader.onload = ev => { setText(ev.target.result); setIntake(null); };
    reader.readAsText(file, 'UTF-8');
  };

  // Intake IA — foto/print/PDF de cotação → linhas estruturadas via gateway.
  const intakeIA = async (file, isPdf) => {
    setIntake({ type: 'load', msg: 'IA lendo a cotação…' });
    try {
      const dataUrl = await toBase64(file);
      const image = isPdf ? dataUrl : await downscaleImage(dataUrl);
      const r = await fetch('/api/ai-extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: 'cotacao', image }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${r.status}`);
      }
      const data = await r.json();
      const extracted = Array.isArray(data.rows) ? data.rows : [];
      if (!extracted.length) throw new Error('Nenhuma rota reconhecida no documento');
      setText(rowsToText(extracted));
      setIntake({ type: 'ok', msg: `✨ IA extraiu ${extracted.length} rota(s) — confira e clique Calcular` });
    } catch (e) {
      setIntake({ type: 'err', msg: 'IA: ' + e.message });
    }
  };

  // Excel — converte a 1ª aba em CSV (import dinâmico, fora do bundle principal).
  const readXlsx = async (file) => {
    setIntake({ type: 'load', msg: 'Lendo planilha…' });
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      setText(XLSX.utils.sheet_to_csv(ws, { FS: ';' }));
      setIntake({ type: 'ok', msg: 'Planilha carregada — confira e clique Calcular' });
    } catch (e) {
      setIntake({ type: 'err', msg: 'Planilha: ' + e.message });
    }
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const handlePick = (e) => {
    handleFile(e.target.files?.[0]);
    e.target.value = '';
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

  const downloadTemplate = () => {
    const header = 'UF_orig;Cidade_orig;UF_dest;Cidade_dest;Distancia_km;Eixos;TipoCarga';
    const exemplos = [
      'MA;Imperatriz;PA;Belem;;5;carga_geral',
      'MA;Acailandia;MA;Sao Luis;;6;granel_solido',
    ];
    const blob = new Blob(['﻿' + [header, ...exemplos].join('\r\n')], { type:'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'modelo-cotacao-frete.csv';
    a.click();
  };

  const totalPiso = rows.reduce((acc, r) => acc + (r.piso || 0), 0);

  const intakeColor = intake?.type === 'err' ? 'var(--red)'
    : intake?.type === 'ok' ? 'var(--accent)' : 'var(--text3)';

  return (
    <div className="page-content">
      <div className="card">
        <div className="card-head">
          <div className="card-head-icon"><Icon name="planilha" stroke="var(--accent)" size={17} /></div>
          <div style={{ flex:1 }}>
            <div className="card-head-title">Cálculo em Lote</div>
            <div className="card-head-sub">Suba uma cotação (foto, PDF, Excel ou CSV) — a IA extrai as rotas — ou cole/arraste</div>
          </div>
          <div style={{ display:'flex', gap:8, flexShrink:0 }}>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.tsv,.txt,.xlsx,.xls,image/*,application/pdf"
              style={{ display:'none' }}
              onChange={handlePick}
            />
            <button className="btn btn-ghost" style={{ gap:5 }} onClick={() => fileRef.current?.click()}>
              <Icon name="upload" size={13} /> Enviar arquivo
            </button>
            <button className="btn btn-ghost" style={{ gap:5 }} onClick={downloadTemplate}>
              <Icon name="download" size={13} /> Baixar modelo
            </button>
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
              onChange={e => { setText(e.target.value); if (intake) setIntake(null); }}
              style={{
                width:'100%', minHeight:120, background:'transparent', border:'none',
                color:'var(--text)', fontFamily:'var(--font)', fontSize:12,
                resize:'vertical', outline:'none',
              }}
              placeholder={`Arraste um arquivo aqui (foto, PDF, Excel ou CSV), cole o conteúdo, ou clique em "Enviar arquivo".\n\nColunas: UF_orig  Cidade_orig  UF_dest  Cidade_dest  Distância(km)*  Eixos*  TipoCarga*\n* opcionais — distância calculada via OSRM se omitida`}
            />
          </div>

          {intake && (
            <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:8, fontSize:11, color:intakeColor }}>
              {intake.type === 'load' && <Icon name="ia" size={13} stroke={intakeColor} />}
              {intake.msg}
            </div>
          )}

          <div style={{ display:'flex', gap:8, marginTop:10, flexWrap:'wrap', alignItems:'center' }}>
            <div className="toggles-row toggles-row--mini">
              <ToggleCard label="Composição Veicular" sublabel="Tab.A/C" value={fc} onChange={setFc} />
              <ToggleCard label="Alto Desempenho" sublabel="Tab.C/D" value={hp} onChange={setHp} />
            </div>
            <button
              className="btn btn-primary"
              style={{ marginLeft:'auto', width:'auto', padding:'8px 20px' }}
              onClick={handleProcess}
              disabled={!text.trim() || processing}
            >
              {processing ? `Calculando… ${progress}%` : (<><Icon name="raio" size={14} /> Calcular</>)}
            </button>
            {rows.length > 0 && (
              <button className="btn btn-ghost" style={{ gap:5 }} onClick={exportCSV}>
                <Icon name="download" size={13} /> Exportar CSV
              </button>
            )}
          </div>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="card">
          <div className="card-head">
            <div className="card-head-icon"><Icon name="resultado" stroke="var(--accent)" size={17} /></div>
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
        Formato: colunas separadas por tab, ponto-e-vírgula ou vírgula. Cabeçalho opcional (ignorado automaticamente).
        Fotos, prints e PDFs de cotação são lidos por IA; Excel é convertido para linhas.
        Distância calculada via OSRM quando omitida. Eixos padrão: {DEFAULT_AXLES}. Carga padrão: {CARGO_LBL[DEFAULT_CARGO]}.
      </div>
    </div>
  );
}
