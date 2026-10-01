import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.117.0";
import { assinaturaErro } from "./erros.ts";
export { assinaturaErro };

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

export const env = (name: string, required = true) => {
  const v = Deno.env.get(name);
  if (!v && required) throw new HttpError(500, `Configuração ausente no servidor: ${name}`);
  return v ?? "";
};

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const admin = (): SupabaseClient =>
  createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

/** Valida o JWT do usuário e confirma que ele é membro do workspace informado. */
export async function authorize(req: Request, workspaceId: string) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "Faça login para continuar.");
  const db = admin();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Sessão expirada. Entre novamente.");
  if (!workspaceId) throw new HttpError(400, "workspace_id obrigatório.");
  const { data: member } = await db.from("workspace_members").select("role")
    .eq("workspace_id", workspaceId).eq("user_id", data.user.id).maybeSingle();
  if (!member) throw new HttpError(403, "Você não participa deste workspace.");
  return { user: data.user, db };
}

export const handler = (fn: (req: Request) => Promise<Response>) => async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const copia = req.method === "POST" ? req.clone() : null;
  try {
    return await fn(req);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    console.error(e);
    // Falha inesperada (não é aviso de validação): vai para a Central de erros do workspace.
    if (status >= 500) await registrarErroServidor(e, req, copia).catch(() => null);
    return json({ error: e instanceof Error ? e.message : String(e) }, status);
  }
};

async function registrarErroServidor(e: unknown, req: Request, copia: Request | null) {
  const corpo = copia ? await copia.json().catch(() => ({})) : {};
  const ws = /^[0-9a-f-]{36}$/i.test(String(corpo?.workspace_id ?? "")) ? String(corpo.workspace_id) : null;
  const funcao = new URL(req.url).pathname.split("/").filter(Boolean).pop() ?? "funcao";
  const acao = String(corpo?.action ?? "").slice(0, 40), msg = e instanceof Error ? e.message : String(e);
  const assinatura = assinaturaErro(funcao, acao, msg).slice(0, 200), db = admin();
  let q = db.from("erros_sistema").select("id,ocorrencias").eq("assinatura", assinatura).is("resolvido_em", null);
  q = ws ? q.eq("workspace_id", ws) : q.is("workspace_id", null);
  const { data: ja } = await q.maybeSingle();
  if (ja) { await db.from("erros_sistema").update({ ocorrencias: ja.ocorrencias + 1, ultimo_em: new Date().toISOString() }).eq("id", ja.id); return; }
  await db.from("erros_sistema").insert({ workspace_id: ws, origem: "servidor", assinatura, mensagem: msg.slice(0, 1000), pilha: (e instanceof Error ? e.stack ?? "" : "").slice(0, 4000), pagina: acao || null, url: funcao, usuario: "servidor", usuarios: [] });
}

// ── Assinatura do parâmetro "state" do OAuth (evita que terceiros vinculem contas ao seu workspace)
const enc = new TextEncoder();
const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => atob(s.replace(/-/g, "+").replace(/_/g, "/"));

export async function hmacHex(key: string, message: string) {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function signState(payload: Record<string, unknown>) {
  const body = b64url(enc.encode(JSON.stringify({ ...payload, exp: Date.now() + 15 * 60_000 })));
  return `${body}.${await hmacHex(env("OAUTH_STATE_SECRET"), body)}`;
}

export async function readState(state: string) {
  const [body, sig] = state.split(".");
  if (!body || !sig || sig !== await hmacHex(env("OAUTH_STATE_SECRET"), body)) throw new HttpError(400, "state inválido");
  const data = JSON.parse(fromB64url(body));
  if (data.exp < Date.now()) throw new HttpError(400, "Autorização expirada. Tente conectar novamente.");
  return data as { ws: string; provider: string; ret: string };
}

export const callbackUrl = () => `${env("SUPABASE_URL")}/functions/v1/oauth-callback`;

export const round = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const num = (v: unknown) => {
  if (typeof v === "number") return v;
  const s = String(v ?? "").trim();
  if (!s) return 0;
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : 0;
};
export const day = (v: unknown) => (v ? String(v).slice(0, 10) : null);
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchJson(url: string, init: RequestInit = {}, tries = 3): Promise<any> {
  for (let i = 0; ; i++) {
    const res = await fetch(url, init);
    if ((res.status === 429 || res.status >= 500) && i < tries - 1) { await sleep(1000 * (i + 1)); continue; }
    const text = await res.text();
    let body: any = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    if (!res.ok) {
      const msg = typeof body === "object" ? JSON.stringify(body).slice(0, 400) : String(body).slice(0, 400);
      throw new HttpError(502, `${new URL(url).host} respondeu ${res.status}: ${msg}`);
    }
    return body;
  }
}
