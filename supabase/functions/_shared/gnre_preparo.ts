// Preparo das guias GNRE por nota (rascunhos): usado pelo botão "Preparar" (função gnre) e pela GNRE automática
// (agendador, todo dia de manhã, para as notas emitidas nos dias anteriores). Só PREPARA: o envio ao portal
// continua sendo um clique de quem cuida do fiscal (regra 1 do AGENTS: nada financeiro sem confirmação humana).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { blingGet, notaAindaValida } from "./difal.ts";
import { diasAPreparar } from "./gnre_regras.ts";
export { diasAPreparar };

const r2 = (v: number) => Math.round(v * 100) / 100;
const hojeBR = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

/** Cria um rascunho de guia para cada nota pendente informada (nota cancelada no Bling fica de fora). */
export async function prepararPorNota(db: SupabaseClient, ws: string, chaves: string[], quem: string) {
  const criadas: any[] = [];
  if (!chaves.length) return criadas;
  const { data: ns } = await db.from("difal_notas").select("*").eq("workspace_id", ws).in("chave", chaves.slice(0, 200).map(String)).eq("situacao", "pendente");
  const get = await blingGet(db, ws).catch(() => null);
  for (const n of ns ?? []) {
    if (get && !(await notaAindaValida(get, n.bling_id))) { await db.from("difal_notas").update({ situacao: "cancelada", updated_at: new Date().toISOString() }).eq("workspace_id", ws).eq("chave", n.chave); continue; }
    const g = { workspace_id: ws, id: `GN-${n.uf}-${String(n.numero ?? n.chave.slice(25, 34))}-${Date.now().toString(36)}`, uf: n.uf, tipo: "nota", referencia: n.chave, notas: [n.chave], valor_icms: n.v_difal, valor_fcp: n.v_fcp, total: r2(Number(n.v_difal) + Number(n.v_fcp)), vencimento: hojeBR(), status: "rascunho", criado_por: quem };
    await db.from("gnre_guias").insert(g);
    await db.from("difal_notas").update({ situacao: "guia", guia_id: g.id, updated_at: new Date().toISOString() }).eq("workspace_id", ws).eq("chave", n.chave);
    criadas.push(g);
  }
  return criadas;
}

/** GNRE automática: prepara os rascunhos das notas pendentes (sem inscrição na UF) emitidas nos dias informados. */
export async function prepararAutomatico(db: SupabaseClient, ws: string, dias: string[]) {
  if (!dias.length) return { guias: 0, total: 0, dias };
  const { data: ns } = await db.from("difal_notas").select("chave").eq("workspace_id", ws).eq("situacao", "pendente").gte("emissao", dias[0]).lte("emissao", dias[dias.length - 1]).limit(500);
  const criadas = await prepararPorNota(db, ws, (ns ?? []).map((n: any) => n.chave), "Jarvis (GNRE automática)");
  if (criadas.length) await db.from("audit_log").insert({ workspace_id: ws, id: crypto.randomUUID(), time: new Date().toISOString(), action: "GNRE automática: guias preparadas", actor: "Jarvis (GNRE automática)", detail: JSON.stringify({ dias, guias: criadas.map((g) => [g.id, g.total]) }).slice(0, 900) }).then(() => null, () => null);
  return { guias: criadas.length, total: r2(criadas.reduce((s, g) => s + g.total, 0)), dias };
}
