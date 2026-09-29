-- DIFAL e GNRE. difal_notas: o DIFAL/FCP de cada NF-e de venda (lido do XML autorizado no Bling), com a UF de destino
-- e a situação da guia. gnre_guias: guias por nota (UF sem inscrição) ou mensais (UF com inscrição estadual), com o
-- lote enviado ao Portal GNRE, o recibo, o resultado (linha digitável, código de barras, PDF) e o título a pagar.
-- gnre_config_uf: exigências de cada UF/receita lidas do webservice GnreConfigUF (cache).
create table if not exists public.difal_notas (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  chave text not null,
  bling_id bigint,
  numero text, serie text,
  emissao date not null,
  uf text not null,
  dest_nome text, dest_doc text, dest_mun text,     -- dest_mun: código IBGE (7 dígitos)
  valor_nota numeric(14,2),
  v_difal numeric(14,2) not null default 0,
  v_fcp numeric(14,2) not null default 0,
  situacao text not null default 'pendente' check (situacao in ('pendente','mensal','guia','paga','sem_difal','cancelada','ignorada')),
  guia_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, chave)
);
create index if not exists difal_notas_mes on public.difal_notas (workspace_id, emissao, uf);

create table if not exists public.gnre_guias (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id text not null,
  uf text not null,
  tipo text not null check (tipo in ('nota','mensal')),
  referencia text,                                  -- chave da nota ou competência AAAA-MM
  notas text[] not null default '{}',
  receita text not null default '100102',
  valor_icms numeric(14,2) not null default 0,
  valor_fcp numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  vencimento date,
  status text not null default 'rascunho' check (status in ('rascunho','enviada','emitida','rejeitada','paga','cancelada')),
  ambiente text,
  lote_id text, recibo text,
  linha_digitavel text, codigo_barras text, nosso_numero text,
  pdf_base64 text,
  motivos jsonb,
  payable_id text,
  xml text,
  criado_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, id)
);
create index if not exists gnre_guias_status on public.gnre_guias (workspace_id, status);

create table if not exists public.gnre_config_uf (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  uf text not null,
  receita text not null,
  config jsonb not null,
  lido_em timestamptz not null default now(),
  primary key (workspace_id, uf, receita)
);

do $$ declare t text; begin
  foreach t in array array['difal_notas','gnre_guias','gnre_config_uf'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', 'ler_' || t, t);
    execute format('create policy %I on public.%I for select using (workspace_id = any((select public.ws_pode(%L, false))::uuid[]))', 'ler_' || t, t, 'financeiro');
  end loop;
end $$;
-- O navegador só marca nota como ignorada/pendente (ex.: nota cancelada); o resto é gravado pelo servidor.
drop policy if exists marcar_difal_notas on public.difal_notas;
create policy marcar_difal_notas on public.difal_notas for update
  using (workspace_id = any((select public.ws_pode('financeiro', true))::uuid[]) and situacao in ('pendente','ignorada','mensal'))
  with check (workspace_id = any((select public.ws_pode('financeiro', true))::uuid[]) and situacao in ('pendente','ignorada','mensal'));
drop trigger if exists auditar on public.gnre_guias;
create trigger auditar after insert or update on public.gnre_guias for each row execute function public.auditar();

-- Título a pagar da guia: origem 'gnre'.
alter table public.payables drop constraint if exists payables_origem_check;
alter table public.payables add constraint payables_origem_check check (origem in ('nfe','manual','recorrente','extrato','dda','sefaz','folha','gnre'));
