// Unisce i sorgenti in un unico file HTML.  uso: node build.js <output.html> [test|prod]
const fs = require('fs'), path = require('path');
const dir = __dirname;
const out = process.argv[2] || path.join(dir, 'out.html');
const mode = process.argv[3] || 'test';
const r = f => fs.readFileSync(path.join(dir, f), 'utf8');
const js = ['core.js', 'email.js', 'workflow.js', 'manut.js', 'storico.js', 'lavcal.js', 'admin.js', 'dash.js', 'app.js'].map(f => `/* ===== ${f} ===== */\n` + r(f)).join('\n')
  .replace('__TEST_MODE__', mode === 'test' ? 'true' : 'false');
let html = r('shell.html').replace('/*__CSS__*/', () => r('app.css')).replace('/*__JS__*/', () => js);
fs.writeFileSync(out, html);
console.log('OK', out, (html.length / 1024).toFixed(0) + ' KB', 'mode=' + mode);
