// DIFAL das vendas: lê cada NF-e de saída autorizada no Bling (XML) e guarda o ICMS da UF de destino e o FCP por nota,
// com a UF e o destinatário. Notas para dentro de SC (ou sem DIFAL) ficam marcadas "sem_difal" sem baixar o XML.
// Nas UFs em que a empresa tem inscrição estadual o DIFAL é apurado no mês ("mensal"); nas demais, uma GNRE por nota.
// Anda por dia de emissão com um cursor guardado em integrations.settings.difal (o cron chama a cada rodada).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { HttpError, round, sleep } from "./common.ts";
import { validSecret } from "./store.ts";

const API = () => Deno.env.get("BLING_API_BASE") || "https://api.bling.com.br/Api/v3";
const tag = (x: string, t: string) => x.match(new RegExp(`<${t}>([^<]*)</${t}>`))?.[1] ?? null;
const bloco = (x: string, t: string) => x.match(new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)</${t}>`))?.[1] ?? "";
const dia = (d: Date) => d.toISOString().slice(0, 10);
const somaDia = (d: string, n: number) => dia(new Date(new Date(d + "T12:00:00Z").getTime() + n * 864e5));

export async function blingGet(db: SupabaseClient, ws: string) {
  const sec = await validSecret(db, ws, "bling");
  return async (path: string) => {
    await sleep(340);
    const r = await fetch(`${API()}${path}`, { headers: { Authorization: `Bearer ${sec.access_token}`, Accept: "application/json" } });
    const j: any = await r.json().catch(() => null);
    if (!r.ok) throw new HttpError(502, `Bling ${r.status}: ${j?.error?.description ?? j?.error?.message ?? "erro"}`);
    return j;
  };
}

export function difalDoXml(xml: string) {
  const inf = xml.match(/<infNFe[^>]*Id="NFe(\d{44})"/), ide = bloco(xml, "ide"), dest = bloco(xml, "dest"), ed = bloco(dest, "enderDest"), tot = bloco(xml, "ICMSTot");
  return {
    chave: inf?.[1] ?? null, numero: tag(ide, "nNF"), serie: tag(ide, "serie"), emissao: String(tag(ide, "dhEmi") ?? "").slice(0, 10),
    uf: tag(ed, "UF") ?? "", dest_nome: tag(dest, "xNome"), dest_doc: tag(dest, "CPF") ?? tag(dest, "CNPJ"), dest_mun: tag(ed, "cMun"), indIEDest: tag(dest, "indIEDest"),
    valor_nota: Number(tag(tot, "vNF") ?? 0), v_difal: Number(tag(tot, "vICMSUFDest") ?? 0), v_fcp: Number(tag(tot, "vFCPUFDest") ?? 0),
  };
}

type Cursor = { dia: string; pagina: number; desde?: string };
/** Avança a leitura das notas de saída. Devolve o cursor novo e o que foi gravado. */
export async function difalSync(db: SupabaseClient, ws: string, cur: Cursor | null, ufEmit: string, ieUf: Record<string, unknown>, deadline = Date.now() + 45_000, ate?: string) {
  const hoje = dia(new Date());
  let c: Cursor = cur?.dia ? { ...cur } : { dia: `${hoje.slice(0, 7)}-01`, pagina: 1 };
  const get = await blingGet(db, ws);
  const out = { lidas: 0, com_difal: 0, sem_difal: 0, erros: 0, cursor: c as Cursor, completo: false };
  while (Date.now() < deadline) {
    if (ate && c.dia > ate) { out.completo = true; break; } // leitura de um dia só: terminou
    if (c.dia > hoje) { c = { dia: somaDia(hoje, -2), pagina: 1 }; break; } // chegou ao fim: da próxima vez relê os 2 últimos dias
    const q = new URLSearchParams({ pagina: String(c.pagina), limite: "100", tipo: "1", dataEmissaoInicial: `${c.dia} 00:00:00`, dataEmissaoFinal: `${c.dia} 23:59:59` });
    const lista = (await get(`/nfe?${q}`))?.data ?? [];
    const ids = lista.map((x: any) => Number(x.id)).filter(Boolean);
    const { data: ja } = ids.length ? await db.from("difal_notas").select("bling_id").eq("workspace_id", ws).in("bling_id", ids) : { data: [] };
    const conhecidos = new Set((ja ?? []).map((x: any) => Number(x.bling_id)));
    let parou = false;
    for (const n of lista) {
      if (conhecidos.has(Number(n.id))) continue;
      if (Date.now() > deadline) { parou = true; break; }
      try {
        const d = (await get(`/nfe/${n.id}`))?.data ?? {};
        const sit = Number(d.situacao), chave = d.chaveAcesso ? String(d.chaveAcesso) : null;
        if (![2, 5, 6, 7].includes(sit) || !chave) continue; // pendente/rejeitada: volta na releitura
        const uf = String(d.contato?.endereco?.uf ?? "").toUpperCase();
        const base = { workspace_id: ws, chave, bling_id: Number(n.id), numero: d.numero ? String(d.numero) : null, serie: d.serie != null ? String(d.serie) : null, emissao: String(d.dataEmissao ?? c.dia).slice(0, 10), uf: uf || ufEmit, dest_nome: d.contato?.nome ?? null, dest_doc: d.contato?.numeroDocumento ?? null, valor_nota: round(Number(d.valorNota ?? 0)), updated_at: new Date().toISOString() };
        if (sit === 2) { await db.from("difal_notas").upsert({ ...base, situacao: "cancelada" }, { onConflict: "workspace_id,chave" }); continue; }
        if (!uf || uf === ufEmit) { await db.from("difal_notas").upsert({ ...base, situacao: "sem_difal" }, { onConflict: "workspace_id,chave", ignoreDuplicates: true }); out.sem_difal++; out.lidas++; continue; }
        const link = d.xml || d.linkXML;
        const r = link ? await fetch(link).catch(() => null) : null;
        const xml = r?.ok ? await r.text() : "";
        if (!xml.includes("<infNFe")) { out.erros++; continue; }
        const x = difalDoXml(xml);
        const tem = x.v_difal + x.v_fcp > 0.004;
        await db.from("difal_notas").upsert({ ...base, uf: x.uf || uf, dest_nome: x.dest_nome ?? base.dest_nome, dest_doc: x.dest_doc ?? base.dest_doc, dest_mun: x.dest_mun, valor_nota: x.valor_nota || base.valor_nota, v_difal: x.v_difal, v_fcp: x.v_fcp, situacao: !tem ? "sem_difal" : ieUf[x.uf || uf] ? "mensal" : "pendente" }, { onConflict: "workspace_id,chave", ignoreDuplicates: true });
        out.lidas++; tem ? out.com_difal++ : out.sem_difal++;
      } catch { out.erros++; }
    }
    if (parou) break;
    c = lista.length === 100 ? { dia: c.dia, pagina: c.pagina + 1 } : { dia: somaDia(c.dia, 1), pagina: 1 };
  }
  out.cursor = c;
  return out;
}

/** Situação atual da nota no Bling (para não gerar guia de nota cancelada depois da leitura). */
export async function notaAindaValida(get: (p: string) => Promise<any>, blingId: number | null) {
  if (!blingId) return true;
  const d = (await get(`/nfe/${blingId}`).catch(() => null))?.data;
  return !d || [5, 6, 7].includes(Number(d.situacao));
}
