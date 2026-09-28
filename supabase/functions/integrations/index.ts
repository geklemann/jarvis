// Conectar, sincronizar e desconectar Bling, Mercado Livre, Shopee e Magalu.
// A sincronização é um "job" guardado em integrations.settings.job: cada chamada avança até ~110 s e
// grava o ponto de parada. Quem avança o job é o navegador (enquanto aberto) ou o pg_cron a cada 2 min,
// então fechar a página não interrompe nada.
import { admin, authorize, env, handler, HttpError, json, signState } from "../_shared/common.ts";
import { persist, provider, providers, validSecret } from "../_shared/store.ts";
import { importShopeeIncome } from "../_shared/shopee_central.ts";
import { responderML, sincronizarAtendimentoML } from "../_shared/atendimento_ml.ts";
import { sugerirAtendimento } from "../_shared/atendimento_ia.ts";
import { lerContaPagar } from "../_shared/leitura_conta.ts";
import { detalheRecebida, manifestar, sincronizarRecebidas } from "../_shared/nfe_recebidas.ts";
import { depositosBling, etiquetasBling, lancarEstoqueBling } from "../_shared/expedicao_bling.ts";
import { detalhesFiscaisBling, fotosHdBling, sincronizarEstoqueBling } from "../_shared/estoque_bling.ts";
import { lerRegrasFiscaisBling } from "../_shared/regras_bling.ts";
import { cancelarNFe, configFiscal, consultarNFe, diagnosticoFiscal, emitirNFe, emitirVendaDireta, processarFilaFiscal, statusFiscal, simularNota, emitirAvulsa, cartaCorrecao } from "../_shared/nfe_focus.ts";
import { executarReguasML } from "../_shared/reguas_ml.ts";
import { anunciosBling, canaisBling, criarAnuncioBling, enviarFotoProduto, precoLojaBling, salvarProdutoBling, situacaoAnuncioBling, vinculosBling } from "../_shared/catalogo_bling.ts";

const required: Record<string, string[]> = {
  bling: ["BLING_CLIENT_ID", "BLING_CLIENT_SECRET"],
  mercadolivre: ["ML_CLIENT_ID", "ML_CLIENT_SECRET"],
  shopee: ["SHOPEE_PARTNER_ID", "SHOPEE_PARTNER_KEY"],
  magalu: ["MAGALU_CLIENT_ID", "MAGALU_CLIENT_SECRET"],
};
const BUDGET_MS = 110_000; // Edge Functions encerram em ~150 s; paramos antes e gravamos o cursor.
const LOCK_MS = 140_000;
const HOURLY_MS = 60 * 60_000;
const ATENDIMENTO_MS = 10 * 60_000; // reclamações, perguntas e mensagens: a cada 10 minutos
const ESTOQUE_MS = 60 * 60_000; // produtos, custo e saldo do Bling: de hora em hora

type Db = ReturnType<typeof admin>;
interface Job { from: string; to: string; fases?: string[]; cursor: unknown; locked_until?: number | null; started_at?: string; saved?: Record<string, number> }

const readSettings = async (db: Db, ws: string, id: string) =>
  ((await db.from("integrations").select("settings").eq("workspace_id", ws).eq("provider", id).maybeSingle()).data?.settings ?? {}) as Record<string, any>;

async function writeSettings(db: Db, ws: string, id: string, change: (s: Record<string, any>) => void, extra: Record<string, unknown> = {}) {
  const settings = await readSettings(db, ws, id);
  change(settings);
  await db.from("integrations").update({ settings, updated_at: new Date().toISOString(), ...extra }).eq("workspace_id", ws).eq("provider", id);
}

/** Uma rodada de sincronização a partir do cursor informado. */
async function runRound(db: Db, ws: string, id: string, job: Job, deadline: number) {
  const settings = await readSettings(db, ws, id);
  const secret = await validSecret(db, ws, id);
  const res = await provider(id).sync({ token: secret.access_token, extra: secret.extra ?? {}, settings, from: job.from, to: job.to, cursor: job.cursor, deadline, fases: job.fases });
  const saved = await persist(db, ws, res);
  return { res, saved };
}

/** Avança o job de sincronização (se não houver outro processo avançando o mesmo job agora). */
async function advanceJob(db: Db, ws: string, id: string, deadline: number) {
  const settings = await readSettings(db, ws, id);
  const job = settings.job as Job | undefined;
  if (!job) return { done: true, saved: {}, notes: [] as string[] };
  if (job.locked_until && job.locked_until > Date.now()) return { busy: true, done: false, saved: job.saved ?? {}, notes: [] as string[] };
  await writeSettings(db, ws, id, (s) => { s.job = { ...job, locked_until: Date.now() + LOCK_MS }; });
  try {
    const { res, saved } = await runRound(db, ws, id, job, deadline);
    const total = { ...(job.saved ?? {}) };
    for (const [k, v] of Object.entries(saved)) total[k] = (total[k] ?? 0) + v;
    const done = !res.next;
    await writeSettings(db, ws, id, (s) => {
      if (res.unmapped && Object.keys(res.unmapped).length) s.lojasPendentes = { ...(s.lojasPendentes ?? {}), ...res.unmapped };
      if (res.sample) s.amostra = res.sample;
      if (done) { delete s.job; s.ultimoJob = { from: job.from, to: job.to, saved: total, fim: new Date().toISOString() }; }
      else s.job = { ...job, cursor: res.next, locked_until: null, saved: total };
    }, { status: "conectado", last_error: null, ...(done ? { last_sync: new Date().toISOString() } : {}) });
    return { done, saved: total, notes: res.notes, unmapped: res.unmapped ?? {} };
  } catch (e) {
    const msg = e instanceof Error ? e.message : (e as any)?.message ? [(e as any).message, (e as any).details, (e as any).hint].filter(Boolean).join(" · ") : JSON.stringify(e);
    await writeSettings(db, ws, id, (s) => { if (s.job) s.job.locked_until = null; }, { status: "erro", last_error: msg });
    throw e;
  }
}

async function startJob(db: Db, ws: string, id: string, from: string, to: string) {
  await writeSettings(db, ws, id, (s) => {
    const j = s.job as Job | undefined;
    if (j && j.from === from && j.to === to) return; // mesmo período: continua de onde parou
    if (j?.locked_until && j.locked_until > Date.now()) throw new HttpError(409, "Já existe uma sincronização em andamento. Aguarde terminar.");
    s.job = { from, to, cursor: null, locked_until: null, started_at: new Date().toISOString(), saved: {} };
  });
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Compras da própria conta como comprador: pedidos no Mercado Livre e pagamentos feitos pelo Mercado Pago. */
async function comprasMercadoLivre(db: Db, ws: string, desde: string) {
  const sec = await validSecret(db, ws, "mercadolivre");
  const uid = sec.extra?.user_id, auth = { Authorization: `Bearer ${sec.access_token}` };
  const get = async (u: string) => { const r = await fetch(u, { headers: auth }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`${r.status} ${j?.message ?? ""} ${u.split("?")[0]}`); return j; };
  const rows: Record<string, unknown>[] = [];
  const from = `${desde}T00:00:00.000-03:00`;
  for (let off = 0; off < 2000; off += 50) {
    const j = await get(`https://api.mercadolibre.com/orders/search?buyer=${uid}&order.date_created.from=${encodeURIComponent(from)}&sort=date_desc&limit=50&offset=${off}`);
    for (const o of j.results ?? []) rows.push({
      workspace_id: ws, id: `ML-${o.id}`, origem: "ml_pedido", data: o.date_created, valor: o.paid_amount ?? o.total_amount, status: o.status,
      vendedor: o.seller?.nickname ?? String(o.seller?.id ?? ""), descricao: (o.order_items ?? []).map((x: any) => x.item?.title).filter(Boolean).join(" · "),
      itens: (o.order_items ?? []).map((x: any) => ({ titulo: x.item?.title, qtd: x.quantity, unitario: x.unit_price })),
      pagamentos: (o.payments ?? []).map((p: any) => ({ id: p.id, tipo: p.payment_type, metodo: p.payment_method_id, valor: p.total_paid_amount, aprovado: p.date_approved, status: p.status })),
      raw: { pack_id: o.pack_id, shipping: o.shipping?.id }, updated_at: new Date().toISOString(),
    });
    if ((j.results ?? []).length < 50) break;
  }
  let mp = 0;
  try {
    for (let off = 0; off < 2000; off += 100) {
      const j = await get(`https://api.mercadopago.com/v1/payments/search?payer.id=${uid}&range=date_created&begin_date=${encodeURIComponent(from)}&end_date=NOW&sort=date_created&criteria=desc&limit=100&offset=${off}`);
      for (const p of j.results ?? []) { mp++; rows.push({
        workspace_id: ws, id: `MP-${p.id}`, origem: "mp_pagamento", data: p.date_approved ?? p.date_created, valor: p.transaction_amount, status: p.status,
        vendedor: p.collector?.nickname ?? p.statement_descriptor ?? String(p.collector_id ?? ""), descricao: p.description ?? (p.additional_info?.items ?? []).map((x: any) => x.title).join(" · "),
        itens: p.additional_info?.items ?? null, pagamentos: [{ id: p.id, tipo: p.payment_type_id, metodo: p.payment_method_id, valor: p.transaction_details?.total_paid_amount ?? p.transaction_amount, aprovado: p.date_approved, status: p.status }],
        raw: { order: p.order, operation_type: p.operation_type, external_reference: p.external_reference }, updated_at: new Date().toISOString(),
      }); }
      if ((j.results ?? []).length < 100) break;
    }
  } catch (e) { rows.push(); console.warn("mp payments", String(e)); }
  const uniq = [...new Map(rows.map((r) => [r.id as string, r])).values()];
  for (let k = 0; k < uniq.length; k += 200) { const { error } = await db.from("compras_marketplace").upsert(uniq.slice(k, k + 200), { onConflict: "workspace_id,id" }); if (error) throw error; }
  return { pedidos: uniq.filter((r) => r.origem === "ml_pedido").length, pagamentos_mp: mp };
}

Deno.serve(handler(async (req) => {
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");

  // pg_cron: avança jobs pendentes e, de hora em hora, sincroniza os últimos 7 dias de cada integração.
  if (action === "cron") {
    if (!Deno.env.get("CRON_SECRET") || req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) throw new HttpError(401, "não autorizado");
    const db = admin();
    const deadline = Date.now() + BUDGET_MS;
    const { data } = await db.from("integrations").select("workspace_id,provider,settings,last_sync,updated_at").in("status", ["conectado", "erro"]);
    // Quem foi atendido há mais tempo vai primeiro, e o tempo da rodada é dividido entre as integrações.
    const list = (data ?? []).sort((a, b) => String(a.updated_at).localeCompare(String(b.updated_at)));
    const report = [];
    // Tarefa "compras": compras feitas pela própria conta no Mercado Livre / Mercado Pago (como comprador).
    // Pedida à mão (settings.tarefas.compras = data inicial) ou automática uma vez por dia (últimos 30 dias).
    const diaria = (x: any) => !x.settings?.ultimaTarefa?.fim || Date.now() - new Date(x.settings.ultimaTarefa.fim).getTime() > 24 * 3600_000;
    for (const i of list.filter((x) => x.provider === "mercadolivre" && (x.settings?.tarefas?.compras || diaria(x)))) {
      try {
        const r = await comprasMercadoLivre(db, i.workspace_id, String(i.settings?.tarefas?.compras ?? iso(new Date(Date.now() - 30 * 86400_000))));
        await writeSettings(db, i.workspace_id, i.provider, (s) => { delete s.tarefas?.compras; s.ultimaTarefa = { compras: r, fim: new Date().toISOString() }; });
        report.push({ workspace_id: i.workspace_id, compras: r });
      } catch (e) { report.push({ workspace_id: i.workspace_id, compras_erro: String(e) }); }
    }
    // Atendimento pós-venda (Mercado Livre): fila de reclamações, devoluções, perguntas e mensagens.
    for (const i of list.filter((x) => x.provider === "mercadolivre" && (!x.settings?.atendimento?.fim || Date.now() - new Date(x.settings.atendimento.fim).getTime() > ATENDIMENTO_MS))) {
      try {
        const r = await sincronizarAtendimentoML(db, i.workspace_id);
        await writeSettings(db, i.workspace_id, i.provider, (s) => { s.atendimento = { ...r, fim: new Date().toISOString() }; });
        report.push({ workspace_id: i.workspace_id, atendimento: r });
      } catch (e) { report.push({ workspace_id: i.workspace_id, atendimento_erro: String(e) }); }
    }
    // Fiscal: diagnóstico dos tokens e fila de notas de teste (homologação), pedidos pelo suporte em settings do Bling.
    // Regras fiscais praticadas hoje pelo Bling (lidas do XML das notas de venda): pedido manual ou 1x por semana.
    for (const i of list.filter((x) => x.provider === "bling" && (x.settings?.regras_pedido || !x.settings?.regras_fiscais?.em || Date.now() - new Date(x.settings.regras_fiscais.em).getTime() > 7 * 86400_000))) {
      try {
        const r = await lerRegrasFiscaisBling(db, i.workspace_id, Math.min(deadline - 25_000, Date.now() + 80_000));
        await writeSettings(db, i.workspace_id, i.provider, (s) => { delete s.regras_pedido; s.regras_fiscais = r; });
        report.push({ workspace_id: i.workspace_id, regras_fiscais: r.notas_lidas });
      } catch (e) { await writeSettings(db, i.workspace_id, i.provider, (s) => { delete s.regras_pedido; s.regras_fiscais_erro = String(e).slice(0, 300); }); }
    }
    for (const i of list.filter((x) => x.provider === "bling" && (x.settings?.fiscal_diag_pedido || (x.settings?.fiscal_fila ?? []).length))) {
      try {
        const diag = i.settings?.fiscal_diag_pedido ? await diagnosticoFiscal() : undefined;
        const fila = (i.settings?.fiscal_fila ?? []) as string[];
        const res = fila.length ? await processarFilaFiscal(db, i.workspace_id, fila) : undefined;
        await writeSettings(db, i.workspace_id, i.provider, (s) => { delete s.fiscal_diag_pedido; s.fiscal_fila = []; if (diag) s.fiscal_diag = { ...diag, em: new Date().toISOString() }; if (res) s.fiscal_testes = { res, em: new Date().toISOString() }; });
        report.push({ workspace_id: i.workspace_id, fiscal: { diag, res } });
      } catch (e) { report.push({ workspace_id: i.workspace_id, fiscal_erro: String(e) }); }
    }
    // Réguas de relacionamento (Mercado Livre): de hora em hora, só para as réguas ligadas no portal.
    for (const i of list.filter((x) => x.provider === "mercadolivre" && (!x.settings?.reguas?.fim || Date.now() - new Date(x.settings.reguas.fim).getTime() > HOURLY_MS))) {
      try {
        const r = await executarReguasML(db, i.workspace_id);
        await writeSettings(db, i.workspace_id, i.provider, (s) => { s.reguas = { ...r, fim: new Date().toISOString() }; });
        report.push({ workspace_id: i.workspace_id, reguas: r });
      } catch (e) {
        await writeSettings(db, i.workspace_id, i.provider, (s) => { s.reguas = { erro: String(e).slice(0, 300), fim: new Date().toISOString() }; });
        report.push({ workspace_id: i.workspace_id, reguas_erro: String(e) });
      }
    }
    // Catálogo: diagnóstico sob demanda (só leitura no Bling) — canais e quantidade de vínculos por loja.
    for (const i of list.filter((x) => x.provider === "bling" && x.settings?.catalogo_diag_pedido)) {
      try {
        const r = await vinculosBling(db, i.workspace_id, Math.min(deadline - 20_000, Date.now() + 60_000));
        const porLoja: Record<string, number> = {};
        for (const v of r.vinculos) porLoja[v.lojaNome] = (porLoja[v.lojaNome] ?? 0) + 1;
        await writeSettings(db, i.workspace_id, i.provider, (s) => { delete s.catalogo_diag_pedido; s.catalogo_diag = { canais: r.canais, porLoja, total: r.vinculos.length, em: r.em }; });
      } catch (e) { await writeSettings(db, i.workspace_id, i.provider, (s) => { delete s.catalogo_diag_pedido; s.catalogo_diag = { erro: String(e).slice(0, 400), em: new Date().toISOString() }; }); }
    }
    // Estoque (Bling): produtos, custo e saldo.
    for (const i of list.filter((x) => x.provider === "bling" && (!x.settings?.estoque?.fim || Date.now() - new Date(x.settings.estoque.fim).getTime() > ESTOQUE_MS))) {
      try {
        const r = { ...(await sincronizarEstoqueBling(db, i.workspace_id, Math.min(deadline - 20_000, Date.now() + 60_000))), ...(await detalhesFiscaisBling(db, i.workspace_id, 60).catch((e) => ({ fiscais_erro: String(e) }))), ...(await fotosHdBling(db, i.workspace_id, 40, Math.min(deadline - 10_000, Date.now() + 45_000)).catch((e) => ({ fotos_hd_erro: String(e) }))) };
        await writeSettings(db, i.workspace_id, i.provider, (s) => { s.estoque = { ...r, fim: new Date().toISOString() }; });
        report.push({ workspace_id: i.workspace_id, estoque: r });
      } catch (e) { report.push({ workspace_id: i.workspace_id, estoque_erro: String(e) }); }
    }
    for (const [n, i] of list.entries()) {
      if (Date.now() > deadline - 15_000) break;
      const slot = Math.min(deadline, Date.now() + (deadline - Date.now()) / (list.length - n));
      try {
        if (!i.settings?.job) {
          // Fila de períodos (ex.: histórico desde abril): um por vez, antes da sincronização de hora em hora.
          const fila = (i.settings?.fila ?? []) as { from: string; to: string; fases?: string[] }[];
          if (fila.length) {
            await writeSettings(db, i.workspace_id, i.provider, (s) => {
              s.fila = (s.fila ?? []).slice(1);
              s.job = { from: fila[0].from, to: fila[0].to, fases: fila[0].fases, cursor: null, locked_until: null, started_at: new Date().toISOString(), saved: {} };
            });
          } else {
            if (i.last_sync && Date.now() - new Date(i.last_sync).getTime() < HOURLY_MS) continue;
            await startJob(db, i.workspace_id, i.provider, iso(new Date(Date.now() - 7 * 86400_000)), iso(new Date()));
          }
        }
        report.push({ workspace_id: i.workspace_id, provider: i.provider, ...(await advanceJob(db, i.workspace_id, i.provider, slot)) });
      } catch (e) { report.push({ workspace_id: i.workspace_id, provider: i.provider, error: String(e) }); }
    }
    // Conciliação automática das correspondências exatas (só nos workspaces que ligaram a opção).
    for (const w of new Set(list.map((i) => i.workspace_id))) {
      const { data: n, error } = await db.rpc("auto_link_exatos", { ws: w });
      report.push({ workspace_id: w, auto_vinculos: error ? String(error.message) : n });
    }
    return json({ report });
  }

  // Importação temporária da Central do Vendedor Shopee, protegida por IMPORT_KEY (definida só enquanto usada).
  if (action === "import_shopee_income") {
    const key = Deno.env.get("IMPORT_KEY");
    if (!key || req.headers.get("x-import-key") !== key) throw new HttpError(401, "não autorizado");
    return json(await importShopeeIncome(admin(), String(body.workspace_id), body.done ?? [], body.pend ?? []));
  }

  const ws = String(body.workspace_id ?? "");
  const { db, user } = await authorize(req, ws);

  switch (action) {
    case "cnpj": {
      // Consulta completa do CNPJá (Receita, Simples/MEI, inscrição estadual, SUFRAMA). A chave fica só no servidor.
      const key = Deno.env.get("CNPJA_API_KEY");
      if (!key) throw new HttpError(400, "A chave da API do CNPJá ainda não foi cadastrada no servidor.");
      const cnpj = String(body.cnpj ?? "").replace(/\D/g, "");
      if (cnpj.length !== 14) throw new HttpError(400, "Informe um CNPJ com 14 dígitos.");
      const q = new URLSearchParams({ simples: "true", registrations: "ORIGIN", suframa: "true", strategy: "CACHE_IF_FRESH", maxAge: "30" });
      const r = await fetch(`https://api.cnpja.com/office/${cnpj}?${q}`, { headers: { Authorization: key } });
      const o: any = await r.json().catch(() => ({}));
      if (r.status === 404) throw new HttpError(404, "CNPJ não encontrado na Receita Federal.");
      if (!r.ok) throw new HttpError(502, `CNPJá respondeu ${r.status}: ${o?.message ?? "erro na consulta"}`);
      const a = o.address ?? {}, c = o.company ?? {};
      const fone = (p: any) => p?.number ? `(${p.area}) ${String(p.number).replace(/(\d{4,5})(\d{4})$/, "$1-$2")}` : "";
      const ie = (o.registrations ?? []).find((x: any) => x.enabled) ?? (o.registrations ?? [])[0];
      const fmt = cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
      return json({
        razao: c.name ?? "", fantasia: o.alias ?? "", doc: fmt, tipoPessoa: "Jurídica", ie: ie ? `${ie.number}${ie.enabled ? "" : " (inativa)"}` : "",
        situacao: o.status?.text ?? "", desde: o.founded ?? "", natureza: c.nature?.text ?? "", porte: c.size?.text ?? "",
        regime: c.simei?.optant ? "MEI" : c.simples?.optant ? "Simples Nacional" : "Lucro Presumido / Real",
        capital: c.equity ?? null, atividade: o.mainActivity ? `${o.mainActivity.id} · ${o.mainActivity.text}` : "",
        secundarias: (o.sideActivities ?? []).map((x: any) => `${x.id} · ${x.text}`).join("\n"),
        cep: a.zip ? String(a.zip).replace(/^(\d{5})(\d{3})$/, "$1-$2") : "", endereco: a.street ?? "", numero: a.number ?? "", bairro: a.district ?? "",
        complemento: a.details ?? "", cidade: a.city ?? "", uf: a.state ?? "",
        telefone: fone(o.phones?.[0]), telefone2: fone(o.phones?.[1]), email: o.emails?.[0]?.address ?? "",
        socios: (c.members ?? []).map((m: any) => `${m.person?.name ?? ""}${m.role?.text ? " · " + m.role.text : ""}`).join("\n"),
        suframa: o.suframa?.[0]?.number ?? "", receitaEm: new Date().toISOString().slice(0, 10),
      });
    }
    case "fiscal_status": {
      const cfg = await configFiscal(db, ws);
      const { data: prods } = await db.from("produtos").select("id,ncm,origem").eq("workspace_id", ws);
      return json({ ...statusFiscal(cfg), config: cfg, produtos: (prods ?? []).length, sem_ncm: (prods ?? []).filter((p) => !p.ncm).map((p) => p.id) });
    }
    case "fiscal_regras_bling": {
      const r = await lerRegrasFiscaisBling(db, ws);
      await writeSettings(db, ws, "bling", (s) => { s.regras_fiscais = r; });
      return json(r);
    }
    case "fiscal_ler_produtos": return json(await detalhesFiscaisBling(db, ws, 150));
    // Fiscal › Emitir NF-e: simulação (só cálculo), nota avulsa e carta de correção. Emissão só para dono, gestão e financeiro.
    // Notas de compra direto da SEFAZ: sincronizar, manifestar e baixar a nota completa (financeiro, contabilidade e dono).
    case "nfr_sync": case "nfr_manifestar": case "nfr_detalhe": {
      const { data: m } = await db.from("workspace_members").select("role").eq("workspace_id", ws).eq("user_id", user.id).maybeSingle();
      if (!["owner", "member", "financeiro", "contador"].includes(String(m?.role))) throw new HttpError(403, "Seu papel não acessa as notas de compra.");
      if (action === "nfr_sync") return json(await sincronizarRecebidas(db, ws));
      if (action === "nfr_detalhe") return json(await detalheRecebida(db, ws, String(body.chave ?? "")));
      const r = await manifestar(db, ws, String(body.chave ?? ""), String(body.tipo ?? ""), body.justificativa ? String(body.justificativa) : undefined);
      await db.from("audit_log").insert({ workspace_id: ws, id: crypto.randomUUID(), time: new Date().toISOString(), action: "Manifestação do destinatário", actor: user.email ?? user.id, detail: JSON.stringify(r).slice(0, 900) }).then(() => null, () => null);
      return json(r);
    }
    case "fiscal_simular": return json(await simularNota(db, ws, { pedido: body.pedido ? String(body.pedido) : undefined, dados: body.dados }));
    case "fiscal_emitir_avulsa": case "fiscal_cce": {
      const { data: m } = await db.from("workspace_members").select("role").eq("workspace_id", ws).eq("user_id", user.id).maybeSingle();
      if (!["owner", "member", "financeiro"].includes(String(m?.role))) throw new HttpError(403, "Seu papel não permite emitir ou corrigir notas.");
      const r = action === "fiscal_cce" ? await cartaCorrecao(db, ws, String(body.ref ?? ""), String(body.texto ?? "")) : await emitirAvulsa(db, ws, body.dados, user.email ?? user.id, body.producao === true);
      await db.from("audit_log").insert({ workspace_id: ws, id: crypto.randomUUID(), time: new Date().toISOString(), action: action === "fiscal_cce" ? "Carta de correção enviada" : "NF-e avulsa enviada", actor: user.email ?? user.id, detail: JSON.stringify(r).slice(0, 900) }).then(() => null, () => null);
      return json(r);
    }
    case "fiscal_emitir": return json(await emitirNFe(db, ws, String(body.pedido ?? ""), user.email ?? user.id, body.producao === true));
    case "fiscal_emitir_venda": return json(await emitirVendaDireta(db, ws, String(body.venda ?? ""), user.email ?? user.id, body.producao === true));
    case "fiscal_consultar": return json(await consultarNFe(db, ws, String(body.ref ?? "")));
    case "fiscal_cancelar": return json(await cancelarNFe(db, ws, String(body.ref ?? ""), String(body.justificativa ?? "")));
    // Catálogo e anúncios pelo Bling. Gravações só para quem altera estoque (dono, gestão, estoque).
    case "catalogo_vinculos": return json(await vinculosBling(db, ws));
    case "catalogo_canais": return json(await canaisBling(db, ws));
    case "catalogo_anuncios": return json(await anunciosBling(db, ws, String(body.tipo ?? ""), Number(body.loja)));
    case "catalogo_salvar": case "catalogo_preco_loja": case "catalogo_anuncio": case "catalogo_publicar": case "catalogo_pausar": case "catalogo_foto": {
      const { data: m } = await db.from("workspace_members").select("role").eq("workspace_id", ws).eq("user_id", user.id).maybeSingle();
      if (!["owner", "member", "estoque"].includes(String(m?.role))) throw new HttpError(403, "Seu papel não permite alterar produtos e anúncios.");
      const d = body.dados ?? {};
      const r = action === "catalogo_salvar" ? await salvarProdutoBling(db, ws, d)
        : action === "catalogo_preco_loja" ? await precoLojaBling(db, ws, d)
        : action === "catalogo_anuncio" ? await criarAnuncioBling(db, ws, d)
        : action === "catalogo_foto" ? await enviarFotoProduto(db, ws, String(d.base64 ?? ""), String(d.nome ?? ""))
        : await situacaoAnuncioBling(db, ws, d, action === "catalogo_publicar" ? "publicar" : "pausar");
      if (action !== "catalogo_foto") await db.from("audit_log").insert({ workspace_id: ws, id: crypto.randomUUID(), time: new Date().toISOString(), action: "Catálogo (Bling): " + action.replace("catalogo_", ""), actor: user.email ?? user.id, detail: JSON.stringify({ dados: { ...d, fotos: undefined, descricao: undefined }, r }).slice(0, 900) }).then(() => null, () => null);
      return json(r);
    }
    // Expedição e estoque: depósitos, lançamento (entrada, saída, balanço) e etiquetas de envio pelo Bling.
    case "estoque_depositos": return json(await depositosBling(db, ws));
    case "estoque_lancar": case "etiquetas": {
      const { data: m } = await db.from("workspace_members").select("role").eq("workspace_id", ws).eq("user_id", user.id).maybeSingle();
      const pode = action === "etiquetas" ? ["owner", "member", "estoque", "atendimento"] : ["owner", "member", "estoque"];
      if (!pode.includes(String(m?.role))) throw new HttpError(403, action === "etiquetas" ? "Seu papel não permite gerar etiquetas." : "Seu papel não permite lançar estoque.");
      const d = body.dados ?? {};
      if (action === "estoque_lancar") {
        const r = await lancarEstoqueBling(db, ws, { ...d, quem: user.email ?? user.id });
        await db.from("audit_log").insert({ workspace_id: ws, id: crypto.randomUUID(), time: new Date().toISOString(), action: "Estoque (Bling): lançamento " + ({ E: "entrada", S: "saída", B: "balanço" } as any)[String(d.operacao)], actor: user.email ?? user.id, detail: JSON.stringify({ dados: d, r }).slice(0, 900) }).then(() => null, () => null);
        return json(r);
      }
      const r = await etiquetasBling(db, ws, Array.isArray(d.ids) ? d.ids : [], String(d.formato ?? "PDF"));
      await db.from("audit_log").insert({ workspace_id: ws, id: crypto.randomUUID(), time: new Date().toISOString(), action: "Etiquetas de envio (Bling)", actor: user.email ?? user.id, detail: JSON.stringify({ formato: r.formato, geradas: r.geradas, resultado: r.resultado }).slice(0, 900) }).then(() => null, () => null);
      return json(r);
    }
    case "estoque_sync": {
      const r = await sincronizarEstoqueBling(db, ws);
      await writeSettings(db, ws, "bling", (s) => { s.estoque = { ...r, fim: new Date().toISOString() }; });
      return json(r);
    }
    case "atendimento_sync": {
      const r = await sincronizarAtendimentoML(db, ws);
      await writeSettings(db, ws, "mercadolivre", (s) => { s.atendimento = { ...r, fim: new Date().toISOString() }; });
      return json(r);
    }
    case "atendimento_responder": {
      const id = String(body.id ?? "");
      if (!id.startsWith("ML-")) throw new HttpError(400, "Por enquanto só respondo atendimentos do Mercado Livre.");
      const r = await responderML(db, ws, id, String(body.texto ?? ""));
      await db.from("audit_log").insert({ workspace_id: ws, id: crypto.randomUUID(), action: "Resposta enviada ao cliente", detail: `${id} · ${String(body.texto ?? "").slice(0, 300)}`, actor: user.email ?? user.id });
      return json(r);
    }
    // Conta a pagar por foto, print, PDF ou voz: só lê e devolve os campos; quem salva é a pessoa, na tela.
    case "ler_conta": {
      if (!Deno.env.get("ANTHROPIC_API_KEY")) throw new HttpError(400, "A chave da IA não está configurada no servidor.");
      const { data: m } = await db.from("workspace_members").select("role").eq("workspace_id", ws).eq("user_id", user.id).maybeSingle();
      if (!["owner", "member", "financeiro", "contador"].includes(String(m?.role))) throw new HttpError(403, "Seu papel não permite lançar contas a pagar.");
      return json(await lerContaPagar(db, ws, user.id, body.dados ?? {}));
    }
    case "atendimento_ia": {
      if (!Deno.env.get("ANTHROPIC_API_KEY")) throw new HttpError(400, "A chave da IA não está configurada no servidor.");
      return json(await sugerirAtendimento(db, ws, user.id, String(body.id ?? "")));
    }
    case "status": {
      const available = Object.fromEntries(Object.keys(providers).map((k) => [k, required[k].every((n) => Deno.env.get(n))]));
      const ai = !!Deno.env.get("ANTHROPIC_API_KEY");
      return json({ available, ai, callback: `${env("SUPABASE_URL")}/functions/v1/oauth-callback` });
    }
    case "authorize": {
      const id = String(body.provider);
      const p = provider(id);
      if (!required[id].every((n) => Deno.env.get(n))) throw new HttpError(400, `Credenciais do aplicativo ${p.label} ainda não foram cadastradas no Supabase (veja docs/INTEGRACOES.md).`);
      const ret = String(body.return_url ?? "");
      const state = await signState({ ws, provider: id, ret });
      return json({ url: await p.authorizeUrl(state) });
    }
    case "sync": {
      // Inicia (ou retoma) o job do período e avança uma rodada. O navegador chama de novo enquanto next = true.
      const id = String(body.provider);
      provider(id);
      const from = String(body.from), to = String(body.to);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) throw new HttpError(400, "Período inválido.");
      await startJob(db, ws, id, from, to);
      const r = await advanceJob(db, ws, id, Date.now() + BUDGET_MS);
      if (r.done) await admin().rpc("auto_link_exatos", { ws });
      return json({ ...r, next: !r.done });
    }
    case "job": {
      const id = String(body.provider);
      provider(id);
      const s = await readSettings(db, ws, id);
      return json({ job: s.job ? { ...s.job, cursor: undefined } : null, ultimo: s.ultimoJob ?? null });
    }
    case "cancel": {
      const id = String(body.provider);
      provider(id);
      await writeSettings(db, ws, id, (s) => { delete s.job; });
      return json({ ok: true });
    }
    case "disconnect": {
      const id = String(body.provider);
      provider(id);
      await db.from("integration_secrets").delete().eq("workspace_id", ws).eq("provider", id);
      await writeSettings(db, ws, id, (s) => { delete s.job; }, { status: "desconectado", account_name: null });
      return json({ ok: true });
    }
    default:
      throw new HttpError(400, "Ação desconhecida.");
  }
}));
