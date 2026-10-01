// Vigia de preços (Mercado Livre): para cada anúncio ativo da conta que está num produto de catálogo, lê as ofertas
// dos outros vendedores do MESMO produto (/products/{id}/items) e, nos anúncios de catálogo, a disputa pela compra
// (price_to_win). Só leitura: nenhum preço é alterado. Guarda o resultado em precos_concorrencia e avisa quando um
// concorrente baixa o preço abaixo do seu. As regras puras ficam exportadas e testadas (testes/precos.test.mjs).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { validSecret } from "./store.ts";
import { baixou, classificar, novoHistorico } from "./precos_regras.ts";
export { baixou, classificar, novoHistorico };

const API = "https://api.mercadolibre.com";

async function get(tok: string, path: string) {
  const r = await fetch(API + path, { headers: { Authorization: `Bearer ${tok}`, Accept: "application/json" } });
  if (!r.ok) { await r.body?.cancel(); return null; }
  return await r.json().catch(() => null);
}

export async function vigiarPrecosML(db: SupabaseClient, ws: string, deadline: number) {
  const sec = await validSecret(db, ws, "mercadolivre");
  const tok = sec.access_token as string, me = await get(tok, "/users/me"), uid = String(me?.id ?? "");
  if (!uid) throw new Error("Não consegui ler a conta do Mercado Livre.");
  const ids: string[] = [];
  for (let off = 0; off < 1000 && Date.now() < deadline; off += 100) {
    const r = await get(tok, `/users/${uid}/items/search?status=active&limit=100&offset=${off}`);
    const res: string[] = r?.results ?? []; ids.push(...res); if (res.length < 100) break;
  }
  const { data: antes } = await db.from("precos_concorrencia").select("*").eq("workspace_id", ws);
  const ant = new Map((antes ?? []).map((a: any) => [a.item_id, a]));
  // Quem foi verificado há mais tempo primeiro: se o tempo acabar, a próxima rodada continua dos outros.
  ids.sort((a, b) => String(ant.get(a)?.verificado_em ?? "").localeCompare(String(ant.get(b)?.verificado_em ?? "")));
  const agora = new Date(), linhas: any[] = [], alertas: { titulo: string; meu: number; menor: number }[] = [], porProduto = new Map<string, any[]>();
  for (let i = 0; i < ids.length && Date.now() < deadline - 3000; i += 20) {
    const lote = await get(tok, `/items?ids=${ids.slice(i, i + 20).join(",")}&attributes=id,title,price,catalog_product_id,catalog_listing,permalink,thumbnail,seller_custom_field,attributes`);
    for (const x of (lote ?? []) as any[]) {
      if (x?.code !== 200 || Date.now() > deadline - 3000) continue;
      const it = x.body, pid = it.catalog_product_id ? String(it.catalog_product_id) : null, meu = it.price != null ? Number(it.price) : null;
      const sku = it.seller_custom_field || (it.attributes ?? []).find((a: any) => a.id === "SELLER_SKU")?.value_name || null;
      let menor: number | null = null, menorItem: string | null = null, conc = 0, ptw: number | null = null, disputa: string | null = null;
      if (pid) {
        let lst = porProduto.get(pid);
        if (!lst) { lst = (await get(tok, `/products/${pid}/items?limit=100`))?.results ?? []; porProduto.set(pid, lst!); }
        for (const o of lst!) { if (String(o.seller_id) === uid || !(Number(o.price) > 0)) continue; conc++; if (menor == null || Number(o.price) < menor) { menor = Number(o.price); menorItem = String(o.item_id); } }
      }
      if (it.catalog_listing) { const p = await get(tok, `/items/${it.id}/price_to_win?siteId=MLB&version=v2`); if (p) { ptw = p.price_to_win != null ? Number(p.price_to_win) : null; disputa = p.status ?? null; } }
      const a = ant.get(it.id);
      if (baixou(a, menor, meu)) alertas.push({ titulo: String(it.title).slice(0, 60), meu: meu!, menor: menor! });
      linhas.push({
        workspace_id: ws, item_id: it.id, sku, titulo: it.title, link: it.permalink, foto: it.thumbnail, produto_catalogo: pid, catalogo: !!it.catalog_listing,
        meu_preco: meu, menor_preco: menor, menor_item: menorItem, concorrentes: conc, situacao: pid ? classificar(meu, menor, disputa) : "sem_catalogo", preco_para_ganhar: ptw,
        historico: novoHistorico(a?.historico ?? [], meu, menor, agora), verificado_em: agora.toISOString(),
      });
    }
  }
  for (let i = 0; i < linhas.length; i += 200) { const { error } = await db.from("precos_concorrencia").upsert(linhas.slice(i, i + 200), { onConflict: "workspace_id,item_id" }); if (error) throw error; }
  // Anúncios que deixaram de estar ativos saem da lista (a leitura da lista de ativos precisa ter sido completa).
  if (ids.length && ids.length < 1000) { const fora = (antes ?? []).map((a: any) => a.item_id).filter((x: string) => !ids.includes(x)); if (fora.length) await db.from("precos_concorrencia").delete().eq("workspace_id", ws).in("item_id", fora.slice(0, 500)); }
  return { ativos: ids.length, verificados: linhas.length, com_concorrencia: linhas.filter((l) => l.concorrentes > 0).length, mais_caros: linhas.filter((l) => ["mais_caro", "perdendo"].includes(l.situacao)).length, alertas, em: agora.toISOString() };
}

/** Altera o preço de anúncios do Mercado Livre (só o que a pessoa confirmou na tela). Anúncio com variações recebe o
 *  mesmo preço em todas. Cada alteração vai para a auditoria e para o histórico do vigia. */
export async function ajustarPrecosML(db: SupabaseClient, ws: string, itens: { item_id: string; preco: number }[], quem: string) {
  const sec = await validSecret(db, ws, "mercadolivre");
  const tok = sec.access_token as string, res: { item_id: string; ok: boolean; antes?: number | null; preco: number; erro?: string }[] = [];
  const put = async (id: string, corpo: unknown) => {
    const r = await fetch(`${API}/items/${id}`, { method: "PUT", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(corpo) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.message || j?.error || `HTTP ${r.status}`);
    return j;
  };
  for (const it of itens.slice(0, 100)) {
    const preco = Math.round(Number(it.preco) * 100) / 100, id = String(it.item_id);
    if (!/^MLB\d+$/.test(id) || !(preco > 0)) { res.push({ item_id: id, ok: false, preco, erro: "Anúncio ou preço inválido." }); continue; }
    try {
      const atual = await get(tok, `/items/${id}?attributes=price,variations`);
      const vars = (atual?.variations ?? []) as any[];
      await put(id, vars.length ? { variations: vars.map((v) => ({ id: v.id, price: preco })) } : { price: preco });
      res.push({ item_id: id, ok: true, antes: atual?.price ?? null, preco });
      const { data: lin } = await db.from("precos_concorrencia").select("menor_preco,historico").eq("workspace_id", ws).eq("item_id", id).maybeSingle();
      if (lin) await db.from("precos_concorrencia").update({ meu_preco: preco, historico: novoHistorico(lin.historico ?? [], preco, lin.menor_preco, new Date()), situacao: classificar(preco, lin.menor_preco) }).eq("workspace_id", ws).eq("item_id", id);
      await db.from("audit_log").insert({ workspace_id: ws, id: crypto.randomUUID(), time: new Date().toISOString(), action: "Preço alterado no Mercado Livre", actor: quem, detail: `${id} · ${atual?.price ?? "?"} → ${preco.toFixed(2)}` }).then(() => null, () => null);
    } catch (e) { res.push({ item_id: id, ok: false, preco, erro: String((e as Error).message ?? e).slice(0, 200) }); }
  }
  return { alterados: res.filter((r) => r.ok).length, falhas: res.filter((r) => !r.ok).length, itens: res };
}
