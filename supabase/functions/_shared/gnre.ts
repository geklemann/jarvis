// Cliente do Portal GNRE (webservices GnreLoteRecepcao, GnreResultadoLote e GnreConfigUF), autenticado com o
// certificado e-CNPJ A1 da empresa (TLS mútuo). O PFX e a senha ficam só nos segredos do servidor (GNRE_CERT_PFX em
// base64 e GNRE_CERT_SENHA), gravados pelo dono. Ambiente: GNRE_AMBIENTE = homologacao (padrão) ou producao.
// Lote no layout 2.00 (até 50 guias). O que cada UF exige (documento de origem, destinatário, campos extras) vem do
// GnreConfigUF e fica em cache em gnre_config_uf.
import forge from "npm:node-forge@1.3.1";
import { HttpError } from "./common.ts";

export const ambienteGnre = () => (Deno.env.get("GNRE_AMBIENTE") === "producao" ? "producao" : "homologacao");
// Homologação: www.testegnre.pe.gov.br apresenta o certificado *.sefaz.pe.gov.br (nome não confere). O mesmo servidor
// (200.238.83.74) responde como testegnre.sefaz.pe.gov.br, que o certificado cobre. GNRE_HOST sobrepõe, se a SEFAZ-PE corrigir.
const HOST = () => Deno.env.get("GNRE_HOST") || (ambienteGnre() === "producao" ? "https://www.gnre.pe.gov.br" : "https://testegnre.sefaz.pe.gov.br");
const NS = "http://www.gnre.pe.gov.br";
export const temCertificado = () => !!Deno.env.get("GNRE_CERT_PFX") && !!Deno.env.get("GNRE_CERT_SENHA");

let cliente: any = null;
function clienteTls() {
  if (cliente) return cliente;
  const pfx = Deno.env.get("GNRE_CERT_PFX"), senha = Deno.env.get("GNRE_CERT_SENHA");
  if (!pfx || !senha) throw new HttpError(400, "Certificado A1 ainda não instalado no servidor (GNRE_CERT_PFX e GNRE_CERT_SENHA).");
  if (typeof (Deno as any).createHttpClient !== "function") throw new HttpError(500, "O servidor não oferece TLS com certificado de cliente.");
  const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(forge.util.decode64(pfx.replace(/\s/g, ""))), false, senha);
  const kb = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0] ?? p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]?.[0];
  const cbs = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
  if (!kb?.key || !cbs.length) throw new HttpError(400, "Não consegui abrir o certificado (senha ou arquivo incorretos).");
  const key = forge.pki.privateKeyToPem(kb.key), cert = cbs.map((b: any) => forge.pki.certificateToPem(b.cert)).join("\n");
  cliente = (Deno as any).createHttpClient({ cert, key, certChain: cert, privateKey: key });
  return cliente;
}

async function soap(servico: "GnreLoteRecepcao" | "GnreResultadoLote" | "GnreConfigUF", operacao: string, versao: string, corpo: string) {
  const ns = `${NS}/webservice/${servico}`;
  const env = `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Header><gnreCabecMsg xmlns="${ns}"><versaoDados>${versao}</versaoDados></gnreCabecMsg></soap12:Header><soap12:Body><gnreDadosMsg xmlns="${ns}">${corpo}</gnreDadosMsg></soap12:Body></soap12:Envelope>`;
  const r = await fetch(`${HOST()}/gnreWS/services/${servico}`, { method: "POST", client: clienteTls(), headers: { "Content-Type": `application/soap+xml; charset=utf-8; action="${ns}/${operacao}"` }, body: env } as any);
  const txt = await r.text();
  if (!r.ok) throw new HttpError(502, `Portal GNRE ${r.status}: ${(txt.match(/<(?:\w+:)?Text[^>]*>([^<]+)</)?.[1] ?? txt.slice(0, 200))}`);
  return txt;
}
const tag = (x: string, t: string) => x.match(new RegExp(`<(?:\\w+:)?${t}(?:\\s[^>]*)?>([^<]*)</(?:\\w+:)?${t}>`))?.[1] ?? null;
const blocos = (x: string, t: string) => [...x.matchAll(new RegExp(`<(?:\\w+:)?${t}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${t}>`, "g"))].map((m) => m[1]);
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const semAcento = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const dig = (s: unknown) => String(s ?? "").replace(/\D/g, "");
const v2 = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

// ─── Exigências da UF ───
export async function consultarConfigUf(uf: string, receita: string) {
  const amb = ambienteGnre() === "producao" ? 1 : 2;
  const xml = await soap("GnreConfigUF", "consultar", "1.00", `<TConsultaConfigUf xmlns="${NS}"><ambiente>${amb}</ambiente><uf>${uf}</uf><receita courier="N">${receita}</receita></TConsultaConfigUf>`);
  const cod = tag(xml, "codigo");
  const flags: Record<string, string> = {};
  for (const m of xml.matchAll(/<(?:\w+:)?(exige\w+)[^>]*>\s*(?:<(?:\w+:)?campo>)?\s*([SN])/g)) flags[m[1]] = m[2];
  return {
    uf, receita, situacao: { codigo: cod, descricao: tag(xml, "descricao") }, flags,
    tiposDocumentosOrigem: blocos(xml, "tipoDocumentoOrigem").map((b) => ({ codigo: tag(b, "codigo"), descricao: tag(b, "descricao") })),
    detalhamentos: blocos(xml, "detalhamentoReceita").map((b) => ({ codigo: tag(b, "codigo"), descricao: tag(b, "descricao") })).filter((x) => x.codigo),
    camposAdicionais: blocos(xml, "campoAdicional").map((b) => ({ codigo: tag(b, "codigo"), obrigatorio: tag(b, "obrigatorio"), tipo: tag(b, "tipo"), tamanho: tag(b, "tamanho"), titulo: tag(b, "titulo") })),
    periodosApuracao: blocos(xml, "periodoApuracao").map((b) => ({ codigo: tag(b, "codigo"), descricao: tag(b, "descricao") })),
  };
}

// ─── Montagem do lote ───
export interface Emitente { cnpj: string; razao: string; endereco: string; ibge: string; uf: string; cep: string; telefone?: string }
export interface GuiaIn {
  id: string; uf: string; tipo: "nota" | "mensal"; ie?: string | null; vencimento: string; pagamento: string;
  icms: number; fcp: number; fcpSeparado?: boolean;
  nota?: { chave: string; numero: string; emissao: string; dest_doc?: string | null; dest_nome?: string | null; dest_mun?: string | null };
  mes?: string; // AAAA-MM
  config?: any; // de consultarConfigUf (receita 100102)
}
function docOrigem(g: GuiaIn) {
  if (!g.nota) return "";
  const tipos = g.config?.tiposDocumentosOrigem ?? [];
  const chave = tipos.find((t: any) => /chave/i.test(t.descricao ?? "")), nf = tipos.find((t: any) => /nota fiscal|nf-?e/i.test(t.descricao ?? ""));
  if (g.config && g.config.flags?.exigeDocumentoOrigem === "N") return "";
  if (chave) return `<documentoOrigem tipo="${esc(chave.codigo)}">${g.nota.chave}</documentoOrigem>`;
  if (nf) return `<documentoOrigem tipo="${esc(nf.codigo)}">${esc(dig(g.nota.numero))}</documentoOrigem>`;
  return `<documentoOrigem tipo="10">${esc(dig(g.nota.numero))}</documentoOrigem>`;
}
function camposExtras(g: GuiaIn) {
  const cs = (g.config?.camposAdicionais ?? []).filter((c: any) => c.obrigatorio === "S" || /chave/i.test(c.titulo ?? ""));
  const out: string[] = [], faltam: string[] = [];
  for (const c of cs) {
    const t = String(c.titulo ?? "");
    const v = /chave/i.test(t) && g.nota ? g.nota.chave : /emiss/i.test(t) && g.nota ? g.nota.emissao : /n[uú]mero.*(nota|nf|documento)/i.test(t) && g.nota ? dig(g.nota.numero) : null;
    if (v == null) { if (c.obrigatorio === "S") faltam.push(t); continue; }
    out.push(`<campoExtra><codigo>${esc(c.codigo)}</codigo><valor>${esc(v)}</valor></campoExtra>`);
  }
  if (faltam.length) throw new HttpError(400, `${g.uf} exige campo(s) que o Jarvis ainda não preenche: ${faltam.join(", ")}.`);
  return out.length ? `<camposExtras>${out.join("")}</camposExtras>` : "";
}
function item(g: GuiaIn, receita: string, valores: string, detalhamento: string) {
  const [ano, mes] = (g.mes ?? g.nota?.emissao ?? g.vencimento).slice(0, 7).split("-");
  const ref = g.tipo === "mensal" || g.config?.flags?.exigePeriodoReferencia === "S" ? `<referencia><periodo>0</periodo><mes>${mes}</mes><ano>${ano}</ano></referencia>` : "";
  const d = g.nota && (!g.config || g.config.flags?.exigeContribuinteDestinatario !== "N") && g.nota.dest_doc
    ? `<contribuinteDestinatario><identificacao>${dig(g.nota.dest_doc).length === 14 ? `<CNPJ>${dig(g.nota.dest_doc)}</CNPJ>` : `<CPF>${dig(g.nota.dest_doc)}</CPF>`}</identificacao>${g.nota.dest_nome ? `<razaoSocial>${esc(semAcento(g.nota.dest_nome).slice(0, 60))}</razaoSocial>` : ""}${g.nota.dest_mun ? `<municipio>${String(g.nota.dest_mun).slice(-5)}</municipio>` : ""}</contribuinteDestinatario>` : "";
  return `<item><receita>${receita}</receita>${detalhamento}${docOrigem(g)}${ref}<dataVencimento>${g.vencimento}</dataVencimento>${valores}${d}${camposExtras(g)}</item>`;
}
export function montarLote(guias: GuiaIn[], em: Emitente) {
  if (!guias.length || guias.length > 50) throw new HttpError(400, "O lote leva de 1 a 50 guias.");
  const xs = guias.map((g) => {
    const det = g.config?.flags?.exigeDetalhamentoReceita === "S" && g.config.detalhamentos?.[0] ? `<detalhamentoReceita>${esc(g.config.detalhamentos[0].codigo)}</detalhamentoReceita>` : "";
    const ident = g.ie ? `<IE>${dig(g.ie)}</IE>` : `<CNPJ>${dig(em.cnpj)}</CNPJ>`;
    // Com inscrição na UF, o emitente se identifica pela IE e dispensa o endereço.
    const emit = `<contribuinteEmitente><identificacao>${ident}</identificacao>${g.ie ? "" : `<razaoSocial>${esc(semAcento(em.razao).slice(0, 60))}</razaoSocial><endereco>${esc(semAcento(em.endereco).slice(0, 60))}</endereco><municipio>${String(em.ibge).slice(-5)}</municipio><uf>${em.uf}</uf><cep>${dig(em.cep)}</cep>${em.telefone ? `<telefone>${dig(em.telefone).slice(0, 11)}</telefone>` : ""}`}</contribuinteEmitente>`;
    let itens: string, tipo = "0";
    if (g.fcp > 0.004 && g.fcpSeparado) { tipo = "2"; itens = item(g, "100102", `<valor tipo="11">${v2(g.icms)}</valor>`, det) + item(g, "100129", `<valor tipo="12">${v2(g.fcp)}</valor>`, ""); }
    else itens = item(g, "100102", `<valor tipo="11">${v2(g.icms)}</valor>${g.fcp > 0.004 ? `<valor tipo="12">${v2(g.fcp)}</valor>` : ""}`, det);
    return `<TDadosGNRE versao="2.00"><ufFavorecida>${g.uf}</ufFavorecida><tipoGnre>${tipo}</tipoGnre>${emit}<itensGNRE>${itens}</itensGNRE><valorGNRE>${v2(g.icms + g.fcp)}</valorGNRE><dataPagamento>${g.pagamento}</dataPagamento></TDadosGNRE>`;
  });
  return `<TLote_GNRE xmlns="${NS}" versao="2.00"><guias>${xs.join("")}</guias></TLote_GNRE>`;
}

// ─── Envio e resultado ───
export async function enviarLote(lote: string) {
  const xml = await soap("GnreLoteRecepcao", "processar", "2.00", lote);
  const cod = tag(xml, "codigo"), desc = tag(xml, "descricao"), recibo = tag(blocos(xml, "recibo")[0] ?? "", "numero");
  if (!recibo) throw new HttpError(400, `Portal GNRE recusou o lote: ${cod ?? ""} ${desc ?? ""}`.trim());
  return { recibo, codigo: cod, descricao: desc, tempo: tag(xml, "tempoEstimadoProc") };
}
export async function resultadoLote(recibo: string) {
  const amb = ambienteGnre() === "producao" ? 1 : 2;
  const corpo = `<TConsLote_GNRE xmlns="${NS}"><ambiente>${amb}</ambiente><numeroRecibo>${esc(recibo)}</numeroRecibo><incluirPDFGuias>S</incluirPDFGuias></TConsLote_GNRE>`;
  let xml: string;
  try { xml = await soap("GnreResultadoLote", "consultar", "2.00", corpo); }
  catch { xml = await soap("GnreResultadoLote", "consultar", "1.00", corpo.replace("<incluirPDFGuias>S</incluirPDFGuias>", "")); }
  const sp = blocos(xml, "situacaoProcess")[0] ?? "";
  const guias = blocos(xml, "guia").map((g) => ({
    situacao: tag(g, "situacaoGuia"), uf: tag(g, "ufFavorecida"), valor: Number(tag(g, "valorGNRE") ?? tag(g, "valor") ?? 0),
    linha: tag(g, "linhaDigitavel"), barras: tag(g, "codigoBarras"), nosso: tag(g, "nossoNumero"), limite: tag(g, "dataLimitePagamento"),
    motivos: blocos(g, "motivo").map((m) => ({ codigo: tag(m, "codigo"), descricao: tag(m, "descricao"), campo: tag(m, "campo") })),
  }));
  return { codigo: tag(sp, "codigo"), descricao: tag(sp, "descricao"), guias, pdf: tag(xml, "pdfGuias") };
}
