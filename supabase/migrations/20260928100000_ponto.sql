-- Controle de ponto e jornada (Jarvis Ponto).
-- Gestão: só o CRIADOR do workspace (workspaces.criador) vê e altera, pelo portal. Colaboradores não entram no ERP:
-- registram pelo app "Jarvis Ponto" (ponto.html), identificados por um dispositivo ativado com código de uso único;
-- o app fala só com a função "ponto" (servidor), que usa a hora do servidor e grava tudo com número sequencial (NSR).

alter table public.workspaces add column if not exists criador uuid references auth.users(id);

create or replace function public.e_criador(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workspaces w where w.id = ws and w.criador = (select auth.uid())) and public.mfa_ok()
$$;
grant execute on function public.e_criador(uuid) to authenticated;

create table if not exists public.ponto_colaboradores (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  nome text not null,
  cargo text,
  email text,
  entrada time not null default '07:30',
  saida time not null default '17:18',
  intervalo_min int not null default 60 check (intervalo_min between 0 and 240),
  jornada_min int not null default 528 check (jornada_min between 0 and 1440),   -- minutos efetivos por dia previsto
  dias_semana int[] not null default '{1,2,3,4,5}',                              -- 0 = domingo … 6 = sábado
  saldo_inicial int not null default 0,                                          -- minutos, com sinal
  inicio date,                                                                   -- antes disso não há débito
  exigir_local boolean not null default false,                                   -- marcação só com localização
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, id)
);

create table if not exists public.ponto_dispositivos (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  colaborador_id uuid not null,
  codigo_hash text,                 -- código de ativação (uso único, expira)
  codigo_expira timestamptz,
  token_hash text unique,           -- credencial do aparelho (só o hash fica no banco)
  aparelho text,
  ativado_em timestamptz,
  ultimo_uso timestamptz,
  revogado boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (workspace_id, id),
  foreign key (workspace_id, colaborador_id) references public.ponto_colaboradores(workspace_id, id) on delete cascade
);

create table if not exists public.ponto_dias (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  colaborador_id uuid not null,
  data date not null,
  marcacoes text[] not null default '{"","","","","",""}',
  tipo text not null default 'trabalho' check (tipo in ('trabalho','folga','feriado','falta','compensacao','desconsiderado','atestado','ferias')),
  observacao text,
  conferido boolean not null default false,
  origem text not null default 'gestor',        -- colaborador | foto | gestor
  registros jsonb not null default '[]',        -- cada marcação do app: {i, hora, em, nsr, hash, lat, lng, precisao, aparelho}
  updated_at timestamptz not null default now(),
  primary key (workspace_id, colaborador_id, data),
  foreign key (workspace_id, colaborador_id) references public.ponto_colaboradores(workspace_id, id) on delete cascade
);

create table if not exists public.ponto_ajustes (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  colaborador_id uuid not null,
  competencia text not null check (competencia ~ '^\d{4}-\d{2}$'),
  tipo text not null default 'ajuste' check (tipo in ('ajuste','compensacao','abono','pagamento')),
  minutos int not null,
  motivo text not null,
  criado_por text,
  created_at timestamptz not null default now(),
  primary key (workspace_id, id),
  foreign key (workspace_id, colaborador_id) references public.ponto_colaboradores(workspace_id, id) on delete cascade
);

create table if not exists public.ponto_solicitacoes (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  colaborador_id uuid not null,
  data date,
  texto text not null,
  status text not null default 'pendente' check (status in ('pendente','aprovada','recusada')),
  resposta text,
  created_at timestamptz not null default now(),
  resolvido_em timestamptz,
  resolvido_por text,
  primary key (workspace_id, id),
  foreign key (workspace_id, colaborador_id) references public.ponto_colaboradores(workspace_id, id) on delete cascade
);

create table if not exists public.ponto_auditoria (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  colaborador_id uuid,
  data date,
  acao text not null,
  antes jsonb,
  depois jsonb,
  motivo text,
  por text,
  em timestamptz not null default now(),
  primary key (workspace_id, id)
);

create table if not exists public.ponto_anexos (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  colaborador_id uuid not null,
  competencia text not null check (competencia ~ '^\d{4}-\d{2}$'),
  caminho text not null,
  nome text not null,
  tipo text,
  tamanho int,
  created_at timestamptz not null default now(),
  primary key (workspace_id, id),
  foreign key (workspace_id, colaborador_id) references public.ponto_colaboradores(workspace_id, id) on delete cascade
);

create table if not exists public.ponto_nsr (workspace_id uuid primary key references public.workspaces(id) on delete cascade, ultimo bigint not null default 0);

create index if not exists ponto_dias_mes on public.ponto_dias (workspace_id, colaborador_id, data);
create index if not exists ponto_solic_pend on public.ponto_solicitacoes (workspace_id, status);

-- Somente o criador do workspace (no portal). O app dos colaboradores passa pela função "ponto" (service role).
do $$ declare t text; begin
  foreach t in array array['ponto_colaboradores','ponto_dispositivos','ponto_dias','ponto_ajustes','ponto_solicitacoes','ponto_auditoria','ponto_anexos','ponto_nsr'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists criador on public.%I', t);
    execute format('create policy criador on public.%I for all to authenticated using (public.e_criador(workspace_id)) with check (public.e_criador(workspace_id))', t);
  end loop;
end $$;

-- Arquivos (folhas de ponto, atestados): bucket privado, pasta = workspace.
insert into storage.buckets (id, name, public, file_size_limit) values ('ponto', 'ponto', false, 15728640) on conflict (id) do nothing;
drop policy if exists ponto_ler on storage.objects;
drop policy if exists ponto_enviar on storage.objects;
drop policy if exists ponto_remover on storage.objects;
create policy ponto_ler on storage.objects for select to authenticated using (bucket_id = 'ponto' and public.e_criador(((storage.foldername(name))[1])::uuid));
create policy ponto_enviar on storage.objects for insert to authenticated with check (bucket_id = 'ponto' and public.e_criador(((storage.foldername(name))[1])::uuid));
create policy ponto_remover on storage.objects for delete to authenticated using (bucket_id = 'ponto' and public.e_criador(((storage.foldername(name))[1])::uuid));

-- Marcação pelo app: hora do SERVIDOR (America/Sao_Paulo), em ordem, no máximo 4 por dia, cada uma travada,
-- com NSR sequencial por empresa e hash do comprovante. Atômica (trava a linha do dia).
create or replace function public.ponto_marcar(ws uuid, colab uuid, aparelho text, lat double precision, lng double precision, precisao double precision)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  agora timestamptz := clock_timestamp();
  local timestamp := agora at time zone 'America/Sao_Paulo';
  dia date := local::date;
  hora text := to_char(local, 'HH24:MI');
  r public.ponto_dias;
  n int := 0;
  i int;
  seq bigint;
  h text;
  c public.ponto_colaboradores;
begin
  select * into c from public.ponto_colaboradores where workspace_id = ws and id = colab;
  if not found or not c.ativo then raise exception 'Cadastro inativo. Fale com o responsável.'; end if;
  if c.exigir_local and (lat is null or lng is null) then raise exception 'Ative a localização do celular para registrar o ponto.'; end if;
  insert into public.ponto_dias (workspace_id, colaborador_id, data, origem) values (ws, colab, dia, 'colaborador') on conflict do nothing;
  select * into r from public.ponto_dias where workspace_id = ws and colaborador_id = colab and data = dia for update;
  if r.tipo <> 'trabalho' then raise exception 'Hoje está marcado como %. Se trabalhou, peça um ajuste.', r.tipo; end if;
  if r.conferido then raise exception 'Este dia já foi conferido e está fechado. Peça um ajuste.'; end if;
  for i in 1..6 loop if coalesce(r.marcacoes[i], '') <> '' then n := i; end if; end loop;
  if n >= 4 then raise exception 'As quatro marcações de hoje já foram registradas. Para corrigir, peça um ajuste.'; end if;
  if n > 0 and hora <= r.marcacoes[n] then raise exception 'Você já registrou às %. Aguarde um minuto para a próxima marcação.', r.marcacoes[n]; end if;
  insert into public.ponto_nsr (workspace_id, ultimo) values (ws, 1) on conflict (workspace_id) do update set ultimo = public.ponto_nsr.ultimo + 1 returning ultimo into seq;
  h := encode(sha256(convert_to(concat_ws('|', ws, colab, dia, hora, seq, agora), 'UTF8')), 'hex');
  update public.ponto_dias set
    marcacoes[n + 1] = hora,
    origem = case when origem = 'gestor' and n = 0 then 'colaborador' else origem end,
    registros = registros || jsonb_build_array(jsonb_build_object('i', n + 1, 'hora', hora, 'em', agora, 'nsr', seq, 'hash', h,
      'lat', lat, 'lng', lng, 'precisao', precisao, 'aparelho', left(aparelho, 160))),
    updated_at = agora
  where workspace_id = ws and colaborador_id = colab and data = dia;
  return jsonb_build_object('data', dia, 'hora', hora, 'passo', n + 1, 'nsr', seq, 'hash', h, 'em', agora, 'completo', n + 1 >= 4);
end $$;
revoke all on function public.ponto_marcar(uuid, uuid, text, double precision, double precision, double precision) from public, anon, authenticated;
