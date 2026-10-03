-- Orçamento colaborativo: o gestor responsável por uma categoria (e-mail em dados.despesas[cat].resp) preenche os
-- valores dela mesmo sem perfil financeiro. Só na própria categoria, só em versão em rascunho ou em revisão.
create or replace function public.orc_preencher(p_ws uuid, p_id text, p_cat text, p_meses jsonb, p_concluir boolean default false)
returns text language plpgsql security definer set search_path to 'public' as $$
declare v record; meu text := lower(coalesce(auth.jwt()->>'email', ''));
begin
  if not exists (select 1 from workspace_members m where m.workspace_id = p_ws and m.user_id = auth.uid()) or not public.mfa_ok() then
    raise exception 'Sem acesso a esta empresa.';
  end if;
  select * into v from orcamentos where workspace_id = p_ws and id = p_id for update;
  if not found then raise exception 'Versão não encontrada.'; end if;
  if v.status not in ('rascunho', 'em_revisao') then raise exception 'Esta versão está %: não aceita alterações.', v.status; end if;
  if lower(coalesce(v.dados->'despesas'->p_cat->>'resp', '')) <> meu or meu = '' then
    raise exception 'Você não é o responsável por esta categoria.';
  end if;
  if jsonb_typeof(p_meses) <> 'object' then raise exception 'Valores inválidos.'; end if;
  update orcamentos set
    dados = jsonb_set(jsonb_set(dados, array['despesas', p_cat, 'meses'], p_meses, true),
                      array['despesas', p_cat, 'status'], to_jsonb(case when p_concluir then 'preenchido' else coalesce(dados->'despesas'->p_cat->>'status', 'pendente') end), true),
    updated_at = now()
  where workspace_id = p_ws and id = p_id;
  return case when p_concluir then 'Categoria preenchida e enviada.' else 'Valores salvos.' end;
end $$;
revoke all on function public.orc_preencher(uuid, text, text, jsonb, boolean) from public;
grant execute on function public.orc_preencher(uuid, text, text, jsonb, boolean) to authenticated;
