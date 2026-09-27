-- Documentos internos (manual com telas reais da empresa), guardados em partes no banco.
-- Leitura só para quem é membro de algum workspace; gravação só pelo servidor/CLI (sem política de escrita).
create table if not exists public.documentos (
  id text not null,
  parte int not null,
  conteudo text not null,
  atualizado timestamptz not null default now(),
  primary key (id, parte)
);
alter table public.documentos enable row level security;
drop policy if exists documentos_ler on public.documentos;
create policy documentos_ler on public.documentos for select
  using (cardinality((select public.meus_ws())::uuid[]) > 0);
