// Tabela de preços do Jarvis (a mesma do kit comercial, versão de 30/09/2026). O servidor calcula o valor da assinatura
// a partir do plano escolhido; a tela nunca manda o preço. Sem dependências: testado em testes/assinatura.test.mjs.
export const FAIXAS = [1000, 4000, 10000] as const;
const BASE: Record<number, number> = { 1000: 297, 4000: 497, 10000: 797 };
const PACOTE: Record<number, number> = { 1000: 690, 4000: 849, 10000: 1090 };
export const MODULOS: Record<string, { nome: string; valor: number }> = {
  fiscal: { nome: "Fiscal", valor: 149 },
  contab: { nome: "Contabilidade online", valor: 249 },
  folha: { nome: "Folha e ponto", valor: 129 },   // até 10 pessoas; até 25: 229
  crm: { nome: "CRM e B2B", valor: 99 },
};

export type Escolha = { plano: "base" | "pacote"; faixa: number; modulos?: string[]; folha25?: boolean; ciclo?: "mensal" | "anual" };

/** Valor mensal e o que cobrar por ciclo (anual = 10 mensalidades pelos 12 meses). */
export function precoAssinatura(e: Escolha) {
  const faixa = FAIXAS.find((f) => f === Number(e.faixa));
  if (!faixa) throw new Error("Faixa de pedidos inválida (1.000, 4.000 ou 10.000 por mês).");
  const modulos = [...new Set((e.modulos ?? []).filter((m) => m in MODULOS))];
  let mensal: number, itens: { item: string; valor: number }[];
  if (e.plano === "pacote") {
    if (e.folha25) throw new Error("O pacote inclui folha e ponto até 10 pessoas; para até 25, monte a base com os módulos.");
    mensal = PACOTE[faixa]; itens = [{ item: `Pacote completo, até ${faixa.toLocaleString("pt-BR")} pedidos por mês`, valor: mensal }];
  } else if (e.plano === "base") {
    itens = [{ item: `Base Vendas e Lucro, até ${faixa.toLocaleString("pt-BR")} pedidos por mês`, valor: BASE[faixa] }];
    for (const m of modulos) itens.push({ item: `Módulo ${MODULOS[m].nome}${m === "folha" ? (e.folha25 ? " (até 25 pessoas)" : " (até 10 pessoas)") : ""}`, valor: m === "folha" && e.folha25 ? 229 : MODULOS[m].valor });
    mensal = itens.reduce((a, i) => a + i.valor, 0);
  } else throw new Error("Escolha o plano: base ou pacote.");
  const ciclo = e.ciclo === "anual" ? "anual" : "mensal";
  return { faixa, modulos: e.plano === "pacote" ? Object.keys(MODULOS) : modulos, itens, mensal, ciclo, cobrar: ciclo === "anual" ? mensal * 10 : mensal };
}
