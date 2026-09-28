-- Pedidos do Mercado Livre com repasse "a liberar" cuja previsão já passou (usado pela rotina de liberações).
create or replace function public.ml_a_liberar(ws uuid, ate date, lim int default 120)
returns table (id text, external jsonb) language sql stable security definer set search_path = public as $$
  select o.id, o.external from public.orders o
   where o.workspace_id = ws and o.platform = 'Mercado Livre'
     and jsonb_typeof(o.external -> 'mp_a_liberar') = 'array'
     and exists (select 1 from jsonb_array_elements(o.external -> 'mp_a_liberar') x
                  where coalesce(nullif(x ->> 'previsao', '')::date, ate) <= ate)
   order by o.date
   limit lim
$$;
revoke all on function public.ml_a_liberar(uuid, date, int) from public, anon, authenticated;
