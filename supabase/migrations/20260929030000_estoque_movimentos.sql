-- Kardex do Jarvis: todo movimento de item que nasce no Jarvis (venda direta, devolução, inventário, ajuste,
-- perda, brinde, compra sem nota...) fica registrado aqui e é enviado ao Bling (estoque oficial) pela função
-- integrations — na hora, quando possível, e pelo cron a cada 10 minutos para o que ficou pendente.
-- O id é determinístico (origem:documento:sku) para o mesmo documento nunca movimentar duas vezes.
-- Movimento não se apaga (não há política de delete) nem se altera: corrige-se com um estorno.
-- A tabela já existia (migração 20260926120000, vazia e sem uso): evolui para o formato do kardex.
create table if not exists public.estoque_movimentos (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id text not null,
  sku text not null,
  data date not null default current_date,
  quantidade numeric(14,3) not null,
  primary key (workspace_id, id)
);
alter table public.estoque_movimentos drop constraint if exists estoque_movimentos_tipo_check;
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='estoque_movimentos' and column_name='tipo')
     and not exists (select 1 from information_schema.columns where table_schema='public' and table_name='estoque_movimentos' and column_name='motivo') then
    alter table public.estoque_movimentos rename column tipo to motivo;
  end if;
end $$;
alter table public.estoque_movimentos
  add column if not exists motivo text,
  add column if not exists produto_bling bigint,
  add column if not exists operacao text,
  add column if not exists custo numeric(14,4),
  add column if not exists origem text,
  add column if not exists referencia text,
  add column if not exists documento text,
  add column if not exists observacao text,
  add column if not exists deposito bigint,
  add column if not exists bling_status text not null default 'pendente',
  add column if not exists bling_id bigint,
  add column if not exists bling_erro text,
  add column if not exists bling_em timestamptz,
  add column if not exists tentativas int not null default 0,
  add column if not exists saldo_apos numeric(14,3),
  add column if not exists criado_por text,
  add column if not exists created_at timestamptz not null default now();
alter table public.estoque_movimentos alter column data set default current_date, alter column motivo set not null, alter column operacao set not null;
alter table public.estoque_movimentos drop constraint if exists estoque_movimentos_operacao_check;
alter table public.estoque_movimentos add constraint estoque_movimentos_operacao_check check (operacao in ('E','S','B'));
alter table public.estoque_movimentos drop constraint if exists estoque_movimentos_quantidade_check;
alter table public.estoque_movimentos add constraint estoque_movimentos_quantidade_check check (quantidade >= 0);
alter table public.estoque_movimentos drop constraint if exists estoque_movimentos_bling_status_check;
alter table public.estoque_movimentos add constraint estoque_movimentos_bling_status_check check (bling_status in ('pendente','enviado','erro','nao_enviar'));
-- motivo: venda_direta, cancelamento_venda, devolucao_venda, devolucao_compra, compra_sem_nota, inventario, ajuste,
-- perda, avaria, brinde, uso_interno, amostra, estorno · origem: vendas_diretas, inventarios, devolucoes, manual
create index if not exists estoque_movimentos_pend on public.estoque_movimentos (workspace_id, bling_status) where bling_status in ('pendente','erro');

alter table public.estoque_movimentos enable row level security;
drop policy if exists ler_estoque_movimentos on public.estoque_movimentos;
drop policy if exists incluir_estoque_movimentos on public.estoque_movimentos;
drop policy if exists alterar_estoque_movimentos on public.estoque_movimentos;
drop policy if exists excluir_estoque_movimentos on public.estoque_movimentos;
drop policy if exists estoque_mov_all on public.estoque_movimentos;
drop policy if exists criar_estoque_movimentos on public.estoque_movimentos;
drop policy if exists status_estoque_movimentos on public.estoque_movimentos;
create policy ler_estoque_movimentos on public.estoque_movimentos for select
  using (workspace_id = any((select public.ws_pode('estoque', false))::uuid[]) or workspace_id = any((select public.ws_pode('vendas', false))::uuid[]));
-- Quem cria: estoque (ajustes, inventário) e vendas (venda direta, devolução).
create policy criar_estoque_movimentos on public.estoque_movimentos for insert
  with check (workspace_id = any((select public.ws_pode('estoque', true))::uuid[]) or workspace_id = any((select public.ws_pode('vendas', true))::uuid[]));
-- Atualização só do estado do envio (o gatilho abaixo impede mexer no movimento em si).
create policy status_estoque_movimentos on public.estoque_movimentos for update
  using (workspace_id = any((select public.ws_pode('estoque', true))::uuid[]) or workspace_id = any((select public.ws_pode('vendas', true))::uuid[]))
  with check (workspace_id = any((select public.ws_pode('estoque', true))::uuid[]) or workspace_id = any((select public.ws_pode('vendas', true))::uuid[]));

create or replace function public.estoque_mov_imutavel() returns trigger language plpgsql as $$
begin
  if (new.sku, new.operacao, new.quantidade, new.data, new.motivo, coalesce(new.referencia,''))
     is distinct from (old.sku, old.operacao, old.quantidade, old.data, old.motivo, coalesce(old.referencia,'')) then
    raise exception 'Movimento de estoque não se altera: lance um estorno.';
  end if;
  return new;
end $$;
drop trigger if exists imutavel on public.estoque_movimentos;
create trigger imutavel before update on public.estoque_movimentos for each row execute function public.estoque_mov_imutavel();
drop trigger if exists auditar on public.estoque_movimentos;
create trigger auditar after insert or update on public.estoque_movimentos for each row execute function public.auditar();
