// Relatório semanal da diretoria: a semana anterior (segunda a domingo, horário de Brasília) comparada com a de antes.
// Vendas e tarifas por canal, recebido, repasses a receber e atrasados, contas vencidas e da semana, caixa,
// atendimento e ruptura. Sai em três formas: e-mail (HTML), WhatsApp (texto curto) e planilha Excel anexa.
// Usa as mesmas regras das telas (view v_pedidos). Toda segunda depois das 8 h o cron envia a quem pediu.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import * as XLSX from "npm:xlsx@0.18.5";
import { semanaAnterior } from "./semana.ts";
export { semanaAnterior };

const brl = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v: number) => `${(v * 100).toFixed(1).replace(".", ",")}%`;
const dataBR = (d: string) => d.split("-").reverse().join("/");
const dia = (d: Date) => d.toISOString().slice(0, 10);
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Lê todas as linhas (o banco devolve no máximo 1.000 por vez). */
async function tudo<T>(consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const out: T[] = [];
  for (let de = 0; ; de += 1000) { const { data, error } = await consulta(de, de + 999); if (error) throw error; out.push(...(data ?? [])); if (!data || data.length < 1000) break; }
  return out;
}

/** Números da semana (lidos do banco). */
async function coletar(db: SupabaseClient, ws: string, agora: Date) {
  const s = semanaAnterior(agora);
  type P = { plataforma: string; bruto: number; taxa: number; liquido: number };
  const vendas = await tudo<P>((a, b) => db.from("v_pedidos").select("plataforma,bruto,taxa,liquido").eq("workspace_id", ws).gte("data", s.ini).lte("data", s.fim).range(a, b));
  const antes = await tudo<P>((a, b) => db.from("v_pedidos").select("plataforma,bruto,taxa,liquido").eq("workspace_id", ws).gte("data", s.iniAnt).lte("data", s.fimAnt).range(a, b));
  const receb = await tudo<{ platform: string; amount: number }>((a, b) => db.from("receipts").select("platform,amount").eq("workspace_id", ws).gte("date", s.ini).lte("date", s.fim).gt("amount", 0).range(a, b));
  const abertos = await tudo<{ plataforma: string; saldo: number; previsao: string | null; status: string }>((a, b) => db.from("v_pedidos").select("plataforma,saldo,previsao,status").eq("workspace_id", ws).in("status", ["A receber", "Divergência"]).gt("saldo", 0.01).range(a, b));
  const contas = await tudo<{ fornecedor: string | null; valor: number; valor_pago: number | null; vencimento: string }>((a, b) => db.from("payables").select("fornecedor,valor,valor_pago,vencimento").eq("workspace_id", ws).in("status", ["aberto", "parcial"]).range(a, b));
  const { data: bancos } = await db.from("bank_accounts").select("nome,saldo_extrato,data_saldo_extrato").eq("workspace_id", ws).eq("ativo", true);
  const { count: atAbertos } = await db.from("atendimentos").select("id", { count: "exact", head: true }).eq("workspace_id", ws).is("fechado_em", null);
  const { count: atUrgentes } = await db.from("atendimentos").select("id", { count: "exact", head: true }).eq("workspace_id", ws).is("fechado_em", null).lte("prazo", new Date(agora.getTime() + 24 * 3600_000).toISOString());
  const { count: atResolvidos } = await db.from("atendimentos").select("id", { count: "exact", head: true }).eq("workspace_id", ws).gte("fechado_em", s.ini).lte("fechado_em", s.fim + "T23:59:59");
  const { count: rupturas } = await db.from("produtos").select("id", { count: "exact", head: true }).eq("workspace_id", ws).lte("saldo", 0).or("ignorar.is.null,ignorar.eq.false");

  // Vendas por canal.
  const canais = new Map<string, { n: number; bruto: number; taxa: number; liquido: number; recebido: number; nAnt: number; brutoAnt: number }>();
  const c = (p: string) => canais.get(p) ?? canais.set(p, { n: 0, bruto: 0, taxa: 0, liquido: 0, recebido: 0, nAnt: 0, brutoAnt: 0 }).get(p)!;
  for (const v of vendas) { const x = c(v.plataforma); x.n++; x.bruto += Number(v.bruto); x.taxa += Number(v.taxa); x.liquido += Number(v.liquido); }
  for (const v of antes) { const x = c(v.plataforma); x.nAnt++; x.brutoAnt += Number(v.bruto); }
  for (const r of receb) c(r.platform).recebido += Number(r.amount);
  const linhas = [...canais].map(([canal, x]) => ({ canal, ...x })).filter((x) => x.n || x.nAnt || x.recebido).sort((a, b) => b.bruto - a.bruto);
  const tot = linhas.reduce((a, x) => ({ n: a.n + x.n, bruto: a.bruto + x.bruto, taxa: a.taxa + x.taxa, liquido: a.liquido + x.liquido, recebido: a.recebido + x.recebido, nAnt: a.nAnt + x.nAnt, brutoAnt: a.brutoAnt + x.brutoAnt }), { n: 0, bruto: 0, taxa: 0, liquido: 0, recebido: 0, nAnt: 0, brutoAnt: 0 });
  const varPct = tot.brutoAnt ? tot.bruto / tot.brutoAnt - 1 : null;

  // Repasses e contas.
  const limiteAtraso = dia(new Date(new Date(s.hoje + "T12:00:00Z").getTime() - 3 * 864e5));
  const aReceber = r2(abertos.reduce((a, x) => a + Number(x.saldo), 0));
  const atrasados = abertos.filter((x) => x.previsao && x.previsao < limiteAtraso);
  const valorAtrasado = r2(atrasados.reduce((a, x) => a + Number(x.saldo), 0));
  const divergentes = abertos.filter((x) => x.status === "Divergência");
  const aberto = (p: { valor: number; valor_pago: number | null }) => Number(p.valor) - Number(p.valor_pago || 0);
  const ate7 = dia(new Date(new Date(s.hoje + "T12:00:00Z").getTime() + 7 * 864e5));
  const vencidas = contas.filter((p) => p.vencimento < s.hoje), proximas = contas.filter((p) => p.vencimento >= s.hoje && p.vencimento <= ate7).sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  const caixa = r2((bancos ?? []).reduce((a, b) => a + Number(b.saldo_extrato || 0), 0));

  const dados = {
    periodo: s, canais: linhas, total: tot, variacao: varPct, aReceber, atrasados: { n: atrasados.length, valor: valorAtrasado }, divergentes: { n: divergentes.length, valor: r2(divergentes.reduce((a, x) => a + Number(x.saldo), 0)) },
    contas: { vencidas: { n: vencidas.length, valor: r2(vencidas.reduce((a, p) => a + aberto(p), 0)) }, proximas: { n: proximas.length, valor: r2(proximas.reduce((a, p) => a + aberto(p), 0)), lista: proximas.slice(0, 10).map((p) => ({ fornecedor: p.fornecedor ?? "", vencimento: p.vencimento, valor: r2(aberto(p)) })) } },
    caixa, atendimento: { abertos: atAbertos ?? 0, urgentes: atUrgentes ?? 0, resolvidos: atResolvidos ?? 0 }, rupturas: rupturas ?? 0,
  };
  return dados;
}

type Dados = Awaited<ReturnType<typeof coletar>>;

export async function montarRelatorio(db: SupabaseClient, ws: string, agora = new Date()) {
  const dados = await coletar(db, ws, agora);
  return { dados, ...formatos(dados) };
}

function formatos(d: Dados) {
  const per = `${dataBR(d.periodo.ini)} a ${dataBR(d.periodo.fim)}`;
  const assunto = `Jarvis · Resumo da semana ${per}`;
  const variacao = d.variacao == null ? "" : ` (${d.variacao >= 0 ? "+" : ""}${pct(d.variacao)} vs. semana anterior)`;
  const texto = [
    `Vendas: ${brl(d.total.bruto)} em ${d.total.n} pedidos${variacao}`,
    `Tarifas: ${brl(d.total.taxa)} (${d.total.bruto ? pct(d.total.taxa / d.total.bruto) : "0%"}) · Líquido ${brl(d.total.liquido)}`,
    `Recebido na semana: ${brl(d.total.recebido)}`,
    `A receber dos marketplaces: ${brl(d.aReceber)}${d.atrasados.n ? ` · ${d.atrasados.n} repasse(s) atrasado(s) ${brl(d.atrasados.valor)}` : ""}`,
    `Contas: ${d.contas.vencidas.n} vencida(s) ${brl(d.contas.vencidas.valor)} · próximos 7 dias ${brl(d.contas.proximas.valor)}`,
    `Caixa (extrato): ${brl(d.caixa)}`,
    `Atendimento: ${d.atendimento.abertos} aberto(s), ${d.atendimento.urgentes} urgente(s), ${d.atendimento.resolvidos} resolvido(s) na semana`,
    `Ruptura: ${d.rupturas} produto(s) sem estoque`,
    `Detalhes: https://jaarvis.com.br/#resumo`,
  ].join("\n");
  const td = "padding:7px 10px;border-bottom:1px solid #e5e7eb", tdn = td + ";text-align:right;font-variant-numeric:tabular-nums";
  const card = (t: string, v: string, s = "") => `<td style="padding:12px 14px;border:1px solid #e5e7eb;border-radius:10px;vertical-align:top;width:25%"><div style="font-size:12px;color:#5f6674">${t}</div><div style="font-size:20px;font-weight:700;margin-top:2px">${v}</div><div style="font-size:12px;color:#5f6674">${s}</div></td>`;
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f6f7f9;font-family:Inter,'Segoe UI',Arial,sans-serif;color:#111318">
<div style="max-width:720px;margin:0 auto;padding:24px 16px">
 <div style="font-size:13px;color:#2f5bd9;font-weight:700;letter-spacing:.06em;text-transform:uppercase">Jarvis · resumo da semana</div>
 <h1 style="font-size:24px;margin:6px 0 18px">${per}</h1>
 <table role="presentation" style="width:100%;border-collapse:separate;border-spacing:8px;margin:0 -8px 10px"><tr>
  ${card("Vendas", brl(d.total.bruto), `${d.total.n} pedidos${variacao}`)}${card("Líquido", brl(d.total.liquido), `tarifas ${d.total.bruto ? pct(d.total.taxa / d.total.bruto) : "0%"}`)}${card("Recebido", brl(d.total.recebido), "repasses que entraram")}${card("Caixa", brl(d.caixa), "saldo dos extratos")}
 </tr></table>
 <h2 style="font-size:15px;margin:18px 0 6px">Vendas por canal</h2>
 <table style="width:100%;border-collapse:collapse;font-size:13px;background:#fff;border:1px solid #e5e7eb"><tr style="color:#5f6674;text-align:left"><th style="${td}">Canal</th><th style="${tdn}">Pedidos</th><th style="${tdn}">Vendas</th><th style="${tdn}">Tarifas</th><th style="${tdn}">Líquido</th><th style="${tdn}">Recebido</th></tr>
 ${d.canais.map((x) => `<tr><td style="${td}">${x.canal}</td><td style="${tdn}">${x.n}</td><td style="${tdn}">${brl(x.bruto)}</td><td style="${tdn}">${brl(x.taxa)}</td><td style="${tdn}">${brl(x.liquido)}</td><td style="${tdn}">${brl(x.recebido)}</td></tr>`).join("")}
 <tr style="font-weight:700"><td style="${td}">Total</td><td style="${tdn}">${d.total.n}</td><td style="${tdn}">${brl(d.total.bruto)}</td><td style="${tdn}">${brl(d.total.taxa)}</td><td style="${tdn}">${brl(d.total.liquido)}</td><td style="${tdn}">${brl(d.total.recebido)}</td></tr></table>
 <h2 style="font-size:15px;margin:18px 0 6px">Pede atenção</h2>
 <ul style="font-size:14px;line-height:1.7;padding-left:18px;margin:0">
  <li>A receber dos marketplaces: <b>${brl(d.aReceber)}</b>${d.atrasados.n ? ` — <b style="color:#d13c4c">${d.atrasados.n} repasse(s) atrasado(s), ${brl(d.atrasados.valor)}</b>` : ""}</li>
  ${d.divergentes.n ? `<li>Repasse abaixo do previsto: <b>${d.divergentes.n} pedido(s), ${brl(d.divergentes.valor)}</b></li>` : ""}
  <li>Contas vencidas: <b>${d.contas.vencidas.n}</b> (${brl(d.contas.vencidas.valor)}) · próximos 7 dias: <b>${brl(d.contas.proximas.valor)}</b></li>
  <li>Atendimento: ${d.atendimento.abertos} aberto(s), <b>${d.atendimento.urgentes} urgente(s)</b>, ${d.atendimento.resolvidos} resolvido(s) na semana</li>
  <li>Ruptura: <b>${d.rupturas}</b> produto(s) sem estoque</li>
 </ul>
 ${d.contas.proximas.lista.length ? `<h2 style="font-size:15px;margin:18px 0 6px">Contas dos próximos 7 dias</h2><table style="width:100%;border-collapse:collapse;font-size:13px;background:#fff;border:1px solid #e5e7eb">${d.contas.proximas.lista.map((p) => `<tr><td style="${td}">${dataBR(p.vencimento)}</td><td style="${td}">${p.fornecedor}</td><td style="${tdn}">${brl(p.valor)}</td></tr>`).join("")}</table>` : ""}
 <p style="margin:22px 0 0"><a href="https://jaarvis.com.br/#resumo" style="display:inline-block;background:#111318;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600">Abrir o Jarvis</a></p>
 <p style="font-size:12px;color:#5f6674;margin-top:18px">Planilha com os números em anexo. Você recebe este resumo porque foi cadastrado em Alertas e relatórios no Jarvis.</p>
</div></body></html>`;
  // Planilha.
  const wb = XLSX.utils.book_new();
  const resumo = [["Jarvis · Resumo da semana", per], [], ["Vendas", r2(d.total.bruto)], ["Pedidos", d.total.n], ["Variação das vendas vs. semana anterior", d.variacao ?? ""], ["Tarifas", r2(d.total.taxa)], ["Líquido", r2(d.total.liquido)], ["Recebido na semana", r2(d.total.recebido)], ["A receber dos marketplaces", d.aReceber], ["Repasses atrasados (qtde)", d.atrasados.n], ["Repasses atrasados (valor)", d.atrasados.valor], ["Repasse abaixo do previsto (qtde)", d.divergentes.n], ["Contas vencidas (valor)", d.contas.vencidas.valor], ["Contas dos próximos 7 dias (valor)", d.contas.proximas.valor], ["Caixa (extratos)", d.caixa], ["Atendimentos abertos", d.atendimento.abertos], ["Atendimentos urgentes", d.atendimento.urgentes], ["Resolvidos na semana", d.atendimento.resolvidos], ["Produtos sem estoque", d.rupturas]];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumo), "Resumo");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Canal", "Pedidos", "Vendas", "Tarifas", "Líquido", "Recebido", "Pedidos semana anterior", "Vendas semana anterior"], ...d.canais.map((x) => [x.canal, x.n, r2(x.bruto), r2(x.taxa), r2(x.liquido), r2(x.recebido), x.nAnt, r2(x.brutoAnt)])]), "Vendas por canal");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Vencimento", "Fornecedor", "Valor em aberto"], ...d.contas.proximas.lista.map((p) => [p.vencimento, p.fornecedor, p.valor])]), "Contas 7 dias");
  const xlsx = XLSX.write(wb, { type: "base64", bookType: "xlsx" }) as string;
  return { assunto, texto, html, xlsx, arquivo: `Jarvis - Resumo da semana ${d.periodo.ini}.xlsx` };
}
