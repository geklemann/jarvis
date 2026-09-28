-- Experiência do cliente: avaliações (NPS do comprador, CSAT do atendimento e NPS interno do sistema).
-- Comprador responde pela Central do Cliente (função pública "portal"); equipe responde dentro do Jarvis.
create table if not exists public.cx_pesquisas (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  tipo text not null check (tipo in ('nps','csat','sistema')),
  nota int not null check (nota between 0 and 10),
  comentario text,
  pedido text, canal text, produto text,
  origem text not null default 'portal',
  user_id uuid,
  created_at timestamptz not null default now(),
  primary key (workspace_id, id)
);
alter table public.cx_pesquisas enable row level security;
drop policy if exists cx_ler on public.cx_pesquisas;
drop policy if exists cx_sistema on public.cx_pesquisas;
create policy cx_ler on public.cx_pesquisas for select using (workspace_id = any ((select public.meus_ws())::uuid[]));
-- A equipe grava só a própria avaliação do sistema; as do comprador entram pelo servidor.
create policy cx_sistema on public.cx_pesquisas for insert with check (tipo = 'sistema' and user_id = (select auth.uid()) and workspace_id = any ((select public.meus_ws())::uuid[]));
