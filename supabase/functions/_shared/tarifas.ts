// Mudança de tarifa por canal: compara a tarifa média (tarifa ÷ venda) dos últimos 7 dias fechados com a dos 28 dias
// anteriores. Quando sobe ou desce 1,5 ponto ou mais, mostra o impacto no mês e o reajuste de preço que devolve o mesmo
// valor líquido por venda (aproximado: trata a tarifa como percentual da venda). Também aponta os produtos do canal
// cuja tarifa mais mudou (a tarifa do pedido é dividida entre os itens pelo valor de cada um).
// Sem dependências: usada pelo alerta diário (alertas.ts), pela tela Raio-X (cópia em web/raiox.js) e pelos testes.

export type PedidoTarifa = { platform: string; date: string; gross: number; fee: number; items?: { sku?: string; title?: string; qty?: number; price?: number }[] | null };
export type Mudanca = {
  canal: string; base: number; recente: number; delta: number; vendaRecente: number; pedidosRecente: number;
  impactoMes: number; reajuste: number; produtos: { sku: string; nome: string; base: number; recente: number; delta: number; venda: number }[];
};

const somaDias = (d: string, n: number) => new Date(Date.parse(d + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);

/** Janelas: recente = 7 dias antes de hoje (sem hoje); base = os 28 dias anteriores a essa semana. */
export function janelas(hoje: string) {
  return { recIni: somaDias(hoje, -7), recFim: somaDias(hoje, -1), baseIni: somaDias(hoje, -35), baseFim: somaDias(hoje, -8) };
}

export function mudancasTarifa(pedidos: PedidoTarifa[], hoje: string, opc: { limiar?: number; minVenda?: number; minPedidos?: number } = {}): Mudanca[] {
  const limiar = opc.limiar ?? 0.015, minVenda = opc.minVenda ?? 1000, minPedidos = opc.minPedidos ?? 20;
  const j = janelas(hoje);
  type Acc = { v: number; t: number; n: number };
  const canais = new Map<string, { b: Acc; r: Acc; prod: Map<string, { nome: string; b: Acc; r: Acc }> }>();
  for (const p of pedidos) {
    const gross = Number(p.gross) || 0, fee = Number(p.fee) || 0;
    if (gross <= 0 || !p.date) continue;
    const lado = p.date >= j.recIni && p.date <= j.recFim ? "r" : p.date >= j.baseIni && p.date <= j.baseFim ? "b" : null;
    if (!lado) continue;
    const c = canais.get(p.platform) ?? { b: { v: 0, t: 0, n: 0 }, r: { v: 0, t: 0, n: 0 }, prod: new Map() };
    canais.set(p.platform, c);
    c[lado].v += gross; c[lado].t += fee; c[lado].n++;
    const itens = (p.items ?? []).filter((i) => String(i.sku ?? "").trim());
    const totItens = itens.reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.qty) || 0), 0);
    if (!totItens) continue;
    for (const i of itens) {
      const sku = String(i.sku).trim(), v = (Number(i.price) || 0) * (Number(i.qty) || 0), parte = v / totItens;
      const x = c.prod.get(sku) ?? { nome: String(i.title ?? sku), b: { v: 0, t: 0, n: 0 }, r: { v: 0, t: 0, n: 0 } };
      c.prod.set(sku, x);
      x[lado].v += gross * parte; x[lado].t += fee * parte; x[lado].n++;
    }
  }
  const out: Mudanca[] = [];
  for (const [canal, c] of canais) {
    if (c.r.v < minVenda || c.r.n < minPedidos || c.b.v < minVenda * 2) continue;
    const base = c.b.t / c.b.v, recente = c.r.t / c.r.v, delta = recente - base;
    if (Math.abs(delta) < limiar) continue;
    const produtos = [...c.prod].filter(([, x]) => x.r.n >= 5 && x.b.n >= 5 && x.r.v > 0 && x.b.v > 0)
      .map(([sku, x]) => ({ sku, nome: x.nome, base: x.b.t / x.b.v, recente: x.r.t / x.r.v, delta: x.r.t / x.r.v - x.b.t / x.b.v, venda: x.r.v }))
      .filter((x) => Math.sign(x.delta) === Math.sign(delta) && Math.abs(x.delta) >= limiar)
      .sort((a, b) => Math.abs(b.delta) * b.venda - Math.abs(a.delta) * a.venda).slice(0, 5);
    out.push({
      canal, base, recente, delta, vendaRecente: c.r.v, pedidosRecente: c.r.n,
      impactoMes: -delta * c.r.v * (30 / 7),
      reajuste: recente < 1 ? (1 - base) / (1 - recente) - 1 : 0,
      produtos,
    });
  }
  return out.sort((a, b) => Math.abs(b.impactoMes) - Math.abs(a.impactoMes));
}
