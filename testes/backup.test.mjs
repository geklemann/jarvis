// Conferência do backup (ops/backup-contagem.mjs): conta as linhas do dump e compara com o banco restaurado.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const script = new URL('../ops/backup-contagem.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-backup-'));
const arq = (nome, conteudo) => { const p = path.join(tmp, nome); fs.writeFileSync(p, conteudo); return p; };

const dump = [
  'SET statement_timeout = 0;',
  'COPY "public"."pedidos" ("id", "valor") FROM stdin;',
  '1\t10.00', '2\t20.50', '3\t\\N',
  '\\.',
  'COPY "auth"."users" ("id") FROM stdin;',
  'a',
  '\\.',
  'COPY "public"."vazia" ("id") FROM stdin;',
  '\\.',
].join('\n');

test('conta as linhas de cada tabela nos blocos COPY do dump', () => {
  const c = JSON.parse(execFileSync(process.execPath, [script, 'contar', arq('data.sql', dump)], { encoding: 'utf8' }));
  assert.deepEqual(c, { '"public"."pedidos"': 3, '"auth"."users"': 1, '"public"."vazia"': 0 });
});

test('gera a consulta de contagem para o banco restaurado', () => {
  const sql = execFileSync(process.execPath, [script, 'sql', arq('c.json', JSON.stringify({ '"public"."pedidos"': 3 }))], { encoding: 'utf8' });
  assert.equal(sql.trim(), `select '"public"."pedidos"' as tabela, count(*) as linhas from "public"."pedidos";`);
});

test('confere: igual passa; diferença ou tabela ausente falha', () => {
  const esperado = arq('e.json', JSON.stringify({ '"public"."pedidos"': 3, '"auth"."users"': 1 }));
  const ok = spawnSync(process.execPath, [script, 'conferir', esperado, arq('ok.tsv', '"public"."pedidos"\t3\n"auth"."users"\t1\n')], { encoding: 'utf8' });
  assert.equal(ok.status, 0); assert.match(ok.stdout, /2 tabelas, 4 linhas/);
  const ruim = spawnSync(process.execPath, [script, 'conferir', esperado, arq('ruim.tsv', '"public"."pedidos"\t2\n')], { encoding: 'utf8' });
  assert.equal(ruim.status, 1); assert.match(ruim.stderr, /pedidos": backup 3, restaurado 2/); assert.match(ruim.stderr, /users": backup 1, restaurado ausente/);
});
