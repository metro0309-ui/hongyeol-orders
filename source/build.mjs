import fs from 'node:fs';
const pw=fs.readFileSync('password-ui.js','utf8');
const page=fs.readFileSync('page.html','utf8').replace('</body>',()=>'<script>'+pw+'\n'+fs.readFileSync('client.js','utf8')+'</script></body>');
const editor=fs.readFileSync('editor.html','utf8').replace('<!--STYLE-->',()=>page.match(/<style>[\s\S]*?<\/style>/)[0]).replace('<script>',()=>'<script>'+pw+'\n').replace('/*GROUPS*/',()=>page.match(/const groups = (\{[\s\S]*?\n\});/)[1]);
fs.mkdirSync('dist/server',{recursive:true});
fs.writeFileSync('dist/server/index.js','const EDITOR='+JSON.stringify(editor)+';\nconst PAGE='+JSON.stringify(page)+';\n'+fs.readFileSync('worker.mjs','utf8'));
