// Alertas no celular (Web Push). A cada ~15 minutos o servidor olha o que mudou e avisa quem ativou os alertas:
// NF-e rejeitada, reclamação/mediação com prazo curto, produto que entrou em ruptura, contas que vencem hoje (uma vez
// por dia, de manhã), pagamentos aguardando aprovação (só para o dono), tarifa de canal que mudou e produto que vai
// faltar antes da reposição chegar (uma vez por dia). O estado fica em settings.alertas do Bling.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { metasDoMes } from "./metas.ts";
import { janelas, mudancasTarifa, type PedidoTarifa } from "./tarifas.ts";
import { emAberto, rupturasPrevistas } from "./ruptura.ts";

type Alerta = { titulo: string; corpo: string; url: string; so_dono?: boolean; tag: string };
let pronto = false;
function configurar() {
  if (pronto) return true;
  const pub = Deno.env.get("VAPID_PUBLIC_KEY"), priv = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!pub || !priv) return false;
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") || "mailto:suporte@jaarvis.com.br", pub, priv);
  return (pronto = true);
}
const pctBR = (v: number) => (v * 100).toFixed(1).replace(".", ",") + "%";
async function tudo<T>(consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const out: T[] = [];
  for (let de = 0; de < 50_000; de += 1000) {
    const { data, error } = await consulta(de, de + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export async function enviarPush(db: SupabaseClient, ws: string, alertas: Alerta[]) {
  if (!alertas.length || !configurar()) return { enviados: 0 };
  const { data: subs } = await db.from("push_subs").select("endpoint,chaves,user_id").eq("workspace_id", ws);
  if (!subs?.length) return { enviados: 0 };
  const { data: donos } = await db.from("workspace_members").select("user_id").eq("workspace_id", ws).eq("role", "owner");
  const dono = new Set((donos ?? []).map((d) => d.user_id));
  let enviados = 0;
  for (const s of subs) for (const a of alertas) {
    if (a.so_dono && !dono.has(s.user_id)) continue;
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: s.chaves }, JSON.stringify({ titulo: a.titulo, corpo: a.corpo, url: a.url, tag: a.tag }), { TTL: 3600 }); enviados++; }
    catch (e) { const st = (e as any)?.statusCode; if (st === 404 || st === 410) await db.from("push_subs").delete().eq("endpoint", s.endpoint); }
  }
  return { enviados };
}

/** Compara com o último estado e devolve só o que é novo. */
export async function verificarAlertas(db: SupabaseClient, ws: string, estado: any) {
  const agora = new Date(), desde = estado?.em ?? new Date(Date.now() - 20 * 60_000).toISOString(), out: Alerta[] = [];
  const hojeBR = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10), horaBR = new Date(Date.now() - 3 * 3600_000).getUTCHours();
  // NF-e rejeitada.
  const { data: nfs } = await db.from("notas_fiscais").select("pedido,mensagem,status,updated_at").eq("workspace_id", ws).in("status", ["erro", "erro_autorizacao", "denegado"]).gt("updated_at", desde).limit(5);
  for (const n of nfs ?? []) out.push({ titulo: "NF-e rejeitada", corpo: `${n.pedido}: ${String(n.mensagem ?? "").slice(0, 120)}`, url: "#nfnotas", tag: "nfe" });
  // Reclamação ou mediação com prazo nas próximas 24 h, que chegou desde a última olhada.
  const lim = new Date(Date.now() + 24 * 3600_000).toISOString();
  const { data: at } = await db.from("atendimentos").select("id,canal,tipo,motivo,prazo,aberto_em,status").eq("workspace_id", ws).is("fechado_em", null).lte("prazo", lim).gt("atualizado_em", desde).limit(5);
  for (const a of at ?? []) if (/reclam|media/i.test(`${a.tipo}`)) out.push({ titulo: "Reclamação urgente", corpo: `${a.canal}: ${a.motivo ?? a.tipo} · responda antes de ${new Date(a.prazo).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`, url: "#atendimento", tag: "atend-" + a.id });
  // Produtos que entraram em ruptura desde a última olhada.
  const { data: zer } = await db.from("produtos").select("id,nome").eq("workspace_id", ws).lte("saldo", 0).or("ignorar.is.null,ignorar.eq.false").limit(500);
  const antes = new Set<string>(estado?.rupturas ?? []), agoraZ = (zer ?? []).map((p) => p.id), novos = (zer ?? []).filter((p) => !antes.has(p.id));
  if (estado?.rupturas && novos.length) out.push({ titulo: `${novos.length} produto(s) sem estoque`, corpo: novos.slice(0, 3).map((p) => p.nome).join(" · "), url: "#estoque", tag: "ruptura" });
  // Contas que vencem hoje: um aviso por dia, depois das 8 h.
  if (horaBR >= 8 && estado?.vencimentos !== hojeBR) {
    const { data: pg } = await db.from("payables").select("valor,valor_pago").eq("workspace_id", ws).eq("vencimento", hojeBR).in("status", ["aberto", "parcial"]);
    if (pg?.length) out.push({ titulo: `Hoje vencem ${pg.length} conta(s)`, corpo: brl(pg.reduce((s, p) => s + Number(p.valor) - Number(p.valor_pago || 0), 0)), url: "#pagar", tag: "venc" });
  }
  // Contas que vencem amanhã e repasses atrasados: um resumo por dia, depois das 8 h.
  if (horaBR >= 8 && estado?.diario !== hojeBR) {
    const amanha = new Date(Date.parse(hojeBR + "T12:00:00Z") + 864e5).toISOString().slice(0, 10);
    const { data: pa } = await db.from("payables").select("valor,valor_pago").eq("workspace_id", ws).eq("vencimento", amanha).in("status", ["aberto", "parcial"]);
    if (pa?.length) out.push({ titulo: `Amanhã vencem ${pa.length} conta(s)`, corpo: brl(pa.reduce((s, p) => s + Number(p.valor) - Number(p.valor_pago || 0), 0)), url: "#pagar", tag: "venc_amanha" });
    const limite = new Date(Date.parse(hojeBR + "T12:00:00Z") - 3 * 864e5).toISOString().slice(0, 10);
    const { data: atr } = await db.from("v_pedidos").select("saldo").eq("workspace_id", ws).eq("status", "A receber").lt("previsao", limite).gt("saldo", 0.01).limit(5000);
    if (atr?.length) out.push({ titulo: `${atr.length} repasse(s) atrasado(s)`, corpo: `${brl(atr.reduce((s, p) => s + Number(p.saldo), 0))} com a previsão de liberação vencida há mais de 3 dias`, url: "#pending", tag: "repasse" });
  }
  // Repasse abaixo do previsto: pedido que passou a "Divergência" (recebeu menos que o líquido) desde a última olhada.
  const { data: dv } = await db.from("v_pedidos").select("pedido,plataforma,saldo").eq("workspace_id", ws).eq("status", "Divergência").gt("saldo", 0.5).limit(500);
  const antesD = new Set<string>(estado?.divergentes ?? []), novosD = (dv ?? []).filter((p) => !antesD.has(p.pedido));
  if (estado?.divergentes && novosD.length) out.push({ titulo: novosD.length > 1 ? `${novosD.length} repasses abaixo do previsto` : "Repasse abaixo do previsto", corpo: novosD.slice(0, 3).map((p) => `${p.plataforma} ${p.pedido}: faltam ${brl(Number(p.saldo))}`).join(" · "), url: "#reconcile", tag: "repasse" });
  // Metas do mês fora do ritmo (vendas e recebido abaixo de 90% do esperado até hoje): um aviso por dia, depois das 9 h.
  if (horaBR >= 9 && estado?.metas !== hojeBR) {
    const { lista } = await metasDoMes(db, ws).catch(() => ({ lista: [] as Awaited<ReturnType<typeof metasDoMes>>["lista"] }));
    const ab = lista.filter((a) => a.status === "abaixo"), nome = (i: string) => (i === "vendas" ? "vendas" : "recebido");
    if (ab.length) out.push({
      titulo: ab.length > 1 ? `${ab.length} metas do mês abaixo do ritmo` : `Meta de ${nome(ab[0].ind)} abaixo do ritmo`,
      corpo: ab.slice(0, 3).map((a) => a.ind === "vendas" && a.proj != null ? `${a.canal || "Empresa toda"} · vendas: projeção de ${brl(a.proj)} para meta de ${brl(a.meta)} (${Math.round((a.ritmo ?? 0) * 100)}%)` : `${a.canal || "Empresa toda"} · ${nome(a.ind)}: ${brl(a.real ?? 0)} de ${brl(a.esperado ?? 0)} esperados até hoje (${Math.round((a.ritmo ?? 0) * 100)}%)`).join(" · "),
      url: "#metas", tag: "metas",
    });
  }
  // Tarifa de canal que mudou e produtos que vão faltar antes da reposição chegar: uma olhada por dia, depois das 9 h.
  // Tarifa: o mesmo canal só volta a avisar depois de 7 dias. Ruptura prevista: só os produtos que entraram na lista.
  let tarifas: Record<string, string> = estado?.tarifas ?? {}, previstas: string[] | null = estado?.previstas ?? null;
  if (horaBR >= 9 && estado?.vendas_dia !== hojeBR) {
    const desde60 = new Date(Date.parse(hojeBR + "T12:00:00Z") - 60 * 864e5).toISOString().slice(0, 10);
    const ped = await tudo<PedidoTarifa>((a, b) => db.from("orders").select("platform,date,gross,fee,items").eq("workspace_id", ws).gte("date", desde60).lt("date", hojeBR).order("date").range(a, b)).catch(() => [] as PedidoTarifa[]);
    const j = janelas(hojeBR), sete = new Date(Date.parse(hojeBR + "T12:00:00Z") - 7 * 864e5).toISOString().slice(0, 10);
    const mud = mudancasTarifa(ped.filter((p) => p.date >= j.baseIni), hojeBR).filter((m) => !tarifas[m.canal] || tarifas[m.canal] <= sete);
    for (const m of mud) {
      tarifas = { ...tarifas, [m.canal]: hojeBR };
      const sobe = m.delta > 0, prods = m.produtos.slice(0, 2).map((p) => `${p.nome.slice(0, 40)} (${pctBR(p.base)} → ${pctBR(p.recente)})`).join(" · ");
      out.push({
        titulo: `Tarifa ${sobe ? "subiu" : "caiu"} no ${m.canal}: ${pctBR(m.base)} → ${pctBR(m.recente)}`,
        corpo: sobe
          ? `Na última semana. No ritmo atual, ${brl(-m.impactoMes)} a menos de margem por mês. Para manter o mesmo líquido, os preços do canal precisam subir cerca de ${pctBR(m.reajuste)}.${prods ? " Mais afetados: " + prods : ""}`
          : `Na última semana. No ritmo atual, ${brl(m.impactoMes)} a mais de margem por mês.${prods ? " Produtos: " + prods : ""}`,
        url: "#raiox", tag: "tarifa",
      });
    }
    const [{ data: prods }, { data: pcs }] = await Promise.all([
      db.from("produtos").select("id,nome,saldo,prazo_reposicao,fornecedor,ignorar,formato").eq("workspace_id", ws).gt("saldo", 0).limit(5000),
      db.from("pedidos_compra").select("status,itens").eq("workspace_id", ws).in("status", ["enviado", "parcial"]).limit(500),
    ]);
    const vendas = new Map<string, { q30: number; q60: number; preco: number; r: number }>(), d30 = new Date(Date.parse(hojeBR + "T12:00:00Z") - 30 * 864e5).toISOString().slice(0, 10);
    for (const p of ped) for (const it of p.items ?? []) {
      const sku = String(it.sku ?? "").trim(); if (!sku) continue;
      const v = vendas.get(sku) ?? { q30: 0, q60: 0, preco: 0, r: 0 }, q = Number(it.qty) || 0;
      v.q60 += q; if (p.date >= d30) v.q30 += q; v.r += q * (Number(it.price) || 0); v.preco = v.q60 ? v.r / v.q60 : 0;
      vendas.set(sku, v);
    }
    const lista = rupturasPrevistas((prods ?? []).filter((p) => p.formato !== "V"), vendas, emAberto(pcs ?? []), hojeBR);
    const antesP = new Set(previstas ?? []), novasP = lista.filter((x) => !antesP.has(x.sku));
    if (novasP.length) out.push({
      titulo: novasP.length > 1 ? `${novasP.length} produtos vão faltar antes da reposição` : `${novasP[0].nome.slice(0, 50)} vai faltar antes da reposição`,
      corpo: novasP.slice(0, 3).map((x) => `${x.nome.slice(0, 40)}: zera por volta de ${x.zeraEm.slice(8, 10)}/${x.zeraEm.slice(5, 7)} (${Math.floor(x.dias)} dias de estoque, reposição em ${x.prazo})`).join(" · ") + (novasP.length > 3 ? ` · e mais ${novasP.length - 3}` : "") + ". Veja a Sugestão de compras.",
      url: "#estcompras", tag: "ruptura_prevista",
    });
    previstas = lista.map((x) => x.sku);
  }
  // Erro NOVO no sistema (Central de erros): um aviso com os primeiros, só para o dono.
  const { data: er } = await db.from("erros_sistema").select("mensagem,origem,pagina").eq("workspace_id", ws).is("resolvido_em", null).gt("primeiro_em", desde).limit(5);
  if (er?.length) out.push({ titulo: er.length > 1 ? `${er.length} erros novos no sistema` : "Erro novo no sistema", corpo: er.slice(0, 2).map((e) => `${e.origem === "servidor" ? "Servidor" : "Tela " + (e.pagina || "")}: ${String(e.mensagem).slice(0, 90)}`).join(" · "), url: "#erros", tag: "erros", so_dono: true });
  // Pagamentos aguardando aprovação lançados desde a última olhada (só o dono recebe).
  const { data: ap } = await db.from("payables").select("fornecedor,valor").eq("workspace_id", ws).eq("aprovacao", "pendente").gt("created_at", desde).limit(20);
  if (ap?.length) out.push({ titulo: `${ap.length} pagamento(s) para aprovar`, corpo: ap.slice(0, 3).map((p) => `${p.fornecedor ?? ""} ${brl(Number(p.valor))}`).join(" · "), url: "#pagar", tag: "aprov", so_dono: true });
  return { alertas: out, estado: { em: agora.toISOString(), metas: horaBR >= 9 ? hojeBR : estado?.metas ?? null, rupturas: agoraZ, vencimentos: horaBR >= 8 ? hojeBR : estado?.vencimentos ?? null, diario: horaBR >= 8 ? hojeBR : estado?.diario ?? null, divergentes: (dv ?? []).map((p) => p.pedido), tarifas, previstas, vendas_dia: horaBR >= 9 ? hojeBR : estado?.vendas_dia ?? null } };
}

/** Tipo do alerta para os destinos de e-mail/WhatsApp (o mesmo nome escolhido na tela de Alertas e relatórios). */
export const tipoDoAlerta = (tag: string) => (tag.startsWith("atend") ? "atendimento" : tag);
