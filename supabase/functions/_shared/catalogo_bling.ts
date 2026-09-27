// Catálogo e anúncios pelo Bling (API v3): o EcomBalance é a tela; o Bling entrega aos canais que já estão
// conectados nele (Shopee, Mercado Livre, Magalu). Leituras: canais, vínculos produto×loja (preço por canal) e
// anúncios. Gravações (sempre por ação de uma pessoa no portal): produto, preço por canal, anúncio, publicar/pausar.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { HttpError, sleep } from "./common.ts";
import { validSecret } from "./store.ts";

const API = () => Deno.env.get("BLING_API_BASE") || "https://api.bling.com.br/Api/v3";

async function bling(db: SupabaseClient, ws: string) {
  const sec = await validSecret(db, ws, "bling");
  return async (metodo: string, path: string, corpo?: unknown) => {
    await sleep(350); // limite do Bling: 3 requisições por segundo
    const r = await fetch(`${API()}${path}`, {
      method: metodo,
      headers: { Authorization: `Bearer ${sec.access_token}`, Accept: "application/json", ...(corpo ? { "Content-Type": "application/json" } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    const txt = await r.text();
    let j: any = null;
    try { j = txt ? JSON.parse(txt) : null; } catch { j = { texto: txt.slice(0, 300) }; }
    if (!r.ok) {
      const e = j?.error ?? {};
      const campos = (e.fields ?? []).map((f: any) => `${f.element ?? f.namespace ?? ""}: ${f.msg ?? ""}`).join(" · ");
      throw new HttpError(r.status === 401 || r.status === 403 ? 400 : 502, `Bling ${r.status}: ${e.description ?? e.message ?? e.type ?? "erro"}${campos ? " — " + campos : ""}`);
    }
    return j;
  };
}

/** Lojas (canais de venda) conectadas no Bling. */
export async function canaisBling(db: SupabaseClient, ws: string) {
  const b = await bling(db, ws);
  const j = await b("GET", "/canais-venda");
  return (j?.data ?? []).map((c: any) => ({ id: c.id, descricao: c.descricao, tipo: c.tipo, ativo: c.situacao === 1 }));
}

/** Vínculos produto × loja de todas as lojas ativas: o código do anúncio no canal e o preço praticado lá. */
export async function vinculosBling(db: SupabaseClient, ws: string, deadline = Date.now() + 90_000) {
  const b = await bling(db, ws);
  const canais = (await b("GET", "/canais-venda"))?.data ?? [];
  const vinculos: any[] = [];
  for (const c of canais.filter((x: any) => x.situacao === 1)) {
    for (let pagina = 1; pagina <= 30 && Date.now() < deadline; pagina++) {
      const j = await b("GET", `/produtos/lojas?idLoja=${c.id}&pagina=${pagina}&limite=100`).catch(() => null);
      const l = j?.data ?? [];
      for (const v of l) vinculos.push({ id: v.id, loja: c.id, lojaNome: c.descricao, tipo: c.tipo, produto: v.produto?.id, codigo: v.codigo, preco: v.preco, promocional: v.precoPromocional });
      if (l.length < 100) break;
    }
  }
  return { canais: canais.map((c: any) => ({ id: c.id, descricao: c.descricao, tipo: c.tipo, ativo: c.situacao === 1 })), vinculos, em: new Date().toISOString() };
}

/** Anúncios do módulo de anúncios do Bling numa loja (1 publicado, 2 rascunho, 3 com problema, 4 pausado). */
export async function anunciosBling(db: SupabaseClient, ws: string, tipo: string, idLoja: number) {
  const b = await bling(db, ws);
  const out: any[] = [];
  for (let pagina = 1; pagina <= 20; pagina++) {
    const j = await b("GET", `/anuncios?tipoIntegracao=${encodeURIComponent(tipo)}&idLoja=${idLoja}&pagina=${pagina}&limite=100`);
    const l = j?.data ?? [];
    out.push(...l);
    if (l.length < 100) break;
  }
  return out;
}

const num = (v: unknown) => (v === "" || v == null || isNaN(Number(v)) ? undefined : Number(v));
const txt = (v: unknown) => (v == null || String(v).trim() === "" ? undefined : String(v).trim());
const limpa = (o: any): any => {
  if (Array.isArray(o)) return o.map(limpa);
  if (o && typeof o === "object") {
    const r: any = {};
    for (const [k, v] of Object.entries(o)) { const x = limpa(v); if (x !== undefined && !(x && typeof x === "object" && !Array.isArray(x) && !Object.keys(x).length)) r[k] = x; }
    return r;
  }
  return o;
};

/** Cria (sem blingId) ou altera (PATCH, só os campos informados) um produto no Bling e atualiza a cópia local. */
export async function salvarProdutoBling(db: SupabaseClient, ws: string, d: any) {
  const b = await bling(db, ws);
  const corpo = limpa({
    nome: txt(d.nome), codigo: txt(d.codigo), preco: num(d.preco), tipo: d.blingId ? undefined : "P", situacao: d.blingId ? undefined : "A", formato: d.blingId ? undefined : "S",
    unidade: txt(d.unidade) ?? (d.blingId ? undefined : "UN"), gtin: txt(d.gtin), marca: txt(d.marca), descricaoCurta: txt(d.descricao), condicao: d.blingId ? undefined : 0,
    pesoLiquido: num(d.pesoLiquido), pesoBruto: num(d.pesoBruto), volumes: num(d.volumes),
    dimensoes: { largura: num(d.largura), altura: num(d.altura), profundidade: num(d.profundidade), unidadeMedida: (num(d.largura) ?? num(d.altura) ?? num(d.profundidade)) !== undefined ? 1 : undefined },
    tributacao: { ncm: txt(d.ncm)?.replace(/\D/g, ""), cest: txt(d.cest)?.replace(/\D/g, ""), origem: num(d.origem) },
    midia: Array.isArray(d.fotos) && d.fotos.length ? { imagens: { imagensURL: d.fotos.filter((u: string) => /^https:\/\//.test(u)).map((link: string) => ({ link })) } } : undefined,
  });
  if (!corpo.nome && !d.blingId) throw new HttpError(400, "Informe o nome do produto.");
  if (!corpo.codigo && !d.blingId) throw new HttpError(400, "Informe o código (SKU) do produto.");
  let id = Number(d.blingId) || 0;
  if (id) await b("PATCH", `/produtos/${id}`, corpo);
  else { const j = await b("POST", "/produtos", corpo); id = j?.data?.id; }
  // Cópia local imediata (a sincronização de hora em hora completa o resto).
  const agora = new Date().toISOString();
  const local: Record<string, unknown> = { workspace_id: ws, id: corpo.codigo ?? d.sku, bling_id: String(id), updated_at: agora };
  if (corpo.nome) local.nome = corpo.nome;
  if (corpo.preco !== undefined) local.preco = corpo.preco;
  if (corpo.gtin) local.gtin = corpo.gtin;
  if (corpo.tributacao?.ncm) local.ncm = corpo.tributacao.ncm;
  if (corpo.tributacao?.cest) local.cest = corpo.tributacao.cest;
  if (corpo.tributacao?.origem !== undefined) local.origem = corpo.tributacao.origem;
  if (Array.isArray(d.fotos) && d.fotos[0]) local.imagem = d.fotos[0];
  if (local.id) await db.from("produtos").upsert(local, { onConflict: "workspace_id,id" });
  return { blingId: id, criado: !Number(d.blingId) };
}

/** Preço do produto numa loja: altera o vínculo existente ou cria o vínculo (código do anúncio no canal). */
export async function precoLojaBling(db: SupabaseClient, ws: string, d: any) {
  const b = await bling(db, ws);
  const corpo = limpa({ codigo: txt(d.codigo), preco: num(d.preco), precoPromocional: num(d.promocional), produto: { id: Number(d.produto) }, loja: { id: Number(d.loja) } });
  if (!corpo.preco) throw new HttpError(400, "Informe o preço do canal.");
  if (d.vinculo) { await b("PUT", `/produtos/lojas/${Number(d.vinculo)}`, corpo); return { vinculo: Number(d.vinculo) }; }
  const j = await b("POST", "/produtos/lojas", corpo);
  return { vinculo: j?.data?.id };
}

/** Novo anúncio (fica como rascunho no Bling até publicar). */
export async function criarAnuncioBling(db: SupabaseClient, ws: string, d: any) {
  const b = await bling(db, ws);
  const corpo = limpa({
    produto: { id: Number(d.produto) }, integracao: { tipo: String(d.tipo) }, loja: { id: Number(d.loja) },
    nome: txt(d.titulo), descricao: txt(d.descricao), preco: { valor: num(d.preco), promocional: num(d.promocional) },
    categoria: txt(d.categoria) ? { id: txt(d.categoria) } : undefined,
    atributos: (d.atributos ?? []).filter((a: any) => a?.id && a?.valor).map((a: any) => ({ id: String(a.id), valor: String(a.valor) })),
    imagens: (d.fotos ?? []).filter((u: string) => /^https:\/\//.test(u)).map((url: string, i: number) => ({ url, ordem: i + 1 })),
    ...(String(d.tipo) === "MercadoLivre" ? { mercadoLivre: { modalidade: txt(d.modalidade) ?? "gold_special", frete: { gratis: d.freteGratis === true } } } : {}),
  });
  if (!corpo.nome) throw new HttpError(400, "Informe o título do anúncio.");
  const j = await b("POST", "/anuncios", corpo);
  return { anuncio: j?.data?.id };
}

export async function situacaoAnuncioBling(db: SupabaseClient, ws: string, d: any, acao: "publicar" | "pausar") {
  const b = await bling(db, ws);
  await b("POST", `/anuncios/${Number(d.anuncio)}/${acao}?tipoIntegracao=${encodeURIComponent(String(d.tipo))}&idLoja=${Number(d.loja)}`);
  return { ok: true };
}

/** Foto nova enviada pelo portal: vai para o bucket público e devolve o endereço permanente. */
export async function enviarFotoProduto(db: SupabaseClient, ws: string, base64: string, nome: string) {
  const bytes = Uint8Array.from(atob(String(base64).replace(/^data:[^,]+,/, "")), (c) => c.charCodeAt(0));
  if (bytes.length > 5 * 1024 * 1024) throw new HttpError(400, "A foto passa de 5 MB.");
  const tipo = bytes[0] === 0x89 && bytes[1] === 0x50 ? "image/png" : bytes[0] === 0x52 && bytes[8] === 0x57 ? "image/webp" : bytes[0] === 0xff && bytes[1] === 0xd8 ? "image/jpeg" : "";
  if (!tipo) throw new HttpError(400, "Envie a foto em JPG, PNG ou WEBP.");
  const chave = `${ws}/manual-${Date.now()}-${String(nome || "foto").replace(/[^A-Za-z0-9._-]/g, "").slice(0, 40)}`;
  const { error } = await db.storage.from("produtos").upload(chave, bytes, { contentType: tipo, upsert: false, cacheControl: "31536000" });
  if (error) throw new HttpError(500, error.message);
  return { url: `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/produtos/${chave}` };
}
