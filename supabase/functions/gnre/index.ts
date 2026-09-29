// GNRE (guia do DIFAL/FCP) pelo webservice oficial do Portal GNRE, autenticado com o certificado e-CNPJ (A1) da empresa.
// O certificado e a senha ficam SÓ nos segredos do servidor (GNRE_CERT_PFX em base64 e GNRE_CERT_SENHA), gravados
// pelo próprio dono com ops/gravar-segredo.ps1 — nunca no código, no banco ou no navegador.
import { authorize, cors, json, HttpError } from "../_shared/common.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    // Diagnóstico: só verdadeiro/falso (sem dados), para conferir se o servidor está pronto para a GNRE.
    if (body.action === "diagnostico") {
      const temCert = !!Deno.env.get("GNRE_CERT_PFX"), temSenha = !!Deno.env.get("GNRE_CERT_SENHA");
      const mtls = typeof (Deno as any).createHttpClient === "function";
      return json({ certificado: temCert && temSenha, cliente_tls: mtls, ambiente: Deno.env.get("GNRE_AMBIENTE") || "homologacao" });
    }
    const ws = String(body.workspace_id ?? "");
    await authorize(req, ws);
    throw new HttpError(400, "Ação inválida.");
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return json({ error: e instanceof Error ? e.message : String(e) }, status);
  }
});
