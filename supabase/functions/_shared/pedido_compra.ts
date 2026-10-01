// E-mail do pedido de compra ao fornecedor: corpo em HTML e texto, e a planilha dos itens em CSV (abre no Excel).
// Sem dependências: as regras (total, quantidades, formatação) são testadas direto pelo Node (testes/compras.test.mjs).

export type ItemPedido = { sku: string; nome?: string | null; qtd: number; custo: number };
export type Pedido = { numero: number | null; fornecedor: string; fornecedor_doc?: string | null; previsto?: string | null; observacao?: string | null; itens: ItemPedido[] };

const brl = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const qtd = (v: number) => Number(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const dataBR = (d: string) => d.slice(0, 10).split("-").reverse().join("/");
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const csvCel = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const dec = (v: number, n = 2) => Number(v || 0).toFixed(n).replace(".", ",");

export const totalPedido = (p: Pedido) => Math.round(p.itens.reduce((s, i) => s + Number(i.qtd || 0) * Number(i.custo || 0), 0) * 100) / 100;

/** Monta assunto, texto, HTML e a planilha (CSV em base64, com BOM para o Excel reconhecer os acentos). */
export function montarEmailPedido(p: Pedido, empresa: string, contato: string) {
  const itens = p.itens.filter((i) => Number(i.qtd) > 0), total = totalPedido({ ...p, itens });
  const assunto = `Pedido de compra nº ${p.numero ?? "—"} · ${empresa}`;
  const texto = [
    `Olá, ${p.fornecedor}.`, "", `Segue o pedido de compra nº ${p.numero ?? "—"} da ${empresa}:`, "",
    ...itens.map((i) => `• ${i.sku}${i.nome ? " — " + i.nome : ""}: ${qtd(i.qtd)} un. × ${brl(i.custo)} = ${brl(i.qtd * i.custo)}`),
    "", `Total: ${brl(total)} (${itens.length} item(ns))`,
    ...(p.previsto ? [`Entrega desejada: ${dataBR(p.previsto)}`] : []), ...(p.observacao ? ["", p.observacao] : []),
    "", "Por favor, confirme o recebimento, os preços e o prazo de entrega respondendo a este e-mail.", "", `${empresa}${contato ? " · " + contato : ""}`,
  ].join("\n");
  const td = 'style="padding:8px;border-bottom:1px solid #e5e7eb"', tdn = 'style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;white-space:nowrap"';
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:720px">
<p>Olá, ${esc(p.fornecedor)}.</p><p>Segue o <strong>pedido de compra nº ${esc(p.numero ?? "—")}</strong> da ${esc(empresa)}:</p>
<table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:#f3f4f6;text-align:left"><th ${td}>Código</th><th ${td}>Produto</th><th ${tdn}>Qtd.</th><th ${tdn}>Preço unit.</th><th ${tdn}>Total</th></tr></thead><tbody>
${itens.map((i) => `<tr><td ${td}>${esc(i.sku)}</td><td ${td}>${esc(i.nome ?? "")}</td><td ${tdn}>${qtd(i.qtd)}</td><td ${tdn}>${brl(i.custo)}</td><td ${tdn}>${brl(i.qtd * i.custo)}</td></tr>`).join("")}
<tr><td ${td} colspan="4"><strong>Total</strong></td><td ${tdn}><strong>${brl(total)}</strong></td></tr></tbody></table>
${p.previsto ? `<p><strong>Entrega desejada:</strong> ${dataBR(p.previsto)}</p>` : ""}${p.observacao ? `<p>${esc(p.observacao)}</p>` : ""}
<p>Por favor, confirme o recebimento, os preços e o prazo de entrega respondendo a este e-mail. A planilha com os itens segue anexa.</p>
<p style="color:#555">${esc(empresa)}${contato ? " · " + esc(contato) : ""}</p></div>`;
  const csv = "﻿" + [["Código", "Produto", "Quantidade", "Preço unitário", "Total"], ...itens.map((i) => [i.sku, i.nome ?? "", dec(i.qtd, 3).replace(/,?0+$/, ""), dec(i.custo), dec(i.qtd * i.custo)]), ["", "Total", "", "", dec(total)]]
    .map((l) => l.map(csvCel).join(";")).join("\r\n");
  const bytes = new TextEncoder().encode(csv);
  let bin = ""; for (const b of bytes) bin += String.fromCharCode(b);
  return { assunto, texto, html, total, itens: itens.length, anexo: { nome: `pedido-compra-${p.numero ?? "rascunho"}.csv`, base64: btoa(bin) } };
}
