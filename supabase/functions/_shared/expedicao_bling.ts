// Expedição e estoque pelo Bling (API v3): depósitos, lançamento de estoque (entrada, saída, balanço) e etiquetas
// de envio dos pedidos (PDF juntado num arquivo só, ou ZPL para impressora térmica).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument } from "npm:pdf-lib@1.17.1";
import { HttpError, sleep } from "./common.ts";
import { validSecret } from "./store.ts";

const API = () => Deno.env.get("BLING_API_BASE") || "https://api.bling.com.br/Api/v3";

async function bling(db: SupabaseClient, ws: string) {
  const sec = await validSecret(db, ws, "bling");
  return async (metodo: string, path: string, corpo?: unknown) => {
    await sleep(350); // limite do Bling: 3 requisições por segundo
    const r = await fetch(`${API()}${path}`, {
      method: metodo,
      headers: { Authorization: `Bearer ${sec.access_token}`, Accept: "application/json", ...(corpo ? { "Content-Type": "application/json" } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    const txt = await r.text();
    let j: any = null;
    try { j = txt ? JSON.parse(txt) : null; } catch { j = { texto: txt.slice(0, 300) }; }
    if (!r.ok) {
      const e = j?.error ?? {};
      const campos = (e.fields ?? []).map((f: any) => `${f.element ?? ""}: ${f.msg ?? ""}`).join(" · ");
      throw new HttpError(r.status === 401 || r.status === 403 ? 400 : 502, `Bling ${r.status}: ${e.description ?? e.message ?? e.type ?? "erro"}${campos ? " — " + campos : ""}`);
    }
    return j;
  };
}

export async function depositosBling(db: SupabaseClient, ws: string) {
  const b = await bling(db, ws);
  const j = await b("GET", "/depositos?situacao=1&limite=100");
  return (j?.data ?? []).map((d: any) => ({ id: d.id, descricao: d.descricao, padrao: !!d.padrao, desconsiderarSaldo: !!d.desconsiderarSaldo }));
}

/** Lança estoque no Bling e devolve o saldo novo do produto (lido do próprio Bling), já gravado na cópia local. */
export async function lancarEstoqueBling(db: SupabaseClient, ws: string, d: any) {
  const b = await bling(db, ws);
  const op = String(d.operacao ?? "");
  if (!["E", "S", "B"].includes(op)) throw new HttpError(400, "Escolha entrada, saída ou balanço.");
  const qtd = Number(String(d.quantidade ?? "").replace(",", "."));
  if (!(qtd >= 0) || (op !== "B" && !(qtd > 0))) throw new HttpError(400, "Informe a quantidade.");
  if (!Number(d.produto)) throw new HttpError(400, "Produto sem vínculo com o Bling.");
  let deposito = Number(d.deposito) || 0;
  if (!deposito) { const ds = await depositosBling(db, ws); deposito = (ds.find((x: any) => x.padrao) ?? ds[0])?.id; }
  if (!deposito) throw new HttpError(400, "Nenhum depósito ativo no Bling.");
  const custo = d.custo === "" || d.custo == null ? undefined : Number(String(d.custo).replace(",", "."));
  const j = await b("POST", "/estoques", {
    produto: { id: Number(d.produto) }, deposito: { id: deposito }, operacao: op, quantidade: qtd,
    ...(custo !== undefined && !isNaN(custo) ? { custo, preco: custo } : {}),
    observacoes: String(d.observacao ?? "").slice(0, 200) || `Lançado pelo EcomBalance (${d.quem ?? ""})`,
  });
  // Saldo atualizado direto do Bling.
  const p = await b("GET", `/produtos/${Number(d.produto)}`).catch(() => null);
  const saldo = p?.data?.estoque?.saldoVirtualTotal;
  if (saldo != null && d.sku) await db.from("produtos").update({ saldo: Number(saldo), updated_at: new Date().toISOString() }).eq("workspace_id", ws).eq("id", String(d.sku));
  return { lancamento: j?.data?.id, deposito, saldo: saldo != null ? Number(saldo) : null };
}

/** Etiquetas de envio. PDF: baixa cada etiqueta e junta tudo num arquivo; ZPL: junta os textos. */
export async function etiquetasBling(db: SupabaseClient, ws: string, ids: (string | number)[], formato = "PDF", deadline = Date.now() + 110_000) {
  const b = await bling(db, ws);
  const lista = [...new Set(ids.map((x) => Number(x)).filter(Boolean))].slice(0, 60);
  if (!lista.length) throw new HttpError(400, "Selecione os pedidos.");
  const fmt = formato === "ZPL" ? "ZPL" : "PDF";
  const res: { id: number; ok: boolean; motivo?: string }[] = [];
  const pdf = fmt === "PDF" ? await PDFDocument.create() : null;
  const zpl: string[] = [];
  for (const id of lista) {
    if (Date.now() > deadline) { res.push({ id, ok: false, motivo: "Tempo esgotado: gere o restante num segundo lote." }); continue; }
    try {
      const j = await b("GET", `/logisticas/etiquetas?formato=${fmt}&idsVendas[]=${id}`);
      const e = (j?.data ?? [])[0];
      if (!e?.link) { res.push({ id, ok: false, motivo: e?.observacao || "O Bling não devolveu etiqueta para este pedido." }); continue; }
      const r = await fetch(e.link);
      if (!r.ok) { res.push({ id, ok: false, motivo: `Não consegui baixar a etiqueta (${r.status}).` }); continue; }
      const bytes = new Uint8Array(await r.arrayBuffer());
      if (fmt === "ZPL") { zpl.push(new TextDecoder().decode(bytes)); res.push({ id, ok: true }); continue; }
      if (String.fromCharCode(...bytes.slice(0, 4)) !== "%PDF") { res.push({ id, ok: false, motivo: "O link da etiqueta não é um PDF." }); continue; }
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const paginas = await pdf!.copyPages(doc, doc.getPageIndices());
      for (const pg of paginas) pdf!.addPage(pg);
      res.push({ id, ok: true });
    } catch (x) { res.push({ id, ok: false, motivo: String((x as any)?.message ?? x).slice(0, 200) }); }
  }
  const okN = res.filter((x) => x.ok).length;
  let arquivo: string | null = null;
  if (okN && pdf) arquivo = btoaGrande(await pdf.save());
  if (okN && fmt === "ZPL") arquivo = btoaGrande(new TextEncoder().encode(zpl.join("\n")));
  return { formato: fmt, geradas: okN, resultado: res, arquivo };
}

function btoaGrande(u8: Uint8Array) {
  let s = "";
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}
