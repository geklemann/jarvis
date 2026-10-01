// Mercado Ads (Product Ads) do Mercado Livre: gasto com anúncios por dia e por anúncio, para a DRE e a rentabilidade
// usarem o custo real em vez de um percentual estimado. Usa a mesma conexão (token) do Mercado Livre.
// sondarAds: chamada só de leitura que registra quais endereços da API respondem e o formato (sem token nem dados
// pessoais), para ajustar a integração à versão da API disponível para a conta.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { validSecret } from "./store.ts";

const API = "https://api.mercadolibre.com";

async function chamar(tok: string, path: string, versao?: string) {
  const r = await fetch(API + path, { headers: { Authorization: `Bearer ${tok}`, Accept: "application/json", ...(versao ? { "Api-Version": versao } : {}) } });
  const txt = await r.text();
  let j: any = null; try { j = JSON.parse(txt); } catch { /* texto */ }
  return { status: r.status, j, txt };
}
// Resumo do formato: chaves e um exemplo pequeno, sem valores longos.
function forma(j: any, prof = 0): any {
  if (prof > 3) return "…";
  if (Array.isArray(j)) return j.length ? [forma(j[0], prof + 1), `(${j.length} itens)`] : [];
  if (j && typeof j === "object") return Object.fromEntries(Object.entries(j).slice(0, 25).map(([k, v]) => [k, forma(v, prof + 1)]));
  return typeof j === "string" ? j.slice(0, 40) : j;
}

export async function sondarAds(db: SupabaseClient, ws: string) {
  const sec = await validSecret(db, ws, "mercadolivre");
  const tok = sec.access_token as string;
  const me = await chamar(tok, "/users/me");
  const site = me.j?.site_id ?? "MLB";
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const ini = new Date(Date.now() - 3 * 3600_000 - 7 * 864e5).toISOString().slice(0, 10);
  const out: any = { em: new Date().toISOString(), site, testes: [] as any[] };
  const reg = (nome: string, r: { status: number; j: any; txt: string }) => out.testes.push({ nome, status: r.status, forma: r.j ? forma(r.j) : r.txt.slice(0, 200) });

  const adv = await chamar(tok, "/advertising/advertisers?product_id=PADS", "1");
  reg("advertisers", adv);
  const lista = adv.j?.advertisers ?? (Array.isArray(adv.j) ? adv.j : []);
  const a = lista[0];
  const id = a?.advertiser_id ?? a?.id;
  out.advertiser = a ? { id, site: a.site_id, nome: a.advertiser_name ?? null } : null;
  if (!id) return out;
  const metr = "clicks,prints,cost,cpc,acos,direct_amount,indirect_amount,total_amount,direct_units_quantity,indirect_units_quantity,units_quantity";
  const q = `date_from=${ini}&date_to=${hoje}&metrics=${metr}`;
  const tentativas: [string, string, string][] = [
    ["campanhas v2 (search)", `/advertising/${site}/advertisers/${id}/product_ads/campaigns/search?limit=50&${q}`, "2"],
    ["campanhas v1", `/advertising/advertisers/${id}/product_ads/campaigns?limit=50&${q}`, "2"],
    ["anuncios v2 (search)", `/advertising/${site}/advertisers/${id}/product_ads/ads/search?limit=50&${q}`, "2"],
    ["anuncios v1", `/advertising/advertisers/${id}/product_ads/ads/search?limit=50&${q}`, "2"],
    ["diario v2 (search)", `/advertising/${site}/advertisers/${id}/product_ads/campaigns/search?limit=50&${q}&aggregation_type=DAILY`, "2"],
  ];
  for (const [nome, path, v] of tentativas) reg(nome, await chamar(tok, path, v));
  return out;
}

/** Gasto por anúncio e por dia (Product Ads v2), gravado em anuncios_gasto. Só roda quando a conta tem anunciante
 *  (o aplicativo precisa da permissão de publicidade no DevCenter do Mercado Livre). dias: datas AAAA-MM-DD. */
export async function sincronizarAdsML(db: SupabaseClient, ws: string, advertiser: string | number, site: string, dias: string[]) {
  const sec = await validSecret(db, ws, "mercadolivre");
  const tok = sec.access_token as string;
  const metr = "clicks,prints,cost,total_amount,units_quantity";
  const linhas: Record<string, unknown>[] = [];
  for (const dia of dias) {
    for (let offset = 0; offset < 5000; offset += 50) {
      const r = await chamar(tok, `/advertising/${site}/advertisers/${advertiser}/product_ads/ads/search?limit=50&offset=${offset}&date_from=${dia}&date_to=${dia}&metrics=${metr}`, "2");
      if (r.status !== 200) throw new Error(`Mercado Ads respondeu ${r.status}: ${String(r.j?.message ?? r.txt).slice(0, 160)}`);
      const res: any[] = r.j?.results ?? [];
      for (const a of res) {
        const m = a.metrics ?? a, custo = Number(m.cost ?? 0);
        if (!a.item_id || !custo) continue;
        linhas.push({ workspace_id: ws, canal: "Mercado Livre", dia, anuncio: String(a.item_id), periodo: "dia", titulo: a.title ?? null, custo: Math.round(custo * 100) / 100,
          cliques: m.clicks ?? null, impressoes: m.prints ?? null, vendas_valor: m.total_amount ?? null, vendas_qtd: m.units_quantity ?? null, origem: "api", atualizado_por: "Mercado Ads", updated_at: new Date().toISOString() });
      }
      if (res.length < 50 || offset + 50 >= Number(r.j?.paging?.total ?? 0)) break;
    }
  }
  // SKU de cada anúncio: primeiro pelo Vigia de preços; os que faltarem, pelo próprio anúncio (SELLER_SKU).
  const ids = [...new Set(linhas.map((l) => String(l.anuncio)))];
  const { data: vig } = ids.length ? await db.from("precos_concorrencia").select("item_id,sku").eq("workspace_id", ws).in("item_id", ids) : { data: [] };
  const sku = new Map((vig ?? []).filter((v) => v.sku).map((v) => [v.item_id, v.sku as string]));
  const faltam = ids.filter((i) => !sku.has(i));
  for (let i = 0; i < faltam.length; i += 20) {
    const r = await chamar(tok, `/items?ids=${faltam.slice(i, i + 20).join(",")}&attributes=id,seller_custom_field,attributes`);
    for (const x of Array.isArray(r.j) ? r.j : []) {
      const b = x.body ?? {}, s = b.seller_custom_field || (b.attributes ?? []).find((a: any) => a.id === "SELLER_SKU")?.value_name;
      if (b.id && s) sku.set(b.id, String(s));
    }
  }
  for (const l of linhas) l.sku = sku.get(String(l.anuncio)) ?? null;
  for (let i = 0; i < linhas.length; i += 500) {
    const { error } = await db.from("anuncios_gasto").upsert(linhas.slice(i, i + 500), { onConflict: "workspace_id,canal,dia,anuncio" });
    if (error) throw error;
  }
  return { linhas: linhas.length, custo: Math.round(linhas.reduce((s, l) => s + Number(l.custo), 0) * 100) / 100, sem_sku: linhas.filter((l) => !l.sku).length };
}
