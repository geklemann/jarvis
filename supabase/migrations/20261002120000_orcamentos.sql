-- Orçamento empresarial: versões (Orçamento 2027 V1, V2, Forecast…) com premissas, receitas por canal, despesas por
-- categoria (com responsável), pessoal, investimentos e comentários de desvio, num documento por versão (dados).
-- Status: rascunho → em_revisao → aprovado (só o dono aprova; aprovada fica travada) → arquivado.
create table if not exists public.orcamentos (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id text not null,
  ano int not null check (ano between 2020 and 2100),
  nome text not null,
  tipo text not null default 'orcamento' check (tipo in ('orcamento', 'forecast', 'cenario')),
  status text not null default 'rascunho' check (status in ('rascunho', 'em_revisao', 'aprovado', 'arquivado')),
  dados jsonb not null default '{}'::jsonb,
  criado_por text,
  aprovado_por text,
  aprovado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, id)
);
create index if not exists orcamentos_ano on public.orcamentos (workspace_id, ano);
alter table public.orcamentos enable row level security;
drop policy if exists ler_orcamentos on public.orcamentos;
drop policy if exists gravar_orcamentos on public.orcamentos;
create policy ler_orcamentos on public.orcamentos for select using (workspace_id = any ((select public.meus_ws())::uuid[]));
create policy gravar_orcamentos on public.orcamentos for all
  using (workspace_id = any ((select public.ws_pode('financeiro', true))::uuid[]))
  with check (workspace_id = any ((select public.ws_pode('financeiro', true))::uuid[]));
drop trigger if exists auditar on public.orcamentos;
create trigger auditar after insert or update or delete on public.orcamentos for each row execute function public.auditar();
