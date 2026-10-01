// Resultado dos lotes GNRE enviados: usado pelo botão "Consultar resultado" (função gnre) e pelo agendador
// (função integrations, a cada rodada), para as guias não ficarem paradas em "aguardando portal".
// Guarda o que a SEFAZ respondeu em cada guia (retorno) e registra a consulta na auditoria.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { resultadoLote } from "./gnre.ts";

const hoje = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
// Situação do LOTE sem guias no retorno: 400/401 = recebido / em processamento (esperar); demais = o lote não será
// processado (ex.: 404 erro no processamento, 6xx recusa) e as guias voltam para reenvio.
const loteAindaProcessando = (c?: string | null) => !c || ["400", "401"].includes(String(c));

export async function consultarResultados(db: SupabaseClient, ws: string, quem: string) {
  const { data: rows } = await db.from("gnre_guias").select("*").eq("workspace_id", ws).eq("status", "enviada").order("id");
  const porLote = new Map<string, any[]>();
  for (const g of rows ?? []) (porLote.get(g.recibo) ?? porLote.set(g.recibo, []).get(g.recibo)!).push(g);
  const out: any[] = [], resumo: any[] = [], agora = new Date().toISOString();
  for (const [recibo, gs] of porLote) {
    const r = await resultadoLote(recibo);
    resumo.push({ recibo, lote: [r.codigo, r.descricao], guias: r.guias.map((x) => [x.uf, x.situacao, x.motivos.map((m) => `${m.codigo} ${m.descricao}`).join("; ")]) });
    if (!r.guias.length) {
      if (loteAindaProcessando(r.codigo)) {
        for (const g of gs) await db.from("gnre_guias").update({ retorno: { lote: r.codigo, descricao: r.descricao ?? "Em processamento no Portal GNRE", em: agora } }).eq("workspace_id", ws).eq("id", g.id);
        out.push({ recibo, situacao: r.descricao ?? r.codigo ?? "processando" });
      } else {
        for (const g of gs) {
          await db.from("gnre_guias").update({ status: "rejeitada", motivos: [{ codigo: r.codigo, descricao: r.descricao ?? "Lote não processado pelo Portal GNRE", campo: null }], retorno: { lote: r.codigo, descricao: r.descricao, em: agora }, updated_at: agora }).eq("workspace_id", ws).eq("id", g.id);
          if (g.tipo === "nota") await db.from("difal_notas").update({ situacao: "pendente", guia_id: null }).eq("workspace_id", ws).in("chave", g.notas);
          out.push({ id: g.id, status: "rejeitada", motivos: [{ codigo: r.codigo, descricao: r.descricao }] });
        }
      }
      continue;
    }
    // O retorno traz as guias na ordem do lote; a UF confere o pareamento (lote enviado ordenado pelo id da guia).
    for (const [i, g] of gs.entries()) {
      const x = r.guias.find((y, j) => j === i && (!y.uf || y.uf === g.uf)) ?? r.guias.find((y) => y.uf === g.uf && !gs.some((o, k) => k < i && o.uf === g.uf));
      if (!x) continue;
      if (x.situacao === "0" && (x.linha || x.barras)) {
        const payId = `gnre-${g.id}`;
        const notaTxt = g.tipo === "nota" ? `NF ${g.referencia?.slice(25, 34)?.replace(/^0+/, "") ?? ""}` : `mensal ${g.referencia}`;
        // Guia de homologação não se paga: não vira título e a nota volta para a fila (a guia real sai em produção).
        const teste = g.ambiente !== "producao";
        if (!teste) await db.from("payables").upsert({ workspace_id: ws, id: payId, origem: "gnre", fornecedor: `SEFAZ ${g.uf}`, descricao: `GNRE DIFAL/FCP ${g.uf} · ${notaTxt}`, documento: x.nosso ?? null, emissao: hoje(), vencimento: x.limite ?? g.vencimento, valor: g.total, status: "aberto", categoria: "Impostos e taxas", linha_digitavel: x.linha ?? x.barras, aprovacao: "aprovado", created_by: quem }, { onConflict: "workspace_id,id", ignoreDuplicates: true });
        await db.from("gnre_guias").update({ status: "emitida", linha_digitavel: x.linha, codigo_barras: x.barras, nosso_numero: x.nosso, vencimento: x.limite ?? g.vencimento, pdf_base64: i === 0 ? r.pdf : null, payable_id: teste ? null : payId, retorno: { lote: r.codigo, guia: x.situacao, em: agora }, updated_at: agora }).eq("workspace_id", ws).eq("id", g.id);
        if (teste && g.tipo === "nota") await db.from("difal_notas").update({ situacao: "pendente", guia_id: null }).eq("workspace_id", ws).in("chave", g.notas);
        if (teste && g.tipo === "mensal") await db.from("difal_notas").update({ guia_id: null }).eq("workspace_id", ws).in("chave", g.notas);
        out.push({ id: g.id, status: "emitida", teste });
      } else if (x.situacao && x.situacao !== "0" && x.situacao !== "4") {
        await db.from("gnre_guias").update({ status: "rejeitada", motivos: x.motivos.length ? x.motivos : [{ codigo: `situação ${x.situacao}`, descricao: r.descricao ?? "Guia não emitida", campo: null }], retorno: { lote: r.codigo, guia: x.situacao, em: agora }, updated_at: agora }).eq("workspace_id", ws).eq("id", g.id);
        if (g.tipo === "nota") await db.from("difal_notas").update({ situacao: "pendente", guia_id: null }).eq("workspace_id", ws).in("chave", g.notas);
        out.push({ id: g.id, status: "rejeitada", motivos: x.motivos });
      } else {
        // Situação 4 (ou sem situação): a UF ainda não devolveu. Fica enviada, com o que o portal disse.
        await db.from("gnre_guias").update({ retorno: { lote: r.codigo, descricao: r.descricao, guia: x.situacao || null, motivos: x.motivos, em: agora } }).eq("workspace_id", ws).eq("id", g.id);
      }
    }
  }
  if (resumo.length) await db.from("audit_log").insert({ workspace_id: ws, id: crypto.randomUUID(), time: agora, action: "GNRE: resultado consultado", actor: quem, detail: JSON.stringify(resumo).slice(0, 1800) }).then(() => null, () => null);
  return { resultado: out, lotes: resumo };
}
