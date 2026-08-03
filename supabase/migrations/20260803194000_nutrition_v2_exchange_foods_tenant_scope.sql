-- ============================================================================
-- EVA Nutricion V2 — equivalencias del sheet: alcance por tenant + orden por dueno
-- ----------------------------------------------------------------------------
-- Dos defectos VIVOS en `public.get_nutrition_today_v2` (bloque `exchangeFoods`,
-- introducido en 20260718150000:355-364 y arrastrado por 20260720120000):
--
-- B1 (PRIVACIDAD). El bloque filtra SOLO por `exchange_group_id`, sin ninguna
--    condicion de dueno. La funcion es SECURITY DEFINER, asi que pasa por encima
--    de RLS: cualquier alimento PRIVADO que un coach clasifique en un grupo del
--    sistema entra al sheet "1 porcion equivale a" de TODOS los alumnos de TODOS
--    los coaches que usan ese grupo. Verificado en LIVE 2026-08-03: 4 alimentos
--    de 3 cuentas de coach distintas visibles de forma cruzada.
--
-- B2 (FUNCIONAL). El cap `rn <= 40` ordena por nombre, y los grupos del sistema
--    tienen cientos de alimentos (Cereales: 715). El alimento propio del coach
--    entra solo si su nombre empieza por "A": 14 de 18 clasificaciones reales
--    quedaban invisibles incluso para el alumno de su propio coach.
--
-- Regla de tenant que aplica este parche (espejo de la visibilidad de `foods`):
--   · global   -> coach_id is null and org_id is null
--   · del coach del alumno -> f.coach_id = clients.coach_id
--   · de la org del alumno -> f.org_id  = clients.org_id
-- `foods` no tiene `team_id`; el scope de equipo viaja por `org_id`/coach.
--
-- Orden nuevo: propios del coach PRIMERO (`f.coach_id is null` ordena false<true),
-- despues el catalogo global, y recien ahi por nombre. Cap 40 -> 60.
--
-- FORMA DEL PARCHE: `create or replace` reconstruido desde la definicion VIVA
-- (`pg_get_functiondef`) con tres reemplazos exactos y asserts. Se hace asi, y no
-- copiando el cuerpo entero (17k caracteres), para NO arrastrar ni congelar el
-- resto de la funcion: cualquier cambio previo (media/category de 20260720120000,
-- gate de alumno bloqueado de 20260728123000) se conserva byte a byte. Si el texto
-- esperado no aparece EXACTAMENTE una vez, la migracion FALLA en voz alta en vez
-- de aplicar un parche silencioso a medias.
--
-- ADITIVA: misma firma, mismos grants, cero DDL de tablas, cero cambio de contrato
-- (el JSON `exchangeFoods` conserva su forma; solo cambia QUE filas trae).
--
-- ROLLBACK: re-aplicar el bloque original (filtro sin tenant, order by f.name,
-- cap 40) — o reaplicar 20260720120000 completa.
-- ============================================================================

do $do$
declare
  v_src text;
  v_out text;
  -- Concatenacion EXPLICITA con `||`: en un bloque plpgsql los literales adyacentes
  -- NO se concatenan solos (eso es sintaxis SQL, no plpgsql) y revientan el parser.
  v_filtro_viejo constant text :=
    E'      from public.foods f\n'
    || E'      where f.exchange_group_id = any(v_group_ids)\n'
    || E'        and f.exchange_portion_grams is not null\n';
  v_filtro_nuevo constant text :=
    E'      from public.foods f\n'
    || E'      where f.exchange_group_id = any(v_group_ids)\n'
    || E'        and f.exchange_portion_grams is not null\n'
    || E'        and (\n'
    || E'          (f.coach_id is null and f.org_id is null)\n'
    || E'          or f.coach_id = (select cl.coach_id from public.clients cl where cl.id = p_client_id)\n'
    || E'          or (f.org_id is not null\n'
    || E'              and f.org_id = (select cl.org_id from public.clients cl where cl.id = p_client_id))\n'
    || E'        )\n';
  v_orden_viejo constant text := 'order by f.name, f.id) as rn';
  v_orden_nuevo constant text := 'order by (f.coach_id is null), f.name, f.id) as rn';
  v_cap_viejo constant text := 'where ranked.rn <= 40;';
  v_cap_nuevo constant text := 'where ranked.rn <= 60;';
begin
  v_src := pg_get_functiondef('public.get_nutrition_today_v2(uuid,date,text)'::regprocedure);

  if (length(v_src) - length(replace(v_src, v_filtro_viejo, ''))) / length(v_filtro_viejo) <> 1 then
    raise exception 'exchange_foods_tenant_scope: el filtro de foods no aparece exactamente una vez (funcion ya parchada o cambiada)';
  end if;
  if (length(v_src) - length(replace(v_src, v_orden_viejo, ''))) / length(v_orden_viejo) <> 1 then
    raise exception 'exchange_foods_tenant_scope: el order by de equivalencias no aparece exactamente una vez';
  end if;
  if (length(v_src) - length(replace(v_src, v_cap_viejo, ''))) / length(v_cap_viejo) <> 1 then
    raise exception 'exchange_foods_tenant_scope: el cap rn <= 40 no aparece exactamente una vez';
  end if;

  v_out := replace(v_src, v_filtro_viejo, v_filtro_nuevo);
  v_out := replace(v_out, v_orden_viejo, v_orden_nuevo);
  v_out := replace(v_out, v_cap_viejo, v_cap_nuevo);

  execute v_out;
end
$do$;

-- Assert final: la definicion aplicada tiene las tres marcas nuevas y ninguna vieja.
do $do$
declare
  v_def text := pg_get_functiondef('public.get_nutrition_today_v2(uuid,date,text)'::regprocedure);
begin
  if position('(f.coach_id is null and f.org_id is null)' in v_def) = 0 then
    raise exception 'exchange_foods_tenant_scope: el filtro de tenant no quedo aplicado';
  end if;
  if position('order by (f.coach_id is null), f.name, f.id) as rn' in v_def) = 0 then
    raise exception 'exchange_foods_tenant_scope: el orden por dueno no quedo aplicado';
  end if;
  if position('where ranked.rn <= 60;' in v_def) = 0 then
    raise exception 'exchange_foods_tenant_scope: el cap 60 no quedo aplicado';
  end if;
  if position('where ranked.rn <= 40;' in v_def) > 0 then
    raise exception 'exchange_foods_tenant_scope: quedo un cap 40 sin reemplazar';
  end if;
end
$do$;
