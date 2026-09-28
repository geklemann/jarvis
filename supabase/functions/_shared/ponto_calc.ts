// Banco de horas (mesma regra do portal, web/ponto.js). Minutos inteiros.
// Dia previsto (dias_semana) sem registro = −jornada; trabalho = soma dos pares entrada/saída − jornada prevista;
// fora dos dias previstos, horas marcadas = crédito simples; folga/feriado/desconsiderado/atestado/férias = 0;
// falta/compensação = −jornada no dia previsto. Par incompleto não soma (fica "a conferir"). Hoje incompleto não conta.
export type Colab = { jornada_min: number; dias_semana: number[]; saldo_inicial: number; inicio: string | null };
export type Dia = { data: string; marcacoes: string[]; tipo: string; conferido: boolean };
export type Ajuste = { competencia: string; minutos: number };

const min = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
export function trabalhado(m: string[]): number | null {
  let t = 0;
  for (let i = 0; i < 6; i += 2) {
    const a = m[i] || "", b = m[i + 1] || "";
    if (!!a !== !!b) return null;
    if (a) { const n = min(b) - min(a); if (n <= 0) return null; t += n; }
  }
  return t || null;
}
export function resumoMes(c: Colab, dias: Dia[], ajustes: Ajuste[], mes: string, hoje: string) {
  const [y, m] = mes.split("-").map(Number), n = new Date(Date.UTC(y, m, 0)).getUTCDate(), porData = new Map(dias.map((d) => [d.data, d]));
  let creditos = 0, debitos = 0, pendentes = 0;
  for (let d = 1; d <= n; d++) {
    const data = `${mes}-${String(d).padStart(2, "0")}`;
    if (data > hoje || (c.inicio && data < c.inicio)) continue;
    const previsto = c.dias_semana.includes(new Date(`${data}T12:00:00Z`).getUTCDay()), r = porData.get(data);
    let delta: number | null;
    if (!r) { if (data === hoje) continue; delta = previsto ? -c.jornada_min : 0; if (previsto) pendentes++; }
    else if (["folga", "feriado", "desconsiderado", "atestado", "ferias"].includes(r.tipo)) delta = 0;
    else if (["falta", "compensacao"].includes(r.tipo)) delta = previsto ? -c.jornada_min : 0;
    else { const w = trabalhado(r.marcacoes || []); if (w === null && data === hoje) continue; delta = w === null ? null : w - (previsto ? c.jornada_min : 0); }
    if (r && !r.conferido) pendentes++;
    if (delta === null) continue;
    if (delta > 0) creditos += delta; else debitos += delta;
  }
  for (const a of ajustes.filter((x) => x.competencia === mes)) { if (a.minutos > 0) creditos += a.minutos; else debitos += a.minutos; }
  return { creditos, debitos, saldo: creditos + debitos, pendentes };
}
export function meses(de: string, ate: string) { const out: string[] = []; let [y, m] = de.split("-").map(Number); for (;;) { const v = `${y}-${String(m).padStart(2, "0")}`; if (v > ate) break; out.push(v); m++; if (m > 12) { m = 1; y++; } } return out; }
export function acumulado(c: Colab, dias: Dia[], ajustes: Ajuste[], ate: string, hoje: string) {
  const prim = [c.inicio?.slice(0, 7), ...dias.map((d) => d.data.slice(0, 7))].filter(Boolean).sort()[0] as string | undefined;
  let s = c.saldo_inicial || 0; if (!prim) return s;
  for (const mes of meses(prim, ate)) s += resumoMes(c, dias, ajustes, mes, hoje).saldo;
  return s;
}
