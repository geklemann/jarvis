// Contas a pagar por e-mail: o Resend avisa (webhook "email.received") a cada e-mail que chega em
// boletos-<token>@<domínio de recebimento>. A função confere a assinatura do aviso, lê o e-mail e os anexos PDF, acha
// as linhas digitáveis (sem IA: _shared/boleto.ts) e cria os títulos em ABERTO aguardando aprovação no Contas a pagar.
// Segredos: RESEND_WEBHOOK_SECRET (assinatura do webhook) e RESEND_RECEBER_KEY (chave com acesso ao recebimento).
// Publicada sem verificação de login (quem chama é o Resend): supabase functions deploy contas-email --no-verify-jwt
import { admin, HttpError, handler, json } from "../_shared/common.ts";
import { acharBoletos, beneficiario } from "../_shared/boleto.ts";

const API = "https://api.resend.com";
const hojeBR = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const b64 = (u: Uint8Array) => { let s = ""; for (const x of u) s += String.fromCharCode(x); return btoa(s); };

/** Assinatura Svix (padrão dos webhooks do Resend): HMAC-SHA256 de "id.timestamp.corpo" com o segredo whsec_. */
async function assinaturaOk(req: Request, corpo: string) {
  const seg = Deno.env.get("RESEND_WEBHOOK_SECRET"); if (!seg) return false;
  const id = req.headers.get("svix-id"), ts = req.headers.get("svix-timestamp"), sig = req.headers.get("svix-signature");
  if (!id || !ts || !sig || Math.abs(Date.now() / 1000 - Number(ts)) > 600) return false;
  const chave = Uint8Array.from(atob(seg.replace(/^whsec_/, "")), (c) => c.charCodeAt(0));
  const k = await crypto.subtle.importKey("raw", chave, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const esperado = b64(new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`${id}.${ts}.${corpo}`))));
  return sig.split(" ").some((p) => p.split(",")[1] === esperado);
}
async function api(path: string) {
  const r = await fetch(API + path, { headers: { Authorization: `Bearer ${Deno.env.get("RESEND_RECEBER_KEY") || Deno.env.get("RESEND_API_KEY")}` } });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return await r.json();
}
async function textoPdf(bytes: Uint8Array) {
  try { const { extractText, getDocumentProxy } = await import("npm:unpdf@0.12.1"); const pdf = await getDocumentProxy(bytes); const { text } = await extractText(pdf, { mergePages: true }); return String(text ?? ""); }
  catch { return ""; }
}
const enderecoDe = (s: string) => (String(s ?? "").match(/<([^>]+)>/)?.[1] ?? String(s ?? "")).trim().toLowerCase();
const nomeDe = (s: string) => String(s ?? "").replace(/<[^>]*>/g, "").replace(/"/g, "").trim();

Deno.serve(handler(async (req) => {
  const corpo = await req.text();
  if (!(await assinaturaOk(req, corpo))) throw new HttpError(401, "assinatura inválida");
  const ev = JSON.parse(corpo);
  if (ev?.type !== "email.received") return json({ ignorado: ev?.type ?? null });
  const db = admin(), emailId = String(ev.data?.email_id ?? "");
  const em = await api(`/emails/receiving/${emailId}`);
  const para = [...(em.to ?? []), ...(ev.data?.to ?? [])].map(enderecoDe);
  const token = para.map((a) => a.match(/^boletos-([a-z0-9]{8,})@/)?.[1]).find(Boolean);
  if (!token) return json({ ignorado: "sem caixa" });
  const { data: cx } = await db.from("caixas_email").select("*").eq("token", token).maybeSingle();
  if (!cx || !cx.ativo) return json({ ignorado: "caixa desligada" });
  const ws = cx.workspace_id, de = enderecoDe(em.from), assunto = String(em.subject ?? "").slice(0, 200);
  const log = async (criados: number, resultado: unknown) => { await db.from("contas_email_log").insert({ workspace_id: ws, de, assunto, criados, resultado }); };
  if (!cx.qualquer_remetente && !(cx.remetentes ?? []).map((x: string) => x.toLowerCase()).includes(de)) { await log(0, [{ motivo: "remetente não autorizado" }]); return json({ ignorado: "remetente" }); }

  // Corpo do e-mail + texto dos PDFs anexos (guardados no Storage, pasta da empresa).
  const textos: { nome: string; texto: string; caminho?: string }[] = [{ nome: "corpo do e-mail", texto: `${em.text ?? ""}\n${String(em.html ?? "").replace(/<[^>]+>/g, " ")}` }];
  const anexos = (await api(`/emails/receiving/${emailId}/attachments`).catch(() => ({ data: [] })))?.data ?? [];
  for (const a of anexos.slice(0, 10)) {
    if (!/pdf/i.test(a.content_type ?? "") && !/\.pdf$/i.test(a.filename ?? "")) continue;
    const r = await fetch(a.download_url); if (!r.ok) continue;
    const bytes = new Uint8Array(await r.arrayBuffer());
    const caminho = `${ws}/contas-email/${emailId}-${String(a.filename ?? "boleto.pdf").replace(/[^\w.-]+/g, "_").slice(0, 80)}`;
    await db.storage.from("contabil").upload(caminho, bytes, { contentType: "application/pdf", upsert: true }).catch(() => null);
    textos.push({ nome: a.filename ?? "anexo.pdf", texto: await textoPdf(bytes), caminho });
  }
  const resultado: any[] = []; let criados = 0;
  for (const t of textos) for (const b of acharBoletos(t.texto, hojeBR())) {
    if (resultado.some((x) => x.linha === b.linha)) continue;
    const { data: ja } = await db.from("payables").select("id").eq("workspace_id", ws).eq("linha_digitavel", b.linha).limit(1);
    if (ja?.length) { resultado.push({ linha: b.linha, valor: b.valor, motivo: `já lançado (${ja[0].id})` }); continue; }
    if (!b.valor) { resultado.push({ linha: b.linha, motivo: "boleto sem valor na linha digitável: lance à mão" }); continue; }
    const id = `email-${b.linha.slice(-12)}-${Date.now().toString(36)}`;
    const fornecedor = beneficiario(t.texto) || nomeDe(em.from) || b.bancoNome || "Boleto por e-mail";
    const { error } = await db.from("payables").insert({
      workspace_id: ws, id, origem: "email", fornecedor, descricao: `Boleto recebido por e-mail${assunto ? " · " + assunto : ""}`.slice(0, 200), documento: t.nome.slice(0, 120),
      emissao: hojeBR(), vencimento: b.vencimento ?? hojeBR(), valor: b.valor, status: "aberto", aprovacao: "pendente", linha_digitavel: b.linha,
      anexos: t.caminho ? [{ bucket: "contabil", caminho: t.caminho, nome: t.nome }] : null, created_by: `e-mail de ${de}`, lancado_por: `e-mail de ${de}`,
      observacao: b.vencimento ? null : "Vencimento não veio na linha digitável: confira no boleto.",
    });
    if (error) { resultado.push({ linha: b.linha, valor: b.valor, motivo: error.message }); continue; }
    criados++; resultado.push({ linha: b.linha, valor: b.valor, vencimento: b.vencimento, fornecedor, titulo: id });
    await db.from("audit_log").insert({ workspace_id: ws, id: crypto.randomUUID(), time: new Date().toISOString(), action: "Conta a pagar recebida por e-mail", actor: `e-mail de ${de}`, detail: `${fornecedor} · ${b.valor} · venc. ${b.vencimento ?? "?"} · aguardando aprovação` }).then(() => null, () => null);
  }
  if (!resultado.length) resultado.push({ motivo: "nenhum boleto encontrado no e-mail nem nos anexos PDF" });
  await log(criados, resultado);
  return json({ criados });
}));
