-- NUT-004 barrera DB: un alumno tiene como maximo UNA raiz de plan activa.
-- Saneo previo ejecutado en LIVE el 2026-07-28: 1 alumno con raiz duplicada
-- ("volumen" archivada, "volumen 2" conservada por criterio del hub). El
-- _PENDING_AUDIT_ original pedia `concurrently`; se aplico plano porque
-- nutrition_plans_v2 es chica y el lock es negligible. Guard: aborta si
-- reaparecen duplicadas.
do $do$
declare v_dups integer;
begin
  select count(*) into v_dups from (
    select client_id from public.nutrition_plans_v2
    where lifecycle_status = 'active'
    group by client_id having count(*) > 1
  ) d;
  if v_dups > 0 then
    raise exception 'nutrition_v2_active_root_dups_pendientes: %', v_dups;
  end if;
end;
$do$;

create unique index if not exists nutrition_plans_v2_active_root_per_client_uniq
  on public.nutrition_plans_v2 (client_id)
  where lifecycle_status = 'active';

comment on index public.nutrition_plans_v2_active_root_per_client_uniq is
  'Un alumno tiene como maximo UNA raiz de plan activa. Barrera de DB de NUT-004; saneo '
  'previo ejecutado 2026-07-28.';
