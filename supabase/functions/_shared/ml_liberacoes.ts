// Liberações do Mercado Pago que acontecem DEPOIS da janela de sincronização de pedidos (≈30 dias após a venda).
// A sincronização de pedidos só olha os últimos 7 dias; aqui revisitamos os pedidos com repasse "a liberar" cuja
// previsão já passou, consultamos cada pagamento e gravamos o repasse liberado. Nunca sobrescreve repasse existente
// (e, portanto, nunca desfaz vínculo feito por pessoa): upsert com ignoreDuplicates.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { validSecret } from "./store.ts";

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const round = (v: number) => Math.round(v * 100) / 100;
const day = (v: unknown) => (typeof v === "string" && v.length >= 10 ? v.slice(0, 10) : null);

export async function liberacoesML(db: SupabaseClient, ws: string, ate: number, limite = 120) {
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10); // data em Brasília
  const sec = await validSecret(db, ws, "mercadolivre");
  const { data: pedidos, error } = await db.rpc("ml_a_liberar", { ws, ate: hoje, lim: limite });
  if (error) throw error;
  const alvo = (pedidos ?? []) as any[];
  let consultados = 0, liberados = 0, estornados = 0, valor = 0;
  for (const o of alvo as any[]) {
    if (Date.now() > ate) break;
    const pend: any[] = o.external.mp_a_liberar ?? [], ficam: any[] = [], estornos: any[] = [...(o.external.mp_estornos ?? [])];
    for (const p of pend) {
      if (p.previsao && p.previsao > hoje) { ficam.push(p); continue; }
      const r = await fetch(`https://api.mercadopago.com/v1/payments/${p.pagamento}`, { headers: { Authorization: `Bearer ${sec.access_token}` } });
      consultados++;
      if (!r.ok) { ficam.push(p); continue; }
      const mp: any = await r.json();
      const details = {
        status: mp.status, status_detail: mp.status_detail, liberacao: mp.money_release_status,
        valor_pago: num(mp.transaction_amount), reembolsado: num(mp.transaction_amount_refunded), cupom: num(mp.coupon_amount),
        frete_pago_comprador: num(mp.shipping_amount), liquido: num(mp.transaction_details?.net_received_amount),
        tarifas: (mp.fee_details ?? []).map((f: any) => ({ tipo: f.type, valor: num(f.amount), pagador: f.fee_payer })),
        parcelas: mp.installments, meio: mp.payment_method_id,
      };
      if (mp.status !== "approved") { estornos.push({ pagamento: p.pagamento, ...details }); estornados++; continue; }
      if (mp.money_release_status !== "released") { ficam.push({ ...p, previsao: day(mp.money_release_date) ?? p.previsao, ...details }); continue; }
      const amount = round(num(mp.transaction_details?.net_received_amount));
      const { error: e2 } = await db.from("receipts").upsert({
        workspace_id: ws, id: `MP-${p.pagamento}`, order_id: o.id, platform: "Mercado Livre", account: "Mercado Pago",
        date: day(mp.money_release_date), amount, source: "Mercado Pago API", kind: "liberacao", description: `Pagamento ${p.pagamento}`, details,
      }, { onConflict: "workspace_id,id", ignoreDuplicates: true });
      if (e2) { ficam.push(p); continue; }
      liberados++; valor += amount;
    }
    if (ficam.length !== pend.length || estornos.length !== (o.external.mp_estornos ?? []).length) {
      await db.from("orders").update({ external: { ...o.external, mp_a_liberar: ficam, mp_estornos: estornos } }).eq("workspace_id", ws).eq("id", o.id);
    }
  }
  return { pedidos_revisados: alvo.length, consultados, liberados, estornados, valor: round(valor) };
}
