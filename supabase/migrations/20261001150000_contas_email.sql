-- Contas a pagar por e-mail: cada empresa tem um endereço (boletos-<token>@<domínio de recebimento>). O boleto que chega
-- (anexo PDF ou no corpo do e-mail) vira título em ABERTO aguardando aprovação — nada é pago sem o clique de alguém.

alter table public.payables drop constraint if exists payables_origem_check;
alter table public.payables add constraint payables_origem_check check (origem in ('nfe','manual','recorrente','extrato','dda','sefaz','folha','gnre','email'));

create table if not exists public.caixas_email (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  token text not null unique check (token ~ '^[a-z0-9]{8,}$'),
  ativo boolean not null default true,
  qualquer_remetente boolean not null default false,  -- falso: só os remetentes da lista (a equipe que encaminha)
  remetentes text[] not null default '{}',
  criado_em timestamptz not null default now()
);
alter table public.caixas_email enable row level security;
drop policy if exists ler_caixas_email on public.caixas_email;
drop policy if exists gravar_caixas_email on public.caixas_email;
create policy ler_caixas_email on public.caixas_email for select using (workspace_id = any ((select public.ws_pode('financeiro', false))::uuid[]));
create policy gravar_caixas_email on public.caixas_email for update using (workspace_id = any ((select public.ws_pode('financeiro', true))::uuid[])) with check (workspace_id = any ((select public.ws_pode('financeiro', true))::uuid[]));

create table if not exists public.contas_email_log (
  id bigserial primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  recebido_em timestamptz not null default now(),
  de text,
  assunto text,
  criados int not null default 0,
  resultado jsonb   -- [{linha, valor, vencimento, titulo | motivo}]
);
create index if not exists contas_email_log_ws on public.contas_email_log (workspace_id, recebido_em desc);
alter table public.contas_email_log enable row level security;
drop policy if exists ler_contas_email_log on public.contas_email_log;
create policy ler_contas_email_log on public.contas_email_log for select using (workspace_id = any ((select public.ws_pode('financeiro', false))::uuid[]));
