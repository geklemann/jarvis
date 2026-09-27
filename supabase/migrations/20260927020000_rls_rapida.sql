-- RLS rápida: as políticas chamavam pode(workspace_id, área, gravar) linha a linha — duas consultas por linha
-- (papel e MFA). Com 14 mil pedidos a leitura levava ~4 s e o login estourava o statement_timeout (8 s).
-- Agora cada consulta calcula UMA vez a lista de workspaces que o usuário pode acessar naquela área
-- (subselect vira InitPlan) e compara cada linha com ela. As regras de papel continuam idênticas.

-- Regra de papel isolada (mesma tabela de pode()).
create or replace function public.papel_pode(r text, area text, gravar boolean)
returns boolean language sql immutable as $$
  select case r
    when 'owner' then true
    when 'member' then true
    when 'financeiro' then area in ('financeiro','contabil','vendas','precos','config') or (area = 'estoque' and not gravar)
    when 'contador' then area in ('contabil','config') or (area in ('financeiro','vendas','precos','estoque') and not gravar)
    when 'atendimento' then area = 'vendas' or (area in ('estoque','precos','config') and not gravar)
    when 'estoque' then area = 'estoque' or (area in ('vendas','precos','config') and not gravar)
    else false end
$$;

create or replace function public.pode(ws uuid, area text, gravar boolean)
returns boolean language sql stable security definer set search_path = public as $$
  select public.mfa_ok() and coalesce(public.papel_pode(public.papel(ws), area, gravar), false)
$$;

-- Workspaces que o usuário atual pode ler/gravar numa área (vazio sem MFA quando exigido).
create or replace function public.ws_pode(area text, gravar boolean)
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(m.workspace_id), '{}')
  from public.workspace_members m
  where m.user_id = auth.uid() and public.papel_pode(m.role, area, gravar) and public.mfa_ok()
$$;

-- Workspaces de que o usuário é membro (substitui is_member linha a linha).
create or replace function public.meus_ws()
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(m.workspace_id), '{}') from public.workspace_members m where m.user_id = auth.uid()
$$;

grant execute on function public.papel_pode(text, text, boolean), public.ws_pode(text, boolean), public.meus_ws() to authenticated;

-- Reescreve as políticas: pode(workspace_id, 'x', b) → workspace_id = any((select ws_pode('x', b)))
--                        is_member(workspace_id)   → workspace_id = any((select meus_ws()))
do $$
declare p record; q text; c text; sql text;
begin
  for p in select * from pg_policies where schemaname = 'public'
           and (coalesce(qual,'') ~ '(pode|is_member)\(workspace_id' or coalesce(with_check,'') ~ '(pode|is_member)\(workspace_id') loop
    q := p.qual; c := p.with_check;
    q := regexp_replace(q, 'pode\(workspace_id, (''[a-z]+''::text), (true|false)\)', '(workspace_id = ANY ((SELECT public.ws_pode(\1, \2))::uuid[]))', 'g');
    c := regexp_replace(c, 'pode\(workspace_id, (''[a-z]+''::text), (true|false)\)', '(workspace_id = ANY ((SELECT public.ws_pode(\1, \2))::uuid[]))', 'g');
    q := regexp_replace(q, 'is_member\(workspace_id\)', '(workspace_id = ANY ((SELECT public.meus_ws())::uuid[]))', 'g');
    c := regexp_replace(c, 'is_member\(workspace_id\)', '(workspace_id = ANY ((SELECT public.meus_ws())::uuid[]))', 'g');
    sql := format('alter policy %I on public.%I', p.policyname, p.tablename);
    if q is not null then sql := sql || format(' using (%s)', q); end if;
    if c is not null then sql := sql || format(' with check (%s)', c); end if;
    execute sql;
  end loop;
end $$;
