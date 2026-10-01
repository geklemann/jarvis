// Regras puras da GNRE (sem dependências, testadas pelo Node em testes/gnre.test.mjs).

/** Campo extra que pede a chave de OUTRO documento (CT-e, CT-e OS, MDF-e, BP-e). A venda tem só NF-e: mandar a chave
 *  dela ali é rejeitado pela SEFAZ ("Modelo do documento eletrônico inválido", ex.: SE, campo 94 "Chave de Acesso do
 *  CTe/CTe-OS"). Esses campos ficam de fora, como faz o Bling. */
// Campo que aceita NF-e ("Chave de Acesso da NFe ou do CTe/CTE-OS", SE em produção, campo 77) recebe a chave normalmente.
export const campoDeOutroDocumento = (titulo: string) => {
  const t = String(titulo ?? "");
  return /\bct-?e\b|cte[\s/-]*os|\bmdf-?e\b|\bbp-?e\b|conhecimento de transporte|manifesto/i.test(t) && !/\bnf-?e\b|nota fiscal/i.test(t);
};

/** Valor de um campo extra a partir da NF-e da guia; null = o Jarvis não tem o dado (ou o campo não é da NF-e). */
export function valorCampoExtra(titulo: string, nota?: { chave: string; numero: string; emissao: string } | null) {
  const t = String(titulo ?? "");
  if (!nota || campoDeOutroDocumento(t)) return null;
  if (/chave/i.test(t)) return nota.chave;
  if (/emiss/i.test(t)) return nota.emissao;
  if (/n[uú]mero.*(nota|nf|documento)/i.test(t)) return String(nota.numero ?? "").replace(/\D/g, "");
  return null;
}

// ─── Data de pagamento das guias ───
const somaDias = (iso: string, n: number) => { const d = new Date(iso.slice(0, 10) + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
function pascoa(ano: number) {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}
/** Feriado nacional ou dia sem expediente bancário (Carnaval, Sexta-feira Santa e Corpus Christi). */
export function feriadoNacional(iso: string) {
  const md = iso.slice(5, 10), p = pascoa(Number(iso.slice(0, 4)));
  return ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"].includes(md) || [-48, -47, -2, 60].some((n) => somaDias(p, n) === iso.slice(0, 10));
}
export const diaUtil = (iso: string) => { const w = new Date(iso.slice(0, 10) + "T12:00:00Z").getUTCDay(); return w !== 0 && w !== 6 && !feriadoNacional(iso); };
/** Primeiro dia útil DEPOIS da data (emissão na sexta, sábado ou domingo → segunda). */
export function diaUtilSeguinte(iso: string) { let d = somaDias(iso, 1); while (!diaUtil(d)) d = somaDias(d, 1); return d; }
/** Data de pagamento de uma guia. Automática: guia por nota = dia útil seguinte à emissão; mensal = vencimento.
 *  Fixa: a data escolhida para o lote. Nunca antes de hoje (a SEFAZ recusa data passada). */
export function dataPagamentoGuia(g: { tipo: string; emissao?: string | null; vencimento: string }, hoje: string, opc: { modo?: string; data?: string | null } = {}) {
  const alvo = opc.modo === "fixa" && /^\d{4}-\d{2}-\d{2}$/.test(String(opc.data ?? "")) ? String(opc.data)
    : g.tipo === "nota" && g.emissao ? diaUtilSeguinte(g.emissao) : g.vencimento;
  return alvo < hoje ? hoje : alvo;
}
