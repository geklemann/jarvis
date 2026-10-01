// Ruptura prevista: produto que ainda tem saldo, mas que vai zerar ANTES de uma compra feita hoje chegar (prazo de
// reposição do produto ou o padrão). Mesmo ritmo da tela Posição de estoque (web/estoque.js): média diária ponderada,
// com os últimos 30 dias pesando o dobro. O que já está em pedido de compra (enviado ou parcial, ainda não recebido)
// conta como saldo. Sem dependências: usada pelo alerta diário (alertas.ts) e pelos testes.

export type ProdutoRuptura = { id: string; nome: string; saldo: number; prazo_reposicao?: number | null; fornecedor?: string | null; ignorar?: boolean | null };
export type Prevista = { sku: string; nome: string; saldo: number; emPedido: number; media: number; dias: number; prazo: number; zeraEm: string; fornecedor: string | null; perdaDia: number };

/** Itens ainda não recebidos dos pedidos de compra enviados ou parciais (mesma regra de Estoque2.emAberto). */
export function emAberto(pedidos: { status: string; itens?: { sku: string; qtd?: number; recebido?: number }[] | null }[]) {
  const m = new Map<string, number>();
  for (const p of pedidos) if (["enviado", "parcial"].includes(p.status)) for (const i of p.itens ?? []) {
    const f = Math.max(0, Number(i.qtd || 0) - Number(i.recebido || 0));
    if (f) m.set(i.sku, (m.get(i.sku) ?? 0) + f);
  }
  return m;
}

/** vendas: quantidade vendida por SKU nos últimos 30 e 60 dias; preco: preço médio de venda (para a perda por dia). */
export function rupturasPrevistas(produtos: ProdutoRuptura[], vendas: Map<string, { q30: number; q60: number; preco?: number }>, emPedido: Map<string, number>, hoje: string, prazoPadrao = 20): Prevista[] {
  const out: Prevista[] = [];
  for (const p of produtos) {
    if (p.ignorar) continue;
    const v = vendas.get(p.id), saldo = Number(p.saldo) || 0;
    if (!v || saldo <= 0) continue; // sem saldo já é ruptura (outro alerta); sem venda não há previsão
    const media = (v.q30 / 30 * 2 + v.q60 / 60) / 3;
    if (media <= 0) continue;
    const ped = emPedido.get(p.id) ?? 0, prazo = Number(p.prazo_reposicao) || prazoPadrao, dias = (saldo + ped) / media;
    if (dias >= prazo) continue;
    out.push({
      sku: p.id, nome: p.nome, saldo, emPedido: ped, media, dias, prazo, fornecedor: p.fornecedor ?? null,
      zeraEm: new Date(Date.parse(hoje + "T12:00:00Z") + Math.floor(saldo / media) * 864e5).toISOString().slice(0, 10),
      perdaDia: media * (v.preco ?? 0),
    });
  }
  return out.sort((a, b) => a.dias - b.dias || b.perdaDia - a.perdaDia);
}
