-- Archivo de alumno — smoke RLS/trigger (rollback-only).
--
-- Requiere que se hayan aplicado, EN ESTE ORDEN:
--   20260731123000_archive_client_deactivates_assignments.sql
--   20260801023414_archive_client_access_and_nutrition_v2_history.sql
--   20260803150806_fix_archive_gate_clients_insert.sql
--   20260803162000_clients_self_row_visible_when_blocked.sql
--   20260803171000_archive_gate_returning_and_loud_assignment_guards.sql
--
-- Cobertura (2026-08-03): ademas del cierre de datos del alumno archivado, cubre el ALTA de alumno
-- por el coach (el P0 que la version anterior no veia), el INSERT ... RETURNING sobre `clients`, la
-- lectura de la ficha propia que necesita la pantalla de cuenta suspendida y el rechazo ruidoso al
-- asignar trabajo activo a un archivado.
--
-- Ejecutar con una conexión SQL privilegiada sobre un entorno controlado. El test modifica
-- una ficha existente y agrega dos filas sintéticas, pero termina siempre en ROLLBACK.
-- Nunca sustituir el ROLLBACK por COMMIT ni ejecutar como evidencia de RLS con service_role.

begin;

create temporary table archive_smoke_ctx (
  client_id uuid not null,
  coach_id uuid not null,
  habit_id uuid not null,
  checkin_id uuid not null,
  probe_date date not null
) on commit drop;

-- Se necesita una identidad legacy (clients.id = auth.uid()) para probar la rama alumno
-- directamente. Las cuentas split siguen cubiertas por client_memberships en el helper.
insert into archive_smoke_ctx (client_id, coach_id, habit_id, checkin_id, probe_date)
select c.id, c.coach_id, gen_random_uuid(), gen_random_uuid(), current_date - 10000
from public.clients c
where c.coach_id is not null
  and c.org_id is null
  and c.is_archived is not true
  and c.is_active is not false
limit 1;

do $$
begin
  if not exists (select 1 from archive_smoke_ctx) then
    raise exception 'archive_smoke_requires_active_standalone_client';
  end if;
end;
$$;

-- Datos mínimos cuya lectura propia era accesible por PostgREST antes del cierre.
insert into public.daily_habits (id, client_id, log_date)
select habit_id, client_id, probe_date from archive_smoke_ctx;

insert into public.check_ins (id, client_id, date)
select checkin_id, client_id, probe_date from archive_smoke_ctx;

-- El tramo RLS cambia temporalmente al rol authenticated; pg_temp necesita permiso explicito.
grant select on archive_smoke_ctx to authenticated;

-- Archivar como operación de servidor: el trigger debe apagar asignaciones existentes.
update public.clients c
set is_archived = true
from archive_smoke_ctx ctx
where c.id = ctx.client_id;

do $$
declare
  ctx archive_smoke_ctx%rowtype;
begin
  select * into ctx from archive_smoke_ctx;

  if exists (select 1 from public.workout_programs where client_id = ctx.client_id and is_active is true) then
    raise exception 'SMOKE FALLO: archived client retained an active workout program';
  end if;
  if exists (select 1 from public.nutrition_plans where client_id = ctx.client_id and is_active is true) then
    raise exception 'SMOKE FALLO: archived client retained an active V1 nutrition plan';
  end if;
  if exists (select 1 from public.nutrition_plan_cycles where client_id = ctx.client_id and is_active is true) then
    raise exception 'SMOKE FALLO: archived client retained an active V1 nutrition cycle';
  end if;
  if exists (select 1 from public.nutrition_plans_v2 where client_id = ctx.client_id and lifecycle_status = 'active') then
    raise exception 'SMOKE FALLO: archived client retained an active V2 nutrition plan';
  end if;
end;
$$;

-- JWT realista del ALUMNO, no service_role: RLS debe devolver cero filas aunque el token
-- hubiera sido emitido antes del archivado. La API/RPC también debe denegar el detalle legacy.
select set_config('request.jwt.claim.sub', (select client_id::text from archive_smoke_ctx), true);
set local role authenticated;

do $$
declare
  ctx archive_smoke_ctx%rowtype;
  visible_clients integer;
  visible_habits integer;
  visible_checkins integer;
begin
  select * into ctx from archive_smoke_ctx;
  select count(*) into visible_clients from public.clients where id = ctx.client_id;
  select count(*) into visible_habits from public.daily_habits where id = ctx.habit_id;
  select count(*) into visible_checkins from public.check_ins where id = ctx.checkin_id;

  -- Su PROPIA ficha sigue visible a proposito (fix 2026-08-03): la web la necesita para servir la
  -- pantalla de cuenta suspendida; sin ella el alumno rebotaba al login sin explicacion. Lo que
  -- debe quedar cerrado son sus DATOS.
  if visible_clients <> 1 then
    raise exception 'SMOKE FALLO: archived JWT no puede leer su propia ficha (clients %) — la pantalla suspended queda inalcanzable', visible_clients;
  end if;

  if visible_habits <> 0 or visible_checkins <> 0 then
    raise exception 'SMOKE FALLO: archived JWT still reads own data (habits %, checkins %)',
      visible_habits, visible_checkins;
  end if;

  if exists (select 1 from public.clients where id <> ctx.client_id) then
    raise exception 'SMOKE FALLO: archived JWT lee fichas ajenas';
  end if;

  begin
    perform public.get_nutrition_legacy_history_detail_v2(ctx.client_id, ctx.probe_date);
    raise exception 'SMOKE FALLO: archived JWT read legacy nutrition detail';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;

-- Asignar trabajo ACTIVO a un alumno archivado debe FALLAR fuerte (guardas ruidosas 2026-08-03).
-- Antes se forzaba `is_active := false` en silencio y el coach creia haber asignado.
do $$
declare
  ctx archive_smoke_ctx%rowtype;
begin
  select * into ctx from archive_smoke_ctx;
  begin
    insert into public.workout_programs (client_id, coach_id, name, is_active)
    values (ctx.client_id, ctx.coach_id, 'SMOKE archived assign', true);
    raise exception 'SMOKE FALLO: se pudo asignar un programa ACTIVO a un alumno archivado';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

-- Alta de alumno por el COACH (regresion P0 2026-08-03: la policy restrictiva FOR ALL evaluaba su
-- WITH CHECK tambien en el INSERT y ningun coach podia crear alumnos). El INSERT lleva RETURNING a
-- proposito: asi se ejercita ademas la policy de SELECT sobre la fila recien creada, que es el otro
-- filo del mismo gate. `clients.id` referencia `auth.users`, por eso se toma una identidad libre.
create temporary table archive_smoke_alta (auth_id uuid) on commit drop;

insert into archive_smoke_alta (auth_id)
select u.id
from auth.users u
where not exists (select 1 from public.clients c where c.id = u.id)
  and not exists (select 1 from public.coaches co where co.id = u.id)
limit 1;

grant select on archive_smoke_alta to authenticated;

select set_config('request.jwt.claim.sub', (select coach_id::text from archive_smoke_ctx), true);
set local role authenticated;

insert into public.clients (id, coach_id, full_name, email, force_password_change, age_confirmed_at)
select a.auth_id, ctx.coach_id, 'SMOKE alta alumno',
       'smoke-alta-' || a.auth_id || '@example.invalid', true, now()
from archive_smoke_alta a, archive_smoke_ctx ctx
returning id;

reset role;

do $$
declare
  candidates integer;
  created integer;
begin
  select count(*) into candidates from archive_smoke_alta;
  if candidates = 0 then
    raise notice 'SMOKE OMITIDO: no hay identidad Auth libre para probar el alta de alumno';
    return;
  end if;

  select count(*) into created
  from public.clients c
  join archive_smoke_alta a on a.auth_id = c.id;

  if created <> 1 then
    raise exception 'SMOKE FALLO: el coach no pudo crear un alumno (RLS bloqueo el INSERT/RETURNING)';
  end if;
end;
$$;

-- Desarchivar sólo restituye roster/Auth: las asignaciones permanecen apagadas/archivadas.
update public.clients c
set is_archived = false
from archive_smoke_ctx ctx
where c.id = ctx.client_id;

do $$
declare
  ctx archive_smoke_ctx%rowtype;
begin
  select * into ctx from archive_smoke_ctx;
  if exists (select 1 from public.workout_programs where client_id = ctx.client_id and is_active is true)
     or exists (select 1 from public.nutrition_plans where client_id = ctx.client_id and is_active is true)
     or exists (select 1 from public.nutrition_plan_cycles where client_id = ctx.client_id and is_active is true)
     or exists (select 1 from public.nutrition_plans_v2 where client_id = ctx.client_id and lifecycle_status = 'active') then
    raise exception 'SMOKE FALLO: unarchive revived an assignment';
  end if;
end;
$$;

rollback;
