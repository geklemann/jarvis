// Central do Cliente (pública, sem login): o comprador acompanha o pedido, pede ajuda e avalia a compra.
// Segurança: o pedido só aparece com o número + os 4 últimos dígitos do CPF/CNPJ do comprador; a resposta não traz
// endereço, documento nem valores de outros pedidos. Tentativas erradas em excesso bloqueiam o IP por alguns minutos.
import { admin, cors, json } from "../_shared/common.ts";

const WS = () => Deno.env.get("PORTAL_WORKSPACE_ID") ?? "6c2f6e77-d8cb-487b-8cf6-077c232f9360";
const tentativas = new Map<string, { n: number; ate: number }>();
const dig = (s: unknown) => String(s ?? "").replace(/\D/g, "");
const limpo = (s: unknown, max = 1000) => String(s ?? "").replace(/[<>]/g, "").trim().slice(0, max);

async function acharPedido(db: ReturnType<typeof admin>, pedido: string, fim4: string) {
  const p = limpo(pedido, 60).replace(/^#/, "");
  if (p.length < 4 || fim4.length !== 4) return null;
  const { data } = await db.from("orders").select("id,platform,date,nf,transit,items,customer,external")
    .eq("workspace_id", WS()).or(`id.eq.${p},external->>bling_numero.eq.${p},external->>ml_order_id.eq.${p},external->>pack_id.eq.${p}`).limit(5);
  let o = (data ?? []).find((x: any) => dig(x.customer?.doc).slice(-4) === fim4);
  if (!o) {
    const { data: d2 } = await db.from("orders").select("id,platform,date,nf,transit,items,customer,external").eq("workspace_id", WS()).contains("external", { ml_order_ids: [Number(p) || p] }).limit(5);
    o = (d2 ?? []).find((x: any) => dig(x.customer?.doc).slice(-4) === fim4);
  }
  return o ?? null;
}

function etapas(o: any) {
  const dias = (Date.now() - new Date(o.date + "T12:00:00").getTime()) / 864e5;
  const nf = !!o.nf, enviado = nf && (o.transit || dias >= 2);
  return [
    { t: "Pedido confirmado", ok: true, quando: o.date },
    { t: "Nota fiscal emitida", ok: nf, detalhe: nf ? `NF ${String(o.nf).replace(/\D/g, "").slice(-9)}` : "em preparação" },
    { t: "Enviado", ok: enviado, detalhe: enviado ? "acompanhe a entrega pelo app da loja onde você comprou" : "separando o seu pedido" },
    { t: "Entregue", ok: false, detalhe: "confirmação pelo marketplace" },
  ];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "?";
    const t = tentativas.get(ip);
    if (t && t.ate > Date.now() && t.n >= 8) return json({ error: "Muitas tentativas. Aguarde alguns minutos e tente de novo." }, 429);
    const body = await req.json().catch(() => ({}));
    const db = admin();
    const o = await acharPedido(db, body.pedido, dig(body.fim4));
    if (!o) {
      const x = t && t.ate > Date.now() ? t : { n: 0, ate: Date.now() + 10 * 60_000 };
      x.n++; tentativas.set(ip, x);
      return json({ error: "Não encontramos um pedido com esses dados. Confira o número do pedido e os 4 últimos dígitos do CPF." }, 404);
    }
    tentativas.delete(ip);
    const nome = String(o.customer?.name ?? "").split(/\s+/)[0] || "cliente";
    const itens = (o.items ?? []).map((i: any) => ({ nome: limpo(i.title ?? i.sku, 120), sku: limpo(i.sku, 40), qtd: Number(i.qty) || 1 }));
    if (body.acao === "consultar") {
      // Pedidos de ajuda deste pedido, com as respostas da loja (sem nomes da equipe nem notas internas).
      const { data: at } = await db.from("atendimentos").select("id,motivo,status,etapa_interna,aberto_em,mensagens").eq("workspace_id", WS()).eq("pedido", o.id).like("id", "portal-%").order("aberto_em", { ascending: false }).limit(10);
      const ajudas = (at ?? []).map((a: any) => ({
        protocolo: String(a.id).slice(-8).toUpperCase(), motivo: a.motivo, aberto_em: a.aberto_em,
        situacao: a.etapa_interna === "resolvido" || a.status === "fechado" ? "Resolvido" : (a.mensagens ?? []).at(-1)?.de === "vendedor" ? "Respondido pela loja" : "Em análise",
        mensagens: (a.mensagens ?? []).map((m: any) => ({ de: m.de === "vendedor" ? "loja" : "voce", texto: limpo(m.texto, 2000), em: m.em })),
      }));
      return json({ pedido: o.id, canal: o.platform, data: o.date, nome, itens, etapas: etapas(o), ajudas });
    }
    if (body.acao === "responder") {
      const prot = String(body.protocolo ?? "").toLowerCase().replace(/[^0-9a-f]/g, "").slice(0, 8), texto = limpo(body.texto, 2000);
      if (prot.length !== 8 || texto.length < 2) return json({ error: "Escreva a sua mensagem." }, 400);
      const { data: at } = await db.from("atendimentos").select("id,mensagens").eq("workspace_id", WS()).eq("pedido", o.id).like("id", `portal-%${prot}`).maybeSingle();
      if (!at) return json({ error: "Protocolo não encontrado para este pedido." }, 404);
      const agora = new Date().toISOString();
      const { error } = await db.from("atendimentos").update({ mensagens: [...(at.mensagens ?? []), { de: "cliente", nome, texto, em: agora }], status: "aberto", etapa_interna: "novo", atualizado_em: agora, updated_at: agora, fechado_em: null }).eq("workspace_id", WS()).eq("id", at.id);
      if (error) throw error;
      return json({ ok: true });
    }
    if (body.acao === "ajuda") {
      const tipo = ["troca", "defeito", "peca", "atraso", "montagem", "duvida"].includes(body.tipo) ? body.tipo : "duvida";
      const texto = limpo(body.texto, 2000); if (texto.length < 10) return json({ error: "Conte com um pouco mais de detalhe (mínimo 10 caracteres)." }, 400);
      const agora = new Date().toISOString(), id = "portal-" + crypto.randomUUID();
      const motivo = { troca: "Troca", defeito: "Produto com defeito", peca: "Peça faltando", atraso: "Atraso na entrega", montagem: "Ajuda na montagem", duvida: "Dúvida" }[tipo as string];
      const { error } = await db.from("atendimentos").insert({
        workspace_id: WS(), id, canal: "Central do Cliente", tipo: "reclamacao_portal", status: "aberto", etapa: "novo", pedido: o.id, produto: limpo(body.produto || itens[0]?.nome, 160),
        valor: null, comprador: nome, motivo, prazo: new Date(Date.now() + 24 * 3600_000).toISOString(),
        mensagens: [{ de: "cliente", nome, texto, em: agora }], dados: { contato: limpo(body.contato, 120), origem: "portal", canal_venda: o.platform }, aberto_em: agora, atualizado_em: agora,
      });
      if (error) throw error;
      return json({ ok: true, protocolo: id.slice(-8).toUpperCase(), prazo: "até 1 dia útil" });
    }
    if (body.acao === "avaliar") {
      const nota = Math.max(0, Math.min(10, Math.round(Number(body.nota))));
      if (!Number.isFinite(nota)) return json({ error: "Escolha uma nota de 0 a 10." }, 400);
      const { error } = await db.from("cx_pesquisas").insert({ workspace_id: WS(), tipo: body.tipo === "csat" ? "csat" : "nps", nota, comentario: limpo(body.comentario, 1500) || null, pedido: o.id, canal: o.platform, produto: itens[0]?.nome ?? null, origem: "portal" });
      if (error) throw error;
      return json({ ok: true });
    }
    return json({ error: "Ação inválida." }, 400);
  } catch (e) {
    return json({ error: "Não foi possível concluir agora. Tente em instantes." }, 500);
  }
});
