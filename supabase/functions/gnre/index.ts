// GNRE (guia do DIFAL/FCP) pelo webservice oficial do Portal GNRE, autenticado com o certificado e-CNPJ (A1) da empresa.
// O certificado e a senha ficam SÓ nos segredos do servidor (GNRE_CERT_PFX em base64 e GNRE_CERT_SENHA), gravados
// pelo próprio dono com ops/gravar-segredo.ps1 — nunca no código, no banco ou no navegador.
// Fluxo: preparar (guias em rascunho a partir das notas com DIFAL ou da apuração mensal) → enviar (lote 2.00) →
// consultar (linha digitável, código de barras e PDF) → título no contas a pagar, pago pelo SISPAG (forma 91).
// Sem certificado, "xml" devolve o lote para enviar pelo site do Portal GNRE.
import { authorize, cors, json, HttpError, round } from "../_shared/common.ts";
import { configFiscal } from "../_shared/nfe_focus.ts";
import { blingGet, notaAindaValida } from "../_shared/difal.ts";
import { dataPagamentoGuia } from "../_shared/gnre_regras.ts";
import { consultarResultados } from "../_shared/gnre_consulta.ts";
import { ambienteGnre, consultarConfigUf, enviarLote, montarLote, temCertificado, type Emitente, type GuiaIn } from "../_shared/gnre.ts";

const hoje = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10); // dia em Brasília
function ultimoDia(mes: string) { const [a, m] = mes.split("-").map(Number); return `${mes}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, "0")}`; }
function proximoMes(mes: string, dia: number) { const [a, m] = mes.split("-").map(Number); const d = new Date(Date.UTC(a, m, 1)); const ult = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(dia, ult)).padStart(2, "0")}`; }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    // Diagnóstico: só verdadeiro/falso (sem dados), para conferir se o servidor está pronto para a GNRE.
    if (body.action === "diagnostico") {
      const mtls = typeof (Deno as any).createHttpClient === "function";
      return json({ certificado: temCertificado(), cliente_tls: mtls, ambiente: ambienteGnre() });
    }
    const ws = String(body.workspace_id ?? "");
    const { user, db } = await authorize(req, ws);
    const { data: m } = await db.from("workspace_members").select("role").eq("workspace_id", ws).eq("user_id", user.id).maybeSingle();
    if (!["owner", "member", "financeiro"].includes(String(m?.role))) throw new HttpError(403, "Seu papel não permite gerar guias.");
    const quem = user.email ?? user.id;
    const cfg: any = await configFiscal(db, ws);
    const difalUf: Record<string, any> = cfg.difal_uf ?? {};
    const em: Emitente = { cnpj: cfg.cnpj, razao: cfg.razao || cfg.emitente?.razao || "", endereco: cfg.emitente?.endereco ?? "", ibge: cfg.emitente?.ibge ?? "", uf: cfg.uf, cep: cfg.emitente?.cep ?? "", telefone: cfg.emitente?.telefone ?? "" };
    const log = (acao: string, det: unknown) => db.from("audit_log").insert({ workspace_id: ws, id: crypto.randomUUID(), time: new Date().toISOString(), action: acao, actor: quem, detail: JSON.stringify(det).slice(0, 900) }).then(() => null, () => null);

    async function configDe(uf: string) {
      // A configuração da UF muda entre homologação e produção (ex.: SE pede o campo 94 num e o 77 no outro):
      // o cache só vale para o mesmo ambiente.
      const { data } = await db.from("gnre_config_uf").select("config,lido_em").eq("workspace_id", ws).eq("uf", uf).eq("receita", "100102").maybeSingle();
      if (data && data.config?.ambiente === ambienteGnre() && Date.now() - new Date(data.lido_em).getTime() < 30 * 864e5) return data.config;
      if (!temCertificado()) return data?.config ?? null;
      const c = { ...(await consultarConfigUf(uf, "100102")), ambiente: ambienteGnre() };
      await db.from("gnre_config_uf").upsert({ workspace_id: ws, uf, receita: "100102", config: c, lido_em: new Date().toISOString() });
      return c;
    }
    // Data de pagamento escolhida no lote: automática (dia útil seguinte à emissão de cada nota) ou fixa.
    const opcPag = { modo: body.pagamento?.modo === "fixa" ? "fixa" : "auto", data: body.pagamento?.data ? String(body.pagamento.data) : null };
    if (opcPag.modo === "fixa" && (!/^\d{4}-\d{2}-\d{2}$/.test(String(opcPag.data)) || String(opcPag.data) < hoje())) throw new HttpError(400, "Escolha uma data de pagamento a partir de hoje.");
    async function guiasIn(rows: any[]): Promise<GuiaIn[]> {
      const out: GuiaIn[] = [];
      const chaves = rows.flatMap((g) => (g.tipo === "nota" ? g.notas : []));
      const { data: ns } = chaves.length ? await db.from("difal_notas").select("*").eq("workspace_id", ws).in("chave", chaves) : { data: [] };
      const N = new Map((ns ?? []).map((x: any) => [x.chave, x]));
      for (const g of rows) {
        const n: any = g.tipo === "nota" ? N.get(g.notas[0]) : null;
        const pag = dataPagamentoGuia({ tipo: g.tipo, emissao: n?.emissao ?? null, vencimento: g.vencimento }, hoje(), opcPag);
        out.push({ id: g.id, uf: g.uf, tipo: g.tipo, ie: difalUf[g.uf]?.ie || null, vencimento: g.tipo === "nota" ? pag : g.vencimento, pagamento: pag, icms: Number(g.valor_icms), fcp: Number(g.valor_fcp), fcpSeparado: !!difalUf[g.uf]?.fcp_separado, cepEmitente: (cfg.gnre_cep_uf ?? {})[g.uf] || null,
          nota: n ? { chave: n.chave, numero: n.numero, emissao: n.emissao, dest_doc: n.dest_doc, dest_nome: n.dest_nome, dest_mun: n.dest_mun } : undefined, mes: g.tipo === "mensal" ? g.referencia : undefined, config: await configDe(g.uf).catch(() => null) });
      }
      return out;
    }
    const exigirEmitente = () => { if (!em.cnpj || !em.razao || !em.endereco || !em.ibge || !em.cep) throw new HttpError(400, "Complete os dados do emitente para a GNRE (endereço, código IBGE do município e CEP) em DIFAL e GNRE › Configuração."); };

    switch (body.action) {
      case "config_uf": {
        const uf = String(body.uf ?? "").toUpperCase();
        if (!/^[A-Z]{2}$/.test(uf)) throw new HttpError(400, "UF inválida.");
        const c = { ...(await consultarConfigUf(uf, String(body.receita ?? "100102"))), ambiente: ambienteGnre() };
        await db.from("gnre_config_uf").upsert({ workspace_id: ws, uf, receita: String(body.receita ?? "100102"), config: c, lido_em: new Date().toISOString() });
        return json(c);
      }
      case "preparar": {
        const criadas: any[] = [];
        if (Array.isArray(body.chaves) && body.chaves.length) {
          const { data: ns } = await db.from("difal_notas").select("*").eq("workspace_id", ws).in("chave", body.chaves.slice(0, 200).map(String)).eq("situacao", "pendente");
          const get = await blingGet(db, ws).catch(() => null);
          for (const n of ns ?? []) {
            if (get && !(await notaAindaValida(get, n.bling_id))) { await db.from("difal_notas").update({ situacao: "cancelada", updated_at: new Date().toISOString() }).eq("workspace_id", ws).eq("chave", n.chave); continue; }
            const g = { workspace_id: ws, id: `GN-${n.uf}-${String(n.numero ?? n.chave.slice(25, 34))}-${Date.now().toString(36)}`, uf: n.uf, tipo: "nota", referencia: n.chave, notas: [n.chave], valor_icms: n.v_difal, valor_fcp: n.v_fcp, total: round(Number(n.v_difal) + Number(n.v_fcp)), vencimento: hoje(), status: "rascunho", criado_por: quem };
            await db.from("gnre_guias").insert(g);
            await db.from("difal_notas").update({ situacao: "guia", guia_id: g.id, updated_at: new Date().toISOString() }).eq("workspace_id", ws).eq("chave", n.chave);
            criadas.push(g);
          }
        } else if (body.mensal?.uf && /^\d{4}-\d{2}$/.test(String(body.mensal.mes))) {
          const uf = String(body.mensal.uf), mes = String(body.mensal.mes);
          if (!difalUf[uf]?.ie) throw new HttpError(400, `Sem inscrição estadual cadastrada em ${uf}: o DIFAL de ${uf} é por nota.`);
          const { data: ns } = await db.from("difal_notas").select("chave,v_difal,v_fcp").eq("workspace_id", ws).eq("uf", uf).eq("situacao", "mensal").gte("emissao", `${mes}-01`).lte("emissao", ultimoDia(mes));
          if (!ns?.length) throw new HttpError(400, `Nenhuma nota com DIFAL em ${uf} no mês ${mes}.`);
          const icms = round(ns.reduce((s: number, x: any) => s + Number(x.v_difal), 0)), fcp = round(ns.reduce((s: number, x: any) => s + Number(x.v_fcp), 0));
          const g = { workspace_id: ws, id: `GM-${uf}-${mes}-${Date.now().toString(36)}`, uf, tipo: "mensal", referencia: mes, notas: ns.map((x: any) => x.chave), valor_icms: icms, valor_fcp: fcp, total: round(icms + fcp), vencimento: proximoMes(mes, Number(difalUf[uf]?.dia) || 10), status: "rascunho", criado_por: quem };
          await db.from("gnre_guias").insert(g);
          await db.from("difal_notas").update({ guia_id: g.id, updated_at: new Date().toISOString() }).eq("workspace_id", ws).in("chave", g.notas);
          criadas.push(g);
        } else throw new HttpError(400, "Escolha as notas ou a UF e o mês.");
        await log("GNRE: guias preparadas", { guias: criadas.map((g) => [g.id, g.total]) });
        return json({ guias: criadas.map((g) => ({ id: g.id, uf: g.uf, total: g.total })), certificado: temCertificado() });
      }
      case "xml": case "enviar": {
        const ids = (Array.isArray(body.ids) ? body.ids : []).map(String).sort().slice(0, 50);
        const { data: rows } = await db.from("gnre_guias").select("*").eq("workspace_id", ws).in("id", ids).in("status", ["rascunho", "rejeitada"]);
        if (!rows?.length) throw new HttpError(400, "Nenhuma guia em rascunho entre as escolhidas.");
        rows.sort((a: any, b: any) => a.id.localeCompare(b.id));
        exigirEmitente();
        const gin = await guiasIn(rows), lote = montarLote(gin, em);
        if (body.action === "xml") return json({ xml: `<?xml version="1.0" encoding="UTF-8"?>${lote}`, guias: rows.length, pagamentos: gin.map((x) => [x.id, x.pagamento]) });
        const r = await enviarLote(lote);
        const pagPor = new Map(gin.map((x) => [x.id, x.pagamento]));
        for (const g of rows) await db.from("gnre_guias").update({ status: "enviada", retorno: null, vencimento: g.tipo === "nota" ? pagPor.get(g.id) ?? g.vencimento : g.vencimento, recibo: r.recibo, lote_id: r.recibo, ambiente: ambienteGnre(), xml: lote.length < 200_000 ? lote : null, motivos: null, updated_at: new Date().toISOString() }).eq("workspace_id", ws).eq("id", g.id);
        await log("GNRE: lote enviado", { recibo: r.recibo, guias: rows.length, ambiente: ambienteGnre(), pagamento: opcPag });
        return json({ recibo: r.recibo, guias: rows.length, tempo: r.tempo, ambiente: ambienteGnre() });
      }
      case "consultar": return json(await consultarResultados(db, ws, quem));
      case "cancelar_rascunho": {
        const { data: g } = await db.from("gnre_guias").select("*").eq("workspace_id", ws).eq("id", String(body.id ?? "")).maybeSingle();
        if (!g || !["rascunho", "rejeitada"].includes(g.status)) throw new HttpError(400, "Só rascunho ou guia rejeitada pode ser cancelada aqui.");
        await db.from("gnre_guias").update({ status: "cancelada", updated_at: new Date().toISOString() }).eq("workspace_id", ws).eq("id", g.id);
        await db.from("difal_notas").update({ situacao: g.tipo === "nota" ? "pendente" : "mensal", guia_id: null }).eq("workspace_id", ws).in("chave", g.notas);
        return json({ ok: true });
      }
    }
    throw new HttpError(400, "Ação inválida.");
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return json({ error: e instanceof Error ? e.message : String(e) }, status);
  }
});
