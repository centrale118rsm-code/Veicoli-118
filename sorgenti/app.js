'use strict';
/* =====================================================================
   APP — navigazione, intestazione, dashboard, avvisi, rubrica, guida
   ===================================================================== */
const VIEWS = [
  ['dashboard', 'fa-gauge-high', 'Bacheca'], ['calendario', 'fa-calendar-alt', 'Calendario'], ['storico', 'fa-history', 'Storico'],
  ['manutenzioni', 'fa-calendar-check', 'Manutenzioni'], ['lavaggi', 'fa-shower', 'Lavaggi'], ['rubrica', 'fa-address-book', 'Rubrica'],
  ['guida', 'fa-book', 'Guida'], ['admin', 'fa-user-shield', 'Admin']
];
const App = {
  view: 'dashboard', ready: false, _raf: null,
  build() {
    const tab = ([k, i, l]) => `<button class="nav-tab ${k === 'admin' ? 'admin-tab' : ''}" data-view="${k}" onclick="App.go('${k}')"><i class="fas ${i}"></i>${l}<span class="nbadge d-none" id="nb-${k}"></span></button>`;
    $('#app-nav').innerHTML = `<div class="inner">${VIEWS.filter(x => x[0] !== 'admin').map(tab).join('')}<button class="nav-new" onclick="nuovoIntervento()"><i class="fas fa-plus-circle"></i>Nuovo intervento</button>${tab(VIEWS.find(x => x[0] === 'admin'))}</div>`;
    document.body.insertAdjacentHTML('beforeend', '<button class="fab-new" onclick="nuovoIntervento()"><i class="fas fa-plus-circle me-2"></i>NUOVO INTERVENTO</button>');
    $('#views').innerHTML = VIEWS.map(([k]) => `<section class="view" id="view-${k}"></section>`).join('');
    const h = (location.hash || '').slice(1); if (VIEWS.some(x => x[0] === h)) this.view = h;
    window.addEventListener('hashchange', () => { const x = location.hash.slice(1); if (x !== this.view && VIEWS.some(y => y[0] === x)) this.go(x); });
  },
  go(k) {
    this.view = k; $$('.nav-tab').forEach(b => b.classList.toggle('active', b.dataset.view === k));
    $$('.view').forEach(s => s.classList.toggle('active', s.id === 'view-' + k));
    if (location.hash.slice(1) !== k) history.replaceState(null, '', '#' + k);
    this.renderView(true); window.scrollTo({top:0});
  },
  renderView(force) {
    const sec = $('#view-' + this.view); if (!sec) return;
    const a = document.activeElement;
    if (!force && a && sec.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== 'checkbox') return;   // non disturbare chi sta scrivendo
    ({dashboard:renderDashboard, calendario:renderCalendario, storico:renderStorico, manutenzioni:renderManutenzioni, lavaggi:renderLavaggi, rubrica:renderRubrica, guida:renderGuida, admin:renderAdmin})[this.view]();
  },
  refresh() {
    cancelAnimationFrame(this._raf);
    this._raf = requestAnimationFrame(() => { try { this.renderHeader(); this.renderBadges(); this.renderView(false); Scheda.refresh(); } catch (e) { console.error(e); } });
  },
  renderHeader() {
    if (!DB.config) return; const s = SET();
    $('#hdr-title').textContent = s.titolo; $('#hdr-sub').textContent = s.nomeEnte; document.title = `${s.titolo} · ${s.nomeEnte}`;
    const op = currentOp();
    $('#hdr-op').innerHTML = `<i class="fas fa-user"></i>${op ? esc(op) : '<span class="opacity-75">Chi sei?</span>'}`;
    $('#hdr-cloud').innerHTML = `<span class="cloud-dot ${Store.status}"></span><span class="d-none d-md-inline">${esc(Store.statusMsg)}</span>`; $('#hdr-cloud').title = Store.statusMsg;
    const ab = $('#hdr-admin'); ab.classList.toggle('on', Admin.isOn()); ab.innerHTML = Admin.isOn() ? '<i class="fas fa-unlock"></i><span class="d-none d-sm-inline">Admin</span>' : '<i class="fas fa-lock"></i><span class="d-none d-sm-inline">Admin</span>';
  },
  renderBadges() {
    const set = (k, n, cls = '') => { const b = $('#nb-' + k); if (!b) return; b.textContent = n; b.className = 'nbadge ' + cls + (n ? '' : ' d-none'); };
    set('dashboard', DB.tickets.length, 'amber');
    set('manutenzioni', duePlans().filter(x => x.s.stato === 'over').length);
    set('lavaggi', vehicles().filter(vh => { const a = washAge(vh.nome); return a === null || a > SET().sogliaLavaggio; }).length);
  },
  onDataReady() {
    if (this.ready) return; this.ready = true;
    seedV15IfEmpty(); generatePlans(); Backup.local(); syncAutistiTurni();
    this.refresh();
    const next = () => { if (SET().avvisiAvvio) setTimeout(() => checkAvvisi(false), 300); };
    if (SET().chiediOperatore && !currentOp()) setTimeout(() => pickOperator(next), 400); else next();
  }
};

/* =================== BACHECA AVVISI =================== */
function checkAvvisi(force) {
  const td = todayISO(), tm = isoD(new Date(Date.now() + 864e5));
  const items = []; let beep = false;
  DB.tickets.filter(t => t.stato === 'segnalato' && t.dataAppuntamento && (t.dataAppuntamento === td || t.dataAppuntamento === tm)).forEach(t => items.push({g:'Appuntamenti e ritiri', c:t.dataAppuntamento === td ? 'ab-oggi' : 'ab-domani', h:`${t.dataAppuntamento === td ? '<span class="badge bg-danger">OGGI</span>' : '<span class="badge bg-info text-dark">DOMANI</span>'} <b>${esc(t.mezzo)}</b> ore ${esc(t.dataAppuntamentoOra || '--:--')} · ${esc(t.officinaAppuntamento || '')}`, go:`Scheda.open(${t.id},1)`}));
  DB.tickets.filter(t => t.stato === 'in_officina' && t.dataStimataConsegna && (t.dataStimataConsegna === td || t.dataStimataConsegna === tm)).forEach(t => { const o = t.dataStimataConsegna === td; if (o) beep = true; items.push({g:'Appuntamenti e ritiri', c:o ? 'ab-ritiro' : 'ab-domani', h:`${o ? '<span class="badge bg-dark text-warning">RITIRO OGGI</span>' : '<span class="badge bg-success">RITIRO DOMANI</span>'} <b>${esc(t.mezzo)}</b> da ${esc(t.officina)}${t.dataStimataConsegnaOra ? ' ore ' + esc(t.dataStimataConsegnaOra) : ''}`, go:`Scheda.open(${t.id},4)`}); });
  DB.tickets.filter(t => t.stato === 'in_officina' && t.dataStimataConsegna && t.dataStimataConsegna < td).forEach(t => items.push({g:'Appuntamenti e ritiri', c:'ab-guasto', h:`<span class="badge bg-danger">RITIRO IN RITARDO</span> <b>${esc(t.mezzo)}</b> da ${esc(t.officina)} (previsto ${fmtD(t.dataStimataConsegna)})`, go:`Scheda.open(${t.id},3)`}));
  DB.tickets.filter(t => t.stato === 'segnalato').forEach(t => items.push({g:'Guasti segnalati', c:'ab-guasto', h:`<div class="d-flex justify-content-between"><b class="text-danger"><i class="fas fa-exclamation-circle me-1"></i>${esc(t.mezzo)}${t.fermo ? ' · FERMO' : ''}</b><span class="small text-muted">${esc(t.dataSegnalazione)}</span></div><div class="small text-muted"><i class="fas fa-user me-1"></i>${esc(t.operatoreSegnalazione || 'N/D')}</div><div>${esc(t.problema)}</div>`, go:`Scheda.open(${t.id})`}));
  duePlans().forEach(({p, s}) => items.push({g:'Manutenzione programmata', c:'ab-scad', h:`<span class="pstat ${s.stato}" style="min-width:auto;padding:2px 8px">${PSTAT_L[s.stato]}</span> <b>${esc(p.mezzo)}</b> · ${esc(p.nome)} <span class="small text-muted">${esc(pstatText(s))}</span>`, go:`dettaglioPiano(${p.id})`}));
  vehicles().forEach(vh => { const a = washAge(vh.nome); if (a === null || a > SET().sogliaLavaggio) items.push({g:'Lavaggi', c:'ab-lav', h:`<i class="fas fa-shower me-1 text-info"></i><b>${esc(vh.nome)}</b>: ${a === null ? 'nessun lavaggio registrato' : 'ultimo lavaggio ' + a + ' giorni fa'}`, go:`modalLavaggio('${jsq(vh.nome)}')`}); });
  DB.notes.filter(n => n.date === td).forEach(n => items.push({g:'Note di oggi', c:'ab-nota', h:`<i class="fas fa-sticky-note me-1"></i>${esc(n.text)}`, go:`apriGiorno('${td}')`}));
  const crit = items.filter(i => i.g !== 'Lavaggi' && i.g !== 'Note di oggi').length;
  if (!force && !crit) return;
  const groups = [...new Set(items.map(i => i.g))];
  const m = openModal({title:'<i class="fas fa-bell me-2"></i>BACHECA AVVISI', color:'red', size:'modal-lg',
    body:items.length ? groups.map(g => `<div class="sec-title mt-0">${g}</div>${items.filter(i => i.g === g).map(i => `<div class="ab ${i.c}" style="cursor:pointer" data-go="${escA(i.go)}">${i.h}</div>`).join('')}`).join('') : '<div class="empty"><i class="fas fa-check-circle text-success"></i><h5>Nessun avviso</h5>Buon lavoro!</div>',
    footer:'<button class="btn btn-dark w-100 fw-bold" id="ab-ok" data-bs-dismiss="modal">HO PRESO VISIONE</button>'});
  $('#ab-ok', m.el).addEventListener('click', () => logA('Avvisi', `Presa visione bacheca avvisi (${items.length} avvisi)`));
  m.el.addEventListener('click', e => { const d = e.target.closest('[data-go]'); if (d) { m.close(); setTimeout(() => new Function(d.dataset.go)(), 300); } });
  if (beep && SET().suono) setTimeout(playBeep, 500);
}
function playBeep() { try { const c = new (window.AudioContext || window.webkitAudioContext)(), o = c.createOscillator(), g = c.createGain(); o.connect(g); g.connect(c.destination); o.type = 'sine'; o.frequency.setValueAtTime(880, c.currentTime); g.gain.setValueAtTime(.1, c.currentTime); o.start(c.currentTime); o.frequency.setValueAtTime(0, c.currentTime + .1); o.frequency.setValueAtTime(880, c.currentTime + .2); o.stop(c.currentTime + .4); } catch (e) {} }

/* =================== RUBRICA =================== */
let rubQ = '';
function renderRubrica() {
  const el = $('#view-rubrica'); const q = norm(rubQ);
  const used = Object.fromEntries(countBy(Object.values(DB.flotta).flat(), r => canonOfficina(r.officina)));
  const list = officine().filter(o => !q || norm(`${o.nome} ${o.tipo} ${o.telefono} ${o.email} ${(o.alias || []).join(' ')}`).includes(q));
  el.innerHTML = `<div class="view-title"><h2><i class="fas fa-address-book text-primary me-2"></i>Rubrica officine</h2><span class="sub">Modificabile dall'area Admin</span>
      <div class="actions"><input class="form-control form-control-sm" id="rub-q" placeholder="Cerca…" value="${escA(rubQ)}" style="width:200px"><button class="btn btn-sm btn-outline-success" onclick="emailComunicazione()"><i class="fas fa-envelope me-1"></i>Nuova email</button></div></div>
    <div class="row g-3">${list.map(o => `<div class="col-md-6 col-xl-4"><div class="rub-card"><div class="av">${esc(o.nome.slice(0, 2).toUpperCase())}</div><div class="flex-grow-1 min-w-0"><div class="fw-bold">${esc(o.nome)}</div><div class="small text-muted">${esc(o.tipo || '')}${o.indirizzo ? ' · ' + esc(o.indirizzo) : ''}</div><div class="small text-muted">${used[o.nome] || 0} interventi nello storico</div>
      <div class="d-flex flex-wrap gap-1 mt-2">${o.telefono ? `<a href="tel:${escA(o.telefono.replace(/\s/g, ''))}" class="btn btn-sm btn-success rounded-pill fw-bold"><i class="fas fa-phone me-1"></i>${esc(o.telefono)}</a>` : ''}${o.email ? `<a href="mailto:${escA(o.email)}" class="btn btn-sm btn-outline-success rounded-pill"><i class="fas fa-at me-1"></i>Email</a>` : ''}<button class="btn btn-sm btn-outline-secondary rounded-pill" onclick="Object.assign(SF,{off:'${jsq(o.nome)}',tab:'lista'});App.go('storico')"><i class="fas fa-history me-1"></i>Storico</button></div></div></div></div>`).join('') || '<div class="empty"><i class="fas fa-search"></i>Nessuna officina</div>'}</div>
    <div class="sec-title mt-4">Gruppi email</div><div class="row g-3">${(CFG().gruppiEmail || []).map(g => `<div class="col-md-6 col-xl-4"><div class="rub-card"><div class="av" style="background:var(--green-l);color:var(--green)"><i class="fas fa-users"></i></div><div class="min-w-0"><div class="fw-bold">${esc(g.nome)}</div><div class="small text-muted">${splitAddr(g.indirizzi).length} indirizzi</div><button class="btn btn-sm btn-outline-success rounded-pill mt-2" onclick="composeEmail('comunicazione',{data:nowTS(),operatore:currentOp()},{gruppi:['${g.id}']})"><i class="fas fa-paper-plane me-1"></i>Scrivi al gruppo</button></div></div></div>`).join('')}</div>`;
  $('#rub-q').oninput = debounce(e => { rubQ = e.target.value; renderRubrica(); const i = $('#rub-q'); i.focus(); i.setSelectionRange(99, 99); }, 200);
}

/* =================== GUIDA =================== */
function renderGuida() {
  $('#view-guida').innerHTML = `<div class="card-x manual"><div class="bd p-4" style="max-width:900px">
    <h3 class="fw-bold">Guida al gestionale veicoli</h3><p class="lead">Versione ${APP_VERSION}. Tutti i dati della versione precedente sono conservati e utilizzati.</p>
    <h4><i class="fas fa-user-check me-2"></i>0. Chi sei</h4><p>All'apertura scegli il tuo nome (tasto con il tuo cognome). Ogni operazione viene registrata con nome, data/ora e dispositivo: lo trovi in <b>Storico → Chi ha fatto cosa</b>. Puoi cambiare nome dal pulsante con l'omino in alto. I nomi degli autisti vengono letti dall'app Turni.</p>
    <h4><i class="fas fa-exclamation-triangle me-2"></i>1. Segnalare un guasto</h4><p>Nella <b>Bacheca</b> compila la scheda a sinistra: veicolo, km, operatore (tocca il tuo nome nei tasti rapidi), descrizione. Indica la priorità e se il mezzo è <b>fermo</b>. La categoria viene riconosciuta in automatico se non la scegli.</p>
    <h4><i class="fas fa-shoe-prints me-2"></i>2. I 5 passi della riparazione</h4><p>Ogni segnalazione ha una <b>Scheda intervento</b> che segue il modulo cartaceo:</p>
    <ol><li><b>Segnalazione</b> — riscontro del guasto.</li><li><b>Appuntamento</b> — officina, data, ora (tasti rapidi per le officine), file calendario .ics, email all'Economato.</li><li><b>Email / Preventivo</b> — invio email informativa, importo del preventivo; oltre ${eur(SET().sogliaPreventivo)} va registrata l'autorizzazione.</li><li><b>In officina</b> — chi porta il mezzo, data prevista di ritiro, note dell'officina.</li><li><b>Ritiro</b> — intervento eseguito, km, costo, n. fattura: l'intervento passa allo storico e il mezzo torna operativo.</li></ol>
    <p>Il <b>Diario</b> a destra della scheda raccoglie ogni passo con data e nome. Se il guasto si risolve senza officina usa <b>Risolto senza officina</b>.</p>
    <h4><i class="fas fa-calendar-check me-2"></i>3. Manutenzione programmata</h4><p>Per ogni veicolo ci sono piani (tagliando, revisione, gomme invernali/estive, vano sanitario, estintore) con <b>checklist</b> dei passi. L'app riconosce le esecuzioni già presenti nello storico. Stati: <span class="pstat ok" style="min-width:auto">In regola</span> <span class="pstat due" style="min-width:auto">In scadenza</span> <span class="pstat over" style="min-width:auto">Scaduta</span>. Aggiorna i km con il pulsante <b>Km</b> per avere le scadenze chilometriche precise.</p>
    <h4><i class="fas fa-history me-2"></i>4. Storico</h4><p>Filtri per veicolo, tipo, categoria, officina, anno e testo; report stampabile, PDF ed Excel; statistiche. Clicca un intervento per vedere tutti i passi, il diario e lo <b>storico delle modifiche</b> (chi ha cambiato cosa).</p>
    <h4><i class="fas fa-lock me-2"></i>5. Password e Admin</h4><div class="alert alert-warning"><b>Password:</b> <code>ambulanza</code> (modificabile in Admin → Impostazioni). Serve per l'area Admin, per modificare/eliminare lo storico e i lavaggi.</div><p>Nell'<b>area Admin</b> gestisci veicoli, operatori, officine, categorie, gruppi email, modelli email (oggetto e testo con campi automatici), piani di manutenzione, segnalazioni, cestino, registro attività, backup.</p>
    <h4><i class="fas fa-trash-restore me-2"></i>6. Nessun dato si perde</h4><p>Ogni eliminazione va nel <b>cestino</b> (Admin) e si può ripristinare. Ogni giorno viene fatta una copia di sicurezza automatica nel cloud e nel browser.</p>
    <h4><i class="fas fa-shower me-2"></i>7. Lavaggi</h4><p>Pulsante <b>Lavaggio</b>. Icona rossa sulla card del mezzo = non lavato da più di ${SET().sogliaLavaggio} giorni.</p></div></div>`;
}

/* =================== DATI STORICI INIZIALI (solo se il database è vuoto) =================== */
function seedV15IfEmpty() {
  if (Object.values(DB.flotta).some(a => a.length) || Store.cloudExists.flotta !== false) return;   // solo se il cloud conferma che non esiste nulla
  const db = {
    'Falco 27':[["26/10/2022","29604","Meccanica","Autoplanet","Barbieri","Tagliando completo"],["21/03/2024","34746","Meccanica","Autoplanet","Berardi","Tagliando + freni"],["04/04/2024","34784","Meccanica","Autoplanet","Volpini","Frizione, Volano, Assetto"],["09/05/2024","35214","Meccanica","Autoplanet","Volpini","Manicotto intercooler, DPF"],["02/07/2024","35361","Elettrica","Autoplanet","Ghiotti","Sostituzione Batteria"],["07/05/2025","35920","Pneumatici","Titan Gomme","Berardi","Montate estive"],["31/10/2025","36271","Pneumatici","Titan Gomme","Michelotti","Da estive a termiche"]],
    'Falco 28':[["12/02/2023","","Meccanica","Auto Planet","Michelotti","Pasticche freni post"],["01/04/2023","","Elettrica","Cesarini","Michelotti","Lampadina+luce targa"],["14/06/2023","110000","Meccanica","Auto Planet","Michelotti","Distribuzione+Tagliando"],["26/06/2023","113300","Meccanica","Auto Planet","Michelotti","Pasticche freni ant+post"],["25/09/2023","114492","Meccanica","Auto Planet","Volpini","Turbina+sospensioni"],["25/07/2025","120073","Meccanica","Autoplanet","Michelotti","Valvola+manicotto turbo"],["30/10/2025","122000","Pneumatici","Titan Gomme","Michelotti","Estive->termiche"]],
    'Falco 29':[["09/04/2024","","Carrozzeria","Menicucci","Michelotti","Ammaccatura portellone"],["11/09/2024","","Elettrica","Cesarini","Michelotti","Altoparlante sirena"],["12/11/2024","","Meccanica","Reggini","Michelotti","Tagliando+sensore freni"],["11/02/2025","","Carrozzeria","Menicucci","Brizzi","Bulloni pedana laterale"],["02/07/2025","53830","Meccanica","Auto Planet","Volpini","Pasticche freni"],["23/07/2025","54473","Meccanica","Reggini","Archivio","Cambio olio"],["25/07/2025","54500","Altro","Centro Revisioni","Michelotti","Revisione"],["30/10/2025","56640","Pneumatici","Titan Gomme","Michelotti","Estive->termiche"],["19/12/2025","57580","Meccanica","Reggini","Michelotti","Serbatoio+centralina AdBlue"]],
    'Falco 30':[["13/01/2025","23820","Pneumatici","Titan Gomme","Michelotti","4 gomme termiche"],["14/01/2025","23827","Meccanica","Auto Planet","Michelotti","Pastiglie freni+sensore"],["07/04/2025","27368","Pneumatici","Titan Gomme","Archivio","Termiche->estive"],["24/06/2025","30029","Altro","Vision","Michelotti","Perdita AC"],["21/07/2025","31037","Meccanica","Auto Planet","Volpini","Dischi+pasticche ant"],["29/10/2025","35081","Pneumatici","Titan Gomme","Ghiotti","Estive->termiche"],["26/11/2025","35813","Altro","Reggini","Barbieri","Fuga AC vano sanitario"],["30/12/2025","37024","Meccanica","Reggini","Michelotti","Olio motore+filtri"]],
    'Falco 31':[["10/04/2025","16787","Altro","Vision Ambulanze","Volpini","Revisione vano sanitario"],["30/05/2025","19100","Altro","Centro rev. Acquaviva","Barbieri","Revisione vettura"],["17/06/2025","20378","Elettrica","Vision Ambulanze","Volpini","Malfunzionamento pedana laterale"],["09/07/2025","21008","Elettrica","Vision Ambulanze","Ghiotti","Pedana laterale centralina"],["15/07/2025","21020","Elettrica","Vision Ambulanze","Michelotti","Cavo luci cortesia scalino"],["18/07/2025","21290","Meccanica","Reggini","Ghiotti","Pasticche freni anteriori"],["29/08/2025","23173","Carrozzeria","Menicucci","Bianchi","Riparazione pedana laterale"],["11/09/2025","23728","Carrozzeria","Menicucci","Sarti","Riparazione finestrino"],["30/10/2025","25300","Pneumatici","Titan Gomme","Michelotti","Cambio gomme estive->termiche"],["03/12/2025","26376","Carrozzeria","Menicucci","Volpini","Pedana laterale ingranaggio"]]
  };
  Object.entries(db).forEach(([v2, rs]) => { DB.flotta[v2] = DB.flotta[v2] || []; rs.forEach(([d, km, cat, off, op, desc]) => DB.flotta[v2].push({id:uid(), veicolo:v2, dataSegnalazione:d, km, categoria:cat, operatoreSegnalazione:op, problema:desc, stato:'concluso', officina:off, operatoreConsegna:'Storico', dataIngresso:d, operatoreRitiro:op, dataChiusura:d, intervento:'Storico importato'})); });
  logA('Sistema', 'Database vuoto: caricato lo storico iniziale della v15'); Store.save('flotta');
}

/* =================== AVVIO =================== */
function startClock() { const tick = () => { const n = new Date(); const c = $('#hdr-clock'); if (c) c.innerHTML = `<i class="far fa-clock"></i>${n.toLocaleDateString('it-IT', {weekday:'short', day:'2-digit', month:'2-digit'})} ${n.toLocaleTimeString('it-IT')}`; }; tick(); setInterval(tick, 1000); }
function initApp() {
  Store.init(); App.build(); App.renderHeader(); startClock();
  $('#hdr-search').addEventListener('keydown', e => { if (e.key === 'Enter') { SF.testo = e.target.value; SF.tab = 'lista'; SF.aperti = true; e.target.value = ''; e.target.blur(); App.go('storico'); } });
  if (TEST_MODE) { const b = $('#test-banner'); b.classList.remove('d-none'); }
  App.go(App.view);
  document.addEventListener('click', () => Admin.touch(), {passive:true});
  setInterval(() => { if (!Admin.isOn() && $('#hdr-admin').classList.contains('on')) { App.renderHeader(); if (App.view === 'admin') renderAdmin(); } }, 15000);
  setInterval(() => App.refresh(), 5 * 60000);   // aggiorna conteggi giorni/scadenze
  window.addEventListener('beforeunload', () => Store.push());
  setTimeout(() => { if (!App.ready) { Store.setStatus('err', 'Cloud non raggiungibile: dati locali'); App.onDataReady(); } }, 8000);
}
function resetTestData() {
  confirmDlg('Cancellare le modifiche fatte in questa prova e ricaricare i dati reali dal cloud?').then(ok => {
    if (!ok) return; Object.keys(localStorage).filter(k => k.startsWith('RC16_') && k !== 'RC16_operatore_attivo').forEach(k => localStorage.removeItem(k)); location.reload();
  });
}
