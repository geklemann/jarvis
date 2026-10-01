// Semana do relatório da diretoria (horário de Brasília). Sem dependências: testado em testes/relatorio.test.mjs.
const dia = (d: Date) => d.toISOString().slice(0, 10);

/** Semana anterior completa (segunda a domingo) em horário de Brasília. */
export function semanaAnterior(agora = new Date()) {
  const br = new Date(agora.getTime() - 3 * 3600_000), dow = br.getUTCDay();
  const seg = new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), br.getUTCDate() - ((dow + 6) % 7) - 7));
  const dom = new Date(seg.getTime() + 6 * 864e5), segAnt = new Date(seg.getTime() - 7 * 864e5), domAnt = new Date(seg.getTime() - 864e5);
  // Número da semana ISO (para enviar uma vez só).
  const t = new Date(seg.getTime() + 3 * 864e5), j = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const n = 1 + Math.round(((t.getTime() - j.getTime()) / 864e5 - 3 + ((j.getUTCDay() + 6) % 7)) / 7);
  return { ini: dia(seg), fim: dia(dom), iniAnt: dia(segAnt), fimAnt: dia(domAnt), hoje: dia(br), chave: `${t.getUTCFullYear()}-S${String(n).padStart(2, "0")}` };
}

