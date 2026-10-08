'use strict';
/* =====================================================================
   CORE — dati, salvataggio, utilità, tracciabilità
   Compatibile al 100% con i dati della v15 (stessi documenti Firebase
   gestionale_118/flotta|tickets|notes|wash, stesso formato).
   ===================================================================== */
const APP_VERSION = '16.0 RC';
const TEST_MODE = __TEST_MODE__;              // RC: legge dal cloud, NON scrive sul cloud
const LS_PREFIX = TEST_MODE ? 'RC16_' : '';
const KEYS = {
  flotta:'flottaDB_118_SanMarino', tickets:'activeTickets_118_SanMarino',
  notes:'calendarNotes_118_SanMarino', wash:'washHistoryDB_118_SanMarino',
  config:'config_118_SanMarino', plans:'plans_118_SanMarino', kmlog:'kmlog_118_SanMarino',
  trash:'trash_118_SanMarino', log:'log_118_SanMarino'
};
const DOCS = Object.keys(KEYS);
const MONTHS = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
const LOG_MAX = 3000;

const DB = { flotta:{}, tickets:[], notes:[], wash:[], config:null, plans:[], kmlog:[], trash:[], log:[] };

/* ---------- utilità base ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function escA(s) { return esc(s).replace(/`/g, '&#96;'); }
function jsq(s) { return String(s ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n'); }
let _lastId = 0;
function uid() { let t = Date.now(); if (t <= _lastId) t = _lastId + 1; _lastId = t; return t; }
const pad = n => String(n).padStart(2, '0');
function num(v) { if (v === null || v === undefined || v === '') return null; const n = parseFloat(String(v).replace(/\./g, '').replace(',', '.')); return isNaN(n) ? null : n; }
function eur(v) { const n = typeof v === 'number' ? v : num(v); return n === null ? '' : n.toLocaleString('it-IT', {style:'currency', currency:'EUR'}); }
function kmFmt(v) { const n = num(v); return n === null ? '' : n.toLocaleString('it-IT') + ' km'; }
function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s*-+>\s*/g, '>').replace(/\s+/g, ' ').trim(); }
function normKey(s) { return norm(s).replace(/[^a-z0-9]/g, ''); }
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
function clone(o) { return JSON.parse(JSON.stringify(o)); }

/* ---------- date: accetta tutti i formati presenti nei dati storici ---------- */
function parseDate(s) {
  if (s === null || s === undefined || s === '') return null;
  if (s instanceof Date) return isNaN(s) ? null : s;
  if (typeof s === 'number') return new Date(s);
  s = String(s).trim();
  let m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})(?:[ ,T]+(\d{1,2})[:.](\d{2})(?::(\d{2}))?)?/);
  if (m) { let y = +m[3]; if (y < 100) y += 2000; return new Date(y, +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)); }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
  return null;
}
function fmtD(d) { d = parseDate(d); return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : ''; }
function fmtDT(d) { d = parseDate(d); return d ? `${fmtD(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}` : ''; }
function isoD(d) { d = parseDate(d); return d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : ''; }
function hhmm(d) { d = parseDate(d); return d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : ''; }
function nowTS() { return fmtDT(new Date()); }
function todayISO() { return isoD(new Date()); }
function dayStart(d) { d = parseDate(d); if (!d) return null; const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function daysDiff(a, b) { const A = dayStart(a), B = dayStart(b); return (A && B) ? Math.round((B - A) / 864e5) : null; }
function addMonths(d, n) { const x = new Date(d); const day = x.getDate(); x.setMonth(x.getMonth() + n); if (x.getDate() < day) x.setDate(0); return x; }
function fromInputs(dateIso, time) { if (!dateIso) return ''; const d = parseDate(dateIso + (time ? 'T' + time : '')); return time ? fmtDT(d) : fmtD(d); }
function relDays(d) {
  const n = daysDiff(new Date(), d); if (n === null) return '';
  if (n === 0) return 'oggi'; if (n === 1) return 'domani'; if (n === -1) return 'ieri';
  return n > 0 ? `tra ${n} gg` : `${-n} gg fa`;
}
function recDate(r) { return parseDate(r.dataChiusura) || parseDate(r.dataSegnalazione) || (r.id ? new Date(r.id) : null); }

/* ---------- SHA-256 (per l'hash della password admin) ---------- */
function sha256(ascii) {
  const rr = (v, a) => (v >>> a) | (v << (32 - a)); const mp = Math.pow, mw = mp(2, 32); let res = '', i, j;
  const words = [], blen = ascii.length * 8; let hash = [], k = [], pc = 0; const ic = {};
  for (let c = 2; pc < 64; c++) { if (!ic[c]) { for (i = 0; i < 313; i += c) ic[i] = c; hash[pc] = (mp(c, .5) * mw) | 0; k[pc++] = (mp(c, 1 / 3) * mw) | 0; } }
  ascii = unescape(encodeURIComponent(ascii)); ascii += '\x80';
  while (ascii.length % 64 - 56) ascii += '\x00';
  for (i = 0; i < ascii.length; i++) { j = ascii.charCodeAt(i); words[i >> 2] |= j << ((3 - i) % 4) * 8; }
  words[words.length] = ((blen / mw) | 0); words[words.length] = (blen);
  for (j = 0; j < words.length;) {
    const w = words.slice(j, j += 16), oh = hash; hash = hash.slice(0, 8);
    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15], w2 = w[i - 2], a = hash[0], e = hash[4];
      const t1 = hash[7] + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & hash[5]) ^ ((~e) & hash[6])) + k[i] + (w[i] = (i < 16) ? w[i] : (w[i - 16] + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0);
      const t2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
      hash = [(t1 + t2) | 0].concat(hash); hash[4] = (hash[4] + t1) | 0;
    }
    for (i = 0; i < 8; i++) hash[i] = (hash[i] + oh[i]) | 0;
  }
  for (i = 0; i < 8; i++) for (j = 3; j + 1; j--) { const b = (hash[i] >> (j * 8)) & 255; res += ((b < 16) ? 0 : '') + b.toString(16); }
  return res;
}
const pwHash = p => sha256('118rsm::' + p);

/* ---------- configurazione predefinita (tutto modificabile dall'Admin) ---------- */
const AUTISTI_EMAIL = 'barbieri.matteo.1993@gmail.com,pilu.bera97@gmail.com,msarti@omniway.sm,nicofabbrism@gmail.com,filippovolpini83@gmail.com,pazz9@hotmail.com,ymichelotti@hotmail.it,ste200560@gmail.com';
function defaultConfig() {
  return {
    schema: 16,
    veicoli: [
      {nome:'Falco 27', targa:'L0605', tipo:'Automedica', attivo:true, modello:'', telaio:'', immatricolazione:'', note:''},
      {nome:'Falco 28', targa:'M1441', tipo:'Ambulanza', attivo:true, modello:'', telaio:'', immatricolazione:'', note:''},
      {nome:'Falco 29', targa:'P2217', tipo:'Ambulanza', attivo:true, modello:'', telaio:'', immatricolazione:'', note:''},
      {nome:'Falco 30', targa:'P8106', tipo:'Ambulanza', attivo:true, modello:'', telaio:'', immatricolazione:'', note:''},
      {nome:'Falco 31', targa:'S0670', tipo:'Ambulanza', attivo:true, modello:'', telaio:'', immatricolazione:'', note:''}
    ],
    officine: [
      {id:1, nome:'Menicucci', telefono:'0549 900043', email:'', indirizzo:'', tipo:'Carrozzeria', alias:[], note:''},
      {id:2, nome:'Reggini', telefono:'0549 909164', email:'', indirizzo:'', tipo:'Meccanica', alias:[], note:''},
      {id:3, nome:'Autoplanet', telefono:'0549 911349', email:'', indirizzo:'', tipo:'Meccanica', alias:['Auto Planet'], note:''},
      {id:4, nome:'Cesarini Elettrauto', telefono:'0549 902110', email:'', indirizzo:'', tipo:'Elettrauto', alias:['Cesarini'], note:''},
      {id:5, nome:'Titan Gomme', telefono:'0549 903464', email:'', indirizzo:'', tipo:'Gommista', alias:['Titan'], note:''},
      {id:6, nome:'Vision Ambulanze', telefono:'051 727245', email:'', indirizzo:'', tipo:'Allestimento sanitario', alias:['Vision'], note:''},
      {id:7, nome:'Centro Revisioni Acquaviva', telefono:'', email:'', indirizzo:'Acquaviva', tipo:'Revisioni', alias:['C.R. Acquaviva','Revisioni Acquaviva','Centro rev. Acquaviva','Centro Revisioni'], note:''}
    ],
    categorie: [
      {nome:'Meccanica', descr:'Motore, Freni', pill:'gray', prio:2, keywords:['freni','motore','olio','cambio','frizione','tagliando']},
      {nome:'Elettrica', descr:'Batteria, Luci, Sirene', pill:'amber', prio:1, keywords:['batteria','luci','sirena','radio','fari','elettric']},
      {nome:'Carrozzeria', descr:'Paraurti, Fiancate', pill:'cyan', prio:4, keywords:['paraurti','fiancata','specchietto','graffi']},
      {nome:'Pneumatici', descr:'Gomme, Forature', pill:'dark', prio:3, keywords:['gomme','pneumatici','ruota','foratura']},
      {nome:'Sanitaria', descr:'Attrezzatura sanitaria', pill:'red', prio:5, keywords:['barella','monitor','ossigeno','defibrillatore']},
      {nome:'Altro', descr:'Generico, Revisione', pill:'violet', prio:9, keywords:[]}
    ],
    tipiLavaggio: ['Esterno','Interno','Completo','Sanificazione'],
    tipiGomme: ['Nuove (Estive)','Nuove (Invernali)','Nuove (4 Stagioni)','Cambio Stagionale (Inv->Est)','Cambio Stagionale (Est->Inv)','Inversione','Riparazione'],
    operatori: {
      syncTurni: true,
      turniUrl: 'https://centrale118rsm-code.github.io/Turni-Autisti-2026-Rsm/turni.xlsx',
      autisti: ['Pazzaglia','Barbieri','Sarti','Volpini','Ghiotti','Michelotti','Berardi','Bianchi','Fabbri'],
      autistiAggiornati: '',
      extra: [],
      nascosti: []
    },
    gruppiEmail: [
      {id:'autisti', nome:'Autisti Soccorritori', indirizzi:AUTISTI_EMAIL},
      {id:'direzione', nome:'Dirigenza PS', indirizzi:'alessandro.valentino@iss.sm,stefania.frisoni@iss.sm'},
      {id:'economato', nome:'Economato', indirizzi:'segreteria.economato@iss.sm,milena.dolcini@iss.sm,floriana.serra@iss.sm'},
      {id:'economato_man', nome:'Economato – Manutenzioni', indirizzi:'segreteria.economato@iss.sm,milena.dolcini@iss.sm,floriana.serra@iss.sm,alex.piselli@iss.sm,stefania.frisoni@iss.sm'},
      {id:'avvisi_note', nome:'Avvisi note calendario', indirizzi:'barbieri.matteo.1993@gmail.com,pilu.bera97@gmail.com,msarti@omniway.sm,nicofabbrism@gmail.com,filippovolpini83@gmail.com'}
    ],
    templates: {
      segnalazione: {nome:'Nuova segnalazione guasto', quando:'Apertura di una segnalazione con "Invia email"', gruppi:['autisti'], cc:'', oggetto:'SEGNALAZIONE GUASTO VEICOLO 118', corpo:'NUOVA SEGNALAZIONE\n\nVeicolo: {mezzo} ({targa})\nKm: {km}\nOperatore: {operatore}\nData: {data}\nCategoria: {categoria}\nPriorità: {priorita}{fermo}\n\nPROBLEMA:\n{problema}'},
      appuntamento: {nome:'Appuntamento officina → Economato', quando:'Dopo aver fissato un appuntamento', gruppi:['economato_man'], cc:'', oggetto:'Manutenzione {mezzo} - Appuntamento', corpo:'Economato,\n\nVeicolo: {mezzo} ({targa})\nGuasto: {problema}\nAppuntamento: {officina}\nGiorno: {dataApp} ore {oraApp}\n{noteApp}\n\nCordiali saluti, {operatore}'},
      aggiornamento: {nome:'Aggiornamento mezzo in officina', quando:'Pulsante "Email" su un mezzo in officina', gruppi:['economato_man'], cc:'', oggetto:'R: GUASTO {mezzo} - Aggiornamento', corpo:'Economato,\n\nVeicolo: {mezzo} ({targa})\nOfficina: {officina}\nProblema: {problema}\n\nNote:\n{noteOfficina}\n\nRitiro: {dataRitiro}\n\n118 San Marino'},
      preventivo: {nome:'Richiesta autorizzazione preventivo', quando:'Preventivo sopra soglia da autorizzare', gruppi:['economato_man','direzione'], cc:'', oggetto:'Autorizzazione preventivo {mezzo} - {importo}', corpo:'Buongiorno,\n\nsi richiede autorizzazione per il preventivo relativo al veicolo {mezzo} ({targa}).\n\nOfficina: {officina}\nGuasto: {problema}\nImporto preventivo: {importo}\n\nIn attesa di autorizzazione (soglia {soglia}).\n\nCordiali saluti,\n{operatore} - Centrale 118 San Marino'},
      officina: {nome:'Richiesta all\'officina', quando:'Contatto diretto con l\'officina (se ha un indirizzo email in rubrica)', gruppi:[], cc:'', oggetto:'Richiesta intervento veicolo {mezzo} ({targa})', corpo:'Buongiorno,\n\nper il veicolo {mezzo} targa {targa} (km {km}) segnaliamo:\n{problema}\n\nChiediamo cortesemente disponibilità per un appuntamento.\n\nCordiali saluti,\n{operatore} - Centrale 118 San Marino'},
      ritiro: {nome:'Mezzo ritirato / di nuovo operativo', quando:'Dopo la chiusura (ritiro) di un intervento', gruppi:['autisti'], cc:'', oggetto:'{mezzo} di nuovo OPERATIVO', corpo:'Il veicolo {mezzo} ({targa}) è stato ritirato da {officina} ed è di nuovo operativo.\n\nRitirato da: {operatore}\nData: {data}\nKm: {km}\n\nIntervento eseguito:\n{intervento}\n\n118 San Marino'},
      nota: {nome:'Nota di calendario', quando:'Aggiunta di una nota con "Invia email"', gruppi:['avvisi_note'], cc:'', oggetto:'AVVISO NOTA 118 San Marino', corpo:'Nuova nota per il {dataNota}:\n\n{testo}'},
      scadenza: {nome:'Manutenzioni in scadenza', quando:'Pulsante "Email scadenze" nella pagina Manutenzioni', gruppi:['autisti'], cc:'', oggetto:'Manutenzioni programmate in scadenza - {data}', corpo:'Riepilogo manutenzioni programmate scadute o in scadenza:\n\n{elenco}\n\n118 San Marino'},
      comunicazione: {nome:'Comunicazione generica', quando:'Pulsante "Email" della barra / pagina Comunicazioni', gruppi:['autisti'], cc:'', oggetto:'COMUNICAZIONE 118 ({gruppiNomi})', corpo:'Gentili,\nDa Centrale 118.\n\n[INSERIRE MESSAGGIO]\n\nCordiali saluti, 118 San Marino'}
    },
    pianiModello: [
      {codice:'tagliando', nome:'Tagliando (olio + filtri)', categoria:'Meccanica', km:30000, mesi:12, dateFisse:[], preavvisoKm:1500, preavvisoGiorni:30, tipi:['Ambulanza','Automedica'], keywords:['tagliando','cambio olio','olio motore'], escludi:[], checklist:['Fissare appuntamento con l\'officina','Sostituzione olio motore','Sostituzione filtri (olio, aria, gasolio, abitacolo)','Controllo livelli (freni, refrigerante, AdBlue)','Controllo usura freni e pneumatici','Reset spia service','Annotare km, costo e prossima scadenza']},
      {codice:'revisione', nome:'Revisione ministeriale', categoria:'Altro', km:null, mesi:12, dateFisse:[], preavvisoKm:0, preavvisoGiorni:30, tipi:['Ambulanza','Automedica'], keywords:['revisione'], escludi:['vano','sanitari','presidi','allestimento'], checklist:['Prenotare la revisione','Verificare luci, tergicristalli, pneumatici','Portare libretto di circolazione','Ritirare esito e aggiornare il libretto']},
      {codice:'vano', nome:'Revisione vano sanitario / allestimento', categoria:'Sanitaria', km:null, mesi:12, dateFisse:[], preavvisoKm:0, preavvisoGiorni:30, tipi:['Ambulanza'], keywords:['revisione vano','revisione allestimento','revisione sanitaria'], escludi:[], checklist:['Contattare ditta allestitrice','Controllo impianto ossigeno','Controllo impianto elettrico sanitario','Controllo barella e ancoraggi','Controllo climatizzazione vano']},
      {codice:'gomme_inv', nome:'Montaggio gomme invernali', categoria:'Pneumatici', km:null, mesi:null, dateFisse:['11-15'], preavvisoKm:0, preavvisoGiorni:30, tipi:['Ambulanza','Automedica'], keywords:['est>inv','estive>termiche','estive>invernali','a termiche','montate termiche','gomme termiche','montate invernali','nuove (invernali)'], escludi:[], checklist:['Prenotare il gommista','Controllo usura e data gomme','Montaggio e equilibratura','Controllo pressione','Annotare km']},
      {codice:'gomme_est', nome:'Montaggio gomme estive', categoria:'Pneumatici', km:null, mesi:null, dateFisse:['04-15'], preavvisoKm:0, preavvisoGiorni:30, tipi:['Ambulanza','Automedica'], keywords:['inv>est','termiche>estive','invernali>estive','montate estive','a estive','nuove (estive)'], escludi:[], checklist:['Prenotare il gommista','Controllo usura e data gomme','Montaggio e equilibratura','Controllo pressione','Annotare km']},
      {codice:'estintore', nome:'Controllo estintore', categoria:'Altro', km:null, mesi:6, dateFisse:[], preavvisoKm:0, preavvisoGiorni:15, tipi:['Ambulanza','Automedica'], keywords:['estintore'], escludi:[], checklist:['Verifica manometro','Verifica sigillo e cartellino','Annotare data controllo']}
    ],
    impostazioni: {
      nomeEnte:'118 SAN MARINO SOCCORSO', titolo:'Piano Manutenzione Veicoli',
      sogliaLavaggio:30, sogliaPreventivo:2600, backupJsonSegnalazione:true,
      suono:true, avvisiAvvio:true, lavaggioPrimoLunedi:true, emailClient:'mailto',
      revisioneModulo:'23/09/25', sessioneAdminMin:30, chiediOperatore:true,
      passwordHash: pwHash('ambulanza')
    },
    pianiGenerati: false,
    backupIndex: []
  };
}
/* unione non distruttiva: aggiunge solo le chiavi mancanti */
function mergeDefaults(target, def) {
  if (!target || typeof target !== 'object' || Array.isArray(target)) return clone(def);
  for (const k of Object.keys(def)) {
    if (!(k in target)) target[k] = clone(def[k]);
    else if (def[k] && typeof def[k] === 'object' && !Array.isArray(def[k]) && k !== 'templates') mergeDefaults(target[k], def[k]);
  }
  if (def.templates && target.templates) for (const t of Object.keys(def.templates)) if (!target.templates[t]) target.templates[t] = clone(def.templates[t]);
  return target;
}
const CFG = () => DB.config;
const SET = () => DB.config.impostazioni;

/* ---------- veicoli ---------- */
function vehicles(all = false) { return (CFG().veicoli || []).filter(v => all || v.attivo !== false); }
function vehNames(all = false) { return vehicles(all).map(v => v.nome); }
function veh(n) { return (CFG().veicoli || []).find(v => v.nome === n) || {nome:n, targa:'', tipo:'Ambulanza'}; }
function targa(n) { return veh(n).targa || ''; }
function vehIcon(n) { const t = veh(n).tipo; return t === 'Automedica' ? 'fa-car-side' : t === 'Ambulanza' ? 'fa-truck-medical' : 'fa-van-shuttle'; }
function vehClass(n) { const t = veh(n).tipo; return t === 'Automedica' ? 't-automedica' : t === 'Ambulanza' ? 't-ambulanza' : 't-altro'; }
function short(n) { return String(n).replace('Falco ', 'F'); }
function vehOptions(sel = '', all = false) { return vehicles(all).map(v => `<option value="${escA(v.nome)}" ${v.nome === sel ? 'selected' : ''}>${esc(v.nome)} (${esc(v.tipo)}${v.targa ? ' · ' + esc(v.targa) : ''})</option>`).join(''); }

/* ---------- categorie ---------- */
function cats() { return CFG().categorie || []; }
function catOptions(sel = '', withAuto = false) { return (withAuto ? '<option value="">– Rilevamento automatico –</option>' : '') + cats().map(c => `<option value="${escA(c.nome)}" ${c.nome === sel ? 'selected' : ''}>${esc(c.nome)}${c.descr ? ' (' + esc(c.descr) + ')' : ''}</option>`).join(''); }
function catPill(n) { const c = cats().find(x => x.nome === n); return `<span class="pill pill-${c ? c.pill : 'gray'}">${esc(n || 'Generico')}</span>`; }
function determinaCategoria(d) {
  d = String(d || '').toLowerCase();
  const sorted = cats().slice().sort((a, b) => (a.prio || 9) - (b.prio || 9));
  for (const c of sorted) if ((c.keywords || []).some(k => k && d.includes(k.toLowerCase()))) return c.nome;
  return sorted.find(c => c.nome === 'Altro') ? 'Altro' : (sorted[sorted.length - 1] || {}).nome || 'Altro';
}

/* ---------- officine ---------- */
function officine() { return CFG().officine || []; }
function findOfficina(name) {
  const k = normKey(name); if (!k) return null;
  return officine().find(o => normKey(o.nome) === k || (o.alias || []).some(a => normKey(a) === k))
      || officine().find(o => k.length > 3 && (normKey(o.nome).includes(k) || k.includes(normKey(o.nome))));
}
function canonOfficina(name) { const o = findOfficina(name); return o ? o.nome : String(name || '').trim(); }

/* ---------- operatori (autisti dall'app Turni + extra) ---------- */
function operatori() {
  const o = CFG().operatori; const hid = new Set((o.nascosti || []).map(normKey));
  const out = []; const seen = new Set();
  [...(o.autisti || []), ...(o.extra || [])].forEach(n => { const k = normKey(n); if (n && !seen.has(k) && !hid.has(k)) { seen.add(k); out.push(n); } });
  return out;
}
function recentNames(field, days = 365) {
  const lim = Date.now() - days * 864e5; const cnt = {};
  const add = n => { n = String(n || '').trim(); if (n && n.length > 1 && !/^(-|storico|archivio|reg\. gomme)$/i.test(n)) cnt[n] = (cnt[n] || 0) + 1; };
  Object.values(DB.flotta).flat().forEach(r => { const d = recDate(r); if (d && d.getTime() >= lim) field(r).forEach(add); });
  DB.tickets.forEach(t => field(t).forEach(add));
  return Object.entries(cnt).sort((a, b) => b[1] - a[1]).map(e => e[0]);
}
function opChoices() {
  const base = operatori(); const k = new Set(base.map(normKey));
  const rec = recentNames(r => [r.operatoreSegnalazione, r.operatoreConsegna, r.operatoreRitiro, r.operatoreAppuntamento], 180)
    .filter(n => !k.has(normKey(n)) && !base.some(b => normKey(n).includes(normKey(b))) && /^[A-Za-zÀ-ÿ' .]{3,30}$/.test(n) && n.trim().split(/\s+/).length <= 3 && !/officina|autonomia|centrale/i.test(n)).filter((n, i, arr) => arr.findIndex(x => normKey(x) === normKey(n)) === i).slice(0, 4);
  return {base, rec};
}
function offChoices() {
  const base = officine().map(o => o.nome);
  const rec = recentNames(r => [r.officina, r.officinaAppuntamento], 365).map(canonOfficina)
    .filter((n, i, a) => n && a.indexOf(n) === i && !base.includes(n)).slice(0, 4);
  return {base, rec};
}
async function syncAutistiTurni(manual = false) {
  const o = CFG().operatori; if (!o.syncTurni && !manual) return;
  try {
    await loadXLSX();
    const r = await fetch(o.turniUrl + (o.turniUrl.includes('?') ? '&' : '?') + 'v=' + Date.now());
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const wb = XLSX.read(await r.arrayBuffer(), {type:'array'});
    const ws = wb.Sheets['Foglio2'] || wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, {header:1, blankrows:true, defval:''});
    const bad = ['CONGEDO','MALATTIA','RESIDUE','P.S.','RECUPERO','PERM.','ASPETTATIVA','FEST.','DISTACCO','1>7','P/PN'];
    const names = [];
    rows.forEach((row, i) => { const v = row[0]; if (i >= 2 && typeof v === 'string' && v.trim().length > 2 && !bad.some(b => v.toUpperCase().includes(b))) names.push(v.trim()); });
    if (!names.length) throw new Error('nessun nome trovato');
    const changed = JSON.stringify(names) !== JSON.stringify(o.autisti);
    o.autisti = names; o.autistiAggiornati = nowTS();
    localStorage.setItem(LS_PREFIX + 'autisti_turni_cache', JSON.stringify(names));
    if (changed) { Store.save('config'); if (manual) logA('Operatori', 'Elenco autisti aggiornato dall\'app Turni: ' + names.join(', ')); }
    if (manual) toast(`Elenco autisti aggiornato dall'app Turni (${names.length})`, 'ok');
    return names;
  } catch (e) { if (manual) toast('Impossibile leggere i turni: ' + e.message, 'err'); console.warn('Turni', e); }
}

/* ---------- operatore attivo (tracciabilità) ---------- */
function currentOp() { try { return localStorage.getItem(LS_PREFIX + 'operatore_attivo') || ''; } catch (e) { return ''; } }
function setCurrentOp(n) { try { localStorage.setItem(LS_PREFIX + 'operatore_attivo', n || ''); } catch (e) {} App.renderHeader(); }
function device() {
  let id; try { id = localStorage.getItem('device_id_118'); if (!id) { id = 'D' + Math.random().toString(36).slice(2, 7).toUpperCase(); localStorage.setItem('device_id_118', id); } } catch (e) { id = 'D?'; }
  const ua = navigator.userAgent; const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iOS' : /Windows/i.test(ua) ? 'Windows' : /Mac/i.test(ua) ? 'Mac' : 'Altro';
  return `${os}·${id}`;
}
function who() { return currentOp() || 'Non identificato'; }
function ensureOp() {
  return new Promise(res => { if (currentOp() || !SET().chiediOperatore) return res(currentOp()); pickOperator(res); });
}
function pickOperator(cb0) {
  let fired = false; const cb = cb0 ? n => { if (!fired) { fired = true; cb0(n); } } : null;
  const {base, rec} = opChoices();
  const m = openModal({title:'<i class="fas fa-user-check me-2"></i>Chi sta usando l\'app?', color:'blue', size:'',
    body:`<p class="small text-muted mb-2">Il tuo nome verrà registrato su ogni operazione (registro attività). Puoi cambiarlo quando vuoi dall'intestazione.</p>
      <div class="d-flex flex-wrap gap-2 mb-3">${base.concat(rec).map(n => `<button class="btn btn-outline-primary fw-bold" data-op="${escA(n)}">${esc(n)}</button>`).join('')}</div>
      <label class="lbl">Altro nome</label><div class="input-group"><input class="form-control" id="op-altro" placeholder="Nome e cognome"><button class="btn btn-primary" id="op-ok">OK</button></div>`,
    footer:`<button class="btn btn-light" data-bs-dismiss="modal">Più tardi</button>`});
  const done = n => { n = String(n || '').trim(); if (!n) return; const prev = currentOp(); setCurrentOp(n); if (prev !== n) logA('Accesso', `Operatore attivo: ${n}${prev ? ' (prima: ' + prev + ')' : ''}`); m.close(); cb && cb(n); };
  m.el.addEventListener('click', e => { const b = e.target.closest('[data-op]'); if (b) done(b.dataset.op); });
  $('#op-ok', m.el).onclick = () => done($('#op-altro', m.el).value);
  $('#op-altro', m.el).onkeydown = e => { if (e.key === 'Enter') done(e.target.value); };
  m.el.addEventListener('hidden.bs.modal', () => cb && cb(currentOp()), {once:true});
}

/* ---------- registro attività ---------- */
function logA(azione, dettagli, ref) {
  DB.log.unshift({id:uid(), ts:Date.now(), by:who(), dev:device(), a:azione, d:String(dettagli || '').slice(0, 600), ref:ref || null});
  if (DB.log.length > LOG_MAX) DB.log.length = LOG_MAX;
  Store.save('log');
}
/* confronta campi e registra le modifiche dentro il record (storicoModifiche) */
function applyChanges(obj, values, labels) {
  const ch = [];
  for (const k of Object.keys(values)) {
    const a = obj[k] ?? '', b = values[k] ?? '';
    if (String(a) !== String(b)) { ch.push({campo:labels[k] || k, da:String(a).slice(0, 200), a:String(b).slice(0, 200)}); obj[k] = values[k]; }
  }
  if (ch.length) {
    obj.modifiche = obj.modifiche || [];
    obj.modifiche.push({ts:nowTS(), by:who(), campi:ch});
    obj.modificatoDa = who(); obj.modificatoIl = nowTS();
  }
  return ch;
}
function changesText(ch) { return ch.map(c => `${c.campo}: "${c.da}" → "${c.a}"`).join('; '); }

/* ---------- cestino (nessun dato viene cancellato definitivamente) ---------- */
function toTrash(tipo, obj, extra = {}) {
  DB.trash.unshift({id:uid(), tipo, data:clone(obj), eliminatoIl:nowTS(), eliminatoDa:who(), ...extra});
  Store.save('trash');
}

/* ---------- STORE: localStorage + cloud ---------- */
function lsGet(d) {
  try {
    let v = localStorage.getItem(LS_PREFIX + KEYS[d]);
    if (v === null && TEST_MODE) v = localStorage.getItem(KEYS[d]);    // in prova legge (solo lettura) i dati locali della v15
    return v === null ? null : JSON.parse(v);
  } catch (e) { return null; }
}
function lsSet(d) { try { localStorage.setItem(LS_PREFIX + KEYS[d], JSON.stringify(DB[d])); } catch (e) { console.warn('localStorage pieno?', e); } }
function emptyDoc(d) { return d === 'flotta' ? {} : d === 'config' ? defaultConfig() : []; }

const Store = {
  loaded: {}, dirty: new Set(), status: 'wait', statusMsg: 'Connessione…', timer: null, cloudExists: {},
  init() {
    DOCS.forEach(d => { const v = lsGet(d); DB[d] = v ?? emptyDoc(d); });
    this.normalize();
  },
  normalize() {
    DB.config = mergeDefaults(DB.config, defaultConfig());
    if (!DB.flotta || typeof DB.flotta !== 'object' || Array.isArray(DB.flotta)) DB.flotta = {};
    vehNames(true).forEach(v => { if (!Array.isArray(DB.flotta[v])) DB.flotta[v] = []; });
    // eventuali veicoli presenti nei dati ma non in configurazione: li aggiungo (mai perdere dati)
    Object.keys(DB.flotta).forEach(v => { if (!CFG().veicoli.some(x => x.nome === v)) CFG().veicoli.push({nome:v, targa:'', tipo:'Ambulanza', attivo:true}); });
    ['tickets','notes','wash','plans','kmlog','trash','log'].forEach(d => { if (!Array.isArray(DB[d])) DB[d] = []; });
    try { const c = JSON.parse(localStorage.getItem(LS_PREFIX + 'autisti_turni_cache') || 'null'); if (Array.isArray(c) && c.length && !CFG().operatori.autisti.length) CFG().operatori.autisti = c; } catch (e) {}
  },
  save(...docs) {
    docs.forEach(d => { lsSet(d); this.dirty.add(d); });
    clearTimeout(this.timer); this.timer = setTimeout(() => this.push(), 500);
    App.refresh();
  },
  push() {
    if (TEST_MODE || !window.Cloud) return;
    const all = DOCS.every(d => this.loaded[d]);
    [...this.dirty].forEach(d => {
      if (!this.loaded[d]) return;                    // mai scrivere prima di aver letto il cloud
      this.dirty.delete(d);
      window.Cloud.save(d, DB[d]).then(() => this.setStatus('ok', 'Sincronizzato')).catch(e => { this.dirty.add(d); this.setStatus('err', 'Errore salvataggio cloud: ' + e.message); });
    });
    if (all) Backup.dailyCloud();
  },
  onRemote(d, value, exists) {
    this.cloudExists[d] = exists;
    const first = !this.loaded[d]; this.loaded[d] = true;
    if (TEST_MODE && first && localStorage.getItem(LS_PREFIX + KEYS[d]) !== null && !this.forceReload) { this.checkReady(); return; }
    if (!exists) {
      if (!TEST_MODE && first) {
        const hasLocal = d === 'flotta' ? Object.values(DB.flotta).some(a => a.length) : d === 'config' ? true : DB[d].length > 0;
        if (hasLocal) this.dirty.add(d);              // il cloud non ha il documento: lo inizializzo con i dati locali
      }
      this.checkReady(); return;
    }
    if (JSON.stringify(value) !== JSON.stringify(DB[d])) {
      DB[d] = value; this.normalize(); lsSet(d); App.refresh();
    }
    this.checkReady();
  },
  checkReady() {
    if (DOCS.every(d => this.loaded[d])) {
      if (!this.readyFired) {
        this.readyFired = true; this.forceReload = false;
        this.setStatus(TEST_MODE ? 'test' : 'ok', TEST_MODE ? 'Modalità prova (cloud in sola lettura)' : 'Sincronizzato');
        App.onDataReady();
      }
      if (this.dirty.size) this.push();
    }
  },
  setStatus(s, msg) { this.status = s; this.statusMsg = msg; App.renderHeader(); }
};

/* ---------- BACKUP automatici ---------- */
const Backup = {
  snapshot() { const o = {}; DOCS.forEach(d => o[d] = DB[d]); return {app:'Veicoli118', versione:APP_VERSION, creato:nowTS(), ...o}; },
  legacyExport() { return {flottaDB:DB.flotta, activeTickets:DB.tickets, calendarNotes:DB.notes, washDB:DB.wash, config:DB.config, plans:DB.plans, kmlog:DB.kmlog, trash:DB.trash, log:DB.log, timestamp:new Date().toLocaleString(), versione:APP_VERSION}; },
  local() {   // 7 copie giornaliere nel browser
    try {
      const k = LS_PREFIX + 'backup_locali_118'; const arr = JSON.parse(localStorage.getItem(k) || '[]'); const day = todayISO();
      if (arr.length && arr[0].day === day) return;
      arr.unshift({day, data:JSON.stringify({flotta:DB.flotta, tickets:DB.tickets, notes:DB.notes, wash:DB.wash, plans:DB.plans, kmlog:DB.kmlog})});
      localStorage.setItem(k, JSON.stringify(arr.slice(0, 7)));
    } catch (e) { console.warn('backup locale', e); }
  },
  async dailyCloud() {
    if (TEST_MODE || !window.Cloud || this._busy) return;
    const day = todayISO(); const idx = CFG().backupIndex || [];
    if (idx.includes(day)) return;
    this._busy = true;
    try {
      await window.Cloud.saveRaw('backup_' + day, {data:JSON.stringify({flotta:DB.flotta, tickets:DB.tickets, notes:DB.notes, wash:DB.wash, plans:DB.plans, kmlog:DB.kmlog, trash:DB.trash}), creato:nowTS(), by:who()});
      idx.unshift(day); const keep = idx.slice(0, 30), drop = idx.slice(30);
      CFG().backupIndex = keep; Store.save('config');
      for (const d of drop) { try { await window.Cloud.del('backup_' + d); } catch (e) {} }
    } catch (e) { console.warn('backup cloud', e); }
    this._busy = false;
  }
};

/* ---------- caricamento librerie su richiesta ---------- */
function loadScript(src) { return new Promise((ok, ko) => { if ($(`script[src="${src}"]`)) return ok(); const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => ko(new Error('impossibile caricare ' + src)); document.head.appendChild(s); }); }
async function loadXLSX() { if (!window.XLSX) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'); }
async function loadPDF() {
  if (!window.jspdf) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  if (!window.jspdf.jsPDF.API.autoTable) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');
}

/* ---------- UI: toast, modali, conferme ---------- */
function toast(msg, type = 'ok', ms = 3200) {
  let w = $('.toast-wrap'); if (!w) { w = document.createElement('div'); w.className = 'toast-wrap'; document.body.appendChild(w); }
  const ic = {ok:'fa-check-circle', err:'fa-exclamation-circle', warn:'fa-exclamation-triangle', info:'fa-info-circle'}[type] || 'fa-info-circle';
  const t = document.createElement('div'); t.className = 'toast-x ' + type; t.innerHTML = `<i class="fas ${ic}"></i><div>${msg}</div>`;
  w.appendChild(t); setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, ms);
}
function openModal({title = '', color = 'blue', size = '', body = '', footer = '', scroll = true, staticBd = false, onClose = null, id = null}) {
  if (id) { const ex = document.getElementById(id); if (ex) { const i = bootstrap.Modal.getInstance(ex); if (i) i.hide(); ex.remove(); } }
  const el = document.createElement('div');
  el.className = 'modal fade'; el.tabIndex = -1; if (id) el.id = id;
  el.innerHTML = `<div class="modal-dialog ${size} ${scroll ? 'modal-dialog-scrollable' : ''}"><div class="modal-content">
    <div class="modal-header mh-${color}"><h5 class="modal-title">${title}</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">${body}</div>${footer ? `<div class="modal-footer">${footer}</div>` : ''}</div></div>`;
  document.body.appendChild(el);
  const bs = new bootstrap.Modal(el, {focus:false, backdrop:staticBd ? 'static' : true});
  el.addEventListener('hidden.bs.modal', () => { onClose && onClose(); bs.dispose(); el.remove(); if ($$('.modal.show').length) document.body.classList.add('modal-open'); });
  el.addEventListener('shown.bs.modal', () => { const f = $('input:not([type=hidden]):not([type=checkbox]):not([readonly]),textarea,select', $('.modal-body', el)); if (f && f.dataset.nofocus === undefined && window.innerWidth > 768) f.focus(); else el.focus(); });
  bs.show();
  return {el, bs, close: () => bs.hide(), body: $('.modal-body', el), setBody: h => { $('.modal-body', el).innerHTML = h; }};
}
document.addEventListener('show.bs.modal', e => {
  const z = 1055 + 10 * $$('.modal.show').length; e.target.style.zIndex = z;
  setTimeout(() => $$('.modal-backdrop:not(.stk)').forEach(b => { b.style.zIndex = z - 1; b.classList.add('stk'); }), 0);
});
function confirmDlg(msg, {ok = 'Conferma', danger = false, title = 'Conferma'} = {}) {
  return new Promise(res => {
    let r = false;
    const m = openModal({title, color:danger ? 'red' : 'blue', size:'modal-dialog-centered', scroll:false, body:`<div style="white-space:pre-line">${msg}</div>`,
      footer:`<button class="btn btn-light" data-bs-dismiss="modal">Annulla</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'} fw-bold" id="cf-ok">${ok}</button>`,
      onClose: () => res(r)});
    $('#cf-ok', m.el).onclick = () => { r = true; m.close(); };
  });
}

/* ---------- ADMIN: sessione protetta da password ---------- */
const Admin = {
  isOn() { try { return +sessionStorage.getItem('admin118_until') > Date.now(); } catch (e) { return false; } },
  touch() { try { if (this.isOn()) sessionStorage.setItem('admin118_until', Date.now() + SET().sessioneAdminMin * 60000); } catch (e) {} },
  check(p) { return pwHash(p) === SET().passwordHash; },
  login(p) {
    if (!this.check(p)) { logA('Admin', 'Tentativo di accesso con password errata'); return false; }
    try { sessionStorage.setItem('admin118_until', Date.now() + SET().sessioneAdminMin * 60000); } catch (e) {}
    logA('Admin', 'Accesso all\'area amministrazione'); App.renderHeader(); return true;
  },
  logout() { try { sessionStorage.removeItem('admin118_until'); } catch (e) {} logA('Admin', 'Uscita dall\'area amministrazione'); App.renderHeader(); App.refresh(); },
  require(reason = 'Operazione protetta') {
    return new Promise(res => {
      if (this.isOn()) { this.touch(); return res(true); }
      let ok = false;
      const m = openModal({title:'<i class="fas fa-lock me-2"></i>' + esc(reason), color:'amber', size:'modal-sm modal-dialog-centered', scroll:false,
        body:`<p class="small text-muted mb-2 text-center">Inserisci la password di amministrazione</p><input type="password" class="form-control text-center fw-bold" id="adm-pw" placeholder="Password" autocomplete="current-password">`,
        footer:`<button class="btn btn-dark w-100 fw-bold" id="adm-ok">Conferma</button>`, onClose: () => res(ok)});
      const go = () => { if (this.login($('#adm-pw', m.el).value)) { ok = true; m.close(); } else { toast('Password errata', 'err'); $('#adm-pw', m.el).select(); } };
      $('#adm-ok', m.el).onclick = go; $('#adm-pw', m.el).onkeydown = e => { if (e.key === 'Enter') go(); };
    });
  }
};

/* ---------- componenti: scelte rapide (operatori / officine) ---------- */
function quickPick(kind, inputId) {
  const {base, rec} = kind === 'op' ? opChoices() : offChoices();
  const me = currentOp();
  let list = base.slice();
  if (kind === 'op' && me && !list.some(n => normKey(n) === normKey(me))) list.unshift(me);
  const chip = (n, extra = '') => `<button type="button" class="chip ${extra}" data-qp="${escA(inputId)}" data-v="${escA(n)}">${kind === 'op' && normKey(n) === normKey(me) ? '<i class="fas fa-user"></i>' : ''}${esc(n)}</button>`;
  return `<div class="chips mt-1 qp-wrap">${list.map(n => chip(n)).join('')}${rec.map(n => chip(n, 'text-muted')).join('')}</div>`;
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-qp]'); if (!b) return;
  const inp = document.getElementById(b.dataset.qp); if (!inp) return;
  inp.value = b.dataset.v; inp.dispatchEvent(new Event('input', {bubbles:true})); inp.dispatchEvent(new Event('change', {bubbles:true}));
  $$(`[data-qp="${b.dataset.qp}"]`).forEach(x => x.classList.toggle('on', x === b));
});
function fieldOp(id, label, val = '', req = false) {
  return `<label class="lbl ${req ? 'req' : ''}" for="${id}">${label}</label><input type="text" class="form-control" id="${id}" value="${escA(val)}" placeholder="Nome operatore" autocomplete="off">${quickPick('op', id)}`;
}
function fieldOff(id, label, val = '', req = false) {
  return `<label class="lbl ${req ? 'req' : ''}" for="${id}">${label}</label><input type="text" class="form-control" id="${id}" value="${escA(val)}" placeholder="Officina" autocomplete="off">${quickPick('off', id)}`;
}
function v(id, root = document) { const e = root.querySelector('#' + id); return e ? (e.type === 'checkbox' ? e.checked : e.value.trim()) : ''; }

/* ---------- download file ---------- */
function downloadBlob(content, name, type) {
  const b = content instanceof Blob ? content : new Blob([content], {type});
  const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
async function exportExcel(sheets, name) {
  try {
    await loadXLSX();
    const wb = XLSX.utils.book_new();
    sheets.forEach(s => { const ws = XLSX.utils.aoa_to_sheet([s.head, ...s.rows]); ws['!cols'] = s.head.map((h, i) => ({wch:Math.min(60, Math.max(10, ...[h, ...s.rows.map(r => r[i])].map(x => String(x ?? '').length).slice(0, 200)))})); XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31)); });
    XLSX.writeFile(wb, name);
  } catch (e) {   // ripiego CSV
    const s = sheets[0]; const csv = [s.head, ...s.rows].map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
    downloadBlob('﻿' + csv, name.replace(/\.xlsx$/, '.csv'), 'text/csv'); toast('Excel non disponibile: esportato CSV', 'warn');
  }
}
