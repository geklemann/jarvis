# Jarvis · Compra Store

Portal da **Compra Store** (antigo CONCIL-IA / EcomBalance). Conciliação financeira de e-commerce entre o **Bling** (ERP, origem fiscal) e os marketplaces **Mercado Livre / Mercado Pago**, **Shopee** e **Magalu**, com assistente de IA (Claude), ranking de produtos, vendas por estado, CRM e entradas e saídas do ERP.

**Site:** https://jaarvis.com.br/ (antes ecombalance.com.br)

## O que ele faz

| Área | O que entrega |
|---|---|
| Visão geral | Bruto, taxas, líquido, recebido, a receber, em trânsito, divergências e conciliado da competência; inteligência comercial resumida |
| Central de Conciliação | Motor de correspondência (pedido idêntico, valor, data), **conciliação em lote das correspondências exatas**, vínculo/desvínculo com auditoria |
| Integrações | Conexão OAuth oficial com Bling, Mercado Livre, Shopee e Magalu; sincronização por período; mapeamento de lojas do Bling |
| Assistente de IA | Claude lê os dados por ferramentas, investiga divergências, **propõe vínculos** (você confirma), analisa produtos, estados, clientes e contas |
| Entradas e saídas | Contas a receber e a pagar do Bling × repasses dos marketplaces |
| Produtos | Ranking por receita/quantidade, curva ABC, participação por canal |
| Estados | Mapa do Brasil por receita, ticket médio por UF |
| Clientes · CRM | Segmentos (VIP, Recorrente, Novo, Em risco, Inativo), estágios, etiquetas, contatos, follow-ups e listas para campanhas |
| Importação | CSV, TSV, TXT, XLSX, XLS, ODS e PDF com texto, com mapeamento de colunas (inclui cliente, UF e produto opcionais) |
| Contabilidade e Resultado | Razão e balancete do escritório (planilha ou PDF), PDFs anexados por competência, contas → DRE gerencial, confronto contabilidade × operação |
| Preços e Simulador | Tabela de preços e custos, regras por canal, margem/mínimo/sugerido por produto, simulador com cascata, sensibilidade, projeção e cenários |
| Fechamento, relatórios, auditoria | Fechamento mensal com ressalvas, retrato exportável, CSV para a contabilidade, trilha de auditoria |

Princípio mantido desde a versão original: **nada financeiro é gravado sem confirmação humana.** Integrações e IA trazem e sugerem; você confirma.

## Arquitetura

```
GitHub Pages (web/)  ──►  Supabase
  HTML/CSS/JS puro          ├─ Auth (e-mail e senha / link mágico)
  sem build                 ├─ Postgres com RLS por workspace (supabase/migrations)
                            └─ Edge Functions (supabase/functions)
                                 ├─ integrations    conectar / sincronizar / desconectar
                                 ├─ oauth-callback  retorno do OAuth das plataformas
                                 └─ ai-assistant    chamada ao Claude (ferramentas rodam no navegador)
```

- **Modo local**: sem `config.js` preenchido, tudo roda no navegador (localStorage), como na versão original.
- **Modo nuvem**: com Supabase configurado, login, dados sincronizados entre computadores, integrações e IA.
- Tokens das plataformas ficam em `integration_secrets`, tabela sem acesso pelo navegador.

## Colocar no ar

Siga **[docs/CONFIGURAR.md](docs/CONFIGURAR.md)** (≈15 min) e depois **[docs/INTEGRACOES.md](docs/INTEGRACOES.md)** para cada plataforma.
O site é publicado na branch `gh-pages` com `sh ops/publicar-site.sh`. Banco, segredos e funções são publicados pelo workflow `.github/workflows/supabase.yml` a cada push em `supabase/`.

## Rodar no computador

```sh
npm start          # http://127.0.0.1:3000
npm run check      # sintaxe dos scripts
```

## Arquivos

| Caminho | Responsabilidade |
|---|---|
| `web/app.js` | Núcleo original: dashboard, conciliação, fechamento, relatórios, auditoria |
| `web/importer.js` | Importação multiformato e mapeamento de colunas |
| `web/features.js` | Integrações, entradas e saídas, produtos, estados, CRM, conciliação em lote, navegação por `#pagina` |
| `web/assistant.js` | Painel do assistente e execução das ferramentas da IA |
| `web/gestao.js` | Contabilidade e Resultado (razão, balancete, documentos, DRE gerencial) e Preços e Simulador |
| `web/tableimport.js` | Importador genérico com mapeamento de colunas (planilhas, CSV, PDF) |
| `web/cloud.js` | Login, carga do workspace e gravação incremental no Supabase |
| `web/config.js` | URL e chave pública do Supabase (vazio = modo local) |
| `supabase/migrations/` | Esquema, RLS e funções SQL |
| `supabase/functions/_shared/` | Conectores Bling, Mercado Livre, Shopee, Magalu e gravação com mesclagem segura |
| `supabase/functions/ai-assistant/prompt.ts` | Prompt e ferramentas do assistente (espelhados em `web/assistant.js`) |
| `ops/publicar-site.sh` | Publica `web/` na branch `gh-pages` (GitHub Pages) |
| `.github/workflows/` | Publicação do Supabase e verificação automática |

Regras para quem (humano ou IA) for alterar o código: **[AGENTS.md](AGENTS.md)**.
