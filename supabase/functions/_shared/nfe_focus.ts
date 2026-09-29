// Emissão de NF-e pelo EcomBalance via Focus NFe (https://focusnfe.com.br/doc/). O certificado A1 fica no
// provedor; aqui ficam só os tokens (FOCUS_NFE_TOKEN_HOMOLOGACAO / FOCUS_NFE_TOKEN). A nota é montada do
// pedido (itens, valores, canal), do contato do Bling (endereço do comprador) e dos dados fiscais do produto
// (NCM/origem). Regras tributárias vêm da configuração fiscal do workspace — validar com a contabilidade.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { fetchJson, HttpError, round, sleep } from "./common.ts";
import { validSecret } from "./store.ts";

const BASE = { homologacao: "https://homologacao.focusnfe.com.br", producao: "https://api.focusnfe.com.br" } as const;
type Amb = keyof typeof BASE;
const token = (a: Amb) => Deno.env.get(a === "producao" ? "FOCUS_NFE_TOKEN" : "FOCUS_NFE_TOKEN_HOMOLOGACAO") ?? "";
const auth = (a: Amb) => ({ Authorization: "Basic " + btoa(`${token(a)}:`) });

// Alíquota interna de ICMS por UF de destino (padrão 2026; CONFIRMAR com a contabilidade e ajustar na configuração).
export const ALIQ_INTERNA: Record<string, number> = { AC: 19, AL: 19, AM: 20, AP: 18, BA: 20.5, CE: 20, DF: 20, ES: 17, GO: 19, MA: 23, MG: 18, MS: 17, MT: 17, PA: 19, PB: 20, PE: 20.5, PI: 22.5, PR: 19.5, RJ: 20, RN: 20, RO: 19.5, RR: 20, RS: 17, SC: 17, SE: 19, SP: 18, TO: 20 };
// Remetente do Sul/Sudeste: 7% para N, NE, CO e ES; 12% para S e SE.
const INTER_7 = new Set(["AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MS", "MT", "PA", "PB", "PE", "PI", "RN", "RO", "RR", "SE", "TO"]);
// CNPJ dos intermediadores (NF-e 4.0: venda em marketplace informa o intermediador).
const INTERMEDIADOR: Record<string, string> = { "Mercado Livre": "03007331000141", "Shopee": "35635824000112", "Magalu": "47960950000121" };

export const PADRAO_FISCAL = {
  ambiente: "homologacao" as Amb, cnpj: "65193225000157", uf: "SC", serie: "2", natureza: "Venda de Mercadoria - NAO CONTRIBUINTE",
  natureza_contribuinte: "Venda de Mercadoria - CONTRIBUINTE", cfop_interno: "5102", cfop_interestadual: "6108", cfop_interestadual_contribuinte: "6102",
  cst_icms: "00", aliq_icms_interna: 17, cst_pis: "01", aliq_pis: 0.65, cst_cofins: "01", aliq_cofins: 3, modalidade_frete: 0, difal: true, origem_padrao: 5,
  presenca: 9, forma_pagamento: "20", ibpt_federal: 17.1, ibpt_estadual: 17, texto_difal: true, texto_adicional: "",
  // PIS/COFINS sem o ICMS na base (tese do século, como o Bling faz) e Reforma Tributária (LC 214/2025, ano-teste 2026).
  pis_exclui_icms: true, ibs_cst: "000", ibs_cclass: "000001", aliq_cbs: 0.9, aliq_ibs_uf: 0.1, aliq_ibs_mun: 0,
};
// Regras por UF (alíquota interna do destino, FCP e DIFAL) e intermediadores (CNPJ + identificador da loja).
export type Fiscal = typeof PADRAO_FISCAL & { aliquotas?: Record<string, number>; por_uf?: Record<string, { interna?: number; fcp?: number; difal?: boolean; inter?: number }>; intermediadores?: Record<string, { cnpj?: string; id?: string }> };
const FCP_PADRAO: Record<string, number> = { AL: 1, RJ: 2 };
// Res. SF 13/2012: origem 1, 2, 3 e 8 (conteúdo importado > 40%) têm ICMS interestadual de 4%.
const IMPORTADO = new Set([1, 2, 3, 8]);
export function aliqInterestadual(ufDest: string, origem: number, cfg?: Fiscal) {
  const f = cfg?.por_uf?.[ufDest]?.inter;
  if (IMPORTADO.has(Number(origem))) return 4;
  if (f) return f;
  return INTER_7.has(ufDest) ? 7 : 12;
}

export async function configFiscal(db: SupabaseClient, ws: string): Promise<Fiscal> {
  const { data } = await db.from("workspace_settings").select("data").eq("workspace_id", ws).maybeSingle();
  const cfg: Fiscal = { ...PADRAO_FISCAL, ...(data?.data?.gerencial?.fiscal ?? {}) };
  // Sem valor salvo pela contabilidade, usa o que o Bling pratica hoje (lido das notas autorizadas).
  const { data: bl } = await db.from("integrations").select("settings").eq("workspace_id", ws).eq("provider", "bling").maybeSingle();
  const rb = bl?.settings?.regras_fiscais;
  if (rb) {
    cfg.intermediadores = { ...(cfg.intermediadores ?? {}) };
    for (const [plat, cnpj] of Object.entries(INTERMEDIADOR)) {
      const atual = cfg.intermediadores[plat] ?? {};
      if (!atual.id && rb.intermediadores?.[cnpj]) cfg.intermediadores[plat] = { cnpj, id: rb.intermediadores[cnpj] };
    }
    cfg.por_uf = { ...(cfg.por_uf ?? {}) };
    for (const [uf, r] of Object.entries(rb.por_uf ?? {}) as [string, any][]) {
      const atual = cfg.por_uf[uf] ?? {};
      cfg.por_uf[uf] = { ...atual, interna: atual.interna ?? (r.pICMSUFDest != null ? Number(r.pICMSUFDest) : undefined), fcp: atual.fcp ?? (r.pFCPUFDest != null ? Number(r.pFCPUFDest) : undefined) };
    }
  }
  return cfg;
}

export function statusFiscal(cfg: Fiscal) {
  return { ambiente: cfg.ambiente, token_homologacao: !!token("homologacao"), token_producao: !!token("producao") };
}

const dig = (s: unknown) => String(s ?? "").replace(/\D/g, "");

/** Monta o JSON da NF-e (layout Focus v2) a partir do pedido. */
async function montar(db: SupabaseClient, ws: string, cfg: Fiscal, pedido: any) {
  const itens = (pedido.items ?? []) as any[];
  if (!itens.length) throw new HttpError(400, "Pedido sem itens.");
  // Endereço do comprador: contato do Bling.
  const cli = pedido.customer ?? {};
  let end: any = null;
  if (cli.id) {
    const sec = await validSecret(db, ws, "bling");
    await sleep(350);
    const c = await fetchJson(`${Deno.env.get("BLING_API_BASE") || "https://api.bling.com.br/Api/v3"}/contatos/${cli.id}`, { headers: { Authorization: `Bearer ${sec.access_token}`, Accept: "application/json" } }).catch(() => null);
    end = c?.data?.endereco?.geral ?? c?.data?.endereco ?? null;
  }
  const uf = String(end?.uf || cli.state || pedido.state || "").toUpperCase();
  if (!uf || !end?.endereco || !end?.municipio || !dig(end?.cep)) throw new HttpError(400, "Endereço do comprador incompleto no Bling (rua, município, CEP e UF são obrigatórios na NF-e).");
  return corpoNota(db, ws, cfg, {
    itens: itens.map((i) => ({ sku: i.sku, title: i.title, qty: i.qty, price: i.price })), gross: Number(pedido.gross), nome: cli.name, doc: cli.doc, ie: null,
    end: { logradouro: end.endereco, numero: end.numero, complemento: end.complemento, bairro: end.bairro, municipio: end.municipio, uf, cep: end.cep }, platform: pedido.platform,
  });
}

export interface DadosNota {
  itens: { sku: string; title?: string; qty: number; price: number }[]; gross: number; nome: string; doc: string; ie?: string | null;
  end: { logradouro: string; numero?: string; complemento?: string; bairro?: string; municipio: string; uf: string; cep: string };
  platform?: string; frete?: number; desconto?: number; presenca?: number; forma_pagamento?: string; email?: string;
  duplicatas?: { numero: string; vencimento: string; valor: number }[];
}
/** Corpo da NF-e (layout Focus v2) a partir de dados já normalizados — pedido de marketplace ou venda direta. */
async function corpoNota(db: SupabaseClient, ws: string, cfg: Fiscal, d: DadosNota) {
  const itens = d.itens, uf = String(d.end.uf).toUpperCase(), end = d.end;
  if (!uf || !end.logradouro || !end.municipio || !dig(end.cep)) throw new HttpError(400, "Endereço do destinatário incompleto (rua, município, CEP e UF são obrigatórios na NF-e).");
  const skus = itens.map((i) => String(i.sku ?? "").trim()).filter(Boolean);
  const { data: prods } = await db.from("produtos").select("id,nome,ncm,origem,cest,gtin").eq("workspace_id", ws).in("id", skus.length ? skus : ["-"]);
  const P = new Map((prods ?? []).map((p) => [p.id, p]));
  const semNcm = skus.filter((s) => !P.get(s)?.ncm);
  if (semNcm.length) throw new HttpError(400, `Produto(s) sem NCM: ${semNcm.join(", ")}. Leia os dados fiscais do Bling (Estoque › Atualizar) ou cadastre o NCM.`);
  const interno = uf === cfg.uf, regraUF = cfg.por_uf?.[uf] ?? {};
  const aliqDest = regraUF.interna ?? (cfg.aliquotas ?? {})[uf] ?? ALIQ_INTERNA[uf] ?? 18, fcpDest = regraUF.fcp ?? FCP_PADRAO[uf] ?? 0;
  const difalUF = regraUF.difal ?? cfg.difal;
  let difalTotal = 0, tributosAprox = 0;
  const homolog = cfg.ambiente === "homologacao";
  const soma = round(itens.reduce((s, i) => s + Number(i.qty) * Number(i.price), 0));
  const frete = round(d.frete != null ? Number(d.frete) : Math.max(0, Number(d.gross) - soma)), desconto = round(Number(d.desconto) || 0);
  const doc = dig(d.doc), ie = dig(d.ie);
  // Contribuinte = CNPJ com inscrição estadual: CFOP de revenda, sem DIFAL (o destinatário recolhe), não é consumidor final.
  const contribuinte = doc.length === 14 && ie.length > 0;
  const items = itens.map((i, n) => {
    const p = P.get(String(i.sku).trim())!, q = Number(i.qty), vu = round(Number(i.price)), vb = round(q * vu);
    // Frete rateado no item (entra na base do ICMS).
    const fr = frete && soma ? round(frete * vb / soma) : 0, ds = desconto && soma ? round(desconto * vb / soma) : 0, base = round(vb + fr - ds);
    const orig = Number(p.origem ?? cfg.origem_padrao), inter = interno ? cfg.aliq_icms_interna : aliqInterestadual(uf, orig, cfg);
    tributosAprox += base * (cfg.ibpt_federal + cfg.ibpt_estadual) / 100;
    // Cálculo idêntico ao do Bling (conferido ao centavo em 5 notas): ICMS → DIFAL/FCP → PIS/COFINS sem ICMS → IBS/CBS sem PIS/COFINS.
    const vIcms = round(base * inter / 100);
    const temDifal = !interno && difalUF && !contribuinte;
    const vDifal = temDifal ? round(base * Math.max(0, aliqDest - inter) / 100) : 0, vFcp = temDifal ? round(base * fcpDest / 100) : 0;
    const basePis = round(cfg.pis_exclui_icms ? base - vIcms - vDifal - vFcp : base);
    const vPis = round(basePis * cfg.aliq_pis / 100), vCofins = round(basePis * cfg.aliq_cofins / 100);
    const baseIbs = round(basePis - vPis - vCofins), vCbs = round(baseIbs * cfg.aliq_cbs / 100), vIbsUf = round(baseIbs * cfg.aliq_ibs_uf / 100), vIbsMun = round(baseIbs * cfg.aliq_ibs_mun / 100);
    const it: Record<string, unknown> = {
      numero_item: n + 1, codigo_produto: i.sku, descricao: n === 0 && homolog ? "NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL" : String(i.title ?? p.nome).slice(0, 120),
      cfop: interno ? cfg.cfop_interno : (contribuinte ? cfg.cfop_interestadual_contribuinte : cfg.cfop_interestadual), codigo_ncm: p.ncm, ...(p.cest ? { cest: p.cest } : {}),
      codigo_barras_comercial: p.gtin || "SEM GTIN", codigo_barras_tributavel: p.gtin || "SEM GTIN",
      unidade_comercial: "UN", quantidade_comercial: q, valor_unitario_comercial: vu, unidade_tributavel: "UN", quantidade_tributavel: q, valor_unitario_tributavel: vu,
      valor_bruto: vb, ...(fr ? { valor_frete: fr } : {}), ...(ds ? { valor_desconto: ds } : {}), inclui_no_total: 1,
      icms_origem: orig, icms_situacao_tributaria: cfg.cst_icms,
      icms_modalidade_base_calculo: 3, icms_base_calculo: base, icms_aliquota: inter, icms_valor: vIcms,
      pis_situacao_tributaria: cfg.cst_pis, pis_base_calculo: basePis, pis_aliquota_porcentual: cfg.aliq_pis, pis_valor: vPis,
      cofins_situacao_tributaria: cfg.cst_cofins, cofins_base_calculo: basePis, cofins_aliquota_porcentual: cfg.aliq_cofins, cofins_valor: vCofins,
      ibs_cbs_situacao_tributaria: cfg.ibs_cst, ibs_cbs_classificacao_tributaria: cfg.ibs_cclass, ibs_cbs_base_calculo: baseIbs,
      ibs_uf_aliquota: cfg.aliq_ibs_uf, ibs_uf_valor: vIbsUf, ibs_mun_aliquota: cfg.aliq_ibs_mun, ibs_mun_valor: vIbsMun, ibs_valor_total: round(vIbsUf + vIbsMun),
      cbs_aliquota: cfg.aliq_cbs, cbs_valor: vCbs,
    };
    // DIFAL (EC 87/2015 e LC 190/2022): venda interestadual a consumidor final não contribuinte — 100% para o destino.
    if (temDifal) {
      difalTotal += vDifal + vFcp;
      Object.assign(it, {
        icms_base_calculo_uf_destino: base, icms_aliquota_interna_uf_destino: aliqDest, icms_aliquota_interestadual: inter,
        icms_percentual_partilha: 100, icms_valor_uf_destino: vDifal, icms_valor_uf_remetente: 0,
        ...(fcpDest ? { fcp_base_calculo_uf_destino: base, fcp_percentual_uf_destino: fcpDest, fcp_valor_uf_destino: vFcp } : {}),
      });
    }
    return it;
  });
  const plat = d.platform ?? "", intermed = cfg.intermediadores?.[plat] ?? {}, cnpjInt = dig(intermed.cnpj || INTERMEDIADOR[plat] || "");
  const idInt = String(intermed.id ?? "").trim();
  if (cnpjInt && !idInt) throw new HttpError(400, `Informe o identificador da loja no intermediador (${plat}) na Parametrização fiscal.`);
  const total = round(soma + frete - desconto), dup = d.duplicatas ?? [];
  const aPrazo = dup.some((x) => x.vencimento > new Date().toISOString().slice(0, 10));
  const obs = [cfg.texto_difal && difalTotal ? `Valor do ICMS DIFAL para UF de destino R$ ${difalTotal.toFixed(2).replace(".", ",")}` : "",
    `Total aproximado de tributos: R$ ${tributosAprox.toFixed(2).replace(".", ",")} (${(cfg.ibpt_federal + cfg.ibpt_estadual).toFixed(2).replace(".", ",")}%) - Federais ${String(cfg.ibpt_federal).replace(".", ",")}% Estaduais ${String(cfg.ibpt_estadual).replace(".", ",")}%. Fonte IBPT.`,
    cfg.texto_adicional || ""].filter(Boolean).join(" | ");
  return {
    natureza_operacao: contribuinte ? cfg.natureza_contribuinte : cfg.natureza, data_emissao: new Date().toISOString(), tipo_documento: 1, finalidade_emissao: 1,
    local_destino: interno ? 1 : 2, consumidor_final: contribuinte ? 0 : 1, presenca_comprador: Number(d.presenca ?? cfg.presenca), modalidade_frete: Number(cfg.modalidade_frete),
    cnpj_emitente: dig(cfg.cnpj), serie: cfg.serie,
    nome_destinatario: homolog ? "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL" : String(d.nome ?? "").slice(0, 60),
    ...(doc.length === 14 ? { cnpj_destinatario: doc } : { cpf_destinatario: doc }),
    indicador_inscricao_estadual_destinatario: contribuinte ? 1 : 9, ...(contribuinte ? { inscricao_estadual_destinatario: ie } : {}), ...(d.email ? { email_destinatario: d.email } : {}),
    logradouro_destinatario: String(end.logradouro).slice(0, 60), numero_destinatario: String(end.numero || "S/N").slice(0, 60),
    ...(end.complemento ? { complemento_destinatario: String(end.complemento).slice(0, 60) } : {}), bairro_destinatario: String(end.bairro || "Centro").slice(0, 60),
    municipio_destinatario: end.municipio, uf_destinatario: uf, cep_destinatario: dig(end.cep), pais_destinatario: "Brasil",
    ...(cnpjInt ? { indicador_intermediario: 1, cnpj_intermediario: cnpjInt, id_intermediario: idInt.slice(0, 60) } : { indicador_intermediario: 0 }),
    informacoes_adicionais_contribuinte: obs.slice(0, 2000),
    ...(frete ? { valor_frete: frete } : {}), ...(desconto ? { valor_desconto: desconto } : {}),
    formas_pagamento: [{ indicador_pagamento: aPrazo ? 1 : 0, forma_pagamento: String(d.forma_pagamento ?? cfg.forma_pagamento), valor_pagamento: total }],
    ...(dup.length ? { numero_fatura: "1", valor_original_fatura: total, valor_desconto_fatura: 0, valor_liquido_fatura: total, duplicatas: dup.map((x) => ({ numero: x.numero, data_vencimento: x.vencimento, valor: round(x.valor) })) } : {}),
    items,
  };
}

export async function focus(a: Amb, method: string, path: string, body?: unknown) {
  if (!token(a)) throw new HttpError(400, `Token do Focus NFe (${a}) ainda não foi gravado no servidor.`);
  const r = await fetch(BASE[a] + path, { method, headers: { ...auth(a), ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j: any = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, j };
}
const urls = (a: Amb, j: any) => ({ danfe_url: j?.caminho_danfe ? BASE[a] + j.caminho_danfe : null, xml_url: j?.caminho_xml_nota_fiscal ? BASE[a] + j.caminho_xml_nota_fiscal : null });

export async function emitirNFe(db: SupabaseClient, ws: string, pedidoId: string, quem: string, confirmaProducao = false) {
  const cfg = await configFiscal(db, ws);
  if (cfg.ambiente === "producao" && !confirmaProducao) throw new HttpError(400, "Emissão em produção precisa de confirmação.");
  const { data: pedido } = await db.from("orders").select("*").eq("workspace_id", ws).eq("id", pedidoId).maybeSingle();
  if (!pedido) throw new HttpError(404, "Pedido não encontrado.");
  const { data: ja } = await db.from("notas_fiscais").select("ref,status").eq("workspace_id", ws).eq("pedido", pedidoId).eq("ambiente", cfg.ambiente);
  if ((ja ?? []).some((n) => ["autorizado", "processando_autorizacao", "processando"].includes(n.status))) throw new HttpError(400, "Este pedido já tem nota autorizada ou em processamento neste ambiente.");
  const payload = await montar(db, ws, cfg, pedido);
  const ref = `EB${cfg.ambiente === "producao" ? "P" : "H"}-${String(pedidoId).replace(/[^A-Za-z0-9]/g, "")}-${(ja ?? []).length + 1}`;
  const r = await focus(cfg.ambiente, "POST", `/v2/nfe?ref=${encodeURIComponent(ref)}`, payload);
  const row = {
    workspace_id: ws, ref, pedido: pedidoId, ambiente: cfg.ambiente, status: r.ok ? (r.j.status ?? "processando_autorizacao") : "erro",
    mensagem: r.ok ? (r.j.mensagem_sefaz ?? null) : `${r.j.codigo ?? r.status}: ${r.j.mensagem ?? ""}${(r.j.erros ?? []).map((e: any) => ` · ${e.campo ?? ""} ${e.mensagem ?? ""}`).join("")}`.slice(0, 1000),
    valor: round(Number(pedido.gross)), payload, resposta: r.j, criado_por: quem, updated_at: new Date().toISOString(),
  };
  await db.from("notas_fiscais").upsert(row, { onConflict: "workspace_id,ref" });
  return { ref, status: row.status, mensagem: row.mensagem };
}

export async function consultarNFe(db: SupabaseClient, ws: string, ref: string) {
  const { data: n } = await db.from("notas_fiscais").select("*").eq("workspace_id", ws).eq("ref", ref).maybeSingle();
  if (!n) throw new HttpError(404, "Nota não encontrada.");
  const r = await focus(n.ambiente, "GET", `/v2/nfe/${encodeURIComponent(ref)}?completa=0`);
  if (!r.ok) return { ref, status: n.status, mensagem: r.j?.mensagem ?? `Focus respondeu ${r.status}` };
  const upd = { status: r.j.status ?? n.status, numero: r.j.numero ?? null, serie: r.j.serie ?? null, chave: r.j.chave_nfe ?? null, mensagem: r.j.mensagem_sefaz ?? null, ...urls(n.ambiente, r.j), resposta: r.j, updated_at: new Date().toISOString() };
  await db.from("notas_fiscais").update(upd).eq("workspace_id", ws).eq("ref", ref);
  return { ref, ...upd, resposta: undefined };
}

export async function cancelarNFe(db: SupabaseClient, ws: string, ref: string, justificativa: string) {
  justificativa = justificativa.trim();
  if (justificativa.length < 15) throw new HttpError(400, "A justificativa do cancelamento precisa de pelo menos 15 caracteres.");
  const { data: n } = await db.from("notas_fiscais").select("*").eq("workspace_id", ws).eq("ref", ref).maybeSingle();
  if (!n) throw new HttpError(404, "Nota não encontrada.");
  const r = await focus(n.ambiente, "DELETE", `/v2/nfe/${encodeURIComponent(ref)}`, { justificativa });
  const status = r.ok ? (r.j.status ?? "cancelado") : n.status;
  await db.from("notas_fiscais").update({ status, mensagem: r.j?.mensagem_sefaz ?? r.j?.mensagem ?? null, updated_at: new Date().toISOString() }).eq("workspace_id", ws).eq("ref", ref);
  if (!r.ok) throw new HttpError(400, `Cancelamento recusado: ${r.j?.mensagem ?? r.status}`);
  return { ref, status };
}

/** Diagnóstico: para qual ambiente cada token gravado vale (consulta uma referência inexistente: 404 = token válido). */
export async function diagnosticoFiscal() {
  const out: Record<string, unknown> = {};
  for (const [nome, tk] of [["FOCUS_NFE_TOKEN_HOMOLOGACAO", Deno.env.get("FOCUS_NFE_TOKEN_HOMOLOGACAO")], ["FOCUS_NFE_TOKEN", Deno.env.get("FOCUS_NFE_TOKEN")]] as const) {
    if (!tk) { out[nome] = "não gravado"; continue; }
    const r: Record<string, number> = {};
    for (const [amb, base] of Object.entries(BASE)) {
      const x = await fetch(`${base}/v2/nfe/EB-DIAGNOSTICO-INEXISTENTE`, { headers: { Authorization: "Basic " + btoa(`${tk}:`) } }).catch(() => null);
      r[amb] = x?.status ?? 0;
      await x?.body?.cancel();
    }
    out[nome] = r;
  }
  return out;
}
/** Emissão de teste pedida pelo suporte (fila em integrations.settings.fiscal_fila do Bling). Só homologação. */
export async function processarFilaFiscal(db: SupabaseClient, ws: string, fila: string[]) {
  const cfg = await configFiscal(db, ws);
  if (cfg.ambiente !== "homologacao") return { pulado: "fila só roda em homologação" };
  const res: Record<string, unknown>[] = [];
  for (const pedido of fila.slice(0, 6)) {
    try {
      const r = pedido.startsWith("VD:") ? await emitirVendaDireta(db, ws, pedido.slice(3), "Teste automático (homologação)") : await emitirNFe(db, ws, pedido, "Teste automático (homologação)");
      if (r.status !== "erro") { await sleep(6000); res.push({ pedido, ...(await consultarNFe(db, ws, r.ref)) }); }
      else res.push({ pedido, ...r });
    } catch (e) { res.push({ pedido, erro: String((e as Error).message ?? e) }); }
  }
  return res;
}

/** Emissão da nota de uma venda direta (B2B/atacado). Mesmas regras da parametrização; destinatário e parcelas da venda. */
export async function emitirVendaDireta(db: SupabaseClient, ws: string, vendaId: string, quem: string, confirmaProducao = false) {
  const cfg = await configFiscal(db, ws);
  if (cfg.ambiente === "producao" && !confirmaProducao) throw new HttpError(400, "Emissão em produção precisa de confirmação.");
  const { data: v } = await db.from("vendas_diretas").select("*").eq("workspace_id", ws).eq("id", vendaId).maybeSingle();
  if (!v) throw new HttpError(404, "Venda não encontrada.");
  const { data: ja } = await db.from("notas_fiscais").select("ref,status").eq("workspace_id", ws).eq("pedido", vendaId).eq("ambiente", cfg.ambiente);
  if ((ja ?? []).some((n) => ["autorizado", "processando_autorizacao", "processando"].includes(n.status))) throw new HttpError(400, "Esta venda já tem nota autorizada ou em processamento neste ambiente.");
  const c = v.cliente ?? {}, e = c.endereco ?? {};
  const payload = await corpoNota(db, ws, cfg, {
    itens: (v.itens ?? []).map((i: any) => ({ sku: i.sku, title: i.nome, qty: Number(i.qtd), price: Number(i.preco) })), gross: Number(v.total), nome: c.nome, doc: c.doc, ie: c.ie, email: c.email,
    end: { logradouro: e.logradouro, numero: e.numero, complemento: e.complemento, bairro: e.bairro, municipio: e.municipio, uf: e.uf, cep: e.cep },
    frete: Number(v.frete) || 0, desconto: Number(v.desconto) || 0, presenca: 9, forma_pagamento: v.forma_pagamento || "15",
    duplicatas: (v.parcelas ?? []).map((p: any, k: number) => ({ numero: String(k + 1).padStart(3, "0"), vencimento: p.vencimento, valor: Number(p.valor) })),
  });
  const ref = `EBV${cfg.ambiente === "producao" ? "P" : "H"}-${v.numero ?? vendaId.replace(/[^A-Za-z0-9]/g, "")}-${(ja ?? []).length + 1}`;
  const r = await focus(cfg.ambiente, "POST", `/v2/nfe?ref=${encodeURIComponent(ref)}`, payload);
  const row = {
    workspace_id: ws, ref, pedido: vendaId, ambiente: cfg.ambiente, status: r.ok ? (r.j.status ?? "processando_autorizacao") : "erro",
    mensagem: r.ok ? (r.j.mensagem_sefaz ?? null) : `${r.j.codigo ?? r.status}: ${r.j.mensagem ?? ""}${(r.j.erros ?? []).map((x: any) => ` · ${x.campo ?? ""} ${x.mensagem ?? ""}`).join("")}`.slice(0, 1000),
    valor: Number(v.total), payload, resposta: r.j, criado_por: quem, updated_at: new Date().toISOString(),
  };
  await db.from("notas_fiscais").upsert(row, { onConflict: "workspace_id,ref" });
  await db.from("vendas_diretas").update({ nfe_ref: ref, updated_at: new Date().toISOString() }).eq("workspace_id", ws).eq("id", vendaId);
  return { ref, status: row.status, mensagem: row.mensagem };
}

// ── Tela de emissão (Fiscal › Emitir NF-e) ──
/** Calcula a nota SEM emitir: mesmo motor da emissão (CFOP, ICMS, DIFAL/FCP, PIS/COFINS, IBS/CBS). De um pedido ou de dados avulsos. */
export async function simularNota(db: SupabaseClient, ws: string, d: { pedido?: string; dados?: DadosNota }) {
  const cfg = await configFiscal(db, ws);
  let payload: any, origem: any = null;
  if (d.pedido) {
    const { data: pedido } = await db.from("orders").select("*").eq("workspace_id", ws).eq("id", d.pedido).maybeSingle();
    if (!pedido) throw new HttpError(404, "Pedido não encontrado.");
    payload = await montar(db, ws, cfg, pedido);
    origem = { pedido: pedido.id, canal: pedido.platform, data: pedido.date, cliente: pedido.customer?.name ?? null };
  } else if (d.dados) payload = await corpoNota(db, ws, cfg, d.dados);
  else throw new HttpError(400, "Informe o pedido ou os dados da nota.");
  return { ambiente: cfg.ambiente, emitente: { cnpj: cfg.cnpj, uf: cfg.uf }, origem, payload };
}

/** Nota avulsa (fora de pedido de marketplace e de venda direta): destinatário, itens e pagamento digitados na tela. */
export async function emitirAvulsa(db: SupabaseClient, ws: string, d: DadosNota, quem: string, confirmaProducao = false) {
  const cfg = await configFiscal(db, ws);
  if (cfg.ambiente === "producao" && !confirmaProducao) throw new HttpError(400, "Emissão em produção precisa de confirmação.");
  const payload = await corpoNota(db, ws, cfg, d);
  const ref = `EBA${cfg.ambiente === "producao" ? "P" : "H"}-${Date.now().toString(36).toUpperCase()}`;
  const total = round(d.itens.reduce((s, i) => s + Number(i.qty) * Number(i.price), 0) + (Number(d.frete) || 0) - (Number(d.desconto) || 0));
  const r = await focus(cfg.ambiente, "POST", `/v2/nfe?ref=${encodeURIComponent(ref)}`, payload);
  const row = {
    workspace_id: ws, ref, pedido: `AVULSA ${String(d.nome ?? "").slice(0, 40)}`, ambiente: cfg.ambiente, status: r.ok ? (r.j.status ?? "processando_autorizacao") : "erro",
    mensagem: r.ok ? (r.j.mensagem_sefaz ?? null) : `${r.j.codigo ?? r.status}: ${r.j.mensagem ?? ""}${(r.j.erros ?? []).map((x: any) => ` · ${x.campo ?? ""} ${x.mensagem ?? ""}`).join("")}`.slice(0, 1000),
    valor: total, payload, resposta: r.j, criado_por: quem, updated_at: new Date().toISOString(),
  };
  await db.from("notas_fiscais").upsert(row, { onConflict: "workspace_id,ref" });
  return { ref, status: row.status, mensagem: row.mensagem };
}

/** Carta de correção eletrônica (CC-e): corrige dados que não mudam valor, imposto, destinatário ou data. */
export async function cartaCorrecao(db: SupabaseClient, ws: string, ref: string, texto: string) {
  texto = texto.trim();
  if (texto.length < 15 || texto.length > 1000) throw new HttpError(400, "A correção precisa ter entre 15 e 1.000 caracteres.");
  const { data: n } = await db.from("notas_fiscais").select("*").eq("workspace_id", ws).eq("ref", ref).maybeSingle();
  if (!n) throw new HttpError(404, "Nota não encontrada.");
  if (n.status !== "autorizado") throw new HttpError(400, "Carta de correção só vale para nota autorizada.");
  const r = await focus(n.ambiente, "POST", `/v2/nfe/${encodeURIComponent(ref)}/carta_correcao`, { correcao: texto });
  if (!r.ok) throw new HttpError(400, `Carta de correção recusada: ${r.j?.mensagem ?? r.status}`);
  const cces = [...((n.resposta?.cartas_correcao as any[]) ?? []), { em: new Date().toISOString(), texto, status: r.j?.status_sefaz ?? r.j?.status ?? null, mensagem: r.j?.mensagem_sefaz ?? null, pdf: r.j?.caminho_pdf_carta_correcao ? BASE[n.ambiente as Amb] + r.j.caminho_pdf_carta_correcao : null }];
  await db.from("notas_fiscais").update({ resposta: { ...(n.resposta ?? {}), cartas_correcao: cces }, updated_at: new Date().toISOString() }).eq("workspace_id", ws).eq("ref", ref);
  return { ref, ...cces[cces.length - 1] };
}
