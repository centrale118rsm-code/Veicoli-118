'use strict';
/* =====================================================================
   STORICO — interventi di tutta la flotta, scheda veicolo, dettaglio,
   modifiche protette (con storico modifiche), report, statistiche,
   registro attività (chi ha fatto cosa)
   ===================================================================== */
const SF = {veicolo:'', cat:'', tipo:'', anno:'', off:'', testo:'', aperti:false, sort:'data', dir:-1, tab:'lista', limit:150};
const LF = {by:'', a:'', testo:'', limit:200};
let storSel = new Set();

function recTipo(r) { return r.type === 'gomme' ? 'Gomme' : r.type === 'manutenzione' ? 'Programmata' : 'Riparazione'; }
function allRecords() {
  const out = [];
  Object.entries(DB.flotta).forEach(([k, arr]) => (arr || []).forEach(r => out.push({...r, _m:k, _d:recDate(r), _open:false})));
  if (SF.aperti) DB.tickets.forEach(t => out.push({...t, _m:t.mezzo, _d:parseDate(t.dataSegnalazione), _open:true}));
  return out;
}
function filteredRecords() {
  const q = norm(SF.testo);
  let r = allRecords().filter(x =>
    (!SF.veicolo || x._m === SF.veicolo) && (!SF.cat || (x.categoria || 'Altro') === SF.cat) && (!SF.tipo || recTipo(x) === SF.tipo) &&
    (!SF.anno || (x._d && x._d.getFullYear() === +SF.anno)) && (!SF.off || canonOfficina(x.officina || x.officinaAppuntamento) === SF.off) &&
    (!q || norm(`${x._m} ${x.dataSegnalazione} ${x.problema} ${x.officina} ${x.operatoreSegnalazione} ${x.operatoreConsegna} ${x.operatoreRitiro} ${x.intervento} ${x.categoria} ${x.km} ${x.documento || ''}`).includes(q)));
  const key = {data:x => x._d ? x._d.getTime() : 0, veicolo:x => x._m, km:x => num(x.km) || 0, costo:x => num(x.costo) || 0, officina:x => canonOfficina(x.officina)}[SF.sort] || (x => 0);
  return r.sort((a, b) => { const A = key(a), B = key(b); return (A > B ? 1 : A < B ? -1 : 0) * SF.dir; });
}
function fermoGiorni(r) { if (!r.dataIngresso || !r.dataChiusura || /storico|archivio/i.test(r.operatoreConsegna || '') || r.type === 'gomme') return null; const d = daysDiff(r.dataIngresso, r.dataChiusura); return d !== null && d >= 0 && d < 365 ? d : null; }

function renderStorico() {
  const el = $('#view-storico');
  const all = allRecords(); const years = [...new Set(all.map(x => x._d && x._d.getFullYear()).filter(Boolean))].sort((a, b) => b - a);
  const offs = [...new Set(all.map(x => canonOfficina(x.officina)).filter(x => x && x !== '-'))].sort();
  el.innerHTML = `
    <div class="view-title"><h2><i class="fas fa-history text-primary me-2"></i>Storico</h2><span class="sub">Tutti gli interventi della flotta, dal più recente</span>
      <div class="actions"><div class="btn-group btn-group-sm">${[['lista', 'fa-list', 'Interventi'], ['stat', 'fa-chart-bar', 'Statistiche'], ['log', 'fa-user-clock', 'Chi ha fatto cosa']].map(([k, i, l]) => `<button class="btn ${SF.tab === k ? 'btn-primary' : 'btn-outline-primary'}" onclick="SF.tab='${k}';renderStorico()"><i class="fas ${i} me-1"></i>${l}</button>`).join('')}</div>
      <button class="btn btn-sm btn-outline-success" onclick="aggiungiVecchio()"><i class="fas fa-plus-circle me-1"></i>Inserisci vecchio intervento</button></div></div>
    ${SF.tab === 'log' ? '<div id="log-box"></div>' : `
    <div class="card-x"><div class="fbar">
      <div class="f grow"><span class="lbl">Cerca</span><input class="form-control" id="sf-q" placeholder="problema, officina, operatore, km…" value="${escA(SF.testo)}"></div>
      <div class="f"><span class="lbl">Veicolo</span><select class="form-select" id="sf-v"><option value="">Tutti</option>${vehNames(true).map(n => `<option ${SF.veicolo === n ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
      <div class="f"><span class="lbl">Tipo</span><select class="form-select" id="sf-t"><option value="">Tutti</option>${['Riparazione', 'Programmata', 'Gomme'].map(n => `<option ${SF.tipo === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <div class="f"><span class="lbl">Categoria</span><select class="form-select" id="sf-c"><option value="">Tutte</option>${cats().map(c => `<option ${SF.cat === c.nome ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select></div>
      <div class="f"><span class="lbl">Officina</span><select class="form-select" id="sf-o"><option value="">Tutte</option>${offs.map(n => `<option ${SF.off === n ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
      <div class="f" style="min-width:90px"><span class="lbl">Anno</span><select class="form-select" id="sf-a"><option value="">Tutti</option>${years.map(n => `<option ${+SF.anno === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <div class="f" style="min-width:auto"><span class="lbl">&nbsp;</span><div class="d-flex gap-1"><span class="chip ${SF.aperti ? 'on' : ''}" id="sf-open">+ aperti</span><button class="btn btn-sm btn-light border" onclick="Object.assign(SF,{veicolo:'',cat:'',tipo:'',anno:'',off:'',testo:'',aperti:false});renderStorico()" title="Azzera filtri"><i class="fas fa-undo"></i></button></div></div>
    </div><div id="stor-body"></div></div>`}`;
  if (SF.tab === 'log') { renderLog('log-box'); return; }
  const bind = (id, k) => { const e = $('#' + id); e.addEventListener(e.tagName === 'INPUT' ? 'input' : 'change', debounce(() => { SF[k] = e.value; SF.limit = 150; renderStoricoBody(); }, e.tagName === 'INPUT' ? 250 : 0)); };
  bind('sf-q', 'testo'); bind('sf-v', 'veicolo'); bind('sf-t', 'tipo'); bind('sf-c', 'cat'); bind('sf-o', 'off'); bind('sf-a', 'anno');
  $('#sf-open').onclick = () => { SF.aperti = !SF.aperti; renderStorico(); };
  renderStoricoBody();
}
function renderStoricoBody() {
  const box = $('#stor-body'); if (!box) return;
  const rs = filteredRecords();
  if (SF.tab === 'stat') { box.innerHTML = statsHTML(rs); return; }
  const th = (k, l) => `<th class="sort" onclick="SF.dir=SF.sort==='${k}'?-SF.dir:-1;SF.sort='${k}';renderStoricoBody()">${l}${SF.sort === k ? (SF.dir < 0 ? ' ▼' : ' ▲') : ''}</th>`;
  const costTot = rs.reduce((s, r) => s + (num(r.costo) || 0), 0);
  box.innerHTML = `
    <div class="d-flex flex-wrap gap-2 align-items-center px-3 py-2 border-bottom small">
      <b>${rs.length}</b> interventi${costTot ? ` · costo registrato <b>${eur(costTot)}</b>` : ''} · <span id="sel-n">${storSel.size}</span> selezionati
      <div class="ms-auto d-flex gap-1 flex-wrap"><button class="btn btn-sm btn-outline-dark" onclick="storSelAll()"><i class="far fa-check-square me-1"></i>Seleziona visibili</button>
      <button class="btn btn-sm btn-outline-primary" onclick="reportStampa()"><i class="fas fa-print me-1"></i>Report</button><button class="btn btn-sm btn-outline-danger" onclick="reportPDF()"><i class="fas fa-file-pdf me-1"></i>PDF</button><button class="btn btn-sm btn-outline-success" onclick="reportExcel()"><i class="fas fa-file-excel me-1"></i>Excel</button></div></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th style="width:30px"></th>${th('data', 'Data')}${th('veicolo', 'Veicolo')}<th>Tipo</th><th>Problema</th>${th('officina', 'Officina')}<th>Intervento</th>${th('km', 'Km')}${th('costo', 'Costo')}<th>Operatori</th></tr></thead><tbody>
    ${rs.slice(0, SF.limit).map(r => `<tr class="clk" onclick="${r._open ? `Scheda.open(${r.id})` : `openRecord('${jsq(r._m)}',${r.id})`}">
      <td onclick="event.stopPropagation()">${r._open ? '' : `<input type="checkbox" class="form-check-input" data-sel="${r.id}" ${storSel.has(r.id) ? 'checked' : ''}>`}</td>
      <td class="nowrap"><b>${fmtD(r._d)}</b>${r._open ? '<br><span class="pill pill-amber">aperto</span>' : ''}${fermoGiorni(r) ? `<div class="small text-muted">${fermoGiorni(r)} gg fermo</div>` : ''}</td>
      <td class="nowrap fw-bold">${esc(r._m)}</td>
      <td>${catPill(r.categoria)}<div class="small text-muted mt-1">${recTipo(r)}</div></td>
      <td class="cell-clip">${esc(r.problema)}</td><td>${esc(r.officina || r.officinaAppuntamento || '')}</td>
      <td class="cell-clip text-success">${esc(r.intervento || '')}</td><td class="mono small nowrap">${esc(r.km || '')}</td><td class="nowrap">${r.costo ? eur(r.costo) : ''}</td>
      <td class="small text-muted">${[r.operatoreSegnalazione, r.operatoreConsegna, r.operatoreRitiro].filter(x => x && !/^(-|storico|archivio)$/i.test(x)).filter((x, i, a) => a.indexOf(x) === i).map(esc).join(', ')}</td></tr>`).join('') || '<tr><td colspan="10"><div class="empty"><i class="fas fa-search"></i>Nessun intervento trovato</div></td></tr>'}
    </tbody></table>${rs.length > SF.limit ? `<div class="text-center p-3"><button class="btn btn-outline-primary btn-sm" onclick="SF.limit+=300;renderStoricoBody()">Mostra altri ${rs.length - SF.limit}</button></div>` : ''}</div>`;
  $$('[data-sel]', box).forEach(c => c.onchange = () => { const id = +c.dataset.sel; c.checked ? storSel.add(id) : storSel.delete(id); $('#sel-n').textContent = storSel.size; });
}
function storSelAll() { const rs = filteredRecords().filter(r => !r._open); const all = rs.every(r => storSel.has(r.id)); rs.forEach(r => all ? storSel.delete(r.id) : storSel.add(r.id)); renderStoricoBody(); }
function selectedRecords() { const rs = allRecords().filter(r => !r._open); const s = storSel.size ? rs.filter(r => storSel.has(r.id)) : filteredRecords().filter(r => !r._open); return s.sort((a, b) => (b._d || 0) - (a._d || 0)); }
function filterDesc() { return [SF.veicolo, SF.tipo, SF.cat, SF.off, SF.anno, SF.testo && `"${SF.testo}"`].filter(Boolean).join(' · ') || 'Tutta la flotta'; }

/* --- statistiche (barre orizzontali, un solo colore) --- */
function barsHTML(title, pairs, fmt = x => x) {
  const max = Math.max(1, ...pairs.map(p => p[1]));
  return `<div class="card-x mb-0"><div class="hd">${title}</div><div class="bd bars">${pairs.length ? pairs.map(([n, val]) => `<div class="br" title="${escA(n)}: ${escA(fmt(val))}"><span class="n">${esc(n)}</span><span class="tr"><span class="fl" style="width:${(val / max * 100).toFixed(1)}%"></span></span><span class="v">${esc(fmt(val))}</span></div>`).join('') : '<div class="text-muted small">Nessun dato</div>'}</div></div>`;
}
function countBy(rs, f) { const c = {}; rs.forEach(r => { const k = f(r); if (k) c[k] = (c[k] || 0) + 1; }); return Object.entries(c).sort((a, b) => b[1] - a[1]); }
function statsHTML(rs) {
  rs = rs.filter(r => !r._open);
  const cost = rs.reduce((s, r) => s + (num(r.costo) || 0), 0);
  const fg = rs.map(fermoGiorni).filter(x => x !== null); const avg = fg.length ? (fg.reduce((a, b) => a + b, 0) / fg.length) : null;
  const costBy = {}; rs.forEach(r => { const c = num(r.costo); if (c) costBy[r._m] = (costBy[r._m] || 0) + c; });
  const byYear = countBy(rs, r => r._d && String(r._d.getFullYear())).sort((a, b) => b[0] - a[0]);
  return `<div class="p-3"><div class="minis mb-3">
      <div class="mini"><div class="v">${rs.length}</div><div class="t">Interventi</div></div>
      <div class="mini"><div class="v">${rs.filter(r => recTipo(r) === 'Riparazione').length}</div><div class="t">Riparazioni</div></div>
      <div class="mini"><div class="v">${rs.filter(r => recTipo(r) !== 'Riparazione').length}</div><div class="t">Programmate / gomme</div></div>
      <div class="mini"><div class="v">${avg !== null ? avg.toFixed(1) : '–'}</div><div class="t">Giorni medi in officina</div></div>
      <div class="mini"><div class="v">${cost ? eur(cost) : '–'}</div><div class="t">Costi registrati</div></div></div>
    <div class="stat-grid">${barsHTML('Interventi per veicolo', countBy(rs, r => r._m))}${barsHTML('Per categoria', countBy(rs, r => r.categoria || 'Altro'))}
      ${barsHTML('Per officina', countBy(rs, r => { const o = canonOfficina(r.officina); return o && o !== '-' ? o : ''; }).slice(0, 10))}${barsHTML('Per anno', byYear)}
      ${Object.keys(costBy).length ? barsHTML('Costi per veicolo', Object.entries(costBy).sort((a, b) => b[1] - a[1]), eur) : ''}</div>
    <p class="small text-muted mt-3 mb-0">Le statistiche seguono i filtri impostati sopra. I costi compaiono solo per gli interventi in cui sono stati registrati.</p></div>`;
}

/* --- dettaglio record --- */
function getRec(mezzo, id) { return (DB.flotta[mezzo] || []).find(x => x.id === id); }
function openRecord(mezzo, id) {
  const r = getRec(mezzo, id); if (!r) return;
  const p = r.preventivo || {}; const fg = fermoGiorni(r);
  const m = openModal({id:'rec-modal', title:`<i class="fas fa-file-alt me-2"></i>${esc(mezzo)} · ${fmtD(recDate(r))}`, color:'dark', size:'modal-xl',
    body:`<div class="row g-3"><div class="col-lg-7">
      <div class="step-panel"><h6><i class="fas fa-clipboard-list"></i>1. Segnalazione <span class="st">${catPill(r.categoria)} <span class="pill pill-gray">${recTipo(r)}</span></span></h6><div class="kv"><div>Data</div><div>${esc(r.dataSegnalazione)}</div><div>Operatore</div><div>${esc(r.operatoreSegnalazione || '-')}</div><div>Km</div><div>${esc(r.km || '-')}</div><div>Problema</div><div class="fw-bold" style="white-space:pre-line">${esc(r.problema)}</div></div></div>
      ${r.dataAppuntamento ? `<div class="step-panel"><h6><i class="far fa-calendar-alt"></i>2. Appuntamento</h6><div class="kv"><div>Officina</div><div>${esc(r.officinaAppuntamento || '-')}</div><div>Data</div><div>${fmtD(r.dataAppuntamento)} ${esc(r.dataAppuntamentoOra || '')}</div><div>Operatore</div><div>${esc(r.operatoreAppuntamento || '-')}</div>${r.noteAppuntamento ? `<div>Note</div><div>${esc(r.noteAppuntamento)}</div>` : ''}</div></div>` : ''}
      ${r.emailInformativa || p.stato ? `<div class="step-panel"><h6><i class="fas fa-file-invoice-dollar"></i>3. Email / Preventivo</h6><div class="kv">${r.emailInformativa ? `<div>Email informativa</div><div>${esc(r.emailInformativa.data)} · ${esc(r.emailInformativa.operatore)}</div>` : ''}${p.stato ? `<div>Preventivo</div><div>${esc(p.stato.replace('_', ' '))} ${p.importo ? eur(p.importo) : ''}${p.dataAutorizzazione ? ` · autorizzato ${fmtD(p.dataAutorizzazione)} ${esc(p.autorizzatoDa || '')}` : ''}</div>` : ''}</div></div>` : ''}
      <div class="step-panel"><h6><i class="fas fa-tools"></i>4. Officina</h6><div class="kv"><div>Officina</div><div class="fw-bold">${esc(r.officina || '-')}</div><div>Ingresso</div><div>${esc(r.dataIngresso || '-')}</div><div>Portato da</div><div>${esc(r.operatoreConsegna || '-')}</div>${fg !== null ? `<div>Giorni fermo</div><div>${fg}</div>` : ''}</div>
        ${Array.isArray(r.noteOfficina) && r.noteOfficina.length ? `<div class="mt-2">${r.noteOfficina.map(n => `<div class="small border-bottom py-1"><b class="text-primary">${esc(n.date)}</b>${n.by ? ' · ' + esc(n.by) : ''}: ${esc(n.text)}</div>`).join('')}</div>` : ''}</div>
      <div class="step-panel"><h6><i class="fas fa-flag-checkered"></i>5. Ritiro / chiusura</h6><div class="kv"><div>Data</div><div>${esc(r.dataChiusura || '-')}</div><div>Ritirato da</div><div>${esc(r.operatoreRitiro || '-')}</div>${r.kmRitiro ? `<div>Km ritiro</div><div>${esc(r.kmRitiro)}</div>` : ''}<div>Intervento</div><div class="fw-bold text-success" style="white-space:pre-line">${esc(r.intervento || '-')}</div>${r.costo ? `<div>Costo</div><div class="fw-bold">${eur(r.costo)}</div>` : ''}${r.documento ? `<div>Documento</div><div>${esc(r.documento)}</div>` : ''}${r.garanzia ? '<div>Garanzia</div><div>Sì</div>' : ''}</div>
        ${Array.isArray(r.checklist) && r.checklist.length ? `<div class="mt-2">${r.checklist.map(c => `<div class="small"><i class="fas ${c.ok ? 'fa-check-square text-success' : 'fa-square text-muted'} me-1"></i>${esc(c.voce)}</div>`).join('')}</div>` : ''}</div>
    </div><div class="col-lg-5">
      <div class="step-panel"><h6><i class="fas fa-stream"></i>Diario</h6>${timelineHTML(r)}</div>
      <div class="step-panel"><h6><i class="fas fa-user-edit"></i>Tracciabilità</h6><div class="kv small">${r.creatoDa ? `<div>Creato da</div><div>${esc(r.creatoDa)} · ${esc(r.creatoIl || '')}</div>` : ''}${r.chiusoDa ? `<div>Chiuso da</div><div>${esc(r.chiusoDa)} · ${esc(r.chiusoIl || '')}</div>` : ''}${r.modificatoDa ? `<div>Ultima modifica</div><div>${esc(r.modificatoDa)} · ${esc(r.modificatoIl || '')}</div>` : ''}</div>
        ${(r.modifiche || []).length ? `<div class="sec-title">Modifiche (${r.modifiche.length})</div>${r.modifiche.slice().reverse().map(x => `<div class="small border-bottom py-1"><b>${esc(x.ts)}</b> · ${esc(x.by)}<br>${x.campi.map(c => `${esc(c.campo)}: <s class="text-muted">${esc(c.da) || '∅'}</s> → <b>${esc(c.a) || '∅'}</b>`).join('<br>')}</div>`).join('')}` : '<div class="small text-muted mt-2">Nessuna modifica successiva.</div>'}</div>
    </div></div>`,
    footer:`<button class="btn btn-outline-danger me-auto" onclick="eliminaRecord('${jsq(mezzo)}',${id})"><i class="fas fa-trash me-1"></i>Elimina</button><button class="btn btn-outline-secondary" onclick="stampaModuloRecord('${jsq(mezzo)}',${id})"><i class="fas fa-print me-1"></i>Stampa modulo</button><button class="btn btn-primary fw-bold" onclick="modificaRecord('${jsq(mezzo)}',${id})"><i class="fas fa-pen me-1"></i>Modifica</button>`});
}
const REC_FIELDS = [
  ['dataSegnalazione', 'Data segnalazione', 'text', 4], ['operatoreSegnalazione', 'Operatore segnalazione', 'op', 4], ['km', 'Km', 'number', 4],
  ['categoria', 'Categoria', 'cat', 6], ['type', 'Tipo', 'type', 6], ['problema', 'Problema', 'area', 12],
  ['dataIngresso', 'Data ingresso officina', 'text', 4], ['officina', 'Officina', 'off', 4], ['operatoreConsegna', 'Portato da', 'op', 4],
  ['dataChiusura', 'Data chiusura', 'text', 4], ['operatoreRitiro', 'Ritirato da', 'op', 4], ['kmRitiro', 'Km ritiro', 'number', 4],
  ['intervento', 'Intervento eseguito', 'area', 12], ['costo', 'Costo (€)', 'number', 4], ['documento', 'N. fattura / documento', 'text', 4]
];
async function modificaRecord(mezzo, id) {
  const r = getRec(mezzo, id); if (!r) return;
  if (!await Admin.require('Modifica storico protetta')) return;
  const inp = ([k, l, t, w]) => {
    const val = r[k] ?? ''; const id2 = 'mr-' + k;
    const ctl = t === 'area' ? `<textarea class="form-control" id="${id2}" rows="3">${esc(val)}</textarea>`
      : t === 'cat' ? `<select class="form-select" id="${id2}">${catOptions(val || 'Altro')}</select>`
      : t === 'type' ? `<select class="form-select" id="${id2}">${[['', 'Riparazione'], ['guasto', 'Riparazione (guasto)'], ['manutenzione', 'Manutenzione programmata'], ['gomme', 'Gomme']].map(([a, b]) => `<option value="${a}" ${(r.type || '') === a ? 'selected' : ''}>${b}</option>`).join('')}</select>`
      : `<input class="form-control" id="${id2}" type="${t === 'number' ? 'number' : 'text'}" ${t === 'number' ? 'step="any"' : ''} value="${escA(val)}">`;
    return `<div class="col-md-${w}">${t === 'op' ? fieldOp(id2, l, val) : t === 'off' ? fieldOff(id2, l, val) : `<label class="lbl">${l}</label>${ctl}`}</div>`;
  };
  bootstrap.Modal.getInstance($('#rec-modal'))?.hide();
  const m = openModal({title:`<i class="fas fa-pen me-2"></i>Modifica intervento · ${esc(mezzo)}`, color:'cyan', size:'modal-xl',
    body:`<div class="alert alert-light border small py-2"><i class="fas fa-info-circle me-1"></i>Le date possono essere scritte come gg/mm/aaaa oppure gg/mm/aaaa hh:mm. Ogni modifica viene registrata con il tuo nome (${esc(who())}).</div>
      <div class="row g-2"><div class="col-md-4"><label class="lbl">Veicolo</label><select class="form-select" id="mr-mezzo">${vehOptions(mezzo, true)}</select></div>${REC_FIELDS.map(inp).join('')}</div>`,
    footer:`<button class="btn btn-light" data-bs-dismiss="modal">Annulla</button><button class="btn btn-info text-white fw-bold" id="mr-ok">Salva modifiche</button>`});
  $('#mr-ok', m.el).onclick = () => {
    const vals = {}; const labels = {};
    REC_FIELDS.forEach(([k, l, t]) => { let x = v('mr-' + k, m.el); if (t === 'off') x = canonOfficina(x); if (k === 'costo') x = x === '' ? '' : num(x); vals[k] = x; labels[k] = l; });
    if (vals.type === '' && r.type === undefined) delete vals.type;
    if (vals.costo === '' && r.costo === undefined) delete vals.costo;
    if (vals.documento === '' && r.documento === undefined) delete vals.documento;
    if (vals.kmRitiro === '' && r.kmRitiro === undefined) delete vals.kmRitiro;
    const ch = applyChanges(r, vals, labels);
    const nm = v('mr-mezzo', m.el);
    if (nm !== mezzo) {
      DB.flotta[mezzo] = DB.flotta[mezzo].filter(x => x.id !== r.id); r.mezzo = nm; if (r.veicolo) r.veicolo = nm;
      (DB.flotta[nm] = DB.flotta[nm] || []).push(r);
      r.modifiche = r.modifiche || []; r.modifiche.push({ts:nowTS(), by:who(), campi:[{campo:'Veicolo', da:mezzo, a:nm}]}); ch.push({campo:'Veicolo', da:mezzo, a:nm});
    }
    if (ch.length) { logA('Modifica storico', `${nm} ${fmtD(recDate(r))}: ${changesText(ch)}`, {tipo:'storico', id:r.id, mezzo:nm}); Store.save('flotta'); toast('Intervento aggiornato', 'ok'); }
    m.close(); setTimeout(() => openRecord(nm, r.id), 350);
  };
}
async function eliminaRecord(mezzo, id) {
  const r = getRec(mezzo, id); if (!r) return;
  if (!await Admin.require('Eliminazione protetta')) return;
  if (!await confirmDlg(`Eliminare l'intervento di ${esc(mezzo)} del ${fmtD(recDate(r))}?\n"${esc((r.problema || '').slice(0, 120))}"\n\nResterà nel cestino e potrà essere ripristinato dall'area Admin.`, {danger:true, ok:'Sposta nel cestino'})) return;
  toTrash('intervento storico', r, {mezzo});
  DB.flotta[mezzo] = DB.flotta[mezzo].filter(x => x.id !== id); storSel.delete(id);
  logA('Eliminazione', `Intervento storico ${mezzo} ${fmtD(recDate(r))} spostato nel cestino: ${(r.problema || '').slice(0, 100)}`, {tipo:'storico', id, mezzo});
  Store.save('flotta'); bootstrap.Modal.getInstance($('#rec-modal'))?.hide();
}
function aggiungiVecchio(mezzo) {
  const m = openModal({title:'<i class="fas fa-history me-2"></i>Inserisci vecchio intervento', color:'green', size:'modal-lg',
    body:`<div class="row g-2">
      <div class="col-md-6"><label class="lbl">Veicolo</label><select class="form-select fw-bold" id="ov-m">${vehOptions(mezzo || SF.veicolo, true)}</select></div>
      <div class="col-md-3"><label class="lbl req">Data guasto</label><input type="date" class="form-control" id="ov-da"></div>
      <div class="col-md-3"><label class="lbl">Km</label><input type="number" class="form-control" id="ov-km"></div>
      <div class="col-md-6"><label class="lbl">Categoria</label><select class="form-select" id="ov-cat">${catOptions('Meccanica')}</select></div>
      <div class="col-md-6"><label class="lbl">Tipo</label><select class="form-select" id="ov-type"><option value="">Riparazione</option><option value="manutenzione">Manutenzione programmata</option><option value="gomme">Gomme</option></select></div>
      <div class="col-12">${fieldOp('ov-op', 'Operatore', '')}</div>
      <div class="col-12"><label class="lbl req">Problema</label><textarea class="form-control" id="ov-pb" rows="2"></textarea></div>
      <div class="col-md-6">${fieldOff('ov-off', 'Officina', '')}</div>
      <div class="col-md-3"><label class="lbl">Data chiusura</label><input type="date" class="form-control" id="ov-dc"></div>
      <div class="col-md-3"><label class="lbl">Costo (€)</label><input type="number" step="0.01" class="form-control" id="ov-c"></div>
      <div class="col-12"><label class="lbl">Lavori eseguiti</label><textarea class="form-control" id="ov-iv" rows="2"></textarea></div></div>`,
    footer:`<button class="btn btn-light" data-bs-dismiss="modal">Annulla</button><button class="btn btn-success fw-bold" id="ov-ok"><i class="fas fa-save me-1"></i>Salva</button>`});
  $('#ov-ok', m.el).onclick = () => {
    const mz = v('ov-m', m.el), da = v('ov-da', m.el), pb = v('ov-pb', m.el);
    if (!da || !pb) { toast('Inserisci data e problema', 'warn'); return; }
    const dc = v('ov-dc', m.el) || da; const op = v('ov-op', m.el) || 'Archivio';
    const rec = {id:uid(), veicolo:mz, mezzo:mz, dataSegnalazione:fmtD(da), km:v('ov-km', m.el), categoria:v('ov-cat', m.el), operatoreSegnalazione:op, problema:pb, stato:'Concluso',
      officina:canonOfficina(v('ov-off', m.el)), dataIngresso:fmtD(da), operatoreConsegna:'Archivio', dataChiusura:fmtD(dc), intervento:v('ov-iv', m.el) || 'Archiviato', operatoreRitiro:'Archivio', creatoDa:who(), creatoIl:nowTS(), inseritoAPosteriori:true};
    if (v('ov-type', m.el)) rec.type = v('ov-type', m.el);
    const c = num(v('ov-c', m.el)); if (c !== null) rec.costo = c;
    (DB.flotta[mz] = DB.flotta[mz] || []).push(rec);
    logA('Storico', `Inserito vecchio intervento ${mz} del ${fmtD(da)}: ${pb.slice(0, 80)}`, {tipo:'storico', id:rec.id, mezzo:mz});
    Store.save('flotta'); m.close(); toast('Intervento aggiunto allo storico', 'ok');
  };
}

/* --- report --- */
function reportStampa() {
  const rs = selectedRecords(); if (!rs.length) { toast('Nessun intervento', 'warn'); return; }
  $('#rep-ente').textContent = SET().nomeEnte; $('#rep-veicolo').textContent = storSel.size ? 'Selezione manuale' : filterDesc();
  $('#rep-data').textContent = fmtDT(new Date()); $('#rep-totale').textContent = rs.length; $('#rep-by').textContent = who();
  $('#rep-body').innerHTML = rs.map(r => `<tr><td>${fmtD(r._d)}</td><td><b>${esc(r._m)}</b></td><td>${esc(r.categoria || '')}</td><td>${esc(r.problema)}${r.km ? `<br><small>Km: ${esc(r.km)}</small>` : ''}</td><td>${esc(r.officina || '')}</td><td>${esc(r.intervento || '')}${r.costo ? `<br><b>${eur(r.costo)}</b>` : ''}</td></tr>`).join('');
  logA('Report', `Report stampato (${rs.length} interventi): ${filterDesc()}`); printMode('print-report');
}
async function reportPDF() {
  const rs = selectedRecords(); if (!rs.length) { toast('Nessun intervento', 'warn'); return; }
  try {
    await loadPDF(); const {jsPDF} = window.jspdf; const doc = new jsPDF('landscape', 'mm', 'a4');
    doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 85, 165); doc.text(SET().nomeEnte, 148, 15, {align:'center'});
    doc.setFontSize(11); doc.setFont('helvetica', 'normal'); doc.setTextColor(80); doc.text('Report storico manutenzioni', 148, 22, {align:'center'});
    doc.setFontSize(8.5); doc.text(`Filtro: ${storSel.size ? 'selezione manuale' : filterDesc()}  ·  Interventi: ${rs.length}  ·  Generato il ${fmtDT(new Date())} da ${who()}`, 14, 30);
    doc.autoTable({startY:34, head:[['Data', 'Veicolo', 'Categoria', 'Problema', 'Officina', 'Intervento', 'Km', 'Costo']],
      body:rs.map(r => [fmtD(r._d), r._m, r.categoria || '', r.problema || '', r.officina || '', r.intervento || '', r.km || '', r.costo ? eur(r.costo) : '']),
      theme:'grid', headStyles:{fillColor:[0, 85, 165], fontSize:8.5}, bodyStyles:{fontSize:7.5, cellPadding:2}, columnStyles:{0:{cellWidth:20}, 1:{cellWidth:20, fontStyle:'bold'}, 2:{cellWidth:22}, 3:{cellWidth:65}, 4:{cellWidth:30}, 5:{cellWidth:70}, 6:{cellWidth:16}, 7:{cellWidth:20}}, alternateRowStyles:{fillColor:[245, 247, 250]}, margin:{left:14, right:14}});
    doc.save(`Storico_118_${new Date().toISOString().slice(0, 10)}.pdf`); logA('Report', `PDF storico (${rs.length} interventi)`);
  } catch (e) { toast('Errore PDF: ' + esc(e.message), 'err'); }
}
function reportExcel() {
  const rs = selectedRecords(); if (!rs.length) { toast('Nessun intervento', 'warn'); return; }
  exportExcel([{name:'Storico manutenzioni', head:['Data', 'Veicolo', 'Targa', 'Tipo', 'Categoria', 'Km', 'Problema', 'Operatore segnalazione', 'Data segnalazione', 'Officina', 'Data ingresso', 'Portato da', 'Data chiusura', 'Ritirato da', 'Intervento', 'Giorni fermo', 'Costo €', 'Documento'],
    rows:rs.map(r => [fmtD(r._d), r._m, targa(r._m), recTipo(r), r.categoria || '', num(r.km) ?? '', r.problema || '', r.operatoreSegnalazione || '', r.dataSegnalazione || '', r.officina || '', r.dataIngresso || '', r.operatoreConsegna || '', r.dataChiusura || '', r.operatoreRitiro || '', r.intervento || '', fermoGiorni(r) ?? '', num(r.costo) ?? '', r.documento || ''])}],
    `Storico_Manutenzioni_118_${todayISO()}.xlsx`);
  logA('Report', `Excel storico (${rs.length} interventi)`);
}

/* --- scheda veicolo --- */
function apriStorico(n) {
  const st = vehState(n), ck = currentKm(n), vh = veh(n);
  const recs = (DB.flotta[n] || []).slice().sort((a, b) => (recDate(b) || 0) - (recDate(a) || 0));
  const w = lastWash(n); const pl = DB.plans.filter(p => p.mezzo === n && p.attivo !== false).map(p => ({p, s:planStatus(p)}));
  const cost = recs.reduce((s, r) => s + (num(r.costo) || 0), 0);
  const open = DB.tickets.filter(t => t.mezzo === n);
  openModal({id:'veh-modal', title:`<i class="fas ${vehIcon(n)} me-2"></i>${esc(n)} <span class="badge bg-light text-dark ms-1 mono">${esc(vh.targa || '')}</span> <span class="vstate ${st.c} ms-2 mt-0">${st.l}</span>`, color:'dark', size:'modal-xl',
    body:`<div class="minis mb-3"><div class="mini"><div class="v">${ck.km !== null ? ck.km.toLocaleString('it-IT') : '–'}</div><div class="t">Km attuali</div></div><div class="mini"><div class="v">${recs.length}</div><div class="t">Interventi</div></div><div class="mini"><div class="v">${w ? daysDiff(w.timestamp, new Date()) + ' gg' : '–'}</div><div class="t">Ultimo lavaggio</div></div><div class="mini"><div class="v">${cost ? eur(cost) : '–'}</div><div class="t">Costi registrati</div></div></div>
      ${[vh.modello && 'Modello: ' + vh.modello, vh.immatricolazione && 'Immatricolazione: ' + vh.immatricolazione, vh.telaio && 'Telaio: ' + vh.telaio, vh.note].filter(Boolean).length ? `<div class="small text-muted mb-3">${[vh.modello && 'Modello: <b>' + esc(vh.modello) + '</b>', vh.immatricolazione && 'Immatricolazione: <b>' + esc(vh.immatricolazione) + '</b>', vh.telaio && 'Telaio: <b>' + esc(vh.telaio) + '</b>', vh.note && esc(vh.note)].filter(Boolean).join(' · ')}</div>` : ''}
      ${open.length ? `<div class="sec-title">In corso</div>${open.map(t => `<div class="tk ${t.stato === 'in_officina' ? 'officina' : ''}" style="cursor:pointer" onclick="Scheda.open(${t.id})"><b>${esc(t.problema.slice(0, 140))}</b><div class="small text-muted">${esc(t.dataSegnalazione)} · ${t.stato === 'in_officina' ? 'in officina ' + esc(t.officina) : 'in attesa'}</div>${miniSteps(t)}</div>`).join('')}` : ''}
      ${pl.length ? `<div class="sec-title">Manutenzione programmata</div><div class="d-flex flex-wrap gap-2 mb-2">${pl.map(({p, s}) => `<span class="pstat ${s.stato}" onclick="dettaglioPiano(${p.id})">${esc(p.nome)}<small>${PSTAT_L[s.stato]} · ${esc(pstatText(s))}</small></span>`).join('')}</div>` : ''}
      <div class="sec-title">Storico interventi (${recs.length})</div>
      <div class="tbl-wrap" style="max-height:45vh"><table class="tbl"><thead><tr><th>Data</th><th>Tipo</th><th>Problema</th><th>Officina</th><th>Intervento</th><th>Km</th></tr></thead><tbody>
      ${recs.map(r => `<tr class="clk" onclick="openRecord('${jsq(n)}',${r.id})"><td class="nowrap">${fmtD(recDate(r))}</td><td>${catPill(r.categoria)}</td><td class="cell-clip">${esc(r.problema)}</td><td>${esc(r.officina || '')}</td><td class="cell-clip text-success">${esc(r.intervento || '')}</td><td class="mono small">${esc(r.km || '')}</td></tr>`).join('') || '<tr><td colspan="6" class="text-center text-muted p-3">Nessun intervento</td></tr>'}
      </tbody></table></div>`,
    footer:`<button class="btn btn-outline-primary" onclick="modalKm('${jsq(n)}')"><i class="fas fa-tachometer-alt me-1"></i>Km</button><button class="btn btn-outline-info" onclick="modalLavaggio('${jsq(n)}')"><i class="fas fa-shower me-1"></i>Lavaggio</button><button class="btn btn-outline-secondary" onclick="modalGomme('${jsq(n)}')"><i class="fas fa-compact-disc me-1"></i>Gomme</button><button class="btn btn-outline-success" onclick="aggiungiVecchio('${jsq(n)}')"><i class="fas fa-plus me-1"></i>Vecchio intervento</button>
      <button class="btn btn-dark ms-auto" onclick="bootstrap.Modal.getInstance(document.getElementById('veh-modal')).hide();Object.assign(SF,{veicolo:'${jsq(n)}',tab:'lista'});App.go('storico')"><i class="fas fa-history me-1"></i>Storico completo</button><button class="btn btn-warning fw-bold" onclick="nuovaSegnalazioneVeicolo('${jsq(n)}')"><i class="fas fa-exclamation-triangle me-1"></i>Segnala guasto</button>`});
}
function nuovaSegnalazioneVeicolo(n) { nuovoIntervento(n); }

/* --- registro attività --- */
function renderLog(boxId) {
  if (boxId) LF.box = boxId; const box = document.getElementById(LF.box || 'log-box'); if (!box) return;
  const people = [...new Set(DB.log.map(l => l.by))].sort(); const acts = [...new Set(DB.log.map(l => l.a))].sort();
  const q = norm(LF.testo);
  const ls = DB.log.filter(l => (!LF.by || l.by === LF.by) && (!LF.a || l.a === LF.a) && (!q || norm(`${l.by} ${l.a} ${l.d}`).includes(q)));
  box.innerHTML = `<div class="card-x"><div class="fbar">
      <div class="f grow"><span class="lbl">Cerca</span><input class="form-control" id="lf-q" value="${escA(LF.testo)}" placeholder="testo, veicolo…"></div>
      <div class="f"><span class="lbl">Operatore</span><select class="form-select" id="lf-by"><option value="">Tutti</option>${people.map(p => `<option ${LF.by === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></div>
      <div class="f"><span class="lbl">Azione</span><select class="form-select" id="lf-a"><option value="">Tutte</option>${acts.map(p => `<option ${LF.a === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></div>
      <div class="f" style="min-width:auto"><span class="lbl">&nbsp;</span><button class="btn btn-sm btn-outline-success" onclick="exportLog()"><i class="fas fa-file-excel me-1"></i>Excel</button></div></div>
    <div class="px-3 py-2 small text-muted border-bottom">${ls.length} operazioni registrate${DB.log.length ? ' · dal ' + fmtD(DB.log[DB.log.length - 1].ts) : ''}. Ogni azione salva nome dell'operatore attivo, data/ora e dispositivo.</div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Quando</th><th>Chi</th><th>Azione</th><th>Dettagli</th><th>Dispositivo</th></tr></thead><tbody>
    ${ls.slice(0, LF.limit).map(l => `<tr ${l.ref && l.ref.tipo === 'storico' ? `class="clk" onclick="openRecord('${jsq(l.ref.mezzo)}',${l.ref.id})"` : l.ref && l.ref.tipo === 'ticket' && findTicket(l.ref.id) ? `class="clk" onclick="Scheda.open(${l.ref.id})"` : ''}><td class="nowrap small">${fmtDT(l.ts)}</td><td class="fw-bold nowrap">${esc(l.by)}</td><td><span class="pill pill-blue">${esc(l.a)}</span></td><td class="small">${esc(l.d)}</td><td class="small text-muted mono">${esc(l.dev || '')}</td></tr>`).join('') || '<tr><td colspan="5"><div class="empty"><i class="fas fa-user-clock"></i>Il registro si riempirà con le operazioni fatte da questa versione in poi.<br><small>Per gli interventi precedenti i nomi degli operatori restano visibili nello storico.</small></div></td></tr>'}
    </tbody></table>${ls.length > LF.limit ? `<div class="text-center p-3"><button class="btn btn-sm btn-outline-primary" onclick="LF.limit+=500;renderLog()">Mostra altri</button></div>` : ''}</div></div>`;
  $('#lf-q', box).oninput = debounce(e => { LF.testo = e.target.value; renderLog(); const q = $('#lf-q', document.getElementById(LF.box)); q.focus(); q.setSelectionRange(99, 99); }, 300);
  $('#lf-by', box).onchange = e => { LF.by = e.target.value; renderLog(); };
  $('#lf-a', box).onchange = e => { LF.a = e.target.value; renderLog(); };
}
function exportLog() { exportExcel([{name:'Registro attività', head:['Data/ora', 'Operatore', 'Azione', 'Dettagli', 'Dispositivo'], rows:DB.log.map(l => [fmtDT(l.ts), l.by, l.a, l.d, l.dev || ''])}], `Registro_attivita_118_${todayISO()}.xlsx`); }
