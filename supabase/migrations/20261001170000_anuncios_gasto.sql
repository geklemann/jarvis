-- Gasto com anúncios pagos (Mercado Ads, Shopee Ads…) por anúncio e por dia, para descontar do lucro de cada produto.
-- Entra pela API do canal (servidor, quando o aplicativo tiver a permissão de publicidade) ou pela importação do
-- relatório do painel de anúncios (tela Anúncios pagos). periodo = 'dia' (um dia) ou 'mes' (total do mês, gravado no
-- dia 1). Uma nova leitura ou importação do mesmo anúncio e dia substitui a anterior.
create table if not exists public.anuncios_gasto (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  canal text not null,
  dia date not null,
  anuncio text not null,             -- código do anúncio no canal (MLB…, id do produto na Shopee) ou o SKU
  periodo text not null default 'dia' check (periodo in ('dia', 'mes')),
  sku text,
  titulo text,
  custo numeric(14,2) not null default 0,
  cliques int,
  impressoes int,
  vendas_valor numeric(14,2),        -- receita atribuída aos anúncios pelo canal
  vendas_qtd int,
  origem text not null default 'importado' check (origem in ('api', 'importado')),
  atualizado_por text,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, canal, dia, anuncio)
);
create index if not exists anuncios_gasto_dia on public.anuncios_gasto (workspace_id, dia);
alter table public.anuncios_gasto enable row level security;
drop policy if exists ler_anuncios_gasto on public.anuncios_gasto;
drop policy if exists gravar_anuncios_gasto on public.anuncios_gasto;
create policy ler_anuncios_gasto on public.anuncios_gasto for select using (workspace_id = any ((select public.meus_ws())::uuid[]));
create policy gravar_anuncios_gasto on public.anuncios_gasto for all
  using (workspace_id = any ((select public.ws_pode('financeiro', true))::uuid[]))
  with check (workspace_id = any ((select public.ws_pode('financeiro', true))::uuid[]));
