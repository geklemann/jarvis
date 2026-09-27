// Estoque: lê do Bling o cadastro de produtos com preço, custo e saldo (virtual total) e grava em
// public.produtos, sem tocar nos campos da equipe (mínimo, prazo de reposição, fornecedor, localização).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { fetchJson, num, sleep } from "./common.ts";
import { validSecret } from "./store.ts";

const API = () => Deno.env.get("BLING_API_BASE") || "https://api.bling.com.br/Api/v3";

export async function sincronizarEstoqueBling(db: SupabaseClient, ws: string, deadline = Date.now() + 100_000) {
  const sec = await validSecret(db, ws, "bling");
  const get = async (path: string) => {
    await sleep(350); // limite do Bling: 3 requisições por segundo
    return fetchJson(`${API()}${path}`, { headers: { Authorization: `Bearer ${sec.access_token}`, Accept: "application/json" } });
  };
  const agora = new Date().toISOString();
  const rows: Record<string, unknown>[] = [];
  let paginas = 0;
  for (let pagina = 1; pagina <= 60 && Date.now() < deadline; pagina++) {
    const j = await get(`/produtos?pagina=${pagina}&limite=100&criterio=2&tipo=P`);
    const lista: any[] = j?.data ?? [];
    paginas++;
    for (const p of lista) {
      const sku = String(p.codigo ?? "").trim();
      rows.push({
        workspace_id: ws, id: sku || `bling-${p.id}`, bling_id: String(p.id), pai: p.idProdutoPai ? String(p.idProdutoPai) : null,
        nome: String(p.nome ?? sku ?? p.id).slice(0, 300), formato: p.formato ?? null, situacao: p.situacao ?? null,
        preco: p.preco != null ? num(p.preco) : null, custo: p.precoCusto != null ? num(p.precoCusto) : null,
        saldo: p.estoque?.saldoVirtualTotal != null ? num(p.estoque.saldoVirtualTotal) : null,
        imagem: p.imagemURL || null, sincronizado_em: agora, updated_at: agora,
      });
    }
    if (lista.length < 100) break;
  }
  const uniq = [...new Map(rows.map((r) => [r.id as string, r])).values()];
  // Fotos com endereço permanente (o link do Bling expira em 30 minutos): copia cada foto uma vez para o bucket.
  const fotosInfo = await fotosPermanentes(db, ws, uniq, deadline).catch((e) => ({ copiadas: 0, erros: 1, erro: String(e) }));
  for (let k = 0; k < uniq.length; k += 200) {
    const { error } = await db.from("produtos").upsert(uniq.slice(k, k + 200), { onConflict: "workspace_id,id" });
    if (error) throw error;
  }
  // Foto do dia (histórico de saldo e custo por SKU): uma por dia, a última leitura do dia vale.
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const fotos = uniq.filter((r) => r.saldo != null).map((r) => ({ workspace_id: ws, data: hoje, sku: r.id, saldo: r.saldo, custo: r.custo }));
  for (let k = 0; k < fotos.length; k += 300) await db.from("estoque_fotos").upsert(fotos.slice(k, k + 300), { onConflict: "workspace_id,data,sku" });
  await gravarVitrine(db, ws, uniq).catch(() => null);
  return { produtos: uniq.length, paginas, com_saldo: uniq.filter((r) => Number(r.saldo) > 0).length, fotos: fotosInfo };
}

const PUBLICO = () => `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/produtos/`;
/** Copia para o bucket público as fotos que ainda não estão lá (ou que mudaram no Bling) e troca o link do produto. */
async function fotosPermanentes(db: SupabaseClient, ws: string, rows: Record<string, unknown>[], deadline: number) {
  const { data: atuais } = await db.from("produtos").select("id,imagem").eq("workspace_id", ws);
  const atual = new Map((atuais ?? []).map((r: any) => [r.id, r.imagem]));
  let copiadas = 0, erros = 0, mantidas = 0, primeiroErro = "";
  for (const r of rows) {
    const u = r.imagem as string | null;
    if (!u) continue;
    // O caminho do arquivo no Bling identifica a foto; muda quando a foto é trocada.
    const nome = u.split("?")[0].split("/").filter(Boolean).slice(-2).join("-").replace(/[^A-Za-z0-9._-]/g, "");
    const chave = `${ws}/${nome}`, pub = PUBLICO() + chave;
    if (atual.get(r.id as string) === pub) { r.imagem = pub; mantidas++; continue; }
    if (Date.now() > deadline - 15_000) continue; // sem tempo: fica o link do Bling até a próxima rodada
    try {
      const resp = await fetch(u);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const bytes = new Uint8Array(await resp.arrayBuffer());
      // O Bling entrega a foto com tipo genérico: o formato vem dos primeiros bytes do arquivo.
      const tipo = bytes[0] === 0x89 && bytes[1] === 0x50 ? "image/png" : bytes[0] === 0x52 && bytes[8] === 0x57 ? "image/webp" : "image/jpeg";
      const { error } = await db.storage.from("produtos").upload(chave, bytes, { contentType: tipo, upsert: true, cacheControl: "31536000" });
      if (error) throw error;
      r.imagem = pub; copiadas++;
    } catch (e) { erros++; if (!primeiroErro) primeiroErro = String((e as any)?.message ?? e).slice(0, 200); }
  }
  return { copiadas, mantidas, erros, ...(primeiroErro ? { primeiroErro } : {}) };
}

/** Vitrine da tela de login: os produtos mais vendidos nos últimos 30 dias que têm foto permanente. Só nome e foto. */
async function gravarVitrine(db: SupabaseClient, ws: string, rows: Record<string, unknown>[]) {
  const desde = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const { data } = await db.from("orders").select("items").eq("workspace_id", ws).gte("date", desde).limit(20000);
  const qtd = new Map<string, number>();
  for (const o of data ?? []) for (const it of (o as any).items ?? []) { const k = String(it.sku ?? "").trim(); if (k) qtd.set(k, (qtd.get(k) ?? 0) + (Number(it.qty) || 0)); }
  const lista = rows.filter((r) => String(r.imagem ?? "").startsWith(PUBLICO()))
    .sort((a, b) => (qtd.get(b.id as string) ?? 0) - (qtd.get(a.id as string) ?? 0)).slice(0, 18)
    .map((r) => ({ nome: String(r.nome ?? "").slice(0, 60), img: r.imagem }));
  if (!lista.length) return;
  await db.storage.from("produtos").upload("vitrine.json", new TextEncoder().encode(JSON.stringify({ atualizado: new Date().toISOString(), produtos: lista })), { contentType: "application/json", upsert: true, cacheControl: "300" });
}

/** Dados fiscais (NCM, CEST, origem, GTIN) de cada produto, pelo detalhe do Bling. Poucos por rodada. */
export async function detalhesFiscaisBling(db: SupabaseClient, ws: string, limite = 40) {
  const sec = await validSecret(db, ws, "bling");
  const antigo = new Date(Date.now() - 7 * 86400_000).toISOString();
  const { data } = await db.from("produtos").select("id,bling_id,fiscal_em").eq("workspace_id", ws).not("bling_id", "is", null)
    .or(`fiscal_em.is.null,fiscal_em.lt.${antigo}`).order("fiscal_em", { ascending: true, nullsFirst: true }).limit(limite);
  let lidos = 0;
  for (const p of data ?? []) {
    await sleep(350);
    const j = await fetchJson(`${API()}/produtos/${p.bling_id}`, { headers: { Authorization: `Bearer ${sec.access_token}`, Accept: "application/json" } }).catch(() => null);
    const d = j?.data;
    if (!d) continue;
    const t = d.tributacao ?? {};
    await db.from("produtos").update({
      ncm: String(t.ncm ?? "").replace(/\D/g, "") || null, cest: String(t.cest ?? "").replace(/\D/g, "") || null,
      origem: t.origem != null && t.origem !== "" ? Number(t.origem) : null, gtin: d.gtin || d.gtinEmbalagem || null,
      fiscal_em: new Date().toISOString(),
    }).eq("workspace_id", ws).eq("id", p.id);
    lidos++;
  }
  return { fiscais: lidos };
}
