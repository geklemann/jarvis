// Notas de compra direto da SEFAZ (distribuição DF-e) pelo Focus NFe: lista as NF-e emitidas contra o CNPJ da
// empresa, manifesta o destinatário (ciência, confirmação, desconhecimento, operação não realizada) e baixa a nota
// completa (itens e duplicatas) para gerar contas a pagar sem depender do Bling. Exige o recurso "NF-e recebidas"
// habilitado no Focus e o certificado A1 da empresa cadastrado lá. Só roda com o token de PRODUÇÃO (SEFAZ real).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { HttpError, round } from "./common.ts";
import { configFiscal } from "./nfe_focus.ts";
import { aprenderMapa, converter } from "./entradas.ts";

const BASE = "https://api.focusnfe.com.br";
const token = () => Deno.env.get("FOCUS_NFE_TOKEN") ?? "";
const dig = (s: unknown) => String(s ?? "").replace(/\D/g, "");
async function focus(method: string, path: string, body?: unknown) {
  if (!token()) throw new HttpError(400, "Notas de compra da SEFAZ usam o token de produção do Focus NFe (FOCUS_NFE_TOKEN), que ainda não foi gravado.");
  const r = await fetch(BASE + path, { method, headers: { Authorization: "Basic " + btoa(`${token()}:`), ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const txt = await r.text();
  let j: any = null;
  try { j = txt ? JSON.parse(txt) : null; } catch { j = { mensagem: txt.slice(0, 200) }; }
  if (!r.ok) throw new HttpError(r.status === 404 ? 404 : 502, `Focus NFe respondeu ${r.status}: ${j?.mensagem ?? j?.codigo ?? "erro"}${/CNPJ.*(autorizado|informado)/i.test(String(j?.mensagem ?? "")) ? " (no painel do Focus NFe, habilite \"NF-e recebidas / manifestação\" na empresa deste CNPJ, com o certificado A1 cadastrado lá)" : ""}${r.status === 403 ? " (verifique se o recurso NF-e recebidas está habilitado no plano e se o certificado A1 está cadastrado no Focus)" : ""}`);
  return { j, max: Number(r.headers.get("X-Max-Version") ?? 0) };
}

/** Busca as notas novas desde a última versão lida e grava em nfe_recebidas. */
export async function sincronizarRecebidas(db: SupabaseClient, ws: string, deadline = Date.now() + 90_000) {
  const cfg = await configFiscal(db, ws), cnpj = dig(cfg.cnpj);
  const { data: ult } = await db.from("nfe_recebidas").select("versao").eq("workspace_id", ws).order("versao", { ascending: false, nullsFirst: false }).limit(1);
  let versao = Number(ult?.[0]?.versao ?? 0), novas = 0, lidas = 0;
  for (let i = 0; i < 20 && Date.now() < deadline; i++) {
    const { j, max } = await focus("GET", `/v2/nfes_recebidas?cnpj=${cnpj}&versao=${versao}`);
    const lista: any[] = Array.isArray(j) ? j : [];
    if (!lista.length) break;
    const rows = lista.map((n) => ({
      workspace_id: ws, chave: String(n.chave_nfe), versao: Number(n.versao ?? 0), emitente: n.nome_emitente ?? null, emitente_doc: dig(n.documento_emitente) || null,
      emissao: n.data_emissao ?? null, valor: n.valor_total != null ? round(Number(n.valor_total)) : null, situacao: n.situacao ?? null,
      manifestacao: n.manifestacao_destinatario ?? null, completa: n.nfe_completa === true || n.nfe_completa === "true", dados: n, updated_at: new Date().toISOString(),
    }));
    const { error } = await db.from("nfe_recebidas").upsert(rows, { onConflict: "workspace_id,chave" });
    if (error) throw error;
    lidas += rows.length; novas += rows.filter((r) => r.versao > versao).length;
    versao = Math.max(versao, ...rows.map((r) => r.versao));
    if (max && versao >= max) break;
  }
  return { lidas, novas, versao };
}

const TIPOS: Record<string, string> = { ciencia: "ciencia", confirmacao: "confirmacao", desconhecimento: "desconhecimento", nao_realizada: "nao_realizada" };
/** Manifestação do destinatário. "Não realizada" exige justificativa (mínimo 15 caracteres). */
export async function manifestar(db: SupabaseClient, ws: string, chave: string, tipo: string, justificativa?: string) {
  if (!TIPOS[tipo]) throw new HttpError(400, "Tipo de manifestação inválido.");
  if (tipo === "nao_realizada" && String(justificativa ?? "").trim().length < 15) throw new HttpError(400, "Informe a justificativa (mínimo 15 caracteres).");
  const { j } = await focus("POST", `/v2/nfes_recebidas/${dig(chave)}/manifesto`, { tipo, ...(tipo === "nao_realizada" ? { justificativa: String(justificativa).trim() } : {}) });
  await db.from("nfe_recebidas").update({ manifestacao: tipo, updated_at: new Date().toISOString() }).eq("workspace_id", ws).eq("chave", dig(chave));
  return { chave, tipo, status: j?.status ?? null, mensagem: j?.mensagem_sefaz ?? null };
}

/** Nota completa (itens e duplicatas). Só existe depois da ciência/confirmação. */
export async function detalheRecebida(db: SupabaseClient, ws: string, chave: string) {
  const { j } = await focus("GET", `/v2/nfes_recebidas/${dig(chave)}.json?completa=1`);
  const r = j?.requisicao_nota_fiscal ?? j ?? {};
  const det = {
    numero: r.numero ?? null, serie: r.serie ?? null, natureza: r.natureza_operacao ?? null,
    itens: (r.items ?? []).map((i: any) => ({ codigo: i.codigo_produto, descricao: i.descricao, ncm: i.codigo_ncm, cfop: i.cfop, qtd: Number(i.quantidade_comercial), valor: Number(i.valor_unitario_comercial), total: Number(i.valor_bruto) })),
    duplicatas: (r.duplicatas ?? []).map((d: any) => ({ numero: d.numero, vencimento: d.data_vencimento, valor: Number(d.valor) })),
    total: Number(r.valor_total ?? 0), frete: Number(r.valor_frete ?? 0), icms: Number(r.icms_valor_total ?? 0),
  };
  await db.from("nfe_recebidas").update({ detalhe: det, completa: true, updated_at: new Date().toISOString() }).eq("workspace_id", ws).eq("chave", dig(chave));
  return det;
}

/** Notas da SEFAZ com itens baixados viram notas de ENTRADA do Jarvis (purchase_invoices, origem SEFAZ), com o código
 *  do fornecedor traduzido para o SKU da loja. Enquanto a mesma nota também vier do ERP de origem, ela não é duplicada
 *  e serve para aprender a tradução dos códigos. */
export async function processarEntradasSefaz(db: SupabaseClient, ws: string) {
  const { data: recs } = await db.from("nfe_recebidas").select("chave,emitente,emitente_doc,emissao,valor,detalhe,situacao").eq("workspace_id", ws).not("detalhe", "is", null).limit(2000);
  const lista = (recs ?? []).filter((n: any) => !/cancel/i.test(String(n.situacao ?? "")));
  if (!lista.length) return { notas: 0, aprendidos: 0, gravadas: 0 };
  const chaves = lista.map((n: any) => n.chave);
  const existentes: any[] = [];
  for (let i = 0; i < chaves.length; i += 200) { const { data } = await db.from("purchase_invoices").select("id,chave,source,itens").eq("workspace_id", ws).in("chave", chaves.slice(i, i + 200)); existentes.push(...(data ?? [])); }
  const porChave = new Map(existentes.map((p) => [p.chave, p]));
  // Aprende com as notas que existem nas duas fontes.
  const aprender: any[] = [];
  for (const n of lista) { const p = porChave.get(n.chave); if (p && p.source !== "SEFAZ") aprender.push(...aprenderMapa(String(n.emitente_doc ?? ""), n.detalhe?.itens ?? [], p.itens ?? [])); }
  if (aprender.length) {
    const unicos = [...new Map(aprender.map((a) => [`${a.fornecedor_doc}|${a.codigo}`, a])).values()].map((a) => ({ workspace_id: ws, ...a, origem: "aprendido", updated_at: new Date().toISOString() }));
    // Ajuste manual tem prioridade: não sobrescreve o que a equipe corrigiu.
    const { data: manuais } = await db.from("sku_fornecedor").select("fornecedor_doc,codigo").eq("workspace_id", ws).eq("origem", "manual");
    const man = new Set((manuais ?? []).map((m: any) => `${m.fornecedor_doc}|${m.codigo}`));
    const novos = unicos.filter((a) => !man.has(`${a.fornecedor_doc}|${a.codigo}`));
    for (let i = 0; i < novos.length; i += 500) await db.from("sku_fornecedor").upsert(novos.slice(i, i + 500), { onConflict: "workspace_id,fornecedor_doc,codigo" });
  }
  const { data: mapas } = await db.from("sku_fornecedor").select("fornecedor_doc,codigo,sku").eq("workspace_id", ws).limit(20000);
  const mapa = new Map((mapas ?? []).map((m: any) => [`${m.fornecedor_doc}|${m.codigo}`, m.sku]));
  // Grava (ou regrava, se a tradução melhorou) só as notas que não vieram do ERP de origem.
  const rows = lista.filter((n: any) => { const p = porChave.get(n.chave); return !p || p.source === "SEFAZ"; }).map((n: any) => { const { sem_mapa: _s, ...r } = converter(n, mapa); return { workspace_id: ws, ...r, updated_at: new Date().toISOString() }; });
  for (let i = 0; i < rows.length; i += 200) { const { error } = await db.from("purchase_invoices").upsert(rows.slice(i, i + 200), { onConflict: "workspace_id,id" }); if (error) throw error; }
  return { notas: lista.length, aprendidos: aprender.length, gravadas: rows.length };
}
