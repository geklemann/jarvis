// Notas fiscais de ENTRADA no Jarvis, independentes do ERP de origem: classificação pelo CFOP e conversão da nota lida
// da SEFAZ (nfe_recebidas, via Focus) em public.purchase_invoices — a mesma tabela que o estoque, as compras e os
// pedidos de compra usam. O código do produto na nota é o do FORNECEDOR; ele vira o SKU da loja pela tabela
// sku_fornecedor, que aprende sozinha comparando notas que existem nas duas fontes (mesma chave, itens na mesma ordem).
// Regras puras (tipoEntrada, aprenderMapa, converter) testadas pelo Node em testes/entradas.test.mjs.

export type ItemEntrada = { sku: string; descricao?: string | null; qtd: number; valor: number; total: number; cfop?: string | null; ncm?: string | null; codigo_fornecedor?: string | null };

/** Tipo da entrada pelo CFOP: devolução de venda, compra (gera contas a pagar) ou outras (remessas, bonificações…). */
export function tipoEntrada(cfop: string): "compra" | "devolucao" | "outros" {
  const c = String(cfop ?? "").replace(/\D/g, ""), f = c.slice(1);
  if (/^(201|202|203|204|208|209|410|411|503|553|555|660|661|662)$/.test(f)) return "devolucao";
  if (/^(101|102|111|113|116|117|118|120|121|122|124|125|126|128|252|253|301|302|303|304|305|306|351|352|353|354|355|356|401|403|406|407|551|556|651|652|653|932|933)$/.test(f)) return "compra";
  return c ? "outros" : "compra";
}
// Nota emitida pelo fornecedor usa CFOP de SAÍDA (5xxx/6xxx); do lado de quem recebe, é a entrada 1xxx/2xxx.
const cfopEntrada = (c: string) => { const d = String(c ?? "").replace(/\D/g, ""); return d && /^[567]/.test(d) ? String(Number(d[0]) - 4) + d.slice(1) : d; };

/** Aprende "código do fornecedor → SKU da loja" a partir de duas leituras da MESMA nota (itens na mesma ordem). */
export function aprenderMapa(fornecedorDoc: string, itensSefaz: { codigo?: string | null; descricao?: string | null }[], itensLoja: { sku?: string | null }[]) {
  const out: { fornecedor_doc: string; codigo: string; sku: string }[] = [];
  if (!fornecedorDoc || itensSefaz.length !== itensLoja.length) return out;
  itensSefaz.forEach((s, i) => { const cod = String(s.codigo ?? "").trim(), sku = String(itensLoja[i]?.sku ?? "").trim(); if (cod && sku) out.push({ fornecedor_doc: fornecedorDoc, codigo: cod, sku }); });
  return out;
}

/** Nota lida da SEFAZ (com o detalhe dos itens) → linha de purchase_invoices. mapa: "doc|codigo" → SKU da loja. */
export function converter(n: { chave: string; emitente?: string | null; emitente_doc?: string | null; emissao?: string | null; valor?: number | null; detalhe?: any }, mapa: Map<string, string>) {
  const d = n.detalhe ?? {}, doc = String(n.emitente_doc ?? "").replace(/\D/g, "");
  const itens: ItemEntrada[] = (d.itens ?? []).map((i: any) => {
    const cod = String(i.codigo ?? "").trim();
    return { sku: mapa.get(`${doc}|${cod}`) ?? cod, codigo_fornecedor: cod, descricao: i.descricao ?? null, qtd: Number(i.qtd) || 0, valor: Number(i.valor) || 0, total: Number(i.total) || 0, cfop: cfopEntrada(i.cfop), ncm: i.ncm ?? null };
  });
  const cfop = itens[0]?.cfop ?? "";
  return {
    id: `SEFAZ-NFE-${n.chave}`, numero: d.numero != null ? String(d.numero) : null, serie: d.serie != null ? String(d.serie) : null, chave: n.chave,
    emissao: n.emissao ? String(n.emissao).slice(0, 10) : null, fornecedor: n.emitente ?? null, fornecedor_doc: doc || null,
    valor: Number(d.total ?? n.valor ?? 0), cfop: cfop || null, natureza: d.natureza ?? null, tipo: tipoEntrada(cfop), situacao: "Autorizada",
    itens, parcelas: (d.duplicatas ?? []).map((p: any) => ({ data: p.vencimento ?? null, valor: Number(p.valor) || 0, forma: null, obs: p.numero ? `Duplicata ${p.numero}` : null })),
    raw: { origem: "SEFAZ" }, source: "SEFAZ",
    sem_mapa: itens.filter((i) => !mapa.has(`${doc}|${i.codigo_fornecedor}`)).length,
  };
}
