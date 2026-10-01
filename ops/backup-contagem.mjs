// Conferência do backup do banco (usado pelo .github/workflows/backup.yml).
//   contar  <data.sql>                 → JSON {tabela: linhas} a partir dos blocos COPY do dump
//   sql     <contagem.json>            → consulta que conta as mesmas tabelas num banco restaurado
//   conferir <contagem.json> <saida.tsv> → compara; sai com erro se alguma tabela não bate
import fs from 'node:fs';

const [modo, a, b] = process.argv.slice(2);

if (modo === 'contar') {
  const contagem = {};
  let atual = null;
  for (const linha of fs.readFileSync(a, 'utf8').split('\n')) {
    if (atual) {
      if (linha === '\\.') atual = null;
      else contagem[atual]++;
      continue;
    }
    const m = /^COPY ((?:"[^"]+"|\w+)\.(?:"[^"]+"|\w+)) /.exec(linha);
    if (m) { atual = m[1]; contagem[atual] = 0; }
  }
  process.stdout.write(JSON.stringify(contagem, null, 1) + '\n');
} else if (modo === 'sql') {
  const tabelas = Object.keys(JSON.parse(fs.readFileSync(a, 'utf8')));
  const partes = tabelas.map(t => `select '${t.replace(/'/g, "''")}' as tabela, count(*) as linhas from ${t}`);
  process.stdout.write((partes.join('\nunion all\n') || "select 'nenhuma', 0") + ';\n');
} else if (modo === 'conferir') {
  const esperado = JSON.parse(fs.readFileSync(a, 'utf8'));
  const obtido = Object.fromEntries(fs.readFileSync(b, 'utf8').trim().split('\n').filter(Boolean).map(l => { const [t, n] = l.split('\t'); return [t, Number(n)]; }));
  const erros = Object.entries(esperado).filter(([t, n]) => obtido[t] !== n).map(([t, n]) => `${t}: backup ${n}, restaurado ${obtido[t] ?? 'ausente'}`);
  const total = Object.values(esperado).reduce((s, n) => s + n, 0);
  if (erros.length) { console.error('Restauração não confere:\n' + erros.join('\n')); process.exit(1); }
  console.log(`Restauração conferida: ${Object.keys(esperado).length} tabelas, ${total} linhas, tudo igual ao backup.`);
} else {
  console.error('uso: backup-contagem.mjs contar|sql|conferir ...');
  process.exit(2);
}
