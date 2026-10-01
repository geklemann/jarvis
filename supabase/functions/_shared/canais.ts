// Envio de alertas e do relatório semanal por e-mail (Resend) e WhatsApp (API oficial da Meta / WhatsApp Cloud).
// Cada canal só funciona depois que as chaves forem gravadas no servidor:
//   e-mail:   RESEND_API_KEY (+ ALERTAS_REMETENTE, ex.: "Jarvis <alertas@jaarvis.com.br>", domínio verificado no Resend)
//   WhatsApp: WHATSAPP_TOKEN e WHATSAPP_PHONE_ID (+ WHATSAPP_TEMPLATE, modelo aprovado com 2 variáveis: assunto e texto)
// Sem chave, o envio é registrado como "sem_canal" e nada sai. Todo envio (ou falha) fica em alertas_envios.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type Envio = { tipo: string; assunto: string; texto: string; html?: string; anexos?: { nome: string; base64: string }[] };
export type Destino = { id: string; canal: "email" | "whatsapp"; destino: string; nome?: string | null; tipos: string[]; ativo: boolean };

export const canaisDisponiveis = () => ({
  email: !!Deno.env.get("RESEND_API_KEY"),
  whatsapp: !!(Deno.env.get("WHATSAPP_TOKEN") && Deno.env.get("WHATSAPP_PHONE_ID")),
});

/** Telefone em formato internacional, só dígitos (11 dígitos brasileiros ganham o 55). */
export function telefone(t: string) {
  const d = String(t || "").replace(/\D/g, "");
  return d.length === 10 || d.length === 11 ? "55" + d : d;
}

async function porEmail(para: string, e: Envio) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: Deno.env.get("ALERTAS_REMETENTE") || "Jarvis <alertas@jaarvis.com.br>",
      to: [para], subject: e.assunto, text: e.texto, html: e.html ?? undefined,
      attachments: e.anexos?.map((a) => ({ filename: a.nome, content: a.base64 })),
    }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

async function porWhatsApp(para: string, e: Envio) {
  const modelo = Deno.env.get("WHATSAPP_TEMPLATE");
  // Mensagem iniciada pela empresa precisa de modelo aprovado pela Meta; texto livre só vale dentro de 24 h de conversa.
  const corpo = modelo
    ? { type: "template", template: { name: modelo, language: { code: "pt_BR" }, components: [{ type: "body", parameters: [{ type: "text", text: e.assunto.slice(0, 200) }, { type: "text", text: e.texto.replace(/\s*\n+\s*/g, " · ").slice(0, 900) }] }] } }
    : { type: "text", text: { body: `*${e.assunto}*\n${e.texto}`.slice(0, 4000) } };
  const r = await fetch(`https://graph.facebook.com/v21.0/${Deno.env.get("WHATSAPP_PHONE_ID")}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("WHATSAPP_TOKEN")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: telefone(para), ...corpo }),
  });
  if (!r.ok) throw new Error(`WhatsApp ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

/** Envia cada aviso para os destinos ativos que escolheram aquele tipo. */
export async function enviarCanais(db: SupabaseClient, ws: string, envios: Envio[], somente?: string) {
  const res = { enviados: 0, falhas: 0, sem_canal: 0 };
  if (!envios.length) return res;
  let q = db.from("alertas_destinos").select("id,canal,destino,nome,tipos,ativo").eq("workspace_id", ws).eq("ativo", true);
  if (somente) q = q.eq("id", somente);
  const { data } = await q;
  const disp = canaisDisponiveis();
  for (const d of (data ?? []) as Destino[]) for (const e of envios) {
    if (!somente && !(d.tipos ?? []).includes(e.tipo)) continue;
    let status: "enviado" | "falhou" | "sem_canal" = "enviado", erro: string | null = null;
    if (!disp[d.canal]) { status = "sem_canal"; res.sem_canal++; }
    else {
      try { await (d.canal === "email" ? porEmail(d.destino, e) : porWhatsApp(d.destino, e)); res.enviados++; }
      catch (x) { status = "falhou"; erro = String((x as Error).message ?? x).slice(0, 300); res.falhas++; }
    }
    await db.from("alertas_envios").insert({ workspace_id: ws, canal: d.canal, destino: d.destino, tipo: e.tipo, assunto: e.assunto.slice(0, 200), status, erro });
  }
  return res;
}
