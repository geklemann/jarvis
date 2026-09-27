-- Suporte: chamados abertos pela equipe dentro do portal, que chegam para o dono do workspace.
-- Quem abre vê e acompanha os próprios chamados; o dono vê todos, responde e muda a situação.
create table if not exists public.chamados (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id text not null,
  numero bigint generated always as identity,
  criado_por uuid not null default auth.uid(),
  email text, nome text,
  tipo text not null default 'duvida' check (tipo in ('duvida','erro','sugestao','acesso','outro')),
  urgencia text not null default 'normal' check (urgencia in ('baixa','normal','alta','parado')),
  titulo text not null,
  descricao text not null,
  tela text,
  status text not null default 'aberto' check (status in ('aberto','andamento','aguardando','resolvido')),
  respostas jsonb not null default '[]'::jsonb,   -- [{de, nome, texto, em}]
  lido_dono boolean not null default false,
  lido_autor boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, id)
);
alter table public.chamados enable row level security;
drop policy if exists chamados_ler on public.chamados;
drop policy if exists chamados_abrir on public.chamados;
drop policy if exists chamados_alterar on public.chamados;
create policy chamados_ler on public.chamados for select
  using (workspace_id = any ((select public.meus_ws())::uuid[]) and (criado_por = (select auth.uid()) or public.papel(workspace_id) = 'owner'));
create policy chamados_abrir on public.chamados for insert
  with check (workspace_id = any ((select public.meus_ws())::uuid[]) and criado_por = (select auth.uid()));
create policy chamados_alterar on public.chamados for update
  using (workspace_id = any ((select public.meus_ws())::uuid[]) and (criado_por = (select auth.uid()) or public.papel(workspace_id) = 'owner'))
  with check (workspace_id = any ((select public.meus_ws())::uuid[]));
drop trigger if exists auditar on public.chamados;
create trigger auditar after insert or update or delete on public.chamados for each row execute function public.auditar();

-- Documentos internos (manual com telas reais): bucket PRIVADO, leitura só para quem é membro de algum workspace.
insert into storage.buckets (id, name, public, file_size_limit)
values ('documentos', 'documentos', false, 20971520)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;
drop policy if exists documentos_ler on storage.objects;
create policy documentos_ler on storage.objects for select
  using (bucket_id = 'documentos' and cardinality((select public.meus_ws())::uuid[]) > 0);
