// Bling API v3 — https://developer.bling.com.br
// Pedidos de venda (origem fiscal), itens, cliente/UF, taxas e contas a receber / a pagar.
import { day, env, fetchJson, num, round, sleep } from "./common.ts";
import { emptyResult, type OrderRow, type Platform, type Provider, type PurchaseRow, type SyncContext } from "./types.ts";

const AUTHORIZE = "https://www.bling.com.br/Api/v3/oauth/authorize";
const api = () => Deno.env.get("BLING_API_BASE") || "https://api.bling.com.br/Api/v3";
const basic = () => "Basic " + btoa(`${env("BLING_CLIENT_ID")}:${env("BLING_CLIENT_SECRET")}`);

async function token(body: Record<string, string>) {
  const r = await fetchJson(`${api()}/oauth/token`, {
    method: "POST",
    headers: { Authorization: basic(), "Content-Type": "application/x-www-form-urlencoded", Accept: "1.0" },
    body: new URLSearchParams(body),
  });
  return { access_token: r.access_token, refresh_token: r.refresh_token, expires_in: r.expires_in };
}

async function get(ctx: SyncContext, path: string) {
  await sleep(350); // limite do Bling: 3 requisições por segundo
  return fetchJson(`${api()}${path}`, { headers: { Authorization: `Bearer ${ctx.token}`, Accept: "application/json" } });
}

/** Identifica o marketplace do pedido: 1) mapeamento salvo por loja; 2) padrão do número do pedido na loja. */
function platformOf(p: any, settings: Record<string, any>): Platform | "ignorar" | null {
  const lojaId = String(p.loja?.id ?? "0");
  const mapped = settings.lojas?.[lojaId];
  if (mapped) return mapped === "Ignorar" ? "ignorar" : mapped;
  const n = String(p.numeroLoja ?? "").trim();
  if (/^2\d{9,15}$/.test(n)) return "Mercado Livre";
  if (/^\d{6}[0-9A-Z]{8}$/.test(n)) return "Shopee"; // order_sn: AAMMDD + 8 caracteres
  return null;
}

export const bling: Provider = {
  id: "bling",
  label: "Bling",
  async authorizeUrl(state) {
    const q = new URLSearchParams({ response_type: "code", client_id: env("BLING_CLIENT_ID"), state });
    return `${AUTHORIZE}?${q}`;
  },
  async exchange(query) {
    const t = await token({ grant_type: "authorization_code", code: query.get("code") ?? "" });
    return { ...t, account_name: "Bling" };
  },
  async refresh(secret) {
    return token({ grant_type: "refresh_token", refresh_token: secret.refresh_token ?? "" });
  },
  async sync(ctx) {
    const out = emptyResult();
    out.unmapped = {};
    // Etapas na ordem; um job pode pedir só algumas (ex.: histórico só de notas de entrada).
    // Contas a receber e a pagar não vêm mais do ERP de origem (fase 1, 01/10/2026): o financeiro é só do Jarvis.
    // Notas de entrada seguem enquanto a leitura direta da SEFAZ não estiver confirmada; depois saem também.
    const FASES = ["pedidos", "entradas"].filter((f) => !ctx.fases?.length || ctx.fases.includes(f));
    const depois = (f: string) => { const i = FASES.indexOf(f); return i >= 0 && i + 1 < FASES.length ? { phase: FASES[i + 1], page: 1, idx: 0 } : null; };
    let cur = ctx.cursor ?? (FASES.length ? { phase: FASES[0], page: 1, idx: 0 } : null);
    const cancelled = new Set((ctx.settings.situacoesIgnoradas ?? [12]).map(String));

    while (cur && Date.now() < ctx.deadline) {
      if (cur.phase === "pedidos") {
        const q = new URLSearchParams({ pagina: String(cur.page), limite: "100", dataInicial: ctx.from, dataFinal: ctx.to });
        const list = (await get(ctx, `/pedidos/vendas?${q}`))?.data ?? [];
        for (let i = cur.idx; i < list.length; i++) {
          if (Date.now() > ctx.deadline) { out.next = { ...cur, idx: i }; return out; }
          const head = list[i];
          if (cancelled.has(String(head.situacao?.id))) continue;
          const p = (await get(ctx, `/pedidos/vendas/${head.id}`))?.data ?? head;
          if (!out.sample) out.sample = p;
          const platform = platformOf(p, ctx.settings);
          if (platform === "ignorar") continue;
          if (!platform) {
            const k = String(p.loja?.id ?? "0");
            const u = out.unmapped[k] ??= { count: 0, sample: String(p.numeroLoja ?? p.numero), name: p.intermediador?.nomeUsuario };
            u.count++;
            continue;
          }
          const etiqueta = p.transporte?.etiqueta ?? {};
          const contato = p.contato ?? {};
          const row: OrderRow = {
            id: String(p.numeroLoja || `BLING-${p.numero}`),
            platform,
            date: day(p.data)!,
            gross: round(num(p.total)),
            fee: round(num(p.taxas?.taxaComissao)),
            fee_source: num(p.taxas?.taxaComissao) ? "Bling" : null,
            nf: p.notaFiscal?.id ? String(p.notaFiscal.numero ?? p.notaFiscal.id) : null,
            due: null,
            source: "Bling API",
            shipping: round(num(p.transporte?.frete ?? p.taxas?.custoFrete)),
            state: (etiqueta.uf || contato.endereco?.uf || null)?.toUpperCase?.() ?? null,
            customer: {
              id: String(contato.id ?? ""), name: contato.nome, doc: contato.numeroDocumento,
              city: etiqueta.municipio || contato.endereco?.municipio, state: etiqueta.uf || contato.endereco?.uf,
            },
            items: (p.itens ?? []).map((it: any) => ({
              sku: String(it.codigo || it.produto?.id || ""), title: String(it.descricao ?? ""),
              qty: num(it.quantidade), price: round(num(it.valor)),
            })),
            external: { bling_id: p.id, bling_numero: p.numero, loja_id: p.loja?.id, situacao: p.situacao?.id },
          };
          out.fiscalOrders.push(row);
        }
        cur = list.length === 100 ? { phase: "pedidos", page: cur.page + 1, idx: 0 } : depois("pedidos");
      } else if (cur.phase === "receber") {
        const q = new URLSearchParams({ pagina: String(cur.page), limite: "100", dataInicial: ctx.from, dataFinal: ctx.to, tipoFiltroData: "V" });
        const list = (await get(ctx, `/contas/receber?${q}`))?.data ?? [];
        for (const c of list) out.ledger.push(ledgerRow(c, "entrada"));
        cur = list.length === 100 ? { phase: "receber", page: cur.page + 1 } : depois("receber");
      } else if (cur.phase === "pagar") {
        const q = new URLSearchParams({ pagina: String(cur.page), limite: "100", dataVencimentoInicial: ctx.from, dataVencimentoFinal: ctx.to });
        const list = (await get(ctx, `/contas/pagar?${q}`))?.data ?? [];
        for (const c of list) out.ledger.push(ledgerRow(c, "saida"));
        cur = list.length === 100 ? { phase: "pagar", page: cur.page + 1 } : depois("pagar");
      } else if (cur.phase === "entradas") {
        // Notas fiscais de entrada (tipo 0): compras de fornecedores viram títulos a pagar no EcomBalance.
        const q = new URLSearchParams({ pagina: String(cur.page), limite: "100", tipo: "0", dataEmissaoInicial: `${ctx.from} 00:00:00`, dataEmissaoFinal: `${ctx.to} 23:59:59` });
        const list = (await get(ctx, `/nfe?${q}`))?.data ?? [];
        for (let i = cur.idx ?? 0; i < list.length; i++) {
          if (Date.now() > ctx.deadline) { out.next = { ...cur, idx: i }; return out; }
          const n = (await get(ctx, `/nfe/${list[i].id}`))?.data ?? list[i];
          out.purchases!.push(notaEntrada(n));
        }
        cur = list.length === 100 ? { phase: "entradas", page: cur.page + 1, idx: 0 } : depois("entradas");
      } else cur = null;
    }
    out.next = cur;
    const miss = Object.values(out.unmapped).reduce((a, u) => a + u.count, 0);
    if (miss) out.notes.push(`${miss} pedidos do Bling sem marketplace identificado. Associe as lojas em Integrações.`);
    return out;
  },
};

const situacoes: Record<string, string> = { "1": "Em aberto", "2": "Liquidada", "3": "Parcial", "4": "Devolvida", "5": "Cancelada" };

function ledgerRow(c: any, kind: "entrada" | "saida") {
  return {
    id: `BLING-${kind === "entrada" ? "CR" : "CP"}-${c.id}`,
    kind,
    due: day(c.vencimento),
    paid_date: day(c.dataPagamento ?? c.dataRecebimento ?? null),
    amount: round(num(c.valor)),
    status: situacoes[String(c.situacao)] ?? String(c.situacao ?? ""),
    category: c.categoria?.descricao ?? (c.categoria?.id ? String(c.categoria.id) : null),
    contact: c.contato?.nome ?? (c.contato?.id ? `Contato ${c.contato.id}` : null),
    description: c.historico ?? c.numeroDocumento ?? null,
    source: "Bling API",
  };
}

const situacoesNfe: Record<string, string> = { "1": "Pendente", "2": "Cancelada", "3": "Aguardando recibo", "4": "Rejeitada", "5": "Autorizada", "6": "Emitida DANFE", "7": "Registrada", "8": "Aguardando protocolo", "9": "Denegada", "10": "Consulta situação", "11": "Bloqueada" };

/** Tipo da entrada pelo CFOP: devolução de venda, compra (gera contas a pagar) ou outras (remessas, bonificações…). */
function tipoEntrada(cfop: string): PurchaseRow["tipo"] {
  const c = cfop.replace(/\D/g, "");
  const f = c.slice(1);
  if (/^(201|202|203|204|208|209|410|411|503|553|555|660|661|662)$/.test(f)) return "devolucao";
  if (/^(101|102|111|113|116|117|118|120|121|122|124|125|126|128|252|253|301|302|303|304|305|306|351|352|353|354|355|356|401|403|406|407|551|556|651|652|653|932|933)$/.test(f)) return "compra";
  return c ? "outros" : "compra";
}

function notaEntrada(n: any): PurchaseRow {
  const itens = (n.itens ?? []).map((it: any) => ({ sku: String(it.codigo ?? ""), descricao: it.descricao, qtd: num(it.quantidade), valor: round(num(it.valor)), total: round(num(it.valorTotal ?? num(it.valor) * num(it.quantidade))), cfop: it.cfop ?? null, ncm: it.classificacaoFiscal ?? null }));
  const cfop = String(n.itens?.[0]?.cfop ?? n.naturezaOperacao?.cfop ?? "");
  const valor = round(num(n.valorNota ?? n.valorTotal ?? itens.reduce((a: number, i: any) => a + i.total, 0)));
  const parcelas = (n.parcelas ?? []).map((p: any) => ({ data: day(p.data ?? p.dataVencimento), valor: round(num(p.valor)), forma: p.formaPagamento?.descricao ?? (p.formaPagamento?.id ? String(p.formaPagamento.id) : null), obs: p.observacoes ?? p.observacao ?? null }));
  return {
    id: `BLING-NFE-${n.id}`, numero: n.numero ? String(n.numero) : null, serie: n.serie != null ? String(n.serie) : null, chave: n.chaveAcesso ?? null,
    emissao: day(n.dataEmissao ?? n.dataOperacao), fornecedor: n.contato?.nome ?? null, fornecedor_doc: n.contato?.numeroDocumento ?? null,
    valor, cfop: cfop || null, natureza: n.naturezaOperacao?.descricao ?? (n.naturezaOperacao?.id ? String(n.naturezaOperacao.id) : null),
    tipo: tipoEntrada(cfop), situacao: situacoesNfe[String(n.situacao)] ?? (n.situacao != null ? String(n.situacao) : null),
    itens, parcelas, raw: { ...n, xml: undefined, itens: undefined }, source: "Bling API",
  };
}
