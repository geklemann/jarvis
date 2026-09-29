// Shopee Open Platform v2 — https://open.shopee.com
// Pedidos (itens, comprador, UF), valor a receber por pedido (escrow) e repasses liberados.
import { callbackUrl, env, fetchJson, hmacHex, num, round, sleep } from "./common.ts";
import { emptyResult, type Provider, type SyncContext } from "./types.ts";

const HOST = () => Deno.env.get("SHOPEE_HOST") || "https://partner.shopeemobile.com";
const pid = () => Number(env("SHOPEE_PARTNER_ID"));
const now = () => Math.floor(Date.now() / 1000);
const DAY = 86400;

// A Shopee só aceita chamadas de IPs cadastrados: com SHOPEE_PROXY_URL definido, tudo passa pelo
// repasse de IP fixo (ops/shopee-proxy), assinado com SHOPEE_PROXY_SECRET.
async function shopeeFetch(url: string, init: RequestInit = {}) {
  const proxy = Deno.env.get("SHOPEE_PROXY_URL");
  if (!proxy) return fetchJson(url, init);
  const alvo = new URL(url).href, ts = String(Date.now()), metodo = init.method || "GET";
  const corpo = typeof init.body === "string" ? init.body : "";
  const assinatura = await hmacHex(env("SHOPEE_PROXY_SECRET"), `${ts}\n${metodo}\n${alvo}\n${corpo}`);
  return fetchJson(proxy, { ...init, method: metodo, headers: { ...(init.headers as Record<string, string> ?? {}), "x-alvo": alvo, "x-ts": ts, "x-assinatura": assinatura } });
}

async function signed(path: string, extra = "") {
  const ts = now();
  const sign = await hmacHex(env("SHOPEE_PARTNER_KEY"), `${pid()}${path}${ts}${extra}`);
  return new URLSearchParams({ partner_id: String(pid()), timestamp: String(ts), sign });
}

async function shopGet(ctx: SyncContext, path: string, params: Record<string, string>) {
  await sleep(100);
  const shop = String(ctx.extra.shop_id);
  const q = await signed(path, `${ctx.token}${shop}`);
  q.set("access_token", ctx.token); q.set("shop_id", shop);
  for (const [k, v] of Object.entries(params)) q.set(k, v);
  const r = await shopeeFetch(`${HOST()}${path}?${q}`);
  if (r?.error) throw new Error(`Shopee ${path}: ${r.error} ${r.message ?? ""}`);
  return r?.response ?? {};
}

async function tokenCall(path: string, body: Record<string, unknown>) {
  const q = await signed(path);
  const r = await shopeeFetch(`${HOST()}${path}?${q}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, partner_id: pid() }),
  });
  if (r?.error) throw new Error(`Shopee: ${r.error} ${r.message ?? ""}`);
  return r;
}

const epoch = (d: string, end = false) => Math.floor(new Date(`${d}T${end ? "23:59:59" : "00:00:00"}-03:00`).getTime() / 1000);
const brDate = (s: number) => new Date((s - 3 * 3600) * 1000).toISOString().slice(0, 10);

export const shopee: Provider = {
  id: "shopee",
  label: "Shopee",
  async authorizeUrl(state) {
    const path = "/api/v2/shop/auth_partner";
    const q = await signed(path);
    q.set("redirect", `${callbackUrl()}?state=${encodeURIComponent(state)}`);
    return `${HOST()}${path}?${q}`;
  },
  async exchange(query) {
    const shop_id = Number(query.get("shop_id"));
    const r = await tokenCall("/api/v2/auth/token/get", { code: query.get("code"), shop_id });
    return { access_token: r.access_token, refresh_token: r.refresh_token, expires_in: r.expire_in, extra: { shop_id }, account_name: `Loja ${shop_id}` };
  },
  async refresh(secret) {
    const shop_id = Number(secret.extra.shop_id);
    const r = await tokenCall("/api/v2/auth/access_token/get", { refresh_token: secret.refresh_token, shop_id });
    return { access_token: r.access_token, refresh_token: r.refresh_token, expires_in: r.expire_in, extra: { shop_id } };
  },
  async sync(ctx) {
    const out = emptyResult();
    const start = epoch(ctx.from), end = epoch(ctx.to, true);
    let cur = ctx.cursor ?? { phase: "orders", win: start, cursor: "" };
    while (cur && Date.now() < ctx.deadline) {
      const winEnd = Math.min(cur.win + 15 * DAY - 1, end);
      if (cur.phase === "orders") {
        const r = await shopGet(ctx, "/api/v2/order/get_order_list", {
          time_range_field: "create_time", time_from: String(cur.win), time_to: String(winEnd), page_size: "50", cursor: cur.cursor,
        });
        const sns: string[] = (r.order_list ?? []).map((o: any) => o.order_sn);
        if (sns.length) {
          const d = await shopGet(ctx, "/api/v2/order/get_order_detail", {
            order_sn_list: sns.join(","),
            response_optional_fields: "buyer_user_id,buyer_username,item_list,recipient_address,total_amount,order_status,pay_time,estimated_shipping_fee",
          });
          for (const o of d.order_list ?? []) {
            if (!out.sample) out.sample = o;
            if (o.order_status === "CANCELLED" || o.order_status === "UNPAID") continue;
            const esc = await shopGet(ctx, "/api/v2/payment/get_escrow_detail", { order_sn: o.order_sn }).catch(() => null);
            const income = esc?.order_income ?? {};
            const gross = round(num(o.total_amount));
            const expected = num(income.escrow_amount);
            const addr = o.recipient_address ?? {};
            out.marketOrders.push({
              id: o.order_sn, platform: "Shopee", date: brDate(o.create_time), gross,
              fee: expected ? round(Math.max(0, gross - expected)) : 0, fee_source: expected ? "Shopee" : null,
              shipping: round(num(income.actual_shipping_fee)), due: null, source: "Shopee API",
              state: uf(addr.state), items: (o.item_list ?? []).map((it: any) => ({
                sku: String(it.model_sku || it.item_sku || it.item_id), title: String(it.item_name ?? ""),
                qty: num(it.model_quantity_purchased), price: round(num(it.model_discounted_price ?? it.model_original_price)),
              })),
              customer: { id: `SHP-${o.buyer_user_id}`, name: addr.name || o.buyer_username, city: addr.city, state: uf(addr.state) ?? undefined },
              // renda: todos os valores da renda do pedido (comissão, serviço, rebates e cupons da Shopee, frete...), para a
              // margem usar o que a Shopee realmente cobrou e devolveu, e não percentuais fixos.
              external: { status: o.order_status, buyer_username: o.buyer_username, commission_fee: income.commission_fee, service_fee: income.service_fee,
                renda: Object.fromEntries(Object.entries(income).filter(([, v]) => typeof v === "number" && v !== 0).map(([k, v]) => [k, round(v as number)])) },
            });
          }
        }
        if (r.more) cur = { ...cur, cursor: r.next_cursor };
        else if (winEnd < end) cur = { phase: "orders", win: winEnd + 1, cursor: "" };
        else cur = { phase: "escrow", win: start, page: 1 };
      } else {
        const r = await shopGet(ctx, "/api/v2/payment/get_escrow_list", {
          release_time_from: String(cur.win), release_time_to: String(winEnd), page_size: "100", page_no: String(cur.page),
        });
        for (const e of r.escrow_list ?? []) {
          out.receipts.push({
            id: `SHP-${e.order_sn}`, order_id: e.order_sn, platform: "Shopee", account: "Shopee",
            date: brDate(e.escrow_release_time), amount: round(num(e.payout_amount)), source: "Shopee API", kind: "liberacao",
            description: "Repasse do pedido",
          });
        }
        if (r.more) cur = { ...cur, page: cur.page + 1 };
        else if (winEnd < end) cur = { phase: "escrow", win: winEnd + 1, page: 1 };
        else cur = null;
      }
    }
    out.next = cur;
    return out;
  },
};

const UFS: Record<string, string> = {
  acre: "AC", alagoas: "AL", amapa: "AP", amazonas: "AM", bahia: "BA", ceara: "CE", "distrito federal": "DF", "espirito santo": "ES",
  goias: "GO", maranhao: "MA", "mato grosso": "MT", "mato grosso do sul": "MS", "minas gerais": "MG", para: "PA", paraiba: "PB",
  parana: "PR", pernambuco: "PE", piaui: "PI", "rio de janeiro": "RJ", "rio grande do norte": "RN", "rio grande do sul": "RS",
  rondonia: "RO", roraima: "RR", "santa catarina": "SC", "sao paulo": "SP", sergipe: "SE", tocantins: "TO",
};
export function uf(s: unknown): string | null {
  const v = String(s ?? "").trim();
  if (!v) return null;
  if (/^[A-Za-z]{2}$/.test(v)) return v.toUpperCase();
  return UFS[v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()] ?? null;
}

