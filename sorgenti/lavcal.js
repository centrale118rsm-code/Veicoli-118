'use strict';
/* =====================================================================
   LAVAGGI e CALENDARIO
   ===================================================================== */
const LVF = {veicolo:'', mese:'', anno:'', tipo:''};
function washDate(w) { return w.timestamp ? new Date(w.timestamp) : parseDate(w.data); }
function lastWash(n) { return DB.wash.filter(w => w.mezzo === n).sort((a, b) => (washDate(b) || 0) - (washDate(a) || 0))[0] || null; }
function washAge(n) { const w = lastWash(n); return w ? daysDiff(washDate(w), new Date()) : null; }

function modalLavaggio(mezzo) {
  const now = new Date();
  const m = openModal({title:'<i class="fas fa-shower me-2"></i>Registrazione lavaggio', color:'cyan',
    body:`<div class="row g-2"><div class="col-12"><label class="lbl">Veicolo</label><select class="form-select fw-bold" id="lv-m">${vehOptions(mezzo || '')}</select><div class="small text-muted mt-1" id="lv-last"></div></div>
      <div class="col-6"><label class="lbl req">Data</label><input type="date" class="form-control" id="lv-d" value="${isoD(now)}"></div>
      <div class="col-6"><label class="lbl">Ora</label><input type="time" class="form-control" id="lv-h" value="${hhmm(now)}"></div>
      <div class="col-12"><label class="lbl">Tipo</label><div class="chips" id="lv-tipi">${(CFG().tipiLavaggio || []).map((t, i) => `<span class="chip ${t === 'Completo' || (i === 0 && !CFG().tipiLavaggio.includes('Completo')) ? 'on' : ''}" data-t="${escA(t)}">${esc(t)}</span>`).join('')}</div></div>
      <div class="col-12">${fieldOp('lv-op', 'Operatore', currentOp(), true)}</div>
      <div class="col-12"><label class="lbl">Note</label><textarea class="form-control" id="lv-n" rows="2"></textarea></div></div>`,
    footer:`<button class="btn btn-outline-dark me-auto" onclick="$$('.modal.show').forEach(x=>bootstrap.Modal.getInstance(x)?.hide());App.go('lavaggi')"><i class="fas fa-history me-1"></i>Storico</button><button class="btn btn-light" data-bs-dismiss="modal">Annulla</button><button class="btn btn-info text-white fw-bold" id="lv-ok">Registra</button>`});
  const upd = () => { const w = lastWash(v('lv-m', m.el)); $('#lv-last', m.el).innerHTML = w ? `Ultimo lavaggio: <b>${esc(w.data)}</b> (${esc(w.tipo)}, ${esc(w.operatore)})` : 'Nessun lavaggio registrato'; };
  $('#lv-m', m.el).onchange = upd; upd();
  $('#lv-tipi', m.el).onclick = e => { const c = e.target.closest('[data-t]'); if (!c) return; $$('[data-t]', m.el).forEach(x => x.classList.toggle('on', x === c)); };
  $('#lv-ok', m.el).onclick = () => {
    const mz = v('lv-m', m.el), d = v('lv-d', m.el), h = v('lv-h', m.el) || '00:00', op = v('lv-op', m.el);
    const tp = ($('[data-t].on', m.el) || {}).dataset?.t || 'Completo';
    if (!d || !op) { toast('Inserire data e operatore', 'warn'); return; }
    const w = {id:uid(), mezzo:mz, data:fromInputs(d, h), timestamp:parseDate(d + 'T' + h).getTime(), tipo:tp, operatore:op, note:v('lv-n', m.el) || '-', creatoDa:who(), creatoIl:nowTS()};
    DB.wash.push(w); logA('Lavaggio', `${mz}: ${tp} (${op})`);
    Store.save('wash'); m.close(); toast(`Lavaggio ${esc(mz)} registrato`, 'ok');
  };
}
function filteredWash() {
  return DB.wash.filter(w => { const d = washDate(w); return (!LVF.veicolo || w.mezzo === LVF.veicolo) && (!LVF.tipo || w.tipo === LVF.tipo) && (!LVF.mese || (d && d.getMonth() + 1 === +LVF.mese)) && (!LVF.anno || (d && d.getFullYear() === +LVF.anno)); })
    .sort((a, b) => (washDate(b) || 0) - (washDate(a) || 0));
}
function renderLavaggi() {
  const el = $('#view-lavaggi'); const soglia = SET().sogliaLavaggio;
  const years = [...new Set(DB.wash.map(w => washDate(w)?.getFullYear()).filter(Boolean))].sort((a, b) => b - a);
  const f = filteredWash(); const tipi = CFG().tipiLavaggio || [];
  el.innerHTML = `
    <div class="view-title"><h2><i class="fas fa-shower text-info me-2"></i>Lavaggi</h2><span class="sub">Avviso se un mezzo non viene lavato da più di ${soglia} giorni</span>
      <div class="actions"><button class="btn btn-sm btn-info text-white fw-bold" onclick="modalLavaggio()"><i class="fas fa-plus me-1"></i>Registra lavaggio</button></div></div>
    <div class="fleet">${vehicles().map(vh => { const a = washAge(vh.nome); const w = lastWash(vh.nome);
      return `<div class="vcard ${vehClass(vh.nome)}" onclick="modalLavaggio('${jsq(vh.nome)}')"><div class="top"><div class="vic"><i class="fas fa-shower"></i></div><div><div class="nm">${esc(vh.nome)}</div><div class="ty">${w ? esc(w.tipo) + ' · ' + esc(w.operatore) : 'mai registrato'}</div></div></div>
        <div class="vmeta"><span class="${a === null || a > soglia ? 'warn' : a > soglia * .75 ? 'amb' : 'ok'}"><i class="fas ${a === null || a > soglia ? 'fa-exclamation-triangle' : 'fa-check'}"></i>${a === null ? 'Mai lavato' : a === 0 ? 'Lavato oggi' : `Lavato ${a} gg fa`}</span><span><i class="far fa-calendar"></i>${w ? esc(w.data) : '–'}</span></div></div>`; }).join('')}</div>
    <div class="card-x"><div class="fbar">
      <div class="f"><span class="lbl">Veicolo</span><select class="form-select" id="lvf-v"><option value="">Tutti</option>${vehNames(true).map(n => `<option ${LVF.veicolo === n ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
      <div class="f"><span class="lbl">Tipo</span><select class="form-select" id="lvf-t"><option value="">Tutti</option>${tipi.map(n => `<option ${LVF.tipo === n ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
      <div class="f"><span class="lbl">Mese</span><select class="form-select" id="lvf-m"><option value="">Tutti</option>${MONTHS.map((n, i) => `<option value="${i + 1}" ${+LVF.mese === i + 1 ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <div class="f"><span class="lbl">Anno</span><select class="form-select" id="lvf-a"><option value="">Tutti</option>${years.map(n => `<option ${+LVF.anno === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <div class="f ms-auto" style="min-width:auto"><span class="lbl">&nbsp;</span><div class="d-flex gap-1"><button class="btn btn-sm btn-light border" onclick="Object.assign(LVF,{veicolo:'',mese:'',anno:'',tipo:''});renderLavaggi()"><i class="fas fa-undo"></i></button><button class="btn btn-sm btn-outline-primary" onclick="stampaLavaggi()"><i class="fas fa-print me-1"></i>Stampa</button><button class="btn btn-sm btn-outline-danger" onclick="pdfLavaggi()"><i class="fas fa-file-pdf me-1"></i>PDF</button><button class="btn btn-sm btn-outline-success" onclick="excelLavaggi()"><i class="fas fa-file-excel me-1"></i>Excel</button></div></div></div>
      <div class="p-3 border-bottom"><div class="minis"><div class="mini"><div class="v">${f.length}</div><div class="t">Totali</div></div>${tipi.map(t => `<div class="mini"><div class="v">${f.filter(w => w.tipo === t).length}</div><div class="t">${esc(t)}</div></div>`).join('')}${vehNames(true).map(n => `<div class="mini"><div class="v">${f.filter(w => w.mezzo === n).length}</div><div class="t">${esc(n)}</div></div>`).join('')}</div></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>Data</th><th>Veicolo</th><th>Tipo</th><th>Operatore</th><th>Note</th><th></th></tr></thead><tbody>
      ${f.map((w, i) => `<tr><td class="text-muted small">${f.length - i}</td><td class="fw-bold nowrap">${esc(w.data)}</td><td class="fw-bold text-primary nowrap">${esc(w.mezzo)}</td><td><span class="pill ${({Esterno:'pill-blue', Interno:'pill-amber', Completo:'pill-green', Sanificazione:'pill-red'})[w.tipo] || 'pill-cyan'}">${esc(w.tipo)}</span></td><td>${esc(w.operatore)}${w.creatoDa && w.creatoDa !== w.operatore ? `<div class="small text-muted">ins. ${esc(w.creatoDa)}</div>` : ''}</td><td class="small text-muted"><em>${esc(w.note)}</em></td><td class="text-end"><button class="btn btn-sm btn-outline-danger border-0" onclick="eliminaLavaggio(${w.id})" title="Elimina"><i class="fas fa-trash"></i></button></td></tr>`).join('') || '<tr><td colspan="7"><div class="empty"><i class="fas fa-shower"></i>Nessun lavaggio trovato</div></td></tr>'}
      </tbody></table></div></div>`;
  [['lvf-v', 'veicolo'], ['lvf-t', 'tipo'], ['lvf-m', 'mese'], ['lvf-a', 'anno']].forEach(([id, k]) => $('#' + id).onchange = e => { LVF[k] = e.target.value; renderLavaggi(); });
}
async function eliminaLavaggio(id) {
  const w = DB.wash.find(x => x.id === id); if (!w) return;
  if (!await Admin.require('Eliminazione protetta')) return;
  if (!await confirmDlg(`Eliminare il lavaggio ${esc(w.mezzo)} del ${esc(w.data)}?\nResterà nel cestino.`, {danger:true})) return;
  toTrash('lavaggio', w, {mezzo:w.mezzo}); DB.wash = DB.wash.filter(x => x.id !== id);
  logA('Eliminazione', `Lavaggio ${w.mezzo} del ${w.data} spostato nel cestino`); Store.save('wash');
}
function lavDesc() { return [LVF.veicolo, LVF.tipo, LVF.mese && MONTHS[LVF.mese - 1], LVF.anno].filter(Boolean).join(' - ') || 'Tutti i veicoli - Tutti i periodi'; }
function stampaLavaggi() {
  const f = filteredWash(); if (!f.length) { toast('Nessun lavaggio', 'warn'); return; }
  const h = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Lavaggi 118</title><style>body{font-family:Arial;margin:20px}h1{color:#0055a5;font-size:20px;text-align:center}h2{color:#555;font-size:13px;text-align:center;font-weight:normal}table{width:100%;border-collapse:collapse;font-size:11px}th{background:#0055a5;color:#fff;padding:8px}td{padding:6px;border-bottom:1px solid #ddd}tr:nth-child(even){background:#f5f7fa}@media print{@page{margin:1cm;size:A4 landscape}}</style></head><body><h1>${esc(SET().nomeEnte)}</h1><h2>Storico Lavaggi - ${esc(lavDesc())}</h2><p style="font-size:10px;color:#666">Data: ${fmtDT(new Date())} | Totale: ${f.length} | Stampato da: ${esc(who())}</p><table><tr><th>#</th><th>Data</th><th>Veicolo</th><th>Tipo</th><th>Operatore</th><th>Note</th></tr>${f.map((w, i) => `<tr><td>${i + 1}</td><td>${esc(w.data)}</td><td><strong>${esc(w.mezzo)}</strong></td><td>${esc(w.tipo)}</td><td>${esc(w.operatore)}</td><td><em>${esc(w.note)}</em></td></tr>`).join('')}</table></body></html>`;
  const pw = window.open('', '_blank'); if (!pw) { toast('Consenti i popup per stampare', 'warn'); return; } pw.document.write(h); pw.document.close(); setTimeout(() => pw.print(), 500);
}
async function pdfLavaggi() {
  const f = filteredWash(); if (!f.length) { toast('Nessun lavaggio', 'warn'); return; }
  try {
    await loadPDF(); const {jsPDF} = window.jspdf, doc = new jsPDF('landscape', 'mm', 'a4');
    doc.setFontSize(18); doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 85, 165); doc.text(SET().nomeEnte, 148, 18, {align:'center'});
    doc.setFontSize(12); doc.setFont('helvetica', 'normal'); doc.setTextColor(80); doc.text('Storico Lavaggi Veicoli', 148, 26, {align:'center'});
    doc.setFontSize(9); doc.text(`Filtro: ${lavDesc()}`, 14, 34); doc.text(`Data: ${fmtDT(new Date())} | Tot: ${f.length} | ${who()}`, 14, 39);
    doc.autoTable({startY:44, head:[['#', 'Data', 'Veicolo', 'Tipo', 'Operatore', 'Note']], body:f.map((w, i) => [i + 1, w.data, w.mezzo, w.tipo, w.operatore, w.note || '-']), theme:'grid', headStyles:{fillColor:[0, 85, 165], fontSize:9}, bodyStyles:{fontSize:8, cellPadding:3}, alternateRowStyles:{fillColor:[245, 247, 250]}, margin:{left:14, right:14}});
    doc.save(`Lavaggi_118_${lavDesc().replace(/[^a-zA-Z0-9]/g, '_')}_${todayISO()}.pdf`);
  } catch (e) { toast('Errore PDF: ' + esc(e.message), 'err'); }
}
function excelLavaggi() { exportExcel([{name:'Lavaggi', head:['Data', 'Veicolo', 'Tipo', 'Operatore', 'Note', 'Inserito da'], rows:filteredWash().map(w => [w.data, w.mezzo, w.tipo, w.operatore, w.note, w.creatoDa || ''])}], `Lavaggi_118_${todayISO()}.xlsx`); }

/* =================== CALENDARIO =================== */
const CAL = {m:new Date().getMonth(), y:new Date().getFullYear(), f:new Set(['segn', 'app', 'off', 'rit', 'ok', 'nota', 'lavp', 'scad'])};
const CAL_TYPES = [['segn', 'Segnalazione', 'ce-segn'], ['app', 'Appuntamento', 'ce-app'], ['off', 'In officina', 'ce-off'], ['rit', 'Ritiro previsto', 'ce-rit'], ['ok', 'Concluso', 'ce-ok'], ['nota', 'Note', 'ce-nota'], ['scad', 'Scadenze manutenzione', 'ce-scad'], ['lav', 'Lavaggi', 'ce-lav'], ['lavp', 'Lavaggio periodico', 'ce-lavp']];
function isWashRelated(r) { const p = (r.problema || '').toLowerCase(); return r.type === 'lavaggio' || p.includes('lavaggio') || p.includes('sanificazione'); }
function buildCalIndex(y, m) {
  const idx = {}; const add = (iso, e) => { if (!iso) return; (idx[iso] = idx[iso] || []).push(e); };
  const inMonth = iso => iso && iso.startsWith(`${y}-${pad(m + 1)}`);
  const today = dayStart(new Date());
  DB.tickets.forEach(t => {
    if (isWashRelated(t)) return; const s = short(t.mezzo);
    if (t.stato === 'segnalato') add(isoD(t.dataSegnalazione), {k:'segn', c:'ce-segn', h:`<i class="fas fa-exclamation-circle"></i> ${esc(s)}`, go:`Scheda.open(${t.id})`, tip:t.problema});
    if (t.stato === 'segnalato' && t.dataAppuntamento) add(t.dataAppuntamento, {k:'app', c:'ce-app', h:`<i class="fas fa-clock"></i> ${esc(t.dataAppuntamentoOra || '')} ${esc(s)}`, go:`Scheda.open(${t.id},1)`, tip:`${t.officinaAppuntamento}: ${t.problema}`});
    if (t.stato === 'in_officina') {
      const io = dayStart(t.dataIngresso);
      if (io) for (let d = new Date(Math.max(io, new Date(y, m, 1))); d <= today && d.getMonth() === m; d.setDate(d.getDate() + 1)) add(isoD(d), {k:'off', c:'ce-off', h:`<i class="fas fa-wrench"></i> ${esc(s)}`, go:`Scheda.open(${t.id},3)`, tip:`${t.officina}: ${t.problema}`});
      if (t.dataStimataConsegna) add(t.dataStimataConsegna, {k:'rit', c:'ce-rit', h:`<i class="fas fa-check-circle"></i> RIT:${esc(s)}`, go:`Scheda.open(${t.id},4)`, tip:`Ritiro da ${t.officina}`});
    }
  });
  Object.entries(DB.flotta).forEach(([vn, arr]) => (arr || []).forEach(r => { if (isWashRelated(r)) return; const iso = isoD(r.dataChiusura); if (inMonth(iso)) add(iso, {k:'ok', c:'ce-ok', h:`OK:${esc(short(vn))}`, go:`openRecord('${jsq(vn)}',${r.id})`, tip:`${r.problema} → ${r.intervento}`}); }));
  DB.notes.forEach(n => { if (inMonth(n.date)) add(n.date, {k:'nota', c:'ce-nota', h:`<i class="fas fa-sticky-note me-1"></i>${esc(n.text)}`, go:`apriGiorno('${n.date}')`, tip:n.text}); });
  DB.wash.forEach(w => { const iso = isoD(washDate(w)); if (inMonth(iso)) add(iso, {k:'lav', c:'ce-lav', h:`<i class="fas fa-shower"></i> ${esc(short(w.mezzo))}`, go:`App.go('lavaggi')`, tip:`${w.tipo} · ${w.operatore}`}); });
  DB.plans.filter(p => p.attivo !== false && vehNames().includes(p.mezzo)).forEach(p => { const s = planStatus(p); const iso = isoD(s.nextDate); if (inMonth(iso)) add(iso, {k:'scad', c:'ce-scad', h:`<i class="fas fa-calendar-check"></i> ${esc(short(p.mezzo))} ${esc(p.nome)}`, go:`dettaglioPiano(${p.id})`, tip:`Scadenza: ${p.nome}`}); });
  if (SET().lavaggioPrimoLunedi) { for (let d = 1; d <= 7; d++) { const dd = new Date(y, m, d); if (dd.getDay() === 1) { add(isoD(dd), {k:'lavp', c:'ce-lavp', h:'<i class="fas fa-shower"></i> LAVAGGIO', go:`App.go('lavaggi')`, tip:'Lavaggio periodico (primo lunedì del mese)'}); break; } } }
  return idx;
}
function renderCalendario() {
  const el = $('#view-calendario'); const {y, m} = CAL;
  const idx = buildCalIndex(y, m);
  const fd = new Date(y, m, 1).getDay(), sd = fd === 0 ? 6 : fd - 1, dim = new Date(y, m + 1, 0).getDate(), tISO = todayISO();
  let cells = ''; for (let i = 0; i < sd; i++) cells += '<div class="cal-day om"></div>';
  for (let d = 1; d <= dim; d++) {
    const iso = `${y}-${pad(m + 1)}-${pad(d)}`; const dow = new Date(y, m, d).getDay();
    const ev = (idx[iso] || []).filter(e => CAL.f.has(e.k));
    cells += `<div class="cal-day ${iso === tISO ? 'today' : ''} ${dow === 0 ? 'we' : ''}" onclick="apriGiorno('${iso}')"><div class="dn">${d}</div>${ev.slice(0, 5).map(e => `<div class="ce ${e.c}" title="${escA(e.tip || '')}" onclick="event.stopPropagation();${e.go}">${e.h}</div>`).join('')}${ev.length > 5 ? `<div class="small text-muted text-center">+${ev.length - 5}</div>` : ''}</div>`;
  }
  // prossimi 14 giorni
  const up = []; const now = dayStart(new Date());
  const idxNext = {...buildCalIndex(now.getFullYear(), now.getMonth())}; const n2 = new Date(now.getFullYear(), now.getMonth() + 1, 1); Object.assign(idxNext, buildCalIndex(n2.getFullYear(), n2.getMonth()));
  for (let i = 0; i < 14; i++) { const d = new Date(now); d.setDate(d.getDate() + i); const iso = isoD(d); (idxNext[iso] || []).filter(e => ['app', 'rit', 'nota', 'scad'].includes(e.k)).forEach(e => up.push({iso, e})); }
  el.innerHTML = `
    <div class="view-title"><h2><i class="far fa-calendar-alt text-primary me-2"></i>Planning manutenzioni</h2>
      <div class="actions"><button class="btn btn-sm btn-outline-secondary" onclick="calMove(-1)"><i class="fas fa-chevron-left"></i></button><button class="btn btn-sm btn-dark fw-bold" style="min-width:160px" onclick="CAL.m=new Date().getMonth();CAL.y=new Date().getFullYear();renderCalendario()">${MONTHS[m]} ${y}</button><button class="btn btn-sm btn-outline-secondary" onclick="calMove(1)"><i class="fas fa-chevron-right"></i></button></div></div>
    <div class="chips mb-3">${CAL_TYPES.map(([k, l, c]) => `<span class="chip ${CAL.f.has(k) ? 'on' : ''}" onclick="CAL.f.has('${k}')?CAL.f.delete('${k}'):CAL.f.add('${k}');renderCalendario()"><span class="sw ${c}" style="border-left:none"></span>${l}</span>`).join('')}</div>
    <div class="row g-3"><div class="col-xl-9"><div class="card-x"><div class="bd"><div class="cal-head">${['LUN', 'MAR', 'MER', 'GIO', 'VEN', 'SAB', 'DOM'].map((d, i) => `<div class="${i === 6 ? 'text-danger' : ''}">${d}</div>`).join('')}</div><div class="cal-grid">${cells}</div>
      <div class="small text-muted mt-2"><i class="fas fa-info-circle me-1"></i>Clicca un giorno per aggiungere note; clicca un evento per aprire la scheda.</div></div></div></div>
    <div class="col-xl-3"><div class="card-x"><div class="hd"><span class="ic ic-amber"><i class="fas fa-bell"></i></span>Prossimi 14 giorni</div><div class="bd p0">
      ${up.length ? up.map(({iso, e}) => `<div class="px-3 py-2 border-bottom" style="cursor:pointer" onclick="${e.go}"><div class="small text-muted fw-bold">${fmtD(iso)} · ${relDays(iso)}</div><div class="ce ${e.c} mt-1" style="white-space:normal">${e.h}</div></div>`).join('') : '<div class="empty"><i class="far fa-calendar-check"></i>Niente in programma</div>'}
    </div></div></div></div>`;
}
function calMove(d) { CAL.m += d; if (CAL.m < 0) { CAL.m = 11; CAL.y--; } else if (CAL.m > 11) { CAL.m = 0; CAL.y++; } renderCalendario(); }
function apriGiorno(iso) {
  const d = parseDate(iso); const evs = buildCalIndex(d.getFullYear(), d.getMonth())[iso] || [];
  const list = () => { const ns = DB.notes.filter(n => n.date === iso); return ns.length ? ns.map(n => `<div class="d-flex justify-content-between align-items-start border-bottom py-2 gap-2"><div><div>${esc(n.text)}</div>${n.by ? `<div class="small text-muted"><i class="fas fa-user me-1"></i>${esc(n.by)}${n.creatoIl ? ' · ' + esc(n.creatoIl) : ''}</div>` : ''}</div><button class="btn btn-sm btn-outline-danger border-0" data-deln="${n.id}"><i class="fas fa-trash-alt"></i></button></div>`).join('') : '<div class="text-center text-muted small py-2">Nessuna nota.</div>'; };
  const m = openModal({title:`<i class="fas fa-sticky-note me-2"></i>Agenda ${fmtD(iso)}`, color:'violet',
    body:`${evs.filter(e => e.k !== 'nota').length ? `<div class="sec-title mt-0">Eventi</div>${evs.filter(e => e.k !== 'nota').map(e => `<div class="ce ${e.c} mb-1" style="white-space:normal;font-size:.8rem;padding:5px 8px" onclick="${e.go}">${e.h} <span class="opacity-75">${esc(e.tip || '')}</span></div>`).join('')}` : ''}
      <div class="sec-title">Note</div><div id="gn-list">${list()}</div>
      <div class="sec-title">Aggiungi nota</div><div class="input-group"><input class="form-control" id="gn-t" placeholder="Es. Visita tecnici…"><button class="btn btn-primary" id="gn-add"><i class="fas fa-plus"></i></button></div>
      <div class="form-check mt-2"><input class="form-check-input" type="checkbox" id="gn-mail"><label class="form-check-label small fw-bold text-primary" for="gn-mail"><i class="fas fa-envelope me-1"></i>Invia anche per email</label></div>`});
  const add = () => {
    const t = v('gn-t', m.el); if (!t) return;
    DB.notes.push({id:uid(), date:iso, text:t, by:who(), creatoIl:nowTS()}); logA('Nota', `Nota ${fmtD(iso)}: ${t.slice(0, 100)}`);
    Store.save('notes'); $('#gn-t', m.el).value = ''; $('#gn-list', m.el).innerHTML = list();
    if (v('gn-mail', m.el)) { $('#gn-mail', m.el).checked = false; composeEmail('nota', {dataNota:fmtD(iso), testo:t, operatore:currentOp(), data:nowTS()}); }
  };
  $('#gn-add', m.el).onclick = add; $('#gn-t', m.el).onkeydown = e => { if (e.key === 'Enter') add(); };
  $('#gn-list', m.el).onclick = async e => {
    const b = e.target.closest('[data-deln]'); if (!b) return; const n = DB.notes.find(x => x.id === +b.dataset.deln);
    if (!n || !await confirmDlg('Eliminare la nota? Resterà nel cestino.', {danger:true})) return;
    toTrash('nota calendario', n); DB.notes = DB.notes.filter(x => x.id !== n.id); logA('Eliminazione', `Nota del ${fmtD(iso)} eliminata: ${n.text.slice(0, 80)}`);
    Store.save('notes'); $('#gn-list', m.el).innerHTML = list();
  };
}
