-- Pessoas: admissão (dados para o eSocial), férias, rescisões e eventos do eSocial prontos para transmitir.
-- Mesmo acesso da Folha: só o criador do workspace (public.e_criador). Dados pessoais sensíveis: nunca expostos fora do portal.
alter table public.ponto_colaboradores
  add column if not exists matricula text,
  add column if not exists cpf text,
  add column if not exists pis text,
  add column if not exists nascimento date,
  add column if not exists sexo text check (sexo in ('M','F')),
  add column if not exists estado_civil int,         -- tabela eSocial: 1 solteiro, 2 casado, 3 divorciado, 4 separado, 5 viúvo
  add column if not exists raca_cor int,             -- 1 branca, 2 preta, 3 parda, 4 amarela, 5 indígena, 6 não informado
  add column if not exists grau_instrucao text,      -- tabela eSocial 01..12
  add column if not exists nacionalidade text default 'Brasileira',
  add column if not exists rg text,
  add column if not exists endereco jsonb not null default '{}',
  add column if not exists telefone text,
  add column if not exists cbo text,
  add column if not exists departamento text,
  add column if not exists tipo_contrato text not null default 'indeterminado' check (tipo_contrato in ('indeterminado','experiencia','determinado')),
  add column if not exists experiencia_dias int,     -- ex.: 45 (+ prorrogação de 45) ou 90
  add column if not exists experiencia_prorrogacao int,
  add column if not exists horas_semanais numeric(5,2) not null default 44,
  add column if not exists banco jsonb not null default '{}',
  add column if not exists categoria_esocial int not null default 101,
  add column if not exists documentos jsonb not null default '{}';  -- checklist da admissão (ASO, contrato, termo de VT...)

create table if not exists public.folha_ferias (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  colaborador_id uuid not null,
  aquisitivo_ini date not null,
  aquisitivo_fim date not null,
  gozo_ini date not null,
  gozo_fim date not null,
  dias int not null check (dias between 5 and 30),
  abono_dias int not null default 0 check (abono_dias between 0 and 10),
  adiantar_13 boolean not null default false,
  calculo jsonb,
  status text not null default 'programada' check (status in ('programada','paga','cancelada')),
  pagamento_ate date,
  observacao text,
  created_at timestamptz not null default now(),
  primary key (workspace_id, id),
  foreign key (workspace_id, colaborador_id) references public.ponto_colaboradores(workspace_id, id) on delete cascade
);

create table if not exists public.folha_rescisoes (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  colaborador_id uuid not null,
  data_desligamento date not null,
  tipo text not null check (tipo in ('sem_justa_causa','justa_causa','pedido_demissao','acordo','termino_experiencia','antecipada_experiencia_empregador','termino_contrato')),
  aviso text not null default 'indenizado' check (aviso in ('trabalhado','indenizado','dispensado','nao_cumprido')),
  saldo_fgts numeric(12,2) not null default 0,
  calculo jsonb,
  status text not null default 'calculada' check (status in ('calculada','paga','cancelada')),
  pagamento_ate date,
  observacao text,
  created_at timestamptz not null default now(),
  primary key (workspace_id, id),
  foreign key (workspace_id, colaborador_id) references public.ponto_colaboradores(workspace_id, id) on delete cascade
);

create table if not exists public.esocial_eventos (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id text not null,                      -- ID do evento no padrão eSocial (ID + tpInsc + nrInsc + data/hora + sequencial)
  colaborador_id uuid,
  evento text not null,                  -- S-2200, S-2206, S-2299, S-2300, S-1200, S-1210, S-1299...
  referencia text,                       -- competência ou data do fato
  descricao text,
  xml text not null,
  status text not null default 'pronto' check (status in ('pronto','enviado','processado','erro','substituido')),
  recibo text,
  retorno jsonb,
  created_at timestamptz not null default now(),
  primary key (workspace_id, id)
);

do $$ declare t text; begin
  foreach t in array array['folha_ferias','folha_rescisoes','esocial_eventos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists criador on public.%I', t);
    execute format('create policy criador on public.%I for all to authenticated using (public.e_criador(workspace_id)) with check (public.e_criador(workspace_id))', t);
  end loop;
end $$;
