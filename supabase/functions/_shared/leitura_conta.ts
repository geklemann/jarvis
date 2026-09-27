// Conta a pagar por foto, print, PDF ou voz: a IA (Claude) lê o boleto, a nota, a fatura ou a frase falada e devolve
// os campos do lançamento. Nada é gravado aqui: a pessoa confere na tela e salva.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { env, HttpError } from "./common.ts";

const MODEL = () => Deno.env.get("AI_MODEL_LEITURA") || "claude-sonnet-5";
const IMG = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const SYSTEM = `Você lê documentos de contas a pagar de uma loja de e-commerce brasileira (boletos, notas fiscais, faturas, recibos,
guias de impostos, contratos) ou uma frase falada por alguém da equipe, e extrai os dados do lançamento.
Regras:
- Nunca invente. Campo que não aparece fica null. Datas no formato AAAA-MM-DD. Valores em número com ponto decimal (1234.56).
- "valor" é o valor total a pagar. Em boleto, use o valor do documento (ou o valor cobrado, se houver multa/desconto explícitos).
- "vencimento" é o primeiro vencimento. Se houver várias parcelas/duplicatas no documento, liste todas em "parcelas".
- Em frases faladas, datas relativas ("dia 10", "semana que vem", "fim do mês") são resolvidas a partir de "hoje" informado;
  "dia 10" é o próximo dia 10 que ainda não passou.
- "linha_digitavel": a linha digitável do boleto (47 ou 48 dígitos, só números) ou o código PIX copia-e-cola, se houver.
- "categoria": escolha UMA da lista de categorias informada, a que melhor descreve a despesa (ou null se nenhuma servir).
- "tipo_documento": um de Boleto, Nota fiscal, Nota de serviço, Recibo, Contrato, Fatura, Guia de imposto.
- "fornecedor": nome do beneficiário/emitente como aparece (sem "LTDA" repetido, sem endereço). "cnpj_cpf" só dígitos.
- "confianca": alta, media ou baixa, e em "alertas" liste o que a pessoa deve conferir (campo ilegível, valor divergente,
  documento vencido, possível duplicidade, beneficiário diferente do emitente — risco de golpe de boleto).
Devolva APENAS um JSON válido, sem texto fora dele:
{"fornecedor": str|null, "cnpj_cpf": str|null, "tipo_documento": str|null, "numero": str|null, "emissao": str|null,
 "vencimento": str|null, "valor": num|null, "parcelas": [{"vencimento": str, "valor": num}], "linha_digitavel": str|null,
 "categoria": str|null, "descricao": "até 60 caracteres", "competencia": "AAAA-MM"|null, "confianca": "alta|media|baixa", "alertas": [str]}`;

export async function lerContaPagar(db: SupabaseClient, ws: string, userId: string, d: any) {
  const since = new Date(Date.now() - 86400_000).toISOString();
  const { count } = await db.from("ai_usage").select("id", { count: "exact", head: true }).eq("workspace_id", ws).gte("created_at", since);
  if ((count ?? 0) >= Number(Deno.env.get("AI_DAILY_LIMIT") || 400)) throw new HttpError(429, "Limite diário da IA atingido.");
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const categorias: string[] = Array.isArray(d.categorias) ? d.categorias.map(String).slice(0, 80) : [];
  const contexto = `Hoje: ${hoje}.\nCategorias disponíveis: ${categorias.join(" | ") || "(nenhuma cadastrada)"}.\nFornecedores já cadastrados (use o mesmo nome se for o mesmo): ${(Array.isArray(d.fornecedores) ? d.fornecedores.slice(0, 150) : []).join(" | ")}`;
  const content: any[] = [];
  const b64 = String(d.base64 ?? "");
  const mime = String(d.mime ?? "");
  if (b64) {
    if (b64.length > 11_000_000) throw new HttpError(400, "Arquivo grande demais (máximo 8 MB).");
    if (mime === "application/pdf") content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } });
    else if (IMG.includes(mime)) content.push({ type: "image", source: { type: "base64", media_type: mime, data: b64 } });
    else throw new HttpError(400, "Envie uma foto (JPG, PNG, WEBP) ou um PDF.");
    content.push({ type: "text", text: `${contexto}\n\nLeia o documento acima.${d.texto ? `\nObservação da pessoa: ${String(d.texto).slice(0, 500)}` : ""}` });
  } else if (String(d.texto ?? "").trim()) {
    content.push({ type: "text", text: `${contexto}\n\nFrase da pessoa (ditada por voz ou digitada): "${String(d.texto).slice(0, 1500)}"` });
  } else throw new HttpError(400, "Envie uma foto, um print, um PDF ou fale a conta.");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": env("ANTHROPIC_API_KEY"), "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL(), max_tokens: 1500, system: SYSTEM, messages: [{ role: "user", content }] }),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new HttpError(502, `IA indisponível: ${j?.error?.message ?? r.status}`);
  await db.from("ai_usage").insert({ workspace_id: ws, user_id: userId, model: j.model ?? MODEL(), input_tokens: j.usage?.input_tokens ?? 0, output_tokens: j.usage?.output_tokens ?? 0 });
  const txt = (j.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
  try { return JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1)); }
  catch { throw new HttpError(502, "A IA não conseguiu ler este documento. Tente uma foto mais nítida."); }
}
