// Notas de devolução (cliente devolveu) e de estorno (venda desfeita depois do prazo de cancelamento) preparadas pelo
// Jarvis a partir da NF-e de venda original: o XML da nota que o Bling emitiu (ou a nota emitida pelo próprio Jarvis).
// Mesmos produtos, valores e tributos na proporção devolvida, com a nota original referenciada. As escolhas que a
// contabilidade já usa (natureza, CFOP, CST de PIS/COFINS, presença, DIFAL) são copiadas da última nota de devolução
// emitida no Bling, quando houver. Preparar não envia nada à SEFAZ; emitir segue o ambiente da parametrização fiscal
// (produção só com confirmação explícita).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { HttpError, round, sleep } from "./common.ts";
import { validSecret } from "./store.ts";
import { configFiscal, consultarNFe, focus } from "./nfe_focus.ts";
import { enviarMovimentosBling } from "./expedicao_bling.ts";

const API = () => Deno.env.get("BLING_API_BASE") || "https://api.bling.com.br/Api/v3";
const tag = (x: string, t: string) => x.match(new RegExp(`<${t}>([^<]*)</${t}>`))?.[1] ?? null;
const bloco = (x: string, t: string) => x.match(new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)</${t}>`))?.[1] ?? "";
const n = (v: string | null | undefined) => (v == null || v === "" ? 0 : Number(v));
const dig = (s: unknown) => String(s ?? "").replace(/\D/g, "");
const xmlDec = (s: string | null) => (s ?? "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

export interface ItemNota {
  n: number; sku: string; nome: string; ncm: string | null; cest: string | null; cfop: string | null; ean: string | null; un: string;
  q: number; vu: number; vProd: number; vFrete: number; vDesc: number;
  orig: string | null; cst: string | null; vBC: number; pICMS: number; vICMS: number;
  difal: null | { vBC: number; pFCP: number; pInt: number; pInter: number; vFCP: number; vDest: number };
  pis: { cst: string | null; vBC: number; p: number; v: number }; cofins: { cst: string | null; vBC: number; p: number; v: number };
  ibs: null | { cst: string | null; cClass: string | null; vBC: number; pUF: number; pMun: number; pCBS: number };
}
export interface NotaOrig {
  fonte: "bling" | "jarvis"; chave: string; numero: string; serie: string; emissao: string; natOp: string | null; finNFe: string | null;
  idDest: string | null; indFinal: string | null; indPres: string | null; modFrete: string | null; infCpl: string | null;
  dest: { nome: string; doc: string; ie: string; indIEDest: string | null; email: string | null; end: Record<string, string> };
  itens: ItemNota[];
}

export function lerNotaXml(xml: string): NotaOrig {
  const inf = xml.match(/<infNFe[^>]*Id="NFe(\d{44})"/), ide = bloco(xml, "ide"), dest = bloco(xml, "dest"), ed = bloco(dest, "enderDest");
  const dets = [...xml.matchAll(/<det nItem="(\d+)">([\s\S]*?)<\/det>/g)];
  const itens = dets.map(([, nItem, d]) => {
    const prod = bloco(d, "prod"), imp = bloco(d, "imposto"), icms = bloco(imp, "ICMS"), dif = bloco(imp, "ICMSUFDest"), pis = bloco(imp, "PIS"), cof = bloco(imp, "COFINS"), ibs = bloco(imp, "IBSCBS");
    return {
      n: Number(nItem), sku: xmlDec(tag(prod, "cProd")), nome: xmlDec(tag(prod, "xProd")), ncm: tag(prod, "NCM"), cest: tag(prod, "CEST"), cfop: tag(prod, "CFOP"), ean: tag(prod, "cEAN"), un: tag(prod, "uCom") ?? "UN",
      q: n(tag(prod, "qCom")), vu: n(tag(prod, "vUnCom")), vProd: n(tag(prod, "vProd")), vFrete: n(tag(prod, "vFrete")), vDesc: n(tag(prod, "vDesc")),
      orig: tag(icms, "orig"), cst: tag(icms, "CST") ?? tag(icms, "CSOSN"), vBC: n(tag(icms, "vBC")), pICMS: n(tag(icms, "pICMS")), vICMS: n(tag(icms, "vICMS")),
      difal: dif ? { vBC: n(tag(dif, "vBCUFDest")), pFCP: n(tag(dif, "pFCPUFDest")), pInt: n(tag(dif, "pICMSUFDest")), pInter: n(tag(dif, "pICMSInter")), vFCP: n(tag(dif, "vFCPUFDest")), vDest: n(tag(dif, "vICMSUFDest")) } : null,
      pis: { cst: tag(pis, "CST"), vBC: n(tag(pis, "vBC")), p: n(tag(pis, "pPIS")), v: n(tag(pis, "vPIS")) },
      cofins: { cst: tag(cof, "CST"), vBC: n(tag(cof, "vBC")), p: n(tag(cof, "pCOFINS")), v: n(tag(cof, "vCOFINS")) },
      ibs: ibs ? { cst: tag(ibs, "CST"), cClass: tag(ibs, "cClassTrib"), vBC: n(tag(ibs, "vBC")), pUF: n(tag(bloco(ibs, "gIBSUF"), "pIBSUF")), pMun: n(tag(bloco(ibs, "gIBSMun"), "pIBSMun")), pCBS: n(tag(bloco(ibs, "gCBS"), "pCBS")) } : null,
    } as ItemNota;
  });
  return {
    fonte: "bling", chave: inf?.[1] ?? "", numero: tag(ide, "nNF") ?? "", serie: tag(ide, "serie") ?? "", emissao: String(tag(ide, "dhEmi") ?? "").slice(0, 10),
    natOp: xmlDec(tag(ide, "natOp")), finNFe: tag(ide, "finNFe"), idDest: tag(ide, "idDest"), indFinal: tag(ide, "indFinal"), indPres: tag(ide, "indPres"),
    modFrete: tag(bloco(xml, "transp"), "modFrete"), infCpl: xmlDec(tag(bloco(xml, "infAdic"), "infCpl")),
    dest: {
      nome: xmlDec(tag(dest, "xNome")) ?? "", doc: tag(dest, "CNPJ") ?? tag(dest, "CPF") ?? "", ie: tag(dest, "IE") ?? "", indIEDest: tag(dest, "indIEDest"), email: tag(dest, "email"),
      end: { logradouro: xmlDec(tag(ed, "xLgr")), numero: xmlDec(tag(ed, "nro")), complemento: xmlDec(tag(ed, "xCpl")), bairro: xmlDec(tag(ed, "xBairro")), municipio: xmlDec(tag(ed, "xMun")), uf: tag(ed, "UF") ?? "", cep: tag(ed, "CEP") ?? "" },
    },
    itens,
  };
}

async function blingGet(db: SupabaseClient, ws: string) {
  const sec = await validSecret(db, ws, "bling");
  return async (path: string) => {
    await sleep(350);
    const r = await fetch(`${API()}${path}`, { headers: { Authorization: `Bearer ${sec.access_token}`, Accept: "application/json" } });
    const j: any = await r.json().catch(() => null);
    if (!r.ok) throw new HttpError(502, `Bling ${r.status}: ${j?.error?.description ?? j?.error?.message ?? "erro"}`);
    return j;
  };
}
async function baixarXml(link: string) {
  const r = await fetch(link).catch(() => null);
  const x = r?.ok ? await r.text() : "";
  if (!x.includes("<infNFe")) throw new HttpError(502, "Não consegui baixar o XML da nota no Bling.");
  return x;
}

/** Nota de venda do pedido: primeiro a emitida pelo Jarvis; senão a do Bling (pedido → nota → XML). */
export async function notaDoPedido(db: SupabaseClient, ws: string, pedidoId: string): Promise<NotaOrig> {
  const { data: nj } = await db.from("notas_fiscais").select("*").eq("workspace_id", ws).eq("pedido", pedidoId).eq("ambiente", "producao").eq("status", "autorizado").order("created_at", { ascending: false }).limit(1);
  if (nj?.[0]?.payload && nj[0].chave) return deJarvis(nj[0]);
  const { data: o } = await db.from("orders").select("id,date,nf,external").eq("workspace_id", ws).eq("id", pedidoId).maybeSingle();
  if (!o) throw new HttpError(404, "Pedido não encontrado.");
  const blingId = o.external?.bling_id;
  if (!blingId) throw new HttpError(400, "Pedido sem vínculo com o Bling: não sei qual nota devolver.");
  const get = await blingGet(db, ws);
  const p = (await get(`/pedidos/vendas/${blingId}`))?.data;
  let nfeId = Number(p?.notaFiscal?.id) || 0;
  // A sincronização guarda em orders.nf o número da nota ou, sem ele, o id da nota no Bling (número longo).
  if (!nfeId && String(o.nf ?? "").replace(/D/g, "").length >= 9) nfeId = Number(String(o.nf).replace(/D/g, ""));
  // Sem o vínculo no pedido: procura a nota pelo número nos dias seguintes à venda.
  if (!nfeId && o.nf) {
    const alvo = String(o.nf).replace(/\D/g, "").replace(/^0+/, ""), ini = String(o.date).slice(0, 10);
    const fim = new Date(new Date(ini + "T12:00:00Z").getTime() + 15 * 864e5).toISOString().slice(0, 10);
    for (let pg = 1; pg <= 5 && !nfeId; pg++) {
      const l = (await get(`/nfe?${new URLSearchParams({ pagina: String(pg), limite: "100", tipo: "1", dataEmissaoInicial: `${ini} 00:00:00`, dataEmissaoFinal: `${fim} 23:59:59` })}`))?.data ?? [];
      nfeId = Number(l.find((x: any) => String(x.numero ?? "").replace(/^0+/, "") === alvo)?.id) || 0;
      if (l.length < 100) break;
    }
  }
  if (!nfeId) throw new HttpError(400, "Não achei a NF-e de venda deste pedido no Bling.");
  const d = (await get(`/nfe/${nfeId}`))?.data;
  if (![5, 6, 7].includes(Number(d?.situacao))) throw new HttpError(400, `A nota ${d?.numero ?? ""} não está autorizada no Bling (situação ${d?.situacao ?? "?"}).`);
  const link = d?.xml || d?.linkXML;
  if (!link) throw new HttpError(400, "O Bling não devolveu o link do XML da nota.");
  return lerNotaXml(await baixarXml(link));
}

function deJarvis(r: any): NotaOrig {
  const p = r.payload ?? {};
  return {
    fonte: "jarvis", chave: r.chave, numero: String(r.numero ?? ""), serie: String(r.serie ?? ""), emissao: String(r.created_at).slice(0, 10), natOp: p.natureza_operacao ?? null, finNFe: "1",
    idDest: String(p.local_destino ?? ""), indFinal: String(p.consumidor_final ?? ""), indPres: String(p.presenca_comprador ?? ""), modFrete: String(p.modalidade_frete ?? ""), infCpl: p.informacoes_adicionais_contribuinte ?? null,
    dest: { nome: p.nome_destinatario ?? "", doc: p.cnpj_destinatario ?? p.cpf_destinatario ?? "", ie: p.inscricao_estadual_destinatario ?? "", indIEDest: String(p.indicador_inscricao_estadual_destinatario ?? "9"), email: p.email_destinatario ?? null,
      end: { logradouro: p.logradouro_destinatario, numero: p.numero_destinatario, complemento: p.complemento_destinatario ?? "", bairro: p.bairro_destinatario, municipio: p.municipio_destinatario, uf: p.uf_destinatario, cep: p.cep_destinatario } },
    itens: (p.items ?? []).map((i: any) => ({
      n: i.numero_item, sku: String(i.codigo_produto), nome: i.descricao, ncm: i.codigo_ncm, cest: i.cest ?? null, cfop: String(i.cfop), ean: i.codigo_barras_comercial, un: i.unidade_comercial ?? "UN",
      q: Number(i.quantidade_comercial), vu: Number(i.valor_unitario_comercial), vProd: Number(i.valor_bruto), vFrete: Number(i.valor_frete ?? 0), vDesc: Number(i.valor_desconto ?? 0),
      orig: String(i.icms_origem), cst: String(i.icms_situacao_tributaria), vBC: Number(i.icms_base_calculo ?? 0), pICMS: Number(i.icms_aliquota ?? 0), vICMS: Number(i.icms_valor ?? 0),
      difal: i.icms_valor_uf_destino != null ? { vBC: Number(i.icms_base_calculo_uf_destino), pFCP: Number(i.fcp_percentual_uf_destino ?? 0), pInt: Number(i.icms_aliquota_interna_uf_destino), pInter: Number(i.icms_aliquota_interestadual), vFCP: Number(i.fcp_valor_uf_destino ?? 0), vDest: Number(i.icms_valor_uf_destino) } : null,
      pis: { cst: String(i.pis_situacao_tributaria), vBC: Number(i.pis_base_calculo ?? 0), p: Number(i.pis_aliquota_porcentual ?? 0), v: Number(i.pis_valor ?? 0) },
      cofins: { cst: String(i.cofins_situacao_tributaria), vBC: Number(i.cofins_base_calculo ?? 0), p: Number(i.cofins_aliquota_porcentual ?? 0), v: Number(i.cofins_valor ?? 0) },
      ibs: i.ibs_cbs_situacao_tributaria ? { cst: i.ibs_cbs_situacao_tributaria, cClass: i.ibs_cbs_classificacao_tributaria, vBC: Number(i.ibs_cbs_base_calculo ?? 0), pUF: Number(i.ibs_uf_aliquota ?? 0), pMun: Number(i.ibs_mun_aliquota ?? 0), pCBS: Number(i.cbs_aliquota ?? 0) } : null,
    })),
  };
}

/** Como a empresa já emite devolução no Bling (última nota de devolução de venda lida): natureza, CFOP, CSTs, DIFAL. */
export async function modeloDevolucao(db: SupabaseClient, ws: string) {
  const { data } = await db.from("purchase_invoices").select("id,numero,emissao,cfop,natureza").eq("workspace_id", ws).eq("tipo", "devolucao").like("id", "BLING-NFE-%").order("emissao", { ascending: false }).limit(3);
  for (const r of data ?? []) {
    try {
      const get = await blingGet(db, ws);
      const d = (await get(`/nfe/${String(r.id).replace("BLING-NFE-", "")}`))?.data;
      const link = d?.xml || d?.linkXML;
      if (!link) continue;
      const x = lerNotaXml(await baixarXml(link));
      const moda = (a: (string | null)[]) => { const c = new Map<string, number>(); for (const v of a) if (v) c.set(v, (c.get(v) ?? 0) + 1); return [...c].sort((p, q) => q[1] - p[1])[0]?.[0] ?? null; };
      return {
        nota: `${x.numero}/${x.serie}`, natOp: x.natOp, finNFe: x.finNFe, indPres: x.indPres, modFrete: x.modFrete, cfop: moda(x.itens.map((i) => i.cfop)),
        pis_cst: moda(x.itens.map((i) => i.pis.cst)), pis_zero: x.itens.every((i) => !i.pis.v), cofins_cst: moda(x.itens.map((i) => i.cofins.cst)), cofins_zero: x.itens.every((i) => !i.cofins.v),
        difal: x.itens.some((i) => i.difal), infCpl: x.infCpl?.slice(0, 300) ?? null,
      };
    } catch { /* tenta a próxima */ }
  }
  return null;
}

type Sel = { sku: string; qtd: number };
/** Monta o corpo da nota (formato Focus NFe) espelhando a original na proporção de cada item devolvido. */
export function montarDevolucao(cfg: any, orig: NotaOrig, sel: Sel[], tipo: "devolucao" | "estorno", motivo: string, modelo: any) {
  const ufEmit = String(cfg.uf ?? "SC"), ufDest = orig.dest.end.uf, interno = ufDest === ufEmit, homolog = cfg.ambiente === "homologacao";
  const usados = new Map<number, number>();
  const items: any[] = [], resumo: any[] = [];
  let totProd = 0, totFrete = 0, totDesc = 0, totDifal = 0;
  for (const s of sel) {
    let rest = Number(s.qtd);
    for (const it of orig.itens.filter((i) => i.sku === s.sku)) {
      if (rest <= 0) break;
      const livre = it.q - (usados.get(it.n) ?? 0); if (livre <= 0) continue;
      const q = Math.min(rest, livre); rest -= q; usados.set(it.n, (usados.get(it.n) ?? 0) + q);
      const f = q / it.q, pr = (v: number) => round(v * f);
      const vProd = round(q * it.vu), vFrete = pr(it.vFrete), vDesc = pr(it.vDesc), vBC = pr(it.vBC), vICMS = pr(it.vICMS);
      totProd += vProd; totFrete += vFrete; totDesc += vDesc;
      const cfop = tipo === "estorno" ? (interno ? "1949" : "2949") : (modelo?.cfop && modelo.cfop[0] === (interno ? "1" : "2") ? modelo.cfop : (interno ? "1202" : "2202"));
      const pisCst = modelo?.pis_cst ?? it.pis.cst, cofCst = modelo?.cofins_cst ?? it.cofins.cst, pisZ = !!modelo?.pis_zero, cofZ = !!modelo?.cofins_zero;
      const x: Record<string, unknown> = {
        numero_item: items.length + 1, codigo_produto: it.sku, descricao: items.length === 0 && homolog ? "NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL" : it.nome.slice(0, 120),
        cfop, codigo_ncm: it.ncm, ...(it.cest ? { cest: it.cest } : {}), codigo_barras_comercial: it.ean || "SEM GTIN", codigo_barras_tributavel: it.ean || "SEM GTIN",
        unidade_comercial: it.un, quantidade_comercial: q, valor_unitario_comercial: it.vu, unidade_tributavel: it.un, quantidade_tributavel: q, valor_unitario_tributavel: it.vu,
        valor_bruto: vProd, ...(vFrete ? { valor_frete: vFrete } : {}), ...(vDesc ? { valor_desconto: vDesc } : {}), inclui_no_total: 1,
        icms_origem: Number(it.orig ?? 0), icms_situacao_tributaria: it.cst, icms_modalidade_base_calculo: 3, icms_base_calculo: vBC, icms_aliquota: it.pICMS, icms_valor: vICMS,
        pis_situacao_tributaria: pisCst, pis_base_calculo: pisZ ? 0 : pr(it.pis.vBC), pis_aliquota_porcentual: pisZ ? 0 : it.pis.p, pis_valor: pisZ ? 0 : pr(it.pis.v),
        cofins_situacao_tributaria: cofCst, cofins_base_calculo: cofZ ? 0 : pr(it.cofins.vBC), cofins_aliquota_porcentual: cofZ ? 0 : it.cofins.p, cofins_valor: cofZ ? 0 : pr(it.cofins.v),
      };
      if (it.ibs) {
        const b = pr(it.ibs.vBC), vUF = round(b * it.ibs.pUF / 100), vMun = round(b * it.ibs.pMun / 100);
        Object.assign(x, { ibs_cbs_situacao_tributaria: it.ibs.cst, ibs_cbs_classificacao_tributaria: it.ibs.cClass, ibs_cbs_base_calculo: b, ibs_uf_aliquota: it.ibs.pUF, ibs_uf_valor: vUF, ibs_mun_aliquota: it.ibs.pMun, ibs_mun_valor: vMun, ibs_valor_total: round(vUF + vMun), cbs_aliquota: it.ibs.pCBS, cbs_valor: round(b * it.ibs.pCBS / 100) });
      }
      // DIFAL: repete o grupo da venda na proporção (se o modelo do Bling também repete, ou sem modelo).
      if (it.difal && (modelo == null || modelo.difal)) {
        const vD = pr(it.difal.vDest), vF = pr(it.difal.vFCP); totDifal += vD + vF;
        Object.assign(x, { icms_base_calculo_uf_destino: pr(it.difal.vBC), icms_aliquota_interna_uf_destino: it.difal.pInt, icms_aliquota_interestadual: it.difal.pInter, icms_percentual_partilha: 100, icms_valor_uf_destino: vD, icms_valor_uf_remetente: 0,
          ...(it.difal.pFCP ? { fcp_base_calculo_uf_destino: pr(it.difal.vBC), fcp_percentual_uf_destino: it.difal.pFCP, fcp_valor_uf_destino: vF } : {}) });
      }
      items.push(x); resumo.push({ sku: it.sku, nome: it.nome, qtd: q, valor: round(vProd + vFrete - vDesc), icms: vICMS });
    }
    if (rest > 0.0001) throw new HttpError(400, `SKU ${s.sku}: a nota original tem menos unidades do que o devolvido.`);
  }
  if (!items.length) throw new HttpError(400, "Escolha ao menos um item da nota para devolver.");
  const total = round(totProd + totFrete - totDesc), d = orig.dest, doc = dig(d.doc), contrib = d.indIEDest === "1";
  const dataBR = orig.emissao ? orig.emissao.split("-").reverse().join("/") : "";
  const texto = tipo === "estorno"
    ? `Estorno da NF-e ${orig.numero} série ${orig.serie} de ${dataBR}, chave ${orig.chave}, não cancelada no prazo legal: a mercadoria não saiu do estabelecimento.`
    : `Devolução referente à NF-e ${orig.numero} série ${orig.serie} de ${dataBR}, chave ${orig.chave}.`;
  const obs = [texto, motivo ? `Motivo: ${motivo}` : "", totDifal ? `ICMS DIFAL/FCP da venda original: R$ ${totDifal.toFixed(2).replace(".", ",")}` : ""].filter(Boolean).join(" ");
  const payload = {
    natureza_operacao: tipo === "estorno" ? "Estorno de NF-e nao cancelada no prazo legal" : (modelo?.natOp || "Devolucao de venda de mercadoria"),
    data_emissao: new Date().toISOString(), tipo_documento: 0, finalidade_emissao: tipo === "estorno" ? 1 : Number(modelo?.finNFe || 4),
    notas_referenciadas: [{ chave_nfe: orig.chave }],
    local_destino: interno ? 1 : 2, consumidor_final: Number(orig.indFinal ?? 1), presenca_comprador: Number(modelo?.indPres ?? 9), modalidade_frete: Number(modelo?.modFrete ?? 9),
    cnpj_emitente: dig(cfg.cnpj), serie: cfg.serie,
    nome_destinatario: homolog ? "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL" : d.nome.slice(0, 60),
    ...(doc.length === 14 ? { cnpj_destinatario: doc } : { cpf_destinatario: doc }),
    indicador_inscricao_estadual_destinatario: Number(d.indIEDest ?? 9), ...(contrib && d.ie ? { inscricao_estadual_destinatario: dig(d.ie) } : {}), ...(d.email ? { email_destinatario: d.email } : {}),
    logradouro_destinatario: String(d.end.logradouro ?? "").slice(0, 60), numero_destinatario: String(d.end.numero || "S/N").slice(0, 60), ...(d.end.complemento ? { complemento_destinatario: String(d.end.complemento).slice(0, 60) } : {}),
    bairro_destinatario: String(d.end.bairro || "Centro").slice(0, 60), municipio_destinatario: d.end.municipio, uf_destinatario: ufDest, cep_destinatario: dig(d.end.cep), pais_destinatario: "Brasil",
    indicador_intermediario: 0, informacoes_adicionais_contribuinte: obs.slice(0, 2000),
    ...(totFrete ? { valor_frete: round(totFrete) } : {}), ...(totDesc ? { valor_desconto: round(totDesc) } : {}),
    formas_pagamento: [{ forma_pagamento: "90", valor_pagamento: 0 }],
    items,
  };
  return { payload, total, itens: resumo };
}

export async function prepararDevolucao(db: SupabaseClient, ws: string, d: { pedido: string; tipo?: string; motivo?: string; itens?: Sel[] }, quem: string) {
  const pedido = String(d.pedido ?? "").trim(); if (!pedido) throw new HttpError(400, "Informe o pedido.");
  const tipo = d.tipo === "estorno" ? "estorno" : "devolucao";
  const cfg = await configFiscal(db, ws);
  const orig = await notaDoPedido(db, ws, pedido);
  if (!orig.chave) throw new HttpError(400, "A nota original não tem chave de acesso.");
  const sel = d.itens?.length ? d.itens.filter((i) => Number(i.qtd) > 0) : (() => { const m = new Map<string, number>(); for (const i of orig.itens) m.set(i.sku, (m.get(i.sku) ?? 0) + i.q); return [...m].map(([sku, qtd]) => ({ sku, qtd })); })();
  const modelo = tipo === "devolucao" ? await modeloDevolucao(db, ws).catch(() => null) : null;
  const r = montarDevolucao(cfg, orig, sel, tipo, String(d.motivo ?? "").slice(0, 300), modelo);
  const id = `${tipo === "estorno" ? "EST" : "DEV"}-${pedido.replace(/[^A-Za-z0-9]/g, "").slice(0, 30)}-${Date.now().toString(36)}`;
  const row = {
    workspace_id: ws, id, pedido, tipo, motivo: d.motivo ?? null, itens: r.itens, total: r.total, status: "rascunho",
    origem: { fonte: orig.fonte, chave: orig.chave, numero: orig.numero, serie: orig.serie, emissao: orig.emissao, cliente: orig.dest.nome, doc: orig.dest.doc, uf: orig.dest.end.uf, itens: orig.itens.map((i) => ({ sku: i.sku, nome: i.nome, qtd: i.q, valor: round(i.vProd + i.vFrete - i.vDesc) })) },
    modelo, payload: r.payload, criado_por: quem, updated_at: new Date().toISOString(),
  };
  const { error } = await db.from("nfe_devolucoes").insert(row);
  if (error) throw new HttpError(500, error.message);
  return { id, total: r.total, itens: r.itens, origem: row.origem, modelo };
}

export async function emitirDevolucao(db: SupabaseClient, ws: string, id: string, quem: string, confirmaProducao = false) {
  const { data: dv } = await db.from("nfe_devolucoes").select("*").eq("workspace_id", ws).eq("id", id).maybeSingle();
  if (!dv) throw new HttpError(404, "Rascunho não encontrado.");
  if (!["rascunho", "erro"].includes(dv.status)) throw new HttpError(400, "Esta nota já foi enviada.");
  const cfg = await configFiscal(db, ws);
  if (cfg.ambiente === "producao" && !confirmaProducao) throw new HttpError(400, "Emissão em produção precisa de confirmação.");
  // Recalcula a data e o texto de homologação para o ambiente atual.
  const payload = { ...dv.payload, data_emissao: new Date().toISOString(), cnpj_emitente: dig(cfg.cnpj), serie: cfg.serie };
  const ref = `EB${dv.tipo === "estorno" ? "E" : "D"}${cfg.ambiente === "producao" ? "P" : "H"}-${Date.now().toString(36).toUpperCase()}`;
  const r = await focus(cfg.ambiente, "POST", `/v2/nfe?ref=${encodeURIComponent(ref)}`, payload);
  const status = r.ok ? (r.j.status ?? "processando_autorizacao") : "erro";
  const mensagem = r.ok ? (r.j.mensagem_sefaz ?? null) : `${r.j.codigo ?? r.status}: ${r.j.mensagem ?? ""}${(r.j.erros ?? []).map((x: any) => ` · ${x.campo ?? ""} ${x.mensagem ?? ""}`).join("")}`.slice(0, 1000);
  await db.from("notas_fiscais").upsert({ workspace_id: ws, ref, pedido: `${dv.tipo === "estorno" ? "ESTORNO" : "DEVOLUÇÃO"} ${dv.pedido}`, ambiente: cfg.ambiente, status, mensagem, valor: dv.total, payload, resposta: r.j, criado_por: quem, updated_at: new Date().toISOString() }, { onConflict: "workspace_id,ref" });
  await db.from("nfe_devolucoes").update({ status: status === "erro" ? "erro" : "emitida", nfe_ref: ref, ambiente: cfg.ambiente, mensagem, updated_at: new Date().toISOString() }).eq("workspace_id", ws).eq("id", id);
  return { id, ref, ambiente: cfg.ambiente, status, mensagem };
}

/** Consulta a nota na SEFAZ (via Focus). Autorizada em produção: lança a volta dos itens no kardex e envia ao Bling. */
export async function consultarDevolucao(db: SupabaseClient, ws: string, id: string) {
  const { data: dv } = await db.from("nfe_devolucoes").select("*").eq("workspace_id", ws).eq("id", id).maybeSingle();
  if (!dv?.nfe_ref) throw new HttpError(404, "Nota ainda não enviada.");
  const r: any = await consultarNFe(db, ws, dv.nfe_ref);
  const autorizada = r.status === "autorizado", erro = /erro|denegado/.test(String(r.status ?? ""));
  const upd: Record<string, unknown> = { status: autorizada ? "autorizada" : erro ? "erro" : dv.status, mensagem: r.mensagem ?? dv.mensagem, updated_at: new Date().toISOString() };
  let estoque = null;
  if (autorizada && dv.ambiente === "producao" && !dv.estoque_lancado) {
    const rows = (dv.itens ?? []).filter((i: any) => i.sku && Number(i.qtd) > 0).map((i: any) => ({
      workspace_id: ws, id: `dev:${dv.id}:${i.sku}`, data: new Date().toISOString().slice(0, 10), sku: i.sku, operacao: "E", quantidade: Number(i.qtd),
      motivo: dv.tipo === "estorno" ? "cancelamento_venda" : "devolucao_venda", origem: "devolucoes", referencia: dv.id,
      documento: `${dv.tipo === "estorno" ? "Estorno" : "Devolução"} NF-e ${r.numero ?? ""} · pedido ${dv.pedido}`, bling_status: "pendente", criado_por: dv.criado_por,
    }));
    if (rows.length) {
      await db.from("estoque_movimentos").upsert(rows, { onConflict: "workspace_id,id", ignoreDuplicates: true });
      estoque = await enviarMovimentosBling(db, ws, rows.map((x: any) => x.id)).catch((e) => ({ erro: String(e) }));
    }
    upd.estoque_lancado = true;
  }
  await db.from("nfe_devolucoes").update(upd).eq("workspace_id", ws).eq("id", id);
  return { id, ...r, estoque };
}
