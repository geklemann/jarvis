-- Permissões por tela: o administrador escolhe, pessoa a pessoa, quais menus e submenus ela vê.
-- paginas = null → vale o padrão do perfil. A proteção dos dados continua no banco, por área do perfil (RLS);
-- a lista de telas restringe ainda mais o que a pessoa enxerga no portal.
alter table public.workspace_members add column if not exists paginas text[];

create or replace function public.set_paginas(ws uuid, uid uuid, paginas text[]) returns text
language plpgsql security definer set search_path = public, auth as $$
declare quem text; alvo text; n int;
begin
  if not public.is_owner(ws) then raise exception 'apenas o administrador pode definir as permissões'; end if;
  if uid = auth.uid() then raise exception 'o administrador sempre vê todas as telas'; end if;
  update public.workspace_members m set paginas = set_paginas.paginas where m.workspace_id = ws and m.user_id = uid and m.role <> 'owner';
  if not found then raise exception 'membro não encontrado (administradores sempre veem tudo)'; end if;
  select email into alvo from auth.users where id = uid;
  select email into quem from auth.users where id = auth.uid();
  n := coalesce(array_length(paginas, 1), 0);
  insert into public.audit_log(workspace_id, id, action, detail, actor)
  values (ws, 'telas-' || gen_random_uuid(), 'Permissões de telas alteradas',
          coalesce(alvo, uid::text) || case when paginas is null then ' → padrão do perfil' else ' → ' || n || ' tela(s): ' || array_to_string(paginas, ', ') end, quem);
  return case when paginas is null then 'Permissões de ' || coalesce(alvo, 'usuário') || ' voltaram ao padrão do perfil.'
              else 'Permissões de ' || coalesce(alvo, 'usuário') || ' salvas: ' || n || ' tela(s).' end;
end $$;
grant execute on function public.set_paginas(uuid, uuid, text[]) to authenticated;

-- Lista as telas liberadas de cada membro (só o administrador vê a de todos).
create or replace function public.list_paginas(ws uuid) returns table(user_id uuid, paginas text[])
language sql stable security definer set search_path = public as $$
  select m.user_id, m.paginas from public.workspace_members m where m.workspace_id = ws and public.is_owner(ws);
$$;
grant execute on function public.list_paginas(uuid) to authenticated;
