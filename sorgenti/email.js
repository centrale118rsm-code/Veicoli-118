'use strict';
/* =====================================================================
   EMAIL — gruppi destinatari, modelli modificabili, composizione
   ===================================================================== */
const PLACEHOLDERS = {
  mezzo:'Nome veicolo', targa:'Targa', km:'Km', operatore:'Operatore (attivo o indicato)', data:'Data/ora attuale',
  categoria:'Categoria guasto', priorita:'Priorità', fermo:'Avviso fermo macchina', problema:'Descrizione guasto',
  officina:'Officina', dataApp:'Data appuntamento', oraApp:'Ora appuntamento', noteApp:'Note appuntamento',
  noteOfficina:'Note officina', dataRitiro:'Data prevista ritiro', importo:'Importo preventivo', soglia:'Soglia preventivo',
  intervento:'Intervento eseguito', dataNota:'Data della nota', testo:'Testo nota', elenco:'Elenco scadenze', gruppiNomi:'Nomi gruppi scelti'
};
function groupById(id) { return (CFG().gruppiEmail || []).find(g => g.id === id); }
function splitAddr(s) { return String(s || '').split(/[,;\s]+/).map(x => x.trim()).filter(Boolean); }
function validEmail(e) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e); }
function addrOfGroups(ids) { const out = []; (ids || []).forEach(id => { const g = groupById(id); if (g) splitAddr(g.indirizzi).forEach(a => { if (!out.includes(a)) out.push(a); }); }); return out; }
function fillTpl(str, ctx) { return String(str || '').replace(/\{(\w+)\}/g, (m, k) => ctx[k] !== undefined && ctx[k] !== null ? String(ctx[k]) : ''); }

function ticketCtx(t, extra = {}) {
  const notes = Array.isArray(t.noteOfficina) ? t.noteOfficina.map(n => `${n.date}: ${n.text}`).join('\n') : (t.noteOfficina || '');
  return {
    mezzo:t.mezzo, targa:targa(t.mezzo), km:t.km || '-', operatore:currentOp() || t.operatoreSegnalazione || '', data:nowTS(),
    categoria:t.categoria || '', priorita:(t.priorita || 'normale').toUpperCase(), fermo:t.fermo ? '\n⚠ VEICOLO FERMO / NON OPERATIVO' : '',
    problema:t.problema || '', officina:t.officina || t.officinaAppuntamento || '', dataApp:fmtD(t.dataAppuntamento), oraApp:t.dataAppuntamentoOra || '',
    noteApp:t.noteAppuntamento ? 'Note: ' + t.noteAppuntamento : '', noteOfficina:notes || 'Nessuna',
    dataRitiro:t.dataStimataConsegna ? fmtD(t.dataStimataConsegna) + (t.dataStimataConsegnaOra ? ' ore ' + t.dataStimataConsegnaOra : '') : 'Da definire',
    importo:t.preventivo && t.preventivo.importo ? eur(t.preventivo.importo) : '-', soglia:eur(SET().sogliaPreventivo),
    intervento:t.intervento || '', ...extra
  };
}

/* Apre la finestra di composizione: tutto è modificabile prima dell'invio */
function composeEmail(tplKey, ctx = {}, opts = {}) {
  const tpl = CFG().templates[tplKey] || {nome:'Email', gruppi:[], oggetto:'', corpo:''};
  let groups = opts.gruppi || tpl.gruppi || [];
  const extraTo = opts.to || [];
  const gNames = () => groups.map(id => (groupById(id) || {}).nome).filter(Boolean).join(' + ');
  const build = () => { const c = {...ctx, gruppiNomi:gNames()}; return {subj:fillTpl(tpl.oggetto, c), body:fillTpl(tpl.corpo, c)}; };
  const first = build();
  const to0 = [...addrOfGroups(groups), ...extraTo].filter((a, i, arr) => arr.indexOf(a) === i).join(', ');
  const m = openModal({title:`<i class="fas fa-envelope-open-text me-2"></i>${esc(opts.title || tpl.nome)}`, color:'green', size:'modal-lg',
    body:`
      <div class="mb-2"><span class="lbl">Gruppi destinatari</span><div class="chips" id="em-groups">${(CFG().gruppiEmail || []).map(g => `<span class="chip ${groups.includes(g.id) ? 'on' : ''}" data-g="${g.id}">${esc(g.nome)} <small class="opacity-75">(${splitAddr(g.indirizzi).length})</small></span>`).join('')}</div></div>
      <div class="mb-2"><label class="lbl">A</label><textarea class="form-control form-control-sm mono" id="em-to" rows="2">${esc(to0)}</textarea></div>
      <div class="mb-2"><label class="lbl">CC</label><input class="form-control form-control-sm mono" id="em-cc" value="${escA(tpl.cc || '')}"></div>
      <div class="mb-2"><label class="lbl">Oggetto</label><input class="form-control fw-bold" id="em-subj" value="${escA(first.subj)}"></div>
      <div class="mb-1"><label class="lbl">Messaggio</label><textarea class="form-control" id="em-body" rows="11">${esc(first.body)}</textarea></div>
      <div class="small text-muted" id="em-info"></div>`,
    footer:`<button class="btn btn-light me-auto" id="em-copy"><i class="fas fa-copy me-1"></i>Copia testo</button>
      <button class="btn btn-outline-danger" id="em-gmail"><i class="fab fa-google me-1"></i>Gmail</button>
      <button class="btn btn-outline-primary" id="em-outlook"><i class="fab fa-microsoft me-1"></i>Outlook web</button>
      <button class="btn btn-success fw-bold" id="em-send"><i class="fas fa-paper-plane me-1"></i>Apri nel programma email</button>`});
  const info = () => {
    const to = splitAddr(v('em-to', m.el)); const bad = to.filter(a => !validEmail(a));
    const len = encodeURIComponent(v('em-body', m.el)).length + to.join(',').length;
    $('#em-info', m.el).innerHTML = `${to.length} destinatari${bad.length ? ` · <span class="text-danger fw-bold">indirizzi non validi: ${esc(bad.join(', '))}</span>` : ''}${len > 1900 ? ' · <span class="text-warning fw-bold">messaggio lungo: alcuni programmi potrebbero troncarlo, usa "Copia testo" se serve</span>' : ''}`;
  };
  $('#em-groups', m.el).onclick = e => {
    const c = e.target.closest('[data-g]'); if (!c) return;
    const id = c.dataset.g; groups = groups.includes(id) ? groups.filter(x => x !== id) : [...groups, id];
    c.classList.toggle('on');
    $('#em-to', m.el).value = [...addrOfGroups(groups), ...extraTo].filter((a, i, arr) => arr.indexOf(a) === i).join(', ');
    if (tplKey === 'comunicazione') $('#em-subj', m.el).value = build().subj;
    info();
  };
  ['em-to', 'em-body'].forEach(id => $('#' + id, m.el).addEventListener('input', info)); info();
  const data = () => ({to:splitAddr(v('em-to', m.el)).join(','), cc:splitAddr(v('em-cc', m.el)).join(','), subj:v('em-subj', m.el), body:$('#em-body', m.el).value});
  const sent = (via) => {
    const d = data();
    logA('Email', `${tpl.nome} — "${d.subj}" a ${splitAddr(d.to).length} destinatari (${via})`, opts.ref);
    opts.onSent && opts.onSent(d, via);
    m.close();
  };
  $('#em-send', m.el).onclick = () => { const d = data(); window.location.href = `mailto:${d.to}?${d.cc ? 'cc=' + encodeURIComponent(d.cc) + '&' : ''}subject=${encodeURIComponent(d.subj)}&body=${encodeURIComponent(d.body)}`; sent('programma email'); };
  $('#em-gmail', m.el).onclick = () => { const d = data(); window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(d.to)}${d.cc ? '&cc=' + encodeURIComponent(d.cc) : ''}&su=${encodeURIComponent(d.subj)}&body=${encodeURIComponent(d.body)}`, '_blank'); sent('Gmail'); };
  $('#em-outlook', m.el).onclick = () => { const d = data(); window.open(`https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(d.to)}${d.cc ? '&cc=' + encodeURIComponent(d.cc) : ''}&subject=${encodeURIComponent(d.subj)}&body=${encodeURIComponent(d.body)}`, '_blank'); sent('Outlook'); };
  $('#em-copy', m.el).onclick = async () => { const d = data(); const txt = `A: ${d.to}\n${d.cc ? 'CC: ' + d.cc + '\n' : ''}Oggetto: ${d.subj}\n\n${d.body}`; try { await navigator.clipboard.writeText(txt); toast('Testo copiato', 'ok'); } catch (e) { toast('Copia non riuscita', 'err'); } };
  if (SET().emailClient === 'gmail') { $('#em-gmail', m.el).classList.replace('btn-outline-danger', 'btn-danger'); }
  return m;
}

/* Comunicazione libera (pulsante Email) */
function emailComunicazione() { composeEmail('comunicazione', {data:nowTS(), operatore:currentOp()}, {title:'Nuova comunicazione'}); }
