'use strict';
/* =====================================================================
   BACHECA (dashboard) — ordinata in 4 blocchi:
   intestazione + NUOVO INTERVENTO · azioni rapide · stato flotta ·
   lavori in corso (sx) + agenda / da fare (dx)
   ===================================================================== */
const PRIO_ORD = {urgente:0, alta:1, normale:2, bassa:3};

function dashVehCard(vh, st, due, soglia) {
  const ck = currentKm(vh.nome), a = washAge(vh.nome);
  const alerts = [
    ...due.filter(x => x.p.mezzo === vh.nome).map(x => `<span class="pill ${x.s.stato === 'over' ? 'pill-red' : 'pill-amber'}" title="${escA(x.p.nome + ': ' + pstatText(x.s))}"><i class="fas fa-calendar-check"></i>${esc(x.p.nome.split(' (')[0].split(' / ')[0].replace('Montaggio ', '').replace('Revisione vano sanitario', 'Vano sanitario'))}</span>`),
    ...(a === null || a > soglia ? ['<span class="pill pill-cyan"><i class="fas fa-shower"></i>Lavaggio</span>'] : [])
  ];
  return `<div class="vcard ${vehClass(vh.nome)} is-${st.k}" onclick="apriStorico('${jsq(vh.nome)}')">
    <div class="top"><div class="vic"><i class="fas ${vehIcon(vh.nome)}"></i></div><div class="min-w-0"><div class="nm">${esc(vh.nome)}</div><div class="pl">${esc(vh.targa || '')} <span class="ty">${esc(vh.tipo)}</span></div></div></div>
    <span class="vstate ${st.c}">${st.l}</span>
    <div class="vmeta"><span><i class="fas fa-tachometer-alt"></i>${ck.km !== null ? ck.km.toLocaleString('it-IT') + ' km' : 'km n/d'}</span><span class="${a === null || a > soglia ? 'warn' : 'ok'}"><i class="fas fa-shower"></i>${a === null ? 'mai lavato' : a === 0 ? 'lavato oggi' : `lavato ${a} gg fa`}</span></div>
    ${alerts.length ? `<div class="valerts">${alerts.slice(0, 3).join('')}${alerts.length > 3 ? `<span class="pill pill-gray">+${alerts.length - 3}</span>` : ''}</div>` : ''}</div>`;
}

function dashTicket(t) {
  const isOff = t.stato === 'in_officina'; const p = t.preventivo || {}; const na = nextAction(t);
  const late = isOff && t.dataStimataConsegna && daysDiff(new Date(), t.dataStimataConsegna) <= 0;
  const meta = isOff
    ? `<span><i class="fas fa-tools"></i><b>${esc(t.officina)}</b> dal ${fmtD(t.dataIngresso)}</span><span class="${late ? 'text-danger fw-bold' : ''}"><i class="fas fa-flag-checkered"></i>Ritiro ${t.dataStimataConsegna ? fmtD(t.dataStimataConsegna) + ' (' + relDays(t.dataStimataConsegna) + ')' : 'da definire'}</span>`
    : (t.dataAppuntamento ? `<span class="${t.dataAppuntamento < todayISO() ? 'text-danger' : 'text-success'} fw-bold">${t.dataAppuntamento < todayISO() ? '<i class="fas fa-exclamation-triangle"></i>Appuntamento passato: ' : ''}<i class="fas fa-calendar-check"></i>${fmtD(t.dataAppuntamento)} ${esc(t.dataAppuntamentoOra || '')} · ${esc(t.officinaAppuntamento || '')} (${relDays(t.dataAppuntamento)})</span>` : '<span class="text-muted"><i class="far fa-calendar"></i>Appuntamento da fissare</span>');
  return `<div class="tk ${isOff ? 'officina' : ''} ${t.fermo ? 'fermo' : ''}">
    <div class="row1"><span class="mz"><i class="fas ${vehIcon(t.mezzo)} me-1 opacity-50"></i>${esc(t.mezzo)}</span>${catPill(t.categoria)}${t.priorita && t.priorita !== 'normale' ? `<span class="pill ${PRIO[t.priorita]}">${esc(t.priorita)}</span>` : ''}${t.fermo ? '<span class="pill pill-red"><i class="fas fa-ban"></i>fermo</span>' : ''}${p.sopraSoglia && !p.dataAutorizzazione ? '<span class="pill pill-violet">attesa autorizzazione</span>' : ''}
      <span class="ms-auto small text-muted nowrap">${esc(fmtD(t.dataSegnalazione))} · ${esc(t.operatoreSegnalazione || 'N/D')}</span></div>
    <div class="pb clamp2" title="${escA(t.problema)}">${esc(t.problema)}</div>
    <div class="meta">${meta}</div>
    <div class="tk-foot"><div class="steps-wrap">${miniSteps(t)}</div>
      <div class="d-flex gap-2"><button class="btn btn-sm btn-light border" onclick="Scheda.open(${t.id})"><i class="fas fa-folder-open me-1"></i>Scheda</button><button class="btn btn-sm ${na.c} fw-bold" onclick="${na.f}"><i class="fas ${na.i} me-1"></i>${na.l}</button></div></div></div>`;
}

function dashAgenda() {
  const ag = []; const td = todayISO(), lim = isoD(new Date(Date.now() + 7 * 864e5));
  DB.tickets.forEach(t => {
    if (t.stato === 'segnalato' && t.dataAppuntamento) ag.push({d:t.dataAppuntamento, h:t.dataAppuntamentoOra || '', ic:'fa-calendar-check', c:'ag-app', x:`<b>${esc(t.mezzo)}</b> · appuntamento ${esc(t.officinaAppuntamento || '')}`, go:`Scheda.open(${t.id},1)`});
    if (t.stato === 'in_officina' && t.dataStimataConsegna) ag.push({d:t.dataStimataConsegna, h:t.dataStimataConsegnaOra || '', ic:'fa-flag-checkered', c:'ag-rit', x:`<b>${esc(t.mezzo)}</b> · ritiro da ${esc(t.officina)}`, go:`Scheda.open(${t.id},4)`});
  });
  DB.notes.forEach(n => ag.push({d:n.date, h:'', ic:'fa-sticky-note', c:'ag-nota', x:esc(n.text), go:`apriGiorno('${n.date}')`}));
  return ag.filter(e => e.d <= lim && (e.d >= td || e.c === 'ag-rit')).sort((a, b) => (a.d + a.h).localeCompare(b.d + b.h));
}

function renderDashboard() {
  const el = $('#view-dashboard');
  const vs = vehicles(); const states = vs.map(vh => vehState(vh.nome));
  const att = DB.tickets.filter(t => t.stato === 'segnalato'), off = DB.tickets.filter(t => t.stato === 'in_officina');
  const due = duePlans(); const soglia = SET().sogliaLavaggio;
  const dirty = vs.filter(vh => { const a = washAge(vh.nome); return a === null || a > soglia; });
  const nOp = states.filter(s => s.k === 'operativa').length;
  const nAvv = att.length + off.filter(t => t.dataStimataConsegna && t.dataStimataConsegna <= todayISO()).length + due.filter(x => x.s.stato === 'over').length;
  const sortT = arr => arr.slice().sort((a, b) => (b.fermo - a.fermo) || (PRIO_ORD[a.priorita || 'normale'] - PRIO_ORD[b.priorita || 'normale']) || a.id - b.id);
  const agenda = dashAgenda(); const td = todayISO();

  el.innerHTML = `
    <div class="dash-head">
      <div><h2 class="mb-0 fw-bold">Bacheca</h2><div class="text-muted small text-capitalize">${new Date().toLocaleDateString('it-IT', {weekday:'long', day:'numeric', month:'long', year:'numeric'})}</div></div>
      <button class="btn-new-big" onclick="nuovoIntervento()"><span class="plus"><i class="fas fa-plus"></i></span><span class="txt"><b>NUOVO INTERVENTO</b><small>Segnala un guasto o un problema</small></span></button>
    </div>

    <div class="quick-row">
      <button class="qa" onclick="checkAvvisi(true)"><span class="ic ic-red"><i class="fas fa-bell"></i></span>Avvisi${nAvv ? `<span class="badge bg-danger rounded-pill ms-auto">${nAvv}</span>` : ''}</button>
      <button class="qa" onclick="modalLavaggio()"><span class="ic ic-cyan"><i class="fas fa-shower"></i></span>Lavaggio</button>
      <button class="qa" onclick="modalGomme()"><span class="ic ic-gray"><i class="fas fa-compact-disc"></i></span>Gomme</button>
      <button class="qa" onclick="modalKm()"><span class="ic ic-blue"><i class="fas fa-tachometer-alt"></i></span>Km</button>
      <button class="qa" onclick="emailComunicazione()"><span class="ic ic-green"><i class="fas fa-envelope"></i></span>Email</button>
    </div>

    <div class="card-x"><div class="hd"><span class="ic ic-blue"><i class="fas fa-truck-medical"></i></span>Stato flotta
      <span class="right"><span class="pill pill-green">${nOp}/${vs.length} operativi</span>${att.length ? `<span class="pill pill-amber">${att.length} in attesa</span>` : ''}${off.length ? `<span class="pill pill-red">${off.length} in officina</span>` : ''}</span></div>
      <div class="bd"><div class="fleet mb-0">${vs.map((vh, i) => dashVehCard(vh, states[i], due, soglia)).join('')}</div></div></div>

    <div class="row g-3">
      <div class="col-lg-8">
        <div class="card-x"><div class="hd"><span class="ic ic-amber"><i class="fas fa-wrench"></i></span>Lavori in corso<span class="right">${DB.tickets.length ? `<span class="badge bg-secondary rounded-pill">${DB.tickets.length}</span>` : ''}</span></div>
          <div class="bd">${DB.tickets.length ? `
            ${off.length ? `<div class="sec-title mt-0"><i class="fas fa-tools text-danger"></i>In officina · ${off.length}</div>${sortT(off).map(dashTicket).join('')}` : ''}
            ${att.length ? `<div class="sec-title ${off.length ? '' : 'mt-0'}"><i class="fas fa-hourglass-half text-warning"></i>In attesa · ${att.length}</div>${sortT(att).map(dashTicket).join('')}` : ''}`
            : '<div class="empty"><i class="fas fa-check-circle text-success" style="opacity:.6"></i><h5 class="fw-light text-dark">Tutti i veicoli sono operativi</h5><button class="btn btn-outline-danger mt-2" onclick="nuovoIntervento()"><i class="fas fa-plus me-1"></i>Nuovo intervento</button></div>'}</div></div>
      </div>
      <div class="col-lg-4">
        <div class="card-x"><div class="hd"><span class="ic ic-violet"><i class="far fa-calendar-alt"></i></span>Prossimi 7 giorni<span class="right"><button class="btn btn-sm btn-link p-0" onclick="App.go('calendario')">calendario</button></span></div>
          <div class="bd p0">${agenda.length ? agenda.map(e => { const d = parseDate(e.d); return `<div class="ag-i ${e.c}" onclick="${e.go}"><div class="ag-d"><b>${d.getDate()}</b><small>${MONTHS[d.getMonth()].slice(0, 3)}</small></div><div class="min-w-0"><div class="small text-muted">${relDays(e.d)}${e.h ? ' · ore ' + esc(e.h) : ''}</div><div class="ag-x"><i class="fas ${e.ic} me-1"></i>${e.x}</div></div></div>`; }).join('') : '<div class="empty py-4"><i class="far fa-calendar-check"></i>Niente in programma</div>'}
            <div class="p-2 border-top text-center"><button class="btn btn-sm btn-link" onclick="apriGiorno('${td}')"><i class="fas fa-plus me-1"></i>Aggiungi una nota</button></div></div></div>
        <div class="card-x"><div class="hd"><span class="ic ic-green"><i class="fas fa-list-check"></i></span>Da fare<span class="right"><button class="btn btn-sm btn-link p-0" onclick="App.go('manutenzioni')">tutto</button></span></div>
          <div class="bd p0">${due.slice(0, 5).map(({p, s}) => `<div class="ag-i" onclick="dettaglioPiano(${p.id})"><span class="pstat ${s.stato} ag-st">${PSTAT_L[s.stato]}</span><div class="min-w-0"><div class="ag-x"><b>${esc(p.mezzo)}</b> · ${esc(p.nome)}</div><div class="small text-muted">${esc(pstatText(s))}</div></div></div>`).join('')}
            ${dirty.length ? `<div class="ag-i" onclick="App.go('lavaggi')"><span class="pstat due ag-st">Lavaggio</span><div class="min-w-0"><div class="ag-x">${dirty.map(vh => `<b>${esc(vh.nome)}</b>`).join(', ')}</div><div class="small text-muted">oltre ${soglia} giorni dall'ultimo lavaggio</div></div></div>` : ''}
            ${!due.length && !dirty.length ? '<div class="empty py-4"><i class="fas fa-check"></i>Tutto in regola</div>' : ''}${due.length > 5 ? `<div class="p-2 text-center small"><a href="#" onclick="App.go('manutenzioni');return false">altre ${due.length - 5}…</a></div>` : ''}</div></div>
      </div>
    </div>`;
}
