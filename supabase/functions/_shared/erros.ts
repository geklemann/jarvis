// Central de erros (servidor): assinatura que agrupa repetições do mesmo erro — mensagem sem números longos (ids,
// valores) + função e ação. Sem dependências, testada pelo Node (testes/precos.test.mjs).
export const assinaturaErro = (funcao: string, acao: string, msg: string) =>
  `${String(msg).replace(/\d{3,}/g, "#").replace(/\s+/g, " ").trim().slice(0, 140)} @ ${funcao}${acao ? ":" + acao : ""}`;
