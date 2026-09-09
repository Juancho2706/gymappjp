-- ============================================================================
-- EVA Nutricion V2 — «Porciones a la chilena» W0.1: SET de porciones.
-- SPEC: docs/specs/nutrition-porciones-chilenas/SPEC.md §3
-- ----------------------------------------------------------------------------
-- Por que existe. Los 9 grupos de intercambio del sistema (seed
-- _POST_DEPLOY_20260611093002:19-47) son la tabla SMAE mexicana, sembrada el
-- 2026-06-12 como PROVISORIA (`macros_confirmed = false`, comentario «validar con
-- la guia de Fran») y nunca validada. En Chile la porcion de carbohidratos es
-- 140 kcal / 30 g CHO (Tabla N.5, manual UDD 2019 = Jury 1999 modificada); la
-- app dice 70 / 15. Una nutricionista chilena lo reporto el 2026-09-08 y tres
-- coaches ya se crearon grupos propios a mano con los valores INTA.
-- Se adopta el set chileno como ESTANDAR sin romper a los 9 coaches que ya
-- prescribieron con SMAE: los dos sets conviven y se distinguen por esta columna.
--
-- Que hace. Dos columnas de clasificacion, ambas `not null default`, ambas
-- aditivas puras:
--   · exchange_groups.portion_system → a que set pertenece el grupo;
--   · coaches.portion_system         → que set ve el coach en el picker.
-- No toca indices (los tres unicos parciales son por `slug`, 20260611093001:63-72),
-- no toca CHECKs existentes, no toca ninguna policy (ninguna menciona columnas
-- fuera de deleted_at / is_system / coach_id / team_id).
--
-- Regla condensada (implementada en packages/nutrition-v2/exchange-visibility.ts):
--   visibles(coach) = custom del coach/team
--                   ∪ system con portion_system = coaches.portion_system
--                   ∪ (si tiene targets vivos en el OTRO set) ese set, marcado «Legado»
-- En este tren coaches.portion_system es 'cl' para TODOS (no hay backfill, R14-bis):
-- el segundo insumo lo da findUsedPortionSystemsForCoach (DATA §7.1), no la columna.
--
-- REGLA DURA, no cosmetica: esta columna filtra el CATALOGO OFRECIDO. Jamas la
-- resolucion de un exchange_group_id ya prescrito
-- (infrastructure/db/exchanges.repository.ts:112-128 findExchangeGroupsByIdsForTenant,
--  coach/nutrition-v2/_actions/plan-persistence.ts:359-412 resolveExchangeGroupsForDraft).
-- Filtrar ahi rompe los planes publicados con SMAE.
--
-- Notas de implementacion:
--   · Default 'smae' en exchange_groups: deja las 9 filas vigentes Y los 5 grupos
--     custom en el set legado sin un solo UPDATE. Los custom NO se filtran por esta
--     columna: su visibilidad la sigue decidiendo su dueno (policy xg_select,
--     20260611093001:166-173).
--   · Default 'cl' en coaches: TODOS quedan ahi. NO hay backfill a 'smae'
--     (R14-bis): los coaches con porciones SMAE vivas (9 por V2 al 08-09; hay que
--     sumar los de V1 con la query de W0.6) lo siguen viendo como «Legado»
--     porque findUsedPortionSystemsForCoach devuelve 'smae' mientras tengan
--     targets vivos, y el bloque se apaga SOLO al convertir (S1, sin ningun write).
--     La columna queda sembrada como preferencia futura y sin UI en este tren; el
--     grant de UPDATE se deja puesto para no volver a tocar DDL cuando exista.
--   · GRANTS: `exchange_groups` tiene grants a nivel de TABLA (20260611093001:148-150),
--     la columna nueva queda cubierta sin re-grant. `coaches` NO: ahi los UPDATE son
--     por columna, asi que hay `grant update (portion_system)` explicito — mismo
--     patron que `coaches.persona` (20260822002122_onboarding_v2_persona_demo.sql:49).
--   · Sin indice: el catalogo tiene ~22 filas system+custom. Un indice parcial sobre
--     22 filas no aporta y suma superficie al advisor.
-- ============================================================================

alter table public.exchange_groups
  add column if not exists portion_system text not null default 'smae';

do $do$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.exchange_groups'::regclass
      and conname = 'exchange_groups_portion_system_check'
  ) then
    alter table public.exchange_groups
      add constraint exchange_groups_portion_system_check
        check (portion_system in ('smae', 'cl'));
  end if;
end;
$do$;

comment on column public.exchange_groups.portion_system is
  'Set de porciones del grupo: smae (los 9 grupos provisorios del seed V1, legado) '
  'o cl (set chileno INTA 1999 / UDD 2019, Tabla N.5). Filtra el CATALOGO OFRECIDO '
  'al coach; JAMAS la resolucion de un exchange_group_id ya prescrito. Los grupos '
  'custom quedan en el default smae y no se filtran por esta columna.';

alter table public.coaches
  add column if not exists portion_system text not null default 'cl';

do $do$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.coaches'::regclass
      and conname = 'coaches_portion_system_check'
  ) then
    alter table public.coaches
      add constraint coaches_portion_system_check
        check (portion_system in ('cl', 'smae'));
  end if;
end;
$do$;

grant update (portion_system) on public.coaches to authenticated;

comment on column public.coaches.portion_system is
  'Set de porciones que ve el coach en el picker: cl (chileno, default) o smae '
  '(legado). Ademas del suyo ve el otro set marcado «Legado» mientras tenga '
  'targets vivos en el; cuando convierte todos sus planes, el legado desaparece '
  'solo, sin ningun write. En el tren de septiembre 2026 NADIE se mueve de cl '
  '(sin backfill): la columna queda como preferencia futura y sin UI.';
