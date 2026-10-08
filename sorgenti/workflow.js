'use strict';
/* =====================================================================
   FLUSSO RIPARAZIONE — ogni passo del modulo cartaceo:
   1 Riscontro guasto · 2 Appuntamento · 3 Email informativa/Preventivo
   4 In officina · 5 Ritiro veicolo
   ===================================================================== */
const STEPS = ['Segnalazione', 'Appuntamento', 'Email / Preventivo', 'In officina', 'Ritiro'];
const STEPS_SHORT = ['Segnalazione', 'Appuntamento', 'Email', 'Officina', 'Ritiro'];
const PRIO = {bassa:'pill-gray', normale:'pill-blue', alta:'pill-amber', urgente:'pill-red'};

function findTicket(id) { return DB.tickets.find(t => t.id === id); }

/* --- timeline (diario del ticket) --- */
function legacyTimeline(r) {
  const ev = [];
  if (r.dataSegnalazione) ev.push({ts:r.dataSegnalazione, by:r.operatoreSegnalazione || '', t:'apertura', x:`Segnalazione aperta${r.km ? ' · km ' + r.km : ''}`});
  if (r.dataAppuntamento) ev.push({ts:fromInputs(r.dataAppuntamento, r.dataAppuntamentoOra), by:r.operatoreAppuntamento || '', t:'appuntamento', x:`Appuntamento presso ${r.officinaAppuntamento || 'N/D'} il ${fmtD(r.dataAppuntamento)} ore ${r.dataAppuntamentoOra || '--:--'}${r.noteAppuntamento ? '\n' + r.noteAppuntamento : ''}`});
  if (r.emailInviata) ev.push({ts:r.dataSegnalazione, by:r.operatoreSegnalazione || '', t:'email', x:'Email di segnalazione inviata'});
  if (r.dataIngresso && r.operatoreConsegna !== 'Storico' && r.operatoreConsegna !== 'Archivio') ev.push({ts:r.dataIngresso, by:r.operatoreConsegna || '', t:'officina', x:`Ingresso in officina: ${r.officina || 'N/D'}`});
  if (Array.isArray(r.noteOfficina)) r.noteOfficina.forEach(n => ev.push({ts:n.date, by:n.by || '', t:'nota', x:n.text}));
  if (r.dataChiusura) ev.push({ts:r.dataChiusura, by:r.operatoreRitiro || '', t:'chiusura', x:`Ritiro / chiusura${r.intervento ? ': ' + r.intervento : ''}`});
  return ev;
}
function timelineOf(r) {
  const ev = Array.isArray(r.timeline) && r.timeline.length ? r.timeline.slice() : legacyTimeline(r);
  return ev.sort((a, b) => (parseDate(a.ts) || 0) - (parseDate(b.ts) || 0));
}
function ensureTimeline(t) { if (!Array.isArray(t.timeline) || !t.timeline.length) t.timeline = legacyTimeline(t); }
function addEv(t, tipo, testo, ts) { ensureTimeline(t); t.timeline.push({ts:ts || nowTS(), by:who(), t:tipo, x:testo}); }
const EV_LABEL = {apertura:'Apertura', appuntamento:'Appuntamento', email:'Email', officina:'Officina', nota:'Nota', preventivo:'Preventivo', autorizzazione:'Autorizzazione', chiusura:'Chiusura', modifica:'Modifica', km:'Km', stato:'Stato'};
function timelineHTML(r) {
  const ev = timelineOf(r); if (!ev.length) return '<div class="text-muted small">Nessun evento registrato.</div>';
  return `<div class="tl">${ev.map(e => `<div class="tl-i t-${e.t}"><div class="h"><b>${esc(EV_LABEL[e.t] || e.t)}</b> · ${esc(fmtDT(e.ts) || e.ts)}${e.by ? ` · <i class="fas fa-user"></i> ${esc(e.by)}` : ''}</div><div class="b">${esc(e.x)}</div></div>`).join('')}</div>`;
}

/* --- stato dei passi --- */
function ticketSteps(t) {
  const off = t.stato === 'in_officina';
  const s = ['done', '', '', '', ''];
  s[1] = t.dataAppuntamento ? 'done' : off ? 'skip' : 'cur';
  const s3 = t.emailInformativa || (t.preventivo && t.preventivo.stato && t.preventivo.stato !== 'da_definire');
  s[2] = s3 ? (t.preventivo && t.preventivo.sopraSoglia && !t.preventivo.dataAutorizzazione ? 'cur' : 'done') : (off ? 'skip' : (t.dataAppuntamento ? 'cur' : ''));
  s[3] = off ? 'done' : (t.dataAppuntamento ? 'cur' : '');
  s[4] = off ? 'cur' : '';
  const first = s.indexOf('cur'); return s.map((x, i) => x === 'cur' && i !== first ? '' : x);
}
function miniSteps(t) {
  const s = ticketSteps(t);
  return `<div class="mstep">${s.map(x => `<span class="${x === 'done' || x === 'skip' ? 'done' : x === 'cur' ? 'cur' : ''}"></span>`).join('')}</div><div class="mstep-l">${STEPS_SHORT.map(n => `<span>${n}</span>`).join('')}</div>`;
}

/* --- stato veicolo --- */
function vehState(n) {
  const tk = DB.tickets.filter(t => t.mezzo === n);
  if (tk.some(t => t.stato === 'in_officina')) return {k:'officina', l:'In officina', c:'st-officina'};
  if (tk.some(t => t.stato === 'segnalato' && t.fermo)) return {k:'fermo', l:'Fermo', c:'st-fermo'};
  if (tk.some(t => t.stato === 'segnalato')) return {k:'segnalato', l:'Segnalato', c:'st-segnalato'};
  return {k:'operativa', l:'Operativa', c:'st-operativa'};
}

/* =================== 1. NUOVO INTERVENTO (segnalazione) =================== */
function segnalazioneFormHTML(pref = {}) {
  const sel = pref.mezzo || '';
  return `
    <div class="mb-3"><span class="lbl req">Veicolo</span><div class="seg-pick" id="sg-veh">${vehicles().map(vh => `<button type="button" class="seg-btn ${vehClass(vh.nome)} ${vh.nome === sel ? 'on' : ''}" data-v="${escA(vh.nome)}"><i class="fas ${vehIcon(vh.nome)}"></i><b>${esc(vh.nome)}</b><small>${esc(vh.targa || vh.tipo)}</small></button>`).join('')}</div><input type="hidden" id="sg-mezzo" value="${escA(sel)}"></div>
    <div class="row g-3">
      <div class="col-md-7"><label class="lbl req" for="sg-desc">Problema riscontrato</label><textarea class="form-control" id="sg-desc" rows="5" placeholder="Descrivi il guasto…"></textarea><div class="small text-muted mt-1" id="sg-catguess"></div></div>
      <div class="col-md-5">
        <label class="lbl">Km attuali</label><input type="number" inputmode="numeric" class="form-control mb-2" id="sg-km" placeholder="es. 41250"><div class="small text-muted mb-2" id="sg-kmhint"></div>
        <label class="lbl">Categoria</label><select class="form-select" id="sg-cat">${catOptions('', true)}</select>
      </div>
      <div class="col-12"><span class="lbl">Priorità</span><div class="seg-pick seg-sm" id="sg-prio-pick">${[['bassa', 'Bassa'], ['normale', 'Normale'], ['alta', 'Alta'], ['urgente', 'Urgente']].map(([k, l]) => `<button type="button" class="seg-btn p-${k} ${k === 'normale' ? 'on' : ''}" data-v="${k}">${l}</button>`).join('')}</div><input type="hidden" id="sg-prio" value="normale"></div>
      <div class="col-12">${fieldOp('sg-op', 'Operatore', currentOp(), true)}</div>
      <div class="col-12 d-flex flex-wrap gap-4">
        <div class="form-check form-switch"><input class="form-check-input" type="checkbox" id="sg-fermo"><label class="form-check-label fw-bold text-danger" for="sg-fermo"><i class="fas fa-ban me-1"></i>Veicolo fermo / non utilizzabile</label></div>
        <div class="form-check form-switch"><input class="form-check-input" type="checkbox" id="sg-email"><label class="form-check-label fw-bold text-primary" for="sg-email"><i class="fas fa-envelope me-1"></i>Avvisa gli operatori via email</label></div>
      </div>
    </div>`;
}
function bindSegnalazioneForm(root = document) {
  const d = $('#sg-desc', root); if (!d) return;
  const guess = () => { const g = $('#sg-catguess', root); if (!v('sg-cat', root) && d.value.trim().length > 3) g.innerHTML = `Categoria rilevata: ${catPill(determinaCategoria(d.value))}`; else g.innerHTML = ''; };
  d.addEventListener('input', guess); $('#sg-cat', root).addEventListener('change', guess);
  const kmHint = () => { const c = currentKm(v('sg-mezzo', root)); $('#sg-kmhint', root).textContent = v('sg-mezzo', root) && c.km !== null ? `Ultimo valore noto: ${c.km.toLocaleString('it-IT')} km` : ''; };
  const seg = (wrap, hidden, after) => $('#' + wrap, root).addEventListener('click', e => { const b = e.target.closest('.seg-btn'); if (!b) return; $$('#' + wrap + ' .seg-btn', root).forEach(x => x.classList.toggle('on', x === b)); $('#' + hidden, root).value = b.dataset.v; after && after(); });
  seg('sg-veh', 'sg-mezzo', kmHint); seg('sg-prio-pick', 'sg-prio'); kmHint();
}
function nuovoIntervento(mezzo) {
  $$('.modal.show').forEach(x => bootstrap.Modal.getInstance(x)?.hide());
  const m = openModal({id:'nuovo-intervento', title:'<i class="fas fa-plus-circle me-2"></i>Nuovo intervento · segnalazione guasto', color:'red', size:'modal-lg', body:segnalazioneFormHTML({mezzo}),
    footer:`<button type="button" class="btn btn-outline-secondary me-auto" onclick="stampaModuloVuoto()"><i class="fas fa-print me-1"></i>Stampa modulo</button><button class="btn btn-light" data-bs-dismiss="modal">Annulla</button><button type="button" class="btn btn-danger fw-bold px-4" id="sg-ok"><i class="fas fa-check me-1"></i>Apri segnalazione</button>`});
  bindSegnalazioneForm(m.el);
  $('#sg-ok', m.el).onclick = () => { if (creaSegnalazione()) m.close(); };
  setTimeout(() => { if (mezzo && window.innerWidth > 768) $('#sg-desc', m.el)?.focus(); }, 400);
}
function creaSegnalazione() {
  const m = v('sg-mezzo'), km = v('sg-km'), desc = v('sg-desc'); let op = v('sg-op'); let cat = v('sg-cat');
  if (!m) { toast('Scegli il veicolo', 'warn'); return false; }
  if (!desc || !op) { toast('Compila Operatore e Problema', 'warn'); return false; }
  if (!currentOp()) setCurrentOp(op);
  if (!cat) cat = determinaCategoria(desc);
  const ei = v('sg-email');
  const t = {id:uid(), type:'guasto', categoria:cat, mezzo:m, km, operatoreSegnalazione:op, problema:desc, dataSegnalazione:nowTS(),
    stato:'segnalato', officina:'', operatoreConsegna:'', dataIngresso:'', operatoreRitiro:'', dataChiusura:'', intervento:'', emailInviata:ei,
    priorita:v('sg-prio') || 'normale', fermo:v('sg-fermo'), creatoDa:who(), creatoIl:nowTS(), dispositivo:device(), timeline:[]};
  t.timeline.push({ts:t.dataSegnalazione, by:op, t:'apertura', x:`Segnalazione aperta · ${cat}${km ? ' · km ' + km : ''}${t.fermo ? ' · VEICOLO FERMO' : ''}${who() !== op ? ` (inserita da ${who()})` : ''}`});
  DB.tickets.push(t);
  if (km) addKm(m, km, 'Segnalazione guasto', false);
  logA('Segnalazione', `Nuova segnalazione ${m}: ${desc.slice(0, 120)}`, {tipo:'ticket', id:t.id});
  Store.save('tickets', 'kmlog');
  toast(`Segnalazione aperta per ${esc(m)}`, 'ok');
  if (ei) setTimeout(() => composeEmail('segnalazione', ticketCtx(t, {operatore:op, data:t.dataSegnalazione}), {ref:{tipo:'ticket', id:t.id}, onSent:() => { addEv(t, 'email', 'Email di segnalazione inviata agli operatori'); Store.save('tickets'); }}), 400);
  if (SET().backupJsonSegnalazione) esportaJSON(true);
  return true;
}
/* prossima azione suggerita per una segnalazione */
function nextAction(t) {
  if (t.stato === 'in_officina') return {l:'Registra ritiro', i:'fa-flag-checkered', c:'btn-success', f:`modalRitiro(${t.id})`};
  if (!t.dataAppuntamento) return {l:'Fissa appuntamento', i:'fa-calendar-plus', c:'btn-warning', f:`modalAppuntamento(${t.id})`};
  return {l:'Porta in officina', i:'fa-tools', c:'btn-dark', f:`modalOfficina(${t.id})`};
}

/* =================== SCHEDA INTERVENTO (stepper) =================== */
const Scheda = {
  id:null, m:null, sel:null,
  open(id, step) {
    const t = findTicket(id); if (!t) return;
    this.id = id; this.sel = step ?? null;
    this.m = openModal({id:'scheda-modal', title:'', color:'dark', size:'modal-xl', body:'', footer:'', onClose:() => { this.id = null; this.m = null; }});
    this.render();
  },
  refresh() { if (this.id && this.m) this.render(); },
  render() {
    const t = findTicket(this.id);
    if (!t) { this.m.setBody('<div class="empty"><i class="fas fa-check-circle text-success"></i>Intervento chiuso e archiviato nello storico.</div>'); return; }
    const st = ticketSteps(t);
    const cur = this.sel ?? Math.max(0, st.findIndex(x => x === 'cur'));
    $('.modal-title', this.m.el).innerHTML = `<i class="fas ${vehIcon(t.mezzo)} me-2"></i>Scheda intervento · ${esc(t.mezzo)} <span class="badge bg-light text-dark ms-1 mono">${esc(targa(t.mezzo))}</span> ${t.stato === 'in_officina' ? '<span class="badge bg-danger ms-1">IN OFFICINA</span>' : '<span class="badge bg-warning text-dark ms-1">IN ATTESA</span>'}`;
    const p = t.preventivo || {};
    const panels = [
      /* 1 */ `<div class="step-panel"><h6><i class="fas fa-clipboard-list"></i>1. Riscontro del guasto <span class="st">${catPill(t.categoria)} <span class="pill ${PRIO[t.priorita || 'normale']}">${esc(t.priorita || 'normale')}</span>${t.fermo ? ' <span class="pill pill-red">fermo</span>' : ''}</span></h6>
        <div class="kv"><div>Data</div><div>${esc(t.dataSegnalazione)}</div><div>Veicolo</div><div class="fw-bold">${esc(t.mezzo)} (${esc(targa(t.mezzo))})</div><div>Km</div><div>${esc(t.km || '-')}</div><div>Operatore</div><div>${esc(t.operatoreSegnalazione || '-')}</div><div>Problema</div><div style="white-space:pre-line" class="fw-bold">${esc(t.problema)}</div>${t.creatoDa && t.creatoDa !== t.operatoreSegnalazione ? `<div>Inserita da</div><div>${esc(t.creatoDa)}</div>` : ''}</div>
        <div class="d-flex flex-wrap gap-2 mt-3"><button class="btn btn-sm btn-outline-primary" onclick="modificaTicket(${t.id})"><i class="fas fa-pen me-1"></i>Modifica</button>
        ${t.stato === 'segnalato' ? `<button class="btn btn-sm btn-outline-success" onclick="risoltoInterno(${t.id})"><i class="fas fa-check me-1"></i>Risolto senza officina</button>` : ''}
        <button class="btn btn-sm btn-outline-danger ms-auto" onclick="eliminaTicket(${t.id})"><i class="fas fa-trash me-1"></i>Annulla segnalazione</button></div></div>`,
      /* 2 */ `<div class="step-panel"><h6><i class="far fa-calendar-alt"></i>2. Appuntamento riparazione</h6>
        ${t.dataAppuntamento ? `<div class="kv"><div>Officina</div><div class="fw-bold">${esc(t.officinaAppuntamento || '-')}</div><div>Data</div><div class="fw-bold">${fmtD(t.dataAppuntamento)} ore ${esc(t.dataAppuntamentoOra || '--:--')} <span class="text-muted">(${relDays(t.dataAppuntamento)})</span></div><div>Operatore</div><div>${esc(t.operatoreAppuntamento || '-')}</div><div>Note</div><div>${esc(t.noteAppuntamento || '-')}</div></div>` : '<p class="text-muted small mb-0">Nessun appuntamento fissato.</p>'}
        <div class="d-flex flex-wrap gap-2 mt-3">${t.stato === 'segnalato' ? `<button class="btn btn-sm btn-warning fw-bold" onclick="modalAppuntamento(${t.id})"><i class="far fa-calendar-alt me-1"></i>${t.dataAppuntamento ? 'Modifica' : 'Fissa'} appuntamento</button>` : ''}
        ${t.dataAppuntamento ? `<button class="btn btn-sm btn-outline-secondary" onclick="downloadICS(${t.id})"><i class="fas fa-calendar-plus me-1"></i>Calendario PC (.ics)</button><button class="btn btn-sm btn-outline-success" onclick="emailTicket(${t.id},'appuntamento')"><i class="fas fa-envelope me-1"></i>Email Economato</button>${t.stato === 'segnalato' ? `<button class="btn btn-sm btn-outline-danger" onclick="cancellaAppuntamento(${t.id})"><i class="fas fa-times me-1"></i>Annulla</button>` : ''}` : ''}
        ${offContactBtns(t.officinaAppuntamento, t.id)}</div></div>`,
      /* 3 */ `<div class="step-panel"><h6><i class="fas fa-file-invoice-dollar"></i>3. Email informativa e preventivo</h6>
        <div class="kv"><div>Email informativa</div><div>${t.emailInformativa ? `<span class="pill pill-green">inviata</span> ${esc(t.emailInformativa.data)} · ${esc(t.emailInformativa.operatore)}` : '<span class="pill pill-gray">non inviata</span>'}</div>
        <div>Preventivo</div><div>${p.stato ? `<span class="pill ${p.stato === 'autorizzato' ? 'pill-green' : p.stato === 'rifiutato' ? 'pill-red' : p.stato === 'non_richiesto' ? 'pill-gray' : 'pill-amber'}">${esc(p.stato.replace('_', ' '))}</span> ${p.importo ? '<b>' + eur(p.importo) + '</b>' : ''} ${p.sopraSoglia ? `<span class="pill pill-red">oltre ${eur(SET().sogliaPreventivo)}</span>` : ''}` : '<span class="pill pill-gray">da definire</span>'}</div>
        ${p.sopraSoglia ? `<div>Autorizzazione</div><div>${p.dataAutorizzazione ? `<span class="pill pill-green">autorizzato</span> il ${fmtD(p.dataAutorizzazione)} da ${esc(p.autorizzatoDa || '-')}` : '<span class="text-danger fw-bold"><i class="fas fa-hourglass-half me-1"></i>Attendere autorizzazione prima di procedere</span>'}</div>` : ''}
        ${p.note ? `<div>Note</div><div>${esc(p.note)}</div>` : ''}</div>
        <div class="d-flex flex-wrap gap-2 mt-3"><button class="btn btn-sm btn-success" onclick="emailTicket(${t.id},'${t.stato === 'in_officina' ? 'aggiornamento' : 'appuntamento'}')"><i class="fas fa-envelope me-1"></i>Invia email informativa</button>
        <button class="btn btn-sm btn-outline-success" onclick="segnaEmailInformativa(${t.id})"><i class="fas fa-check me-1"></i>Segna come inviata</button>
        <button class="btn btn-sm btn-outline-primary" onclick="modalPreventivo(${t.id})"><i class="fas fa-euro-sign me-1"></i>Preventivo / autorizzazione</button>
        ${p.sopraSoglia && !p.dataAutorizzazione ? `<button class="btn btn-sm btn-outline-danger" onclick="emailTicket(${t.id},'preventivo')"><i class="fas fa-paper-plane me-1"></i>Chiedi autorizzazione</button>` : ''}</div></div>`,
      /* 4 */ `<div class="step-panel"><h6><i class="fas fa-tools"></i>4. Mezzo in officina</h6>
        ${t.stato === 'in_officina' ? `<div class="kv"><div>Officina</div><div class="fw-bold">${esc(t.officina || '-')}</div><div>Ingresso</div><div>${esc(t.dataIngresso)}</div><div>Portato da</div><div>${esc(t.operatoreConsegna || '-')}</div><div>Ritiro previsto</div><div class="fw-bold">${t.dataStimataConsegna ? fmtD(t.dataStimataConsegna) + (t.dataStimataConsegnaOra ? ' ore ' + esc(t.dataStimataConsegnaOra) : '') + ` <span class="text-muted fw-normal">(${relDays(t.dataStimataConsegna)})</span>` : 'non specificato'}</div></div>
          <div class="mt-3"><span class="lbl">Note officina</span>${(Array.isArray(t.noteOfficina) && t.noteOfficina.length) ? t.noteOfficina.map(n => `<div class="small border-bottom py-1"><b class="text-primary">${esc(n.date)}</b>${n.by ? ' · ' + esc(n.by) : ''}: ${esc(n.text)}</div>`).join('') : '<div class="small text-muted">Nessuna nota.</div>'}</div>
          <div class="d-flex flex-wrap gap-2 mt-3"><button class="btn btn-sm btn-primary" onclick="modalNoteOfficina(${t.id})"><i class="fas fa-edit me-1"></i>Note / data ritiro</button><button class="btn btn-sm btn-outline-success" onclick="emailTicket(${t.id},'aggiornamento')"><i class="fas fa-envelope me-1"></i>Email aggiornamento</button>${offContactBtns(t.officina, t.id)}</div>`
        : `<p class="text-muted small">Il mezzo non è ancora in officina.</p>${p.sopraSoglia && !p.dataAutorizzazione ? '<div class="alert alert-warning py-2 small"><i class="fas fa-exclamation-triangle me-1"></i>Preventivo oltre soglia non ancora autorizzato.</div>' : ''}<button class="btn btn-dark fw-bold" onclick="modalOfficina(${t.id})"><i class="fas fa-tools me-1"></i>Porta in officina</button>`}</div>`,
      /* 5 */ `<div class="step-panel"><h6><i class="fas fa-flag-checkered"></i>5. Ritiro del veicolo</h6>
        ${t.stato === 'in_officina' ? `<p class="small text-muted">Al ritiro registra intervento eseguito, km, costo: l'intervento passa nello storico del veicolo e il mezzo torna operativo.</p><button class="btn btn-success fw-bold" onclick="modalRitiro(${t.id})"><i class="fas fa-check me-1"></i>Registra ritiro</button>` : '<p class="text-muted small mb-0">Disponibile quando il mezzo è in officina.</p>'}</div>`
    ];
    this.m.setBody(`
      <ul class="steps">${STEPS.map((n, i) => `<li class="${st[i]} ${i === cur ? 'sel' : ''}" data-step="${i}">${n}</li>`).join('')}</ul>
      <div class="row g-3"><div class="col-lg-7">${panels[cur]}
        <div class="d-flex gap-2 flex-wrap"><button class="btn btn-sm btn-light border" ${cur === 0 ? 'disabled' : ''} data-go="${cur - 1}"><i class="fas fa-chevron-left me-1"></i>Passo precedente</button><button class="btn btn-sm btn-light border" ${cur === 4 ? 'disabled' : ''} data-go="${cur + 1}">Passo successivo<i class="fas fa-chevron-right ms-1"></i></button>
        <button class="btn btn-sm btn-outline-dark ms-auto" onclick="stampaModuloTicket(${t.id})"><i class="fas fa-print me-1"></i>Stampa modulo</button></div></div>
      <div class="col-lg-5"><div class="step-panel"><h6><i class="fas fa-stream"></i>Diario intervento <button class="btn btn-sm btn-outline-primary ms-auto" onclick="aggiungiNotaDiario(${t.id})"><i class="fas fa-plus"></i> Nota</button></h6>${timelineHTML(t)}</div></div></div>`);
    $$('[data-step]', this.m.el).forEach(li => li.onclick = () => { this.sel = +li.dataset.step; this.render(); });
    $$('[data-go]', this.m.el).forEach(b => b.onclick = () => { this.sel = +b.dataset.go; this.render(); });
  }
};
function offContactBtns(name, tid) {
  const o = findOfficina(name); if (!o) return '';
  return `${o.telefono ? `<a class="btn btn-sm btn-outline-success" href="tel:${escA(o.telefono.replace(/\s/g, ''))}"><i class="fas fa-phone me-1"></i>${esc(o.telefono)}</a>` : ''}${o.email ? `<button class="btn btn-sm btn-outline-success" onclick="emailTicket(${tid},'officina')"><i class="fas fa-at me-1"></i>Scrivi a ${esc(o.nome)}</button>` : ''}`;
}

/* =================== 2. APPUNTAMENTO =================== */
function modalAppuntamento(id) {
  const t = findTicket(id); if (!t) return;
  const m = openModal({title:`<i class="far fa-calendar-alt me-2"></i>Appuntamento · ${esc(t.mezzo)}`, color:'amber',
    body:`<div class="row g-2">
      <div class="col-6"><label class="lbl req">Data</label><input type="date" class="form-control fw-bold" id="ap-d" value="${escA(t.dataAppuntamento || '')}"></div>
      <div class="col-6"><label class="lbl req">Ora</label><input type="time" class="form-control fw-bold" id="ap-h" value="${escA(t.dataAppuntamentoOra || '')}"></div>
      <div class="col-12">${fieldOff('ap-off', 'Officina', t.officinaAppuntamento || '')}</div>
      <div class="col-12">${fieldOp('ap-op', 'Operatore che fissa', t.operatoreAppuntamento || currentOp(), true)}</div>
      <div class="col-12"><label class="lbl">Note</label><textarea class="form-control" id="ap-n" rows="2">${esc(t.noteAppuntamento || '')}</textarea></div>
      <div class="col-12"><div class="form-check"><input class="form-check-input" type="checkbox" id="ap-ics" ${t.dataAppuntamento ? '' : 'checked'}><label class="form-check-label small fw-bold" for="ap-ics">Salva nel calendario PC (.ics)</label></div>
      <div class="form-check"><input class="form-check-input" type="checkbox" id="ap-mail" checked><label class="form-check-label small fw-bold" for="ap-mail">Prepara email per l'Economato</label></div></div></div>`,
    footer:`<button class="btn btn-light" data-bs-dismiss="modal">Annulla</button><button class="btn btn-dark fw-bold" id="ap-ok">Conferma</button>`});
  $('#ap-ok', m.el).onclick = () => {
    const d = v('ap-d', m.el), h = v('ap-h', m.el), off = canonOfficina(v('ap-off', m.el)), op = v('ap-op', m.el), n = v('ap-n', m.el);
    if (!d || !h || !op) { toast('Inserisci Data, Ora e Operatore', 'warn'); return; }
    const was = !!t.dataAppuntamento;
    t.dataAppuntamento = d; t.dataAppuntamentoOra = h; t.officinaAppuntamento = off; t.operatoreAppuntamento = op; t.noteAppuntamento = n;
    addEv(t, 'appuntamento', `${was ? 'Appuntamento modificato' : 'Appuntamento fissato'}: ${off || 'N/D'} il ${fmtD(d)} ore ${h}${n ? '\n' + n : ''}${op !== who() ? ` (operatore: ${op})` : ''}`);
    logA('Appuntamento', `${t.mezzo}: ${off} ${fmtD(d)} ${h}`, {tipo:'ticket', id:t.id});
    Store.save('tickets'); m.close();
    if (v('ap-ics', m.el)) downloadICS(t.id);
    if (v('ap-mail', m.el)) setTimeout(() => emailTicket(t.id, 'appuntamento'), 300);
  };
}
async function cancellaAppuntamento(id) {
  const t = findTicket(id); if (!t || !await confirmDlg('Annullare l\'appuntamento?', {danger:true})) return;
  addEv(t, 'appuntamento', `Appuntamento annullato (era ${t.officinaAppuntamento || ''} ${fmtD(t.dataAppuntamento)} ${t.dataAppuntamentoOra || ''})`);
  ['dataAppuntamento', 'dataAppuntamentoOra', 'officinaAppuntamento', 'operatoreAppuntamento', 'noteAppuntamento'].forEach(k => t[k] = '');
  logA('Appuntamento', `${t.mezzo}: appuntamento annullato`, {tipo:'ticket', id:t.id});
  Store.save('tickets');
}
function downloadICS(id) {
  const t = findTicket(id); if (!t || !t.dataAppuntamento) return;
  const cd = t.dataAppuntamento.replace(/-/g, ''), tm = t.dataAppuntamentoOra || '09:00', ct = tm.replace(/:/g, '');
  const [h, mi] = tm.split(':').map(Number); const et = pad((h + 1) % 24) + pad(mi);
  const e = s => String(s || '').replace(/[,;]/g, '\\$&').replace(/\n/g, '\\n');
  const ic = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//118 RSM//Veicoli//IT\r\nBEGIN:VEVENT\r\nUID:${t.id}@veicoli118\r\nSUMMARY:Manutenzione ${e(t.mezzo)}\r\nDTSTART:${cd}T${ct}00\r\nDTEND:${cd}T${et}00\r\nLOCATION:${e(t.officinaAppuntamento)}\r\nDESCRIPTION:${e(t.problema)}\r\nEND:VEVENT\r\nEND:VCALENDAR`;
  downloadBlob(ic, `app_${t.mezzo.replace(/\s/g, '_')}.ics`, 'text/calendar');
}

/* =================== 3. EMAIL INFORMATIVA / PREVENTIVO =================== */
function emailTicket(id, tpl) {
  const t = findTicket(id); if (!t) return;
  const o = findOfficina(t.officina || t.officinaAppuntamento);
  composeEmail(tpl, ticketCtx(t), {ref:{tipo:'ticket', id:t.id}, to:tpl === 'officina' && o && o.email ? [o.email] : [],
    onSent:() => {
      if (tpl !== 'officina') { t.emailInformativa = {data:nowTS(), operatore:who(), modello:tpl}; t.emailInviata = true; }
      addEv(t, 'email', `Email inviata: ${CFG().templates[tpl] ? CFG().templates[tpl].nome : tpl}`);
      Store.save('tickets');
    }});
}
function segnaEmailInformativa(id) {
  const t = findTicket(id); if (!t) return;
  const m = openModal({title:'Email informativa inviata', color:'green', size:'modal-dialog-centered',
    body:`<div class="row g-2"><div class="col-6"><label class="lbl">Data</label><input type="date" class="form-control" id="ei-d" value="${todayISO()}"></div><div class="col-6"><label class="lbl">Ora</label><input type="time" class="form-control" id="ei-h" value="${hhmm(new Date())}"></div><div class="col-12">${fieldOp('ei-op', 'Operatore', currentOp(), true)}</div></div>`,
    footer:`<button class="btn btn-light" data-bs-dismiss="modal">Annulla</button><button class="btn btn-success fw-bold" id="ei-ok">Salva</button>`});
  $('#ei-ok', m.el).onclick = () => {
    const op = v('ei-op', m.el); if (!op) { toast('Indica l\'operatore', 'warn'); return; }
    const ts = fromInputs(v('ei-d', m.el), v('ei-h', m.el));
    t.emailInformativa = {data:ts, operatore:op, modello:'manuale'}; t.emailInviata = true;
    addEv(t, 'email', `Email informativa segnata come inviata da ${op}`, ts);
    logA('Email', `${t.mezzo}: email informativa registrata manualmente (${op})`, {tipo:'ticket', id:t.id});
    Store.save('tickets'); m.close();
  };
}
function modalPreventivo(id) {
  const t = findTicket(id); if (!t) return; const p = t.preventivo || {};
  const soglia = SET().sogliaPreventivo;
  const m = openModal({title:`<i class="fas fa-euro-sign me-2"></i>Preventivo · ${esc(t.mezzo)}`, color:'violet',
    body:`<div class="row g-2">
      <div class="col-md-6"><label class="lbl">Stato preventivo</label><select class="form-select" id="pv-st">${[['da_definire', 'Da definire'], ['non_richiesto', 'Non richiesto'], ['richiesto', 'Richiesto, in attesa'], ['ricevuto', 'Ricevuto'], ['autorizzato', 'Autorizzato'], ['rifiutato', 'Rifiutato']].map(([k, l]) => `<option value="${k}" ${p.stato === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="col-md-6"><label class="lbl">Importo (€)</label><input type="number" step="0.01" class="form-control" id="pv-imp" value="${escA(p.importo || '')}"></div>
      <div class="col-12"><div class="alert py-2 small mb-0" id="pv-alert"></div></div>
      <div class="col-md-6"><label class="lbl">Data autorizzazione</label><input type="date" class="form-control" id="pv-da" value="${escA(p.dataAutorizzazione || '')}"></div>
      <div class="col-md-6"><label class="lbl">Autorizzato da</label><input class="form-control" id="pv-by" value="${escA(p.autorizzatoDa || '')}" placeholder="es. Direzione / Economato"></div>
      <div class="col-12"><label class="lbl">Note</label><textarea class="form-control" id="pv-n" rows="2">${esc(p.note || '')}</textarea></div></div>`,
    footer:`<button class="btn btn-light" data-bs-dismiss="modal">Annulla</button><button class="btn btn-primary fw-bold" id="pv-ok">Salva</button>`});
  const upd = () => { const i = num(v('pv-imp', m.el)); const a = $('#pv-alert', m.el); const over = i !== null && i > soglia;
    a.className = 'alert py-2 small mb-0 ' + (over ? 'alert-danger' : 'alert-light border');
    a.innerHTML = over ? `<i class="fas fa-exclamation-triangle me-1"></i><b>Oltre ${eur(soglia)}</b>: attendere autorizzazione prima di procedere.` : `Soglia di autorizzazione: ${eur(soglia)}. Sotto soglia non serve autorizzazione.`; };
  $('#pv-imp', m.el).oninput = upd; upd();
  $('#pv-ok', m.el).onclick = () => {
    const imp = num(v('pv-imp', m.el));
    const np = {stato:v('pv-st', m.el), importo:imp ?? '', sopraSoglia:imp !== null && imp > soglia, dataAutorizzazione:v('pv-da', m.el), autorizzatoDa:v('pv-by', m.el), note:v('pv-n', m.el), aggiornatoDa:who(), aggiornatoIl:nowTS()};
    if (np.dataAutorizzazione && np.stato !== 'rifiutato') np.stato = 'autorizzato';
    const wasAuth = p.dataAutorizzazione;
    t.preventivo = np;
    addEv(t, 'preventivo', `Preventivo: ${np.stato.replace('_', ' ')}${imp !== null ? ' · ' + eur(imp) : ''}${np.sopraSoglia ? ' (oltre soglia)' : ''}${np.note ? '\n' + np.note : ''}`);
    if (np.dataAutorizzazione && !wasAuth) addEv(t, 'autorizzazione', `Autorizzato il ${fmtD(np.dataAutorizzazione)}${np.autorizzatoDa ? ' da ' + np.autorizzatoDa : ''}`);
    logA('Preventivo', `${t.mezzo}: ${np.stato}${imp !== null ? ' ' + eur(imp) : ''}`, {tipo:'ticket', id:t.id});
    Store.save('tickets'); m.close();
  };
}

/* =================== 4. OFFICINA =================== */
function modalOfficina(id) {
  const t = findTicket(id); if (!t) return;
  const p = t.preventivo || {};
  const m = openModal({title:`<i class="fas fa-tools me-2"></i>Porta in officina · ${esc(t.mezzo)}`, color:'dark',
    body:`${p.sopraSoglia && !p.dataAutorizzazione ? '<div class="alert alert-warning py-2 small"><i class="fas fa-exclamation-triangle me-1"></i>Il preventivo è oltre soglia e non risulta autorizzato.</div>' : ''}
     <div class="row g-2"><div class="col-12">${fieldOff('of-off', 'Officina', t.officinaAppuntamento || '', true)}</div>
      <div class="col-12">${fieldOp('of-op', 'Portato da', currentOp(), true)}</div>
      <div class="col-6"><label class="lbl">Data ingresso</label><input type="date" class="form-control" id="of-d" value="${todayISO()}"></div>
      <div class="col-6"><label class="lbl">Ora</label><input type="time" class="form-control" id="of-h" value="${hhmm(new Date())}"></div>
      <div class="col-6"><label class="lbl">Km alla consegna</label><input type="number" class="form-control" id="of-km" value="${escA(t.km || '')}"></div>
      <div class="col-6"><label class="lbl">Ritiro previsto</label><input type="date" class="form-control" id="of-rit"></div>
      <div class="col-12"><label class="lbl">Note officina</label><textarea class="form-control" id="of-n" rows="2"></textarea></div></div>`,
    footer:`<button class="btn btn-light" data-bs-dismiss="modal">Annulla</button><button class="btn btn-dark fw-bold" id="of-ok">Conferma ingresso</button>`});
  $('#of-ok', m.el).onclick = () => {
    const off = canonOfficina(v('of-off', m.el)), op = v('of-op', m.el);
    if (!off || !op) { toast('Indica officina e chi porta il mezzo', 'warn'); return; }
    const ts = fromInputs(v('of-d', m.el), v('of-h', m.el)) || nowTS();
    t.stato = 'in_officina'; t.officina = off; t.operatoreConsegna = op; t.dataIngresso = ts;
    t.dataStimataConsegna = v('of-rit', m.el); t.dataStimataConsegnaOra = '';
    const km = v('of-km', m.el); if (km) { t.kmConsegna = km; if (!t.km) t.km = km; addKm(t.mezzo, km, 'Consegna in officina', false); }
    const n = v('of-n', m.el); t.noteOfficina = Array.isArray(t.noteOfficina) ? t.noteOfficina : [];
    addEv(t, 'officina', `Ingresso in officina: ${off} · portato da ${op}${t.dataStimataConsegna ? ' · ritiro previsto ' + fmtD(t.dataStimataConsegna) : ''}`, ts);
    if (n) { t.noteOfficina.push({text:n, date:nowTS(), by:who()}); addEv(t, 'nota', n); }
    logA('Officina', `${t.mezzo} portato in officina ${off} da ${op}`, {tipo:'ticket', id:t.id});
    Store.save('tickets', 'kmlog'); m.close(); toast(`${esc(t.mezzo)} in officina`, 'ok');
  };
}
function modalNoteOfficina(id) {
  const t = findTicket(id); if (!t) return;
  if (!Array.isArray(t.noteOfficina)) { const o = t.noteOfficina; t.noteOfficina = o ? [{text:o, date:'Precedente'}] : []; }
  const list = () => t.noteOfficina.length ? t.noteOfficina.map((n, i) => `<div class="small border-bottom py-2 d-flex justify-content-between gap-2"><div><b class="text-primary">${esc(n.date)}</b>${n.by ? ' · <i class="fas fa-user"></i> ' + esc(n.by) : ''}: ${esc(n.text)}</div><button class="btn btn-sm btn-outline-danger border-0" data-del="${i}"><i class="fas fa-trash"></i></button></div>`).join('') : '<div class="text-center text-muted small py-2">Nessuna nota.</div>';
  const m = openModal({title:`Aggiorna stato officina · ${esc(t.mezzo)}`, color:'cyan',
    body:`<div class="row g-2 mb-3"><div class="col-6"><label class="lbl">Data ritiro prevista</label><input type="date" class="form-control" id="no-d" value="${escA(t.dataStimataConsegna || '')}"></div><div class="col-6"><label class="lbl">Ora</label><input type="time" class="form-control" id="no-h" value="${escA(t.dataStimataConsegnaOra || '')}"></div></div>
      <span class="lbl">Storico note</span><div id="no-list" class="bg-light p-2 rounded border mb-3" style="max-height:240px;overflow:auto">${list()}</div>
      <label class="lbl">Nuova nota</label><textarea class="form-control border-success" id="no-t" rows="3"></textarea>`,
    footer:`<button class="btn btn-light" data-bs-dismiss="modal">Annulla</button><button class="btn btn-info text-white fw-bold" id="no-ok">Salva</button>`});
  $('#no-list', m.el).onclick = async e => {
    const b = e.target.closest('[data-del]'); if (!b) return;
    if (!await confirmDlg('Eliminare la nota? (resterà nel cestino)', {danger:true})) return;
    const n = t.noteOfficina.splice(+b.dataset.del, 1)[0];
    toTrash('nota officina', n, {mezzo:t.mezzo, ticketId:t.id}); addEv(t, 'nota', `Nota eliminata: "${n.text}"`);
    logA('Officina', `${t.mezzo}: nota officina eliminata`, {tipo:'ticket', id:t.id}); Store.save('tickets');
    $('#no-list', m.el).innerHTML = list();
  };
  $('#no-ok', m.el).onclick = () => {
    const txt = v('no-t', m.el), d = v('no-d', m.el), h = v('no-h', m.el);
    if (txt) { t.noteOfficina.push({text:txt, date:nowTS(), by:who()}); addEv(t, 'nota', txt); }
    if (d !== (t.dataStimataConsegna || '') || h !== (t.dataStimataConsegnaOra || '')) addEv(t, 'officina', `Ritiro previsto: ${d ? fmtD(d) + (h ? ' ore ' + h : '') : 'non specificato'}`);
    t.dataStimataConsegna = d; t.dataStimataConsegnaOra = h;
    logA('Officina', `${t.mezzo}: aggiornamento officina${txt ? ' — ' + txt.slice(0, 80) : ''}`, {tipo:'ticket', id:t.id});
    Store.save('tickets'); m.close();
  };
}
function aggiungiNotaDiario(id) {
  const t = findTicket(id); if (!t) return;
  const m = openModal({title:'Aggiungi nota al diario', color:'blue', size:'modal-dialog-centered', body:`<textarea class="form-control" id="nd-t" rows="3" placeholder="es. Telefonato all'officina, pezzo in arrivo giovedì"></textarea>`,
    footer:`<button class="btn btn-light" data-bs-dismiss="modal">Annulla</button><button class="btn btn-primary fw-bold" id="nd-ok">Aggiungi</button>`});
  $('#nd-ok', m.el).onclick = () => { const x = v('nd-t', m.el); if (!x) return; addEv(t, 'nota', x); if (t.stato === 'in_officina') { t.noteOfficina = Array.isArray(t.noteOfficina) ? t.noteOfficina : []; t.noteOfficina.push({text:x, date:nowTS(), by:who()}); } logA('Diario', `${t.mezzo}: ${x.slice(0, 100)}`, {tipo:'ticket', id:t.id}); Store.save('tickets'); m.close(); };
}

/* =================== 5. RITIRO / CHIUSURA =================== */
function modalRitiro(id, interno = false) {
  const t = findTicket(id); if (!t) return;
  const m = openModal({title:`<i class="fas fa-flag-checkered me-2"></i>${interno ? 'Chiusura senza officina' : 'Ritiro mezzo'} · ${esc(t.mezzo)}`, color:'green', staticBd:true,
    body:`<div class="row g-2">
      <div class="col-12"><label class="lbl req">Intervento eseguito</label><textarea class="form-control" id="rt-int" rows="3"></textarea></div>
      <div class="col-12">${fieldOp('rt-op', interno ? 'Risolto da' : 'Ritirato da', currentOp(), true)}</div>
      <div class="col-6"><label class="lbl">Data</label><input type="date" class="form-control" id="rt-d" value="${todayISO()}"></div>
      <div class="col-6"><label class="lbl">Ora</label><input type="time" class="form-control" id="rt-h" value="${hhmm(new Date())}"></div>
      <div class="col-6"><label class="lbl">Km al ritiro</label><input type="number" class="form-control" id="rt-km" value="${escA(t.kmConsegna || t.km || '')}"></div>
      <div class="col-6"><label class="lbl">Costo (€)</label><input type="number" step="0.01" class="form-control" id="rt-cost" value="${escA((t.preventivo && t.preventivo.importo) || '')}"></div>
      <div class="col-6"><label class="lbl">N. fattura / documento</label><input class="form-control" id="rt-doc"></div>
      <div class="col-6"><label class="lbl">Garanzia</label><select class="form-select" id="rt-gar"><option value="">No</option><option value="si">Sì, in garanzia</option></select></div>
      ${planLinkSelect(t)}
      <div class="col-12"><div class="form-check"><input class="form-check-input" type="checkbox" id="rt-mail"><label class="form-check-label small fw-bold" for="rt-mail">Avvisa via email che il mezzo è di nuovo operativo</label></div></div></div>`,
    footer:`<button class="btn btn-light" data-bs-dismiss="modal">Annulla</button><button class="btn btn-success fw-bold" id="rt-ok"><i class="fas fa-check me-1"></i>Chiudi intervento</button>`});
  $('#rt-ok', m.el).onclick = () => {
    const iv = v('rt-int', m.el), op = v('rt-op', m.el);
    if (!iv || !op) { toast('Indica intervento eseguito e operatore', 'warn'); return; }
    const ts = fromInputs(v('rt-d', m.el), v('rt-h', m.el)) || nowTS();
    t.intervento = iv; t.operatoreRitiro = op; t.dataChiusura = ts;
    const km = v('rt-km', m.el); if (km) { t.kmRitiro = km; if (!t.km) t.km = km; addKm(t.mezzo, km, 'Ritiro dall\'officina', false); }
    const c = num(v('rt-cost', m.el)); if (c !== null) t.costo = c;
    if (v('rt-doc', m.el)) t.documento = v('rt-doc', m.el);
    if (v('rt-gar', m.el)) t.garanzia = true;
    const pl = v('rt-plan', m.el); if (pl) t.pianoId = +pl;
    if (interno) { t.officina = t.officina || 'Risolto internamente'; t.operatoreConsegna = t.operatoreConsegna || '-'; t.dataIngresso = t.dataIngresso || ts; }
    t.stato = 'concluso'; t.chiusoDa = who(); t.chiusoIl = nowTS();
    addEv(t, 'chiusura', `${interno ? 'Risolto senza officina' : 'Ritirato da ' + (t.officina || '')} · ${op}${km ? ' · km ' + km : ''}${c !== null ? ' · ' + eur(c) : ''}\n${iv}`, ts);
    if (!Array.isArray(DB.flotta[t.mezzo])) DB.flotta[t.mezzo] = [];
    DB.flotta[t.mezzo].push({...t});
    DB.tickets = DB.tickets.filter(x => x.id !== t.id);
    logA('Chiusura', `${t.mezzo}: intervento chiuso (${iv.slice(0, 100)})`, {tipo:'storico', id:t.id, mezzo:t.mezzo});
    Store.save('tickets', 'flotta', 'kmlog'); m.close();
    toast(`${esc(t.mezzo)} di nuovo operativo`, 'ok');
    if (v('rt-mail', m.el)) setTimeout(() => composeEmail('ritiro', ticketCtx(t, {operatore:op, data:ts, km:km || t.km || '-'}), {ref:{tipo:'storico', id:t.id}}), 300);
  };
}
function risoltoInterno(id) { modalRitiro(id, true); }
function planLinkSelect(t) {
  const pl = DB.plans.filter(p => p.mezzo === t.mezzo && p.attivo !== false); if (!pl.length) return '';
  const guess = pl.find(p => p.id === t.pianoId) || pl.find(p => planMatches(p, t));
  return `<div class="col-12"><label class="lbl">Conta come manutenzione programmata</label><select class="form-select" id="rt-plan"><option value="">— No —</option>${pl.map(p => `<option value="${p.id}" ${guess && guess.id === p.id ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</select></div>`;
}

/* =================== MODIFICA / ELIMINA =================== */
function modificaTicket(id) {
  const t = findTicket(id); if (!t) return;
  const m = openModal({title:`<i class="fas fa-pen me-2"></i>Modifica segnalazione · ${esc(t.mezzo)}`, color:'blue',
    body:`<div class="row g-2">
      <div class="col-md-6"><label class="lbl">Veicolo</label><select class="form-select" id="mt-mezzo">${vehOptions(t.mezzo)}</select></div>
      <div class="col-md-3"><label class="lbl">Km</label><input type="number" class="form-control" id="mt-km" value="${escA(t.km || '')}"></div>
      <div class="col-md-3"><label class="lbl">Priorità</label><select class="form-select" id="mt-prio">${['bassa', 'normale', 'alta', 'urgente'].map(p => `<option ${(t.priorita || 'normale') === p ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
      <div class="col-md-6"><label class="lbl">Categoria</label><select class="form-select" id="mt-cat">${catOptions(t.categoria)}</select></div>
      <div class="col-md-6">${fieldOp('mt-op', 'Operatore segnalazione', t.operatoreSegnalazione || '')}</div>
      <div class="col-12"><label class="lbl">Descrizione</label><textarea class="form-control" id="mt-desc" rows="4">${esc(t.problema)}</textarea></div>
      <div class="col-12"><div class="form-check form-switch"><input class="form-check-input" type="checkbox" id="mt-fermo" ${t.fermo ? 'checked' : ''}><label class="form-check-label fw-bold text-danger small" for="mt-fermo">Veicolo fermo / non utilizzabile</label></div></div></div>`,
    footer:`<button class="btn btn-light" data-bs-dismiss="modal">Annulla</button><button class="btn btn-primary fw-bold" id="mt-ok">Salva</button>`});
  $('#mt-ok', m.el).onclick = () => {
    if (!v('mt-desc', m.el)) { toast('La descrizione non può essere vuota', 'warn'); return; }
    const ch = applyChanges(t, {mezzo:v('mt-mezzo', m.el), km:v('mt-km', m.el), priorita:v('mt-prio', m.el), categoria:v('mt-cat', m.el), operatoreSegnalazione:v('mt-op', m.el), problema:v('mt-desc', m.el), fermo:v('mt-fermo', m.el)},
      {mezzo:'Veicolo', km:'Km', priorita:'Priorità', categoria:'Categoria', operatoreSegnalazione:'Operatore', problema:'Descrizione', fermo:'Fermo'});
    if (ch.length) { addEv(t, 'modifica', 'Modificato: ' + changesText(ch)); logA('Modifica', `${t.mezzo}: ${changesText(ch)}`, {tipo:'ticket', id:t.id}); Store.save('tickets'); toast('Segnalazione aggiornata', 'ok'); }
    m.close();
  };
}
async function eliminaTicket(id) {
  const t = findTicket(id); if (!t) return;
  if (!await confirmDlg(`Annullare la segnalazione di ${esc(t.mezzo)}?\n"${esc(t.problema.slice(0, 120))}"\n\nNon verrà persa: resterà nel cestino dell'area Admin.`, {danger:true, ok:'Annulla segnalazione'})) return;
  toTrash('segnalazione', t, {mezzo:t.mezzo});
  DB.tickets = DB.tickets.filter(x => x.id !== id);
  logA('Eliminazione', `Segnalazione ${t.mezzo} annullata: ${t.problema.slice(0, 100)}`, {tipo:'ticket', id});
  Store.save('tickets'); if (Scheda.m) Scheda.m.close();
}

/* =================== STAMPA MODULO =================== */
function fillModulo(r) {
  const s = (id, val) => { const e = document.getElementById(id); if (e) e.innerText = val || ''; };
  s('p-data', r.dataSegnalazione); s('p-falco', r.mezzo ? `${r.mezzo} (${targa(r.mezzo)})` : ''); s('p-km', r.km); s('p-operatore', r.operatoreSegnalazione);
  s('p-cat', r.categoria ? `[${r.categoria.toUpperCase()}]` : ''); s('p-descrizione', r.problema);
  s('p-app-off', r.officinaAppuntamento); s('p-app-data', fmtD(r.dataAppuntamento)); s('p-app-ora', r.dataAppuntamentoOra); s('p-app-op', r.operatoreAppuntamento); s('p-app-cons', r.operatoreConsegna); s('p-app-note', r.noteAppuntamento);
  const ei = r.emailInformativa || {}; s('p-em-data', ei.data); s('p-em-op', ei.operatore);
  const p = r.preventivo || {}; s('p-em-prev', p.stato ? (p.stato === 'non_richiesto' ? 'no' : 'si') + (p.importo ? ' · ' + eur(p.importo) : '') : 'si | no');
  s('p-em-soglia', p.importo ? (p.sopraSoglia ? `+${SET().sogliaPreventivo}€` : `-${SET().sogliaPreventivo}€`) : `+${SET().sogliaPreventivo}€ | -${SET().sogliaPreventivo}€`);
  s('p-em-aut', p.dataAutorizzazione ? fmtD(p.dataAutorizzazione) + (p.autorizzatoDa ? ' - ' + p.autorizzatoDa : '') : '');
  const ch = parseDate(r.dataChiusura); s('p-rit-data', ch ? fmtD(ch) : ''); s('p-rit-ora', ch && /\d:\d/.test(r.dataChiusura) ? hhmm(ch) : ''); s('p-rit-km', r.kmRitiro || (r.dataChiusura ? r.km : '')); s('p-rit-op', r.chiusoDa || ''); s('p-rit-opr', r.operatoreRitiro); s('p-rit-int', r.intervento + (r.costo ? `\n\nCosto: ${eur(r.costo)}` : '') + (r.documento ? `\nDoc: ${r.documento}` : ''));
  s('p-soglia-note', `Se superiore a ${SET().sogliaPreventivo}€ attendere autorizzazione`); s('p-rev', 'Ultima revisione ' + SET().revisioneModulo);
}
function printMode(cls) { document.body.classList.add(cls); setTimeout(() => { window.print(); setTimeout(() => document.body.classList.remove(cls), 800); }, 80); }
function stampaModuloTicket(id) { const t = findTicket(id); if (!t) return; fillModulo(t); logA('Stampa', `Modulo stampato: ${t.mezzo}`, {tipo:'ticket', id}); printMode('print-modulo'); }
function stampaModuloRecord(mezzo, id) { const r = (DB.flotta[mezzo] || []).find(x => x.id === id); if (!r) return; fillModulo({...r, mezzo:r.mezzo || mezzo}); printMode('print-modulo'); }
function stampaModuloVuoto() {
  fillModulo({mezzo:v('sg-mezzo'), km:v('sg-km'), operatoreSegnalazione:v('sg-op'), problema:v('sg-desc'), categoria:v('sg-cat'), dataSegnalazione:nowTS()});
  printMode('print-modulo');
}
