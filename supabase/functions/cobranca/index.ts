// Assinatura do Jarvis com cobrança recorrente pelo Asaas (boleto, Pix ou cartão — o pagador escolhe).
// • POST {action:"planos"}: a tabela de preços (para a tela).
// • POST {action:"checkout", workspace_id, plano, faixa, modulos, folha25, ciclo, cnpj, email}: só o dono. Calcula o valor
//   no servidor (tabela do kit comercial), cria o cliente e a assinatura no Asaas, com o 1º vencimento no fim do teste,
//   e devolve o link da fatura. A situação só vira "ativa" quando o Asaas avisar o pagamento.
// • Aviso do Asaas (webhook, cabeçalho asaas-access-token = ASAAS_WEBHOOK_TOKEN): pagamento confirmado → ativa;
//   vencido → atrasada; assinatura removida → cancelada.
// Chaves no servidor: ASAAS_API_KEY, ASAAS_WEBHOOK_TOKEN e ASAAS_AMBIENTE (producao | sandbox, padrão sandbox).
// Publicar sem verificação de JWT (o Asaas não manda login): supabase functions deploy cobranca --no-verify-jwt
// — o checkout confere o login do usuário por conta própria (authorize).
import { admin, authorize, cors, HttpError, json } from "../_shared/common.ts";
import { MODULOS, precoAssinatura, type Escolha } from "../_shared/precos_jarvis.ts";

const API = () => Deno.env.get("ASAAS_AMBIENTE") === "producao" ? "https://api.asaas.com/v3" : "https://sandbox.asaas.com/api/v3";
async function asaas(path: string, init: RequestInit = {}) {
  const chave = Deno.env.get("ASAAS_API_KEY");
  if (!chave) throw new HttpError(503, "A cobrança ainda não foi conectada. Fale com a equipe Jarvis para assinar.");
  const r = await fetch(API() + path, { ...init, headers: { access_token: chave, "Content-Type": "application/json", "User-Agent": "Jarvis", ...(init.headers ?? {}) } });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new HttpError(502, `Asaas: ${j?.errors?.[0]?.description ?? r.status}`);
  return j;
}
const dig = (s: unknown) => String(s ?? "").replace(/\D/g, "");

async function webhook(req: Request) {
  const token = Deno.env.get("ASAAS_WEBHOOK_TOKEN");
  if (!token || req.headers.get("asaas-access-token") !== token) return json({ error: "não autorizado" }, 401);
  const ev: any = await req.json().catch(() => ({}));
  const sub = ev?.payment?.subscription ?? ev?.subscription?.id;
  if (!sub) return json({ ok: true, ignorado: true });
  const status = /PAYMENT_(CONFIRMED|RECEIVED)/.test(ev.event) ? "ativa" : ev.event === "PAYMENT_OVERDUE" ? "atrasada" : /SUBSCRIPTION_(DELETED|INACTIVATED)/.test(ev.event) ? "cancelada" : null;
  if (!status) return json({ ok: true, ignorado: ev.event });
  const db = admin();
  const { data } = await db.from("assinaturas").update({ status, atualizado_em: new Date().toISOString() }).eq("provedor", "asaas").eq("provedor_assinatura", sub).select("workspace_id");
  for (const a of data ?? []) await db.from("audit_log").insert({ workspace_id: a.workspace_id, id: crypto.randomUUID(), action: "Assinatura", detail: `Asaas: ${ev.event} → ${status}`, actor: "Asaas" });
  return json({ ok: true, status });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (req.headers.get("asaas-access-token") !== null) return await webhook(req);
    const body: any = await req.json().catch(() => ({}));
    if (body.action === "planos") return json({ modulos: MODULOS, conectado: !!Deno.env.get("ASAAS_API_KEY") });
    if (body.action !== "checkout") throw new HttpError(400, "Ação inválida.");
    const ws = String(body.workspace_id ?? "");
    const { user, db } = await authorize(req, ws);
    const { data: m } = await db.from("workspace_members").select("role").eq("workspace_id", ws).eq("user_id", user.id).maybeSingle();
    if (m?.role !== "owner") throw new HttpError(403, "Só o dono assina o plano.");
    const preco = precoAssinatura(body as Escolha);
    const cnpj = dig(body.cnpj);
    if (cnpj.length !== 14 && cnpj.length !== 11) throw new HttpError(400, "Informe o CNPJ (ou CPF) de quem paga.");
    const { data: w } = await db.from("workspaces").select("name").eq("id", ws).single();
    const { data: a } = await db.from("assinaturas").select("*").eq("workspace_id", ws).maybeSingle();
    if (a?.status === "interno") throw new HttpError(400, "Esta empresa não é cobrada (uso interno).");
    if (a?.provedor_assinatura && a.status === "ativa") throw new HttpError(400, "A assinatura já está ativa. Para mudar de plano, fale com a equipe Jarvis.");
    const cliente = a?.provedor_cliente ?? (await asaas("/customers", { method: "POST", body: JSON.stringify({ name: w?.name ?? "Empresa", cpfCnpj: cnpj, email: String(body.email || user.email || ""), externalReference: ws }) })).id;
    const hoje = new Date().toISOString().slice(0, 10), venc = a?.teste_ate && a.teste_ate > hoje ? a.teste_ate : hoje;
    const assinatura = await asaas("/subscriptions", { method: "POST", body: JSON.stringify({
      customer: cliente, billingType: "UNDEFINED", value: preco.cobrar, nextDueDate: venc, cycle: preco.ciclo === "anual" ? "YEARLY" : "MONTHLY",
      description: `Jarvis · ${preco.itens.map((i) => i.item).join(" + ")}${preco.ciclo === "anual" ? " · anual (10 mensalidades por 12 meses)" : ""}`, externalReference: ws,
    }) });
    const pag = await asaas(`/subscriptions/${assinatura.id}/payments`);
    const link = pag?.data?.[0]?.invoiceUrl ?? null;
    await db.from("assinaturas").upsert({ workspace_id: ws, status: a?.status === "ativa" ? "ativa" : (a?.status ?? "teste"), plano: body.plano, faixa: preco.faixa, modulos: preco.modulos, ciclo: preco.ciclo, valor_mensal: preco.mensal,
      teste_ate: a?.teste_ate ?? null, provedor: "asaas", provedor_cliente: cliente, provedor_assinatura: assinatura.id, link_pagamento: link, atualizado_em: new Date().toISOString() });
    await db.from("audit_log").insert({ workspace_id: ws, id: crypto.randomUUID(), action: "Assinatura", detail: `Plano escolhido: ${preco.itens.map((i) => i.item).join(" + ")} · ${preco.ciclo} · R$ ${preco.cobrar}`, actor: user.email ?? user.id });
    return json({ ok: true, link, preco });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (!(e instanceof HttpError)) console.error(e);
    return json({ error: e instanceof Error ? e.message : String(e) }, status);
  }
});
