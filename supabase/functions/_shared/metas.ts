// Metas do mês no servidor (alerta diário e relatório semanal): a mesma regra da tela Metas do mês (web/metas.js).
// Esperado hoje = meta × fração do mês decorrida (horário de Brasília); ritmo = realizado ÷ esperado.
// No servidor entram vendas e recebido (a margem precisa do custo dos produtos, calculado só na tela). Vendas usam a
// projeção de fechamento da Visão geral (web/vendas.js): realizado + ritmo dos últimos 14 dias por dia da semana.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type Avaliacao = { ind: string; meta: number; real: number | null; esperado?: number; proj?: number | null; ritmo?: number | null; pct?: number | null; status: string };

export const diasDoMes = (m: string) => { const [a, b] = m.split("-").map(Number); return new Date(Date.UTC(a, b, 0)).getUTCDate(); };
const br = (agora: Date) => new Date(agora.getTime() - 3 * 3600_000);
export const mesBR = (agora = new Date()) => br(agora).toISOString().slice(0, 7);

/** Fração do mês já decorrida no horário de Brasília (mês passado = 1, futuro = 0). */
export function fracaoBR(m: string, agora = new Date()) {
  const atual = mesBR(agora);
  if (m < atual) return 1;
  if (m > atual) return 0;
  const d = br(agora);
  return Math.min(1, ((d.getUTCDate() - 1) + (d.getUTCHours() + d.getUTCMinutes() / 60) / 24) / diasDoMes(m));
}

type Venda = { data: string; bruto: number; plataforma: string };
const diaISO = (d: string, n: number) => { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const dow = (d: string) => new Date(d + "T12:00:00Z").getUTCDay();
/** Projeção de fechamento do mês corrente (mesma conta de web/vendas.js): o que falta de cada dia = média do mesmo dia
 *  da semana nos últimos 14 dias; hoje ainda em andamento completa até a média do dia. */
export function projecaoSemana(mes: string, hoje: string, vendas: Venda[]) {
  const doMes = vendas.filter((v) => v.data.startsWith(mes)), real = doMes.reduce((a, v) => a + Number(v.bruto), 0);
  const ini = diaISO(hoje, -14), ult = vendas.filter((v) => v.data >= ini && v.data < hoje);
  const porDow = new Array(7).fill(0), porCanalDow: Record<string, number[]> = {};
  for (const v of ult) { const w = dow(v.data); porDow[w] += Number(v.bruto) / 2; (porCanalDow[v.plataforma] ??= new Array(7).fill(0))[w] += Number(v.bruto) / 2; }
  let falta = 0; const porCanal: Record<string, number> = {}, fim = diasDoMes(mes), corte = Number(hoje.slice(8, 10));
  for (let d = corte + 1; d <= fim; d++) { const w = dow(`${mes}-${String(d).padStart(2, "0")}`); falta += porDow[w]; for (const c in porCanalDow) porCanal[c] = (porCanal[c] ?? 0) + porCanalDow[c][w]; }
  const hojeReal = doMes.filter((v) => v.data === hoje).reduce((a, v) => a + Number(v.bruto), 0); falta += Math.max(0, porDow[dow(hoje)] - hojeReal);
  for (const v of doMes) porCanal[v.plataforma] = (porCanal[v.plataforma] ?? 0) + Number(v.bruto);
  return { real, proj: real + falta, porCanal };
}

/** Mesma regra da tela: ≥100% do esperado no ritmo, ≥90% atenção; com projeção (vendas), projeção ÷ meta nos mesmos
 *  limites; nos 3 primeiros dias não há julgamento. */
export function avaliar({ ind, meta, real, frac, dias = 30, base = null, proj: pj = null }: { ind: string; meta: number; real: number | null; frac: number; dias?: number; base?: number | null; proj?: number | null }): Avaliacao {
  if (ind === "margem") {
    if (!base || real == null) return { ind, meta, real: null, status: "semdados" };
    return { ind, meta, real, status: real >= meta ? "ok" : real >= meta - 2 ? "atencao" : "abaixo", pct: meta ? real / meta : null };
  }
  const r = Number(real) || 0, esperado = meta * frac, porProj = pj != null && frac > 0 && frac < 1;
  const proj = porProj ? pj : frac > 0 ? r / frac : null, ritmo = porProj ? (meta ? pj! / meta : null) : esperado > 0 ? r / esperado : null, pct = meta ? r / meta : null;
  const status = frac === 0 ? "futuro" : frac * dias < 3 && frac < 1 ? "cedo" : (ritmo ?? 0) >= 1 ? "ok" : (ritmo ?? 0) >= 0.9 ? "atencao" : "abaixo";
  return { ind, meta, real: r, esperado, proj, ritmo, pct, status };
}

async function tudo<T>(consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const out: T[] = [];
  for (let de = 0; ; de += 1000) { const { data, error } = await consulta(de, de + 999); if (error) throw error; out.push(...(data ?? [])); if (!data || data.length < 1000) break; }
  return out;
}

/** Metas de vendas e recebido do mês corrente, avaliadas com o realizado até agora. */
export async function metasDoMes(db: SupabaseClient, ws: string, agora = new Date()) {
  const mes = mesBR(agora), dias = diasDoMes(mes), frac = fracaoBR(mes, agora);
  const { data: metas } = await db.from("metas").select("canal,indicador,valor").eq("workspace_id", ws).eq("mes", mes).in("indicador", ["vendas", "recebido"]);
  if (!metas?.length) return { mes, frac, lista: [] as (Avaliacao & { canal: string })[] };
  const ini = `${mes}-01`, fim = `${mes}-${String(dias).padStart(2, "0")}`;
  const hoje = br(agora).toISOString().slice(0, 10), desde = diaISO(hoje, -14) < ini ? diaISO(hoje, -14) : ini;
  const todas = await tudo<Venda>((a, b) => db.from("v_pedidos").select("plataforma,bruto,data").eq("workspace_id", ws).gte("data", desde).lte("data", fim).range(a, b));
  const vendas = todas.filter((v) => v.data >= ini), P = frac > 0 && frac < 1 ? projecaoSemana(mes, hoje, todas) : null;
  const receb = await tudo<{ platform: string; amount: number }>((a, b) => db.from("receipts").select("platform,amount").eq("workspace_id", ws).gte("date", ini).lte("date", fim).gt("amount", 0).range(a, b));
  const real: Record<string, { vendas: number; recebido: number }> = {};
  const R = (c: string) => (real[c] ??= { vendas: 0, recebido: 0 });
  for (const v of vendas) { const g = Number(v.bruto) || 0; R("").vendas += g; R(v.plataforma).vendas += g; }
  for (const r of receb) { const x = Number(r.amount) || 0; R("").recebido += x; R(r.platform || "Outros").recebido += x; }
  const pj = (m: { canal: string | null; indicador: string }) => (m.indicador === "vendas" && P ? (m.canal ? P.porCanal[m.canal] ?? null : P.proj) : null);
  const lista = metas.map((m) => ({ canal: String(m.canal ?? ""), ...avaliar({ ind: m.indicador, meta: Number(m.valor), real: (real[m.canal ?? ""] ?? { vendas: 0, recebido: 0 })[m.indicador as "vendas" | "recebido"], frac, dias, proj: pj(m) }) }))
    .sort((a, b) => (a.canal === b.canal ? 0 : a.canal === "" ? -1 : b.canal === "" ? 1 : a.canal.localeCompare(b.canal)) || b.ind.localeCompare(a.ind));
  return { mes, frac, lista };
}
