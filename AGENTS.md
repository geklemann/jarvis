# Jarvis (antigo CONCIL-IA) — regras para quem altera o código (humanos e IAs)

## Produto
Ferramenta de conciliação financeira de e-commerce: Bling (ERP, origem fiscal) × Mercado Livre/Mercado Pago, Shopee e Magalu. Público: financeiro de uma operação brasileira. Toda a interface é em português do Brasil.

## Regras de negócio que não podem quebrar
1. **Confirmação humana para tudo que é financeiro**, com uma exceção autorizada pelo dono em 25/09/2026: a *conciliação automática* (`workspaces.auto_link`, função `auto_link_exatos`) vincula sozinha apenas liberação positiva que bate ao centavo com o repasse previsto do mesmo pedido, em competência aberta, e registra na auditoria. Qualquer outro vínculo, desvínculo, fechamento ou reabertura continua exigindo clique do usuário. A IA e as integrações apenas trazem dados e *propõem*.
2. **Líquido esperado = bruto − taxa.** Status: Conciliado (vinculado = líquido ± R$ 0,01), Divergência, A receber, Em trânsito.
3. **Competência = mês da emissão da NF.** Competência fechada bloqueia alterações em pedidos e liberações dela.
4. **Sincronização nunca sobrescreve trabalho humano**: `note`, `transit`, `linked_order` e fechamentos (ver `supabase/functions/_shared/store.ts`).
5. **Bling é a origem fiscal** (bruto, data, NF). Marketplace informa taxa, previsão, comprador e repasses.
6. Nada de dados fictícios na base publicada.

## Estrutura
- `web/` — site estático sem build. Ordem dos scripts em `index.html` importa: `app.js` (núcleo) → `importer.js` → `features.js` → `assistant.js` → `cloud.js`. Os arquivos posteriores estendem os anteriores reatribuindo funções globais (`render`, `navigate`, `save`, `central`, `aiView`, `subtitle`). Arquivos novos ficam dentro de uma IIFE para não colidir com as constantes globais de `app.js`.
- `supabase/migrations/` — esquema com RLS por workspace. Mudança de esquema = nova migração, nunca editar uma já aplicada.
- `supabase/functions/` — Deno/TypeScript. Conectores em `_shared/<plataforma>.ts`, sempre tolerantes a campos ausentes.
- As ferramentas da IA existem em dois lugares que precisam coincidir: `supabase/functions/ai-assistant/prompt.ts` (definição) e `web/assistant.js` (execução).

## Segurança
- Nunca colocar tokens, senhas ou chaves no código. Segredos vão em GitHub Secrets → enviados ao Supabase pelo workflow.
- `integration_secrets` não tem política RLS: só a service role lê.
- Todo texto vindo de dados importados é exibido com `esc()`.

## Visual
Tema escuro e claro com as variáveis de `:root` e `body.light` em `web/style.css`. Reutilize as classes existentes (`card`, `metric`, `notice`, `badge ok|warn|bad|info|purple`, `tablebox`, `listline`, `hbars`). Teste em 375 px de largura.

## Verificar antes de publicar
```sh
npm run check                                   # sintaxe do site
npm test                                        # testes (testes/*.test.mjs) com o código real das telas
cd supabase/functions && deno check */index.ts  # tipos das funções
```
E no navegador (`npm start`): temas, navegação, importação com mapeamento, conciliação em lote, fechamento/reabertura e o painel da IA.

## Testes
- `testes/ambiente.mjs` carrega os scripts de `web/` na ordem do `index.html` num contexto isolado do Node, com um
  navegador simulado: os testes chamam as funções de verdade (`status`, `Folha.calcular`, `Margem.partes`,
  `Contab.diario`, `Sugestoes.sugerir`, `Exportar.celula`…), sem copiar fórmulas. Funções do servidor sem dependência
  externa (`_shared/ponto_calc.ts`, `semana.ts`, `precos_jarvis.ts`, `canais.ts`) são importadas direto do `.ts` (Node 24).
- Regra nova de negócio = teste novo com o valor conferido à mão. `JARVIS_WEB=_site npm test` testa a versão compactada.
- O GitHub roda sintaxe, testes e `deno check` a cada envio (`.github/workflows/ci.yml`).

## Publicação do site
`sh ops/publicar-site.sh` (com tudo commitado): roda os testes, carimba a versão nos `?v=` do `index.html`, monta
`_site/` (cópia de `web/` com `.js`/`.css` compactados pelo esbuild — arquivos separados, mesma ordem), testa de novo e
publica só o retrato atual em `gh-pages` (segundos). O `sw.js` guarda no aparelho os arquivos com `?v=` (nunca mudam);
página, dados e outros servidores sempre vêm da rede. Script novo no `index.html` precisa de `?v=1` para ser carimbado.

## Banco: migrações
O histórico remoto está em dia com `supabase/migrations/` (conferido em 01/10/2026 com `supabase migration list --linked`).
Antes de um `supabase db push`, confira que nenhuma migração antiga aparece como pendente; se aparecer e já estiver
aplicada, registre com `supabase migration repair --status applied <versão>` em vez de rodar de novo.
