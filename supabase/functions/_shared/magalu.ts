// API Magalu (seller) — https://developers.magalu.com
// OAuth pelo ID Magalu. O layout de resposta de pedidos é lido de forma tolerante:
// confira a amostra em Integrações › Magalu › "Ver amostra" após a primeira sincronização.
import { callbackUrl, day, env, fetchJson, num, round, sleep } from "./common.ts";
import { uf } from "./shopee.ts";
import { emptyResult, type Provider, type SyncContext } from "./types.ts";

const ID = "https://id.magalu.com";
const API = () => Deno.env.get("MAGALU_API_BASE") || "https://api.magalu.com";
const SCOPES = "open:order-order-seller:read open:order-delivery-seller:read open:order-invoice-seller:read open:order-financial-report-seller:read";

// Toda chamada precisa do X-Tenant-Id (a loja que autorizou). Vem de /account/v1/whoami/tenants.
async function tenantDe(token: string) {
  const r = await fetchJson(`${API()}/account/v1/whoami/tenants`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  const l: any[] = Array.isArray(r) ? r : r?.results ?? r?.data ?? r?.tenants ?? [];
  const t = l.find((x) => /seller/i.test(String(x.type ?? x.tenant_type ?? x.kind ?? ""))) ?? l[0];
  return t ? { tenant: String(t.uuid ?? t.id ?? t.tenant_id), tenant_nome: t.legal_name ?? t.name ?? t.trading_name ?? null, tenant_tipo: t.type ?? null } : {};
}
const get = async (ctx: SyncContext, path: string) => {
  await sleep(150);
  if (!ctx.extra?.tenant) ctx.extra = { ...(ctx.extra ?? {}), ...(await tenantDe(ctx.token)) };
  return fetchJson(`${API()}${path}`, { headers: { Authorization: `Bearer ${ctx.token}`, Accept: "application/json", "X-Tenant-Id": String(ctx.extra?.tenant ?? "") } });
};

// Valores monetários da Magalu podem vir como número, string ou {amount, normalizer}.
const money = (v: any): number => {
  if (v == null) return 0;
  if (typeof v === "object") return num(v.amount ?? v.value ?? v.total) / (num(v.normalizer) || 1);
  return num(v);
};

export const magalu: Provider = {
  id: "magalu",
  label: "Magalu",
  async authorizeUrl(state) {
    const q = new URLSearchParams({
      client_id: env("MAGALU_CLIENT_ID"), redirect_uri: callbackUrl(), scope: Deno.env.get("MAGALU_SCOPES") || SCOPES,
      response_type: "code", choose_tenants: "true", state,
    });
    return `${ID}/login?${q}`;
  },
  async exchange(query) {
    const r = await fetchJson(`${ID}/oauth/token`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: env("MAGALU_CLIENT_ID"), client_secret: env("MAGALU_CLIENT_SECRET"), redirect_uri: callbackUrl(),
        code: query.get("code"), grant_type: "authorization_code",
      }),
    });
    const t = await tenantDe(r.access_token).catch(() => ({} as any));
    return { access_token: r.access_token, refresh_token: r.refresh_token, expires_in: r.expires_in, extra: t, account_name: t.tenant_nome ? `Magalu · ${t.tenant_nome}` : "Seller Magalu" };
  },
  async refresh(secret) {
    const r = await fetchJson(`${ID}/oauth/token`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token", client_id: env("MAGALU_CLIENT_ID"), client_secret: env("MAGALU_CLIENT_SECRET"),
        refresh_token: secret.refresh_token ?? "",
      }),
    });
    return { access_token: r.access_token, refresh_token: r.refresh_token ?? secret.refresh_token, expires_in: r.expires_in, extra: secret.extra ?? {} };
  },
  async sync(ctx) {
    const out = emptyResult();
    let cur = ctx.cursor ?? { offset: 0 };
    while (cur && Date.now() < ctx.deadline) {
      const q = new URLSearchParams({
        _limit: "50", _offset: String(cur.offset), "purchased_at__gte": `${ctx.from}T00:00:00-03:00`, "purchased_at__lte": `${ctx.to}T23:59:59-03:00`,
      });
      const r = await get(ctx, `/seller/v1/orders?${q}`);
      const list: any[] = r?.results ?? r?.data ?? r?.orders ?? (Array.isArray(r) ? r : []);
      for (const o of list) {
        if (!out.sample) out.sample = o;
        const status = String(o.status ?? "").toLowerCase();
        if (status.includes("cancel")) continue;
        const date = day(o.purchased_at ?? o.created_at ?? o.approved_at);
        if (!date || date < ctx.from || date > ctx.to) continue;
        const amounts = o.amounts ?? {};
        const deliveries: any[] = o.deliveries ?? [];
        const items = (o.items ?? deliveries.flatMap((d) => d.items ?? [])).map((it: any) => ({
          sku: String(it.info?.sku ?? it.sku ?? it.product?.sku ?? ""),
          title: String(it.info?.name ?? it.name ?? it.product?.name ?? ""),
          qty: num(it.quantity ?? 1), price: round(money(it.unit_price ?? it.price)),
        }));
        const addr = o.shipping_address ?? deliveries[0]?.shipping?.recipient?.address ?? deliveries[0]?.address ?? {};
        const customer = o.customer ?? deliveries[0]?.shipping?.recipient ?? {};
        const gross = round(money(amounts.total ?? o.total ?? o.total_amount));
        const commission = money(amounts.commission ?? amounts.fees ?? o.commission);
        out.marketOrders.push({
          id: String(o.code ?? o.id), platform: "Magalu", date, gross, fee: round(commission), fee_source: commission ? "Magalu" : null,
          shipping: round(money(amounts.freight ?? o.freight)), due: null, source: "Magalu API", state: uf(addr.state ?? addr.region),
          items, customer: { id: `MGL-${customer.document_number ?? customer.id ?? o.code}`, name: customer.name, doc: customer.document_number, city: addr.city, state: uf(addr.state ?? addr.region) ?? undefined },
          external: { magalu_id: o.id, status: o.status },
        });
      }
      cur = list.length === 50 ? { offset: cur.offset + 50 } : null;
    }
    out.next = cur;
    out.notes.push("Magalu: repasses financeiros ainda entram por importação do extrato (a API de repasses depende de liberação do Magalu).");
    return out;
  },
};
