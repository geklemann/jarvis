-- Metas do mês, vigia de preços da concorrência (Mercado Livre), central de erros e envio do pedido de compra por e-mail.

-- metas: valor por mês, canal ('' = empresa toda) e indicador. vendas e recebido em R$; margem em % (ex.: 18.5).
create table if not exists public.metas (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  mes text not null check (mes ~ '^\d{4}-\d{2}$'),
  canal text not null default '',
  indicador text not null check (indicador in ('vendas', 'margem', 'recebido')),
  valor numeric(14,2) not null check (valor >= 0),
  atualizado_por text,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, mes, canal, indicador)
);
alter table public.metas enable row level security;
drop policy if exists ler_metas on public.metas;
drop policy if exists gravar_metas on public.metas;
create policy ler_metas on public.metas for select using (workspace_id = any ((select public.meus_ws())::uuid[]));
create policy gravar_metas on public.metas for all
  using (workspace_id = any ((select public.ws_pode('financeiro', true))::uuid[]))
  with check (workspace_id = any ((select public.ws_pode('financeiro', true))::uuid[]));
drop trigger if exists auditar on public.metas;
create trigger auditar after insert or update or delete on public.metas for each row execute function public.auditar();

-- precos_concorrencia: um registro por anúncio próprio do Mercado Livre, gravado só pelo servidor (vigia de preços).
create table if not exists public.precos_concorrencia (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  item_id text not null,
  sku text,
  titulo text,
  link text,
  foto text,
  produto_catalogo text,             -- catalog_product_id (anúncios iguais de outros vendedores)
  catalogo boolean not null default false,
  meu_preco numeric(14,2),
  menor_preco numeric(14,2),         -- menor preço de outro vendedor no mesmo produto
  menor_item text,
  concorrentes int not null default 0,
  situacao text,                     -- ganhando | compartilhando | perdendo | sozinho | sem_catalogo | listado
  preco_para_ganhar numeric(14,2),
  historico jsonb not null default '[]'::jsonb,   -- [{em, meu, menor}] (últimos 60 pontos)
  verificado_em timestamptz not null default now(),
  primary key (workspace_id, item_id)
);
alter table public.precos_concorrencia enable row level security;
drop policy if exists ler_precos_concorrencia on public.precos_concorrencia;
create policy ler_precos_concorrencia on public.precos_concorrencia for select using (workspace_id = any ((select public.ws_pode('precos', false))::uuid[]));

-- erros_sistema: falhas vistas no navegador de quem usa o sistema e nas funções do servidor. Uma linha por erro
-- diferente (assinatura); repetições só aumentam o contador. Só o dono vê e marca como resolvido.
create table if not exists public.erros_sistema (
  id bigserial primary key,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  origem text not null default 'navegador' check (origem in ('navegador', 'servidor')),
  assinatura text not null,
  mensagem text not null,
  pilha text,
  pagina text,
  url text,
  navegador text,
  versao text,
  usuario text,
  usuarios text[] not null default '{}',
  ocorrencias int not null default 1,
  primeiro_em timestamptz not null default now(),
  ultimo_em timestamptz not null default now(),
  resolvido_em timestamptz,
  resolvido_por text
);
create unique index if not exists erros_sistema_aberto on public.erros_sistema (coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid), assinatura) where resolvido_em is null;
create index if not exists erros_sistema_ws_ultimo on public.erros_sistema (workspace_id, ultimo_em desc);
alter table public.erros_sistema enable row level security;
drop policy if exists ler_erros_sistema on public.erros_sistema;
drop policy if exists resolver_erros_sistema on public.erros_sistema;
create policy ler_erros_sistema on public.erros_sistema for select using (public.is_owner(workspace_id));
create policy resolver_erros_sistema on public.erros_sistema for update using (public.is_owner(workspace_id)) with check (public.is_owner(workspace_id));

-- Registro pelo navegador: qualquer usuário logado registra erros do próprio workspace (ou sem workspace, na entrada).
-- Repetição do mesmo erro em aberto só soma o contador; textos são cortados para não encher o banco.
create or replace function public.registrar_erro(ws uuid, p_assinatura text, p_mensagem text, p_pilha text, p_pagina text, p_url text, p_navegador text, p_versao text)
returns void language plpgsql security definer set search_path = public as $$
declare quem text := coalesce((select email from auth.users where id = auth.uid()), 'anônimo');
begin
  if auth.uid() is null then return; end if;
  if ws is not null and not exists (select 1 from public.workspace_members m where m.workspace_id = ws and m.user_id = auth.uid()) then return; end if;
  update public.erros_sistema e set ocorrencias = least(e.ocorrencias + 1, 1000000), ultimo_em = now(), pagina = left(p_pagina, 80), usuario = quem,
    usuarios = case when quem = any(e.usuarios) or cardinality(e.usuarios) >= 20 then e.usuarios else e.usuarios || quem end
   where coalesce(e.workspace_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(ws, '00000000-0000-0000-0000-000000000000'::uuid)
     and e.assinatura = left(p_assinatura, 200) and e.resolvido_em is null;
  if found then return; end if;
  insert into public.erros_sistema (workspace_id, origem, assinatura, mensagem, pilha, pagina, url, navegador, versao, usuario, usuarios)
  values (ws, 'navegador', left(p_assinatura, 200), left(coalesce(p_mensagem, ''), 1000), left(p_pilha, 4000), left(p_pagina, 80), left(p_url, 300), left(p_navegador, 300), left(p_versao, 40), quem, array[quem])
  on conflict do nothing;
end $$;
revoke all on function public.registrar_erro(uuid, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.registrar_erro(uuid, text, text, text, text, text, text, text) to authenticated;

-- Pedido de compra: e-mail do fornecedor e para quem foi enviado.
alter table public.pedidos_compra add column if not exists email text;
alter table public.pedidos_compra add column if not exists enviado_para text;
