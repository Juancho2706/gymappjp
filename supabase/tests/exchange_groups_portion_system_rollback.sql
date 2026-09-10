-- Porciones chilenas W0 -- smoke del SET de porciones.
-- Cubre: A) las dos columnas con su CHECK y su default; B) el indice unico de
-- `code` system; C) los 13 chilenos sembrados y APAGADOS + los 9 SMAE intactos;
-- D) el predicado de findUsedPortionSystemsForCoach y que NADIE fue movido de set
-- (R14-bis: no hay backfill); E) T-03; F) RLS de UPDATE sobre coaches.portion_system
-- (propio si, ajeno no); G) visibilidad de los 13 chilenos por xg_select segun el
-- estado de encendido del set (W0.5, TASKS criterios C y D).
-- Seguro por construccion: solo lee, y lo poco que escribe muere en el ROLLBACK.

begin;

-- -- A) Columnas, CHECKs y defaults --------------------------------------------
do $$
begin
  if (select count(*) from information_schema.columns
      where (table_schema, table_name, column_name) in
            (('public','exchange_groups','portion_system'),('public','coaches','portion_system'))) <> 2 then
    raise exception 'A: falta alguna columna portion_system';
  end if;

  if (select column_default from information_schema.columns
      where table_name='exchange_groups' and column_name='portion_system') not like '%smae%' then
    raise exception 'A: el default de exchange_groups.portion_system no es smae';
  end if;
  if (select column_default from information_schema.columns
      where table_name='coaches' and column_name='portion_system') not like '%cl%' then
    raise exception 'A: el default de coaches.portion_system no es cl';
  end if;
end $$;

-- Un valor fuera del CHECK debe fallar con 23514.
do $$
begin
  begin
    insert into public.exchange_groups (slug, code, name, is_system, portion_system, ref_calories)
    values ('smoke-set-invalido', 'ZZZ', 'Smoke set invalido', true, 'usda', 10);
    raise exception 'A: el CHECK de portion_system NO bloqueo un valor invalido';
  exception when check_violation then
    raise notice 'A OK: CHECK de portion_system activo';
  end;
end $$;

-- -- B) El indice unico de `code` entre grupos del sistema vivos ---------------
do $$
begin
  -- Se ataca con un code SMAE ('C'), no con uno chileno: el indice es parcial
  -- `where is_system and deleted_at is null` y entre W0 y W6.8 los 13 chilenos
  -- estan APAGADOS, asi que un duplicado de 'FR' NO chocaria y el test seria un
  -- falso verde (R14-ter).
  begin
    insert into public.exchange_groups (slug, code, name, is_system, portion_system, ref_calories)
    values ('smoke-cereales-dup', 'C', 'Cereales duplicado', true, 'smae', 70);
    raise exception 'B: se pudo crear un SEGUNDO grupo system con code C';
  exception when unique_violation then
    raise notice 'B OK: exchange_groups_system_code_uq bloquea codes duplicados';
  end;

  -- Y con el set ENCENDIDO, el mismo ataque con un code chileno tambien choca.
  -- Con el set apagado el insert PASA, y eso es correcto: el grupo apagado no
  -- ocupa el code. Por eso el chequeo es condicional al estado de encendido.
  if exists (select 1 from public.exchange_groups
             where is_system and portion_system = 'cl' and deleted_at is null) then
    begin
      insert into public.exchange_groups (slug, code, name, is_system, portion_system, ref_calories)
      values ('smoke-frutas-dup', 'FR', 'Frutas duplicado', true, 'cl', 60);
      raise exception 'B: se pudo crear un SEGUNDO grupo system con code FR (set encendido)';
    exception when unique_violation then
      raise notice 'B OK: el indice tambien cubre los codes chilenos con el set encendido';
    end;
  else
    raise notice 'B: set cl apagado -- el code FR todavia no esta protegido por el indice; lo cuidan los asserts del seed (parrafo 3 bloque B)';
  end if;

  -- Un CUSTOM con el mismo code SI se puede (el indice es parcial por is_system).
  -- CORRECCION W0.5 (check 4): `coaches` no tiene columna `org_id` -- tiene
  -- `active_org_id` (supabase/migrations/20260517130008_coaches_invite_code.sql:24).
  -- El DATA.md original decia `c.org_id`; se corrige aca al nombre real.
  insert into public.exchange_groups (slug, code, name, is_system, coach_id, ref_calories)
  select 'smoke-fr-custom', 'FR', 'Frutas del coach', false, c.id, 60
  from public.coaches c where c.active_org_id is null limit 1;
  raise notice 'B OK: un grupo custom con code FR sigue siendo legal';
end $$;

-- -- C) Los 13 grupos chilenos (APAGADOS hasta W6.8) y los 9 SMAE --------------
-- OJO con el filtro de deleted_at: entre W0 y el encendido de W6.8 los 13 viven
-- con `deleted_at` puesto (R14-ter). Este test corre en las dos ventanas, asi que
-- cuenta SIN el filtro y verifica el estado de encendido aparte.
do $$
declare v_cl int; v_smae int; v_composed int; v_unconfirmed int; v_cl_vivos int;
begin
  select count(*) into v_cl   from public.exchange_groups
    where is_system and portion_system = 'cl';
  select count(*) into v_smae from public.exchange_groups
    where is_system and deleted_at is null and portion_system = 'smae';
  if v_cl <> 13 then raise exception 'C: % grupos cl (esperado 13)', v_cl; end if;
  if v_smae <> 9 then raise exception 'C: % grupos smae (esperado 9)', v_smae; end if;

  -- Encendido: 0 vivos antes de W6.8, 13 despues. Las dos son correctas; lo que
  -- no puede pasar es un estado A MEDIAS (alguno vivo y alguno apagado).
  select count(*) into v_cl_vivos from public.exchange_groups
    where is_system and portion_system = 'cl' and deleted_at is null;
  if v_cl_vivos not in (0, 13) then
    raise exception 'C: el set cl quedo a medias: % vivos de 13 (R14-ter)', v_cl_vivos;
  end if;
  raise notice 'C: set cl % (% vivos de 13)',
    case when v_cl_vivos = 13 then 'ENCENDIDO' else 'apagado' end, v_cl_vivos;

  select count(*) into v_composed from public.exchange_groups
    where portion_system = 'cl' and composed_of is not null;
  if v_composed > 0 then raise exception 'C: % grupos cl con composed_of (D5)', v_composed; end if;

  select count(*) into v_unconfirmed from public.exchange_groups
    where portion_system = 'cl' and is_system and not macros_confirmed;
  if v_unconfirmed > 0 then raise exception 'C: % grupos cl sin macros_confirmed (R8)', v_unconfirmed; end if;

  -- Los refs del PCT son los del manual, no los del SMAE.
  if (select ref_calories from public.exchange_groups where code = 'PCT' and is_system) <> 140 then
    raise exception 'C: PCT no tiene 140 kcal';
  end if;
  raise notice 'C OK: 13 cl simples y confirmados, 9 smae intactos';
end $$;

-- -- D) findUsedPortionSystemsForCoach y «nadie fue movido» (R14-bis + S-04) ---
-- Ya NO hay backfill: el seed no escribe en `coaches`. Lo que hay que cuidar es
-- (1) que nadie se haya movido de 'cl', y (2) que el predicado de «sets en uso»
-- diga en SQL lo mismo que va a decir el repo (parrafo 7.1) -- si no, el bloque
-- «Legado» del picker aparece y desaparece segun quien pregunte, y un coach con
-- porciones V1 (meal_exchange_targets, todavia en produccion) se queda sin ver
-- los 9 grupos SMAE que su plan usa.
-- Decision (af) del jefe (W3, 09-09): «SMAE en uso» son grupos del SISTEMA. Los grupos
-- propios nacen con portion_system = 'smae' por el default de W0.1 y NO cuentan (el repo
-- filtra is_system = true en findUsedPortionSystemsForCoach; este predicado dice lo mismo).
create temporary view d_sets_en_uso as
select c.id as coach_id, g.portion_system
from public.coaches c
join public.exchange_groups g on g.is_system
where exists (
    select 1
    from public.nutrition_slot_exchange_targets_v2 t
    join public.nutrition_plan_versions_v2 v on v.id = t.version_id
    join public.nutrition_plans_v2 p         on p.id = v.plan_id
    where t.exchange_group_id = g.id
      and p.coach_id = c.id
      and p.lifecycle_status <> 'archived'
      and (v.id = p.current_published_version_id or v.status <> 'published'))
   or exists (
    select 1
    from public.meal_exchange_targets mt
    join public.nutrition_meals m  on m.id = mt.meal_id
    join public.nutrition_plans np on np.id = m.plan_id
    where mt.exchange_group_id = g.id
      and np.coach_id = c.id);

do $$
declare v_movidos int; v_con_legado int; v_v1 int;
begin
  -- 1) R14-bis: NADIE fue movido de set. El seed no toca `coaches`.
  select count(*) into v_movidos from public.coaches where portion_system <> 'cl';
  if v_movidos > 0 then
    raise exception 'D: % coaches quedaron fuera de cl y en este tren no hay backfill (R14-bis)', v_movidos;
  end if;

  -- 2) Cuantos coaches van a ver el bloque «Legado». Es el tamano de la audiencia
  --    del aviso in-app (OUTLINE parrafo 10), no un invariante: se informa, no se aborta.
  select count(distinct coach_id) into v_con_legado
  from d_sets_en_uso where portion_system = 'smae';
  raise notice 'D: % coaches con SMAE en uso -- veran el bloque «Legado» (STATS decia 9, solo V2)', v_con_legado;

  -- 3) Rama V1 explicita (S-04): si existe un coach que SOLO tiene porciones en
  --    meal_exchange_targets, el predicado tiene que devolverle 'smae' igual. Es
  --    el caso que una version de una sola rama perdia.
  select count(distinct np.coach_id) into v_v1
  from public.meal_exchange_targets mt
  join public.nutrition_meals m  on m.id = mt.meal_id
  join public.nutrition_plans np on np.id = m.plan_id
  join public.exchange_groups g  on g.id = mt.exchange_group_id
  where g.portion_system = 'smae'
    and not exists (
      select 1 from d_sets_en_uso d
      where d.coach_id = np.coach_id and d.portion_system = 'smae');
  if v_v1 > 0 then
    raise exception 'D: % coaches con porciones V1 sobre grupos SMAE que el predicado NO devuelve (S-04)', v_v1;
  end if;

  raise notice 'D OK: 0 coaches movidos, predicado V2+V1 consistente';
end $$;

-- -- E) T-03: `authenticated` sigue sin poder tocar grupos del sistema ---------
do $$
begin
  set local role authenticated;
  begin
    update public.exchange_groups set ref_calories = 999 where code = 'PCT' and is_system;
    if found then raise exception 'E: authenticated pudo editar un grupo del sistema'; end if;
  exception when insufficient_privilege then
    null;  -- tambien es un resultado correcto
  end;
  reset role;
  raise notice 'E OK: los grupos del sistema siguen inmutables para authenticated';
end $$;

-- -- pc_coach_ctx: dos coaches standalone (activos sin org) para F y G ---------
create temporary table pc_coach_ctx (
  coach_a uuid not null,
  coach_b uuid not null
) on commit drop;

-- Mismo motivo que nut_hh_ctx (supabase/tests/nutrition_v2_household_units_rollback.sql:49):
-- sin este grant la tabla temporal (owner = rol de la sesion privilegiada) queda
-- inaccesible al cambiar de rol a authenticated.
grant select on pc_coach_ctx to authenticated;

do $$
declare
  v_a uuid;
  v_b uuid;
begin
  select id into v_a from public.coaches where active_org_id is null order by id limit 1;
  select id into v_b from public.coaches where active_org_id is null and id <> v_a order by id limit 1;
  if v_a is null or v_b is null then
    raise exception 'pc_coach_ctx: no hay dos coaches standalone (active_org_id is null) para el smoke F/G';
  end if;
  insert into pc_coach_ctx (coach_a, coach_b) values (v_a, v_b);
end $$;

-- ============================================================================
-- F -- un coach authenticated actualiza SU coaches.portion_system (smae y de
-- vuelta a cl, found = true en ambos); el de OTRO coach, found = false (RLS).
--
-- Policy de UPDATE de coaches: "coaches_update_own" -- USING/WITH CHECK
-- id = auth.uid() (supabase/migrations/00000000000001_baseline.sql:2992). La
-- fila ajena no matchea el USING: el UPDATE la excluye en silencio (found =
-- false), no hay excepcion que capturar por RLS.
--
-- Grant de columna explicito (mismo patron que coaches.persona,
-- supabase/migrations/20260822002122_onboarding_v2_persona_demo.sql:49):
-- supabase/migrations/20260909120000_exchange_groups_portion_system.sql:96
-- (`grant update (portion_system) on public.coaches to authenticated;`). Si el
-- update propio fallara por otra razon (policy RESTRICTIVE, grant faltante), el
-- bloque F.1 lo reporta con el sqlerrm real en vez de un mensaje generico.
-- ============================================================================
select set_config('request.jwt.claim.sub', (select coach_a::text from pc_coach_ctx), true);
set local role authenticated;

do $$
declare
  ctx pc_coach_ctx%rowtype;
begin
  select * into ctx from pc_coach_ctx;

  -- F.1: el coach actualiza SU propia fila: smae y de vuelta a cl. found = true en ambos.
  begin
    update public.coaches set portion_system = 'smae' where id = ctx.coach_a;
    if not found then
      raise exception 'SMOKE FALLO (F.1): el propio coach no pudo pasar su portion_system a smae (found = false sin error)';
    end if;

    update public.coaches set portion_system = 'cl' where id = ctx.coach_a;
    if not found then
      raise exception 'SMOKE FALLO (F.1): el propio coach no pudo volver su portion_system a cl (found = false sin error)';
    end if;
  exception
    when others then
      raise exception 'SMOKE FALLO (F.1): el update propio fallo por otra razon (sqlstate %): %', sqlstate, sqlerrm;
  end;

  -- F.2: el MISMO coach intenta tocar el portion_system de OTRO coach. found debe ser
  -- false: la fila ajena no matchea USING id = auth.uid(), RLS la saca del UPDATE.
  update public.coaches set portion_system = 'smae' where id = ctx.coach_b;
  if found then
    raise exception 'SMOKE FALLO (F.2): authenticated pudo actualizar el portion_system de OTRO coach (coaches_update_own rota)';
  end if;

  raise notice 'F OK: coach propio actualiza portion_system (smae<->cl, found=true); el de otro coach, found=false por RLS';
end $$;

reset role;

-- ============================================================================
-- G -- visibilidad por xg_select: los 13 grupos cl estan en 0 mientras el set
-- esta apagado y en 13 en cuanto se enciende (simulado DENTRO de la tx).
--
-- Policy: xg_select ON public.exchange_groups FOR SELECT USING (deleted_at IS
-- NULL AND (is_system OR coach_id = auth.uid() OR team_id IN (...))) --
-- supabase/migrations/20260611093001_nutrition_exchanges.sql:167-172. El count
-- de abajo NO filtra deleted_at a mano: si la policy fallara, authenticated
-- veria las 13 filas apagadas igual.
-- ============================================================================
select set_config('request.jwt.claim.sub', (select coach_a::text from pc_coach_ctx), true);
set local role authenticated;

do $$
declare
  v_count int;
  v_ya_encendido boolean;
begin
  select exists (
    select 1 from public.exchange_groups
    where is_system and portion_system = 'cl' and deleted_at is null
  ) into v_ya_encendido;

  select count(*) into v_count from public.exchange_groups
  where is_system and portion_system = 'cl';

  if v_ya_encendido then
    raise notice 'G: el set cl ya estaba ENCENDIDO al entrar a esta tx (13 vivos); se afirma 13 directo';
    if v_count <> 13 then
      raise exception 'SMOKE FALLO (G): set cl encendido pero authenticated conto % filas (esperado 13)', v_count;
    end if;
  elsif v_count <> 0 then
    raise exception 'SMOKE FALLO (G): set cl apagado pero authenticated ya ve % filas via xg_select (esperado 0)', v_count;
  end if;
end $$;

reset role;

-- Simula el encendido de W6.8 DENTRO de la tx (rol privilegiado; idempotente si
-- el set ya estaba encendido: deja deleted_at en null, que es lo que ya tenia).
update public.exchange_groups set deleted_at = null where is_system and portion_system = 'cl';

select set_config('request.jwt.claim.sub', (select coach_a::text from pc_coach_ctx), true);
set local role authenticated;

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.exchange_groups
  where is_system and portion_system = 'cl';
  if v_count <> 13 then
    raise exception 'SMOKE FALLO (G): tras el UPDATE authenticated conto % grupos cl (esperado 13)', v_count;
  end if;
  raise notice 'G OK: xg_select refleja 13 grupos cl con el set encendido';
end $$;

reset role;

rollback;
