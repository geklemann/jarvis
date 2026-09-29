// Atendimento pós-venda do Mercado Livre: reclamações/mediações/devoluções (post-purchase), perguntas sem
// resposta e mensagens pós-venda não lidas. Grava em public.atendimentos só as colunas "do marketplace";
// o que a equipe anota (responsável, etapa interna, notas) nunca é sobrescrito.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { HttpError, sleep } from "./common.ts";
import { validSecret } from "./store.ts";

const API = "https://api.mercadolibre.com";
const DIAS_HISTORICO = 45;

type Row = Record<string, unknown>;

function cliente(token: string) {
  const call = async (method: string, path: string, body?: unknown) => {
    await sleep(100);
    const r = await fetch(path.startsWith("http") ? path : API + path, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const txt = await r.text();
    let j: any = null;
    try { j = txt ? JSON.parse(txt) : null; } catch { j = txt; }
    if (!r.ok) throw new HttpError(r.status === 401 || r.status === 403 ? 400 : 502, `Mercado Livre ${r.status} em ${path.split("?")[0]}: ${j?.message ?? j?.error ?? String(txt).slice(0, 200)}`);
    return j;
  };
  return { get: (p: string) => call("GET", p), post: (p: string, b: unknown) => call("POST", p, b) };
}
const soft = async <T>(p: Promise<T>): Promise<T | null> => { try { return await p; } catch { return null; } };

const TIPO: Record<string, string> = { mediations: "reclamacao", returns: "devolucao", cancel_purchase: "cancelamento", cancel_sale: "cancelamento", fulfillment: "reclamacao", change: "devolucao" };

export async function sincronizarAtendimentoML(db: SupabaseClient, ws: string) {
  const sec = await validSecret(db, ws, "mercadolivre");
  const seller = String(sec.extra?.user_id ?? "");
  const ml = cliente(sec.access_token);
  const limite = Date.now() - DIAS_HISTORICO * 86400_000;
  const rows: Row[] = [];
  const erros: string[] = [];
  const motivos = new Map<string, any>();
  const agora = new Date().toISOString();

  // ── Reclamações, mediações, devoluções e cancelamentos ──
  const claims: any[] = [];
  try {
    for (let off = 0; off < 400; off += 50) {
      const j = await ml.get(`/post-purchase/v1/claims/search?player_role=respondent&player_user_id=${seller}&sort=last_updated:desc&limit=50&offset=${off}`);
      const lote: any[] = j?.data ?? [];
      claims.push(...lote);
      if (lote.length < 50 || new Date(lote.at(-1)?.last_updated ?? 0).getTime() < limite) break;
    }
  } catch (e) { erros.push(String((e as Error).message ?? e)); }

  for (const c of claims) {
    if (c.status !== "opened" && new Date(c.last_updated ?? 0).getTime() < limite) continue;
    const eu = (c.players ?? []).find((p: any) => String(p.user_id) === seller) ?? (c.players ?? []).find((p: any) => p.role === "respondent");
    const acoes = (eu?.available_actions ?? []).map((a: any) => ({ acao: a.action, prazo: a.due_date ?? null, obrigatoria: !!a.mandatory }));
    const prazo = acoes.map((a: any) => a.prazo).filter(Boolean).sort()[0] ?? null;
    if (c.reason_id && !motivos.has(c.reason_id)) motivos.set(c.reason_id, await soft(ml.get(`/post-purchase/v1/claims/reasons/${c.reason_id}`)));
    const mot = motivos.get(c.reason_id);
    const detalhar = c.status === "opened" || new Date(c.last_updated ?? 0).getTime() > Date.now() - 3 * 86400_000;
    const ordem = detalhar && c.resource === "order" ? await soft(ml.get(`/orders/${c.resource_id}`)) : null;
    const msgs = detalhar ? await soft(ml.get(`/post-purchase/v1/claims/${c.id}/messages`)) : null;
    const temDev = (c.related_entities ?? []).includes("return") || c.type === "returns";
    const dev = detalhar && temDev ? await soft(ml.get(`/post-purchase/v2/claims/${c.id}/returns`)) : null;
    const item = ordem?.order_items?.[0];
    const base: Row = {
      workspace_id: ws, id: `ML-R-${c.id}`, canal: "mercadolivre",
      tipo: c.stage === "dispute" ? "mediacao" : TIPO[c.type] ?? "reclamacao",
      status: c.status === "opened" ? "aberto" : "fechado", etapa: c.stage ?? null,
      pedido: ["order", "purchase"].includes(c.resource) && c.resource_id ? String(c.resource_id) : null, motivo_codigo: c.reason_id ?? null,
      motivo: mot ? [mot.name, mot.detail].filter(Boolean).join(" · ") : null,
      prazo, acoes, aberto_em: c.date_created ?? null, atualizado_em: c.last_updated ?? null,
      fechado_em: c.status === "closed" ? (c.resolution?.date_created ?? c.last_updated ?? null) : null,
      dados: { tipo_ml: c.type, recurso: c.resource ?? null, recurso_id: c.resource_id ?? null, etapa: c.stage, resolucao: c.resolution ?? null, entidades: c.related_entities ?? [], quantidade: c.quantity_type ?? null, cumprido: c.fulfilled ?? null },
      updated_at: agora,
    };
    if (ordem) Object.assign(base, {
      pack: ordem.pack_id ? String(ordem.pack_id) : null, produto: item?.item?.title ?? null, item_id: item?.item?.id ?? null,
      valor: ordem.total_amount ?? ordem.paid_amount ?? null, comprador: ordem.buyer?.nickname ?? null,
    });
    if (Array.isArray(msgs)) base.mensagens = msgs.slice(-40).map((m: any) => ({ de: m.sender_role, texto: m.message, em: m.date_created, anexos: (m.attachments ?? []).length }));
    if (dev) base.devolucao = {
      status: dev.status ?? null, subtipo: dev.subtype ?? null, reembolso_em: dev.refund_at ?? null,
      envios: (dev.shipments ?? []).map((s: any) => ({ status: s.status, rastreio: s.tracking_number ?? null, destino: s.destination?.name ?? null, tipo: s.type ?? null })),
    };
    rows.push(base);
  }

  // ── Perguntas sem resposta ──
  const perguntasAbertas = new Set<string>();
  try {
    const j = await ml.get(`/questions/search?seller_id=${seller}&status=UNANSWERED&api_version=4&sort_fields=date_created&sort_types=DESC&limit=50`);
    const qs: any[] = j?.questions ?? [];
    const ids = [...new Set(qs.map((q) => q.item_id).filter(Boolean))];
    const itens = new Map<string, any>();
    for (let i = 0; i < ids.length; i += 20) {
      const r = await soft(ml.get(`/items?ids=${ids.slice(i, i + 20).join(",")}&attributes=id,title,price,available_quantity,permalink`));
      for (const x of (r as any[]) ?? []) if (x?.body?.id) itens.set(x.body.id, x.body);
    }
    for (const q of qs) {
      const it = itens.get(q.item_id);
      perguntasAbertas.add(`ML-P-${q.id}`);
      rows.push({
        workspace_id: ws, id: `ML-P-${q.id}`, canal: "mercadolivre", tipo: "pergunta", status: "aberto", etapa: null,
        pedido: null, pack: null, produto: it?.title ?? null, item_id: q.item_id ?? null, valor: it?.price ?? null, comprador: null,
        motivo_codigo: null, motivo: null, prazo: null, acoes: null,
        mensagens: [{ de: "comprador", texto: q.text, em: q.date_created }],
        dados: { estoque: it?.available_quantity ?? null, link: it?.permalink ?? null },
        aberto_em: q.date_created ?? null, atualizado_em: q.date_created ?? null, fechado_em: null, updated_at: agora,
      });
    }
  } catch (e) { erros.push(String((e as Error).message ?? e)); }

  // ── Mensagens pós-venda não lidas ──
  const conversasAbertas = new Set<string>();
  try {
    const j = await ml.get(`/messages/unread?role=seller&tag=post_sale`);
    for (const u of (j?.results ?? []).slice(0, 40)) {
      const pack = String(u.resource ?? "").match(/packs\/(\d+)/)?.[1];
      if (!pack) continue;
      const conv = await soft(ml.get(`/messages/packs/${pack}/sellers/${seller}?tag=post_sale&mark_as_read=false&limit=30`));
      const ms: any[] = (conv as any)?.messages ?? [];
      const ordem = await soft(ml.get(`/packs/${pack}`)).then((p: any) => p?.orders?.[0]?.id ? soft(ml.get(`/orders/${p.orders[0].id}`)) : soft(ml.get(`/orders/${pack}`)));
      const item = (ordem as any)?.order_items?.[0];
      conversasAbertas.add(`ML-M-${pack}`);
      rows.push({
        workspace_id: ws, id: `ML-M-${pack}`, canal: "mercadolivre", tipo: "mensagem", status: "aberto", etapa: null,
        pedido: (ordem as any)?.id ? String((ordem as any).id) : null, pack, produto: item?.item?.title ?? null, item_id: item?.item?.id ?? null,
        valor: (ordem as any)?.total_amount ?? null, comprador: (ordem as any)?.buyer?.nickname ?? null, motivo_codigo: null, motivo: null, prazo: null, acoes: null,
        mensagens: ms.slice().sort((a, b) => String(a.message_date?.created ?? "").localeCompare(String(b.message_date?.created ?? "")))
          .map((m) => ({ de: String(m.from?.user_id) === seller ? "vendedor" : "comprador", texto: m.text, em: m.message_date?.created ?? null })),
        dados: { nao_lidas: u.count ?? null, comprador_id: ms.find((m) => String(m.from?.user_id) !== seller)?.from?.user_id ?? null },
        aberto_em: ms[0]?.message_date?.created ?? null, atualizado_em: ms.at(-1)?.message_date?.created ?? null, fechado_em: null, updated_at: agora,
      });
    }
  } catch (e) { erros.push(String((e as Error).message ?? e)); }

  for (let k = 0; k < rows.length; k += 100) {
    const { error } = await db.from("atendimentos").upsert(rows.slice(k, k + 100), { onConflict: "workspace_id,id" });
    if (error) throw error;
  }
  // Perguntas respondidas e conversas lidas fora do portal saem da fila.
  const { data: abertos } = await db.from("atendimentos").select("id,tipo").eq("workspace_id", ws).eq("canal", "mercadolivre").eq("status", "aberto").in("tipo", ["pergunta", "mensagem"]);
  const fechar = (abertos ?? []).filter((a) => a.tipo === "pergunta" ? !perguntasAbertas.has(a.id) : !conversasAbertas.has(a.id)).map((a) => a.id);
  if (fechar.length && !erros.length) await db.from("atendimentos").update({ status: "fechado", fechado_em: agora, updated_at: agora }).eq("workspace_id", ws).in("id", fechar);

  return {
    reclamacoes: rows.filter((r) => String(r.id).startsWith("ML-R-")).length,
    abertas: rows.filter((r) => String(r.id).startsWith("ML-R-") && r.status === "aberto").length,
    perguntas: perguntasAbertas.size, mensagens: conversasAbertas.size, fechados: fechar.length, erros,
  };
}

/** Envia a resposta escrita (e revisada) pela equipe no portal. */
export async function responderML(db: SupabaseClient, ws: string, id: string, texto: string) {
  texto = texto.trim();
  if (!texto) throw new HttpError(400, "Escreva a resposta.");
  const { data: a } = await db.from("atendimentos").select("*").eq("workspace_id", ws).eq("id", id).maybeSingle();
  if (!a) throw new HttpError(404, "Atendimento não encontrado.");
  const sec = await validSecret(db, ws, "mercadolivre");
  const seller = String(sec.extra?.user_id ?? "");
  const ml = cliente(sec.access_token);
  const num = id.replace(/^ML-[RPM]-/, "");
  if (a.tipo === "pergunta") {
    if (texto.length > 2000) throw new HttpError(400, "A resposta passa de 2.000 caracteres.");
    await ml.post(`/answers`, { question_id: Number(num), text: texto });
  } else if (a.tipo === "mensagem") {
    const comprador = a.dados?.comprador_id;
    if (!comprador) throw new HttpError(400, "Não encontrei o comprador desta conversa.");
    if (texto.length > 350) throw new HttpError(400, "O Mercado Livre aceita até 350 caracteres por mensagem pós-venda.");
    await ml.post(`/messages/packs/${a.pack}/sellers/${seller}?tag=post_sale`, { from: { user_id: seller }, to: { user_id: String(comprador) }, text: texto });
  } else {
    await ml.post(`/post-purchase/v1/claims/${num}/actions/send-message`, { receiver_role: "complainant", message: texto });
  }
  const agora = new Date().toISOString();
  const mensagens = [...(a.mensagens ?? []), { de: "vendedor", texto, em: agora }];
  const fecha = a.tipo === "pergunta";
  await db.from("atendimentos").update({ mensagens, atualizado_em: agora, updated_at: agora, ...(fecha ? { status: "fechado", fechado_em: agora } : {}) }).eq("workspace_id", ws).eq("id", id);
  return { ok: true, mensagens };
}
