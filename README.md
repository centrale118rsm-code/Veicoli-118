# Veicoli 118 — Piano Manutenzione Veicoli (118 San Marino Soccorso)

Gestionale web per segnalazioni guasti, riparazioni, manutenzione programmata e lavaggi dei mezzi 118.

- `index.html` — l'applicazione (file unico, dati su Firebase `gestionale_118`).
- `sorgenti/` — sorgenti da cui viene generato `index.html` (`node sorgenti/build.js index.html prod`).

Versione 16: area Admin (password), flusso di riparazione a 5 passi, manutenzione programmata con checklist,
tracciabilità di ogni operazione, cestino e backup automatici. Compatibile con i dati della v15.
