-- Código do produto na nota do FORNECEDOR → SKU da loja. Aprende sozinho comparando a mesma nota lida da SEFAZ e
-- do ERP de origem (enquanto os dois existem) e pode ser ajustado à mão. Usado para as notas de entrada da SEFAZ.
create table if not exists public.sku_fornecedor (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  fornecedor_doc text not null,
  codigo text not null,
  sku text not null,
  origem text not null default 'aprendido' check (origem in ('aprendido', 'manual')),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, fornecedor_doc, codigo)
);
alter table public.sku_fornecedor enable row level security;
drop policy if exists ler_sku_fornecedor on public.sku_fornecedor;
drop policy if exists gravar_sku_fornecedor on public.sku_fornecedor;
create policy ler_sku_fornecedor on public.sku_fornecedor for select using (workspace_id = any ((select public.ws_pode('estoque', false))::uuid[]));
create policy gravar_sku_fornecedor on public.sku_fornecedor for all using (workspace_id = any ((select public.ws_pode('estoque', true))::uuid[])) with check (workspace_id = any ((select public.ws_pode('estoque', true))::uuid[]));
