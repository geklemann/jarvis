-- Notas fiscais de compra emitidas contra o CNPJ da empresa, lidas direto da SEFAZ (distribuição DF-e via Focus NFe),
-- com a manifestação do destinatário. Leitura: financeiro e contabilidade. Gravação só pelo servidor.
create table if not exists public.nfe_recebidas (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  chave text not null,
  versao bigint,
  emitente text, emitente_doc text,
  emissao timestamptz, valor numeric(14,2),
  situacao text, manifestacao text, completa boolean default false,
  dados jsonb, detalhe jsonb,
  titulos_gerados boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, chave)
);
alter table public.nfe_recebidas enable row level security;
drop policy if exists nfr_select on public.nfe_recebidas;
create policy nfr_select on public.nfe_recebidas for select
  using (workspace_id = any ((select public.ws_pode('financeiro', false))::uuid[]) or workspace_id = any ((select public.ws_pode('contabil', false))::uuid[]));
