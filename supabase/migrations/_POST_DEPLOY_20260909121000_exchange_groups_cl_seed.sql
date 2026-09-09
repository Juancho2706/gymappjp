-- ============================================================================
-- EVA Nutricion V2 — «Porciones a la chilena» W0.3 (_POST_DEPLOY_): siembra los
-- 13 grupos del SET CHILENO, APAGADOS. No toca coaches.
-- SPEC: docs/specs/nutrition-porciones-chilenas/SPEC.md §5
-- ----------------------------------------------------------------------------
-- CONVENCION _POST_DEPLOY_: NO entra al historial del CLI. Se corre A MANO por
-- MCP con service_role despues del deploy (las policies xg_insert/xg_update
-- niegan todo write con is_system = true a `authenticated`, 20260611093001:180,187).
-- Guardar SIN BOM (el seed V1 lo tiene y es un gotcha de PS 5.1).
--
-- Por que existe. Ver la cabecera de 20260909120000. Estos 13 son el set chileno:
-- nomenclatura y valores del manual UDD 2019 (Tabla N.5, «Jury 1999 modificada»),
-- mas «Scoop proteina» de EVA que no viene de ningun manual.
--
-- Que hace, en DOS bloques:
--   A) INSERT de los 13 grupos con UUID deterministas 0000e8c1-…-0000000000NN
--      (siguiente nibble al 0000e8c0 del seed V1; no-RFC, aceptados por los 4
--      bordes de validacion que usan z.guid(): contracts.ts:174-179,
--      read-models.ts:265-268 y :287-289, api/mobile/.../group-foods/route.ts:38-52),
--      con `deleted_at = now()`: nacen APAGADOS (R14-ter).
--   B) ASSERTS en voz alta (patron del seed V1 :151-171).
--
-- LO QUE ESTE ARCHIVO YA NO HACE (R14-bis): NO backfillea coaches a 'smae'.
-- Nadie se mueve del default 'cl'. El coach que ya prescribe en SMAE lo sigue
-- viendo como «Legado» porque findUsedPortionSystemsForCoach (DATA §7.1) devuelve
-- 'smae' mientras tenga targets vivos (V2 o V1), y el bloque se apaga SOLO cuando
-- termina de convertir: S1 literal, sin un solo write sobre `coaches`.
--
-- APAGADOS AL NACER, y por que (R14-ter). `xg_select` exige `deleted_at is null`
-- (20260611093001:166-173): con los 13 vivos desde W0 y sin el filtro de
-- visibilidad desplegado, los 106 coaches verian 22 filas mezcladas en el picker
-- durante toda la ventana W0 → deploy. Se encienden en W6.8 por MCP, despues del
-- deploy READY y de las dos OTAs:
--   update public.exchange_groups set deleted_at = null, updated_at = now()
--    where is_system and portion_system = 'cl' and deleted_at is not null;
-- El script de equivalencias (§4) resuelve los 13 destinos SIN exigir
-- `deleted_at is null`, asi que puede correr con el set apagado.
--
-- macros_confirmed = TRUE en los 13, y es deliberado (R8):
--   · los valores SI estan validados — manual UDD 2019, Tabla N.5;
--   · desaparece el badge «macros referenciales» (hasUnconfirmedMacros,
--     packages/nutrition-engine/exchange-calc.ts:171-180);
--   · y sobre todo: el `WHERE exchange_groups.macros_confirmed = false` del seed V1
--     (_POST_DEPLOY_20260611093002:47) NUNCA los pisa aunque alguien lo re-corra.
--
-- composed_of = NULL en los 13 (D5): en el set chileno «Legumbres secas» es un
-- grupo SIMPLE de 170 kcal, no un compuesto como el LEG del SMAE (que hoy tiene
-- ref_* = 0 y por eso el picker imprime «1 porcion ≈ 0 kcal»).
--
-- color explicito de EXCHANGE_GROUP_PALETTE (packages/schemas/nutrition-exchanges.ts:108-118):
-- necesario porque el fallback por sortOrder % 9 (exchange-calc.ts:195-199) daria
-- colores casi repetidos con estos sort_order.
--
-- sort_order 210-330: el set chileno va DESPUES del SMAE (10-90) en la columna.
-- El orden que ve el coach lo decide TypeScript (set propio primero, R4), no la DB:
-- nunca se re-numera el SMAE con un UPDATE, porque el ON CONFLICT DO UPDATE del
-- seed V1 (:43,:47) lo revertiria si alguien lo re-corre.
-- ============================================================================

-- ── A) Los 13 grupos del set chileno ────────────────────────────────────────
insert into public.exchange_groups
  (id, slug, code, name, is_system, coach_id, team_id, portion_system,
   ref_calories, ref_protein_g, ref_carbs_g, ref_fats_g,
   sort_order, color, composed_of, macros_confirmed, deleted_at)
values
  ('0000e8c1-0000-0000-0000-000000000001', 'cl-lacteos-descremados',      'LD',
   'Lácteos descremados',          true, null, null, 'cl',  70,  7, 10,   0, 210, '#3B82F6', null, true, now()),
  ('0000e8c1-0000-0000-0000-000000000002', 'cl-lacteos-semidescremados',  'LS',
   'Lácteos semidescremados',      true, null, null, 'cl',  85,  5,  9,   3, 220, '#3B82F6', null, true, now()),
  ('0000e8c1-0000-0000-0000-000000000003', 'cl-lacteos-enteros',          'LE',
   'Lácteos enteros',              true, null, null, 'cl', 110,  5,  9,   6, 230, '#3B82F6', null, true, now()),
  ('0000e8c1-0000-0000-0000-000000000004', 'cl-carnes-bajas-grasa',       'CB',
   'Carnes bajas en grasa',        true, null, null, 'cl',  65, 11,  1,   2, 240, '#EF4444', null, true, now()),
  ('0000e8c1-0000-0000-0000-000000000005', 'cl-carnes-altas-grasa',       'CA',
   'Carnes altas en grasa',        true, null, null, 'cl', 120, 11,  1,   8, 250, '#EF4444', null, true, now()),
  ('0000e8c1-0000-0000-0000-000000000006', 'cl-legumbres-secas',          'LGS',
   'Legumbres secas',              true, null, null, 'cl', 170, 11, 30,   1, 260, '#8B5CF6', null, true, now()),
  ('0000e8c1-0000-0000-0000-000000000007', 'cl-verduras-generales',       'VG',
   'Verduras generales',           true, null, null, 'cl',  25,  2,  5,   0, 270, '#22C55E', null, true, now()),
  ('0000e8c1-0000-0000-0000-000000000008', 'cl-verduras-libre-consumo',   'VL',
   'Verduras de libre consumo',    true, null, null, 'cl',  10,  0,  2.5, 0, 280, '#22C55E', null, true, now()),
  ('0000e8c1-0000-0000-0000-000000000009', 'cl-frutas',                   'FR',
   'Frutas',                       true, null, null, 'cl',  60,  0, 15,   0, 290, '#EC4899', null, true, now()),
  ('0000e8c1-0000-0000-0000-000000000010', 'cl-panes-cereales-tuberculos','PCT',
   'Panes, cereales y tubérculos', true, null, null, 'cl', 140,  3, 30,   1, 300, '#F59E0B', null, true, now()),
  ('0000e8c1-0000-0000-0000-000000000011', 'cl-aceites-y-grasas',         'AG',
   'Aceites y grasas',             true, null, null, 'cl',  45,  0,  0,   5, 310, '#F97316', null, true, now()),
  ('0000e8c1-0000-0000-0000-000000000012', 'cl-azucares',                 'AZ',
   'Azúcares',                     true, null, null, 'cl',  20,  0,  5,   0, 320, '#6366F1', null, true, now()),
  ('0000e8c1-0000-0000-0000-000000000013', 'cl-scoop-proteina',           'SCP',
   'Scoop proteína',               true, null, null, 'cl', 120, 24,  2,   1, 330, '#14B8A6', null, true, now())
on conflict (id) do update set
  slug          = excluded.slug,
  code          = excluded.code,
  name          = excluded.name,
  is_system     = true,
  coach_id      = null,
  team_id       = null,
  ref_calories  = excluded.ref_calories,
  ref_protein_g = excluded.ref_protein_g,
  ref_carbs_g   = excluded.ref_carbs_g,
  ref_fats_g    = excluded.ref_fats_g,
  sort_order    = excluded.sort_order,
  color         = excluded.color,
  composed_of   = null,
  updated_at    = now()
where exchange_groups.macros_confirmed = false;
-- ↑ Con macros_confirmed = true el DO UPDATE NUNCA dispara: el seed es
--   re-ejecutable y NO pisa nada (T-04). `portion_system` deliberadamente NO
--   esta en el SET: re-correr el seed jamas debe mover un grupo de set.
--   `macros_confirmed` tampoco: si el owner alguna vez lo baja a mano, el seed
--   no se lo vuelve a subir sin que alguien lo decida.
--   `deleted_at` TAMPOCO esta en el SET (R14-ter): si el seed se re-corre DESPUES
--   del encendido de W6.8, no debe volver a apagar el set; y si se re-corre antes,
--   las filas ya nacieron apagadas por el INSERT.

-- ── B) Asserts en voz alta ───────────────────────────────────────────────────
-- (Aca iba el BACKFILL de coaches. Se elimina: R14-bis, nadie se mueve de 'cl'.)
do $$
declare
  v_cl        int;
  v_cl_vivos  int;
  v_dup       int;
  v_composed  int;
begin
  -- Los 13 existen (sin filtro de deleted_at: nacen apagados).
  select count(*) into v_cl
  from public.exchange_groups
  where is_system and portion_system = 'cl';
  if v_cl <> 13 then
    raise exception 'seed cl: hay % grupos chilenos (esperado 13)', v_cl;
  end if;

  -- Y los 13 estan APAGADOS (R14-ter). Si alguno quedo vivo antes del deploy con
  -- el filtro, el picker de los 106 coaches muestra 22 filas mezcladas.
  select count(*) into v_cl_vivos
  from public.exchange_groups
  where is_system and portion_system = 'cl' and deleted_at is null;
  if v_cl_vivos <> 0 then
    raise exception 'seed cl: % grupos chilenos quedaron VIVOS; el set se enciende recien en W6.8', v_cl_vivos;
  end if;

  -- T-02: dos grupos del sistema con el mismo `code` rompen 5 caminos de codigo.
  -- SIN filtro de deleted_at, a proposito: el indice unico de §2 es parcial
  -- (`where is_system and deleted_at is null`) y con el set apagado NO protege
  -- nada. Este assert es el que cuida la ventana W0 → W6.8, y se vuelve a correr
  -- en el encendido de W6.8 (§0), esa vez ya con el indice cubriendo.
  select count(*) into v_dup from (
    select code
    from public.exchange_groups
    where is_system
    group by code
    having count(*) > 1
  ) d;
  if v_dup > 0 then
    raise exception 'seed cl: % codigos duplicados entre grupos del sistema', v_dup;
  end if;

  -- D5: en el set chileno NINGUN grupo es compuesto.
  select count(*) into v_composed
  from public.exchange_groups
  where portion_system = 'cl' and composed_of is not null;
  if v_composed > 0 then
    raise exception 'seed cl: % grupos chilenos quedaron con composed_of', v_composed;
  end if;

  -- Los 9 SMAE siguen vivos e intactos (S9: nada se borra).
  if (select count(*) from public.exchange_groups
      where is_system and deleted_at is null and portion_system = 'smae') <> 9 then
    raise exception 'seed cl: el set SMAE dejo de tener 9 grupos vivos';
  end if;

  -- Nadie fue movido de set (R14-bis): este archivo no escribe en `coaches`. Se
  -- informa el conteo, no se aborta: si algun dia existe la UI de preferencia, un
  -- coach en 'smae' es legitimo y no puede romper un re-run del seed.
  raise notice 'seed cl: coaches fuera de cl = % (esperado 0 en este tren)',
    (select count(*) from public.coaches where portion_system <> 'cl');

  raise notice 'seed cl OK: 13 grupos chilenos APAGADOS, 9 SMAE intactos, 0 codigos duplicados, 0 coaches movidos';
end $$;
