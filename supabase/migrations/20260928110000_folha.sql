-- Folha de pagamento (mesmo acesso da Jornada: só o criador do workspace, public.e_criador).
-- Contrato no cadastro da pessoa; tabelas (INSS, IRRF, encargos) editáveis; lançamentos variáveis do mês;
-- fechamento congela o holerite calculado e pode gerar as contas a pagar (salários, INSS, FGTS, IRRF).

alter table public.ponto_colaboradores
  add column if not exists vinculo text not null default 'clt' check (vinculo in ('clt','prolabore','estagio')),
  add column if not exists salario numeric(12,2) not null default 0,
  add column if not exists admissao date,
  add column if not exists demissao date,
  add column if not exists dependentes_ir int not null default 0 check (dependentes_ir between 0 and 20),
  add column if not exists vale_transporte numeric(12,2) not null default 0,     -- valor mensal do benefício (desconto de até 6%)
  add column if not exists politica_horas text not null default 'banco' check (politica_horas in ('banco','pagar')),
  add column if not exists pix text;

create table if not exists public.folha_parametros (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  dados jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists public.folha_lancamentos (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  colaborador_id uuid not null,
  competencia text not null check (competencia ~ '^\d{4}-\d{2}$'),
  tipo text not null check (tipo in ('provento','desconto')),
  descricao text not null,
  referencia text,
  valor numeric(12,2) not null check (valor >= 0),
  tributavel boolean not null default true,       -- entra na base de INSS, FGTS e IRRF
  criado_por text,
  created_at timestamptz not null default now(),
  primary key (workspace_id, id),
  foreign key (workspace_id, colaborador_id) references public.ponto_colaboradores(workspace_id, id) on delete cascade
);

create table if not exists public.folha_fechamentos (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  competencia text not null check (competencia ~ '^\d{4}-\d{2}$'),
  colaborador_id uuid not null,
  holerite jsonb not null,
  bruto numeric(12,2) not null,
  descontos numeric(12,2) not null,
  liquido numeric(12,2) not null,
  fgts numeric(12,2) not null default 0,
  encargos numeric(12,2) not null default 0,
  lancado_pagar boolean not null default false,
  fechado_em timestamptz not null default now(),
  fechado_por text,
  primary key (workspace_id, competencia, colaborador_id),
  foreign key (workspace_id, colaborador_id) references public.ponto_colaboradores(workspace_id, id) on delete cascade
);

do $$ declare t text; begin
  foreach t in array array['folha_parametros','folha_lancamentos','folha_fechamentos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists criador on public.%I', t);
    execute format('create policy criador on public.%I for all to authenticated using (public.e_criador(workspace_id)) with check (public.e_criador(workspace_id))', t);
  end loop;
end $$;

-- Contas a pagar geradas pelo fechamento da folha.
alter table public.payables drop constraint if exists payables_origem_check;
alter table public.payables add constraint payables_origem_check check (origem = any (array['nfe','manual','recorrente','extrato','dda','sefaz','folha']));
