# Integrações com as plataformas

O Jarvis acessa as plataformas **pelas APIs oficiais, com autorização OAuth** — o mesmo modelo que ERPs e hubs usam. Não guardamos nem usamos a senha das suas contas: você clica em **Conectar**, entra na própria plataforma e autoriza o acesso. O que fica salvo é um token revogável, em tabela inacessível pelo navegador.

Cada plataforma exige cadastrar um **aplicativo de desenvolvedor** (uma vez). Em todas, a URL de retorno (redirect/callback) é:

```
https://<REF>.supabase.co/functions/v1/oauth-callback
```

Depois de cadastrar os segredos no GitHub, rode **Actions › Publicar banco e funções (Supabase)** para enviá-los ao servidor. Em seguida: **Integrações › Conectar**.

## Ordem recomendada de sincronização

1. **Bling** primeiro: é a origem fiscal (pedido, NF, valor bruto, itens, cliente, UF, contas a receber e a pagar).
2. **Marketplaces** depois: completam taxa real, frete do vendedor, previsão de liberação e trazem os **repasses** (liberações) que serão conciliados.

O botão **Sincronizar tudo** já segue essa ordem. Vínculos, anotações, "em trânsito" e fechamentos feitos na ferramenta nunca são sobrescritos pela sincronização.

## Bling (API v3)

1. https://developer.bling.com.br → **Área do integrador › Cadastrar aplicativo** (tipo *privado/uso próprio*).
2. **Link de redirecionamento**: a URL de retorno acima.
3. Escopos: *Pedidos de venda* (leitura), *Notas fiscais* (leitura), *Contatos* (leitura), *Contas a receber* e *Contas a pagar* (leitura), *Produtos* (leitura).
4. Secrets no GitHub: `BLING_CLIENT_ID`, `BLING_CLIENT_SECRET`.

**Lojas → marketplace.** O pedido do Bling informa a loja de origem. Na primeira sincronização, lojas sem canal identificado aparecem em **Integrações › Bling** para você escolher Mercado Livre, Shopee, Magalu ou Ignorar. O número do pedido na loja (`numeroLoja`) vira o identificador do pedido, para casar com os repasses.

## Mercado Livre + Mercado Pago

1. https://developers.mercadolivre.com.br → **Minhas aplicações › Criar aplicação**.
2. **Redirect URI**: a URL de retorno acima. Escopos: *read* e *offline_access*; tópicos não são necessários.
3. Secrets: `ML_CLIENT_ID` (App ID), `ML_CLIENT_SECRET` (Secret Key).

Traz pedidos, tarifa de venda, custo de frete do vendedor, comprador e UF, e as liberações do Mercado Pago (pagamentos com `money_release_status = released`), já identificadas pelo pedido.

## Shopee (Open Platform v2)

1. https://open.shopee.com → cadastro como **Seller In-house** (aprovação da Shopee pode levar alguns dias).
2. Crie o app, copie **Partner ID** e **Partner Key** (produção) e cadastre a URL de retorno acima como *Redirect URL Domain*.
3. Secrets: `SHOPEE_PARTNER_ID`, `SHOPEE_PARTNER_KEY`.

Traz pedidos, valor líquido previsto por pedido (escrow), comprador, UF e os repasses liberados (escrow list).

## Magalu

1. https://developers.magalu.com → **Criar aplicação** (seller, uso próprio).
2. Redirect URI: a URL de retorno acima. Escopos: `open:order-order-seller:read`, `open:order-delivery-seller:read`, `open:order-invoice-seller:read`.
3. Secrets: `MAGALU_CLIENT_ID`, `MAGALU_CLIENT_SECRET`.

Traz pedidos, comissão, frete, cliente e UF. **Repasses** ainda entram por importação do extrato (Importar relatórios › Liberações). A leitura dos pedidos é tolerante a variações de layout; depois da primeira sincronização, confira **Ver amostra** e, se algum campo vier vazio, peça o ajuste do mapeamento em `supabase/functions/_shared/magalu.ts`.

## Validação na primeira sincronização

Os conectores seguem a documentação pública de cada API, mas nomes de campos mudam com o tempo e variam por conta. Na primeira sincronização de cada plataforma:

1. Sincronize **um mês** e compare três pedidos com o painel da plataforma (bruto, taxa, líquido, data do repasse).
2. Use **Ver amostra** para conferir o registro bruto recebido.
3. Se algo divergir, o ajuste fica concentrado no arquivo do conector (`supabase/functions/_shared/<plataforma>.ts`).
