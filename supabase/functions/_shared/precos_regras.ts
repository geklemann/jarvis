// Regras puras do vigia de preços (sem dependências, testadas pelo Node em testes/precos.test.mjs).

export type Linha = { item_id: string; titulo: string; meu_preco: number | null; menor_preco: number | null; menor_item: string | null; situacao: string; historico: { em: string; meu: number | null; menor: number | null }[] };

/** Situação do anúncio. Catálogo: a disputa informada pelo ML; fora dele: comparação com o menor concorrente. */
export function classificar(meu: number | null, menor: number | null, disputa?: string | null) {
  const d: Record<string, string> = { winning: "ganhando", sharing_first_place: "compartilhando", competing: "perdendo", listed: "listado" };
  if (disputa && d[disputa]) return d[disputa];
  if (menor == null) return "sozinho";
  if (meu == null) return "listado";
  return meu <= menor + 0.004 ? "mais_barato" : "mais_caro";
}

/** Acrescenta um ponto ao histórico quando algum preço mudou ou passou um dia (guarda os últimos 60). */
export function novoHistorico(h: Linha["historico"], meu: number | null, menor: number | null, agora: Date) {
  const u = h.at(-1), mudou = !u || u.meu !== meu || u.menor !== menor, velho = !u || agora.getTime() - new Date(u.em).getTime() > 20 * 3600_000;
  return mudou || velho ? [...h, { em: agora.toISOString(), meu, menor }].slice(-60) : h;
}

/** Concorrente baixou o preço desde a última verificação e agora está mais barato que você (diferença de mais de 0,5%). */
export function baixou(antes: { menor_preco: number | null } | undefined, menor: number | null, meu: number | null) {
  if (!antes || antes.menor_preco == null || menor == null || meu == null) return false;
  return menor < Number(antes.menor_preco) * 0.995 && menor < meu - 0.004;
}
