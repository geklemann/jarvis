-- Conferência de expedição por bipagem: cada pedido conferido item a item (código de barras) antes de embalar.
-- Guarda o que era esperado, o que foi lido, quem conferiu e quanto tempo levou.
create table if not exists public.expedicao_conferencias (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  pedido text not null,
  plataforma text,
  status text not null check (status in ('ok','divergente')),
  itens jsonb not null default '[]'::jsonb,      -- [{sku, nome, esperado, lido}]
  extras jsonb not null default '[]'::jsonb,     -- códigos lidos que não eram do pedido
  observacao text,
  conferido_por text,
  inicio timestamptz,
  fim timestamptz not null default now(),
  primary key (workspace_id, pedido)
);
create index if not exists expedicao_conferencias_fim on public.expedicao_conferencias (workspace_id, fim);
alter table public.expedicao_conferencias enable row level security;
drop policy if exists ler_expedicao_conferencias on public.expedicao_conferencias;
drop policy if exists gravar_expedicao_conferencias on public.expedicao_conferencias;
create policy ler_expedicao_conferencias on public.expedicao_conferencias for select using (workspace_id = any((select public.ws_pode('estoque', false))::uuid[]));
create policy gravar_expedicao_conferencias on public.expedicao_conferencias for all using (workspace_id = any((select public.ws_pode('estoque', true))::uuid[])) with check (workspace_id = any((select public.ws_pode('estoque', true))::uuid[]));
drop trigger if exists auditar on public.expedicao_conferencias;
create trigger auditar after insert or update or delete on public.expedicao_conferencias for each row execute function public.auditar();
