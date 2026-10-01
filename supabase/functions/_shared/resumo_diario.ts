// Resumo do dia para a diretoria (todo dia às 7 h, por e-mail e, quando ligado, WhatsApp): vendas de ontem por canal
// contra a média do mesmo dia da semana nas 4 semanas anteriores, tarifa de ontem, o mês até ontem com as metas,
// caixa (saldo dos bancos), repasses atrasados, contas que vencem hoje e atendimentos com prazo nas próximas 24 h.
// Mesmas regras das telas (view v_pedidos) e do relatório semanal. A montagem do texto é pura e testada.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { metasDoMes, type Avaliacao } from "./metas.ts";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v: number) => (v * 100).toFixed(1).replace(".", ",") + "%";
const dia = (d: Date) => d.toISOString().slice(0, 10);
const r2 = (n: number) => Math.round(n * 100) / 100;
const esc = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

async function tudo<T>(consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const out: T[] = [];
  for (let de = 0; de < 50_000; de += 1000) { const { data, error } = await consulta(de, de + 999); if (error) throw error; out.push(...(data ?? [])); if ((data ?? []).length < 1000) break; }
  return out;
}

export type DadosDia = {
  ontem: string; canais: { canal: string; n: number; bruto: number; taxa: number; media: number }[];
  mes: { bruto: number; n: number }; metas: Avaliacao[] & { canal?: string | null }[];
  caixa: number | null; atrasados: { n: number; valor: number }; vencemHoje: { n: number; valor: number }; urgentes: number;
};

/** Datas de referência no horário de Brasília: ontem e os 4 mesmos dias da semana anteriores. */
export function datasResumo(agora = new Date()) {
  const hoje = new Date(Date.parse(dia(new Date(agora.getTime() - 3 * 3600_000)) + "T12:00:00Z"));
  const ontem = new Date(hoje.getTime() - 864e5);
  return { hoje: dia(hoje), ontem: dia(ontem), iguais: [1, 2, 3, 4].map((s) => dia(new Date(ontem.getTime() - s * 7 * 864e5))), mesIni: dia(ontem).slice(0, 8) + "01" };
}

export async function coletarDia(db: SupabaseClient, ws: string, agora = new Date()): Promise<DadosDia> {
  const d = datasResumo(agora);
  type P = { plataforma: string; bruto: number; taxa: number; data: string };
  const vendas = await tudo<P>((a, b) => db.from("v_pedidos").select("plataforma,bruto,taxa,data").eq("workspace_id", ws).in("data", [d.ontem, ...d.iguais]).range(a, b));
  const mes = await tudo<{ bruto: number }>((a, b) => db.from("v_pedidos").select("bruto").eq("workspace_id", ws).gte("data", d.mesIni).lte("data", d.ontem).range(a, b));
  const limite = dia(new Date(Date.parse(d.hoje + "T12:00:00Z") - 3 * 864e5));
  const atr = await tudo<{ saldo: number }>((a, b) => db.from("v_pedidos").select("saldo").eq("workspace_id", ws).eq("status", "A receber").lt("previsao", limite).gt("saldo", 0.01).range(a, b));
  const { data: venc } = await db.from("payables").select("valor,valor_pago").eq("workspace_id", ws).eq("vencimento", d.hoje).in("status", ["aberto", "parcial"]);
  const { data: bancos } = await db.from("bank_accounts").select("saldo_extrato").eq("workspace_id", ws).eq("ativo", true);
  const { count: urgentes } = await db.from("atendimentos").select("id", { count: "exact", head: true }).eq("workspace_id", ws).is("fechado_em", null).lte("prazo", new Date(agora.getTime() + 24 * 3600_000).toISOString());
  const metas = (await metasDoMes(db, ws, agora).catch(() => ({ lista: [] as any[] }))).lista;
  const canais = new Map<string, { n: number; bruto: number; taxa: number; outros: number }>();
  for (const v of vendas) {
    const x = canais.get(v.plataforma) ?? { n: 0, bruto: 0, taxa: 0, outros: 0 }; canais.set(v.plataforma, x);
    if (v.data === d.ontem) { x.n++; x.bruto += Number(v.bruto) || 0; x.taxa += Number(v.taxa) || 0; } else x.outros += Number(v.bruto) || 0;
  }
  const comSaldo = (bancos ?? []).filter((b) => b.saldo_extrato != null);
  return {
    ontem: d.ontem,
    canais: [...canais].map(([canal, x]) => ({ canal, n: x.n, bruto: r2(x.bruto), taxa: r2(x.taxa), media: r2(x.outros / 4) })).filter((x) => x.n || x.media).sort((a, b) => b.bruto - a.bruto),
    mes: { bruto: r2(mes.reduce((s, v) => s + (Number(v.bruto) || 0), 0)), n: mes.length },
    metas: metas as any,
    caixa: comSaldo.length ? r2(comSaldo.reduce((s, b) => s + Number(b.saldo_extrato), 0)) : null,
    atrasados: { n: atr.length, valor: r2(atr.reduce((s, x) => s + Number(x.saldo), 0)) },
    vencemHoje: { n: venc?.length ?? 0, valor: r2((venc ?? []).reduce((s, p) => s + Number(p.valor) - Number(p.valor_pago || 0), 0)) },
    urgentes: urgentes ?? 0,
  };
}

/** Texto curto (WhatsApp/e-mail) e HTML do resumo. */
export function montarResumo(x: DadosDia) {
  const [a, m, dd] = x.ontem.split("-"), nomeDia = DIAS[new Date(x.ontem + "T12:00:00Z").getUTCDay()];
  const tot = x.canais.reduce((s, c) => ({ n: s.n + c.n, bruto: s.bruto + c.bruto, taxa: s.taxa + c.taxa, media: s.media + c.media }), { n: 0, bruto: 0, taxa: 0, media: 0 });
  const vs = (v: number, base: number) => base > 0 ? `${v >= base ? "+" : "−"}${Math.abs(Math.round((v / base - 1) * 100))}% vs. média de ${nomeDia}` : "";
  const metaLinha = (t: Avaliacao & { canal?: string | null }) => {
    const nome = t.ind === "vendas" ? "Vendas" : t.ind === "recebido" ? "Recebido" : t.ind;
    const quem = t.canal ? ` (${t.canal})` : "";
    if (t.ind === "vendas" && t.proj != null) return `${nome}${quem}: projeção de ${brl(t.proj)} para meta de ${brl(t.meta)} (${Math.round((t.ritmo ?? 0) * 100)}%)`;
    return `${nome}${quem}: ${brl(t.real ?? 0)} de ${brl(t.esperado ?? 0)} esperados até hoje (${Math.round((t.ritmo ?? 0) * 100)}%)`;
  };
  const metas = (x.metas as (Avaliacao & { canal?: string | null })[]).filter((t) => ["vendas", "recebido"].includes(t.ind) && t.status !== "sem_meta").slice(0, 4);
  const atencao = [
    x.vencemHoje.n ? `${x.vencemHoje.n} conta(s) vencem hoje: ${brl(x.vencemHoje.valor)}` : "",
    x.atrasados.n ? `${x.atrasados.n} repasse(s) atrasado(s): ${brl(x.atrasados.valor)}` : "",
    x.urgentes ? `${x.urgentes} atendimento(s) com prazo nas próximas 24 h` : "",
  ].filter(Boolean);
  const assunto = `Jarvis · ${nomeDia} ${dd}/${m}: ${brl(tot.bruto)} em ${tot.n} pedidos`;
  const texto = [
    `Resumo de ${nomeDia}, ${dd}/${m}/${a}`,
    `Vendas: ${brl(tot.bruto)} em ${tot.n} pedidos${tot.media ? ` (${vs(tot.bruto, tot.media)})` : ""}${tot.bruto ? ` · tarifa ${pct(tot.taxa / tot.bruto)}` : ""}`,
    ...x.canais.map((c) => `  ${c.canal}: ${brl(c.bruto)} (${c.n})${c.media ? ` · ${vs(c.bruto, c.media)}` : ""}`),
    `Mês até ontem: ${brl(x.mes.bruto)} em ${x.mes.n} pedidos`,
    ...metas.map((t) => `  ${metaLinha(t)}`),
    x.caixa != null ? `Caixa (saldo dos bancos): ${brl(x.caixa)}` : "",
    ...(atencao.length ? ["Atenção hoje:", ...atencao.map((s) => `  ${s}`)] : ["Nada urgente para hoje."]),
  ].filter(Boolean).join("\n");
  const td = 'style="padding:6px 10px;border-bottom:1px solid #e5e7eb"', tdn = 'style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:right;font-variant-numeric:tabular-nums"';
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;color:#111318;max-width:640px">
<h2 style="margin:0 0 4px">Resumo de ${nomeDia}, ${dd}/${m}</h2><p style="margin:0 0 16px;color:#5f6674">Vendas de ontem, o mês e o que pede atenção hoje.</p>
<p style="font-size:22px;margin:0"><strong>${brl(tot.bruto)}</strong> <span style="font-size:14px;color:#5f6674">em ${tot.n} pedidos${tot.media ? ` · ${vs(tot.bruto, tot.media)}` : ""}${tot.bruto ? ` · tarifa ${pct(tot.taxa / tot.bruto)}` : ""}</span></p>
<table style="border-collapse:collapse;width:100%;margin:12px 0 18px;font-size:14px"><tr><th ${td} align="left">Canal</th><th ${tdn}>Ontem</th><th ${tdn}>Pedidos</th><th ${tdn}>Média do dia</th></tr>
${x.canais.map((c) => `<tr><td ${td}>${esc(c.canal)}</td><td ${tdn}>${brl(c.bruto)}</td><td ${tdn}>${c.n}</td><td ${tdn}>${brl(c.media)}</td></tr>`).join("")}</table>
<h3 style="margin:0 0 6px">Mês até ontem: ${brl(x.mes.bruto)}</h3>${metas.length ? `<ul style="margin:0 0 16px;padding-left:18px">${metas.map((t) => `<li style="color:${t.status === "abaixo" ? "#b42318" : "#111318"}">${esc(metaLinha(t))}</li>`).join("")}</ul>` : ""}
${x.caixa != null ? `<p style="margin:0 0 16px">Caixa (saldo dos bancos): <strong>${brl(x.caixa)}</strong></p>` : ""}
<h3 style="margin:0 0 6px">Atenção hoje</h3>${atencao.length ? `<ul style="margin:0 0 16px;padding-left:18px">${atencao.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>` : `<p style="margin:0 0 16px">Nada urgente para hoje.</p>`}
<p><a href="https://jaarvis.com.br/#diretoria" style="color:#2f5bd9">Abrir o Jarvis</a></p></div>`;
  return { assunto, texto, html };
}
