-- Teste de segurança e integridade (menu do usuário → "Segurança e integridade").
-- Só leitura: verifica o próprio banco (RLS em todas as tabelas, auditoria imutável, segredos sem acesso pelo navegador)
-- e a consistência dos dados da empresa. Qualquer membro pode rodar para o próprio workspace.
create or replace function public.seguranca_verificar(ws uuid) returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
declare r jsonb; p jsonb := null;
begin
  if not public.is_member(ws) then raise exception 'Sem acesso a esta empresa.'; end if;
  if public.e_criador(ws) then
    select jsonb_build_object('marcacoes', count(*), 'nsr_duplicados', count(*) - count(distinct nsr), 'nsr_max', coalesce(max(nsr), 0),
      'nsr_ultimo', coalesce((select ultimo from public.ponto_nsr where workspace_id = ws), 0))
    into p from (select (x ->> 'nsr')::bigint as nsr from public.ponto_dias d, jsonb_array_elements(d.registros) x where d.workspace_id = ws) s;
  end if;
  select jsonb_build_object(
    'tabelas', (select count(*) from pg_tables where schemaname = 'public'),
    'sem_rls', (select coalesce(jsonb_agg(tablename order by tablename), '[]') from pg_tables where schemaname = 'public' and not rowsecurity),
    'politicas', (select count(*) from pg_policies where schemaname = 'public'),
    'auditoria_alteravel', (select count(*) from pg_policies where schemaname = 'public' and tablename = 'audit_log' and cmd in ('UPDATE', 'DELETE', 'ALL')),
    'auditoria_total', (select count(*) from public.audit_log where workspace_id = ws),
    'auditoria_ultima', (select max(time) from public.audit_log where workspace_id = ws),
    'segredos_sem_politica', (select count(*) = 0 from pg_policies where schemaname = 'public' and tablename = 'integration_secrets'),
    'pedidos', (select count(*) from public.orders where workspace_id = ws),
    'repasses_orfaos', (select count(*) from public.receipts r where r.workspace_id = ws and r.linked_order is not null
                          and not exists (select 1 from public.orders o where o.workspace_id = ws and o.id = r.linked_order)),
    'titulos_invalidos', (select count(*) from public.payables where workspace_id = ws and (valor is null or valor <= 0)),
    'competencias_fechadas', (select count(*) from public.closures where workspace_id = ws),
    'mfa', exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified'),
    'aal', coalesce(auth.jwt() ->> 'aal', 'aal1'),
    'ponto', p,
    'verificado_em', now()
  ) into r;
  return r;
end $$;
revoke all on function public.seguranca_verificar(uuid) from public, anon;
grant execute on function public.seguranca_verificar(uuid) to authenticated;
