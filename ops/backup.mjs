// Backup dos dados do EcomBalance (Supabase) para Documentos\Backups\EcomBalance-AAAA-MM-DD.
//
// O plano gratuito do Supabase não guarda backups. Este script exporta, tabela por tabela, todas
// as linhas do schema public (JSON compactado, .json.gz), mais as definições de funções, views e
// políticas (schema-extra.sql). A estrutura completa das tabelas está nas migrações do git.
//
// Usa o Supabase CLI já logado (`supabase db query --linked`), sem senha do banco.
// Fica de fora: integration_secrets (tokens das plataformas; refaça a conexão ao restaurar) e
// as senhas dos usuários (auth.users vai só com id, e-mail e dados de perfil).
//
// Uso: node ops/backup.mjs [pasta-destino]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const HOME = os.homedir();
const CLI = process.env.SUPABASE_CLI || path.join(HOME, '.tools', 'supabase.exe');
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const PAGE = 2000;
const SKIP = new Set(['integration_secrets']);

const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const destino = process.argv[2] || path.join(HOME, 'Documents', 'Backups', `EcomBalance-${hoje}`);
fs.mkdirSync(destino, { recursive: true });

function sql(query) {
  const out = execFileSync(CLI, ['db', 'query', '--linked', '--output-format', 'json', query], {
    cwd: REPO, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const ini = out.indexOf('{'), fim = out.lastIndexOf('}');
  if (ini < 0) throw new Error('resposta sem JSON: ' + out.slice(0, 200));
  const res = JSON.parse(out.slice(ini, fim + 1));
  if (res.error) throw new Error(JSON.stringify(res.error));
  return res.rows || [];
}
const ident = (s) => '"' + String(s).replace(/"/g, '""') + '"';

const t0 = Date.now();
const tabelas = sql(`select c.relname as t,
    coalesce((select string_agg(quote_ident(a.attname), ',' order by k.ord)
      from pg_index i cross join lateral unnest(i.indkey) with ordinality k(attnum, ord)
      join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
      where i.indrelid = c.oid and i.indisprimary), 'ctid') as pk
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r','p') order by c.relname`);

const resumo = { projeto: 'olxapwaxmzqclitlylzv', data: new Date().toISOString(), tabelas: {}, fora: [...SKIP] };
for (const { t, pk } of tabelas) {
  if (SKIP.has(t)) continue;
  const linhas = [];
  for (let off = 0; ; off += PAGE) {
    const rows = sql(`select row_to_json(x) as r from (select * from public.${ident(t)} order by ${pk} limit ${PAGE} offset ${off}) x`);
    for (const { r } of rows) linhas.push(r);
    if (rows.length < PAGE) break;
  }
  fs.writeFileSync(path.join(destino, `${t}.json.gz`), zlib.gzipSync(JSON.stringify(linhas)));
  resumo.tabelas[t] = linhas.length;
  process.stdout.write(`${t}: ${linhas.length}\n`);
}

const usuarios = sql(`select id, email, created_at, last_sign_in_at, raw_user_meta_data from auth.users order by created_at`);
fs.writeFileSync(path.join(destino, 'auth-users.json.gz'), zlib.gzipSync(JSON.stringify(usuarios)));
resumo.usuarios = usuarios.length;

const extra = [];
for (const { d } of sql(`select pg_get_functiondef(p.oid) as d from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind in ('f','p') order by p.proname`)) extra.push(d + ';');
for (const { v, d } of sql(`select c.relname as v, pg_get_viewdef(c.oid, true) as d from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('v','m') order by c.relname`)) extra.push(`create or replace view public.${ident(v)} as\n${d}`);
for (const p of sql(`select tablename, policyname, cmd, roles::text as roles, qual, with_check from pg_policies where schemaname = 'public' order by tablename, policyname`))
  extra.push(`-- política ${p.policyname} em ${p.tablename} (${p.cmd}, ${p.roles})\n--   using: ${p.qual ?? '—'}\n--   check: ${p.with_check ?? '—'}`);
for (const { j } of sql(`select jobname || ' | ' || schedule || ' | ' || command as j from cron.job order by jobname`)) extra.push('-- cron: ' + j);
fs.writeFileSync(path.join(destino, 'schema-extra.sql'), `-- Funções, views, políticas e jobs do schema public (${resumo.data})\n\n` + extra.join('\n\n') + '\n');

resumo.segundos = Math.round((Date.now() - t0) / 1000);
fs.writeFileSync(path.join(destino, 'LEIA-ME.json'), JSON.stringify(resumo, null, 2));
console.log(`\nBackup em ${destino} (${Object.keys(resumo.tabelas).length} tabelas, ${resumo.segundos}s)`);
