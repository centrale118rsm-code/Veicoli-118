'use strict';
/* =====================================================================
   MANUTENZIONE PROGRAMMATA — piani per veicolo, km, scadenze, checklist
   L'ultima esecuzione viene riconosciuta anche dallo storico esistente
   (parole chiave) così i dati vecchi sono subito utilizzati.
   ===================================================================== */
function addKm(mezzo, km, fonte, save = true) {
  const n = num(km); if (n === null || n <= 0) return;
  const last = DB.kmlog.filter(k => k.mezzo === mezzo).sort((a, b) => b.ts - a.ts)[0];
  if (last && last.km === n) return;
  DB.kmlog.push({id:uid(), mezzo, km:n, data:nowTS(), ts:Date.now(), fonte:fonte || 'Manuale', by:who()});
  if (save) Store.save('kmlog');
}
function currentKm(mezzo) {
  let best = {km:null, data:null, fonte:''};
  const cand = (k, d, f) => { const n = num(k); if (n !== null && n > 0 && n < 2000000 && (best.km === null || n > best.km)) best = {km:n, data:d, fonte:f}; };
  (DB.flotta[mezzo] || []).forEach(r => { cand(r.km, recDate(r), 'Storico'); cand(r.kmRitiro, recDate(r), 'Ritiro'); });
  DB.tickets.filter(t => t.mezzo === mezzo).forEach(t => { cand(t.km, parseDate(t.dataSegnalazione), 'Segnalazione'); cand(t.kmConsegna, parseDate(t.dataIngresso), 'Officina'); });
  DB.kmlog.filter(k => k.mezzo === mezzo).forEach(k => cand(k.km, new Date(k.ts), k.fonte));
  return best;
}

/* --- piani --- */
function planFromTemplate(tpl, mezzo) {
  return {id:uid(), mezzo, codice:tpl.codice, nome:tpl.nome, categoria:tpl.categoria, km:tpl.km, mesi:tpl.mesi, dateFisse:[...(tpl.dateFisse || [])],
    preavvisoKm:tpl.preavvisoKm, preavvisoGiorni:tpl.preavvisoGiorni, keywords:[...(tpl.keywords || [])], escludi:[...(tpl.escludi || [])],
    checklist:[...(tpl.checklist || [])], officina:'', attivo:true, ultimaData:'', ultimiKm:'', note:'', creatoDa:who(), creatoIl:nowTS()};
}
function generatePlans() {
  if (CFG().pianiGenerati || DB.plans.length) { if (!CFG().pianiGenerati) { CFG().pianiGenerati = true; Store.save('config'); } return; }
  vehicles().forEach(vh => CFG().pianiModello.forEach(tpl => { if (!tpl.tipi || tpl.tipi.includes(vh.tipo)) DB.plans.push(planFromTemplate(tpl, vh.nome)); }));
  CFG().pianiGenerati = true;
  logA('Manutenzione', `Creati ${DB.plans.length} piani di manutenzione programmata dai modelli predefiniti`);
  Store.save('plans', 'config');
}
function recText(r) { return norm(`${r.problema || ''} ${r.intervento || ''}`); }
function planMatches(p, r) {
  if (r.pianoId) return r.pianoId === p.id;
  const t = recText(r);
  return (p.keywords || []).some(k => k && t.includes(norm(k))) && !(p.escludi || []).some(k => k && t.includes(norm(k)));
}
function planHistory(p) { return (DB.flotta[p.mezzo] || []).filter(r => planMatches(p, r)).sort((a, b) => (recDate(b) || 0) - (recDate(a) || 0)); }
function planLast(p) {
  const h = planHistory(p)[0];
  let last = h ? {data:recDate(h), km:num(h.kmRitiro) ?? num(h.km), rec:h} : null;
  const md = parseDate(p.ultimaData);
  if (md && (!last || md > last.data)) last = {data:md, km:num(p.ultimiKm), rec:null, manuale:true};
  else if (last && last.km === null && num(p.ultimiKm) !== null && md && Math.abs(daysDiff(md, last.data)) < 3) last.km = num(p.ultimiKm);
  return last;
}
function nextFixed(p, from) {
  const out = [];
  for (const md of (p.dateFisse || [])) {
    const [mm, dd] = md.split('-').map(Number); if (!mm || !dd) continue;
    for (let y = from.getFullYear(); y <= from.getFullYear() + 2; y++) { const d = new Date(y, mm - 1, dd); if (d >= from) { out.push(d); break; } }
  }
  return out.sort((a, b) => a - b)[0] || null;
}
function planStatus(p) {
  const last = planLast(p); const today = dayStart(new Date()); const ck = currentKm(p.mezzo).km;
  let nextDate = null, nextKm = null;
  if (p.mesi && last && last.data) nextDate = addMonths(dayStart(last.data), +p.mesi);
  if (p.dateFisse && p.dateFisse.length) { const base = last && last.data ? new Date(dayStart(last.data).getTime() + 60 * 864e5) : today; const f = nextFixed(p, base); if (f && (!nextDate || f < nextDate)) nextDate = f; }
  if (p.km && last && last.km !== null && last.km !== undefined) nextKm = last.km + +p.km;
  const daysLeft = nextDate ? daysDiff(today, nextDate) : null;
  const kmLeft = nextKm !== null && ck !== null ? nextKm - ck : null;
  let stato = 'unk';
  if (daysLeft !== null || kmLeft !== null) {
    stato = 'ok';
    if ((daysLeft !== null && daysLeft <= (p.preavvisoGiorni ?? 30)) || (kmLeft !== null && kmLeft <= (p.preavvisoKm ?? 1000))) stato = 'due';
    if ((daysLeft !== null && daysLeft < 0) || (kmLeft !== null && kmLeft <= 0)) stato = 'over';
  }
  return {stato, last, nextDate, nextKm, daysLeft, kmLeft, curKm:ck};
}
const PSTAT_L = {ok:'In regola', due:'In scadenza', over:'Scaduta', unk:'Da impostare'};
function pstatText(s) {
  const parts = [];
  if (s.nextDate) parts.push(fmtD(s.nextDate) + (s.daysLeft !== null ? ` (${s.daysLeft < 0 ? -s.daysLeft + ' gg fa' : s.daysLeft + ' gg'})` : ''));
  if (s.nextKm !== null) parts.push('a ' + s.nextKm.toLocaleString('it-IT') + ' km' + (s.kmLeft !== null ? ` (${s.kmLeft <= 0 ? 'superati di ' + (-s.kmLeft).toLocaleString('it-IT') : 'mancano ' + s.kmLeft.toLocaleString('it-IT')})` : ''));
  return parts.join(' · ') || (s.last ? 'ultima ' + fmtD(s.last.data) : 'nessuna esecuzione trovata');
}
function duePlans() {
  return DB.plans.filter(p => p.attivo !== false && vehNames().includes(p.mezzo)).map(p => ({p, s:planStatus(p)}))
    .filter(x => x.s.stato === 'due' || x.s.stato === 'over').sort((a, b) => (a.s.stato === 'over' ? -1 : 0) - (b.s.stato === 'over' ? -1 : 0) || (a.s.daysLeft ?? 9e9) - (b.s.daysLeft ?? 9e9));
}

/* --- vista --- */
function renderManutenzioni() {
  const el = $('#view-manutenzioni');
  const vs = vehicles(); const active = DB.plans.filter(p => p.attivo !== false && vs.some(x => x.nome === p.mezzo));
  const stats = {ok:0, due:0, over:0, unk:0}; const st = new Map();
  active.forEach(p => { const s = planStatus(p); st.set(p.id, s); stats[s.stato]++; });
  const cols = []; active.forEach(p => { const k = p.codice || p.nome; if (!cols.some(c => c.k === k)) cols.push({k, nome:p.nome}); });
  const due = active.map(p => ({p, s:st.get(p.id)})).filter(x => x.s.stato !== 'ok').sort((a, b) => ({over:0, due:1, unk:2}[a.s.stato] - {over:0, due:1, unk:2}[b.s.stato]) || (a.s.daysLeft ?? 9e9) - (b.s.daysLeft ?? 9e9));
  el.innerHTML = `
    <div class="view-title"><h2><i class="fas fa-calendar-check text-success me-2"></i>Manutenzione programmata</h2><span class="sub">Tagliandi, revisioni, gomme e controlli periodici con checklist</span>
      <div class="actions"><button class="btn btn-sm btn-outline-primary" onclick="modalKm()"><i class="fas fa-tachometer-alt me-1"></i>Aggiorna km</button><button class="btn btn-sm btn-outline-secondary" onclick="modalGomme()"><i class="fas fa-compact-disc me-1"></i>Cambio gomme</button><button class="btn btn-sm btn-outline-success" onclick="emailScadenze()"><i class="fas fa-envelope me-1"></i>Email scadenze</button><button class="btn btn-sm btn-dark" onclick="modalPiano()"><i class="fas fa-plus me-1"></i>Nuovo piano</button></div></div>
    <div class="kpis">
      <div class="kpi" onclick="document.getElementById('pm-due').scrollIntoView({behavior:'smooth'})"><div class="ic ic-red"><i class="fas fa-exclamation-circle"></i></div><div><div class="v">${stats.over}</div><div class="t">Scadute</div></div></div>
      <div class="kpi" onclick="document.getElementById('pm-due').scrollIntoView({behavior:'smooth'})"><div class="ic ic-amber"><i class="fas fa-hourglass-half"></i></div><div><div class="v">${stats.due}</div><div class="t">In scadenza</div></div></div>
      <div class="kpi"><div class="ic ic-green"><i class="fas fa-check"></i></div><div><div class="v">${stats.ok}</div><div class="t">In regola</div></div></div>
      <div class="kpi"><div class="ic ic-gray"><i class="fas fa-question"></i></div><div><div class="v">${stats.unk}</div><div class="t">Da impostare</div></div></div>
    </div>
    <div class="card-x"><div class="hd"><span class="ic ic-green"><i class="fas fa-th"></i></span>Quadro scadenze per veicolo<span class="right small text-muted fw-normal">Clicca una cella per dettagli, checklist e registrazione</span></div>
      <div class="bd p0 tbl-wrap"><table class="tbl pmatrix"><thead><tr><th>Veicolo / km attuali</th>${cols.map(c => `<th>${esc(c.nome)}</th>`).join('')}</tr></thead><tbody>
      ${vs.map(vh => { const ck = currentKm(vh.nome); return `<tr><td class="nowrap"><b><i class="fas ${vehIcon(vh.nome)} me-1 text-muted"></i>${esc(vh.nome)}</b><br><button class="btn btn-sm btn-link p-0 small" onclick="modalKm('${jsq(vh.nome)}')">${ck.km !== null ? ck.km.toLocaleString('it-IT') + ' km' : 'km non noti'} <i class="fas fa-pen ms-1"></i></button>${ck.data ? `<div class="small text-muted">${fmtD(ck.data)}</div>` : ''}</td>
        ${cols.map(c => { const p = active.find(x => x.mezzo === vh.nome && (x.codice || x.nome) === c.k); if (!p) return '<td class="text-muted small">—</td>'; const s = st.get(p.id);
          return `<td><span class="pstat ${s.stato}" onclick="dettaglioPiano(${p.id})" title="${escA(PSTAT_L[s.stato])}">${PSTAT_L[s.stato]}<small>${esc(pstatText(s))}</small></span></td>`; }).join('')}</tr>`; }).join('')}
      </tbody></table></div></div>
    <div class="row g-3"><div class="col-lg-7"><div class="card-x" id="pm-due"><div class="hd"><span class="ic ic-amber"><i class="fas fa-list-ol"></i></span>Da fare (${due.length})</div><div class="bd p0">
      ${due.length ? `<table class="tbl"><tbody>${due.map(({p, s}) => `<tr class="clk" onclick="dettaglioPiano(${p.id})"><td><span class="pstat ${s.stato}" style="min-width:86px">${PSTAT_L[s.stato]}</span></td><td><b>${esc(p.mezzo)}</b> · ${esc(p.nome)}<div class="small text-muted">${esc(pstatText(s))}</div></td><td class="text-end nowrap"><button class="btn btn-sm btn-outline-success" onclick="event.stopPropagation();modalEseguiPiano(${p.id})"><i class="fas fa-check"></i></button> <button class="btn btn-sm btn-outline-dark" onclick="event.stopPropagation();programmaPiano(${p.id})" title="Apri segnalazione per l'officina"><i class="fas fa-tools"></i></button></td></tr>`).join('')}</tbody></table>` : '<div class="empty"><i class="fas fa-check-circle text-success"></i>Tutte le manutenzioni sono in regola</div>'}
    </div></div></div>
    <div class="col-lg-5"><div class="card-x"><div class="hd"><span class="ic ic-blue"><i class="fas fa-tachometer-alt"></i></span>Ultime letture km</div><div class="bd p0"><table class="tbl"><tbody>
      ${DB.kmlog.slice().sort((a, b) => b.ts - a.ts).slice(0, 12).map(k => `<tr><td class="nowrap"><b>${esc(k.mezzo)}</b></td><td class="mono">${k.km.toLocaleString('it-IT')}</td><td class="small text-muted">${esc(k.data)}<br>${esc(k.fonte)} · ${esc(k.by || '')}</td></tr>`).join('') || '<tr><td class="text-muted small p-3">Nessuna lettura registrata: i km vengono presi anche da segnalazioni e storico.</td></tr>'}
    </tbody></table></div></div></div></div>`;
}

function dettaglioPiano(id) {
  const p = DB.plans.find(x => x.id === id); if (!p) return; const s = planStatus(p); const h = planHistory(p);
  const m = openModal({title:`<i class="fas fa-calendar-check me-2"></i>${esc(p.nome)} · ${esc(p.mezzo)}`, color:'green', size:'modal-lg',
    body:`<div class="d-flex align-items-center gap-2 mb-3"><span class="pstat ${s.stato}">${PSTAT_L[s.stato]}<small>${esc(pstatText(s))}</small></span><div class="small text-muted ms-2">Km attuali: <b>${s.curKm !== null ? s.curKm.toLocaleString('it-IT') : 'n/d'}</b></div></div>
      <div class="kv mb-3"><div>Intervallo</div><div>${[p.km ? 'ogni ' + (+p.km).toLocaleString('it-IT') + ' km' : '', p.mesi ? 'ogni ' + p.mesi + ' mesi' : '', (p.dateFisse || []).length ? 'entro il ' + p.dateFisse.map(d => d.split('-').reverse().join('/')).join(' e il ') : ''].filter(Boolean).join(' · ') || '-'}</div>
        <div>Preavviso</div><div>${p.preavvisoGiorni || 0} giorni${p.km ? ' / ' + (p.preavvisoKm || 0).toLocaleString('it-IT') + ' km' : ''}</div>
        <div>Ultima esecuzione</div><div>${s.last ? `${fmtD(s.last.data)}${s.last.km !== null && s.last.km !== undefined ? ' · ' + s.last.km.toLocaleString('it-IT') + ' km' : ''}${s.last.manuale ? ' <span class="pill pill-gray">impostata a mano</span>' : ''}` : '<span class="text-muted">non trovata</span>'}</div>
        ${p.officina ? `<div>Officina abituale</div><div>${esc(p.officina)}</div>` : ''}${p.note ? `<div>Note</div><div>${esc(p.note)}</div>` : ''}</div>
      ${(p.checklist || []).length ? `<div class="sec-title">Passi da seguire</div><ol class="small">${p.checklist.map(c => `<li>${esc(c)}</li>`).join('')}</ol>` : ''}
      <div class="sec-title">Esecuzioni nello storico (${h.length})</div>
      ${h.length ? `<table class="tbl"><tbody>${h.slice(0, 10).map(r => `<tr class="clk" onclick="openRecord('${jsq(p.mezzo)}',${r.id})"><td class="nowrap">${fmtD(recDate(r))}</td><td>${esc(r.problema)}<div class="small text-muted">${esc(r.officina || '')} ${r.km ? '· ' + esc(r.km) + ' km' : ''}</div></td></tr>`).join('')}</tbody></table>` : '<div class="small text-muted">Nessuna esecuzione riconosciuta. Registrala o imposta l\'ultima data nel piano.</div>'}`,
    footer:`<button class="btn btn-outline-secondary me-auto" onclick="modalPiano(${p.id})"><i class="fas fa-cog me-1"></i>Modifica piano</button><button class="btn btn-outline-dark" onclick="programmaPiano(${p.id})"><i class="fas fa-tools me-1"></i>Programma in officina</button><button class="btn btn-success fw-bold" onclick="modalEseguiPiano(${p.id})"><i class="fas fa-check me-1"></i>Registra esecuzione</button>`});
  m.el.dataset.plan = id;
}
function modalEseguiPiano(id) {
  const p = DB.plans.find(x => x.id === id); if (!p) return;
  $$('.modal.show').forEach(x => { if (x.dataset.plan) bootstrap.Modal.getInstance(x)?.hide(); });
  const ck = currentKm(p.mezzo).km;
  const m = openModal({title:`<i class="fas fa-check-double me-2"></i>Registra: ${esc(p.nome)} · ${esc(p.mezzo)}`, color:'green', size:'modal-lg',
    body:`<div class="row g-2">
      <div class="col-md-4"><label class="lbl req">Data esecuzione</label><input type="date" class="form-control" id="pe-d" value="${todayISO()}"></div>
      <div class="col-md-4"><label class="lbl">Km</label><input type="number" class="form-control" id="pe-km" value="${ck ?? ''}"></div>
      <div class="col-md-4"><label class="lbl">Costo (€)</label><input type="number" step="0.01" class="form-control" id="pe-c"></div>
      <div class="col-md-6">${fieldOff('pe-off', 'Officina / esecutore', p.officina || '')}</div>
      <div class="col-md-6">${fieldOp('pe-op', 'Operatore', currentOp(), true)}</div>
      ${(p.checklist || []).length ? `<div class="col-12"><div class="sec-title">Checklist <button type="button" class="btn btn-sm btn-link p-0 ms-auto" id="pe-all">seleziona tutto</button></div><div class="chk-list">${p.checklist.map((c, i) => `<div class="form-check"><input class="form-check-input" type="checkbox" id="pe-c${i}"><label class="form-check-label" for="pe-c${i}">${esc(c)}</label></div>`).join('')}</div></div>` : ''}
      <div class="col-12"><label class="lbl">Note / lavori eseguiti</label><textarea class="form-control" id="pe-n" rows="3"></textarea></div></div>`,
    footer:`<button class="btn btn-light" data-bs-dismiss="modal">Annulla</button><button class="btn btn-success fw-bold" id="pe-ok"><i class="fas fa-save me-1"></i>Registra nello storico</button>`});
  const all = $('#pe-all', m.el); if (all) all.onclick = () => $$('.chk-list input', m.el).forEach(c => c.checked = true);
  $('#pe-ok', m.el).onclick = () => {
    const d = v('pe-d', m.el), op = v('pe-op', m.el); if (!d || !op) { toast('Indica data e operatore', 'warn'); return; }
    const cl = (p.checklist || []).map((c, i) => ({voce:c, ok:$('#pe-c' + i, m.el).checked}));
    const miss = cl.filter(x => !x.ok);
    const ds = fmtD(d), km = v('pe-km', m.el), off = canonOfficina(v('pe-off', m.el)), note = v('pe-n', m.el), c = num(v('pe-c', m.el));
    const rec = {id:uid(), type:'manutenzione', pianoId:p.id, categoria:p.categoria || 'Altro', mezzo:p.mezzo, veicolo:p.mezzo, km, dataSegnalazione:ds, operatoreSegnalazione:op,
      problema:`MANUTENZIONE PROGRAMMATA: ${p.nome}`, stato:'concluso', officina:off || '-', operatoreConsegna:op, dataIngresso:ds, operatoreRitiro:op, dataChiusura:ds,
      intervento:(note || p.nome) + (cl.length ? `\nChecklist: ${cl.length - miss.length}/${cl.length} completati` + (miss.length ? ` (mancano: ${miss.map(x => x.voce).join(', ')})` : '') : ''),
      checklist:cl, costo:c ?? undefined, creatoDa:who(), creatoIl:nowTS(), timeline:[{ts:nowTS(), by:who(), t:'chiusura', x:`Manutenzione programmata registrata: ${p.nome}${km ? ' · km ' + km : ''}`}]};
    DB.flotta[p.mezzo] = DB.flotta[p.mezzo] || []; DB.flotta[p.mezzo].push(rec);
    if (km) addKm(p.mezzo, km, p.nome, false);
    logA('Manutenzione', `${p.mezzo}: registrata "${p.nome}"${km ? ' a ' + km + ' km' : ''}`, {tipo:'storico', id:rec.id, mezzo:p.mezzo});
    Store.save('flotta', 'kmlog'); m.close(); toast('Manutenzione registrata', 'ok');
  };
}
function programmaPiano(id) {
  const p = DB.plans.find(x => x.id === id); if (!p) return;
  $$('.modal.show').forEach(x => { if (x.dataset.plan) bootstrap.Modal.getInstance(x)?.hide(); });
  if (DB.tickets.some(t => t.pianoId === p.id)) { toast('Esiste già una segnalazione aperta per questa manutenzione', 'warn'); return; }
  const ck = currentKm(p.mezzo).km;
  const t = {id:uid(), type:'guasto', categoria:p.categoria || 'Altro', mezzo:p.mezzo, km:ck ? String(ck) : '', operatoreSegnalazione:who(), problema:`Manutenzione programmata: ${p.nome}` + ((p.checklist || []).length ? '\n- ' + p.checklist.join('\n- ') : ''),
    dataSegnalazione:nowTS(), stato:'segnalato', officina:'', operatoreConsegna:'', dataIngresso:'', operatoreRitiro:'', dataChiusura:'', intervento:'', emailInviata:false,
    priorita:'normale', fermo:false, pianoId:p.id, creatoDa:who(), creatoIl:nowTS(), timeline:[{ts:nowTS(), by:who(), t:'apertura', x:`Aperta da manutenzione programmata: ${p.nome}`}]};
  DB.tickets.push(t); logA('Manutenzione', `${p.mezzo}: "${p.nome}" programmata (segnalazione aperta)`, {tipo:'ticket', id:t.id});
  Store.save('tickets'); toast('Segnalazione creata: fissa l\'appuntamento', 'ok'); App.go('dashboard'); setTimeout(() => Scheda.open(t.id, 1), 250);
}
async function modalPiano(id) {
  if (!await Admin.require('Gestione piani di manutenzione')) return;
  $$('.modal.show').forEach(x => { if (x.dataset.plan) bootstrap.Modal.getInstance(x)?.hide(); });
  const p = id ? DB.plans.find(x => x.id === id) : {mezzo:vehNames()[0], nome:'', categoria:'Meccanica', km:'', mesi:12, dateFisse:[], preavvisoKm:1000, preavvisoGiorni:30, keywords:[], escludi:[], checklist:[], officina:'', attivo:true, ultimaData:'', ultimiKm:'', note:''};
  if (!p) return;
  const m = openModal({title:`<i class="fas fa-cog me-2"></i>${id ? 'Modifica piano' : 'Nuovo piano di manutenzione'}`, color:'dark', size:'modal-lg',
    body:`<div class="row g-2">
      <div class="col-md-6"><label class="lbl req">Nome</label><input class="form-control fw-bold" id="pp-nome" value="${escA(p.nome)}" placeholder="es. Tagliando"></div>
      <div class="col-md-3"><label class="lbl">Veicolo</label><select class="form-select" id="pp-mezzo" ${id ? 'disabled' : ''}>${id ? vehOptions(p.mezzo, true) : '<option value="__all">Tutti i veicoli</option>' + vehOptions(p.mezzo)}</select></div>
      <div class="col-md-3"><label class="lbl">Categoria</label><select class="form-select" id="pp-cat">${catOptions(p.categoria)}</select></div>
      <div class="col-md-3"><label class="lbl">Ogni … km</label><input type="number" class="form-control" id="pp-km" value="${escA(p.km || '')}"></div>
      <div class="col-md-3"><label class="lbl">Ogni … mesi</label><input type="number" class="form-control" id="pp-mesi" value="${escA(p.mesi || '')}"></div>
      <div class="col-md-6"><label class="lbl">Date fisse annuali (gg/mm, separate da virgola)</label><input class="form-control" id="pp-df" value="${escA((p.dateFisse || []).map(d => d.split('-').reverse().join('/')).join(', '))}" placeholder="es. 15/11"></div>
      <div class="col-md-3"><label class="lbl">Preavviso giorni</label><input type="number" class="form-control" id="pp-pg" value="${escA(p.preavvisoGiorni ?? 30)}"></div>
      <div class="col-md-3"><label class="lbl">Preavviso km</label><input type="number" class="form-control" id="pp-pk" value="${escA(p.preavvisoKm ?? 1000)}"></div>
      <div class="col-md-6">${fieldOff('pp-off', 'Officina abituale', p.officina || '')}</div>
      <div class="col-md-6"><label class="lbl">Parole chiave per riconoscerlo nello storico</label><input class="form-control" id="pp-kw" value="${escA((p.keywords || []).join(', '))}"></div>
      <div class="col-md-6"><label class="lbl">Escludi se contiene</label><input class="form-control" id="pp-ex" value="${escA((p.escludi || []).join(', '))}"></div>
      <div class="col-md-3"><label class="lbl">Ultima esecuzione (manuale)</label><input type="date" class="form-control" id="pp-ud" value="${escA(p.ultimaData || '')}"></div>
      <div class="col-md-3"><label class="lbl">Km ultima esecuzione</label><input type="number" class="form-control" id="pp-uk" value="${escA(p.ultimiKm || '')}"></div>
      <div class="col-12"><label class="lbl">Checklist — un passo per riga</label><textarea class="form-control" id="pp-cl" rows="6">${esc((p.checklist || []).join('\n'))}</textarea></div>
      <div class="col-12"><label class="lbl">Note</label><input class="form-control" id="pp-n" value="${escA(p.note || '')}"></div>
      <div class="col-12"><div class="form-check form-switch"><input class="form-check-input" type="checkbox" id="pp-att" ${p.attivo !== false ? 'checked' : ''}><label class="form-check-label" for="pp-att">Piano attivo</label></div></div></div>`,
    footer:`${id ? '<button class="btn btn-outline-danger me-auto" id="pp-del"><i class="fas fa-trash me-1"></i>Elimina</button>' : ''}<button class="btn btn-light" data-bs-dismiss="modal">Annulla</button><button class="btn btn-primary fw-bold" id="pp-ok">Salva</button>`});
  const read = () => ({nome:v('pp-nome', m.el), categoria:v('pp-cat', m.el), km:num(v('pp-km', m.el)) || null, mesi:num(v('pp-mesi', m.el)) || null,
    dateFisse:v('pp-df', m.el).split(',').map(s => s.trim()).filter(Boolean).map(s => { const [d, mo] = s.split(/[\/.-]/); return d && mo ? `${pad(+mo)}-${pad(+d)}` : null; }).filter(Boolean),
    preavvisoGiorni:num(v('pp-pg', m.el)) ?? 30, preavvisoKm:num(v('pp-pk', m.el)) ?? 0, officina:canonOfficina(v('pp-off', m.el)),
    keywords:v('pp-kw', m.el).split(',').map(s => s.trim()).filter(Boolean), escludi:v('pp-ex', m.el).split(',').map(s => s.trim()).filter(Boolean),
    ultimaData:v('pp-ud', m.el), ultimiKm:v('pp-uk', m.el), checklist:$('#pp-cl', m.el).value.split('\n').map(s => s.trim()).filter(Boolean), note:v('pp-n', m.el), attivo:v('pp-att', m.el)});
  $('#pp-ok', m.el).onclick = () => {
    const d = read(); if (!d.nome) { toast('Indica il nome', 'warn'); return; }
    if (!d.km && !d.mesi && !d.dateFisse.length) { toast('Indica almeno un intervallo (km, mesi o date fisse)', 'warn'); return; }
    if (id) { Object.assign(p, d, {modificatoDa:who(), modificatoIl:nowTS()}); logA('Manutenzione', `Piano modificato: ${p.mezzo} · ${p.nome}`); }
    else {
      const targets = v('pp-mezzo', m.el) === '__all' ? vehNames() : [v('pp-mezzo', m.el)];
      const codice = 'c' + uid();
      targets.forEach(mz => DB.plans.push({id:uid(), mezzo:mz, codice, ...d, creatoDa:who(), creatoIl:nowTS()}));
      logA('Manutenzione', `Nuovo piano "${d.nome}" per ${targets.join(', ')}`);
    }
    Store.save('plans'); m.close();
  };
  const del = $('#pp-del', m.el); if (del) del.onclick = async () => {
    if (!await confirmDlg(`Eliminare il piano "${esc(p.nome)}" di ${esc(p.mezzo)}?\nLo storico delle esecuzioni resta intatto; il piano va nel cestino.`, {danger:true})) return;
    toTrash('piano manutenzione', p, {mezzo:p.mezzo}); DB.plans = DB.plans.filter(x => x.id !== p.id);
    logA('Eliminazione', `Piano eliminato: ${p.mezzo} · ${p.nome}`); Store.save('plans'); m.close();
  };
}
function modalKm(mezzo) {
  const m = openModal({title:'<i class="fas fa-tachometer-alt me-2"></i>Aggiorna chilometri', color:'blue', size:'modal-dialog-centered',
    body:`<div class="row g-2"><div class="col-12"><label class="lbl">Veicolo</label><select class="form-select fw-bold" id="km-m">${vehOptions(mezzo || '')}</select></div>
      <div class="col-12"><label class="lbl req">Km attuali</label><input type="number" class="form-control form-control-lg mono" id="km-v"><div class="small text-muted mt-1" id="km-last"></div></div></div>`,
    footer:`<button class="btn btn-light" data-bs-dismiss="modal">Annulla</button><button class="btn btn-primary fw-bold" id="km-ok">Salva</button>`});
  const upd = () => { const c = currentKm(v('km-m', m.el)); $('#km-last', m.el).innerHTML = c.km !== null ? `Ultimo valore noto: <b>${c.km.toLocaleString('it-IT')} km</b> (${esc(c.fonte)}${c.data ? ', ' + fmtD(c.data) : ''})` : 'Nessun valore noto'; };
  $('#km-m', m.el).onchange = upd; upd();
  $('#km-ok', m.el).onclick = async () => {
    const mz = v('km-m', m.el), k = num(v('km-v', m.el)); if (k === null) { toast('Inserisci i km', 'warn'); return; }
    const c = currentKm(mz); if (c.km !== null && k < c.km && !await confirmDlg(`Il valore inserito (${k.toLocaleString('it-IT')}) è inferiore all'ultimo noto (${c.km.toLocaleString('it-IT')}). Salvare comunque?`)) return;
    addKm(mz, k, 'Lettura manuale'); logA('Km', `${mz}: ${k.toLocaleString('it-IT')} km`); m.close(); toast('Km aggiornati', 'ok');
  };
}
function modalGomme(mezzo) {
  const m = openModal({title:'<i class="fas fa-compact-disc me-2"></i>Cambio gomme', color:'gray',
    body:`<div class="row g-2"><div class="col-12"><label class="lbl">Veicolo</label><select class="form-select fw-bold" id="gm-m">${vehOptions(mezzo || '')}</select></div>
      <div class="col-md-7"><label class="lbl">Tipo</label><select class="form-select" id="gm-t">${(CFG().tipiGomme || []).map(t => `<option>${esc(t)}</option>`).join('')}</select></div>
      <div class="col-md-5"><label class="lbl req">Km</label><input type="number" class="form-control" id="gm-km"></div>
      <div class="col-12">${fieldOff('gm-off', 'Gommista', (officine().find(o => /gomm/i.test(o.tipo)) || {}).nome || '', true)}</div>
      <div class="col-12">${fieldOp('gm-op', 'Operatore', currentOp())}</div>
      <div class="col-md-6"><label class="lbl">Data</label><input type="date" class="form-control" id="gm-d" value="${todayISO()}"></div>
      <div class="col-md-6"><label class="lbl">Costo (€)</label><input type="number" step="0.01" class="form-control" id="gm-c"></div>
      <div class="col-12"><label class="lbl">Note</label><textarea class="form-control" id="gm-n" rows="2"></textarea></div></div>`,
    footer:`<button class="btn btn-light" data-bs-dismiss="modal">Annulla</button><button class="btn btn-dark fw-bold" id="gm-ok">Registra</button>`});
  $('#gm-ok', m.el).onclick = () => {
    const mz = v('gm-m', m.el), km = v('gm-km', m.el), of = canonOfficina(v('gm-off', m.el)), tp = v('gm-t', m.el);
    if (!km || !of) { toast('Inserisci km e gommista', 'warn'); return; }
    const d = v('gm-d', m.el); const ts = d === todayISO() ? nowTS() : fmtD(d); const op = v('gm-op', m.el) || 'REG. GOMME';
    const rec = {id:uid(), type:'gomme', categoria:'Pneumatici', mezzo:mz, km, dataSegnalazione:ts, operatoreSegnalazione:op, problema:`CAMBIO GOMME: ${tp}`, officina:of, operatoreConsegna:op, dataIngresso:ts, operatoreRitiro:op, dataChiusura:ts, intervento:v('gm-n', m.el) || 'Nessuna nota', creatoDa:who(), creatoIl:nowTS()};
    const c = num(v('gm-c', m.el)); if (c !== null) rec.costo = c;
    DB.flotta[mz] = DB.flotta[mz] || []; DB.flotta[mz].push(rec); addKm(mz, km, 'Cambio gomme', false);
    logA('Gomme', `${mz}: ${tp} presso ${of} a ${km} km`, {tipo:'storico', id:rec.id, mezzo:mz});
    Store.save('flotta', 'kmlog'); m.close(); toast('Cambio gomme registrato', 'ok');
  };
}
function emailScadenze() {
  const d = duePlans(); if (!d.length) { toast('Nessuna manutenzione scaduta o in scadenza', 'info'); return; }
  composeEmail('scadenza', {data:fmtD(new Date()), operatore:currentOp(), elenco:d.map(({p, s}) => `- ${p.mezzo} · ${p.nome}: ${PSTAT_L[s.stato].toUpperCase()} — ${pstatText(s)}`).join('\n')});
}
