-- Cadastro de empresa sem intervenção técnica e assinatura do Jarvis.
-- criar_empresa: quem se cadastra e ainda não participa de nenhuma empresa cria a sua, vira dono e começa o teste
-- grátis de 7 dias (o diagnóstico gratuito). O pedido de acesso pendente a outra empresa, se houver, é encerrado.
-- assinaturas: plano, faixa, módulos, ciclo e situação (interno, teste, ativa, atrasada, cancelada). Só o servidor grava
-- (cobrança pelo Asaas, via função "cobranca"); os membros leem. As empresas que já existem ficam como "interno".
create table if not exists public.assinaturas (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  status text not null default 'teste' check (status in ('interno', 'teste', 'ativa', 'atrasada', 'cancelada')),
  plano text check (plano in ('base', 'pacote')),
  faixa int,                       -- pedidos por mês: 1000, 4000 ou 10000
  modulos text[] not null default '{}',
  ciclo text not null default 'mensal' check (ciclo in ('mensal', 'anual')),
  valor_mensal numeric(12, 2),
  teste_ate date,
  provedor text,                   -- asaas
  provedor_cliente text,
  provedor_assinatura text,
  link_pagamento text,
  atualizado_em timestamptz not null default now(),
  criado_em timestamptz not null default now()
);
alter table public.assinaturas enable row level security;
drop policy if exists assinaturas_ler on public.assinaturas;
create policy assinaturas_ler on public.assinaturas for select using (public.is_member(workspace_id));

insert into public.assinaturas (workspace_id, status)
select id, 'interno' from public.workspaces on conflict (workspace_id) do nothing;

create or replace function public.criar_empresa(nome text) returns uuid
language plpgsql security definer set search_path = public, auth as $$
declare ws uuid; quem text; n text := btrim(coalesce(nome, ''));
begin
  if auth.uid() is null then raise exception 'Faça login para continuar.'; end if;
  if exists (select 1 from public.workspace_members where user_id = auth.uid()) then
    raise exception 'Você já participa de uma empresa no Jarvis.';
  end if;
  if length(n) < 2 or length(n) > 120 then raise exception 'Informe o nome da empresa (2 a 120 caracteres).'; end if;
  select coalesce(email, auth.uid()::text) into quem from auth.users where id = auth.uid();
  insert into public.workspaces (name, criador, recebe_solicitacoes) values (n, auth.uid(), false) returning id into ws;
  insert into public.workspace_members (workspace_id, user_id, role) values (ws, auth.uid(), 'owner');
  insert into public.assinaturas (workspace_id, status, teste_ate) values (ws, 'teste', current_date + 7);
  update public.access_requests set status = 'recusado', decided_at = now(), decided_by = 'o próprio usuário (criou a própria empresa)'
   where user_id = auth.uid() and status = 'pendente';
  insert into public.audit_log (workspace_id, id, action, detail, actor)
  values (ws, gen_random_uuid()::text, 'Empresa criada', 'Cadastro pelo próprio usuário; teste grátis de 7 dias.', quem);
  return ws;
end $$;
revoke all on function public.criar_empresa(text) from public;
grant execute on function public.criar_empresa(text) to authenticated;
