-- Notas de devolução e de estorno preparadas pelo Jarvis a partir da NF-e de venda original (XML do Bling ou nota
-- do Jarvis). Rascunho não vai à SEFAZ; a emissão é feita pela função integrations (Focus NFe), que também grava a
-- nota em notas_fiscais e, autorizada em produção, lança a entrada no kardex. O navegador só lê e descarta rascunhos.
create table if not exists public.nfe_devolucoes (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id text not null,
  pedido text not null,
  tipo text not null check (tipo in ('devolucao','estorno')),
  motivo text,
  itens jsonb not null default '[]'::jsonb,     -- [{sku, nome, qtd, valor, icms}]
  total numeric(14,2),
  origem jsonb,                                 -- nota original {fonte, chave, numero, serie, emissao, cliente, doc, uf, itens}
  modelo jsonb,                                 -- regras copiadas da última devolução emitida no Bling
  payload jsonb,
  status text not null default 'rascunho' check (status in ('rascunho','emitida','autorizada','erro','descartada')),
  ambiente text, nfe_ref text, mensagem text,
  estoque_lancado boolean not null default false,
  criado_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, id)
);
create index if not exists nfe_devolucoes_pedido on public.nfe_devolucoes (workspace_id, pedido);
alter table public.nfe_devolucoes enable row level security;
drop policy if exists ler_nfe_devolucoes on public.nfe_devolucoes;
drop policy if exists descartar_nfe_devolucoes on public.nfe_devolucoes;
create policy ler_nfe_devolucoes on public.nfe_devolucoes for select
  using (workspace_id = any((select public.ws_pode('vendas', false))::uuid[]) or workspace_id = any((select public.ws_pode('financeiro', false))::uuid[]));
create policy descartar_nfe_devolucoes on public.nfe_devolucoes for update
  using (workspace_id = any((select public.ws_pode('vendas', true))::uuid[]) and status in ('rascunho','erro'))
  with check (workspace_id = any((select public.ws_pode('vendas', true))::uuid[]) and status = 'descartada');
drop trigger if exists auditar on public.nfe_devolucoes;
create trigger auditar after insert or update on public.nfe_devolucoes for each row execute function public.auditar();
