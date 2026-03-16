const fs = require('fs');
const file = '/app/dist/index.html';
const csp = '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\' \'unsafe-inline\' \'unsafe-eval\' https://cdn.tailwindcss.com https://aistudiocdn.com; style-src \'self\' \'unsafe-inline\' https://cdn.tailwindcss.com; connect-src \'self\' https://brasilapi.com.br https://publica.cnpj.ws https://generativelanguage.googleapis.com https://*.googleapis.com https://*.firebaseio.com https://*.firebase.com https://identitytoolkit.googleapis.com https://aistudiocdn.com https://www.gstatic.com; img-src \'self\' data: https:; font-src \'self\' data: https:;">';
let html = fs.readFileSync(file, 'utf8');
html = html.replace('<meta charset="UTF-8" />', '<meta charset="UTF-8" />' + csp);
fs.writeFileSync(file, html);
console.log('CSP injetado com sucesso!');
