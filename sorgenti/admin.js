'use strict';
/* =====================================================================
   AREA ADMIN (password) — gestione completa
   ===================================================================== */
const ADM = {sec:'panoramica', tpl:'segnalazione', trashF:''};
const ADM_SECS = [
  ['Generale', [['panoramica', 'fa-gauge', 'Panoramica'], ['impostazioni', 'fa-sliders', 'Impostazioni']]],
  ['Anagrafiche', [['veicoli', 'fa-truck-medical', 'Veicoli'], ['operatori', 'fa-users', 'Operatori'], ['officine', 'fa-address-book', 'Officine / Rubrica'], ['categorie', 'fa-tags', 'Categorie e tipi']]],
  ['Email', [['gruppi', 'fa-users-rectangle', 'Gruppi destinatari'], ['modelli', 'fa-envelope-open-text', 'Modelli email']]],
  ['Dati', [['segnalazioni', 'fa-clipboard-list', 'Segnalazioni attive'], ['piani', 'fa-calendar-check', 'Piani manutenzione'], ['cestino', 'fa-trash-restore', 'Cestino'], ['registro', 'fa-user-clock', 'Registro attività'], ['backup', 'fa-database', 'Backup e ripristino']]]
];
function renderAdmin() {
  const el = $('#view-admin');
  if (!Admin.isOn()) {
    el.innerHTML = `<div class="login-box card-x"><div class="bd p-4"><div class="lk"><i class="fas fa-lock"></i></div><h4 class="fw-bold">Area Amministrazione</h4><p class="text-muted small">Gestione completa di veicoli, operatori, officine, email, piani di manutenzione, dati e backup.</p>
      <input type="password" class="form-control form-control-lg text-center fw-bold mb-2" id="adm-login" placeholder="Password" autocomplete="current-password"><button class="btn btn-danger w-100 fw-bold py-2" id="adm-go"><i class="fas fa-unlock me-1"></i>Entra</button>
      <div class="small text-muted mt-3"><i class="fas fa-user me-1"></i>Accesso registrato a nome di <b>${esc(who())}</b></div></div></div>`;
    const go = () => { if (Admin.login(v('adm-login'))) { toast('Benvenuto nell\'area Admin', 'ok'); renderAdmin(); } else { toast('Password errata', 'err'); $('#adm-login').select(); } };
    $('#adm-go').onclick = go; $('#adm-login').onkeydown = e => { if (e.key === 'Enter') go(); }; setTimeout(() => $('#adm-login')?.focus(), 50);
    return;
  }
  Admin.touch();
  el.innerHTML = `<div class="view-title"><h2><i class="fas fa-user-shield text-danger me-2"></i>Amministrazione</h2><span class="sub">Sessione attiva · scade dopo ${SET().sessioneAdminMin} min di inattività</span><div class="actions"><button class="btn btn-sm btn-outline-danger" onclick="Admin.logout();renderAdmin()"><i class="fas fa-sign-out-alt me-1"></i>Esci da Admin</button></div></div>
    <div class="admin-wrap"><nav class="admin-side">${ADM_SECS.map(([g, items]) => `<div class="grp">${g}</div>${items.map(([k, i, l]) => `<button class="${ADM.sec === k ? 'active' : ''}" onclick="ADM.sec='${k}';renderAdmin()"><i class="fas ${i}"></i>${l}</button>`).join('')}`).join('')}</nav><div id="adm-body"></div></div>`;
  const body = $('#adm-body');
  ({panoramica:admPanoramica, impostazioni:admImpostazioni, veicoli:admVeicoli, operatori:admOperatori, officine:admOfficine, categorie:admCategorie, gruppi:admGruppi, modelli:admModelli, segnalazioni:admSegnalazioni, piani:admPiani, cestino:admCestino, registro:admRegistro, backup:admBackup}[ADM.sec] || admPanoramica)(body);
}
const card = (title, ic, inner, right = '') => `<div class="card-x"><div class="hd"><span class="ic ic-blue"><i class="fas ${ic}"></i></span>${title}<span class="right">${right}</span></div><div class="bd">${inner}</div></div>`;

function admPanoramica(b) {
  const nRec = Object.values(DB.flotta).reduce((s, a) => s + a.length, 0);
  const size = DOCS.reduce((s, d) => s + JSON.stringify(DB[d]).length, 0);
  b.innerHTML = card('Stato del sistema', 'fa-gauge', `<div class="minis mb-3">
      <div class="mini"><div class="v">${vehicles().length}</div><div class="t">Veicoli attivi</div></div><div class="mini"><div class="v">${DB.tickets.length}</div><div class="t">Segnalazioni aperte</div></div>
      <div class="mini"><div class="v">${nRec}</div><div class="t">Interventi storico</div></div><div class="mini"><div class="v">${DB.wash.length}</div><div class="t">Lavaggi</div></div>
      <div class="mini"><div class="v">${DB.plans.length}</div><div class="t">Piani manutenzione</div></div><div class="mini"><div class="v">${DB.trash.length}</div><div class="t">Nel cestino</div></div>
      <div class="mini"><div class="v">${DB.log.length}</div><div class="t">Operazioni registrate</div></div><div class="mini"><div class="v">${(size / 1024).toFixed(0)} KB</div><div class="t">Dati totali</div></div></div>
    <div class="kv"><div>Versione</div><div>${APP_VERSION}${TEST_MODE ? ' <span class="pill pill-amber">modalità prova</span>' : ''}</div><div>Cloud</div><div>${esc(Store.statusMsg)}</div><div>Operatore attivo</div><div>${esc(who())} <button class="btn btn-sm btn-link p-0 ms-2" onclick="pickOperator()">cambia</button></div><div>Dispositivo</div><div class="mono">${esc(device())}</div><div>Backup cloud</div><div>${(CFG().backupIndex || []).length ? 'ultimo ' + fmtD(CFG().backupIndex[0]) + ` (${CFG().backupIndex.length} conservati)` : 'nessuno ancora'}</div></div>`)
    + card('Sicurezza', 'fa-shield-halved', `<p class="small mb-1">La password protegge l'area admin, la modifica/eliminazione dello storico e l'eliminazione dei lavaggi. Nessun dato viene cancellato davvero: ogni eliminazione finisce nel <a href="#" onclick="ADM.sec='cestino';renderAdmin();return false">cestino</a>.</p><p class="small text-muted mb-0">Nota: è una protezione dell'interfaccia (l'app gira nel browser); per una sicurezza piena andrebbero configurate le regole di accesso di Firebase.</p>`);
}
function admImpostazioni(b) {
  const s = SET();
  b.innerHTML = card('Impostazioni generali', 'fa-sliders', `<div class="row g-3">
      <div class="col-md-6"><label class="lbl">Nome ente (intestazioni, stampe)</label><input class="form-control" id="st-ente" value="${escA(s.nomeEnte)}"></div>
      <div class="col-md-6"><label class="lbl">Titolo applicazione</label><input class="form-control" id="st-tit" value="${escA(s.titolo)}"></div>
      <div class="col-md-3"><label class="lbl">Avviso lavaggio dopo (giorni)</label><input type="number" class="form-control" id="st-lav" value="${s.sogliaLavaggio}"></div>
      <div class="col-md-3"><label class="lbl">Soglia preventivo (€)</label><input type="number" class="form-control" id="st-prev" value="${s.sogliaPreventivo}"></div>
      <div class="col-md-3"><label class="lbl">Sessione admin (minuti)</label><input type="number" class="form-control" id="st-sess" value="${s.sessioneAdminMin}"></div>
      <div class="col-md-3"><label class="lbl">Revisione modulo cartaceo</label><input class="form-control" id="st-rev" value="${escA(s.revisioneModulo)}"></div>
      <div class="col-md-6"><label class="lbl">Programma email preferito</label><select class="form-select" id="st-mail"><option value="mailto" ${s.emailClient === 'mailto' ? 'selected' : ''}>Programma email del PC (Outlook/Mail)</option><option value="gmail" ${s.emailClient === 'gmail' ? 'selected' : ''}>Gmail (evidenziato)</option></select></div>
      <div class="col-12">${[['st-avv', 'avvisiAvvio', 'Mostra la bacheca avvisi all\'apertura'], ['st-suono', 'suono', 'Suono per i ritiri di oggi'], ['st-lunedi', 'lavaggioPrimoLunedi', 'Promemoria lavaggio il primo lunedì del mese'], ['st-json', 'backupJsonSegnalazione', 'Scarica un backup JSON ad ogni nuova segnalazione (come v15)'], ['st-op', 'chiediOperatore', 'Chiedi "chi sta usando l\'app" all\'apertura (tracciabilità)']].map(([id, k, l]) => `<div class="form-check form-switch"><input class="form-check-input" type="checkbox" id="${id}" ${s[k] ? 'checked' : ''}><label class="form-check-label" for="${id}">${l}</label></div>`).join('')}</div>
      <div class="col-12"><button class="btn btn-primary fw-bold" id="st-save"><i class="fas fa-save me-1"></i>Salva impostazioni</button></div></div>`)
    + card('Cambia password', 'fa-key', `<div class="row g-2"><div class="col-md-4"><input type="password" class="form-control" id="pw-old" placeholder="Password attuale"></div><div class="col-md-4"><input type="password" class="form-control" id="pw-new" placeholder="Nuova password"></div><div class="col-md-4"><input type="password" class="form-control" id="pw-new2" placeholder="Ripeti nuova"></div><div class="col-12"><button class="btn btn-outline-danger fw-bold" id="pw-save">Cambia password</button></div></div>`);
  $('#st-save').onclick = () => {
    const old = clone(s);
    Object.assign(s, {nomeEnte:v('st-ente'), titolo:v('st-tit'), sogliaLavaggio:num(v('st-lav')) || 30, sogliaPreventivo:num(v('st-prev')) || 2600, sessioneAdminMin:num(v('st-sess')) || 30, revisioneModulo:v('st-rev'), emailClient:v('st-mail'),
      avvisiAvvio:v('st-avv'), suono:v('st-suono'), lavaggioPrimoLunedi:v('st-lunedi'), backupJsonSegnalazione:v('st-json'), chiediOperatore:v('st-op')});
    const ch = Object.keys(s).filter(k => k !== 'passwordHash' && String(s[k]) !== String(old[k])).map(k => `${k}: ${old[k]} → ${s[k]}`);
    if (ch.length) logA('Admin', 'Impostazioni modificate: ' + ch.join('; '));
    Store.save('config'); toast('Impostazioni salvate', 'ok');
  };
  $('#pw-save').onclick = () => {
    if (!Admin.check(v('pw-old'))) { toast('Password attuale errata', 'err'); return; }
    if (v('pw-new').length < 4 || v('pw-new') !== v('pw-new2')) { toast('Le nuove password non coincidono (min 4 caratteri)', 'warn'); return; }
    s.passwordHash = pwHash(v('pw-new')); logA('Admin', 'Password amministrazione cambiata'); Store.save('config'); toast('Password cambiata', 'ok'); renderAdmin();
  };
}
function admVeicoli(b) {
  b.innerHTML = card('Veicoli della flotta', 'fa-truck-medical', `<p class="small text-muted">Un veicolo disattivato sparisce dagli elenchi ma il suo storico resta intatto. Il nome è la chiave dei dati e non si può cambiare.</p>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nome</th><th>Targa</th><th>Tipo</th><th>Modello</th><th>Immatricolazione</th><th>Telaio</th><th>Note</th><th>Attivo</th><th></th></tr></thead><tbody>
    ${CFG().veicoli.map((vh, i) => `<tr><td class="fw-bold nowrap"><i class="fas ${vehIcon(vh.nome)} me-1 text-muted"></i>${esc(vh.nome)}<div class="small text-muted">${(DB.flotta[vh.nome] || []).length} interventi</div></td>
      <td><input class="form-control form-control-sm mono" data-vi="${i}" data-k="targa" value="${escA(vh.targa || '')}" style="width:95px"></td>
      <td><select class="form-select form-select-sm" data-vi="${i}" data-k="tipo">${['Ambulanza', 'Automedica', 'Altro'].map(t => `<option ${vh.tipo === t ? 'selected' : ''}>${t}</option>`).join('')}</select></td>
      <td><input class="form-control form-control-sm" data-vi="${i}" data-k="modello" value="${escA(vh.modello || '')}"></td><td><input class="form-control form-control-sm" data-vi="${i}" data-k="immatricolazione" value="${escA(vh.immatricolazione || '')}" style="width:110px"></td>
      <td><input class="form-control form-control-sm mono" data-vi="${i}" data-k="telaio" value="${escA(vh.telaio || '')}"></td><td><input class="form-control form-control-sm" data-vi="${i}" data-k="note" value="${escA(vh.note || '')}"></td>
      <td><div class="form-check form-switch"><input class="form-check-input" type="checkbox" data-vi="${i}" data-k="attivo" ${vh.attivo !== false ? 'checked' : ''}></div></td><td></td></tr>`).join('')}</tbody></table></div>
    <div class="d-flex gap-2 mt-3 flex-wrap"><input class="form-control" id="nv-nome" placeholder="Nuovo veicolo, es. Falco 32" style="max-width:220px"><input class="form-control mono" id="nv-targa" placeholder="Targa" style="max-width:120px"><select class="form-select" id="nv-tipo" style="max-width:150px"><option>Ambulanza</option><option>Automedica</option><option>Altro</option></select><button class="btn btn-success fw-bold" id="nv-add"><i class="fas fa-plus me-1"></i>Aggiungi</button></div>`);
  $$('[data-vi]', b).forEach(e => e.onchange = () => {
    const vh = CFG().veicoli[+e.dataset.vi]; const k = e.dataset.k; const val = e.type === 'checkbox' ? e.checked : e.value.trim();
    const old = vh[k]; vh[k] = val; logA('Admin', `Veicolo ${vh.nome}: ${k} "${old ?? ''}" → "${val}"`); Store.save('config'); toast('Salvato', 'ok', 1200);
  });
  $('#nv-add').onclick = () => {
    const n = v('nv-nome'); if (!n) return; if (CFG().veicoli.some(x => normKey(x.nome) === normKey(n))) { toast('Esiste già', 'warn'); return; }
    CFG().veicoli.push({nome:n, targa:v('nv-targa'), tipo:v('nv-tipo'), attivo:true, modello:'', telaio:'', immatricolazione:'', note:''});
    DB.flotta[n] = DB.flotta[n] || [];
    CFG().pianiModello.forEach(tpl => { if (!tpl.tipi || tpl.tipi.includes(v('nv-tipo'))) DB.plans.push(planFromTemplate(tpl, n)); });
    logA('Admin', `Nuovo veicolo aggiunto: ${n} (${v('nv-tipo')})`); Store.save('config', 'flotta', 'plans'); renderAdmin();
  };
}
function admOperatori(b) {
  const o = CFG().operatori;
  b.innerHTML = card('Autisti dall\'app Turni', 'fa-id-badge', `<p class="small text-muted">L'elenco viene letto dallo stesso file dell'app turni autisti, così i nomi sono sempre allineati.</p>
      <div class="form-check form-switch mb-2"><input class="form-check-input" type="checkbox" id="op-sync" ${o.syncTurni ? 'checked' : ''}><label class="form-check-label" for="op-sync">Aggiorna automaticamente all'apertura</label></div>
      <label class="lbl">Indirizzo file turni</label><div class="input-group mb-2"><input class="form-control mono small" id="op-url" value="${escA(o.turniUrl)}"><button class="btn btn-primary" id="op-now"><i class="fas fa-sync me-1"></i>Aggiorna ora</button></div>
      <div class="small text-muted mb-2">Ultimo aggiornamento: ${esc(o.autistiAggiornati || 'mai (elenco predefinito)')}</div>
      <div class="chips">${(o.autisti || []).map(n => `<span class="chip ${(o.nascosti || []).some(x => normKey(x) === normKey(n)) ? '' : 'on'}" data-hide="${escA(n)}" title="Clicca per nascondere/mostrare nelle scelte rapide">${esc(n)}</span>`).join('')}</div><div class="small text-muted mt-1">Grigio = nascosto dalle scelte rapide.</div>`)
    + card('Altri operatori', 'fa-user-plus', `<p class="small text-muted">Infermieri, coordinatori o altri che usano l'app e non sono nei turni autisti.</p>
      <div class="d-flex flex-wrap gap-2 mb-2">${(o.extra || []).map((n, i) => `<span class="chip on">${esc(n)} <i class="fas fa-times ms-1" data-delx="${i}" style="cursor:pointer"></i></span>`).join('') || '<span class="text-muted small">Nessuno</span>'}</div>
      <div class="input-group" style="max-width:420px"><input class="form-control" id="op-x" placeholder="Nome"><button class="btn btn-success" id="op-xadd"><i class="fas fa-plus"></i></button></div>`)
    + card('Attività per operatore', 'fa-chart-bar', barsHTML('Operazioni registrate (registro attività)', countBy(DB.log, l => l.by).slice(0, 15)));
  $('#op-sync').onchange = e => { o.syncTurni = e.target.checked; Store.save('config'); };
  $('#op-url').onchange = e => { o.turniUrl = e.target.value.trim(); logA('Admin', 'Indirizzo file turni cambiato'); Store.save('config'); };
  $('#op-now').onclick = async () => { await syncAutistiTurni(true); renderAdmin(); };
  $$('[data-hide]', b).forEach(c => c.onclick = () => { const n = c.dataset.hide; o.nascosti = o.nascosti || []; const i = o.nascosti.findIndex(x => normKey(x) === normKey(n)); i >= 0 ? o.nascosti.splice(i, 1) : o.nascosti.push(n); Store.save('config'); renderAdmin(); });
  $$('[data-delx]', b).forEach(c => c.onclick = () => { const n = o.extra.splice(+c.dataset.delx, 1)[0]; logA('Admin', `Operatore rimosso: ${n}`); Store.save('config'); renderAdmin(); });
  $('#op-xadd').onclick = () => { const n = v('op-x'); if (!n) return; o.extra = o.extra || []; if (!o.extra.some(x => normKey(x) === normKey(n))) o.extra.push(n); logA('Admin', `Operatore aggiunto: ${n}`); Store.save('config'); renderAdmin(); };
}
function admOfficine(b) {
  const used = countBy(Object.values(DB.flotta).flat(), r => canonOfficina(r.officina)); const usedM = Object.fromEntries(used);
  b.innerHTML = card('Officine e rubrica', 'fa-address-book', `<p class="small text-muted">Gli "alias" servono a riconoscere i nomi scritti in modo diverso nello storico (es. "Auto Planet" = "Autoplanet"). L'email abilita il pulsante "Scrivi all'officina".</p>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nome</th><th>Tipo</th><th>Telefono</th><th>Email</th><th>Indirizzo</th><th>Alias (virgola)</th><th>Usi</th><th></th></tr></thead><tbody>
    ${officine().map((o, i) => `<tr><td><input class="form-control form-control-sm fw-bold" data-oi="${i}" data-k="nome" value="${escA(o.nome)}"></td><td><input class="form-control form-control-sm" data-oi="${i}" data-k="tipo" value="${escA(o.tipo || '')}" style="width:130px"></td><td><input class="form-control form-control-sm" data-oi="${i}" data-k="telefono" value="${escA(o.telefono || '')}" style="width:120px"></td><td><input class="form-control form-control-sm" data-oi="${i}" data-k="email" value="${escA(o.email || '')}"></td><td><input class="form-control form-control-sm" data-oi="${i}" data-k="indirizzo" value="${escA(o.indirizzo || '')}"></td><td><input class="form-control form-control-sm" data-oi="${i}" data-k="alias" value="${escA((o.alias || []).join(', '))}"></td><td class="text-center">${usedM[o.nome] || 0}</td><td><button class="btn btn-sm btn-outline-danger border-0" data-odel="${i}"><i class="fas fa-trash"></i></button></td></tr>`).join('')}
    </tbody></table></div><button class="btn btn-success fw-bold mt-3" id="of-add"><i class="fas fa-plus me-1"></i>Nuova officina</button>`)
    + card('Nomi officina nello storico non associati', 'fa-link', (() => { const un = used.filter(([n]) => n && n !== '-' && !findOfficina(n)); return un.length ? `<div class="d-flex flex-wrap gap-2">${un.map(([n, c]) => `<span class="chip">${esc(n)} <b>${c}</b> <select class="form-select form-select-sm d-inline-block ms-1" style="width:auto" data-alias="${escA(n)}"><option value="">associa a…</option>${officine().map((o, i) => `<option value="${i}">${esc(o.nome)}</option>`).join('')}<option value="new">+ nuova officina</option></select></span>`).join('')}</div>` : '<span class="small text-muted">Tutti i nomi sono associati a un\'officina in rubrica.</span>'; })());
  $$('[data-oi]', b).forEach(e => e.onchange = () => { const o = officine()[+e.dataset.oi]; const k = e.dataset.k; const old = k === 'alias' ? (o.alias || []).join(', ') : o[k]; o[k] = k === 'alias' ? e.value.split(',').map(s => s.trim()).filter(Boolean) : e.value.trim(); logA('Admin', `Officina ${o.nome}: ${k} "${old || ''}" → "${e.value.trim()}"`); Store.save('config'); toast('Salvato', 'ok', 1200); });
  $$('[data-odel]', b).forEach(e => e.onclick = async () => { const o = officine()[+e.dataset.odel]; if (!await confirmDlg(`Rimuovere ${esc(o.nome)} dalla rubrica? Lo storico non cambia.`, {danger:true})) return; toTrash('officina', o); CFG().officine.splice(+e.dataset.odel, 1); logA('Admin', `Officina rimossa: ${o.nome}`); Store.save('config'); renderAdmin(); });
  $('#of-add').onclick = () => { CFG().officine.push({id:uid(), nome:'Nuova officina', telefono:'', email:'', indirizzo:'', tipo:'', alias:[], note:''}); logA('Admin', 'Nuova officina in rubrica'); Store.save('config'); renderAdmin(); };
  $$('[data-alias]', b).forEach(s => s.onchange = () => { const n = s.dataset.alias; if (s.value === 'new') CFG().officine.push({id:uid(), nome:n, telefono:'', email:'', indirizzo:'', tipo:'', alias:[], note:''}); else if (s.value !== '') { const o = officine()[+s.value]; o.alias = o.alias || []; o.alias.push(n); } logA('Admin', `Officina "${n}" associata`); Store.save('config'); renderAdmin(); });
}
function admCategorie(b) {
  b.innerHTML = card('Categorie guasto', 'fa-tags', `<p class="small text-muted">Le parole chiave servono al rilevamento automatico della categoria. La priorità decide quale categoria vince se ci sono più parole (numero più basso = prima).</p>
    <table class="tbl"><thead><tr><th>Nome</th><th>Descrizione</th><th>Colore</th><th>Priorità</th><th>Parole chiave (virgola)</th><th></th></tr></thead><tbody>
    ${cats().map((c, i) => `<tr><td><input class="form-control form-control-sm fw-bold" data-ci="${i}" data-k="nome" value="${escA(c.nome)}" ${Object.values(DB.flotta).flat().some(r => r.categoria === c.nome) ? 'readonly title="In uso nello storico"' : ''}></td><td><input class="form-control form-control-sm" data-ci="${i}" data-k="descr" value="${escA(c.descr || '')}"></td>
      <td><select class="form-select form-select-sm" data-ci="${i}" data-k="pill">${['gray', 'blue', 'amber', 'cyan', 'dark', 'red', 'green', 'violet'].map(p => `<option ${c.pill === p ? 'selected' : ''}>${p}</option>`).join('')}</select></td><td><input type="number" class="form-control form-control-sm" data-ci="${i}" data-k="prio" value="${c.prio || 9}" style="width:70px"></td>
      <td><input class="form-control form-control-sm" data-ci="${i}" data-k="keywords" value="${escA((c.keywords || []).join(', '))}"></td><td>${catPill(c.nome)}</td></tr>`).join('')}</tbody></table>
    <div class="input-group mt-3" style="max-width:380px"><input class="form-control" id="cat-new" placeholder="Nuova categoria"><button class="btn btn-success" id="cat-add"><i class="fas fa-plus"></i></button></div>`)
    + card('Tipi di lavaggio', 'fa-shower', `<textarea class="form-control" id="tl" rows="4">${esc((CFG().tipiLavaggio || []).join('\n'))}</textarea><div class="small text-muted mt-1">Uno per riga.</div><button class="btn btn-primary btn-sm mt-2" id="tl-s">Salva</button>`)
    + card('Tipi cambio gomme', 'fa-compact-disc', `<textarea class="form-control" id="tg" rows="6">${esc((CFG().tipiGomme || []).join('\n'))}</textarea><button class="btn btn-primary btn-sm mt-2" id="tg-s">Salva</button>`);
  $$('[data-ci]', b).forEach(e => e.onchange = () => { const c = cats()[+e.dataset.ci]; const k = e.dataset.k; c[k] = k === 'keywords' ? e.value.split(',').map(s => s.trim()).filter(Boolean) : k === 'prio' ? +e.value : e.value.trim(); logA('Admin', `Categoria ${c.nome}: ${k} aggiornato`); Store.save('config'); toast('Salvato', 'ok', 1200); });
  $('#cat-add').onclick = () => { const n = v('cat-new'); if (!n || cats().some(c => normKey(c.nome) === normKey(n))) return; cats().push({nome:n, descr:'', pill:'blue', prio:6, keywords:[]}); logA('Admin', `Nuova categoria: ${n}`); Store.save('config'); renderAdmin(); };
  $('#tl-s').onclick = () => { CFG().tipiLavaggio = $('#tl').value.split('\n').map(s => s.trim()).filter(Boolean); logA('Admin', 'Tipi lavaggio aggiornati'); Store.save('config'); toast('Salvato', 'ok'); };
  $('#tg-s').onclick = () => { CFG().tipiGomme = $('#tg').value.split('\n').map(s => s.trim()).filter(Boolean); logA('Admin', 'Tipi gomme aggiornati'); Store.save('config'); toast('Salvato', 'ok'); };
}
function admGruppi(b) {
  b.innerHTML = `${(CFG().gruppiEmail || []).map((g, i) => { const ad = splitAddr(g.indirizzi);
    return card(esc(g.nome), 'fa-users-rectangle', `<div class="row g-2"><div class="col-md-5"><label class="lbl">Nome gruppo</label><input class="form-control" data-gi="${i}" data-k="nome" value="${escA(g.nome)}"></div><div class="col-md-7"><label class="lbl">Usato nei modelli</label><div>${Object.entries(CFG().templates).filter(([, t]) => (t.gruppi || []).includes(g.id)).map(([, t]) => `<span class="pill pill-blue me-1">${esc(t.nome)}</span>`).join('') || '<span class="small text-muted">nessuno</span>'}</div></div>
      <div class="col-12"><label class="lbl">Indirizzi (separati da virgola o a capo)</label><textarea class="form-control mono small" rows="3" data-gi="${i}" data-k="indirizzi">${esc(ad.join(',\n'))}</textarea><div class="mt-1">${ad.map(a => `<span class="addr-tag ${validEmail(a) ? '' : 'bad'}">${esc(a)}</span>`).join('')}</div></div></div>`,
      `<span class="small text-muted fw-normal me-2">${ad.length} indirizzi</span><button class="btn btn-sm btn-outline-danger border-0" data-gdel="${i}" title="Elimina gruppo"><i class="fas fa-trash"></i></button>`); }).join('')}
    <div class="input-group" style="max-width:420px"><input class="form-control" id="g-new" placeholder="Nuovo gruppo, es. Officine convenzionate"><button class="btn btn-success" id="g-add"><i class="fas fa-plus me-1"></i>Crea</button></div>`;
  $$('[data-gi]', b).forEach(e => e.onchange = () => { const g = CFG().gruppiEmail[+e.dataset.gi]; const k = e.dataset.k; const val = k === 'indirizzi' ? splitAddr(e.value).join(',') : e.value.trim(); const old = g[k]; g[k] = val; logA('Admin', `Gruppo email ${g.nome}: ${k} modificato${k === 'indirizzi' ? ` (${splitAddr(old).length} → ${splitAddr(val).length} indirizzi)` : ''}`); Store.save('config'); renderAdmin(); toast('Salvato', 'ok', 1200); });
  $$('[data-gdel]', b).forEach(e => e.onclick = async () => { const g = CFG().gruppiEmail[+e.dataset.gdel]; if (!await confirmDlg(`Eliminare il gruppo "${esc(g.nome)}"?`, {danger:true})) return; toTrash('gruppo email', g); CFG().gruppiEmail.splice(+e.dataset.gdel, 1); Object.values(CFG().templates).forEach(t => t.gruppi = (t.gruppi || []).filter(x => x !== g.id)); logA('Admin', `Gruppo email eliminato: ${g.nome}`); Store.save('config'); renderAdmin(); });
  $('#g-add').onclick = () => { const n = v('g-new'); if (!n) return; CFG().gruppiEmail.push({id:'g' + uid(), nome:n, indirizzi:''}); logA('Admin', `Nuovo gruppo email: ${n}`); Store.save('config'); renderAdmin(); };
}
function admModelli(b) {
  const T = CFG().templates; if (!T[ADM.tpl]) ADM.tpl = Object.keys(T)[0]; const t = T[ADM.tpl];
  const sample = {mezzo:'Falco 29', targa:targa('Falco 29'), km:'57580', operatore:who(), data:nowTS(), categoria:'Meccanica', priorita:'ALTA', fermo:'', problema:'Spia freni accesa', officina:'Autoplanet', dataApp:fmtD(new Date()), oraApp:'08:30', noteApp:'', noteOfficina:'08/10/2026 10:00: In attesa pezzo', dataRitiro:'10/10/2026', importo:eur(1850), soglia:eur(SET().sogliaPreventivo), intervento:'Sostituite pastiglie anteriori', dataNota:fmtD(new Date()), testo:'Visita tecnici Ferno', elenco:'- Falco 28 · Tagliando: SCADUTA', gruppiNomi:'Autisti Soccorritori'};
  b.innerHTML = `<div class="row g-3"><div class="col-lg-4"><div class="card-x"><div class="hd"><span class="ic ic-green"><i class="fas fa-envelope"></i></span>Modelli</div><div class="bd p0">${Object.entries(T).map(([k, x]) => `<div class="px-3 py-2 border-bottom ${k === ADM.tpl ? 'bg-light' : ''}" style="cursor:pointer" onclick="ADM.tpl='${k}';renderAdmin()"><b class="${k === ADM.tpl ? 'text-primary' : ''}">${esc(x.nome)}</b><div class="small text-muted">${esc(x.quando || '')}</div></div>`).join('')}</div></div></div>
    <div class="col-lg-8">${card(esc(t.nome), 'fa-pen', `<div class="row g-2"><div class="col-12"><span class="lbl">Destinatari predefiniti</span><div class="chips" id="tp-g">${(CFG().gruppiEmail || []).map(g => `<span class="chip ${(t.gruppi || []).includes(g.id) ? 'on' : ''}" data-g="${g.id}">${esc(g.nome)}</span>`).join('')}</div></div>
      <div class="col-12"><label class="lbl">CC fisso</label><input class="form-control mono small" id="tp-cc" value="${escA(t.cc || '')}"></div>
      <div class="col-12"><label class="lbl">Oggetto</label><input class="form-control fw-bold" id="tp-o" value="${escA(t.oggetto)}"></div>
      <div class="col-12"><label class="lbl">Testo</label><textarea class="form-control" id="tp-c" rows="10">${esc(t.corpo)}</textarea></div>
      <div class="col-12 ph-list small"><span class="lbl">Campi automatici (clicca per inserire)</span>${Object.entries(PLACEHOLDERS).map(([k, l]) => `<code data-ph="${k}" title="${escA(l)}">{${k}}</code>`).join('')}</div>
      <div class="col-12"><span class="lbl">Anteprima con dati di esempio</span><div class="mail-prev" id="tp-prev"></div></div>
      <div class="col-12 d-flex gap-2"><button class="btn btn-primary fw-bold" id="tp-save"><i class="fas fa-save me-1"></i>Salva modello</button><button class="btn btn-outline-secondary" id="tp-reset">Ripristina testo originale</button><button class="btn btn-outline-success ms-auto" id="tp-test"><i class="fas fa-paper-plane me-1"></i>Prova</button></div></div>`)}</div></div>`;
  const prev = () => { $('#tp-prev').textContent = `Oggetto: ${fillTpl(v('tp-o'), sample)}\n\n${fillTpl($('#tp-c').value, sample)}`; };
  ['tp-o', 'tp-c'].forEach(id => $('#' + id).oninput = prev); prev();
  let lastFocus = $('#tp-c'); ['tp-o', 'tp-c'].forEach(id => $('#' + id).onfocus = e => lastFocus = e.target);
  $$('[data-ph]', b).forEach(c => c.onclick = () => { const e = lastFocus; const s = e.selectionStart ?? e.value.length; e.value = e.value.slice(0, s) + `{${c.dataset.ph}}` + e.value.slice(e.selectionEnd ?? s); e.focus(); prev(); });
  $('#tp-g').onclick = e => { const c = e.target.closest('[data-g]'); if (c) c.classList.toggle('on'); };
  $('#tp-save').onclick = () => { t.gruppi = $$('#tp-g .chip.on').map(c => c.dataset.g); t.cc = v('tp-cc'); t.oggetto = v('tp-o'); t.corpo = $('#tp-c').value; logA('Admin', `Modello email "${t.nome}" modificato`); Store.save('config'); toast('Modello salvato', 'ok'); };
  $('#tp-reset').onclick = async () => { const d = defaultConfig().templates[ADM.tpl]; if (!d || !await confirmDlg('Ripristinare oggetto, testo e destinatari originali di questo modello?')) return; Object.assign(t, clone(d)); logA('Admin', `Modello email "${t.nome}" ripristinato`); Store.save('config'); renderAdmin(); };
  $('#tp-test').onclick = () => composeEmail(ADM.tpl, sample, {title:'Prova modello: ' + t.nome});
}
function admSegnalazioni(b) {
  b.innerHTML = card(`Segnalazioni attive (${DB.tickets.length})`, 'fa-clipboard-list', DB.tickets.length ? `<table class="tbl"><thead><tr><th>Veicolo</th><th>Aperta</th><th>Stato</th><th>Problema</th><th>Operatori</th><th></th></tr></thead><tbody>${DB.tickets.map(t => `<tr><td class="fw-bold">${esc(t.mezzo)}</td><td class="small nowrap">${esc(t.dataSegnalazione)}</td><td><select class="form-select form-select-sm" data-ts="${t.id}"><option value="segnalato" ${t.stato === 'segnalato' ? 'selected' : ''}>In attesa</option><option value="in_officina" ${t.stato === 'in_officina' ? 'selected' : ''}>In officina</option></select></td><td class="cell-clip small">${esc(t.problema)}</td><td class="small">${esc([t.operatoreSegnalazione, t.operatoreConsegna].filter(Boolean).join(', '))}</td><td class="nowrap"><button class="btn btn-sm btn-outline-primary" onclick="Scheda.open(${t.id})"><i class="fas fa-folder-open"></i></button> <button class="btn btn-sm btn-outline-danger" onclick="eliminaTicket(${t.id})"><i class="fas fa-trash"></i></button></td></tr>`).join('')}</tbody></table>` : '<div class="empty"><i class="fas fa-check-circle text-success"></i>Nessuna segnalazione attiva</div>');
  $$('[data-ts]', b).forEach(s => s.onchange = () => { const t = findTicket(+s.dataset.ts); const old = t.stato; t.stato = s.value; if (s.value === 'in_officina' && !t.dataIngresso) t.dataIngresso = nowTS(); addEv(t, 'stato', `Stato cambiato da admin: ${old} → ${s.value}`); logA('Admin', `${t.mezzo}: stato segnalazione ${old} → ${s.value}`, {tipo:'ticket', id:t.id}); Store.save('tickets'); });
}
function admPiani(b) {
  b.innerHTML = card('Piani di manutenzione per veicolo', 'fa-calendar-check', `<div class="d-flex gap-2 mb-3 flex-wrap"><button class="btn btn-dark btn-sm" onclick="modalPiano()"><i class="fas fa-plus me-1"></i>Nuovo piano</button><button class="btn btn-outline-primary btn-sm" id="pl-apply"><i class="fas fa-magic me-1"></i>Aggiungi piani predefiniti mancanti</button></div>
    <table class="tbl"><thead><tr><th>Veicolo</th><th>Piano</th><th>Intervallo</th><th>Stato</th><th>Attivo</th><th></th></tr></thead><tbody>
    ${DB.plans.slice().sort((a, b2) => a.mezzo.localeCompare(b2.mezzo) || a.nome.localeCompare(b2.nome)).map(p => { const s = planStatus(p); return `<tr><td class="fw-bold">${esc(p.mezzo)}</td><td>${esc(p.nome)}</td><td class="small">${[p.km && (+p.km).toLocaleString('it-IT') + ' km', p.mesi && p.mesi + ' mesi', (p.dateFisse || []).length && p.dateFisse.map(d => d.split('-').reverse().join('/')).join(', ')].filter(Boolean).join(' · ')}</td><td><span class="pstat ${s.stato}" onclick="dettaglioPiano(${p.id})">${PSTAT_L[s.stato]}<small>${esc(pstatText(s))}</small></span></td><td>${p.attivo !== false ? '<i class="fas fa-check text-success"></i>' : '<i class="fas fa-times text-muted"></i>'}</td><td><button class="btn btn-sm btn-outline-secondary" onclick="modalPiano(${p.id})"><i class="fas fa-cog"></i></button></td></tr>`; }).join('')}</tbody></table>`)
    + card('Modelli predefiniti', 'fa-copy', `<p class="small text-muted mb-2">Usati per creare i piani dei veicoli nuovi. Modificabili qui sotto in formato testo avanzato (JSON) — solo se sai cosa stai facendo.</p><textarea class="form-control mono small" rows="10" id="pl-json">${esc(JSON.stringify(CFG().pianiModello, null, 1))}</textarea><button class="btn btn-sm btn-outline-primary mt-2" id="pl-js">Salva modelli</button>`);
  $('#pl-apply').onclick = () => { let n = 0; vehicles().forEach(vh => CFG().pianiModello.forEach(tpl => { if ((!tpl.tipi || tpl.tipi.includes(vh.tipo)) && !DB.plans.some(p => p.mezzo === vh.nome && p.codice === tpl.codice)) { DB.plans.push(planFromTemplate(tpl, vh.nome)); n++; } })); logA('Manutenzione', `Aggiunti ${n} piani predefiniti mancanti`); Store.save('plans'); toast(`${n} piani aggiunti`, 'ok'); renderAdmin(); };
  $('#pl-js').onclick = () => { try { const x = JSON.parse($('#pl-json').value); if (!Array.isArray(x)) throw new Error('deve essere un elenco'); CFG().pianiModello = x; logA('Admin', 'Modelli piani manutenzione modificati'); Store.save('config'); toast('Salvato', 'ok'); } catch (e) { toast('JSON non valido: ' + esc(e.message), 'err'); } };
}
function trashLabel(t) { const d = t.data || {}; return d.problema || d.text || d.nome || (d.tipo && d.mezzo ? `${d.tipo} ${d.mezzo} ${d.data}` : '') || JSON.stringify(d).slice(0, 80); }
function admCestino(b) {
  const types = [...new Set(DB.trash.map(t => t.tipo))];
  const list = DB.trash.filter(t => !ADM.trashF || t.tipo === ADM.trashF);
  b.innerHTML = card(`Cestino (${DB.trash.length})`, 'fa-trash-restore', `<p class="small text-muted">Tutto ciò che viene eliminato finisce qui e può essere ripristinato. Nulla viene cancellato in automatico.</p>
    <div class="chips mb-3"><span class="chip ${!ADM.trashF ? 'on' : ''}" onclick="ADM.trashF='';renderAdmin()">Tutti</span>${types.map(t => `<span class="chip ${ADM.trashF === t ? 'on' : ''}" onclick="ADM.trashF='${jsq(t)}';renderAdmin()">${esc(t)}</span>`).join('')}</div>
    ${list.length ? `<table class="tbl"><thead><tr><th>Eliminato</th><th>Da</th><th>Tipo</th><th>Contenuto</th><th></th></tr></thead><tbody>${list.map(t => `<tr><td class="small nowrap">${esc(t.eliminatoIl)}</td><td class="small">${esc(t.eliminatoDa || '')}</td><td><span class="pill pill-gray">${esc(t.tipo)}</span>${t.mezzo ? `<div class="small fw-bold mt-1">${esc(t.mezzo)}</div>` : ''}</td><td class="small cell-clip">${esc(trashLabel(t))}</td><td class="nowrap"><button class="btn btn-sm btn-success" data-rest="${t.id}"><i class="fas fa-undo me-1"></i>Ripristina</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty"><i class="fas fa-trash"></i>Cestino vuoto</div>'}`);
  $$('[data-rest]', b).forEach(btn => btn.onclick = () => restoreTrash(+btn.dataset.rest));
}
function restoreTrash(id) {
  const t = DB.trash.find(x => x.id === id); if (!t) return; const d = clone(t.data); let docs = ['trash'];
  switch (t.tipo) {
    case 'intervento storico': (DB.flotta[t.mezzo] = DB.flotta[t.mezzo] || []).push(d); docs.push('flotta'); break;
    case 'segnalazione': DB.tickets.push(d); docs.push('tickets'); break;
    case 'lavaggio': DB.wash.push(d); docs.push('wash'); break;
    case 'nota calendario': DB.notes.push(d); docs.push('notes'); break;
    case 'piano manutenzione': DB.plans.push(d); docs.push('plans'); break;
    case 'officina': CFG().officine.push(d); docs.push('config'); break;
    case 'gruppo email': CFG().gruppiEmail.push(d); docs.push('config'); break;
    case 'nota officina': { const tk = findTicket(t.ticketId); if (!tk) { toast('Segnalazione non più attiva: nota non ripristinabile', 'warn'); return; } tk.noteOfficina.push(d); docs.push('tickets'); break; }
    default: toast('Tipo non ripristinabile', 'warn'); return;
  }
  DB.trash = DB.trash.filter(x => x.id !== id);
  logA('Ripristino', `Ripristinato dal cestino: ${t.tipo}${t.mezzo ? ' ' + t.mezzo : ''} — ${trashLabel(t).slice(0, 80)}`);
  Store.save(...docs); toast('Ripristinato', 'ok'); renderAdmin();
}
function admRegistro(b) { b.innerHTML = '<div id="adm-log-box"></div>'; renderLog('adm-log-box'); }
function admBackup(b) {
  b.innerHTML = card('Esporta / importa', 'fa-database', `<div class="row g-3"><div class="col-md-6"><div class="step-panel h-100"><h6><i class="fas fa-download"></i>Scarica archivio</h6><p class="small text-muted">File JSON con tutti i dati (compatibile con la v15).</p><button class="btn btn-primary fw-bold w-100" onclick="esportaJSON()"><i class="fas fa-file-download me-1"></i>Scarica backup JSON</button><button class="btn btn-outline-success w-100 mt-2" onclick="esportaExcelCompleto()"><i class="fas fa-file-excel me-1"></i>Scarica tutto in Excel</button></div></div>
      <div class="col-md-6"><div class="step-panel h-100"><h6><i class="fas fa-upload"></i>Carica archivio</h6><input type="file" id="imp-file" class="form-control mb-2" accept=".json"><div class="form-check"><input class="form-check-input" type="radio" name="imp-mode" id="imp-merge" checked><label class="form-check-label small" for="imp-merge"><b>Unisci</b>: aggiunge solo ciò che manca (consigliato)</label></div><div class="form-check mb-2"><input class="form-check-input" type="radio" name="imp-mode" id="imp-over"><label class="form-check-label small" for="imp-over"><b>Sostituisci</b>: rimpiazza i dati attuali</label></div><button class="btn btn-success fw-bold w-100" onclick="importaJSON()"><i class="fas fa-file-upload me-1"></i>Carica</button></div></div></div>`)
    + card('Backup automatici', 'fa-clock-rotate-left', `<p class="small">${TEST_MODE ? '<span class="pill pill-amber">modalità prova</span> In prova i backup cloud non vengono scritti.' : 'Ogni giorno viene salvata una copia completa nel cloud (ultimi 30 giorni).'} Inoltre il browser conserva gli ultimi 7 giorni.</p>
      <div class="sec-title">Copie nel cloud</div>${(CFG().backupIndex || []).length ? `<div class="d-flex flex-wrap gap-2">${CFG().backupIndex.map(d => `<button class="btn btn-sm btn-outline-secondary" data-cb="${d}">${fmtD(d)}</button>`).join('')}</div>` : '<div class="small text-muted">Nessuna</div>'}
      <div class="sec-title">Copie nel browser</div><div class="d-flex flex-wrap gap-2">${(() => { try { return JSON.parse(localStorage.getItem(LS_PREFIX + 'backup_locali_118') || '[]'); } catch (e) { return []; } })().map((x, i) => `<button class="btn btn-sm btn-outline-secondary" data-lb="${i}">${fmtD(x.day)}</button>`).join('') || '<span class="small text-muted">Nessuna</span>'}</div>
      <div class="small text-muted mt-2">Cliccando una copia puoi scaricarla o ripristinarla.</div>`);
  $$('[data-cb]', b).forEach(btn => btn.onclick = async () => { try { const d = await window.Cloud.getRaw('backup_' + btn.dataset.cb); if (!d) throw new Error('non trovato'); backupAction(JSON.parse(d.data), 'cloud ' + fmtD(btn.dataset.cb)); } catch (e) { toast('Errore: ' + esc(e.message), 'err'); } });
  $$('[data-lb]', b).forEach(btn => btn.onclick = () => { const arr = JSON.parse(localStorage.getItem(LS_PREFIX + 'backup_locali_118') || '[]'); backupAction(JSON.parse(arr[+btn.dataset.lb].data), 'browser ' + fmtD(arr[+btn.dataset.lb].day)); });
}
function backupAction(data, label) {
  const n = Object.values(data.flotta || {}).reduce((s, a) => s + a.length, 0);
  const m = openModal({title:'Backup ' + esc(label), color:'violet', size:'modal-dialog-centered', body:`<p>Contiene <b>${n}</b> interventi, <b>${(data.tickets || []).length}</b> segnalazioni, <b>${(data.wash || []).length}</b> lavaggi, <b>${(data.notes || []).length}</b> note.</p>`,
    footer:`<button class="btn btn-outline-primary me-auto" id="bk-dl"><i class="fas fa-download me-1"></i>Scarica</button><button class="btn btn-outline-success" id="bk-merge">Unisci</button><button class="btn btn-danger" id="bk-over">Ripristina</button>`});
  $('#bk-dl', m.el).onclick = () => downloadBlob(JSON.stringify(data, null, 1), `backup_118_${label.replace(/\W+/g, '_')}.json`, 'application/json');
  $('#bk-merge', m.el).onclick = () => { m.close(); applyImport({flottaDB:data.flotta, activeTickets:data.tickets, calendarNotes:data.notes, washDB:data.wash, plans:data.plans, kmlog:data.kmlog}, true, label); };
  $('#bk-over', m.el).onclick = () => { m.close(); applyImport({flottaDB:data.flotta, activeTickets:data.tickets, calendarNotes:data.notes, washDB:data.wash, plans:data.plans, kmlog:data.kmlog}, false, label); };
}
function esportaJSON(auto = false) {
  downloadBlob(JSON.stringify(Backup.legacyExport(), null, 2), `archivio_118_${todayISO()}.json`, 'application/json');
  if (!auto) logA('Backup', 'Scaricato backup JSON');
}
function esportaExcelCompleto() {
  const recs = Object.entries(DB.flotta).flatMap(([k, a]) => a.map(r => ({...r, _m:k, _d:recDate(r)}))).sort((a, b) => (b._d || 0) - (a._d || 0));
  exportExcel([
    {name:'Storico', head:['Data', 'Veicolo', 'Tipo', 'Categoria', 'Km', 'Problema', 'Operatore', 'Officina', 'Ingresso', 'Portato da', 'Chiusura', 'Ritirato da', 'Intervento', 'Costo'], rows:recs.map(r => [fmtD(r._d), r._m, recTipo(r), r.categoria || '', r.km || '', r.problema || '', r.operatoreSegnalazione || '', r.officina || '', r.dataIngresso || '', r.operatoreConsegna || '', r.dataChiusura || '', r.operatoreRitiro || '', r.intervento || '', r.costo ?? ''])},
    {name:'Segnalazioni aperte', head:['Aperta', 'Veicolo', 'Stato', 'Problema', 'Operatore', 'Officina'], rows:DB.tickets.map(t => [t.dataSegnalazione, t.mezzo, t.stato, t.problema, t.operatoreSegnalazione, t.officina || t.officinaAppuntamento || ''])},
    {name:'Lavaggi', head:['Data', 'Veicolo', 'Tipo', 'Operatore', 'Note'], rows:DB.wash.map(w => [w.data, w.mezzo, w.tipo, w.operatore, w.note])},
    {name:'Note', head:['Data', 'Testo', 'Autore'], rows:DB.notes.map(n => [fmtD(n.date), n.text, n.by || ''])},
    {name:'Km', head:['Data', 'Veicolo', 'Km', 'Fonte', 'Operatore'], rows:DB.kmlog.map(k => [k.data, k.mezzo, k.km, k.fonte, k.by])},
    {name:'Registro attività', head:['Data/ora', 'Operatore', 'Azione', 'Dettagli'], rows:DB.log.map(l => [fmtDT(l.ts), l.by, l.a, l.d])}
  ], `Archivio_completo_118_${todayISO()}.xlsx`);
  logA('Backup', 'Scaricato archivio Excel completo');
}
function importaJSON() {
  const f = $('#imp-file').files[0]; if (!f) { toast('Scegli un file', 'warn'); return; }
  const r = new FileReader(); r.onload = e => { try { applyImport(JSON.parse(e.target.result), $('#imp-merge').checked, f.name); } catch (err) { toast('File non valido', 'err'); } }; r.readAsText(f);
}
async function applyImport(d, merge, label) {
  if (!d.flottaDB || !d.activeTickets) { toast('Il file non sembra un archivio del gestionale', 'err'); return; }
  if (!merge && !await confirmDlg('SOSTITUIRE tutti i dati attuali con quelli del backup?\nPrima verrà scaricata automaticamente una copia dei dati attuali.', {danger:true, ok:'Sostituisci'})) return;
  esportaJSON(true);
  let added = 0;
  if (merge) {
    Object.entries(d.flottaDB).forEach(([k, arr]) => { DB.flotta[k] = DB.flotta[k] || []; (arr || []).forEach(r => { if (!DB.flotta[k].some(x => x.id === r.id)) { DB.flotta[k].push(r); added++; } }); });
    [['tickets', d.activeTickets], ['notes', d.calendarNotes], ['wash', d.washDB], ['plans', d.plans], ['kmlog', d.kmlog]].forEach(([k, arr]) => (arr || []).forEach(x => { if (!DB[k].some(y => y.id === x.id) && !(k === 'tickets' && Object.values(DB.flotta).flat().some(y => y.id === x.id))) { DB[k].push(x); added++; } }));
  } else {
    DB.flotta = d.flottaDB; DB.tickets = d.activeTickets; DB.notes = d.calendarNotes || []; DB.wash = d.washDB || [];
    if (d.plans) DB.plans = d.plans; if (d.kmlog) DB.kmlog = d.kmlog;
  }
  Store.normalize();
  logA('Backup', `${merge ? 'Unione' : 'Ripristino completo'} da ${label}${merge ? ` (${added} elementi aggiunti)` : ''}`);
  Store.save('flotta', 'tickets', 'notes', 'wash', 'plans', 'kmlog');
  toast(merge ? `${added} elementi aggiunti` : 'Dati ripristinati', 'ok');
}
