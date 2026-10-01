// Boleto pela linha digitável (sem IA): acha a linha no texto (PDF ou e-mail), confere os dígitos verificadores e tira
// banco, vencimento e valor. Bancário (47 dígitos) e arrecadação/concessionárias e tributos (48, começa com 8).
// Fator de vencimento: dias desde 07/10/1997; ao chegar em 9999 (21/02/2025) recomeçou em 1000 = 22/02/2025.
// Sem dependências: testado pelo Node (testes/boleto.test.mjs).

export type Boleto = { linha: string; tipo: "bancario" | "arrecadacao"; banco: string | null; bancoNome: string | null; valor: number | null; vencimento: string | null };

const BANCOS: Record<string, string> = { "001": "Banco do Brasil", "033": "Santander", "041": "Banrisul", "077": "Inter", "104": "Caixa", "208": "BTG Pactual", "212": "Original", "237": "Bradesco", "260": "Nubank", "290": "PagBank", "323": "Mercado Pago", "336": "C6 Bank", "341": "Itaú", "380": "PicPay", "422": "Safra", "655": "Votorantim", "748": "Sicredi", "756": "Sicoob", "085": "Ailos", "136": "Unicred", "403": "Cora", "197": "Stone", "746": "Modal" };

export function mod10(num: string) {
  let soma = 0, peso = 2;
  for (let i = num.length - 1; i >= 0; i--) { let p = Number(num[i]) * peso; if (p > 9) p = Math.floor(p / 10) + (p % 10); soma += p; peso = peso === 2 ? 1 : 2; }
  const r = soma % 10; return r === 0 ? 0 : 10 - r;
}
/** Módulo 11 do código de barras bancário (pesos 2 a 9; resultado 0, 10 ou 11 vira 1). */
export function mod11Bancario(num: string) {
  let soma = 0, peso = 2;
  for (let i = num.length - 1; i >= 0; i--) { soma += Number(num[i]) * peso; peso = peso === 9 ? 2 : peso + 1; }
  const dv = 11 - (soma % 11); return dv === 0 || dv === 10 || dv === 11 ? 1 : dv;
}
/** Módulo 11 da arrecadação (resto 0 ou 1 vira 0; resto 10 vira 1). */
function mod11Arrecadacao(num: string) {
  let soma = 0, peso = 2;
  for (let i = num.length - 1; i >= 0; i--) { soma += Number(num[i]) * peso; peso = peso === 9 ? 2 : peso + 1; }
  const r = soma % 11; return r === 0 || r === 1 ? 0 : r === 10 ? 1 : 11 - r;
}
const somaDias = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** Vencimento pelo fator: entre as duas bases (1997 e 2025), a data mais próxima de hoje. */
export function vencimentoFator(fator: number, hoje: string) {
  if (!fator) return null;
  const a = somaDias("1997-10-07", fator), b = fator >= 1000 ? somaDias("2025-02-22", fator - 1000) : null;
  if (!b) return a;
  const dist = (x: string) => Math.abs(Date.parse(x) - Date.parse(hoje));
  return dist(b) <= dist(a) ? b : a;
}

/** Lê uma linha digitável (só dígitos). null se os dígitos verificadores não conferem. */
export function lerLinha(digitos: string, hoje: string): Boleto | null {
  const d = digitos.replace(/\D/g, "");
  if (d.length === 47) {
    const c1 = d.slice(0, 9), c2 = d.slice(10, 20), c3 = d.slice(21, 31);
    if (mod10(c1) !== Number(d[9]) || mod10(c2) !== Number(d[20]) || mod10(c3) !== Number(d[31])) return null;
    const dvGeral = Number(d[32]), fator = Number(d.slice(33, 37)), valor = Number(d.slice(37, 47)) / 100;
    const barras = d.slice(0, 4) + d.slice(33, 47) + d.slice(4, 9) + d.slice(10, 20) + d.slice(21, 31);
    if (mod11Bancario(barras) !== dvGeral) return null;
    const banco = d.slice(0, 3);
    return { linha: d, tipo: "bancario", banco, bancoNome: BANCOS[banco] ?? null, valor: valor || null, vencimento: vencimentoFator(fator, hoje) };
  }
  if (d.length === 48 && d[0] === "8") {
    const blocos = [0, 12, 24, 36].map((i) => d.slice(i, i + 11)), dvs = [11, 23, 35, 47].map((i) => Number(d[i]));
    const ref = d[2], fn = ref === "6" || ref === "7" ? mod10 : mod11Arrecadacao;
    if (blocos.some((b, i) => fn(b) !== dvs[i])) return null;
    const barras = blocos.join("");
    // O valor é real quando o identificador é 6 ou 8; 7 e 9 = valor de referência (quantidade, índice…).
    const valor = ref === "6" || ref === "8" ? Number(barras.slice(4, 15)) / 100 : null;
    // Muitos convênios trazem a data AAAAMMDD logo depois da identificação da empresa (posição 20).
    const ymd = barras.slice(19, 27), dt = /^(20\d\d)(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(ymd) ? `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}` : null;
    const perto = dt && Math.abs(Date.parse(dt) - Date.parse(hoje)) < 400 * 864e5 ? dt : null;
    return { linha: d, tipo: "arrecadacao", banco: null, bancoNome: null, valor: valor || null, vencimento: perto };
  }
  return null;
}

/** Acha linhas digitáveis válidas num texto (com ou sem pontos e espaços). Sem repetição. */
export function acharBoletos(texto: string, hoje: string): Boleto[] {
  const t = String(texto ?? "");
  const cand = new Set<string>();
  // Bancário: 5.5 5.6 5.6 1 14 (pontos/espaços opcionais); arrecadação: 4 blocos de 11+1.
  for (const m of t.matchAll(/\d{5}[.\s]?\d{5}[\s.]*\d{5}[.\s]?\d{6}[\s.]*\d{5}[.\s]?\d{6}[\s.]*\d[\s.]*\d{14}/g)) cand.add(m[0].replace(/\D/g, ""));
  for (const m of t.matchAll(/8\d{10}[-\s]?\d[\s.]*\d{11}[-\s]?\d[\s.]*\d{11}[-\s]?\d[\s.]*\d{11}[-\s]?\d/g)) cand.add(m[0].replace(/\D/g, ""));
  for (const m of t.matchAll(/(?<!\d)\d{47,48}(?!\d)/g)) cand.add(m[0]);
  const out: Boleto[] = [], vistos = new Set<string>();
  for (const c of cand) { const b = lerLinha(c, hoje); if (b && !vistos.has(b.linha)) { vistos.add(b.linha); out.push(b); } }
  return out;
}

/** Beneficiário escrito no boleto (linha depois de "Beneficiário"/"Cedente"), quando o texto do PDF traz. */
export function beneficiario(texto: string) {
  const m = String(texto ?? "").match(/(?:Benefici[aá]rio|Cedente)(?:\s+final)?\s*[:\-]?\s*\n?\s*([^\n]{3,90})/i);
  if (!m) return null;
  const v = m[1].replace(/\s+(CNPJ|CPF|Ag[eê]ncia|C[oó]digo).*$/i, "").replace(/[^\p{L}\p{N}&.,\- ]/gu, "").trim();
  return v.length >= 3 && !/^\d+$/.test(v) ? v.slice(0, 80) : null;
}
