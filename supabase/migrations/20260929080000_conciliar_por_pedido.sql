-- Mercado Livre: o repasse do Mercado Pago informa o número do pedido. Vincula esse repasse ao pedido (mesmo com
-- diferença de valor) e, quando o pedido não tem mais parcela a liberar, ajusta a tarifa para venda − repasse real
-- (o Mercado Livre retém frete que a nota não mostra). A tarifa original fica em external.fee_original.
-- Autorizado pelo dono no chat em 29/09/2026. Só competências abertas; cada vínculo e ajuste vai para a auditoria.
create or replace function public.conciliar_por_pedido(ws uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare n int := 0; m int := 0;
begin
  with u as (
    update receipts r set linked_order = o.id, updated_at = now()
    from orders o
    where r.workspace_id = ws and r.linked_order is null and r.platform = 'Mercado Livre' and r.source = 'Mercado Pago API'
      and o.workspace_id = r.workspace_id and o.id = r.order_id and o.platform = r.platform
      and not exists (select 1 from closures c where c.workspace_id = o.workspace_id and c.month = to_char(o.date, 'YYYY-MM'))
    returning r.id, r.linked_order, r.amount
  ), a as (
    insert into audit_log (workspace_id, id, time, action, detail, actor)
    select ws, gen_random_uuid()::text, now(), 'Vínculo confirmado', id || ' → ' || linked_order || ' · R$ ' || amount || ' · vínculo pelo número do pedido',
      'Conciliação automática (vínculo pelo número do pedido, autorizado no chat em 29/09)' from u returning 1
  ) select count(*) into n from a;

  with p as (
    select o.id, o.gross, o.fee, sum(r.amount) rec
    from orders o join receipts r on r.workspace_id = o.workspace_id and r.linked_order = o.id
    where o.workspace_id = ws and o.platform = 'Mercado Livre'
      and coalesce(jsonb_array_length(o.external -> 'mp_a_liberar'), 0) = 0
      and not exists (select 1 from closures c where c.workspace_id = o.workspace_id and c.month = to_char(o.date, 'YYYY-MM'))
    group by o.id, o.gross, o.fee
    having sum(r.amount) > 0 and abs(o.gross - o.fee - sum(r.amount)) >= 0.05
  ), u as (
    update orders o set fee = round(p.gross - p.rec, 2), updated_at = now(),
      external = coalesce(o.external, '{}'::jsonb)
        || case when o.external ? 'fee_original' then '{}'::jsonb else jsonb_build_object('fee_original', p.fee) end
        || jsonb_build_object('fee_ajuste', jsonb_build_object('em', now(), 'motivo', 'tarifa = venda − repasse real', 'repasse', round(p.rec, 2)))
    from p where o.workspace_id = ws and o.id = p.id
    returning o.id, p.fee antes, o.fee depois
  ), a as (
    insert into audit_log (workspace_id, id, time, action, detail, actor)
    select ws, gen_random_uuid()::text, now(), 'Tarifa ajustada pelo repasse real', id || ' · Mercado Livre · tarifa R$ ' || antes || ' → R$ ' || depois,
      'Conciliação automática (autorizada no chat em 29/09)' from u returning 1
  ) select count(*) into m from a;
  return n + m;
end $$;
revoke all on function public.conciliar_por_pedido(uuid) from public, anon, authenticated;
