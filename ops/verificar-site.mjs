// Monitor do site no ar (GitHub Actions, todo dia): abre https://jaarvis.com.br/, baixa cada script e folha de estilo
// carimbados (?v=) e confere que respondem 200 e que os scripts são JavaScript válido. Também confere que as funções
// do servidor respondem. Uso: node ops/verificar-site.mjs [endereço]   (sai com erro se algo falhar)
import { writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const BASE = (process.argv[2] || 'https://jaarvis.com.br/').replace(/\/?$/, '/');
const FUNCOES = 'https://olxapwaxmzqclitlylzv.supabase.co/functions/v1/';
const falhas = [];
const html = await (await fetch(BASE)).text();
const arquivos = [...html.matchAll(/(?:src|href)="([^"]+\?v=[^"]+)"/g)].map((m) => m[1]);
if (arquivos.length < 50) falhas.push(`a página trouxe só ${arquivos.length} arquivos carimbados`);
const tmp = mkdtempSync(path.join(tmpdir(), 'site-'));
for (const a of arquivos) {
  const r = await fetch(new URL(a, BASE)).catch((e) => ({ ok: false, status: String(e) }));
  if (!r.ok) { falhas.push(`${a}: ${r.status}`); continue; }
  const txt = await r.text();
  if (a.split('?')[0].endsWith('.js')) {
    const f = path.join(tmp, path.basename(a.split('?')[0]));
    writeFileSync(f, txt);
    try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); } catch (e) { falhas.push(`${a}: JavaScript inválido ${String(e.stderr).slice(0, 200)}`); }
  }
}
for (const fn of ['integrations', 'gnre', 'portal']) {
  const r = await fetch(FUNCOES + fn, { method: 'OPTIONS' }).catch((e) => ({ ok: false, status: String(e) }));
  if (!r.ok) falhas.push(`função ${fn}: ${r.status}`);
}
console.log(`${arquivos.length} arquivos do site e 3 funções conferidos.`);
if (falhas.length) { console.error('Falhas:\n' + falhas.join('\n')); process.exit(1); }
console.log('Site no ar: tudo certo.');
