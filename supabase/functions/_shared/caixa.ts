// Caixa projetado dia a dia (próximos 30 dias), para avisar ANTES de o saldo ficar negativo. Mesma ideia do Fluxo de
// caixa › Diário (web/fluxo.js): saldo das contas correntes (aplicações ficam de fora) + repasses a receber na data
// prevista (sem previsão: data do pedido + prazo mediano do canal) + vendas futuras pelo ritmo líquido dos últimos 28
// dias − contas a pagar no vencimento (as vencidas contam hoje). A projeção é pura e testada (testes/caixa.test.mjs).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type Mov = { d: string; v: number };
export type Projecao = { dias: { d: string; entra: number; sai: number; saldo: number }[]; min: number; diaMin: string; negativoEm: string | null };

export const somaDias = (d: string, n: number) => new Date(Date.parse(d + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);

/** futuras: líquido médio por dia e prazo de repasse de cada canal (a venda de hoje entra em hoje + prazo). */
export function projetarCaixa(hoje: string, saldo: number, entradas: Mov[], saidas: Mov[], futuras: { porDia: number; prazo: number }[] = [], dias = 30): Projecao {
  const fim = somaDias(hoje, dias - 1), e = new Map<string, number>(), s = new Map<string, number>();
  const add = (m: Map<string, number>, d: string, v: number) => { const k = d < hoje ? hoje : d; if (k <= fim && v > 0) m.set(k, (m.get(k) ?? 0) + v); };
  for (const x of entradas) add(e, x.d, x.v);
  for (const x of saidas) add(s, x.d, x.v);
  for (const f of futuras) for (let i = 0; i < dias; i++) add(e, somaDias(hoje, i + f.prazo), f.porDia);
  const out: Projecao["dias"] = [];
  let atual = saldo, min = Infinity, diaMin = hoje, negativoEm: string | null = null;
  for (let i = 0; i < dias; i++) {
    const d = somaDias(hoje, i), entra = e.get(d) ?? 0, sai = s.get(d) ?? 0;
    atual += entra - sai;
    out.push({ d, entra: Math.round(entra * 100) / 100, sai: Math.round(sai * 100) / 100, saldo: Math.round(atual * 100) / 100 });
    if (atual < min) { min = atual; diaMin = d; }
    if (atual < 0 && !negativoEm) negativoEm = d;
  }
  return { dias: out, min: Math.round(min * 100) / 100, diaMin, negativoEm };
}

async function tudo<T>(consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const out: T[] = [];
  for (let de = 0; de < 50_000; de += 1000) { const { data, error } = await consulta(de, de + 999); if (error) throw error; out.push(...(data ?? [])); if ((data ?? []).length < 1000) break; }
  return out;
}

/** Lê o banco e projeta. hoje no horário de Brasília. */
export async function projecaoCaixa(db: SupabaseClient, ws: string, hoje: string, dias = 30) {
  const { data: contas } = await db.from("bank_accounts").select("id,saldo_extrato,data_saldo_extrato,tipo,ativo").eq("workspace_id", ws);
  const correntes = (contas ?? []).filter((c) => c.ativo !== false && c.tipo !== "aplicacao" && c.saldo_extrato != null);
  let saldo = 0;
  for (const c of correntes) {
    saldo += Number(c.saldo_extrato);
    // Movimentos do extrato depois do último saldo informado (mesma conta).
    if (c.data_saldo_extrato) {
      const mv = await tudo<{ valor: number }>((a, b) => db.from("bank_transactions").select("valor").eq("workspace_id", ws).eq("conta_id", c.id).gt("data", c.data_saldo_extrato).lte("data", hoje).range(a, b));
      saldo += mv.reduce((x, m) => x + Number(m.valor || 0), 0);
    }
  }
  // Prazo de repasse por canal: mediana (pedido → liberação) dos últimos 90 dias; sem histórico, 15 dias.
  const desde = somaDias(hoje, -90);
  const rec = await tudo<{ date: string; linked_order: string }>((a, b) => db.from("receipts").select("date,linked_order").eq("workspace_id", ws).gte("date", desde).not("linked_order", "is", null).range(a, b));
  const peds = await tudo<{ pedido: string; plataforma: string; data: string; liquido: number; saldo: number; status: string; previsao: string | null }>((a, b) =>
    db.from("v_pedidos").select("pedido,plataforma,data,liquido,saldo,status,previsao").eq("workspace_id", ws).gte("data", somaDias(hoje, -150)).range(a, b));
  const porPedido = new Map(peds.map((p) => [p.pedido, p])), dif = new Map<string, number[]>();
  for (const r of rec) { const p = porPedido.get(r.linked_order); if (!p) continue; const n = Math.round((Date.parse(r.date) - Date.parse(p.data)) / 864e5); if (n >= 0 && n <= 120) (dif.get(p.plataforma) ?? dif.set(p.plataforma, []).get(p.plataforma)!).push(n); }
  const prazo = (pl: string) => { const l = (dif.get(pl) ?? []).sort((a, b) => a - b); return l.length ? l[Math.floor(l.length / 2)] : 15; };
  const entradas: Mov[] = peds.filter((p) => ["A receber", "Em trânsito"].includes(p.status) && Number(p.saldo) > 0.01)
    .map((p) => ({ d: p.previsao || somaDias(p.data, prazo(p.plataforma)), v: Number(p.saldo) }))
    .filter((m) => m.d >= somaDias(hoje, -60));
  const ini28 = somaDias(hoje, -28), liq = new Map<string, number>();
  for (const p of peds) if (p.data >= ini28 && p.data < hoje) liq.set(p.plataforma, (liq.get(p.plataforma) ?? 0) + Number(p.liquido || 0));
  const futuras = [...liq].map(([pl, v]) => ({ porDia: v / 28, prazo: prazo(pl) }));
  const pagar = await tudo<{ vencimento: string; valor: number; valor_pago: number | null; juros: number | null; desconto: number | null }>((a, b) =>
    db.from("payables").select("vencimento,valor,valor_pago,juros,desconto").eq("workspace_id", ws).in("status", ["aberto", "parcial"]).lte("vencimento", somaDias(hoje, dias)).range(a, b));
  const saidas = pagar.map((p) => ({ d: p.vencimento, v: Number(p.valor) + Number(p.juros || 0) - Number(p.desconto || 0) - Number(p.valor_pago || 0) }));
  return { ...projetarCaixa(hoje, saldo, entradas, saidas, futuras, dias), saldo: Math.round(saldo * 100) / 100, temSaldo: correntes.length > 0 };
}
