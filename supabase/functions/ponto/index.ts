// Jarvis Ponto (pública, sem login do ERP): o colaborador registra o ponto pelo celular.
// Identificação: aparelho ativado com código de uso único (gerado pelo criador no portal); o app guarda só um token,
// e o banco guarda só o hash dele. A hora é SEMPRE a do servidor (America/Sao_Paulo); cada marcação recebe NSR e hash.
import { admin, cors, json } from "../_shared/common.ts";
import { acumulado, resumoMes, type Ajuste, type Colab, type Dia } from "../_shared/ponto_calc.ts";

const tentativas = new Map<string, { n: number; ate: number }>();
const sha = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))).map((b) => b.toString(16).padStart(2, "0")).join("");
const agoraSP = () => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { data: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}`, segundo: Number(p.second), iso: new Date().toISOString() };
};
const limpo = (s: unknown, max = 1000) => String(s ?? "").replace(/[<>]/g, "").trim().slice(0, max);
const erro = (msg: string, status = 400) => json({ error: msg }, status);

async function porToken(db: ReturnType<typeof admin>, token: unknown) {
  const t = String(token ?? "");
  if (t.length < 30) return null;
  const { data } = await db.from("ponto_dispositivos").select("workspace_id,id,colaborador_id,revogado").eq("token_hash", await sha(t)).maybeSingle();
  if (!data || data.revogado) return null;
  await db.from("ponto_dispositivos").update({ ultimo_uso: new Date().toISOString() }).eq("workspace_id", data.workspace_id).eq("id", data.id);
  return data as { workspace_id: string; id: string; colaborador_id: string };
}

async function estado(db: ReturnType<typeof admin>, ws: string, colab: string) {
  const agora = agoraSP(), mes = agora.data.slice(0, 7);
  const [{ data: c }, { data: w }, { data: dias }, { data: aj }, { data: sol }] = await Promise.all([
    db.from("ponto_colaboradores").select("nome,cargo,entrada,saida,intervalo_min,jornada_min,dias_semana,saldo_inicial,inicio,exigir_local,ativo").eq("workspace_id", ws).eq("id", colab).single(),
    db.from("workspaces").select("name").eq("id", ws).single(),
    db.from("ponto_dias").select("data,marcacoes,tipo,conferido,registros").eq("workspace_id", ws).eq("colaborador_id", colab).order("data"),
    db.from("ponto_ajustes").select("competencia,minutos").eq("workspace_id", ws).eq("colaborador_id", colab),
    db.from("ponto_solicitacoes").select("data,texto,status,resposta,created_at").eq("workspace_id", ws).eq("colaborador_id", colab).order("created_at", { ascending: false }).limit(5),
  ]);
  if (!c?.ativo) throw new Error("Cadastro inativo. Fale com o responsável.");
  const col: Colab = { jornada_min: c.jornada_min, dias_semana: c.dias_semana, saldo_inicial: c.saldo_inicial, inicio: c.inicio };
  const D = (dias ?? []) as (Dia & { registros: any[] })[], A = (aj ?? []) as Ajuste[];
  const hoje = D.find((d) => d.data === agora.data);
  return {
    nome: c.nome, cargo: c.cargo, empresa: w?.name ?? "", agora,
    jornada: { entrada: String(c.entrada).slice(0, 5), saida: String(c.saida).slice(0, 5), intervalo_min: c.intervalo_min, jornada_min: c.jornada_min, dias_semana: c.dias_semana },
    exigirLocal: c.exigir_local,
    hoje: hoje ? { marcacoes: hoje.marcacoes, tipo: hoje.tipo, conferido: hoje.conferido, registros: (hoje.registros ?? []).map((r: any) => ({ i: r.i, hora: r.hora, nsr: r.nsr, hash: String(r.hash ?? "").slice(0, 12), local: r.lat != null })) }
      : { marcacoes: ["", "", "", "", "", ""], tipo: "trabalho", conferido: false, registros: [] },
    mes: { competencia: mes, dias: D.filter((d) => d.data.startsWith(mes)).map((d) => ({ data: d.data, marcacoes: d.marcacoes, tipo: d.tipo, conferido: d.conferido })), resumo: resumoMes(col, D, A, mes, agora.data) },
    banco: acumulado(col, D, A, mes, agora.data),
    solicitacoes: sol ?? [],
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "?";
  try {
    const body = await req.json().catch(() => ({}));
    const db = admin();
    if (body.acao === "ativar") {
      const t = tentativas.get(ip);
      if (t && t.ate > Date.now() && t.n >= 10) return erro("Muitas tentativas. Aguarde alguns minutos.", 429);
      const codigo = limpo(body.codigo, 20).toUpperCase().replace(/[^A-Z0-9]/g, "");
      const { data: d } = codigo.length >= 8 ? await db.from("ponto_dispositivos").select("workspace_id,id,colaborador_id,codigo_expira,token_hash,revogado").eq("codigo_hash", await sha(codigo)).maybeSingle() : { data: null };
      if (!d || d.revogado || !d.codigo_expira || new Date(d.codigo_expira) < new Date()) {
        const x = t && t.ate > Date.now() ? t : { n: 0, ate: Date.now() + 15 * 60_000 }; x.n++; tentativas.set(ip, x);
        return erro("Código inválido ou vencido. Peça um novo link ao responsável.", 404);
      }
      const bytes = crypto.getRandomValues(new Uint8Array(32)), token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      // O mesmo link pode ativar de novo até vencer (no iPhone, o app da tela de início não enxerga o que o Safari guardou);
      // cada ativação troca a credencial, então só o último aparelho ativado continua registrando.
      await db.from("ponto_dispositivos").update({ token_hash: await sha(token), ativado_em: new Date().toISOString(), aparelho: limpo(body.aparelho, 160) })
        .eq("workspace_id", d.workspace_id).eq("id", d.id);
      await db.from("ponto_auditoria").insert({ workspace_id: d.workspace_id, colaborador_id: d.colaborador_id, acao: "Aparelho ativado", depois: { aparelho: limpo(body.aparelho, 160) }, por: "Jarvis Ponto" });
      return json({ token, ...(await estado(db, d.workspace_id, d.colaborador_id)) });
    }
    const disp = await porToken(db, body.token);
    if (!disp) return erro("Este aparelho não está ativado ou o acesso foi revogado. Peça um novo link ao responsável.", 401);
    const ws = disp.workspace_id, colab = disp.colaborador_id;
    if (body.acao === "estado") return json(await estado(db, ws, colab));
    if (body.acao === "marcar") {
      const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
      const { data, error } = await db.rpc("ponto_marcar", { ws, colab, aparelho: limpo(body.aparelho, 160), lat: num(body.lat), lng: num(body.lng), precisao: num(body.precisao) });
      if (error) return erro(error.message || "Não foi possível registrar agora.", 409);
      return json({ comprovante: data, ...(await estado(db, ws, colab)) });
    }
    if (body.acao === "solicitar") {
      const texto = limpo(body.texto, 1000), data = /^\d{4}-\d{2}-\d{2}$/.test(String(body.data)) ? String(body.data) : null;
      if (texto.length < 8) return erro("Conte o dia, o horário certo e o motivo (mínimo 8 caracteres).");
      const { error } = await db.from("ponto_solicitacoes").insert({ workspace_id: ws, colaborador_id: colab, data, texto });
      if (error) throw error;
      return json({ ok: true, ...(await estado(db, ws, colab)) });
    }
    return erro("Ação inválida.");
  } catch (e) {
    console.error("ponto", e);
    return erro(e instanceof Error && /inativo/.test(e.message) ? e.message : "Não foi possível concluir agora. Tente de novo em instantes.", 500);
  }
});
