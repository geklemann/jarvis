-- Contas a pagar: aprovação em duas etapas, linha digitável e novas origens (DDA e SEFAZ).
alter table public.payables add column if not exists aprovacao text check (aprovacao in ('pendente','aprovado','recusado'));
alter table public.payables add column if not exists lancado_por text;
alter table public.payables add column if not exists linha_digitavel text;
alter table public.payables drop constraint if exists payables_origem_check;
alter table public.payables add constraint payables_origem_check check (origem = any (array['nfe','manual','recorrente','extrato','dda','sefaz']));

-- Alertas no celular (Web Push): uma inscrição por aparelho de cada pessoa. Cada um vê e apaga só as suas.
create table if not exists public.push_subs (
  endpoint text primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  email text,
  chaves jsonb not null,
  aparelho text,
  created_at timestamptz not null default now()
);
alter table public.push_subs enable row level security;
drop policy if exists push_ler on public.push_subs;
drop policy if exists push_criar on public.push_subs;
drop policy if exists push_apagar on public.push_subs;
create policy push_ler on public.push_subs for select using (user_id = (select auth.uid()));
create policy push_criar on public.push_subs for insert with check (user_id = (select auth.uid()) and workspace_id = any ((select public.meus_ws())::uuid[]));
create policy push_apagar on public.push_subs for delete using (user_id = (select auth.uid()));
