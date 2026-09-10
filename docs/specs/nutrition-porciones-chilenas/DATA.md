---
status: done
owner: product-engineering
last_verified: "2026-09-10"
canonical: false
---

# DATA — «Porciones a la chilena» — diseño técnico de datos y motor

Diseño **copiable**: SQL y TypeScript de verdad, no prosa. Manda el OUTLINE (§13 nombres canónicos, §12 waves).
Todo lo del repo va con `archivo:línea` verificado contra `HEAD f93378c3` (rama `rnmobiledenuevo`, working tree limpio).
Repo en **solo lectura**: este documento describe lo que hay que escribir; no se escribió nada en `D:\Proyectos\Antigravity\gymappjp`.

## 0. Alcance, orden de aplicación y reglas duras

| # | Artefacto (nombre canónico OUTLINE §13) | Wave | Cómo se aplica |
|---|---|---|---|
| 1 | `supabase/migrations/20260909120000_exchange_groups_portion_system.sql` | W0 | migración normal (CLI) + MCP en LIVE tras EXPLAIN + tx-rollback |
| 2 | `supabase/migrations/20260909120500_exchange_groups_no_duplicate_system_code.sql` | W0 | ídem, **después** de la verificación previa de 0 duplicados |
| 3 | `supabase/migrations/_POST_DEPLOY_20260909121000_exchange_groups_cl_seed.sql` | W0 | a mano por MCP con service role (patrón `_POST_DEPLOY_20260611093002`). **Siembra los 13 APAGADOS** (`deleted_at = now()`, R14-ter) |
| 4 | `supabase/migrations/_POST_DEPLOY_20260909121000_exchange_groups_cl_seed_rollback.sql` | W0 | vuelta al estado «apagado» **solo si nadie los usa** (§3.4); si hay targets chilenos vivos, `raise exception` y el rollback es de código |
| 5 | `scripts/nutrition-portions-cl/derive-cl-equivalences.mjs` | W0 | `--dry-run` → informe → OK del owner → `--apply` |
| 6 | `scripts/nutrition-portions-cl/generic-foods-cl.json` | W0 | input del script (paso «curados») |
| 7 | `packages/nutrition-v2/exchange-visibility.ts` | W1 (tarea W1.4) | código; acá nacen `systemOf` **e `isClGroup(group, coachSystem)`** (X-07) |
| 8 | `packages/nutrition-v2/exchange-conversion.ts` | W3 | código |
| 9 | `supabase/migrations/20260909130000_nutrition_today_v2_exchange_foods_media_generic.sql` | W5 | parche **por texto** sobre `pg_get_functiondef` |

**Encendido del set (R14-ter), que no es un archivo nuevo:** el `_POST_DEPLOY_` de W0 deja los 13 con `deleted_at = now()`, así que `xg_select` (`20260611093001_nutrition_exchanges.sql:166-173`) no se los devuelve a nadie. Se encienden en **W6.8**, por MCP, después del deploy READY y de las dos OTAs:

```sql
update public.exchange_groups
   set deleted_at = null, updated_at = now()
 where is_system and portion_system = 'cl' and deleted_at is not null;
-- Verificación inmediata: 22 grupos del sistema vivos (9 SMAE + 13 cl).
select count(*) from public.exchange_groups where is_system and deleted_at is null;  -- 22
```

Sin ese orden, los 106 coaches verían 22 filas mezcladas en el picker durante toda la ventana entre W0 y el deploy que trae el filtro de visibilidad. SPEC, PLAN y TASKS dicen exactamente esto.

Reglas que ninguna pieza de acá puede romper:

- **DB aditiva, forward-only.** Nada de `drop column`, `drop constraint`, ni `delete` sobre grupos: `nutrition_slot_exchange_targets_v2.exchange_group_id` es `on delete restrict` (`20260718140000_nutrition_portions_v2.sql:36`) y `foods.exchange_group_id` no declara `ON DELETE` (`20260611093001_nutrition_exchanges.sql:80`) ⇒ NO ACTION. Rollback (§3.4, R-01 + S-02) = **volver al estado apagado** (`deleted_at = now()` sobre los 13) **solo si ningún target ni borrador los referencia**; si alguno los referencia, el rollback **aborta con `raise exception`** y la vuelta atrás es de código (revertir deploy y OTA): `deleted_at` sobre un grupo ya prescrito deja el borrador irrepublicable (T-08).
- **No hay backfill de coaches** (R14-bis). Todos quedan en `portion_system = 'cl'` (el default de la columna) y el rollback **no toca `coaches`**. El SMAE se ofrece como «Legado» mientras `findUsedPortionSystemsForCoach` (§7.1) lo devuelva, y desaparece solo cuando el coach termina de convertir — S1 literal, sin un solo write. `coaches.portion_system` queda sembrada como preferencia futura, **sin UI en este tren**.
- **El filtro de set aplica al CATÁLOGO OFRECIDO, jamás a la RESOLUCIÓN de un id ya prescrito** (T-01), y dentro de eso **solo en los bordes de presentación**, nunca en el servicio (R13 + S-01). Ver §7.3.
- **Los 13 códigos chilenos son nuevos** (`LD LS LE CB CA LGS VG VL FR PCT AG AZ SCP`) y no colisionan con los 9 SMAE (`C P F V LAC ARL SP G LEG`). El `code` es llave semántica de facto en 5 caminos (`plan-persistence.ts:399-404` con `.maybeSingle()`, `exchange-calc.ts:38-41`, `editor-state.ts:589-598`, `demo-writers.ts:586-592`, mapas por code de `20260718150000:212-226`) — T-02.
- **`get_nutrition_today_v2` se parchea por texto sobre la definición VIVA.** Un copy-body de la última definición completa del repo (`20260720120000:343-370`) revertiría la fuga cross-tenant B1 que cerró `20260803194000`.
- **Windows / PS 5.1**: los `.sql` y `.mjs` nuevos se guardan **sin BOM** (el seed V1 `_POST_DEPLOY_20260611093002` tiene BOM en la primera línea y es un gotcha vivo). `docs:check` (`scripts/check-docs.mjs:157-291`) rechaza `process.env.X || 'literal'`: el script de §4 lee env **sin fallback**.

---

## 1. `20260909120000_exchange_groups_portion_system.sql`

Base: r1 §7.1. Aplica R1 (macro clave documentada), T-01 (comentario que fija la regla del filtro), T-03 (nada de grants nuevos sobre `exchange_groups`).

```sql
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
```

Verificación posterior (MCP, después del apply real):

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where (table_schema, table_name, column_name) in
      (('public','exchange_groups','portion_system'), ('public','coaches','portion_system'));
-- Esperado: 2 filas, text, NO, 'smae'::text / 'cl'::text

select conname, pg_get_constraintdef(oid)
from pg_catalog.pg_constraint
where conname in ('exchange_groups_portion_system_check','coaches_portion_system_check');
-- Esperado: 2 CHECKs con IN ('smae','cl') / IN ('cl','smae')

select grantee, privilege_type, column_name
from information_schema.column_privileges
where table_name = 'coaches' and column_name = 'portion_system';
-- Esperado: al menos authenticated / UPDATE
```

---

## 2. `20260909120500_exchange_groups_no_duplicate_system_code.sql`

### 2.1 Query de verificación PREVIA (obligatoria, debe dar 0 filas)

```sql
-- Si esto devuelve filas, el CREATE UNIQUE INDEX falla y ademas hay un bug vivo:
-- plan-persistence.ts:397-404 hace .eq('code', code).eq('is_system', true).maybeSingle()
-- y revienta con PGRST116 «multiple rows» al publicar un plan con grupo compuesto.
select code, count(*) as n, array_agg(id order by created_at) as ids
from public.exchange_groups
where is_system and deleted_at is null
group by code
having count(*) > 1;
```

### 2.2 La migración

```sql
-- ============================================================================
-- EVA Nutricion V2 — «Porciones a la chilena» W0.2: un solo grupo del sistema
-- por `code` vivo.
-- SPEC: docs/specs/nutrition-porciones-chilenas/SPEC.md §11 (T-02)
-- ----------------------------------------------------------------------------
-- Por que existe. `exchange_groups.code` no tiene UNIQUE (los tres unicos
-- parciales de 20260611093001:63-68 son por `slug`), pero es la llave SEMANTICA
-- de facto en cinco caminos de codigo que rompen o mienten si dos grupos del
-- sistema comparten codigo:
--   1. plan-persistence.ts:397-404 — resolver la base de un composed_of con
--      .maybeSingle() ⇒ error duro PGRST116 al PUBLICAR;
--   2. packages/nutrition-engine/exchange-calc.ts:38-41 findByCode;
--   3. packages/nutrition-v2/editor-state.ts:589-598 refByCode;
--   4. apps/web/src/services/onboarding/demo-writers.ts:586-592 groupByCode
--      (.in('code', ...).eq('is_system', true));
--   5. los mapas por code de get_nutrition_today_v2 (20260718150000:212-226), cuyo
--      propio comentario (:206-211) ya advertia el riesgo.
-- Al sembrar 13 grupos del sistema nuevos, la probabilidad de colision deja de
-- ser teorica. Este indice la convierte en un 23505 al escribir, no en un plan
-- que no se puede publicar.
--
-- Que hace. Un indice unico PARCIAL sobre los grupos del sistema vivos. No toca
-- grupos custom (un coach puede seguir teniendo su propio 'FR'), ni grupos
-- soft-borrados (un set retirado con deleted_at no bloquea el alta de otro).
--
-- ADITIVA: sin DDL destructiva. Rollback trivial:
--   drop index if exists public.exchange_groups_system_code_uq;
-- ============================================================================

create unique index if not exists exchange_groups_system_code_uq
  on public.exchange_groups (code)
  where is_system and deleted_at is null;
```

---

## 3. `_POST_DEPLOY_20260909121000_exchange_groups_cl_seed.sql`

13 filas = tabla OUTLINE §5.1 completa. Valores = Tabla N.º 5 del manual UDD 2019 (pp. 25 y 51), verificados página a página en las láminas del manual (§5.1 de este documento). `SCP` es de EVA (S3), no del manual.

```sql
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
```

### 3.4 Rollback — `_POST_DEPLOY_20260909121000_exchange_groups_cl_seed_rollback.sql`

**Qué NO hace este archivo, y por qué (R-01 + S-02).**

1. **No toca `coaches.portion_system`.** No hay a quién devolver: nadie fue backfilleado (R14-bis), todos están en `'cl'` desde el default de la columna. La versión anterior mandaba los 106 coaches a `'smae'` sin acotar, lo que dejaba a los 97 que nunca usaron porciones viendo el set legado de forma permanente — el estado exacto que el tren viene a arreglar.
2. **No borra de verdad.** `nutrition_slot_exchange_targets_v2.exchange_group_id … on delete restrict` (`20260718140000:36`) y `foods.exchange_group_id` sin `ON DELETE` (`20260611093001:80`, NO ACTION) hacen fallar el `DELETE` con 23503. Los planes publicados leen los `snapshot_*` congelados (`20260718140000:44-53`), así que su significado no cambia con el catálogo.
3. **No borra `exchange_group_foods`.** Las equivalencias del set chileno son **inertes** si el grupo no se ofrece. Borrarlas solo obliga a re-correr el script (30–40 min de dry-run + OK del owner) para volver.

**Lo que sí hace, en DOS RAMAS excluyentes.** La bisagra es una sola pregunta: *¿alguien ya prescribió con un grupo chileno?*

- **Rama (a) — nadie los usa ⇒ volver al estado «apagado» de W0.** `update public.exchange_groups set deleted_at = now() where portion_system = 'cl'`. Es exactamente el estado en que nacieron (R14-ter): el set desaparece del picker sin romper nada, y volver a encenderlo es el `update` de §0.
- **Rama (b) — hay targets o borradores chilenos ⇒ el archivo ABORTA.** `deleted_at` sobre un grupo ya prescrito rompe producción: `xg_select` exige `deleted_at is null` (`20260611093001:166-173`) y el paso 1 de `resolveExchangeGroupsForDraft` (`plan-persistence.ts:369-382`) resuelve **cada id del borrador** con `.eq('id', id).maybeSingle()` y **falla cerrado** con `EXCHANGE_GROUP_NOT_FOUND` (`:376-381`) ⇒ **todo borrador con un target chileno queda imposible de publicar**, y como el grupo tampoco está en el picker, el coach ni siquiera puede quitarlo para desbloquearse. En esa rama la vuelta atrás es **de código**: revertir el deploy y las OTAs. Sin el filtro de visibilidad desplegado los 22 grupos se ven mezclados en el picker — feo, no roto — y ningún plan queda trabado.

```sql
-- ============================================================================
-- ROLLBACK de _POST_DEPLOY_20260909121000. DOS RAMAS (R-01 + S-02).
--
-- LO QUE NO HACE:
--   · NO toca coaches.portion_system: nadie fue backfilleado (R14-bis).
--   · NO borra los grupos: FK on delete restrict (20260718140000:36) + NO ACTION
--     desde foods (20260611093001:80), y los planes publicados leen snapshots.
--   · NO borra exchange_group_foods: son filas inertes si el grupo no se ofrece.
--   · NO pone deleted_at si algun target o borrador ya usa un grupo chileno: eso
--     deja el borrador IMPOSIBLE DE PUBLICAR (resolveExchangeGroupsForDraft falla
--     cerrado con EXCHANGE_GROUP_NOT_FOUND) y sin forma de sacarlo del plan.
-- ============================================================================

do $$
declare
  v_targets int;
  v_drafts  int;
begin
  select count(*) into v_targets
  from public.nutrition_slot_exchange_targets_v2 t
  join public.exchange_groups g on g.id = t.exchange_group_id
  where g.portion_system = 'cl';

  select count(distinct v.id) into v_drafts
  from public.nutrition_plan_versions_v2 v
  join public.nutrition_slot_exchange_targets_v2 t on t.version_id = v.id
  join public.exchange_groups g on g.id = t.exchange_group_id
  where g.portion_system = 'cl' and v.status <> 'published';

  if v_targets > 0 or v_drafts > 0 then
    -- ── RAMA (b) ──────────────────────────────────────────────────────────────
    raise exception
      'rollback cl: hay % targets chilenos vivos en % borradores. NO se apaga el set: dejaria esos borradores impublicables (S-02). El rollback de este estado es de CODIGO: revertir deploy + OTAs.',
      v_targets, v_drafts;
  end if;

  -- ── RAMA (a): nadie los usa ⇒ volver al estado apagado de W0 ───────────────
  update public.exchange_groups
     set deleted_at = now(), updated_at = now()
   where is_system and portion_system = 'cl' and deleted_at is null;

  raise notice 'rollback cl OK: set apagado (13 grupos con deleted_at), 0 targets afectados, equivalencias y coaches intactos';
end $$;

-- ASSERT final: el SMAE sigue completo y nadie se movio de set.
do $$
begin
  if (select count(*) from public.exchange_groups
      where is_system and deleted_at is null and portion_system = 'smae') <> 9 then
    raise exception 'rollback cl: el set SMAE dejo de tener 9 grupos vivos';
  end if;
  if (select count(*) from public.exchange_groups
      where is_system and deleted_at is null and portion_system = 'cl') > 0 then
    raise exception 'rollback cl: quedaron grupos chilenos vivos';
  end if;
  raise notice 'rollback cl: 9 SMAE vivos, 0 cl vivos, coaches sin tocar';
end $$;
```

**Vuelta de la vuelta.** No hace falta un `_restore.sql`: encender de nuevo es el mismo `update` del encendido de W6.8 (§0), una sola columna. Queda escrito acá, comentado, para que nadie invente un archivo nuevo:

```sql
-- ── RE-ENCENDIDO (comentado; es el mismo update de W6.8, §0) ────────────────
-- update public.exchange_groups
--    set deleted_at = null, updated_at = now()
--  where is_system and portion_system = 'cl' and deleted_at is not null;
-- select count(*) from public.exchange_groups where is_system and deleted_at is null;  -- 22
```

**Tarea ligada en W1 (R1):** el paso 2 de `resolveExchangeGroupsForDraft` (`plan-persistence.ts:396-404`) resuelve el grupo base de un `composed_of` con `.eq('code', code).eq('is_system', true).maybeSingle()` **sin `.is('deleted_at', null)`**. Hoy lo tapa la RLS (`xg_select` ya filtra), pero el día que ese camino corra con `service_role` un grupo retirado vuelve a resolver — y con el set chileno **apagado** entre W0 y W6.8 ese camino es exactamente el que podría resolver un grupo que nadie ve. Se agrega el filtro explícito, un cinturón de una línea.

Rollback de las migraciones 1 y 2:

```sql
-- 20260909120500: reversible sin datos.
drop index if exists public.exchange_groups_system_code_uq;

-- 20260909120000: NO se droppean las columnas. Son NOT NULL DEFAULT, nadie mas
-- las lee, y `drop column` sobre `coaches` en LIVE es DDL destructiva (prohibida
-- por AGENTS.md). El rollback funcional es dejar de filtrar por ellas en el codigo.
```

### 3.5 EXPLAIN + tx-rollback ANTES de escribir en LIVE

Protocolo aditivo-en-LIVE (`AGENTS.md:127-140`). Todo dentro de una transacción que termina en `rollback`.

```sql
begin;

-- 1) DDL de §1 y §2 completas aqui (copiadas tal cual).
-- 2) El bloque A del seed de §3 completo (13 filas, con deleted_at = now()).
--    Para el EXPLAIN 3) y el 4) se simula el estado POST-W6.8 con un
--    `update … set deleted_at = null where portion_system = 'cl'` DENTRO de la
--    transaccion: lo que interesa medir es el picker con 22 filas, no con 9.

-- 3) Camino del picker del coach (exchanges.repository.ts:89-104) con el set nuevo.
explain (analyze, buffers, format text)
select id, slug, code, name, coach_id, team_id, is_system, ref_calories,
       ref_protein_g, ref_carbs_g, ref_fats_g, color, sort_order,
       composed_of, macros_confirmed, portion_system
from public.exchange_groups
where deleted_at is null
  and (is_system or coach_id = '<coach-uuid>')
order by sort_order, code;
-- Esperado: Seq Scan sobre ~35 filas, < 1 ms. NO se justifica indice nuevo.

-- 4) Camino del freeze POR CODIGO (el que revienta con codes duplicados).
explain (analyze, buffers)
select id, code from public.exchange_groups
where code = 'PCT' and is_system = true and deleted_at is null;
-- Esperado: exactamente 1 fila con el set encendido (0 antes del seed y 0 mientras
-- el set este apagado, porque este camino filtra deleted_at). Con el indice de §2
-- deberia usar exchange_groups_system_code_uq.

-- 5) Camino del sheet del alumno (exchange_group_foods por grupo).
explain (analyze, buffers)
select egf.food_id, egf.portion_grams, egf.portion_label
from public.exchange_group_foods egf
where egf.exchange_group_id = '0000e8c1-0000-0000-0000-000000000010'
  and egf.coach_id is null and egf.org_id is null;
-- Esperado: Index Scan usando egf_group_food_owner_uq.

-- 6) EL CAMINO NUEVO POR REQUEST: findUsedPortionSystemsForCoach (§7.1), exigido
--    por R14. Corre en CADA apertura del picker, en los dos bordes de
--    presentacion, asi que su plan se mide ACA y no despues. Las dos ramas (V2 y
--    V1, S-04) van en el mismo `exists` porque asi va en el repo.
explain (analyze, buffers, format text)
select distinct g.portion_system
from public.exchange_groups g
where exists (
    select 1
    from public.nutrition_slot_exchange_targets_v2 t
    join public.nutrition_plan_versions_v2 v on v.id = t.version_id
    join public.nutrition_plans_v2 p         on p.id = v.plan_id
    where t.exchange_group_id = g.id
      and p.coach_id = '<coach-uuid>'
      and p.lifecycle_status <> 'archived'
      and (v.id = p.current_published_version_id or v.status <> 'published')
) or exists (
    select 1
    from public.meal_exchange_targets mt
    join public.nutrition_meals m  on m.id = mt.meal_id
    join public.nutrition_plans np on np.id = m.plan_id
    where mt.exchange_group_id = g.id
      and np.coach_id = '<coach-uuid>'
)
limit 2;
-- Se corre con DOS coaches: uno de los 9 con targets SMAE (peor caso, devuelve 1-2
-- filas) y uno de los 97 sin porciones (devuelve 0). Esperado: < 5 ms con los
-- volumenes de STATS. Si el plan muestra un scan caro sobre
-- nutrition_slot_exchange_targets_v2, se anota el indice candidato
-- (exchange_group_id) en TASKS y se decide con el numero, nunca por adivinanza.
-- El `limit 2` es del repo: solo interesa saber CUALES de los dos sets aparecen.

-- 6b) Cuantos coaches devolverian 'smae' hoy. Ya NO mueve a nadie (R14-bis: no hay
--     backfill); es el tamano de la audiencia del bloque «Legado» y del aviso
--     in-app, y el numero que se pega en TASKS. LAS DOS RAMAS POR SEPARADO Y
--     JUNTAS: el «9» de STATS solo contaba V2.
with v2 as (
  select distinct p.coach_id
  from public.nutrition_slot_exchange_targets_v2 t
  join public.nutrition_plan_versions_v2 v on v.id = t.version_id
  join public.nutrition_plans_v2 p         on p.id = v.plan_id
  join public.exchange_groups g            on g.id = t.exchange_group_id
  where g.portion_system = 'smae'
    and p.lifecycle_status <> 'archived'
    and (v.id = p.current_published_version_id or v.status <> 'published')
), v1 as (
  select distinct np.coach_id
  from public.meal_exchange_targets mt
  join public.nutrition_meals m  on m.id = mt.meal_id
  join public.nutrition_plans np on np.id = m.plan_id
  join public.exchange_groups g  on g.id = mt.exchange_group_id
  where g.portion_system = 'smae'
)
select (select count(*) from v2)                          as solo_v2,
       (select count(*) from v1)                          as solo_v1,
       (select count(*) from (select coach_id from v2 union select coach_id from v1) u) as con_legado;
-- Esperado: solo_v2 ≈ 9 (STATS). `con_legado` es el numero que manda para el aviso
-- in-app del OUTLINE §10 y para la lista de destinatarios del banner M2.
--
-- Mismo conteo con la ventana AMPLIA (cualquier version, incluidos planes
-- archivados), para saber cuanto pesa la ventana estrecha de §7.1:
select count(distinct p.coach_id) filter (
         where p.lifecycle_status <> 'archived'
           and (v.id = p.current_published_version_id or v.status <> 'published')) as ventana_estrecha,
       count(distinct p.coach_id)                                                  as cualquier_version
from public.nutrition_slot_exchange_targets_v2 t
join public.nutrition_plan_versions_v2 v on v.id = t.version_id
join public.nutrition_plans_v2 p         on p.id = v.plan_id
join public.exchange_groups g            on g.id = t.exchange_group_id
where g.portion_system = 'smae';
-- Si los dos numeros difieren, el owner decide antes de W1 (y el criterio elegido
-- se copia IDENTICO a findUsedPortionSystemsForCoach y al caso D del test §10.1).


-- 7) Prueba sintetica del invariante nuevo: un segundo grupo system con code 'FR'
--    debe fallar con 23505 despues de §2. Se corre con el set ENCENDIDO (el
--    update simulado del punto 2): el indice es parcial `deleted_at is null`, asi
--    que con el set apagado este insert PASA y no prueba nada.
savepoint sp_dup;
insert into public.exchange_groups (slug, code, name, is_system, ref_calories)
values ('cl-frutas-dup', 'FR', 'Frutas duplicado', true, 60);
-- Esperado: ERROR duplicate key value violates unique constraint
--           "exchange_groups_system_code_uq"
rollback to savepoint sp_dup;

rollback;
```

Después del apply real de W0: `mcp supabase get_advisors` (security + performance) y

```sql
select count(*) from public.exchange_groups where is_system and deleted_at is null;   -- 9  (el set cl nace apagado)
select count(*) from public.exchange_groups where is_system and portion_system = 'cl'; -- 13
```

Después del **encendido de W6.8** (§0), la misma primera consulta debe dar **22**.

---

## 4. `scripts/nutrition-portions-cl/derive-cl-equivalences.mjs`

Un solo script con dos modos. **Regla del owner: `--dry-run` + informe (artifact) ANTES de escribir.**

### 4.1 Universo, fórmula y funciones reales que reusa

| Pieza | De dónde sale (verificado) | Qué hace acá |
|---|---|---|
| `suggestPortionGrams(group, food)` | `packages/nutrition-v2/exchange-lists.ts:114-129` | gramos de 1 porción; **respeta `macros_basis`** vía `intakeEntryFactor` |
| `roundPortionGrams(grams)` | `packages/nutrition-v2/exchange-lists.ts:95-99` | entero bajo 100 g, múltiplo de 5 sobre 100 g |
| `perGramMacros(food)` | `exchange-lists.ts:75-92` (privada) | se **replica** en el script: no está exportada |
| `EXCHANGE_PORTION_GRAMS_LIMIT` | `exchange-lists.ts:22` = `5000` | espejo de `egf_portion_grams_range` (`20260804090000:114-116`) |
| `dominantExchangeMacro(group)` | `exchange-lists.ts:54-68` | **NO se usa para derivar** (ver ⚠ abajo); solo se loguea para el informe |

⚠ **`dominantExchangeMacro` se reemplaza por la tabla de macro clave de R1.** Con los valores UDD, `dominantExchangeMacro` devuelve `carbs` para LD (40 kcal de CHO vs 28 de proteína) y para LS (36 vs 27 de grasa), pero **`fats` para LE** (54 vs 36): derivar los tres subgrupos lácteos con la función daría gramos inconsistentes entre subgrupos del mismo eje. Se fuerza el macro clave por grupo, exactamente como hace `GROUP_REFS.keyMacro` en el script viejo (`scripts/nutrition-portions/heuristics.ts:113-124`).

```js
/**
 * Macro clave por grupo (R1). Explícita, nunca derivada.
 * 'calories' = derivar por calorías (los lácteos descremados tienen 0 g de grasa:
 * derivar por lípidos, que es el «nutriente crítico» de INTA, es imposible; por
 * kcal los tres subgrupos quedan consistentes entre sí).
 */
const CL_KEY_MACRO = {
  LD: 'calories', LS: 'calories', LE: 'calories',
  CB: 'protein',  CA: 'protein',  SCP: 'protein',
  LGS: 'carbs',   VG: 'carbs',    VL: 'carbs',
  FR: 'carbs',    PCT: 'carbs',   AZ: 'carbs',
  AG: 'fats',
}
```

### 4.2 Mapa SMAE → chileno por alimento (universo de derivación)

El universo son las **2.507 filas globales** de `exchange_group_foods` con `source='catalog'` (STATS), o sea los `foods` que el clasificador de julio dejó con `exchange_group_id`. Cada una se re-deriva al grupo chileno destino:

| SMAE origen | Destino cl | Nota |
|---|---|---|
| `C` (706) | `PCT` | 1:1 |
| `P` (603) | `CB` \| `CA` | por umbral de grasa, **igual que el eje lácteo** (§4.3b): `share ≤ 0,40` → `CB`, `> 0,40` → `CA`, `null` → descartar (R16). Mandar los 603 a `CB` a ciegas es el bug de la vienesa (§4.3b) |
| `F` (226) | `FR` | 1:1 |
| `V` (111) | `VG` | 1:1. `VL` **no se deriva masivamente** (OUTLINE §5.2) |
| `LAC` (403) | `LD` \| `LS` \| `LE` | por umbral de grasa (§4.3) |
| `ARL` (201) + `G` (117) | `AG` | los dos colapsan al mismo destino; `on conflict do nothing` resuelve el solape |
| `LEG` (88) | `LGS` | 1:1 |
| `SP` (52) | `SCP` | 1:1, con el guard de `> 50 %` de kcal desde la grasa (§4.3b): un «scoop» que en realidad es una barra con 20 g de grasa se descarta y va al informe |

**Y una exclusión que manda sobre todo el mapa (R-13):** todo `food_id` que aparezca en `generic-foods-cl.json` **sale del universo derivado**. El curado es autoridad (§4.5) y define grupo, gramos y etiqueta; sin esta exclusión el mismo alimento puede terminar en **dos grupos distintos** con dos gramajes —el `on conflict` no protege, porque son claves distintas— y el alumno ve «Yogur natural 125 g» en Lácteos semidescremados y «Yogurt natural ~145 g» en Lácteos enteros. Se implementa en `loadUniverse` (§4.4).

### 4.3 Umbrales de grasa para LD / LS / LE — y por qué NO son g/100 g

**Decisión del writer: la partición del eje lácteo se hace por _porcentaje de kcal que aporta la grasa_, no por gramos de grasa por 100 g.**

Un umbral en g/100 g rompe con los quesos: el quesillo tiene ~5 g de grasa/100 g y el manual UDD lo pone en **semidescremados** (p. 54), mientras que la leche entera tiene ~3 g/100 g y va en **enteros** (p. 55). El porcentaje de energía desde la grasa es adimensional y reproduce la partición del propio manual, porque es literalmente cómo están definidos los tres grupos (LD 0/70 = 0 %; LS 27/85 = 32 %; LE 54/110 = 49 %).

```js
/** % de kcal que aporta la grasa. Escala-invariante: sirve para leche y para queso. */
function fatEnergyShare(food) {
  const perGram = perGramMacros(food)          // respeta macros_basis
  const kcal = perGram.calories
  if (!(kcal > 0)) return null                 // sin kcal utiles ⇒ no se clasifica
  return (perGram.fats * 9) / kcal
}

/** Umbrales propuestos, validados contra 40 alimentos LAC reales (§4.3.1). */
const DAIRY_SPLIT = { LD_MAX: 0.15, LS_MAX: 0.40 }   // <15 % → LD · 15-40 % → LS · >40 % → LE
```

#### 4.3.1 Validación contra el catálogo real (consulta read-only en LIVE, 08-09)

Cinco alimentos del catálogo, genéricos (`brand is null`), hoy en el grupo `LAC`:

| Alimento (`foods.name`) | basis | kcal | grasa (g) | % kcal grasa | Destino por umbral | Lo que dice el manual |
|---|---|---|---|---|---|---|
| `Leche descremada` | `per_100` | 34 | 0 | **0,0 %** | `LD` | UDD p. 53 «Leche descremada 200 ml» ⇒ LD ✔ |
| `Quesillo Light Colun` | `per_serving` | 85 | 1 | **10,6 %** | `LD` | UDD p. 53 «Quesillo light 90 g» ⇒ LD ✔ |
| `Queso cottage` | `per_serving` | 98 | 4 | **36,7 %** | `LS` | UDD p. 54 «Queso Cottage 80 g» ⇒ LS ✔ |
| `Leche Semidescremada` | `per_100` | 47 | 2 | **38,3 %** | `LS` | UDD p. 54 «Leche semi-descremada 200 ml» ⇒ LS ✔ |
| `Queso parmesano` | `per_serving` | 392 | 25 | **57,4 %** | `LE` | UDD p. 55 «Queso Parmesano 25 g» ⇒ LE ✔ |

Casos de borde encontrados en la misma consulta, que van al informe como «revisar»:

- `Leche semidescremada - Los peumo` = **40,0 %** exacto ⇒ cae en `LS` con `LS_MAX` **inclusivo** (`share <= 0.40`). Correcto contra el manual.
- `Yogurt natural` (4 g de grasa / 76 kcal = **47,4 %**) ⇒ el umbral lo mandaría a `LE`, pero UDD p. 54 pone «Yogurt natural 125 ml» en `LS`. **Resuelto por el jefe (§C.7 + R-13): manda el CURADO.** Ese `food_id` está en `generic-foods-cl.json` bajo `LS`, así que **la derivación lo excluye del universo** (§4.2) y jamás nace la fila de `LE`. Sin allowlist por nombre y sin dos entradas homónimas: un alimento curado vive en un solo grupo, el que dice el manual.
- **Contaminación heredada del clasificador de julio**: en `LAC` hay hoy `Arroz preparado sabor queso`, `Puripop popcorn queso`, `Sugarfree yogurt cookies` y `Barras de cereal fruta + yogurt`. Son falsos positivos del `keywordSignal` (`heuristics.ts:205`). El script **no los arrastra al set chileno**: los descarta el guard de gramos de §4.4 y, si alguno pasa, aparece en el top-20 de sospechosos del informe.

### 4.3b Umbrales de grasa para CB / CA — el eje de carnes se parte igual que el lácteo

**Corrección obligatoria (db-datos:B1 del crítico).** El mapa original mandaba los 603 alimentos de `P` a `CB` 1:1 y declaraba que `CA` no recibía nada por derivación masiva. Con macro clave = **proteína** (R1), eso produce filas mentirosas y peligrosas:

| Alimento típico de `P` | P /100 g | G /100 g | Gramos de 1 porción por proteína (11 g) | kcal reales de esa porción | Lo que le muestra hoy el sheet como «1 porción» |
|---|---|---|---|---|---|
| Vienesa | ~11 | ~25 | ~100 g | **~290 kcal** | `CB` = 65 kcal · 2 g de grasa |
| Longaniza | ~14 | ~30 | ~80 g | ~340 kcal | `CB` = 65 kcal · 2 g |
| Mortadela | ~12 | ~25 | ~90 g | ~280 kcal | `CB` = 65 kcal · 2 g |
| Salmón | ~20 | ~13 | ~55 g | ~110 kcal | `CB` = 65 kcal · 2 g |
| Jurel en aceite | ~18 | ~12 | ~60 g | ~115 kcal | `CB` = 65 kcal · 2 g |

El alumno que arma su día con «2 porciones de carne baja en grasa» estaría comiendo 580 kcal creyendo que come 130. Es exactamente el daño que el tren viene a reparar en `PCT`, en el otro eje.

**Fix (R16, decidido por el jefe): la misma `fatEnergyShare(food)` del eje lácteo, con UN corte en 0,40.** El fundamento sale de los refs de los propios grupos, no de un número inventado:

- `CB` 65 kcal · 2 g de grasa ⇒ `2 × 9 / 65` ≈ **28 %** de la energía viene de la grasa.
- `CA` 120 kcal · 8 g de grasa ⇒ `8 × 9 / 120` = **60 %**.
- El corte va **entre** los dos, en el mismo 0,40 inclusivo que ya parte el eje lácteo (`LS_MAX`), para no tener dos números distintos haciendo lo mismo en el mismo script.

```js
/** Umbral del eje de carnes (R16). Misma métrica adimensional que el eje lácteo
 *  (§4.3) y el MISMO corte: share ≤ 0,40 → CB · > 0,40 → CA · null → descartar.
 *  NO hay tramo de descarte por «demasiada grasa»: la longaniza y la vienesa son
 *  carnes altas en grasa, están en la lámina de `CA` del manual (§5.2), y sacarlas
 *  del set las dejaría sin ninguna equivalencia. */
const MEAT_SPLIT = { CB_MAX: 0.40 }

/** Guard aparte, SOLO para suplementos (§4.2): un «scoop» con más de la mitad de
 *  sus kcal en grasa no es un scoop, es una barra. Se descarta y va al informe. */
const SUPPLEMENT_FAT_MAX = 0.50
```

**Verificación obligatoria del corte, antes del `--apply` (R16).** Dos controles, los dos en el informe del dry-run:

1. **15/15 contra el manual.** Los ~15 genéricos de carnes que `generic-foods-cl.json` ya clasifica a mano (§5.2: filete, pollo, merluza y compañía en `CB`; longaniza, vienesa, chuleta, salmón, jurel en aceite y compañía en `CA`) se corren por `targetCode` **como control**, aunque estén excluidos del universo derivado (§4.2), y **los 15 tienen que caer en el grupo que dice el manual**. Si alguno falla, el corte está mal y no se aplica nada.
2. **`0 filas en CB cuyo alimento tenga share > 0,40`**, como verificación explícita de W0 (Q1…Q6 de W0.12) y como assert post-`--apply` del propio script.

Además, el informe emite el histograma de `fatEnergyShare` de los 603 alimentos de `P` en tramos de 5 puntos con los 10 ejemplos alrededor de 0,40; sirve para **ver** el reparto, pero el corte ya está fijado por el jefe y moverlo es una decisión suya, no del worker.

⚠ `SCP` (`SP` → `SCP`, macro clave proteína) es 1:1 porque el origen ya es un grupo de suplementos; ahí se aplica `SUPPLEMENT_FAT_MAX`, no el corte de carnes.

### 4.4 Pseudocódigo del script (JS real, forma de módulo ESM)

```js
#!/usr/bin/env node
// scripts/nutrition-portions-cl/derive-cl-equivalences.mjs
//
// Re-deriva las equivalencias del SET CHILENO desde `foods`, con la formula
// correcta (suggestPortionGrams, que respeta macros_basis) y el macro clave
// forzado por grupo (R1). NO toca las 2.507 filas del set SMAE.
//
//   node scripts/nutrition-portions-cl/derive-cl-equivalences.mjs --dry-run
//   node scripts/nutrition-portions-cl/derive-cl-equivalences.mjs --apply
//
// --dry-run  : no escribe NADA. Emite scripts/output/cl-equivalences-<fecha>.md
// --apply    : escribe filas GLOBALES en exchange_group_foods con service_role
//
// Env OBLIGATORIA, sin fallback literal (docs:check rechaza `?? 'https://…'`):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  suggestPortionGrams,
  roundPortionGrams,
  EXCHANGE_PORTION_GRAMS_LIMIT,
} from '../../packages/nutrition-v2/exchange-lists.ts'   // via tsx/loader; ver §4.7
import genericFoods from './generic-foods-cl.json' with { type: 'json' }

// ── 0) Config y guards de entorno ───────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY. No hay default.')
  process.exit(1)
}
const APPLY = process.argv.includes('--apply')
const DRY = process.argv.includes('--dry-run') || !APPLY
if (APPLY && DRY) { console.error('--dry-run y --apply son excluyentes'); process.exit(1) }

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

// ── 1) Tablas fijas ─────────────────────────────────────────────────────────
const CL_KEY_MACRO = { /* §4.1 */ }
const DAIRY_SPLIT = { LD_MAX: 0.15, LS_MAX: 0.40 }
const MEAT_SPLIT = { CB_MAX: 0.40 }                 // §4.3b (R16)
const SUPPLEMENT_FAT_MAX = 0.50                     // §4.3b, solo para SP → SCP

/** food_id de TODOS los curados de generic-foods-cl.json, resueltos en el paso 7.
 *  El universo derivado los excluye (§4.2, R-13): el curado es autoridad y define
 *  grupo + gramos + etiqueta; sin esto el mismo alimento cae en dos grupos. */
let CURATED_FOOD_IDS = new Set()
const SMAE_TO_CL = {
  C: 'PCT', F: 'FR', V: 'VG',
  ARL: 'AG', G: 'AG', LEG: 'LGS', SP: 'SCP',
  LAC: null,          // null = destino dinamico (splitDairy)
  P: null,            // null = destino dinamico (splitMeat, §4.3b)
}
/** Rango util del set chileno. Mas estrecho que el CHECK (5000) a proposito:
 *  ninguna porcion casera razonable pide 2 kg de nada, y arriba de 600 g lo que
 *  hay es un dato malo del catalogo. Decision del writer, ver §12. */
const CL_GRAMS_MIN = 5
const CL_GRAMS_MAX = 600

// ── 2) Universo ─────────────────────────────────────────────────────────────
// Todo alimento con una fila GLOBAL de equivalencia en un grupo SMAE. Es el mismo
// universo de las 2.507 (STATS), no `foods.exchange_*`: la tabla es la fuente
// desde 20260804090000 y la rama legacy sale en F5.
// PAGINACION CON ORDEN EXPLICITO (fix db-datos:R2). `.range()` sin `.order()`
// sobre 2.507 filas no garantiza estabilidad entre paginas: Postgres puede
// devolver una fila en dos paginas (la tapa el `do nothing`) y NUNCA otra, y el
// resultado seria un grupo con menos equivalencias que las que el informe
// declara, sin ningun error. El orden es por la clave del unico indice
// (exchange_group_id, food_id) y el conteo se contrasta contra el total real.
async function loadUniverse() {
  const rows = []
  let from = 0
  const PAGE = 1000
  for (;;) {
    const { data, error } = await db
      .from('exchange_group_foods')
      .select(`
        exchange_group_id,
        food:foods!inner ( id, name, brand, calories, protein_g, carbs_g, fats_g,
                           serving_size, macros_basis, coach_id, org_id ),
        group:exchange_groups!inner ( code, portion_system )
      `)
      .is('coach_id', null).is('org_id', null)
      .eq('source', 'catalog').eq('is_excluded', false)
      .eq('group.portion_system', 'smae')
      .order('exchange_group_id', { ascending: true })
      .order('food_id', { ascending: true })          // orden TOTAL: es el uq de la tabla
      .range(from, from + PAGE - 1)
    if (error) throw error
    rows.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }

  // ASSERT DURO: la paginacion leyo TODO. `expected` se pide con el mismo filtro
  // y `head: true` (una sola query de conteo, sin traer filas). Si no cuadra, se
  // aborta: escribir con un universo incompleto deja grupos mancos y nadie lo ve.
  const { count: expected, error: countError } = await db
    .from('exchange_group_foods')
    .select('food_id, group:exchange_groups!inner(portion_system)', { count: 'exact', head: true })
    .is('coach_id', null).is('org_id', null)
    .eq('source', 'catalog').eq('is_excluded', false)
    .eq('group.portion_system', 'smae')
  if (countError) throw countError
  if (rows.length !== expected) {
    throw new Error(
      `loadUniverse: leidas ${rows.length} filas, esperadas ${expected}. ` +
      'La paginacion perdio o repitio filas: NO se escribe nada.')
  }
  if (!(expected >= 2507)) {
    console.warn(`loadUniverse: el universo bajo de 2.507 a ${expected} filas (STATS 08-09). Revisar antes de --apply.`)
  }

  // Solo alimentos globales: una fila global no puede apuntar a un food con dueno.
  // Y FUERA los curados (§4.2, fix R-13): el JSON de §5 ya les fija grupo, gramos y
  // medida casera. Si se derivaran igual, `Yogur natural` entraria a LS por el
  // curado y a LE por su grasa real (47 %), con dos gramajes distintos, en dos
  // grupos que compiten: el `on conflict` NO lo evita porque son claves distintas.
  // Los excluidos se cuentan en el informe (§4.6, bloque 1: columna «curados»).
  return rows.filter((r) =>
    r.food.coach_id == null && r.food.org_id == null && !CURATED_FOOD_IDS.has(r.food.id))
}

// ── 3) Grupos chilenos (del catalogo, NO hardcodeados) ──────────────────────
// SIN `.is('deleted_at', null)` (R14-ter): entre W0 y el encendido de W6.8 los 13
// viven APAGADOS, y el script tiene que poder correr igual. Es seguro porque corre
// con service_role (sin RLS) y porque los grupos existen; el catalogo del coach es
// otro camino y ese sí filtra deleted_at.
async function loadClGroups() {
  const { data, error } = await db.from('exchange_groups')
    .select('id, code, slug, ref_calories, ref_protein_g, ref_carbs_g, ref_fats_g')
    .eq('portion_system', 'cl').eq('is_system', true)
  if (error) throw error
  if (data.length !== 13) throw new Error(`Se esperaban 13 grupos cl, hay ${data.length}. Corre el _POST_DEPLOY_ primero.`)
  return new Map(data.map((g) => [g.code, {
    id: g.id, code: g.code, slug: g.slug,
    refCalories: Number(g.ref_calories), refProteinG: Number(g.ref_protein_g),
    refCarbsG: Number(g.ref_carbs_g),    refFatsG: Number(g.ref_fats_g),
  }]))
}

// ── 4) Destino ──────────────────────────────────────────────────────────────
function perGramMacros(food) {           // replica de exchange-lists.ts:75-92
  const basis = food.macros_basis ?? 'per_100'
  const size = Number(food.serving_size ?? 0)
  const factor = basis === 'per_serving' && size > 0 ? 1 / size : 1 / 100
  const s = (v) => { const n = Number(v ?? 0); return Number.isFinite(n) && n > 0 ? n * factor : 0 }
  return { protein: s(food.protein_g), carbs: s(food.carbs_g), fats: s(food.fats_g), calories: s(food.calories) }
}

function fatEnergyShare(food) {
  const pg = perGramMacros(food)
  if (!(pg.calories > 0)) return null
  return (pg.fats * 9) / pg.calories
}

function targetCode(smaeCode, food) {
  if (smaeCode === 'LAC') {
    const share = fatEnergyShare(food)
    if (share == null) return null                    // sin kcal ⇒ se descarta
    if (share < DAIRY_SPLIT.LD_MAX) return 'LD'
    if (share <= DAIRY_SPLIT.LS_MAX) return 'LS'
    return 'LE'
  }
  // §4.3b (R16) — el eje de carnes tambien esta partido en el set chileno. Sin
  // esto, una vienesa (11 g P / 25 g G) sale como «1 porcion de carne BAJA en
  // grasa» de ~100 g y ~290 kcal reales contra 65 kcal declaradas.
  // UN solo corte, el mismo 0,40 inclusivo del eje lacteo. NO hay descarte por
  // exceso de grasa: la longaniza es una carne alta en grasa, y esta en la lamina
  // de CA del manual.
  if (smaeCode === 'P') {
    const share = fatEnergyShare(food)
    if (share == null) return null                    // sin kcal ⇒ se descarta
    return share <= MEAT_SPLIT.CB_MAX ? 'CB' : 'CA'
  }
  // Guard SOLO para suplementos: un «scoop» con mas de la mitad de sus kcal en
  // grasa no es un scoop. Se descarta y sale en el top-20 de sospechosos.
  if (smaeCode === 'SP') {
    const share = fatEnergyShare(food)
    if (share != null && share > SUPPLEMENT_FAT_MAX) return null
  }
  return SMAE_TO_CL[smaeCode] ?? null
}

// ── 5) Gramos, con el macro clave FORZADO ───────────────────────────────────
/** suggestPortionGrams elige el macro dominante solo; para forzarlo se le pasa un
 *  `group` sintetico con los otros macros en 0, salvo cuando la clave es
 *  'calories' (LD/LS/LE): ahi se le pasan los tres macros en 0 y el ref_calories
 *  real, que es exactamente la rama de fallback por calorias de :121-123. */
function gramsForClGroup(group, food) {
  const key = CL_KEY_MACRO[group.code]
  const synthetic = key === 'calories'
    ? { refCalories: group.refCalories, refProteinG: 0, refCarbsG: 0, refFatsG: 0 }
    : {
        refCalories: group.refCalories,
        refProteinG: key === 'protein' ? group.refProteinG : 0,
        refCarbsG:   key === 'carbs'   ? group.refCarbsG   : 0,
        refFatsG:    key === 'fats'    ? group.refFatsG    : 0,
      }
  const grams = suggestPortionGrams(synthetic, {
    proteinG: food.protein_g, carbsG: food.carbs_g, fatsG: food.fats_g,
    calories: food.calories, servingSize: food.serving_size, macrosBasis: food.macros_basis,
  })
  if (grams == null) return null                                  // ya viene redondeado
  if (grams > EXCHANGE_PORTION_GRAMS_LIMIT) return null           // cinturon del CHECK
  if (grams < CL_GRAMS_MIN || grams > CL_GRAMS_MAX) return null   // rango util del set cl
  return roundPortionGrams(grams)
}

// ── 6) Auditoria SMAE (R7): NO arregla nada, solo cuenta ────────────────────
/** Cuantas de las 2.507 filas SMAE difieren > 20 % de lo que daria la formula
 *  correcta hoy. El script de julio (heuristics.ts:329-341) ignoraba macros_basis. */
function auditSmaeRow(row, smaeGroupRefs) {
  const expected = suggestPortionGrams(smaeGroupRefs[row.group.code], toFoodMacros(row.food))
  const actual = Number(row.portion_grams ?? 0)
  if (!(expected > 0) || !(actual > 0)) return { status: 'sin_dato' }
  const delta = Math.abs(expected - actual) / actual
  return { status: delta > 0.20 ? 'divergente' : 'ok', expected, actual, delta }
}

// ── 7) Curados: generic-foods-cl.json ───────────────────────────────────────
// ORDEN DE EJECUCION: los curados se resuelven PRIMERO (antes de loadUniverse),
// porque su lista de food_id alimenta CURATED_FOOD_IDS y esa exclusion define el
// universo derivado (§4.2, R-13).
// ORDEN DE ESCRITURA (§4.5, fix B4): los curados se escriben ANTES que la
// derivacion masiva. Los gramos del manual mandan sobre los de la formula; si la
// derivada entrara primero, «¾ taza» quedaria pegado a 105 g derivados.
//
// CONTROL DEL CORTE DE CARNES (R16): los ~15 genericos de CB/CA del JSON se pasan
// igual por targetCode —aunque esten excluidos del universo— y el informe exige
// 15/15 en el grupo que dice el manual. Si falla uno, el script no ofrece --apply.
/** Resuelve food_id por nombre EXACTO (case-insensitive) entre alimentos globales.
 *  0 hits ⇒ alta de food del sistema (§5.3). >1 hit ⇒ NO se elige: va al informe.
 *  Cada food_id resuelto entra a CURATED_FOOD_IDS ANTES de llamar a loadUniverse. */
async function resolveGenericFood(entry) { /* select id from foods where lower(name)=lower($1) and coach_id is null and org_id is null */ }

// ── 8) Salida ───────────────────────────────────────────────────────────────
// DRY  → writeFileSync(scripts/output/cl-equivalences-YYYYMMDD.md, informe)
// APPLY→ insertCurated(...) → insertDerived(...) → updateCuratedLabels(...)
//        (§4.5, EN ESE ORDEN) y el MISMO informe con los conteos reales de filas
//        insertadas / saltadas y el delta gramos manual vs derivado.
```

### 4.5 SQL que ejecuta `--apply`

**TRES statements, en ESTE orden**, por chunks de 500 filas, con `service_role` (las policies `egf_insert_own` / `egf_insert_org` de `20260804090000:201-218` exigen dueño ⇒ `authenticated` **no puede** crear filas globales).

> **El orden es parte del fix (db-datos:B4). Los curados van PRIMERO.**
> Con el orden invertido (derivar y después «completar la etiqueta») pasaba esto: la fila derivada entraba con los gramos de la fórmula, y el `update` de labels traía `portion_grams = coalesce(egf.portion_grams, v.portion_grams)` — como `egf.portion_grams` ya **no** era null, ganaba el derivado y quedaba la etiqueta del manual pegada a los gramos de la fórmula. El alumno leía **«Arroz cocido · ¾ taza · 105 g»** cuando el manual dice que ¾ taza son 130 g; lo mismo con pan de molde, papa, leche y aceite. Etiqueta y gramos contradiciéndose en la misma fila, contra SPEC §6.3 y la Q5 de W0.12.
> **Regla dura: los curados son autoridad.** Donde hay medida casera del manual, mandan sus gramos y su etiqueta; la derivación solo llena lo que el manual no cubre.

```sql
-- (0) CURADOS PRIMERO. generic-foods-cl.json con los gramos y la etiqueta del
--     manual (§5). DO NOTHING: si la fila global ya existe, no se pisa aca — de
--     eso se encarga (b), que es el unico statement autorizado a corregir
--     gramos+label a la vez y solo sobre filas globales de catalogo.
insert into public.exchange_group_foods
  (exchange_group_id, food_id, coach_id, org_id,
   portion_grams, portion_label, is_excluded, source)
select v.group_id, v.food_id, null, null,
       v.portion_grams, v.portion_label, false, 'catalog'
from (values
  ('0000e8c1-0000-0000-0000-000000000010'::uuid, $1::uuid, 130::numeric, '¾ taza'::text)
  -- … el resto de generic-foods-cl.json …
) as v(group_id, food_id, portion_grams, portion_label)
on conflict on constraint egf_group_food_owner_uq do nothing;

-- (a) Alta de la equivalencia DERIVADA. DO NOTHING, jamas DO UPDATE: una fila global ya
--     escrita (por este script en una corrida anterior, o a mano) no se pisa.
--     El unico egf_group_food_owner_uq es NULLS NOT DISTINCT (20260804090000:126-127),
--     asi que las filas globales colisionan entre si a proposito: eso hace el
--     script re-ejecutable.
insert into public.exchange_group_foods
  (exchange_group_id, food_id, coach_id, org_id,
   portion_grams, portion_label, is_excluded, source)
select v.group_id, v.food_id, null, null,
       v.portion_grams, v.portion_label, false, 'catalog'
from (values
  ('0000e8c1-0000-0000-0000-000000000010'::uuid, $1::uuid, $2::numeric, $3::text)
  -- … hasta 500 tuplas por chunk …
) as v(group_id, food_id, portion_grams, portion_label)
on conflict on constraint egf_group_food_owner_uq do nothing;

-- (b) Medida casera de los curados sobre filas globales que YA existian sin label
--     (de una corrida anterior, o del set derivado si (0) no las creo).
--     `portion_grams = v.portion_grams`, NO `coalesce`: la etiqueta y los gramos
--     tienen que salir de la MISMA fuente. «¾ taza» son los 130 g del manual o no
--     es «¾ taza». Los cuatro predicados del WHERE son la implementacion literal
--     de S6: jamas pisa una fila de coach (coach_id), ni de org (org_id), ni una
--     correccion manual (source <> 'catalog'), ni un label ya escrito.
update public.exchange_group_foods egf
   set portion_label = v.portion_label,
       portion_grams = v.portion_grams,
       updated_at = now()
  from (values ($1::uuid, $2::uuid, $3::text, $4::numeric)) as v(group_id, food_id, portion_label, portion_grams)
 where egf.exchange_group_id = v.group_id
   and egf.food_id = v.food_id
   and egf.coach_id is null
   and egf.org_id is null
   and egf.source = 'catalog'
   and egf.portion_label is null;
-- ↑ `portion_label is null` sigue siendo el candado que hace esto idempotente y
--   que impide pisar un label escrito a mano: una segunda corrida no toca nada.
--   El delta de gramos de cada fila que este statement mueve va al bloque
--   «curados que difieren > 15 % del derivado» del informe (§4.6).
```

Guard post-apply (assert del script, aborta y avisa fuerte si falla):

```sql
-- R6 / S6: ninguna fila CON DUENO fue tocada por esta corrida.
select count(*) from public.exchange_group_foods
where (coach_id is not null or org_id is not null)
  and updated_at > :inicio_de_la_corrida;
-- Esperado: 0
```

### 4.6 Informe del dry-run (`scripts/output/cl-equivalences-<fecha>.md`)

Cinco bloques, en este orden. Es lo que el owner aprueba antes del `--apply`.

1. **Conteo por grupo chileno.** `| code | candidatos | curados (excluidos del derivado) | con gramos válidos | descartados | ya existentes | a insertar |`, más el total. Referencia esperada por el mapa de §4.2: PCT ≈ 706, `CB+CA` ≈ 603, FR ≈ 226, VG ≈ 111, `LD+LS+LE` ≈ 403, AG ≈ 318, LGS ≈ 88, SCP ≈ 52, VL = 0.
2. **Distribución de gramos por grupo**: mín · p25 · mediana · p75 · máx · n. Sirve para detectar de un vistazo un grupo con la escala corrida (si `PCT` no queda ~2× lo que tenía `C`, algo está mal: `scripts/nutrition-portions/research/cereales-leguminosas.md:14-28` deja escrito que toda la columna de gramos vieja está en escala SMAE y que la porción INTA es ~2×).
3. **Top 20 sospechosos**: filas con `grams > 600` o `grams < 5` (descartadas), y filas cuyo nombre no calza con el grupo destino (heurística de palabra clave: «popcorn/cookies/barra» en un grupo lácteo). Cada una con `food.name`, basis, kcal, macro clave, gramos calculados y motivo.
4. **Reparto de los dos ejes partidos por grasa** (§4.3 y §4.3b), con la misma tabla para los dos:
   - **Eje lácteo**: `| destino | n | % kcal grasa mín/mediana/máx | 5 ejemplos |` para LD, LS y LE, más las filas con `share == null` (sin kcal).
   - **Eje de carnes**: idem para CB y CA, con los nombres de las 10 filas más cercanas al corte por cada lado (ahí tienen que caer del lado `CA` vienesa, longaniza y mortadela: si alguna quedó en `CB`, el umbral está mal).
   - **Control 15/15 del corte de carnes (R16)**: `| alimento curado | grupo del manual | grupo que da fatEnergyShare | share | ✔/✘ |` para los ~15 genéricos de `CB`/`CA` de §5.2. **Cualquier ✘ bloquea el `--apply`.**
   - **Control «0 filas en `CB` con `share > 0,40`»** (R16): el conteo, que debe ser 0, y las filas si no lo es.
   - **Histograma de `fatEnergyShare` en tramos de 5 puntos** para `LAC` (403 filas) y para `P` (603 filas), con los 10 ejemplos alrededor de cada corte (0,15 y 0,40). Sirve para **ver** el reparto; los cortes ya están fijados (R16) y moverlos es decisión del jefe, no del worker.
   - **Coherencia etiqueta ↔ gramos por grupo (R-14)**: para cada grupo, las filas curadas agrupadas por `portion_label`; si una misma etiqueta («¾ taza») aparece con gramajes distintos dentro del mismo grupo, se lista como error de curaduría. En `LGS` esto es lo que fuerza los 130 g de §5.2.
   - **Curados que difieren > 15 % del derivado**: `| grupo | alimento | gramos del manual | gramos derivados | Δ % | página |`. Manda el manual (§4.5), así que esta tabla no es una excepción a resolver: es el control de que la fórmula y el manual no estén en mundos distintos. Un Δ enorme en varias filas del mismo grupo = el `ref_*` de ese grupo o el `macros_basis` del alimento están mal, y eso sí se revisa antes de escribir.
5. **Auditoría SMAE (R7)**: cuántas de las 2.507 filas vigentes difieren > 20 % de lo que da hoy `suggestPortionGrams` con el macro dominante real, desglosado por grupo y por `macros_basis`. **No se arregla nada acá**: se registra como backlog «auditoría gramos SMAE» en TASKS.

Cierre del informe: **`filas leídas del universo = N, esperado = M (conteo exacto de la misma query), ≥ 2.507`** — si `N ≠ M` el script aborta y no escribe nada (§4.4, fix R2) —, `filas a insertar`, `labels a completar`, `curados que difieren > 15 % del derivado`, `filas con dueño que se van a tocar: 0`, y el comando exacto del `--apply`.

### 4.7 Cómo se corre en Windows (PS 5.1)

```powershell
# El .mjs importa TS de packages/nutrition-v2: se corre por el loader de tsx que
# ya esta en el monorepo, igual que scripts/nutrition-portions/*.mjs.
$env:SUPABASE_URL = "<url del proyecto>"
$env:SUPABASE_SERVICE_ROLE_KEY = "<service role>"    # nunca queda en el repo ni en docs
pnpm exec tsx scripts/nutrition-portions-cl/derive-cl-equivalences.mjs --dry-run
# revisar scripts/output/cl-equivalences-<fecha>.md, subirlo como artifact, OK del owner
pnpm exec tsx scripts/nutrition-portions-cl/derive-cl-equivalences.mjs --apply
```

- Archivos `.mjs` y `.json` **sin BOM** (`Set-Content -Encoding utf8NoBOM` o escribirlos con el editor; PS 5.1 mete BOM con `>` y `Out-File`).
- `SUPABASE_SERVICE_ROLE_KEY` **solo** por variable de entorno de la sesión: nunca en un `.env` commiteado, nunca en el informe, nunca en TASKS.
- El script **no** usa `process.env.X || 'literal'`: `scripts/check-docs.mjs:157-291` rechaza ese patrón y `docs:check` es gate del tren.

### 4.8 R5 — `scripts/nutrition-portions/` no queda muerto

`classify-lib.ts:96-157` (`verifyGroupRefs`) aborta con `missing_in_fixture` (:150-154) en cuanto ve grupos `is_system` que el fixture no conoce. Sembrar 13 grupos nuevos **rompe el clasificador viejo**. Tarea chica de W1: ampliar `GROUP_REFS` (`scripts/nutrition-portions/heuristics.ts:113-124`) con los 13 chilenos y su `keyMacro`/`keyRefG` (misma tabla que `CL_KEY_MACRO`; `keyRefG` = el ref del macro clave, y para LD/LS/LE `keyMacro: 'calories'` con `keyRefG` = `ref_calories`). **El clasificador no se corre en este tren.**

⚠ **No alcanza con `GROUP_REFS` (R-09).** El `code` está tipado como unión cerrada:
`export type ExchangeGroupCode = 'C' | 'P' | 'F' | 'V' | 'LAC' | 'ARL' | 'SP' | 'G' | 'LEG'` (`heuristics.ts:52`), usada además en `:72,78,79,80`. Sin sumarle los 13 códigos chilenos el archivo **no compila**, y el criterio de la tarea de W1 tiene que nombrar las dos cosas: el tipo y la tabla.

---

## 5. `scripts/nutrition-portions-cl/generic-foods-cl.json`

Genéricos curados con **medida casera**, transcritos de las láminas de los manuales. `portion_grams` = los gramos que el manual asigna a **1 porción de ese grupo**; `portion_label` ≤ 40 caracteres (CHECK `egf_portion_label_len`, `20260804090000:120`).

**Regla de fuente**: cuando UDD e INTA difieren, **manda UDD** (2019 > 1999) y se anota INTA en `note`.

**Páginas verificadas** (láminas renderizadas leídas una por una): UDD p. 53 (LD) · 54 (LS) · 55 (LE) · 57 (CB) · 61 (VG) · 63 (VL) · 65 y 67 (FR) · 69, 70 y 71 (PCT) · 73 (AG) · 77 (AZ). Las láminas UDD de **CA** y **LGS** no están en el render disponible (`D:\tmp\porciones_udd_pages`, el escaneo salta de p. 57 a p. 61 y de p. 73 a p. 77); sus filas se toman de **INTA p. 28 (CA)** y **INTA p. 30 (LGS)**, cuyos encabezados imprimen exactamente los mismos macros que la Tabla N.º 5 UDD (CA `120 kcal · 1 CHO · 8 L · 11 P`; LGS `170 kcal · 30 CHO · 1 L · 11 P`) ⇒ las listas son intercambiables. **Aceptado por el jefe (R-15)**: se siembra con INTA para W0 y TASKS lleva el ítem «verificar `CA` y `LGS` contra las láminas UDD si aparece el escaneo completo». El informe del dry-run marca qué filas vienen de INTA.

### 5.1 Los macros por porción de cada grupo, tal como los imprime la lámina

| code | Grupo | kcal | P | C | G | Lámina verificada |
|---|---|---|---|---|---|---|
| `LD` | Lácteos descremados | 70 | 7 | 10 | 0 | UDD p. 53 |
| `LS` | Lácteos semidescremados | 85 | 5 | 9 | 3 | UDD p. 54 |
| `LE` | Lácteos enteros | 110 | 5 | 9 | 6 | UDD p. 55 |
| `CB` | Carnes bajas en grasa | 65 | 11 | 1 | 2 | UDD p. 57 · INTA p. 29 |
| `CA` | Carnes altas en grasa | 120 | 11 | 1 | 8 | INTA p. 28 |
| `LGS` | Legumbres secas | 170 | 11 | 30 | 1 | INTA p. 30 |
| `VG` | Verduras generales | 25 | 2 | 5 | 0 | UDD p. 61 |
| `VL` | Verduras de libre consumo | 10 | 0 | 2,5 | 0 | UDD p. 63 |
| `FR` | Frutas | 60 | 0 | 15 | 0 | UDD p. 65 y 67 |
| `PCT` | Panes, cereales y tubérculos | 140 | 3 | 30 | 1 | UDD p. 69, 70 y 71 |
| `AG` | Aceites y grasas | 45 | 0 | 0 | 5 | UDD p. 73 |
| `AZ` | Azúcares | 20 | 0 | 5 | 0 | UDD p. 77 |
| `SCP` | Scoop proteína | 120 | 24 | 2 | 1 | EVA (S3) — no viene de manual |

### 5.2 El archivo

```jsonc
{
  "$schema": "./generic-foods-cl.schema.json",
  "version": "2026-09-09",
  "sources": {
    "UDD": "Ratner, Aicardi, Allende, Madrid, Riesco — Manual de porciones de intercambio, UDD 2019 (Tabla N.º 5, pp. 25 y 51; listas pp. 52-73)",
    "INTA": "Jury, Urteaga, Taibo — Porciones de intercambio y composición química de los alimentos, INTA 1999"
  },
  "note": "portion_grams = gramos de UNA porción del grupo. Cuando UDD e INTA difieren manda UDD y el desacuerdo queda en `note`. Las macros de cada grupo son las de §5.1 y NO se repiten por fila: la fila hereda las del grupo.",
  "groups": {
    "LD": { "kcal": 70, "protein_g": 7, "carbs_g": 10, "fats_g": 0, "source": "UDD p. 53", "foods": [
      { "name": "Leche descremada",                 "grams": 200, "label": "1 taza" },
      { "name": "Leche saborizada descremada sin azúcar", "grams": 200, "label": "1 taza" },
      { "name": "Yogur descremado sin azúcar",      "grams": 125, "label": "½ taza o 1 envase chico" },
      { "name": "Leche cultivada descremada sin azúcar", "grams": 200, "label": "1 taza" },
      { "name": "Leche en polvo descremada",        "grams":  20, "label": "2 cucharadas colmadas" },
      { "name": "Quesillo light",                   "grams":  90, "label": "1 rodela de 4 cm",
        "note": "UDD: el CHO del quesillo light es 2,4 g/porción; el aporte calórico lo cubren proteína y grasa" },
      { "name": "Yogur natural descremado",         "grams": 125, "label": "½ taza", "source": "INTA p. 25" },
      { "name": "Queso cottage 1%",                 "grams": 100, "label": "5 cucharadas", "source": "derivado, ver §5.4" }
    ]},
    "LS": { "kcal": 85, "protein_g": 5, "carbs_g": 9, "fats_g": 3, "source": "UDD p. 54", "foods": [
      { "name": "Leche semidescremada",             "grams": 200, "label": "1 taza" },
      { "name": "Yogur natural",                    "grams": 125, "label": "½ taza",
        "note": "AUTORIDAD sobre el dato del catálogo (R-13 + §C.7): su grasa real da 47 % de las kcal y la derivación lo mandaría a LE. Al estar curado acá, su food_id se excluye del universo derivado y vive SOLO en LS, como dice UDD p. 54" },
      { "name": "Yogur griego light",               "grams": 110, "label": "½ taza" },
      { "name": "Quesillo",                         "grams":  60, "label": "1 rodela de 3 cm" },
      { "name": "Queso fresco light",               "grams":  60, "label": "1 rebanada de 3 cm" },
      { "name": "Queso cottage",                    "grams":  80, "label": "4 cucharadas" },
      { "name": "Ricota light",                     "grams":  65, "label": "3 cucharadas" },
      { "name": "Yogur batido simple",              "grams": 175, "label": "1 unidad", "source": "INTA p. 26",
        "note": "INTA lo clasifica como lácteo medio en grasa RICO en CHO (167 kcal, 30 g CHO): el coach debe ajustar si cuenta CHO" }
    ]},
    "LE": { "kcal": 110, "protein_g": 5, "carbs_g": 9, "fats_g": 6, "source": "UDD p. 55", "foods": [
      { "name": "Leche entera",                     "grams": 200, "label": "1 taza" },
      { "name": "Yogur griego",                     "grams": 110, "label": "½ taza" },
      { "name": "Leche cultivada",                  "grams": 200, "label": "1 taza" },
      { "name": "Queso fresco",                     "grams":  60, "label": "1 rebanada de 3 cm" },
      { "name": "Queso chanco",                     "grams":  30, "label": "2 láminas", "note": "UDD marca alto en sodio" },
      { "name": "Queso mantecoso",                  "grams":  30, "label": "2 láminas", "note": "alto en sodio" },
      { "name": "Queso gouda",                      "grams":  30, "label": "2 láminas", "note": "alto en sodio" },
      { "name": "Queso chédar",                     "grams":  30, "label": "2 láminas", "note": "alto en sodio" },
      { "name": "Queso de cabra",                   "grams":  30, "label": "1 cajita de fósforo", "note": "alto en sodio" },
      { "name": "Queso parmesano",                  "grams":  25, "label": "5 cucharaditas rasas", "note": "alto en sodio" },
      { "name": "Queso crema",                      "grams":  30, "label": "1½ cucharadas" },
      { "name": "Ricota",                           "grams":  65, "label": "3 cucharadas" }
    ]},
    "CB": { "kcal": 65, "protein_g": 11, "carbs_g": 1, "fats_g": 2, "source": "UDD p. 57", "foods": [
      { "name": "Filete de vacuno",                 "grams":  50, "label": "1 trozo de 6×6×1 cm" },
      { "name": "Lomo liso",                        "grams":  50, "label": "1 trozo de 6×6×1 cm" },
      { "name": "Posta negra",                      "grams":  50, "label": "1 trozo de 6×6×1 cm" },
      { "name": "Pollo",                            "grams":  50, "label": "1 trozo de 6×6×1 cm" },
      { "name": "Pavo",                             "grams":  50, "label": "1 trozo de 6×6×1 cm" },
      { "name": "Pechuga de pavo cocida",           "grams":  60, "label": "3 rebanadas", "note": "alto en sodio" },
      { "name": "Filete de cerdo",                  "grams":  50, "label": "1 trozo de 6×6×1 cm" },
      { "name": "Atún al agua",                     "grams":  60, "label": "⅓ de taza", "note": "alto en sodio" },
      { "name": "Merluza",                          "grams":  80, "label": "1 trozo de 10×6×1 cm" },
      { "name": "Reineta",                          "grams":  80, "label": "1 trozo de 10×6×1 cm" },
      { "name": "Congrio",                          "grams":  80, "label": "1 trozo de 10×6×1 cm" },
      { "name": "Camarón",                          "grams": 120, "label": "20 unidades" },
      { "name": "Choritos",                         "grams":  60, "label": "8 unidades" },
      { "name": "Huevo entero",                     "grams":  75, "label": "1,5 unidades",
        "note": "INTA p. 29 dice 50 g = 1 unidad; manda UDD" },
      { "name": "Proteína vegetal de soya texturizada", "grams": 25, "label": "2,5 cucharadas" },
      { "name": "Jamón de cerdo",                   "grams":  60, "label": "2 rebanadas", "note": "alto en sodio" }
    ]},
    "CA": { "kcal": 120, "protein_g": 11, "carbs_g": 1, "fats_g": 8, "source": "INTA p. 28", "foods": [
      { "name": "Asado de tira",                    "grams":  50, "label": "1 trozo de 6×6×1 cm" },
      { "name": "Lomo vetado",                      "grams":  50, "label": "1 trozo de 6×6×1 cm" },
      { "name": "Plateada",                         "grams":  50, "label": "1 trozo de 6×6×1 cm" },
      { "name": "Sobrecostilla",                    "grams":  50, "label": "1 trozo de 6×6×1 cm" },
      { "name": "Carne molida corriente",           "grams":  50, "label": "2½ cucharadas" },
      { "name": "Chuleta de cerdo",                 "grams":  50, "label": "1 trozo de 6×6×1 cm" },
      { "name": "Salmón crudo",                     "grams":  80, "label": "1 trozo de 10×6×1 cm" },
      { "name": "Sardinas en aceite",               "grams":  50, "label": "⅓ de taza", "note": "alto en sodio" },
      { "name": "Jurel en aceite",                  "grams":  50, "label": "⅓ de taza", "note": "alto en sodio" },
      { "name": "Atún en aceite",                   "grams":  50, "label": "⅓ de taza", "note": "alto en sodio" },
      { "name": "Longaniza",                        "grams":  45, "label": "1 rodela de 4 cm", "note": "alto en sodio" },
      { "name": "Vienesa",                          "grams":  40, "label": "1 unidad", "note": "alto en sodio" },
      { "name": "Mortadela",                        "grams":  60, "label": "3 tajadas", "note": "alto en sodio" },
      { "name": "Jamón",                            "grams":  40, "label": "1 tajada", "note": "alto en sodio" }
    ]},
    "LGS": { "kcal": 170, "protein_g": 11, "carbs_g": 30, "fats_g": 1, "source": "INTA p. 30", "foods": [
      { "name": "Poroto cocido",                    "grams": 130, "label": "¾ taza",
        "note": "R-14: la misma medida casera no puede valer 100, 130 y 140 g en el mismo grupo y la misma pantalla. Se unifica en los 130 g que fija OUTLINE §5.3; INTA p. 30 imprime 100 g para el poroto" },
      { "name": "Garbanzo cocido",                  "grams": 130, "label": "¾ taza" },
      { "name": "Lenteja cocida",                   "grams": 130, "label": "¾ taza",
        "note": "R-14: unificado a 130 g; INTA p. 30 imprime 140 g" },
      { "name": "Poroto crudo",                     "grams":  50, "label": "½ taza" },
      { "name": "Lenteja cruda",                    "grams":  50, "label": "4 cucharadas o ¼ taza" },
      { "name": "Garbanzo crudo",                   "grams":  50, "label": "4 cucharadas o ¼ taza" },
      { "name": "Arveja seca cruda",                "grams":  50, "label": "½ taza" },
      { "name": "Haba seca",                        "grams":  60, "label": "4 cucharadas o ¼ taza" },
      { "name": "Chícharo",                         "grams":  60, "label": "4 cucharadas o ¼ taza" }
    ]},
    "VG": { "kcal": 25, "protein_g": 2, "carbs_g": 5, "fats_g": 0, "source": "UDD p. 61", "foods": [
      { "name": "Tomate",                           "grams": 120, "label": "1 unidad regular" },
      { "name": "Zanahoria cruda",                  "grams":  50, "label": "1 taza" },
      { "name": "Zanahoria cocida",                 "grams":  50, "label": "½ taza" },
      { "name": "Brócoli hervido",                  "grams": 100, "label": "1 taza" },
      { "name": "Coliflor",                         "grams": 110, "label": "1 taza" },
      { "name": "Zapallo italiano cocido",          "grams": 150, "label": "1 taza" },
      { "name": "Zapallo",                          "grams":  70, "label": "½ taza" },
      { "name": "Porotos verdes cocidos",           "grams":  70, "label": "¾ taza" },
      { "name": "Cebolla cruda",                    "grams":  60, "label": "¾ taza" },
      { "name": "Betarraga cocida",                 "grams":  90, "label": "½ taza" },
      { "name": "Espinaca cocida",                  "grams": 130, "label": "½ taza" },
      { "name": "Acelga cocida",                    "grams": 110, "label": "½ taza" },
      { "name": "Berenjena cocida",                 "grams": 100, "label": "½ taza" },
      { "name": "Champiñón cocido",                 "grams": 100, "label": "¾ taza" },
      { "name": "Alcachofa cocida",                 "grams":  50, "label": "1 unidad" },
      { "name": "Coles de Bruselas",                "grams": 100, "label": "½ taza" }
    ]},
    "VL": { "kcal": 10, "protein_g": 0, "carbs_g": 2.5, "fats_g": 0, "source": "UDD p. 63", "foods": [
      { "name": "Lechuga",                          "grams":  50, "label": "1 taza" },
      { "name": "Apio",                             "grams":  70, "label": "1 taza" },
      { "name": "Repollo",                          "grams":  50, "label": "1 taza" },
      { "name": "Rúcula",                           "grams":  50, "label": "1 taza" },
      { "name": "Espinaca cruda",                   "grams":  50, "label": "1 taza" },
      { "name": "Acelga cruda",                     "grams":  50, "label": "1 taza" },
      { "name": "Pepino ensalada",                  "grams": 100, "label": "½ unidad" },
      { "name": "Pimentón rojo",                    "grams":  60, "label": "½ taza" },
      { "name": "Rabanito",                         "grams":  50, "label": "5 unidades" },
      { "name": "Cebollín",                         "grams":  30, "label": "½ unidad" },
      { "name": "Perejil",                          "grams":  30, "label": "3 cucharadas" },
      { "name": "Ajo",                              "grams":   8, "label": "8 dientes" }
    ]},
    "FR": { "kcal": 60, "protein_g": 0, "carbs_g": 15, "fats_g": 0, "source": "UDD pp. 65 y 67", "foods": [
      { "name": "Manzana",                          "grams": 100, "label": "1 unidad chica" },
      { "name": "Pera",                             "grams": 100, "label": "1 unidad chica" },
      { "name": "Plátano",                          "grams":  60, "label": "½ unidad" },
      { "name": "Naranja",                          "grams": 150, "label": "1 unidad regular", "source": "INTA p. 21" },
      { "name": "Mandarina",                        "grams": 180, "label": "2 unidades chicas" },
      { "name": "Frutilla",                         "grams": 200, "label": "1½ taza" },
      { "name": "Arándano",                         "grams": 120, "label": "½ taza" },
      { "name": "Frambuesa",                        "grams": 130, "label": "1 taza" },
      { "name": "Uva",                              "grams":  90, "label": "10 unidades" },
      { "name": "Melón",                            "grams": 180, "label": "1 taza" },
      { "name": "Piña",                             "grams": 120, "label": "¾ taza" },
      { "name": "Pepino dulce",                     "grams": 240, "label": "1 unidad grande" },
      { "name": "Ciruelas secas",                   "grams":  30, "label": "3 unidades" },
      { "name": "Pasas",                            "grams":  20, "label": "20 unidades" },
      { "name": "Higos frescos",                    "grams":  80, "label": "2 unidades" },
      { "name": "Huesillo",                         "grams":  30, "label": "1 unidad" }
    ]},
    "PCT": { "kcal": 140, "protein_g": 3, "carbs_g": 30, "fats_g": 1, "source": "UDD pp. 69, 70 y 71", "foods": [
      { "name": "Pan marraqueta",                   "grams":  50, "label": "½ unidad", "note": "alto en sodio" },
      { "name": "Pan hallulla",                     "grams":  50, "label": "½ unidad", "note": "alto en sodio" },
      { "name": "Pan de molde blanco",              "grams":  60, "label": "2½ rebanadas",
        "note": "INTA dice 60 g = 3 rebanadas; manda UDD" },
      { "name": "Pan de molde integral",            "grams":  50, "label": "2½ rebanadas" },
      { "name": "Pan amasado",                      "grams":  35, "label": "¼ unidad", "note": "alto en sodio" },
      { "name": "Pan pita blanco",                  "grams":  60, "label": "1½ unidades" },
      { "name": "Tortilla para tacos",              "grams":  50, "label": "1 tortilla grande" },
      { "name": "Galletas de agua",                 "grams":  40, "label": "7 unidades", "note": "alto en sodio" },
      { "name": "Galletas de soda",                 "grams":  40, "label": "7 unidades", "note": "alto en sodio" },
      { "name": "Arroz cocido",                     "grams": 130, "label": "¾ taza",
        "note": "INTA dice 100 g = ¾ taza; manda UDD" },
      { "name": "Arroz crudo",                      "grams":  40, "label": "¼ taza" },
      { "name": "Arroz integral cocido",            "grams": 120, "label": "¾ taza" },
      { "name": "Fideos cocidos",                   "grams": 110, "label": "¾ taza" },
      { "name": "Fideos crudos",                    "grams":  40, "label": "½ taza" },
      { "name": "Quínoa cocida",                    "grams": 110, "label": "¾ taza" },
      { "name": "Quínoa cruda",                     "grams":  40, "label": "¼ taza o 4 cucharadas" },
      { "name": "Avena",                            "grams":  40, "label": "6 cucharadas" },
      { "name": "Choclo cocido",                    "grams": 130, "label": "¾ taza" },
      { "name": "Mote de trigo",                    "grams": 100, "label": "¾ taza" },
      { "name": "Papa cocida",                      "grams": 150, "label": "1 unidad regular" },
      { "name": "Camote",                           "grams": 120, "label": "½ taza" },
      { "name": "Arvejas",                          "grams": 180, "label": "1 taza" },
      { "name": "Porotos granados",                 "grams": 120, "label": "¾ taza" },
      { "name": "Habas",                            "grams": 112, "label": "¾ taza" },
      { "name": "Granola",                          "grams":  30, "label": "⅓ taza" },
      { "name": "Cereales de desayuno sin azúcar",  "grams":  40, "label": "1 taza" },
      { "name": "Harina de trigo",                  "grams":  40, "label": "4 cucharadas" },
      { "name": "Cabritas",                         "grams":  35, "label": "1½ taza" }
    ]},
    "AG": { "kcal": 45, "protein_g": 0, "carbs_g": 0, "fats_g": 5, "source": "UDD p. 73", "foods": [
      { "name": "Aceite de oliva",                  "grams":   5, "label": "1 cucharadita" },
      { "name": "Aceite de maravilla",              "grams":   5, "label": "1 cucharadita" },
      { "name": "Aceite de maíz",                   "grams":   5, "label": "1 cucharadita" },
      { "name": "Aceite de soya",                   "grams":   5, "label": "1 cucharadita" },
      { "name": "Margarina",                        "grams":   6, "label": "1 cucharadita", "note": "alto en sodio" },
      { "name": "Margarina diet",                   "grams":  15, "label": "2 cucharaditas", "note": "alto en sodio" },
      { "name": "Mayonesa",                         "grams":  12, "label": "1 cucharada", "note": "alto en sodio" },
      { "name": "Mayonesa light",                   "grams":  18, "label": "1½ cucharadas", "note": "alto en sodio" },
      { "name": "Semillas de chía",                 "grams":  12, "label": "1 cucharada", "note": "aporta 2,3 g de proteína/porción" },
      { "name": "Linaza",                           "grams":  12, "label": "1 cucharada", "note": "aporta 2,3 g de proteína/porción" },
      { "name": "Semillas de zapallo",              "grams":   8, "label": "1 cucharada" },
      { "name": "Nuez",                             "grams":   7.5, "label": "1,5 unidades (3 mariposas)", "note": "aporta 1,4 g de proteína/porción" },
      { "name": "Palta",                            "grams":  30, "label": "2 cucharadas", "source": "INTA p. 33",
        "note": "DECIDIDO (RESOLUCIONES-2 R-16): la palta va a AG, 2 cucharadas = 30 g. INTA la deja en «alimentos ricos en lípidos» (175 kcal · 15 g grasa), un grupo que el set UDD NO tiene; no se crea un grupo 14. Queda anotado en SPEC «Fuera de alcance»" }
    ]},
    "AZ": { "kcal": 20, "protein_g": 0, "carbs_g": 5, "fats_g": 0, "source": "UDD p. 77", "foods": [
      { "name": "Azúcar",                           "grams":   5, "label": "1 cucharadita" },
      { "name": "Miel de abeja",                    "grams":   5, "label": "1 cucharadita" },
      { "name": "Miel de palma",                    "grams":   5, "label": "1 cucharadita" },
      { "name": "Chancaca",                         "grams":   5, "label": "1 cucharadita" },
      { "name": "Mermelada",                        "grams":   7.5, "label": "1 cucharadita" },
      { "name": "Dulce de membrillo",               "grams":   8, "label": "1 cucharadita" },
      { "name": "Dulce de camote",                  "grams":   8, "label": "1 cucharadita" },
      { "name": "Manjar",                           "grams":   7.5, "label": "¾ cucharadita" },
      { "name": "Jalea en polvo",                   "grams":   7, "label": "1 cucharadita colmada" },
      { "name": "Leche condensada",                 "grams":   7, "label": "1 cucharadita" },
      { "name": "Bebida gaseosa",                   "grams":  50, "label": "¼ taza" },
      { "name": "Néctar de fruta",                  "grams":  40, "label": "⅕ taza" }
    ]},
    "SCP": { "kcal": 120, "protein_g": 24, "carbs_g": 2, "fats_g": 1, "source": "EVA (S3, no viene de manual)", "foods": [
      { "name": "Proteína de suero (whey) en polvo", "grams": 30, "label": "1 scoop" }
    ]}
  }
}
```

**Totales:** LD 8 · LS 8 · LE 12 · CB 16 · CA 14 · LGS 9 · VG 16 · VL 12 · FR 16 · PCT 28 · AG 13 · AZ 12 · SCP 1 = **165 filas curadas**. Los 9 grupos que el pedido exige con ≥ 8 (PCT, CB, CA, LD, LS, LE, FR, VG, LGS) los cumplen.

### 5.3 Regla de alta de un `food` del sistema cuando no existe

r4 §8.1-E ya verificó en LIVE que **los 27 términos genéricos de INTA/UDD tienen al menos una coincidencia genérica** en `foods` (marraqueta 10 / 2 genéricas, hallulla 9/2, pan de molde 15/2, arroz 88/15, papa 79/15, poroto 43/23, lenteja 15/4, garbanzo 15/4, quinoa 28/5, avena 78/6, leche 181/29, yogur 83/15, queso 195/24, palta 9/1, merluza 15/2, huevo 35/14). O sea: **el trabajo es elegir bien, no crear.** Igual hace falta la regla para los que falten.

```sql
-- Alta de food del sistema. Molde: _POST_DEPLOY_20260611093002:124-132.
-- MACROS OBLIGATORIOS (regla del owner «alimentos siempre con macros»): sin los
-- cuatro valores por 100 g NO se crea la fila. El trigger de densidad
-- (20260906213000_foods_density_review.sql) marcara `review_reason` si la
-- densidad es implausible: es un AVISO, no un candado.
insert into public.foods
  (name, brand, calories, protein_g, carbs_g, fats_g,
   serving_size, serving_unit, macros_basis, category,
   catalog_source, country_code, coach_id, org_id,
   household_label, household_grams)
select :name, null, :kcal_100, :prot_100, :carb_100, :fat_100,
       100, 'g', 'per_100', :category,
       'eva', 'CL', null, null,
       :household_label, :household_grams
where not exists (
  select 1 from public.foods f
  where lower(f.name) = lower(:name) and f.coach_id is null and f.org_id is null
);
```

Reglas del alta:

- `macros_basis = 'per_100'` con `serving_size = 100`: el par correcto para un dato de tabla de composición. El seed V1 hacía `serving_size = portion_grams` + `per_serving` (`:124-132` + backfill `20260728120000:76-79`) y por eso quedó una convención mezclada en el catálogo; **no se repite**.
- `household_label` / `household_grams` (`20260906202957_nutrition_v2_household_units.sql`) se llenan con la medida casera del manual **cuando la unidad es del alimento** («1 unidad de pan marraqueta = 100 g»), no con la porción de intercambio. Si no hay unidad natural, van `null` los dos (CHECK `..._household_pair` exige el par completo).
- `catalog_source = 'eva'` (CHECK de `20260714073000:52`), `country_code = 'CL'`, `coach_id`/`org_id` `null` ⇒ alimento global.
- **No hay columna `source_note` en `foods`** (verificado: la tabla no la declara). La atribución «INTA 1999 / UDD 2019» queda en el **informe** del script y en la SPEC, no en la fila.
- **Nunca** se tocan `foods.exchange_group_id` / `exchange_portion_grams` / `exchange_portion_label`: un alimento tiene UNA sola fila legacy y ya apunta al grupo SMAE. Reescribirla mataría el set legado. El set chileno vive **solo** en `exchange_group_foods`.
- Consecuencia declarada (R6): el conteo del picker web (`_actions/portions-groups.actions.ts:65-84`) cuenta `foods.exchange_group_id`, así que mostraría «0 equivalencias» para los 13 chilenos. **Prerrequisito de W1**: cambiarlo a `getExchangeListCounts` (`exchange-lists.service.ts:427-433`), que ya usa la ruta móvil (`api/mobile/nutrition-v2/exchange-groups/route.ts:88-95`).

### 5.4 Filas marcadas «derivado»

Tres filas del JSON no salen literal de una lámina (`Queso cottage 1%` en LD, `Naranja` en FR desde INTA, `Palta` en AG desde INTA p. 33). Van con `"source"` propio y el script las marca aparte en el informe para que el owner las apruebe con nombre y apellido.

---

## 6. `packages/nutrition-v2/exchange-conversion.ts`

> **Corrección W3 (jefe, 09-09, decisión (ad)).** Donde este capítulo dice `catalog.filter((g) => isClGroup(g, coachSystem))`, el código real usa `makeIsClDestination(catalog)`: manda el `portionSystem` explícito de cada fila y `CL_CODES` solo se usa cuando ninguna fila declara set. Con la firma literal, un grupo propio con código `FR`/`PCT` era destino y los customs de josefit y Pame se proponían como reemplazo de sí mismos para un coach `cl`. `coachSystem` no participa del filtro. La identidad del reemplazo S5 es por `exchangeGroupId`. Además `draftUsesLegacySmae(variants, groups, coachSystem)` (banner) cuenta solo grupos con `isSystem !== false` y `systemOf === 'smae'`.

```ts
/**
 * Conversion de un borrador de plan del set SMAE al set chileno (D1-A, S4).
 *
 * PURO: sin IO, sin Supabase, sin React/RN. Opera sobre el estado editable del
 * editor unico (`QeVariant[]`) y devuelve un estado NUEVO mas un diff legible.
 * La escritura la hace el camino de siempre: REPLACE_PORTION_GROUPS aplica el
 * resultado al borrador y se publica con `persist_and_publish_nutrition_plan_v2`,
 * que re-congela los snapshots (plan-persistence.ts:674-696).
 *
 * NUNCA sobre una version publicada (T-05): los `snapshot_*` de
 * nutrition_slot_exchange_targets_v2 (20260718140000:44-53) estan congelados y un
 * plan publicado no cambia de significado porque cambie el catalogo. Jamas un
 * `UPDATE nutrition_slot_exchange_targets_v2 SET portions = …`.
 */

import {
  dayTotalsByVariant,
  macrosForTargets,                 // expande composed_of (S-06, ver refOf)
  type ExchangeGroup,
  type ExchangeMacroTotals,
} from '@eva/nutrition-engine'
import type { QePortionGroup, QePortionTarget, QeVariant } from './editor-state'
import { qeExchangeGroups, parsePortionsValue } from './editor-state'
// `isClGroup` y `systemOf` NO se definen aca: nacen en `exchange-visibility.ts`
// (§7), en la tarea W1.4, y este archivo (W3) los IMPORTA. Escribirlos en W3
// dejaria a W1 usando un simbolo que nadie escribio todavia (fix consistencia
// X-07). La firma canonica es `isClGroup(group, coachSystem)`.
import {
  CL_CODES,
  isClGroup,
  systemOf,
  type PortionSystem,
} from './exchange-visibility'

// ---------------------------------------------------------------------------
// Mapa fijo 9 → 13 (OUTLINE §6). El factor NO se calcula en runtime: se escribe.
// ---------------------------------------------------------------------------

export type ClDairyCode = 'LD' | 'LS' | 'LE'
export type ClKeyMacro = 'calories' | 'protein' | 'carbs' | 'fats'

export type ClConversionRule = {
  /** Codigo del grupo chileno destino. `null` ⇒ el destino lo elige el coach. */
  readonly to: string | null
  /** Macro por el que se reescala (R1). */
  readonly keyMacro: ClKeyMacro
  /** portions_dest = portions_orig × factor. */
  readonly factor: number
  /** true ⇒ la fila SIEMPRE sale marcada «Revisar» en el preview. */
  readonly alwaysReview?: boolean
}

/**
 * Factores = ref_orig[macro clave] / ref_dest[macro clave], con los valores del
 * seed V1 (_POST_DEPLOY_20260611093002:19-31) y del set chileno (OUTLINE §5.1).
 * Estan escritos como literales y verificados en los tests de tabla (§6.4): si
 * alguien cambia un ref en la DB, el test rojo avisa antes que el coach.
 */
export const CL_CONVERSION_MAP: Readonly<Record<string, ClConversionRule>> = {
  //  C  70·2·15·0  →  PCT 140·3·30·1   CHO 15/30
  C:   { to: 'PCT', keyMacro: 'carbs',    factor: 0.5 },
  //  P  55·7·0·3   →  CB   65·11·1·2    proteina 7/11
  P:   { to: 'CB',  keyMacro: 'protein',  factor: 7 / 11 },
  //  F  60·0·15·0  →  FR   60·0·15·0    CHO 15/15
  F:   { to: 'FR',  keyMacro: 'carbs',    factor: 1 },
  //  V  25·2·4·0   →  VG   25·2·5·0     CHO 4/5
  V:   { to: 'VG',  keyMacro: 'carbs',    factor: 0.8 },
  // LAC 95·9·12·2  →  LD | LS | LE      kcal; destino elegido por el coach (R3)
  LAC: { to: null,  keyMacro: 'calories', factor: Number.NaN, alwaysReview: true },
  // ARL 45·0·0·5   →  AG   45·0·0·5     grasa 5/5 · colapsa con G (R2)
  ARL: { to: 'AG',  keyMacro: 'fats',     factor: 1 },
  //  G  45·0·0·5   →  AG   45·0·0·5     grasa 5/5 · colapsa con ARL (R2)
  G:   { to: 'AG',  keyMacro: 'fats',     factor: 1 },
  // LEG compuesto (efectivo 125·9·15·3) → LGS 170·11·30·1   CHO 15/30
  LEG: { to: 'LGS', keyMacro: 'carbs',    factor: 0.5 },
  // SP 120·24·2·1  →  SCP 120·24·2·1    proteina 24/24
  SP:  { to: 'SCP', keyMacro: 'protein',  factor: 1 },
} as const

/** Factores del eje lacteo por destino: kcal_LAC(95) / kcal_dest. */
export const CL_DAIRY_FACTORS: Readonly<Record<ClDairyCode, number>> = {
  LD: 95 / 70,   // ≈ 1,357
  LS: 95 / 85,   // ≈ 1,118
  LE: 95 / 110,  // ≈ 0,864
} as const

// ---------------------------------------------------------------------------
// Redondeo
// ---------------------------------------------------------------------------

/**
 * Redondeo al paso real del dominio. El CHECK de la tabla exige
 * `portions > 0 and portions <= 99 and (portions*2) = floor(portions*2)`
 * (20260718140000:37-38) y el contrato Zod lo espeja (contracts.ts:180-187).
 * Piso 0,5 (nunca 0: un 0 borraria la porcion en silencio) y techo 99.
 */
export function round05(value: number): number {
  if (!Number.isFinite(value)) return 0.5
  const snapped = Math.round(value * 2) / 2
  return Math.min(Math.max(snapped, 0.5), 99)
}

// ---------------------------------------------------------------------------
// Tipos del resultado
// ---------------------------------------------------------------------------

export type ClConversionOrigin = {
  /** Codigo SMAE de origen ('ARL', 'G', …). */
  readonly code: string
  readonly name: string
  readonly portions: number
}

export type ClConversionRow = {
  readonly variantKey: string
  readonly slotKey: string
  readonly slotName: string
  /** Uno o DOS origenes: ARL + G colapsan en la misma fila destino (R2). */
  readonly from: readonly ClConversionOrigin[]
  readonly toCode: string
  readonly toName: string
  readonly toPortions: number
  readonly kcalBefore: number
  readonly kcalAfter: number
  /** true ⇒ chip «Revisar»: destino lacteo, o |Δkcal| / kcal_orig > 10 %. */
  readonly review: boolean
}

export type ClConversionUnresolved = {
  readonly variantKey: string
  readonly slotKey: string
  readonly exchangeGroupId: string
  readonly groupCode: string
  readonly groupName: string
  /** 'custom_sin_match' | 'sin_regla' | 'destino_ausente_en_catalogo' */
  readonly reason: 'custom_sin_match' | 'sin_regla' | 'destino_ausente_en_catalogo'
  /** Solo para 'custom_sin_match' cuando SI hay un unico candidato (S5). */
  readonly suggestedCode?: string
}

export type ClConversionDayDelta = {
  readonly variantKey: string
  readonly label: string
  readonly before: ExchangeMacroTotals
  readonly after: ExchangeMacroTotals
}

export type ClConversionResult = {
  /** Variantes NUEVAS (inmutable: el input no se muta). */
  readonly variants: QeVariant[]
  readonly diff: readonly ClConversionRow[]
  readonly unresolved: readonly ClConversionUnresolved[]
  readonly dayDeltas: readonly ClConversionDayDelta[]
}

export type ClConversionInput = {
  readonly variants: readonly QeVariant[]
  /** Catalogo vivo del coach, ya proyectado (`catalogToPortionGroups`). Debe traer los 13 'cl'. */
  readonly catalog: readonly QePortionGroup[]
  /** `coaches.portion_system` del coach; resuelve el `portionSystem` ausente (R18). */
  readonly coachSystem: PortionSystem
  /** Eleccion del coach por franja para el eje lacteo. Default 'LD' (R3, Q3). */
  readonly dairyChoiceBySlot?: Readonly<Record<string, ClDairyCode>>
  /** Reemplazos de grupos CUSTOM aceptados por el coach: exchangeGroupId → code cl (S5). */
  readonly customReplacements?: Readonly<Record<string, string>>
}

// ---------------------------------------------------------------------------
// Match de grupos custom (S5)
// ---------------------------------------------------------------------------

/**
 * Un grupo custom «calza» con un chileno si sus cuatro refs entran en ±5 kcal y
 * ±1 g en cada macro, y el match es UNICO. Con dos candidatos NO se propone nada:
 * mejor dejar el custom intacto que reemplazarlo por el equivocado.
 * El custom NUNCA se borra (soft-delete rompe borradores ajenos,
 * nutrition-exchanges.service.ts:229-233).
 */
export function matchCustomGroupToCl(
  custom: QePortionGroup,
  clGroups: readonly QePortionGroup[],
): string | null {
  const hits = clGroups.filter((cl) =>
    Math.abs(cl.ref.calories - custom.ref.calories) <= 5 &&
    Math.abs(cl.ref.proteinG - custom.ref.proteinG) <= 1 &&
    Math.abs(cl.ref.carbsG - custom.ref.carbsG) <= 1 &&
    Math.abs(cl.ref.fatsG - custom.ref.fatsG) <= 1)
  return hits.length === 1 ? hits[0].groupCode : null
}

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

const REVIEW_KCAL_TOLERANCE = 0.10

export function convertPortionsToCl(input: ClConversionInput): ClConversionResult {
  const { variants, catalog, coachSystem, dairyChoiceBySlot = {}, customReplacements = {} } = input

  const clByCode = new Map(
    catalog.filter((g) => isClGroup(g, coachSystem)).map((g) => [g.groupCode, g]))
  const engineGroupsBefore = qeExchangeGroups(catalog)

  const diff: ClConversionRow[] = []
  const unresolved: ClConversionUnresolved[] = []

  const nextVariants = variants.map((variant) => ({
    ...variant,
    slots: variant.slots.map((slot) => {
      // 1) Acumular por grupo DESTINO: ARL + G caen en el mismo bucket (R2/T-06).
      //    UNIQUE (meal_slot_id, exchange_group_id) (20260718140000:60) hace que
      //    emitir dos filas al mismo grupo aborte el RPC entero con un 23505 que
      //    ni siquiera nombra la franja. Se colapsa ANTES de armar el payload.
      type Bucket = { group: QePortionGroup; portions: number; origins: ClConversionOrigin[]; review: boolean }
      const buckets = new Map<string, Bucket>()
      // LAYOUT: el ORDEN de la franja tal como lo va a ver el coach (fix R-08).
      // `QePortionTarget` no tiene `orderIndex`: el orden ES la posicion en el
      // array. Con `[...converted, ...kept]` todo lo convertido saltaba al
      // principio y lo no convertible al final, o sea la conversion REORDENABA la
      // franja sin decirlo en el preview. Cada destino se materializa en el lugar
      // de su PRIMER origen, y los targets intactos conservan su posicion.
      type Slotted =
        | { readonly kind: 'kept'; readonly target: QePortionTarget }
        | { readonly kind: 'bucket'; readonly code: string }
      const layout: Slotted[] = []

      for (const target of slot.portionTargets) {
        const portions = parsePortionsValue(target.portions) ?? 0
        if (!(portions > 0)) { layout.push({ kind: 'kept', target }); continue }

        const destCode = resolveDestinationCode(target, slot.key, dairyChoiceBySlot, customReplacements, catalog, clByCode)
        if (destCode == null) {
          unresolved.push(describeUnresolved(variant.variantKey, slot.key, target, catalog, clByCode))
          layout.push({ kind: 'kept', target })   // el target original SOBREVIVE intacto y EN SU LUGAR
          continue
        }
        const dest = clByCode.get(destCode)
        if (dest == null) {
          unresolved.push({
            variantKey: variant.variantKey, slotKey: slot.key,
            exchangeGroupId: target.exchangeGroupId, groupCode: target.groupCode,
            groupName: target.groupName, reason: 'destino_ausente_en_catalogo',
          })
          layout.push({ kind: 'kept', target })
          continue
        }

        const factor = factorFor(target.groupCode, destCode)
        const converted = round05(portions * factor)
        if (!buckets.has(destCode)) layout.push({ kind: 'bucket', code: destCode })  // primer origen ⇒ su lugar
        const bucket = buckets.get(destCode) ?? { group: dest, portions: 0, origins: [], review: false }
        bucket.portions += converted
        bucket.origins.push({ code: target.groupCode, name: target.groupName, portions })
        bucket.review ||= isDairy(destCode)
        buckets.set(destCode, bucket)
      }

      // 2) Materializar los buckets como targets nuevos, indexados por code para
      //    que el layout los ponga en el lugar de su primer origen.
      const convertedByCode = new Map<string, QePortionTarget>()
      for (const [code, bucket] of buckets) {
        // El re-round05 despues de sumar dos origenes evita 1,5 + 1,5 = 3 exacto
        // pero tambien 0,75 + 0,75; con dos round05 previos la suma ya es multiplo
        // de 0,5, asi que esto es un cinturon, no una correccion.
        const portions = round05(bucket.portions)
        // refOf EXPANDE COMPUESTOS (ver abajo). Con el ref crudo, LEG da 0 kcal
        // (sus ref_* estan en 0 y su valor vive en composed_of) y el preview
        // imprimiria «0 → 85 kcal» — el bug D5, reintroducido en el preview.
        const kcalBefore = bucket.origins.reduce(
          (acc, o) => acc + refOf(o.code, catalog).calories * o.portions, 0)
        const kcalAfter = bucket.group.ref.calories * portions
        // `: 0` solo puede pasar si el origen no tiene kcal NI expandidas. Ahi no
        // se puede medir drift, asi que la fila sale marcada «Revisar» igual: no
        // se muestra sin aviso una fila cuyo delta no sabemos calcular.
        const driftUnknown = !(kcalBefore > 0)
        const drift = driftUnknown ? 0 : Math.abs(kcalAfter - kcalBefore) / kcalBefore

        diff.push({
          variantKey: variant.variantKey, slotKey: slot.key, slotName: slot.name,
          from: bucket.origins, toCode: code, toName: bucket.group.groupName,
          toPortions: portions,
          kcalBefore: round1(kcalBefore), kcalAfter: round1(kcalAfter),
          review: bucket.review || driftUnknown || drift > REVIEW_KCAL_TOLERANCE,
        })

        convertedByCode.set(code, {
          key: `cl:${slot.key}:${code}`,
          id: null,                        // alta nueva: el target viejo no se re-usa
          exchangeGroupId: bucket.group.exchangeGroupId,
          groupCode: code,
          groupName: bucket.group.groupName,
          color: bucket.group.color,
          macrosConfirmed: bucket.group.macrosConfirmed,
          portions: formatPortions05(portions),
          notes: mergeNotes(bucket.origins, slot),
        })
      }

      // 3) Reconstruir la franja EN ORDEN (R-08): cada destino en el lugar de su
      //    primer origen, cada target intacto en el suyo.
      const portionTargets = layout.flatMap((entry) =>
        entry.kind === 'kept'
          ? [entry.target]
          : [convertedByCode.get(entry.code)!])

      return { ...slot, portionTargets }
    }),
  }))

  return {
    variants: nextVariants,
    diff,
    unresolved,
    dayDeltas: buildDayDeltas(variants, nextVariants, catalog, clByCode, engineGroupsBefore),
  }
}

// ---------------------------------------------------------------------------
// refOf — el ref EFECTIVO de un grupo origen (fix seguridad:S-06)
// ---------------------------------------------------------------------------

/**
 * Macros de UNA porcion del grupo `code`, CON los compuestos expandidos.
 *
 * NO devuelve `group.ref` crudo. `LEG` del SMAE tiene `ref_calories = 0` y su
 * valor real vive en `composed_of` (SPEC §2 causa 5): con el ref crudo, el
 * preview de la conversion imprime «0 → 85 kcal» y, peor, `drift` cae en la rama
 * de kcalBefore = 0 y la fila sale SIN el chip «Revisar» — justo la fila que mas
 * se mueve de todo el tren (−32 % de energia) llegaria sin aviso a los ojos de
 * una nutricionista. Es el bug D5 reintroducido en otra pantalla.
 *
 * Reusa el motor, no reimplementa: `macrosForTargets` ya expande compuestos
 * (packages/nutrition-engine/exchange-calc.ts:84-100). Alternativa equivalente y
 * preferible si W2.2 ya lo dejo escrito: `qeGroupRefPerPortion(group, groups)`
 * (OUTLINE §7), que es el MISMO helper que arregla las 6 etiquetas «1 porcion ≈»
 * y la cabecera del sheet del alumno (R11). Un solo helper para los tres lugares.
 */
function refOf(code: string, catalog: readonly QePortionGroup[]): ExchangeMacroTotals {
  const group = catalog.find((g) => g.groupCode === code)
  if (group == null) return { calories: 0, proteinG: 0, carbsG: 0, fatsG: 0 }
  return macrosForTargets(
    [{ exchangeGroupId: group.exchangeGroupId, portions: 1 }],
    qeExchangeGroups(catalog),          // trae composed_of de todo el catalogo
  )
}

// ---------------------------------------------------------------------------
// Delta del dia (antes / despues), con el motor real
// ---------------------------------------------------------------------------

/**
 * Usa `dayTotalsByVariant` (packages/nutrition-engine/exchange-calc.ts:126-142),
 * el MISMO calculo que ve el alumno. Cada variante del editor se proyecta como
 * una «variante» del motor y cada franja como una comida con `dayVariantId` igual
 * a esa variante, de modo que ninguna franja cuente en dos dias.
 */
function buildDayDeltas(
  before: readonly QeVariant[],
  after: readonly QeVariant[],
  catalog: readonly QePortionGroup[],
  clByCode: ReadonlyMap<string, QePortionGroup>,
  groups: ExchangeGroup[],
): ClConversionDayDelta[] {
  const variantsRef = before.map((v) => ({ id: v.variantKey, name: v.label }))
  const toMeals = (vs: readonly QeVariant[]) =>
    vs.flatMap((v) => v.slots.map((s) => ({
      dayVariantId: v.variantKey,
      targets: s.portionTargets.map((t) => ({
        exchangeGroupId: t.exchangeGroupId,
        portions: parsePortionsValue(t.portions) ?? 0,
      })).filter((t) => t.portions > 0),
    })))

  const groupsAfter = qeExchangeGroups([...catalog, ...clByCode.values()])
  const totalsBefore = dayTotalsByVariant(toMeals(before), variantsRef, groups)
  const totalsAfter = dayTotalsByVariant(toMeals(after), variantsRef, groupsAfter)

  return before.map((v, i) => ({
    variantKey: v.variantKey,
    label: v.label,
    before: totalsBefore[i].totals,
    after: totalsAfter[i].totals,
  }))
}
```

### 6.4 Tabla de casos de test — `packages/nutrition-v2/exchange-conversion.test.ts`

Los máximos y las cantidades salen de STATS (porciones reales en LIVE), no de números inventados.

| # | Caso | Entrada | Salida esperada |
|---|---|---|---|
| 1 | `round05` piso | `round05(0.2)` | `0.5` |
| 2 | `round05` medio exacto | `round05(1.25)` | `1.5` (`Math.round(2.5) = 3`) |
| 3 | `round05` techo | `round05(140)` | `99` |
| 4 | `round05` no finito | `round05(NaN)` | `0.5` |
| 5 | Cereales típico | 1 franja, `C` × 2 | `PCT` × 1 · kcal 140 → 140 · `review = false` |
| 6 | Cereales máximo real | `C` × 4 | `PCT` × 2 · 280 → 280 |
| 7 | Proteínas máximo real | `P` × 25 | `CB` × 16 (25 × 0,636 = 15,909 → 16) · 1.375 → 1.040 kcal · **`review = true`** (drift 24 %) |
| 8 | Proteínas 1 porción | `P` × 1 | `CB` × 0,5 (0,636 → 0,5) · 55 → 32,5 · `review = true` |
| 9 | Frutas máximo real | `F` × 8,5 | `FR` × 8,5 · 510 → 510 · `review = false` |
| 10 | Verduras máximo real | `V` × 7,5 | `VG` × 6 · 187,5 → 150 · `review = true` (drift 20 %) |
| 11 | Lácteo default | `LAC` × 1, sin `dairyChoiceBySlot` | `LD` × 1,5 (1,357 → 1,5) · 95 → 105 · **`review = true`** (siempre, R3) |
| 12 | Lácteo máximo real, entero | `LAC` × 5,5 con `{ [slot]: 'LE' }` | `LE` × 5 (5,5 × 0,864 = 4,75 → 5) · 522,5 → 550 · `review = true` |
| 13 | Lácteo semi | `LAC` × 2 con `{ [slot]: 'LS' }` | `LS` × 2 (2,236 → 2) · 190 → 170 · `review = true` |
| 14 | **Colapso ARL + G (T-06)** | misma franja: `ARL` × 1 y `G` × 1 | **UNA** fila `AG` × 2 con `from.length === 2` · 90 → 90 · `slot.portionTargets` tiene 1 solo target de `AG` |
| 15 | Colapso con decimales | `ARL` × 1,5 y `G` × 0,5 | `AG` × 2 · 90 → 90 |
| 16 | Legumbres compuesto | `LEG` × 1 | `LGS` × 0,5 · **125** → 85 · `review = true` (drift 32 %). El `kcalBefore` es **125**, no 0: `refOf` expande `composed_of` (S-06). Con el ref crudo saldría «0 → 85» y sin chip «Revisar» |
| 16b | **`kcalBefore` de un origen compuesto ≠ 0** (test dedicado, S-06) | `LEG` × 1 con `ref_calories = 0` y `composed_of` en el catálogo | `diff[0].kcalBefore === 125` y `diff[0].review === true`. Es el test que impide que alguien «simplifique» `refOf` a `group.ref` |
| 16c | Origen sin kcal ni expandidas | grupo custom con los cuatro refs en 0 | `review === true` (drift no calculable ⇒ se avisa igual, nunca se muestra sin aviso) |
| 17 | Legumbres × 2 | `LEG` × 2 | `LGS` × 1 · 250 → 170 · `review = true` |
| 18 | Scoop | `SP` × 4,5 | `SCP` × 4,5 · 540 → 540 · `review = false` |
| 19 | Grupo custom con match único | custom `140·3·30·1` (Pame) + `customReplacements` aceptado | `PCT` × porciones sin reescalar (factor 1 por macro clave) |
| 20 | Grupo custom sin match | custom `422 kcal` (`josefit`) | `unresolved[0].reason === 'custom_sin_match'` · el target original **sigue en `slot.portionTargets`** |
| 21 | Grupo custom con 2 candidatos | custom `60·0·15·0` que empata con `FR` y con otro | `matchCustomGroupToCl` → `null` (no se propone nada) |
| 22 | Catálogo sin el set chileno | `catalog` con solo los 9 SMAE, **cada uno con `portionSystem: 'smae'`** (si el fixture lo omite, `systemOf` los cae al set del coach: ver la nota de `isClGroup`) | todo a `unresolved` con `destino_ausente_en_catalogo` · `variants` idéntico al input |
| 23 | Inmutabilidad | cualquier caso | `input.variants` NO mutado (`toEqual` contra una copia profunda previa) |
| 24 | Delta del día | 1 variante con `C` × 2 y `LAC` × 1 | `dayDeltas[0].before.calories === 235` · `after.calories === 245` |
| 25 | Día sin porciones | variante con `portionTargets: []` | `diff` vacío · `dayDeltas[0].before === dayDeltas[0].after` |
| 26 | Franja mixta | `C` × 2 + `P` × 1 + `G` × 1 en la misma franja | 3 targets destino (`PCT`, `CB`, `AG`), ninguno duplicado, **en ese mismo orden** (R-08) |
| 27 | Texto de porciones inválido | target con `portions: 'abc'` | el target sobrevive intacto **y en su posición**, no genera fila de diff ni `unresolved` |
| 28 | **Orden relativo (R-08)** | franja `[custom sin match, C × 2, P × 1]` | `portionTargets` sale `[custom, PCT, CB]`: el no convertible **no se va al final** y cada destino queda donde estaba su primer origen |
| 29 | **Colapso y posición** | franja `[ARL × 1, C × 2, G × 1]` | `[AG, PCT]`: `AG` se materializa en la posición de `ARL` (su primer origen), no al final ni al principio |
| 30 | **`isClGroup` con el campo ausente (R18)** — *el caso se escribe en `exchange-visibility.test.ts` (§7.2, caso 16), porque el helper nace en W1.4; acá solo se consume* | grupo del plan con `portionSystem: undefined`, `groupCode: 'PCT'`, `coachSystem: 'smae'` | `true` por el fallback de `CL_CODES`; y con `groupCode: 'C'` ⇒ `false` (cae a `coachSystem`), nunca marcado legado por falta de dato |

---

## 7. `packages/nutrition-v2/exchange-visibility.ts`

Se escribe entero en **W1.4**. Exporta `PortionSystem`, `CL_CODES`, `systemOf`, **`isClGroup(group, coachSystem)`**, `visibleExchangeGroupsForCoach` y `compareVisibleGroups`. Los dos helpers de set (`systemOf` e `isClGroup`) nacen acá y no en `exchange-conversion.ts` (W3), que los importa: así ninguna ola usa un símbolo que otra posterior escribe (fix consistencia X-07).

```ts
/**
 * Que grupos de intercambio ve un coach en el picker (D1-A, S1/S2).
 *
 * PURO y UNICO: hay varias superficies que PINTAN el catalogo (picker web, sheet
 * RN sobre la lista mergeada, respuesta de la ruta movil V2) y si la regla se
 * copia en cada una, el picker miente en alguna. Todas llaman a esta funcion.
 *
 * DONDE NO VA (R13 + S-01, §7.3): NUNCA dentro de `findExchangeGroupsForScope`
 * NI de `getExchangeGroupsForCoach`. Los dos son el catalogo de AUTORIZACION:
 * alimentan `findExchangeGroupConflict` (unicidad de `code`, T-02) desde
 * `nutrition-exchanges.service.ts:188-193` y `:215-221`, y la ruta
 * `api/mobile/nutrition/exchanges/group-foods/route.ts:74-82`, que devuelve 404
 * si el grupo pedido no esta en esa lista. Esta funcion es de PRESENTACION y vive
 * en los bordes.
 *
 * Regla: UNION, nunca exclusion.
 *   visibles(coach) = custom del coach/team
 *                   ∪ system con portionSystem = coachSystem
 *                   ∪ (si el coach tiene targets vivos en el otro set) ese set,
 *                     marcado legacy: true
 *
 * El coach que convierte todos sus planes deja de tener targets en el set viejo y
 * el legado desaparece de su picker SIN NINGUN WRITE — que es exactamente lo que
 * pide S1, y por eso NO hace falta backfillear a nadie (R14-bis).
 */

import type { ExchangeGroup } from '@eva/nutrition-engine'

export type PortionSystem = 'smae' | 'cl'

/** Los 13 codigos del set chileno (§0). Son nuevos: no colisionan con los 9 SMAE. */
export const CL_CODES: ReadonlySet<string> = new Set([
  'LD', 'LS', 'LE', 'CB', 'CA', 'LGS', 'VG', 'VL', 'FR', 'PCT', 'AG', 'AZ', 'SCP',
])

/** Grupo del catalogo con la marca de «legado» resuelta para ESTE coach. */
export type VisibleExchangeGroup = ExchangeGroup & {
  readonly portionSystem: PortionSystem
  /** true ⇒ chip «Legado (SMAE)» y seccion colapsada en el picker. */
  readonly legacy: boolean
}

/**
 * Forma minima que resuelve `systemOf`: sirve para `ExchangeGroup` (que trae
 * `code`) y para `QePortionGroup` (que trae `groupCode` y puede no traer el set,
 * porque el snapshot congelado no lo guarda). R18.
 */
export type SystemResolvable = {
  /** Sin `| null`: `ExchangeGroup.portionSystem?` (W1.1) es `'smae' | 'cl' | undefined`; el mapeador del repo coacciona a `undefined`. */
  readonly portionSystem?: PortionSystem
  readonly code?: string
  readonly groupCode?: string
}

export type VisibilityInput = {
  /** Catalogo completo YA acotado por RLS (custom ajenos jamas llegan aca). */
  readonly groups: readonly (ExchangeGroup & { portionSystem?: PortionSystem })[]
  /** `coaches.portion_system`. Ausente/desconocido ⇒ 'cl' (default de la columna). */
  readonly coachSystem: PortionSystem | null | undefined
  /**
   * Sets con al menos un target VIVO en los planes del coach. NO se adivina ni se
   * deriva de `coachSystem`: la calcula `findUsedPortionSystemsForCoach` (§7.1) y
   * la pasan los bordes de presentacion.
   *
   * FAIL-OPEN (R14 punto 4): `undefined` = «no se pudo leer» ⇒ se muestran AMBOS
   * sets sin marcar legado. `[]` = «se leyo y no usa nada» ⇒ solo el set propio.
   * La diferencia importa: el catalogo ya es best-effort en el borde RN
   * (`QuickEditMode.tsx:641-647` traga el error), y esconder un grupo que el plan
   * del coach usa es peor que mostrar uno de mas.
   */
  readonly usedSystems: readonly PortionSystem[] | undefined
}

const DEFAULT_SYSTEM: PortionSystem = 'cl'

/**
 * Set de un grupo, con el ausente resuelto (R18):
 *
 *   group.portionSystem ?? (CL_CODES.has(code) ? 'cl' : coachSystem)
 *
 * El ausente NO cae a 'smae'. Los grupos que salen del plan
 * (`collectPortionGroups`, editor-state.ts:549-568) se reconstruyen del snapshot
 * congelado, que no guarda el set: con el default 'smae', un grupo CHILENO ya
 * prescrito quedaria con el chip «Legado (SMAE)» dentro de la seccion colapsada.
 * Con este orden —dato explicito, luego codigo, luego set del coach— un grupo sin
 * dato nunca se marca legado ni se esconde.
 */
export function systemOf(group: SystemResolvable, coachSystem: PortionSystem): PortionSystem {
  if (group.portionSystem === 'cl' || group.portionSystem === 'smae') return group.portionSystem
  const code = group.groupCode ?? group.code
  if (code != null && CL_CODES.has(code)) return 'cl'
  return coachSystem
}

/**
 * ¿El grupo es «del set chileno» para ESTE coach? (R18, fix consistencia X-07.)
 *
 * Vive ACA, no en `exchange-conversion.ts`: los dos helpers —`systemOf` e
 * `isClGroup`— nacen juntos en **W1.4** y el conversor de W3 los importa. Si
 * naciera en W3, W1 estaria usando un simbolo que nadie escribio todavia.
 *
 * Firma canonica de DOS parametros: `QePortionGroup` NO declara `isSystem` y su
 * `portionSystem?` puede faltar (los grupos que salen del plan los reconstruye
 * `collectPortionGroups`, editor-state.ts:549-568, desde el snapshot congelado,
 * que no guarda el set). Por eso el ausente NO cae a 'smae': cae al set del
 * coach, con el fallback por codigo antes.
 *
 *   isClGroup(g, coachSystem) = systemOf(g, coachSystem) === 'cl'
 *
 * ⚠ Consecuencia del fallback, y hay que tenerla presente al armar fixtures: un
 * grupo SIN `portionSystem` y con un code SMAE ('C') cae al set del coach, asi
 * que para un coach 'cl' devuelve true. En produccion no pasa —el catalogo llega
 * de `catalogToPortionGroups`, que SI propaga la columna—, pero un test que arme
 * grupos SMAE a mano tiene que ponerles `portionSystem: 'smae'` o estara probando
 * otra cosa. Es el precio de no marcar legado a los grupos del plan.
 */
export function isClGroup(group: SystemResolvable, coachSystem: PortionSystem): boolean {
  return systemOf(group, coachSystem) === 'cl'
}

export function visibleExchangeGroupsForCoach(input: VisibilityInput): VisibleExchangeGroup[] {
  const coachSystem: PortionSystem = input.coachSystem === 'smae' ? 'smae' : DEFAULT_SYSTEM
  const otherSystem: PortionSystem = coachSystem === 'cl' ? 'smae' : 'cl'
  // FAIL-OPEN: sin el dato se muestra todo, sin marcar legado.
  const unknown = input.usedSystems == null
  const showsOther = unknown || input.usedSystems!.includes(otherSystem)

  const out: VisibleExchangeGroup[] = []
  for (const group of input.groups) {
    const system = systemOf(group, coachSystem)

    // Los CUSTOM no se filtran nunca por set: su visibilidad la decide su dueno
    // (policy xg_select, 20260611093001:166-173). Un custom con portion_system
    // 'smae' por default seguiria siendo del coach y debe verse siempre.
    if (!group.isSystem) {
      out.push({ ...group, portionSystem: system, legacy: false })
      continue
    }
    if (system === coachSystem) {
      out.push({ ...group, portionSystem: system, legacy: false })
      continue
    }
    if (system === otherSystem && showsOther) {
      // Sin el dato no se AFIRMA que sea legado: se muestra sin chip.
      out.push({ ...group, portionSystem: system, legacy: !unknown })
    }
  }
  return out
}

/**
 * Comparador de CATALOGO (sobre `ExchangeGroup`): set propio primero, legado
 * despues; dentro de cada bloque, system antes que custom, luego sort_order y code.
 *
 * OJO, y es el fix B-05: este comparador NO decide el orden del picker. El picker
 * recibe lo que devuelve `mergePortionGroupChoices` (editor-state.ts:641-650,
 * «plan primero, catalogo despues», fijado por `quick-edit-state.test.ts:578`), que
 * NO se toca. La particion por seccion la hace el consumidor (§7.3) con
 * `comparePickerGroups`. `compareCatalogGroups` (editor-state.ts:571-575) y sus dos
 * copias tampoco se tocan: ordenan el catalogo vivo, no el sheet.
 *
 * Nada de `sort_order` negativo en la DB: el orden es una decision de UI.
 */
export function compareVisibleGroups(a: VisibleExchangeGroup, b: VisibleExchangeGroup): number {
  if (a.legacy !== b.legacy) return a.legacy ? 1 : -1
  if (a.isSystem !== b.isSystem) return a.isSystem ? -1 : 1
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
  return a.code.localeCompare(b.code)
}
```

**Remate W2 — overlay de metadatos del catálogo (`applyCatalogMetaToPickerGroups`, en `editor-state.ts`).** `collectPortionGroups` deja `portionSystem` en `undefined` (R18) y `mergePortionGroupChoices` pone primero los grupos del plan (R17), así que el consumidor —antes de `comparePickerGroups` y de partir por sección— pega por id `portionSystem`, `sortOrder` e `isSystem` del catálogo vivo (`ExchangeGroup[]`): `applyCatalogMetaToPickerGroups(groups: readonly QePortionGroup[], catalog: readonly ExchangeGroup[] | null | undefined): QePickerGroup[]`, con `QePickerGroup = QePortionGroup & { sortOrder?: number; isSystem?: boolean }`. Orden de entrada preservado; catálogo `null`/vacío ⇒ copias sin cambio (nadie inventa `'smae'`); id ausente ⇒ sin cambio; nunca toca `ref`, `composedOf`, `groupName`, `color`, `macrosConfirmed`. Test: `packages/nutrition-v2/editor-state.picker-meta.test.ts` (7 casos).

**Y el segundo comparador, el del picker (R17/R18), que vive en `editor-state.ts`** porque opera sobre el tipo del editor:

```ts
// packages/nutrition-v2/editor-state.ts (nuevo, al lado de compareCatalogGroups)

/** El picker no maneja `ExchangeGroup` sino `QePortionGroup` (+ `sortOrder?`, que
 *  RN ya le pega en `EditablePortionsSection.tsx:29`). Dos tipos ⇒ DOS
 *  comparadores declarados, no uno que finge servir para los dos. */
export function comparePickerGroups(
  a: QePortionGroup & { sortOrder?: number; legacy?: boolean },
  b: QePortionGroup & { sortOrder?: number; legacy?: boolean },
): number {
  if ((a.legacy ?? false) !== (b.legacy ?? false)) return a.legacy ? 1 : -1
  const sa = a.sortOrder ?? Number.MAX_SAFE_INTEGER
  const sb = b.sortOrder ?? Number.MAX_SAFE_INTEGER
  if (sa !== sb) return sa - sb
  return a.groupCode.localeCompare(b.groupCode)
}
```

### 7.1 `findUsedPortionSystemsForCoach(db, coachId)` — el dato que hoy NO EXISTE

> **Corrección W3 (jefe, 09-09, decisión (af)).** `findUsedPortionSystemsForCoach` cuenta **solo grupos del sistema** (`exchange_groups!inner(portion_system, is_system)` y `collectSystems` ignora `is_system !== true`): los grupos propios nacen con `portion_system = 'smae'` por el default de W0.1 y, sin el filtro, cualquier coach con un propio en un plan recibía `legacySystems: ['smae']` (sección «Legado» y banner de conversión falsos). Los propios se siguen mostrando siempre (`visibleExchangeGroupsForCoach` ya los deja `legacy: false`).

**Corrección obligatoria (B-02 / db-datos:B5 / R14).** `visibleExchangeGroupsForCoach` pide `usedSystems` y **hoy nadie lo calcula**: `findExchangeGroupsForScope` (`exchanges.repository.ts:89-104`) y `api/mobile/nutrition-v2/exchange-groups/route.ts:111-117` solo leen grupos y conteos. Es el único insumo que hace desaparecer el bloque «Legado» sin un write (S1), y sin él W1 no se puede implementar. **Nombre canónico único en todo el SDD: `findUsedPortionSystemsForCoach`**, con el parámetro `usedSystems` del lado de la función pura (OUTLINE §13 + D-6: no hay alias ni variantes, tampoco como «reemplaza a…»).

La ventana es estrecha a propósito: si contaran las versiones publicadas VIEJAS, convertir no apagaría nunca el legado, porque la versión anterior conserva sus targets SMAE para siempre.

```ts
// apps/web/src/infrastructure/db/exchanges.repository.ts (junto a findExchangeGroupsForScope)

/**
 * Sets de porciones que el coach TIENE EN USO HOY:
 *   · targets de la version PUBLICADA VIGENTE de cada plan (p.current_published_version_id)
 *   · + targets de los BORRADORES ABIERTOS (v.status <> 'published')
 *   · sobre planes no archivados (p.lifecycle_status <> 'archived')
 *   · + la rama V1 `meal_exchange_targets` (S-04), viva en produccion:
 *     `nutrition-plans/_components/PlanBuilder/PlanBuilder.tsx`,
 *     `nutrition-plans/_actions/exchange.actions.ts`,
 *     `api/mobile/nutrition/exchanges/targets/route.ts`.
 * Las versiones publicadas VIEJAS NO cuentan: si contaran, convertir jamas
 * apagaria el legado.
 *
 * `limit 2`: solo interesa CUALES de los dos sets aparecen, no cuantas filas hay.
 * EXPLAIN obligatorio en la ventana de W0 (tx-rollback, §3.5 punto 6).
 */
export async function findUsedPortionSystemsForCoach(
    db: DB,
    coachId: string
): Promise<PortionSystem[]> { /* … */ }
```

```sql
-- El predicado, en SQL, tal cual va al repo y al test. Un solo lugar donde
-- cambiarlo: si cambia, cambia tambien el caso D del test SQL (§10.1).
select distinct g.portion_system
from public.exchange_groups g
where exists (
    -- V2: version publicada vigente o borrador abierto, plan no archivado.
    select 1
    from public.nutrition_slot_exchange_targets_v2 t
    join public.nutrition_plan_versions_v2 v on v.id = t.version_id
    join public.nutrition_plans_v2 p         on p.id = v.plan_id
    where t.exchange_group_id = g.id
      and p.coach_id = $1
      and p.lifecycle_status <> 'archived'
      and (v.id = p.current_published_version_id or v.status <> 'published')
) or exists (
    -- V1: builder legado (S-04).
    select 1
    from public.meal_exchange_targets mt
    join public.nutrition_meals m  on m.id = mt.meal_id
    join public.nutrition_plans np on np.id = m.plan_id
    where mt.exchange_group_id = g.id
      and np.coach_id = $1
)
limit 2;
```

#### 7.1.1 El otro insumo y el contrato de la ruta móvil (R14)

| Insumo | Dónde se produce | Qué hace |
|---|---|---|
| `usedSystems` | `findUsedPortionSystemsForCoach(db, coachId)` — repo web, tarea propia en W1 | una consulta por request, junto a la de grupos |
| `coachSystem` | `select portion_system from coaches where id = $coachId` — una columna, en los mismos bordes | en este tren siempre `'cl'` (R14-bis); se lee igual para no cablear la constante |

**La ruta móvil viva cambia de contrato** (`api/mobile/nutrition-v2/exchange-groups/route.ts:111-117`, hoy `jsonNoStore({ groups, foodCounts })`):

```ts
// Nombres canonicos (OUTLINE §13). `legacy` NO viaja por fila: se deriva en
// cliente con systemOf(group, portionSystem), que es la unica forma de que un
// grupo del PLAN —sin la columna— no se marque legado (R18).
jsonNoStore({
  groups,          // cada uno con `portionSystem?: 'smae' | 'cl'`
  foodCounts,
  portionSystem,   // el del coach ('cl' en este tren)
  legacySystems,   // findUsedPortionSystemsForCoach(...) menos el propio; [] si no usa nada
})
```

El mapeador `apps/mobile/lib/nutrition-v2-exchange-groups.api.ts:31-48` (`toGroup`) propaga `portionSystem` y **tolera la ausencia de las tres llaves nuevas**: un binario nuevo contra un deploy viejo las recibe `undefined`, que es exactamente el caso fail-open. `NutritionV2ExchangeGroupsResult` (`:53-56`) gana `portionSystem?` y `legacySystems?`, opcionales por la misma razón que `foodCounts?` ya lo es.

**Fail-open, explícito (R14 punto 4).** Si falla la lectura de `coaches.portion_system` o la de `findUsedPortionSystemsForCoach`, el borde **no rompe y no esconde**: manda `usedSystems: undefined` y se pintan los dos sets sin chip de legado. El catálogo ya es best-effort en RN (`QuickEditMode.tsx:641-647` traga el error del fetch), así que el modo degradado tiene que ser «de más», nunca «de menos»: esconder el grupo que el plan del coach usa lo deja sin poder editar su propio plan. **Tiene test propio** (§7.2, casos 12 y 13).

⚠ Es una consulta más por apertura del picker. Con `nutrition_slot_exchange_targets_v2` chico (STATS) no se justifica índice nuevo; se mide con el `EXPLAIN` de §3.5 punto 6 y, si molesta, se cachea por request — nunca se adivina.

### 7.2 Tests — `packages/nutrition-v2/exchange-visibility.test.ts`

| # | Escenario | Esperado |
|---|---|---|
| 1 | coach `cl`, `usedSystems: []` (los 97 de STATS) | 13 grupos, todos `legacy: false`; 0 SMAE |
| 2 | coach `cl` con targets SMAE vivos (los 9 de STATS; **sin backfill**, R14-bis) | 22 grupos: 13 propios `legacy: false`, 9 SMAE `legacy: true` |
| 3 | coach `smae` (preferencia futura) con `usedSystems: ['smae', 'cl']` | 22 grupos: 9 propios, 13 chilenos `legacy: true`. (Con `usedSystems: ['smae']` a secas el algoritmo de unión devuelve solo los 9 propios: corregido el 09-09 al implementar W1.4, el test fija los dos casos) |
| 4 | coach que ya convirtió todo (`usedSystems: ['cl']`, coach `cl`) | 13 grupos y **el legado desaparece sin un solo write** (S1) |
| 5 | grupo custom del coach con `portionSystem: 'smae'`, coach `cl` | presente, `legacy: false` |
| 6 | grupo custom de team, coach `cl` | presente, `legacy: false` |
| 7 | `coachSystem: null` / `undefined` | se comporta como `'cl'` |
| 8 | grupo del sistema SIN `portionSystem` y `code: 'C'`, coach `cl`, `usedSystems: ['smae']` | `systemOf` no tiene fallback a `'smae'`: `'C'` no está en `CL_CODES` ⇒ cae al set del coach ⇒ `'cl'`, `legacy: false` (R18: un grupo sin dato nunca se marca legado). (La columna es `not null`: el caso cuida el borde, no la producción; corregido el 09-09, la versión anterior de esta fila contradecía el código de §7) |
| 9 | `groups: []` | `[]` |
| 10 | `compareVisibleGroups` | propio antes que legado; dentro del propio, `sortOrder` asc; empate ⇒ `code` |
| 11 | Coach ve ambos sets: orden completo | `[LD…SCP (210-330), C…LEG (10-90)]` — el chileno primero pese al `sort_order` mayor |
| 12 | **Fail-open: `usedSystems: undefined`** (R14) | los 22 grupos presentes y **ninguno con `legacy: true`**: no se esconde ni se afirma legado sin dato |
| 13 | **Fail-open del set del coach**: `coachSystem: undefined` + `usedSystems: undefined` | idem 12, tratando al coach como `'cl'` |
| 14 | **`systemOf` con el campo ausente** (R18) | `{ groupCode: 'PCT' }` ⇒ `'cl'` con cualquier `coachSystem`; `{ groupCode: 'C' }`, coach `cl` ⇒ `'cl'` (cae al set del coach, **no se marca legado**) |
| 15 | **`comparePickerGroups`** (R17) | no legado antes que legado; sin `sortOrder` va al final; empate ⇒ `groupCode` |
| 16 | **`isClGroup(group, coachSystem)` con el campo ausente** (R18; helper de W1.4, X-07) | `{ groupCode: 'PCT', portionSystem: undefined }`, coach `smae` ⇒ `true` por `CL_CODES`; `{ groupCode: 'C' }`, coach `smae` ⇒ `false`; el mismo `'C'` con coach `cl` ⇒ `true` (cae al set del coach, nunca se marca legado por falta de dato) |

Y **un test de integración aparte** para `findUsedPortionSystemsForCoach` (§7.1), que es el que cuida la promesa de S1: coach con una versión publicada VIGENTE en `'cl'` y una versión publicada VIEJA con targets `'smae'` ⇒ devuelve `['cl']` (el legado se apaga solo). Más el caso S-04: coach sin nada en V2 y con `meal_exchange_targets` sobre grupos SMAE ⇒ devuelve `['smae']`.

### 7.3 Dónde se aplica y dónde JAMÁS (T-01, R13 + S-01)

**Corrección obligatoria.** La versión anterior de esta tabla mandaba filtrar **dentro** de `findExchangeGroupsForScope`; una versión intermedia lo movió a `getExchangeGroupsForCoach`. **Las dos están mal, y por la misma razón**: ninguna de las dos es el picker. Son el catálogo de autorización que alimenta cinco caminos, y uno de ellos es el gate de unicidad de códigos — `createExchangeGroup` (`nutrition-exchanges.service.ts:188-193`) y `updateExchangeGroup` (`:215-221`) le pasan **ese mismo array** a `findExchangeGroupConflict`, que es **puro** (`:137-153`) y no puede defenderse solo: si llega filtrado por set, un coach crea tranquilamente un custom con `code` `FR` o `PCT` (el índice `exchange_groups_system_code_uq` no lo tapa: es parcial `where is_system`) y el día que convierta, choca. El otro camino que se rompe es `api/mobile/nutrition/exchanges/group-foods/route.ts:74-82`, que busca el grupo pedido dentro de `getExchangeGroupsForCoach` y devuelve **404 `GROUP_NOT_FOUND`** si no está.

**Regla: el filtro vive en el BORDE DE PRESENTACIÓN, no en el servicio.**

| Superficie | Archivo:línea | ¿Filtra? |
|---|---|---|
| Repo web del catálogo | `apps/web/src/infrastructure/db/exchanges.repository.ts:89-104` (`findExchangeGroupsForScope`) | **JAMÁS. No se toca.** Devuelve el catálogo completo, como hoy |
| Servicio web | `apps/web/src/services/nutrition-exchanges/nutrition-exchanges.service.ts:92-98` (`getExchangeGroupsForCoach`) | **JAMÁS. No se toca** (R13). Es el gate de 5 caminos, incluida la ruta `group-foods` |
| **Respuesta de la ruta móvil V2** | `api/mobile/nutrition-v2/exchange-groups/route.ts:111-117` | **Sí, MARCANDO, no filtrando**: agrega `portionSystem` + `legacySystems` al payload y `portionSystem` a cada grupo. El cliente particiona (§7.1.1) |
| **Loader del picker web** | `coach/nutrition-v2/_actions/portions-groups.actions.ts` (+ `QuickEditProvider.tsx` como consumidor) | **MARCA, no filtra (decisión del jefe (k), 09-09, al implementar W1.5)**: el action alimenta seis superficies, entre ellas `FoodCatalogBrowser → ClassifyFoodFlow`, que resuelve ids YA asignados (`groups.find(g => g.id === current.groupId)`); filtrar ahí es la misma clase de bug que R13. Devuelve el catálogo completo con `portionSystem?` por grupo más `portionSystem` del coach, `legacySystems` y `degraded` (fail-open); `visibleExchangeGroupsForCoach` se aplica en el **consumidor del picker** (`EditablePortionsCard.tsx`, W2.7), espejo exacto de la ruta móvil y de RN |
| **Sheet del picker RN** | `apps/mobile/components/nutrition-v2/quick-edit/EditablePortionsSection.tsx` (el `groups.map` de `:272`) | **Sí**, sobre la lista **ya mergeada** por `mergePortionGroupChoices`, particionando en «Sistema chileno» / «Propios» / «Legado (SMAE)» con `comparePickerGroups` (R17) |
| **Card del picker web** | `_quick-edit/EditablePortionsCard.tsx` (el `groups.map` de `:286`) | **Sí**, misma partición que RN, mismo comparador |
| PostgREST directo de RN (camino V1) | `apps/mobile/lib/nutrition-exchanges.coach.ts:92-101` (`fetchCoachExchangeGroups`) | **No se toca: es código muerto** (R-05). Su única aparición fuera de su definición es un comentario en `coach/nutrition-v2/builder/[clientId].tsx:354`, el wizard retirado. Backlog: «retirar junto con el wizard RN» |
| Colisión de código/slug al crear un custom | `nutrition-exchanges.service.ts:137-153` (`findExchangeGroupConflict`), alimentado por `:188-193` y `:215-221` | **JAMÁS**: tiene que ver **ambos sets**. Es la razón por la que el filtro no puede vivir río arriba (T-02) |
| Equivalencias de un grupo (móvil) | `api/mobile/nutrition/exchanges/group-foods/route.ts:74-82` | **JAMÁS**: con el catálogo filtrado devuelve 404 `GROUP_NOT_FOUND` al editar un grupo del otro set |
| Resolver ids ya prescritos (bundle del alumno) | `exchanges.repository.ts:112-128` (`findExchangeGroupsByIdsForTenant`) | **JAMÁS** |
| Freeze del draft al publicar | `coach/nutrition-v2/_actions/plan-persistence.ts:359-412` (`resolveExchangeGroupsForDraft`) | **JAMÁS** |
| `get_nutrition_today_v2` | RPC | **JAMÁS** — llavea por id de target y por `eg.code` del catálogo vivo |

**Consecuencia para el test de W1.9 (R13):** el test de unicidad **no ataca la función pura** —esa pasa igual— sino `createExchangeGroup` / `updateExchangeGroup`: un coach sin targets SMAE no puede crear un custom con `code` `C`, `LAC`, `LEG`, `FR` ni `PCT`.

**Por qué el filtro va en TS y no en el `.or()` de PostgREST** (T-01): `findExchangeGroupsForScope` arma `.or('is_system.eq.true,coach_id.eq.<id>[,team_id.eq.<team>]')` (`:95-99`). Meter ahí una condición más de set es un paréntesis de distancia de colapsar el `.or()` y devolver grupos custom ajenos — exactamente la clase de bug B1. Con ~35 filas en la tabla, filtrar en memoria no cuesta nada y no puede fugar.

---


## 8. `20260909130000_nutrition_today_v2_exchange_foods_media_generic.sql` (W5)

### 8.1 Las dos anclas, verificadas por r4 §8.2 sobre la definición VIVA (21.119 caracteres)

| # | Ancla (literal, con indentación y salto de línea) | Apariciones |
|---|---|---|
| A1 | `        'portionGrams', ranked.exchange_portion_grams\n      ) order by eg.code, ranked.name, ranked.id\n` | **1** |
| A2-ini | `    into v_exchange_foods\n` | **1** |
| A2-fin | `    where ranked.rn <= 60;\n` | **1** |

A1 vive **por encima** de A2-ini (fuera del bloque que reemplazó `20260804091000:47-49`), así que son dos empalmes independientes y hay que hacer A1 primero o recalcular posiciones.

### 8.2 La migración

```sql
-- ============================================================================
-- EVA Nutricion V2 — «Porciones a la chilena» W5: FOTO y GENERICOS-PRIMERO en el
-- sheet «1 porcion equivale a» del alumno.
-- SPEC: docs/specs/nutrition-porciones-chilenas/SPEC.md §9 (D4-A)
-- ----------------------------------------------------------------------------
-- Por que existe. El sheet del alumno (web PortionEquivalencesSheet.tsx:230-256,
-- RN :238-278) muestra hoy una lista alfabetica sin foto en la que el 82 % de las
-- filas son productos de Open Food Facts: «Arroz» a secas aparece despues de tres
-- marcas de supermercado. La nutricionista que reporto el caso pide justo lo
-- contrario para dejar de mandar su PDF: el generico con su medida casera y su
-- foto arriba, las marcas abajo.
-- La foto NO falta en el componente: falta en el RPC. `get_nutrition_today_v2`
-- emite 7 llaves por alimento y ninguna es la imagen (read-models.ts:292-305).
--
-- Que hace. DOS empalmes de texto sobre la definicion VIVA:
--   1. la agregacion JSON gana `isGeneric`, `imagePath`, `imageVersion` e
--      `imageLicense`, y el ORDER pasa a
--      `eg.code, ranked.is_generic desc, ranked.portion_label_present desc,
--       ranked.name, ranked.id`;
--   2. el bloque de origen gana `is_generic` (= `f.brand is null`) y
--      `portion_label_present`, ESOS DOS CRITERIOS ENTRAN AL `row_number()` (no
--      solo al `order by` del `jsonb_agg`), y un `left join lateral` que resuelve
--      UNA foto por alimento con precedencia product_photo > eva_illustration.
--
-- POR QUE EL CRITERIO VA EN EL `row_number()` Y NO SOLO EN EL `jsonb_agg`.
-- El `where ranked.rn <= 60` CORTA antes de que el `order by` del agregado
-- ordene: lo que el agregado hace es reordenar los 60 que ya sobrevivieron. Con
-- el orden heredado de 20260804091000:53-57 (`owner_rank, name, id`) el corte es
-- ALFABETICO, y `PCT` tiene ~730 candidatos globales: marraqueta, hallulla, pan
-- de molde, papa y quinoa — los genericos con medida casera, o sea justo lo que
-- pide D4-A — quedan FUERA de los 60 y el alumno no los ve nunca. Por eso el
-- criterio `is_generic desc, portion_label_present desc` va en LOS DOS lugares:
-- en el `row_number()` decide QUIENES entran, y en el `jsonb_agg` decide en que
-- orden se pintan. Sacarlo del `row_number()` reabre el bug.
--
-- FORMA DEL PARCHE — no negociable. `create or replace` reconstruido desde
-- `pg_get_functiondef` empalmando SOLO entre anclas exactas, con asserts que
-- fallan en voz alta. NO se recopia el cuerpo: la ultima definicion COMPLETA del
-- repo es 20260720120000, anterior a 20260803194000, y copiarla revertiria la
-- fuga cross-tenant B1 (explicado en 20260906210308:45-56).
--
-- QUE SI VIAJA, ADEMAS DEL PATH, y por que:
--   · `imageVersion` (fm.version, integer chico) — CORRECCION OBLIGATORIA (R-02).
--     El helper que el sheet reutiliza, foodMediaThumbnailUrl
--     (apps/mobile/lib/nutrition-v2-food-media.ts:43-58), arma
--     `${base}/storage/v1/object/public/${bucket}/${path}?v=${media.version}`: sin
--     `version` NO hay cache-busting y, si alguna vez se reemplaza una foto
--     in-place, el alumno ve la vieja hasta que expire el cache del navegador.
--     Son 1-2 bytes por fila.
--   · `imageLicense` (fm.license) — el pie de atribucion tiene que ser
--     CONDICIONAL: de las fotos con imagen, unas son `cc_by_sa` de Open Food Facts
--     y otras son `eva_owned` / `supplier_authorized`. Un pie fijo «Fotos: Open
--     Food Facts (CC BY-SA)» sobre una ilustracion propia es una declaracion de
--     licencia falsa en las dos direcciones (seguridad S-08; OUTLINE §13 lo
--     canoniza en el read model). Es un enum corto.
--
-- QUE NO VIAJA, y por que:
--   · el objeto `media` completo (13 llaves de private.food_catalog_v2_media_json):
--     +136 % de payload (116 kB → 274 kB medido en LIVE sobre 532 filas). El cache
--     offline de RN descarta en silencio toda entrada > 750 kB
--     (apps/mobile/lib/nutrition-v2-cache.ts:6 y :70). Con `imagePath` +
--     `imageVersion` + `imageLicense` + `isGeneric` el payload sube ~25 %
--     (116 → 145 kB): las tres llaves nuevas son cortas frente al path.
--   · `bucket`: es constante por CHECK (20260714220000:9-10) y el cliente ya lo
--     hardcodea (apps/web/src/lib/food-image.ts:41-46).
--   · `attribution` (el texto largo por foto): la atribucion concreta se resuelve
--     con el pie condicional por `imageLicense`, no con una llave por fila.
--
-- `ranked.is_generic desc`: en Postgres `true` ordena DESPUES de `false` en ASC,
-- asi que `desc` es lo que pone los genericos PRIMERO. Queda escrito para que
-- nadie lo «arregle».
--
-- ADITIVA: misma firma, mismos grants, cero DDL, CUATRO llaves nuevas en un JSON
-- (`isGeneric`, `imagePath`, `imageVersion`, `imageLicense`) que el read model
-- declara OPCIONALES (un binario RN viejo con el RPC nuevo sigue parseando).
--
-- ROLLBACK (dos pasos, en este orden). Re-aplicar 20260804091000 sola NO alcanza:
-- su cuerpo arranca en el ancla `    into v_exchange_foods`, asi que revierte SOLO
-- el empalme 2. El empalme 1 (el jsonb_agg con las cuatro llaves y el ORDER) vive
-- POR ENCIMA de esa ancla y sobreviviria intacto (verificado en LIVE 09-09: el
-- jsonb_agg en la posicion 11247 de la definicion, el `into` en la 11308).
--   1) Deshacer el empalme 1 POR TEXTO con la ancla inversa: buscar `v_agg_new` y
--      reemplazarlo por `v_agg_ini`, o sea sacar `isGeneric`/`imagePath`/
--      `imageVersion`/`imageLicense` y devolver el ORDER a
--      `eg.code, ranked.name, ranked.id`.
--   2) Recien ahi re-aplicar 20260804091000 (que a su vez parte de la definicion
--      viva) para deshacer el empalme 2: el bloque `select ... into
--      v_exchange_foods` sin el lateral de food_media y sin el criterio
--      genericos-primero dentro del row_number().
-- ============================================================================

do $do$
declare
  v_src text;
  v_out text;
  v_start integer;
  v_end integer;

  -- ── Empalme 1: la agregacion JSON y el ORDER del array ────────────────────
  v_agg_ini constant text := E'        ''portionGrams'', ranked.exchange_portion_grams\n      ) order by eg.code, ranked.name, ranked.id\n';
  v_agg_new constant text := E'        ''portionGrams'', ranked.exchange_portion_grams,\n        ''isGeneric'', ranked.is_generic,\n        ''imagePath'', img.object_path,\n        ''imageVersion'', img.version,\n        ''imageLicense'', img.license\n      ) order by eg.code, ranked.is_generic desc, ranked.portion_label_present desc, ranked.name, ranked.id\n';

  -- ── Empalme 2: el bloque de origen (mismas anclas de 20260804091000:47-49) ─
  v_ini constant text := E'    into v_exchange_foods\n';
  v_fin constant text := E'    where ranked.rn <= 60;\n';
  v_new constant text := $blk$    into v_exchange_foods
    from (
      select cand.id, cand.name, cand.brand, cand.exchange_group_id,
             cand.exchange_portion_label, cand.exchange_portion_grams,
             cand.is_generic, cand.portion_label_present,
             row_number() over (
               partition by cand.exchange_group_id
               order by cand.owner_rank,
                        cand.is_generic desc,
                        cand.portion_label_present desc,
                        cand.name, cand.id
             ) as rn
      from (
        -- Una fila por (grupo, alimento): gana el dueno mas cercano al alumno.
        select distinct on (src.exchange_group_id, src.id)
               src.id, src.name, src.brand, src.exchange_group_id,
               src.exchange_portion_label, src.exchange_portion_grams,
               src.owner_rank, src.is_excluded,
               src.is_generic, src.portion_label_present
        from (
          -- Rama 1: la lista con dueno (exchange_group_foods).
          select f.id, f.name, f.brand,
                 egf.exchange_group_id,
                 egf.portion_label as exchange_portion_label,
                 egf.portion_grams as exchange_portion_grams,
                 case
                   when egf.coach_id is not null then 0
                   when egf.org_id is not null then 1
                   else 2
                 end as owner_rank,
                 egf.is_excluded,
                 (f.brand is null) as is_generic,
                 (egf.portion_label is not null) as portion_label_present
          from public.exchange_group_foods egf
          join public.foods f on f.id = egf.food_id
          where egf.exchange_group_id = any(v_group_ids)
            and (
              (egf.coach_id is null and egf.org_id is null)
              or egf.coach_id = (select cl.coach_id from public.clients cl where cl.id = p_client_id)
              or (egf.org_id is not null
                  and egf.org_id = (select cl.org_id from public.clients cl where cl.id = p_client_id))
            )
            and (
              (f.coach_id is null and f.org_id is null)
              or f.coach_id = (select cl.coach_id from public.clients cl where cl.id = p_client_id)
              or (f.org_id is not null
                  and f.org_id = (select cl.org_id from public.clients cl where cl.id = p_client_id))
            )
          union all
          -- Rama 2 (LEGACY, sale en F5): las columnas exchange_* del alimento.
          select f.id, f.name, f.brand,
                 f.exchange_group_id,
                 f.exchange_portion_label, f.exchange_portion_grams,
                 3 as owner_rank,
                 false as is_excluded,
                 (f.brand is null) as is_generic,
                 (f.exchange_portion_label is not null) as portion_label_present
          from public.foods f
          where f.exchange_group_id = any(v_group_ids)
            and f.exchange_portion_grams is not null
            and (
              (f.coach_id is null and f.org_id is null)
              or f.coach_id = (select cl.coach_id from public.clients cl where cl.id = p_client_id)
              or (f.org_id is not null
                  and f.org_id = (select cl.org_id from public.clients cl where cl.id = p_client_id))
            )
        ) src
        order by src.exchange_group_id, src.id, src.owner_rank
      ) cand
      where not cand.is_excluded
    ) ranked
    join public.exchange_groups eg on eg.id = ranked.exchange_group_id
    -- La foto: UNA por alimento, precedencia product_photo > eva_illustration.
    -- El lateral corre DESPUES del cap, asi que son maximo 60 lookups por grupo,
    -- servidos por food_media_food_kind_idx (20260714220000:41-42).
    left join lateral (
      select fm.object_path, fm.version, fm.license
      from public.food_media fm
      where fm.food_id = ranked.id
      order by fm.is_primary desc,
               case fm.kind
                 when 'product_photo' then 0
                 when 'eva_illustration' then 1
                 else 2
               end,
               fm.updated_at desc
      limit 1
    ) img on true
    where ranked.rn <= 60;
$blk$;
begin
  if to_regclass('public.food_media') is null then
    raise exception 'exchange_foods_media: falta la tabla food_media (aplica 20260714220000 primero)';
  end if;

  v_src := pg_get_functiondef('public.get_nutrition_today_v2(uuid,date,text)'::regprocedure);

  -- Assert de UNICIDAD de cada ancla (1 hit exacto) ANTES de tocar nada.
  if (length(v_src) - length(replace(v_src, v_agg_ini, ''))) / length(v_agg_ini) <> 1 then
    raise exception 'exchange_foods_media: el ancla de la agregacion JSON no aparece exactamente una vez';
  end if;
  if (length(v_src) - length(replace(v_src, v_ini, ''))) / length(v_ini) <> 1 then
    raise exception 'exchange_foods_media: el ancla "into v_exchange_foods" no aparece exactamente una vez';
  end if;
  if (length(v_src) - length(replace(v_src, v_fin, ''))) / length(v_fin) <> 1 then
    raise exception 'exchange_foods_media: el ancla del cap "rn <= 60" no aparece exactamente una vez';
  end if;

  -- Empalme 1 (esta ARRIBA del bloque; se hace primero y se re-lee el texto).
  v_src := replace(v_src, v_agg_ini, v_agg_new);

  -- Empalme 2.
  v_start := position(v_ini in v_src);
  v_end := position(v_fin in v_src);
  if v_end <= v_start then
    raise exception 'exchange_foods_media: anclas invertidas; el bloque no es contiguo';
  end if;
  v_out := left(v_src, v_start - 1) || v_new || substr(v_src, v_end + length(v_fin));

  execute v_out;
end
$do$;

-- ── Asserts finales: lo nuevo esta, y NADA de lo viejo se perdio ─────────────
do $do$
declare
  v_def text := pg_get_functiondef('public.get_nutrition_today_v2(uuid,date,text)'::regprocedure);
begin
  -- Lo nuevo.
  if position('''isGeneric''' in v_def) = 0 then
    raise exception 'exchange_foods_media: no quedo la llave isGeneric';
  end if;
  if position('''imagePath''' in v_def) = 0 then
    raise exception 'exchange_foods_media: no quedo la llave imagePath';
  end if;
  -- R-02: sin imageVersion no hay cache-busting y foodMediaThumbnailUrl no se
  -- puede reutilizar tal cual.
  if position('''imageVersion''' in v_def) = 0 then
    raise exception 'exchange_foods_media: no quedo la llave imageVersion';
  end if;
  -- S-08: sin imageLicense el pie de atribucion no puede ser condicional.
  if position('''imageLicense''' in v_def) = 0 then
    raise exception 'exchange_foods_media: no quedo la llave imageLicense';
  end if;
  if position('public.food_media fm' in v_def) = 0 then
    raise exception 'exchange_foods_media: no quedo el lateral de food_media';
  end if;
  if position('ranked.is_generic desc' in v_def) = 0 then
    raise exception 'exchange_foods_media: no quedo el orden genericos-primero';
  end if;
  -- B1: el criterio TIENE que estar tambien en el row_number(), que es lo que
  -- decide quienes entran a los 60. Si solo esta en el jsonb_agg, el corte de
  -- PCT (~730 candidatos) sigue siendo alfabetico y la marraqueta no aparece.
  if position('cand.is_generic desc' in v_def) = 0
     or position('cand.portion_label_present desc' in v_def) = 0 then
    raise exception 'exchange_foods_media: el criterio genericos-primero no entro al row_number() (el cap rn <= 60 volveria a ser alfabetico)';
  end if;

  -- CANARIOS. Cada uno cuida un parche anterior que un copy-body borraria.
  if position('public.exchange_group_foods egf' in v_def) = 0 then
    raise exception 'exchange_foods_media: se perdio la lectura de exchange_group_foods (20260804091000)';
  end if;
  if position('where not cand.is_excluded' in v_def) = 0 then
    raise exception 'exchange_foods_media: se perdio el filtro de lapidas (20260804091000)';
  end if;
  if position('''media''' in v_def) = 0 or position('''category''' in v_def) = 0 then
    raise exception 'exchange_foods_media: se perdio el enriquecimiento de items (20260720120000)';
  end if;
  -- B1: el filtro de tenant vive en las DOS ramas del union all mas el resto de
  -- la funcion. Menos de 3 apariciones = fuga cross-tenant.
  if (length(v_def) - length(replace(v_def, 'cl.coach_id from public.clients cl', '')))
     / length('cl.coach_id from public.clients cl') < 3 then
    raise exception 'exchange_foods_media: falta el filtro de tenant en alguna rama (riesgo B1)';
  end if;

  raise notice 'exchange_foods_media OK: isGeneric + imagePath + imageVersion + imageLicense + orden genericos-primero, 4 canarios vivos';
end
$do$;
```

### 8.3 EXPLAIN del lateral (antes de aplicar, dentro de `begin … rollback`)

```sql
explain (analyze, buffers)
select fm.object_path, fm.version, fm.license
from public.food_media fm
where fm.food_id = (select id from public.foods where exchange_group_id is not null limit 1)
order by fm.is_primary desc,
         case fm.kind when 'product_photo' then 0 when 'eva_illustration' then 1 else 2 end,
         fm.updated_at desc
limit 1;
-- Esperado: Index Scan usando food_media_food_kind_idx (20260714220000:41-42),
-- < 0,2 ms. El lateral corre 60 veces por grupo como maximo (despues del cap).
```

### 8.4 Read model — `packages/nutrition-v2/read-models.ts:292-305`

Aditivo y **opcional**, mismo criterio que `media` en `:81` / `:188`: un binario RN viejo con el RPC nuevo sigue parseando, y un binario nuevo con el RPC viejo también.

```ts
export const NutritionExchangeFoodReadSchema = z.object({
  foodId: z.string().uuid(),
  exchangeGroupId: z.guid(),
  groupCode: z.string(),
  name: z.string(),
  brand: z.string().nullable(),
  portionLabel: z.string().nullable(),
  portionGrams: z.number().finite().positive().nullable(),
  /** ¿Genérico (sin marca)? Ordena la lista: genéricos primero. */
  isGeneric: z.boolean().optional(),
  /** `food_media.object_path` de la foto ganadora; el cliente arma la URL pública. */
  imagePath: z.string().nullable().optional(),
  /** `food_media.version`: el `?v=` del cache-busting (R-02). */
  imageVersion: z.number().int().positive().nullable().optional(),
  /** `food_media.license`: decide el pie de atribución, que es condicional (S-08). */
  imageLicense: z.string().nullable().optional(),
})
```

**El helper que falta, y su tarea (R-02).** `foodMediaThumbnailUrl` (`apps/mobile/lib/nutrition-v2-food-media.ts:43-58`) recibe `{ objectPath, bucket, version }` y el read model del sheet trae `imagePath` + `imageVersion`, sin `bucket` (constante por CHECK). Hace falta **`foodMediaThumbnailUrlFromPath(path, version, supabaseUrl?)`** en ese mismo archivo —que es el helper existente con el bucket fijado— y su gemelo en `apps/web/src/lib/food-image.ts`, con test de la URL construida (path codificado segmento a segmento + `?v=`). Es tarea explícita de W5, no un detalle de implementación.

De paso se corrige el JSDoc `:285-291`, que sigue diciendo que la fuente son las columnas `foods.exchange_*` — mentira desde `20260804091000`. **No** se toca `NUTRITION_READ_MODEL_SCHEMA_VERSION`: el cambio es aditivo-opcional, como los anteriores.

---

## 9. `apps/web/src/lib/database.types.ts` — diff manual exacto

**No se regenera.** Un regen completo deja 13 errores en archivos V1 (BRIEF §3). Son cuatro inserciones a mano, en **orden alfabético** dentro de cada bloque (así está generado el archivo).

### 9.1 `exchange_groups` (bloque en `:2095-2153`)

`portion_system` va entre `name` y `ref_calories` en los tres sub-bloques:

```diff
       exchange_groups: {
         Row: {
           …
           macros_confirmed: boolean
           name: string
+          portion_system: string
           ref_calories: number
           ref_carbs_g: number
           …
         }
         Insert: {
           …
           macros_confirmed?: boolean
           name: string
+          portion_system?: string
           ref_calories?: number
           …
         }
         Update: {
           …
           macros_confirmed?: boolean
           name?: string
+          portion_system?: string
           ref_calories?: number
           …
         }
```

`Row` sin `?` (la columna es `not null`); `Insert`/`Update` con `?` (tiene default) — mismo patrón que `is_system` / `macros_confirmed` en el mismo bloque.

### 9.2 `coaches` (bloque desde `:1425`)

`portion_system` va entre `persona_set_at` y `previous_slugs`:

```diff
       coaches: {
         Row: {
           …
           persona_set_at: string | null
+          portion_system: string
           previous_slugs: string[] | null
           …
         }
         Insert: {
           …
           persona_set_at?: string | null
+          portion_system?: string
           previous_slugs?: string[] | null
           …
         }
         Update: {
           …
           persona_set_at?: string | null
+          portion_system?: string
           previous_slugs?: string[] | null
           …
         }
```

### 9.3 Lo que NO se rompe

Ninguna de las 5 queries con columnas explícitas (`exchanges.repository.ts:32` `GROUP_COLUMNS`, `nutrition-exchanges.coach.ts:85-86`, `plan-persistence.ts:330` `EXCHANGE_GROUP_COLUMNS`, `demo-writers.ts:588`, `20260810171529:283`) hace `select('*')`, así que sumar una columna no cambia sus tipos. **Sí** hay que agregar `portion_system` a **`GROUP_COLUMNS` del repo web** (`exchanges.repository.ts:32`) **y al `GROUP_COLUMNS` del repo de RN** (`apps/mobile/lib/nutrition-exchanges.coach.ts:85-86`) — R15 nombra los dos, y el segundo se olvida fácil… salvo en `plan-persistence.ts`, donde **no se agrega**: el freeze no necesita el set y sumarlo es superficie inútil en el camino que jamás debe filtrar.

Además, W1 debe:

- **El campo es OPCIONAL y va en las DOS interfaces `ExchangeGroup` (corrección obligatoria, B-03 / R15).** Hay dos, campo por campo idénticas: la del engine (`packages/nutrition-engine/exchange-types.ts:30`) y la de dominio web (`apps/web/src/domain/nutrition/exchange.types.ts:8-29`), que es la que importa `exchanges.repository.ts:3-10` y usan ~20 archivos web más (bundle del alumno V1, PDF de intercambios, builder V1, actions de grupos y de listas). En las dos: **`portionSystem?: 'smae' | 'cl'`**, con `?`.
  - Con el campo **obligatorio** el tren no compila: rompe el contrato A4 (`read-models.ts:666` declara «el resultado es asignable a `ExchangeGroup[]` del engine» y `read-models.test.ts:333-336` lo fija con `const engineDict: ExchangeGroup[] = dict`), y `reconstructExchangeGroups` **no puede** completarlo porque el snapshot congelado (`snapshot_group_code/name/ref_*`) no guarda el set. Además hay ~42 archivos que construyen literales de `ExchangeGroup` en tests.
  - Y si una función tipa la del engine mientras el repo devuelve la de dominio, con un campo nuevo **obligatorio** dejan de ser estructuralmente compatibles y el borde web no compila.
- **`NutritionExchangeGroupReadSchema` (`read-models.ts:238-254`) NO se toca.** El contrato A4 y su test quedan intactos; el set no viaja por ahí.
- Los tres mapeadores: `exchanges.repository.ts:55-70`, `nutrition-exchanges.coach.ts:65-83`, `apps/mobile/lib/nutrition-v2-exchange-groups.api.ts:31-48`.
- `packages/nutrition-v2/editor-state.ts:247-258` (`QePortionGroup`): **`portionSystem?: 'smae' | 'cl'`**, propagado en `catalogToPortionGroups` (`:588-600`) y `undefined` en `collectPortionGroups` (`:549-568`), porque el snapshot no lo guarda (R18, §7).
- `packages/nutrition-v2/read-models.ts:638-649` (`SYSTEM_EXCHANGE_CODES`): **sumar los 13 códigos chilenos**, o `reconstructExchangeGroups` marcaría `isSystem: false` a los grupos chilenos reconstruidos desde snapshot (impacto acotado: desempate de `findByCode` y orden del picker reconstruido; no toca macros).

**La promesa de PLAN §Contratos 5 se reescribe (R15).** No es «los tests del editor siguen verdes sin editarlos» con una cifra: es «**sin editar los tests existentes de `editor-state` / `_quick-edit`**; los fixtures que construyen `ExchangeGroup` no cambian porque el campo es opcional». Los conteos que se citen tienen que ser los reales (`editor-state.day-errors.test.ts` = 16 y los tres archivos de `_quick-edit` = 87, R-03), o directamente ninguno.

---

## 10. Tests SQL — `supabase/tests/`

Convención (r5 §4.5): un archivo `<basename de la migración>_rollback.sql`, `BEGIN … ROLLBACK`, corrido **a mano** por MCP con la conexión privilegiada, nunca en CI, nunca por partes, nunca reemplazando el `ROLLBACK` por `COMMIT`.

### 10.1 `supabase/tests/exchange_groups_portion_system_rollback.sql`

```sql
-- Porciones chilenas W0 — smoke del SET de porciones.
-- Cubre: A) las dos columnas con su CHECK y su default; B) el indice unico de
-- `code` system; C) los 13 chilenos sembrados y APAGADOS + los 9 SMAE intactos;
-- D) el predicado de findUsedPortionSystemsForCoach y que NADIE fue movido de set
-- (R14-bis: no hay backfill); E) T-03.
-- Seguro por construccion: solo lee, y lo poco que escribe muere en el ROLLBACK.

begin;

-- ── A) Columnas, CHECKs y defaults ──────────────────────────────────────────
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

-- ── B) El indice unico de `code` entre grupos del sistema vivos ─────────────
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
    raise notice 'B: set cl apagado ⇒ el code FR todavia no esta protegido por el indice; lo cuidan los asserts del seed (§3 bloque B)';
  end if;

  -- Un CUSTOM con el mismo code SI se puede (el indice es parcial por is_system).
  insert into public.exchange_groups (slug, code, name, is_system, coach_id, ref_calories)
  select 'smoke-fr-custom', 'FR', 'Frutas del coach', false, c.id, 60
  from public.coaches c where c.org_id is null limit 1;
  raise notice 'B OK: un grupo custom con code FR sigue siendo legal';
end $$;

-- ── C) Los 13 grupos chilenos (APAGADOS hasta W6.8) y los 9 SMAE ───────────
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

-- ── D) findUsedPortionSystemsForCoach y «nadie fue movido» (R14-bis + S-04) ─
-- Ya NO hay backfill: el seed no escribe en `coaches`. Lo que hay que cuidar es
-- (1) que nadie se haya movido de 'cl', y (2) que el predicado de «sets en uso»
-- diga en SQL lo mismo que va a decir el repo (§7.1) — si no, el bloque «Legado»
-- del picker aparece y desaparece segun quien pregunte, y un coach con porciones
-- V1 (meal_exchange_targets, todavia en produccion) se queda sin ver los 9 grupos
-- SMAE que su plan usa.
create temporary view d_sets_en_uso as
select c.id as coach_id, g.portion_system
from public.coaches c
join public.exchange_groups g on true
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
  --    del aviso in-app (OUTLINE §10), no un invariante: se informa, no se aborta.
  select count(distinct coach_id) into v_con_legado
  from d_sets_en_uso where portion_system = 'smae';
  raise notice 'D: % coaches con SMAE en uso ⇒ veran el bloque «Legado» (STATS decia 9, solo V2)', v_con_legado;

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

-- ── E) T-03: `authenticated` sigue sin poder tocar grupos del sistema ───────
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

rollback;
```

### 10.2 `supabase/tests/exchange_group_foods_cl_rollback.sql`

Cubre S6/R6 (la carga masiva no pisa a nadie) y el orden del sheet.

```sql
begin;

-- 1) Fixture: un coach standalone con una fila PROPIA en un grupo chileno.
create temporary table cl_egf_ctx (coach_id uuid, food_id uuid, group_id uuid) on commit drop;
insert into cl_egf_ctx
select c.id, f.id, g.id
from public.coaches c
cross join lateral (select id from public.foods where coach_id is null and org_id is null limit 1) f
cross join lateral (select id from public.exchange_groups where code = 'PCT' and is_system limit 1) g
where c.org_id is null limit 1;

insert into public.exchange_group_foods
  (exchange_group_id, food_id, coach_id, portion_grams, portion_label, source)
select group_id, food_id, coach_id, 999, 'medida del coach', 'coach' from cl_egf_ctx;

-- 2) La carga masiva (global, do nothing) NO pisa la fila del coach.
insert into public.exchange_group_foods
  (exchange_group_id, food_id, coach_id, org_id, portion_grams, portion_label, is_excluded, source)
select group_id, food_id, null, null, 130, '¾ taza', false, 'catalog' from cl_egf_ctx
on conflict on constraint egf_group_food_owner_uq do nothing;

do $$
declare v int;
begin
  select portion_grams into v from public.exchange_group_foods egf
  join cl_egf_ctx x on x.group_id = egf.exchange_group_id and x.food_id = egf.food_id
  where egf.coach_id = x.coach_id;
  if v <> 999 then raise exception 'S6: la carga masiva piso la fila del coach (% g)', v; end if;

  -- Y la fila global se creo aparte (NULLS NOT DISTINCT ⇒ son filas distintas).
  if not exists (select 1 from public.exchange_group_foods egf
                 join cl_egf_ctx x on x.group_id = egf.exchange_group_id and x.food_id = egf.food_id
                 where egf.coach_id is null and egf.org_id is null and egf.portion_grams = 130) then
    raise exception 'S6: no se creo la fila global';
  end if;
  raise notice 'S6 OK: coach 999 g intacto, global 130 g creada';
end $$;

-- 3) El UPDATE de labels no toca filas con dueno ni correcciones manuales.
update public.exchange_group_foods egf
   set portion_label = 'LABEL NUEVO'
  from cl_egf_ctx x
 where egf.exchange_group_id = x.group_id and egf.food_id = x.food_id
   and egf.coach_id is null and egf.org_id is null
   and egf.source = 'catalog' and egf.portion_label is null;

do $$
begin
  if exists (select 1 from public.exchange_group_foods egf join cl_egf_ctx x
             on x.group_id = egf.exchange_group_id and x.food_id = egf.food_id
             where egf.coach_id is not null and egf.portion_label = 'LABEL NUEVO') then
    raise exception 'S6: el update de labels toco una fila con dueno';
  end if;
end $$;

-- 4) CHECKs de la tabla siguen vivos para el set chileno.
do $$
begin
  begin
    insert into public.exchange_group_foods (exchange_group_id, food_id, portion_grams, portion_label, source)
    select group_id, food_id, 130,
           'una etiqueta absurdamente larga que pasa los cuarenta caracteres', 'catalog'
    from cl_egf_ctx;
    raise exception 'CHECK: egf_portion_label_len no bloqueo un label > 40';
  exception when check_violation then null; end;

  begin
    insert into public.exchange_group_foods (exchange_group_id, food_id, portion_grams, source)
    select group_id, food_id, 99999, 'catalog' from cl_egf_ctx;
    raise exception 'CHECK: egf_portion_grams_range no bloqueo 99999 g';
  exception when check_violation then null; end;
  raise notice 'CHECKs OK';
end $$;

rollback;
```

### 10.3 `supabase/tests/nutrition_today_v2_exchange_foods_media_generic_rollback.sql` (W5)

```sql
-- Smoke del parche por texto del RPC. Verifica sobre la DEFINICION, no sobre una
-- invocacion: get_nutrition_today_v2 es VOLATILE y materializa snapshots del dia
-- (regla citada en apps/web/src/app/coach/clients/[clientId]/nutritionTabV2.logic.ts:206-207),
-- asi que NO se la llama en un test.
begin;

do $$
declare v_def text := pg_get_functiondef('public.get_nutrition_today_v2(uuid,date,text)'::regprocedure);
begin
  if position('''isGeneric''' in v_def) = 0 then raise exception 'falta isGeneric'; end if;
  if position('''imagePath''' in v_def) = 0 then raise exception 'falta imagePath'; end if;
  if position('''imageVersion''' in v_def) = 0 then raise exception 'falta imageVersion (R-02: sin el no hay cache-busting)'; end if;
  if position('''imageLicense''' in v_def) = 0 then raise exception 'falta imageLicense (S-08: el pie de atribucion es condicional)'; end if;
  if position('public.food_media fm' in v_def) = 0 then raise exception 'falta el lateral de food_media'; end if;
  if position('ranked.is_generic desc' in v_def) = 0 then raise exception 'falta el orden genericos-primero'; end if;
  if position('ranked.portion_label_present desc' in v_def) = 0 then raise exception 'falta el desempate por medida casera'; end if;
  if position('cand.is_generic desc' in v_def) = 0
     or position('cand.portion_label_present desc' in v_def) = 0 then
    raise exception 'el criterio genericos-primero no entro al row_number(): el cap rn <= 60 vuelve a cortar alfabeticamente';
  end if;
  if position('public.exchange_group_foods egf' in v_def) = 0 then raise exception 'canario 20260804091000 roto'; end if;
  if position('''media''' in v_def) = 0 or position('''category''' in v_def) = 0 then raise exception 'canario 20260720120000 roto'; end if;
  if (length(v_def) - length(replace(v_def, 'cl.coach_id from public.clients cl', '')))
     / length('cl.coach_id from public.clients cl') < 3 then
    raise exception 'canario B1 roto: falta el filtro de tenant en alguna rama';
  end if;
  raise notice 'RPC OK: 4 llaves nuevas (isGeneric, imagePath, imageVersion, imageLicense), orden nuevo, 4 canarios vivos';
end $$;

-- El orden que va a ver el alumno, simulado sobre el mismo criterio del RPC.
select f.brand is null as is_generic, egf.portion_label is not null as tiene_medida, f.name
from public.exchange_group_foods egf
join public.foods f on f.id = egf.food_id
where egf.exchange_group_id = '0000e8c1-0000-0000-0000-000000000010'
  and egf.coach_id is null and egf.org_id is null and not egf.is_excluded
order by is_generic desc, tiene_medida desc, f.name
limit 20;
-- Esperado: arriba los genericos con medida casera («Arroz cocido · ¾ taza»),
-- despues los genericos sin medida, y las marcas al final.

-- B1 — el caso que mata al bug, sobre PCT REAL (~730 candidatos globales, muy por
-- encima del cap de 60). Reproduce el `row_number()` del RPC tal como queda
-- despues del parche y exige que los genericos con medida casera SOBREVIVAN al
-- corte. Con el orden viejo (`owner_rank, name, id`) este assert es rojo.
do $$
declare
  v_group uuid := '0000e8c1-0000-0000-0000-000000000010';  -- PCT
  v_cand int;
  v_gen_en_60 int;
  v_faltan text;
begin
  select count(*) into v_cand
  from public.exchange_group_foods egf
  where egf.exchange_group_id = v_group
    and egf.coach_id is null and egf.org_id is null and not egf.is_excluded;

  with ranked as (
    select f.name,
           (f.brand is null) as is_generic,
           (egf.portion_label is not null) as portion_label_present,
           row_number() over (
             order by 2 /* owner_rank global = 2 */,
                      (f.brand is null) desc,
                      (egf.portion_label is not null) desc,
                      f.name, f.id
           ) as rn
    from public.exchange_group_foods egf
    join public.foods f on f.id = egf.food_id
    where egf.exchange_group_id = v_group
      and egf.coach_id is null and egf.org_id is null and not egf.is_excluded
  )
  select count(*) filter (where is_generic and portion_label_present and rn <= 60),
         string_agg(name, ', ') filter (
           where rn > 60 and is_generic and portion_label_present
             and name ~* '(marraqueta|hallulla|molde|papa|quinoa|arroz)')
    into v_gen_en_60, v_faltan
  from ranked;

  -- N = cuantos genericos con medida casera cargo el script en PCT (§4.6 bloque 1).
  -- El piso es 20 porque el script cargo 26 genericos con medida casera en PCT
  -- (DATA §4.6). En LIVE PCT tiene 707 candidatos y 116 genericos, y con el orden
  -- nuevo los 26 entran a los 60: menos de 20 ya significa que el orden se rompio.
  if v_cand > 60 and v_gen_en_60 < 20 then
    raise exception 'B1: solo % genericos con medida casera entraron a los 60 de PCT (candidatos: %)', v_gen_en_60, v_cand;
  end if;
  if v_faltan is not null then
    raise exception 'B1: quedaron fuera del cap genericos curados de PCT: %', v_faltan;
  end if;
  raise notice 'B1 OK: % genericos con medida casera dentro de los 60 de PCT (% candidatos)', v_gen_en_60, v_cand;
end $$;

rollback;
```

---

## 11. Analytics — shape exacto de los 5 eventos

Web: `apps/web/src/lib/posthog/events.ts`. RN: `apps/mobile/lib/analytics.ts`.
**Ley 21.719 / BRIEF §3: nunca kcal, nunca gramos, nunca nombres de alimentos, nunca ids.**

> **Esta tabla es la ÚNICA fuente de la forma de los 5 eventos (fix seguridad:S-07).** La SPEC §11 y el no-negociable 9 la citan, no la reescriben: dos tablas distintas hacen que el worker de W2.10 / W5.8 elija al azar cuál implementar.

**`group_code` viaja SOLO en eventos del COACH** (1, 2, 3). En el evento 5, que dispara el cliente del **alumno**, `group_code` ata su `distinct_id` a los grupos que su plan le prescribe — o sea, a su pauta nutricional, que es dato de salud. La regla escrita en el repo es literal: «viajan METADATOS de la interacción […] Nunca kcal exactas, **nombre del alimento ni ningún id**» (`apps/mobile/lib/analytics.ts:151-152`). Para el coach, `'PCT'` o `'LAC'` es un término de dominio sobre su propia herramienta de trabajo; para el alumno, es su dieta.

```ts
/** 1. El coach toca un grupo que ya estaba en la franja y se le suma 0,5 (D2-A). */
type NutritionPortionGroupBumped = {
  surface: 'rn' | 'web'
  group_code: string          // 'PCT' | 'C' | … — término de dominio
  portion_system: 'cl' | 'smae'
  from: 'picker' | 'stepper'
  undone: boolean             // ¿usó «Deshacer» del toast?
}
// posthog.capture('nutrition_portion_group_bumped', { … })

/** 2. El coach abre el preview de la conversión SMAE → chileno (D1-A). */
type NutritionPortionConversionPreviewed = {
  surface: 'rn' | 'web'
  slots: number               // franjas afectadas — conteo, no contenido
  rows: number                // filas del diff
  rows_review: number         // filas marcadas «Revisar»
  has_dairy: boolean          // ¿hay eje lácteo (selector de 3)?
  has_collapse: boolean       // ¿alguna fila colapsó ARL + G?
  has_custom_match: boolean   // ¿se propuso reemplazar un grupo propio?
}
// CUÁNDO se emite (decisión W3.5, 09-09): una vez por apertura y SOLO si el `diff` trae algo.
// Con `diff` vacío NO sale: abrir un diálogo que dice «no hay nada que convertir» no es un
// preview, y hasta W6.8 (los 13 grupos `cl` con `deleted_at`) ese sería el caso mayoritario, así
// que el embudo estaría midiendo el bug. Al leerlo: `previewed` NO es «cuántos abrieron el
// aviso»; esa pregunta, si hace falta, es un evento aparte. Si el coach acepta un reemplazo y el
// diff deja de estar vacío, ahí sí se emite (el guard es un ref que sube cuando el evento sale).

/** 3. El coach aplica la conversión al borrador. */
type NutritionPortionConversionApplied = {
  surface: 'rn' | 'web'
  slots: number
  rows: number
  dairy_choice: 'LD' | 'LS' | 'LE' | 'mixed'   // qué eligió, no cuánto
  custom_replaced: number                       // cuántos grupos propios reemplazó
}

/** 4. El coach escribe metas en el día activo o en la base (D3-A). */
type NutritionTargetsScope = {
  surface: 'rn' | 'web'
  scope: 'day' | 'all'
  from: 'switch' | 'go_to_base'
}

/**
 * 5. El ALUMNO abre el sheet «1 porción equivale a» (D4-A).
 *
 * SIN `group_code` (S-07): es el único de los cinco que dispara el cliente del
 * alumno, y el código del grupo es su pauta nutricional atada a su distinct_id.
 * OUTLINE §10 declara `{ has_generic, set }`; lo demás son metadatos de la
 * interacción, sin cifras, sin alimentos y sin ids.
 */
type NutritionEquivalencesOpened = {
  surface: 'rn' | 'web'
  set: 'cl' | 'smae'
  has_generic: boolean                                   // ¿hay al menos un genérico?
  rows_bucket: '0' | '1-10' | '11-30' | '31-60'          // TRAMO, jamás el número
}
```

Reglas de implementación:

- Los tramos (`rows_bucket`) se calculan en un helper puro compartido, no en cada componente, para que web y RN no diverjan.
- **Evento 5 = estas cuatro llaves y ninguna más** (cierre de W5, 10-09). El borrador dibujaba además `has_photos` y `searched`:
  quedaron FUERA del contrato (`has_photos` no mide D4-A —la foto la decide el catálogo, no el alumno— y `searched` acoplaba
  el evento al buscador, que se dispara después de la apertura). Si algún día hacen falta, se agregan en
  `equivalencesOpenedPayload` y en las dos superficies a la vez, nunca con un spread en el componente. Límites conocidos de
  la métrica: `set` se deriva en la superficie con `systemOf({ groupCode }, 'smae')` porque el read model del alumno no trae
  `portionSystem`, así que un grupo PROPIO del coach se cuenta como `smae`; `rows`/`has_generic` se miden sobre la lista del
  grupo resuelto **sin** buscador; el guard de una emisión por apertura es por franja (cambiar de tab de grupo no re-emite).
- El evento 5 se dispara **al abrir**, una vez por apertura, no por cada cambio de tab de grupo. Si el alumno cambia de grupo dentro del sheet **no** se emite otro evento: sin `group_code` no aportaría nada y solo multiplicaría el ruido.
- Los eventos 1, 2 y 3 son del **coach** (superficies del editor) y ahí `group_code` / `dairy_choice` sí viajan. Ningún evento del alumno lleva código de grupo. Si mañana hace falta saber en qué grupo se abre más el sheet, se mide **desde el lado del coach** o con una propiedad agregada sin identidad, no agregándole `group_code` al evento 5.
- Métrica de resultado del tren: la que **ya existe**, `student_nutrition_intake` con `method: 'portion_chip'` (`events.ts:296-306`). Si D4-A funciona, sube sin que haya que instrumentar nada nuevo.

---

## 12. Decisiones del writer y dudas para el jefe

### Decisiones del writer

1. **La partición del eje lácteo se hace por _% de kcal desde la grasa_ (< 15 % → LD · 15–40 % → LS · > 40 % → LE), no por g de grasa/100 g.** El OUTLINE §5.2 proponía gramos por 100 g y dejaba los umbrales al writer; un umbral en gramos rompe con los quesos (quesillo ~5 g/100 g es `LS` en UDD p. 54, leche entera ~3 g/100 g es `LE` en p. 55). El porcentaje es escala-invariante y reproduce la partición del propio manual. Validado en LIVE contra 40 alimentos `LAC` genéricos (§4.3.1): los 5 casos con contraparte en el manual coinciden 5/5.
2. **Rango útil del set chileno = [5, 600] g**, más estrecho que el `EXCHANGE_PORTION_GRAMS_LIMIT` de 5.000 (`exchange-lists.ts:22`) y que el CHECK `egf_portion_grams_range`. Ninguna porción casera pide 2 kg; arriba de 600 g lo que hay es un dato malo del catálogo (la misma consulta de §4.3.1 encontró `Puripop popcorn queso` y `Sugarfree yogurt cookies` clasificados como lácteos). Las filas fuera de rango se descartan y aparecen en el top-20 del informe.
3. **No se agrega la columna `exchange_group_foods.is_generic`** que proponía r4 §3.4. El OUTLINE §9 fija `isGeneric = foods.brand is null` y con eso el efecto visible es el 100 %; la señal de «curado INTA/UDD» ya la da `portion_label is not null`, que es el segundo criterio del `ORDER BY`. Una columna nueva sería DDL sin beneficio medible.
4. **El RPC emite `imageVersion` (y `imageLicense`)** — corrección obligatoria, R-02 + S-08. La versión anterior de este documento decía que no viajaba, y era una contradicción con PLAN/TASKS y con el código: el helper que el sheet reutiliza, `foodMediaThumbnailUrl` (`nutrition-v2-food-media.ts:43-58`), arma la URL con `?v=${media.version}`; sin `version` no hay cache-busting y una foto reemplazada in-place se ve vieja hasta que expire el cache. `imageLicense` entra por el mismo lateral porque el pie de atribución tiene que ser **condicional** (hay fotos `cc_by_sa` de OFF y fotos propias): un pie fijo es una declaración de licencia falsa en las dos direcciones. El objeto `media` completo sigue sin viajar (§8.2).
5. **No hay backfill de coaches** (R14-bis). Todos quedan en `'cl'`. El criterio «qué sets usa hoy» se escribe **una sola vez**, en `findUsedPortionSystemsForCoach` (§7.1), y cuenta **las dos generaciones**: `nutrition_slot_exchange_targets_v2` (versión publicada vigente + borradores abiertos, planes no archivados) **∪** `meal_exchange_targets`, las porciones del builder V1 que **siguen vivas en producción** (`PlanBuilder.tsx`, `nutrition-plans/_actions/exchange.actions.ts`, `api/mobile/nutrition/exchanges/targets/route.ts`). Sin la rama V1, un coach que solo prescribió en V1 perdería de vista los 9 grupos SMAE que su plan usa. El caso D del test SQL (§10.1) verifica el mismo predicado. El «9» de STATS solo contaba V2 y **no prueba nada** para la rama V1: el conteo real de las dos ramas se corre en LIVE (§3.5 punto 6b) y su salida se pega en TASKS, pero ya no mueve a nadie — solo dimensiona la audiencia del aviso in-app.
6. **La visibilidad por set se aplica en el borde de PRESENTACIÓN, nunca en el servicio** (§7.3, R13 + S-01). Ni `findExchangeGroupsForScope` **ni `getExchangeGroupsForCoach`**: los dos devuelven el catálogo completo como hoy, porque ese mismo array alimenta `findExchangeGroupConflict` (unicidad de `code`, T-02) desde `createExchangeGroup`/`updateExchangeGroup` y la ruta `group-foods`. Filtrarlo en cualquiera de los dos deja que un coach cree un custom `FR` que colisiona con el chileno y devuelve 404 al editar equivalencias del otro set. Los bordes son: la respuesta de la ruta móvil viva (que **marca**, no filtra), el loader del picker web y los dos consumidores del sheet, sobre la lista ya mergeada.
7. **El set se siembra APAGADO y se enciende en W6.8** (R14-ter, §0 y §3), y el rollback tiene **dos ramas** (R-01 + S-02, §3.4): si nadie usa los grupos chilenos, se vuelven a apagar con `deleted_at`; si alguien los usa, el archivo **aborta** y la vuelta atrás es de código. Soft-borrar un grupo ya prescrito deja irrepublicable todo borrador que lo use (`xg_select` filtra `deleted_at`, `resolveExchangeGroupsForDraft` falla cerrado) y sin forma de sacarlo del plan, porque tampoco está en el picker. El rollback **no toca `coaches`** (nadie fue backfilleado) y no borra equivalencias: son inertes si el grupo no se ofrece.
8. **El eje de carnes se parte por grasa igual que el lácteo, con UN corte en 0,40** (§4.3b, R16): `share ≤ 0,40` → `CB` · `> 0,40` → `CA` · `null` → descartar. Mandar los 603 a `CB` con macro clave proteína ponía la vienesa como «1 porción de carne baja en grasa» de ~100 g y ~290 kcal reales contra 65 declaradas. El fundamento sale de los propios refs (CB = 28 %, CA = 60 %) y el corte se verifica en el dry-run con el control **15/15** contra los genéricos curados y con «0 filas en `CB` con `share > 0,40`». No hay tramo de descarte por exceso de grasa: la longaniza es una carne alta en grasa y está en la lámina de `CA`.
9. **Los curados son autoridad sobre la derivación** (§4.5): se escriben primero, y el `update` de medida casera fija `portion_grams = v.portion_grams` sin `coalesce`. La etiqueta y los gramos tienen que salir de la misma fuente o el alumno lee «¾ taza · 105 g» cuando el manual dice 130 g.
10. **Y su corolario: los `food_id` curados salen del universo derivado** (§4.2 y §4.4, R-13). Sin esa exclusión, un alimento curado en un grupo puede derivarse a otro —`Yogur natural` está curado en `LS` por el manual y su grasa real lo mandaría a `LE`— y quedan dos entradas casi homónimas, con gramajes distintos, en dos grupos que compiten. El `on conflict` no lo evita: son claves distintas. Sin allowlist por nombre: el JSON ya es la lista.
11. **Sin foto, el fallback es el `GroupDot` del grupo**, que es lo que el sheet ya hace hoy (`PortionEquivalencesSheet.tsx` RN `:238-278`, `GroupDot size={28}`). **No** se emite `category` en el RPC y **no** existe un «ícono derivado del nombre»: `FoodThumbnail({ fallbackCategory })` (`NutritionV2Kit.tsx:457-528`) toma una categoría del catálogo, y el read model del sheet no la trae — el propio componente lo documenta (`:243-247`). Agregar `category` sería una llave más por fila para un caso que el `GroupDot` ya cubre.
12. **Una franja no se reordena en silencio** (§6, R-08). `QePortionTarget` no tiene `orderIndex`: el orden **es** la posición en el array. El conversor materializa cada destino en el lugar de su **primer** origen y deja intactos en su posición los targets que no convierte, en vez de anteponer todo lo convertido. Cambiar el orden de la franja sin decirlo en el preview es exactamente el tipo de sorpresa que el tren viene a sacar.

### Dudas para el jefe — RESUELTAS (RESOLUCIONES-2, 08-09)

Las tres quedaron cerradas y ya están aplicadas arriba. Se dejan escritas con su respuesta para que nadie las reabra:

1. **`Yogurt natural`: ¿manda el dato del catálogo o el manual?** → **Manda el curado (§C.7 + R-13).** Su `food_id` está en `generic-foods-cl.json` bajo `LS` (UDD p. 54) y por eso **queda fuera del universo derivado** (§4.2): nunca nace la fila de `LE`. Sin allowlist por nombre y sin dos entradas homónimas. Aplicado en §4.2, §4.3.1, §4.4 y §5.2.
2. **`CA` y `LGS` sembrados desde INTA porque faltan las láminas UDD.** → **Aceptado para W0 (R-15)**, porque los encabezados de INTA imprimen exactamente los mismos macros que la Tabla N.º 5 UDD (`120·11·1·8` y `170·11·30·1`). TASKS lleva el ítem «verificar contra las láminas UDD si aparece el escaneo completo» y el informe del dry-run marca qué filas vienen de INTA. Aplicado en §5 (nota de páginas).
3. **`Palta` en `AG`.** → **Sí (R-16)**: 2 cucharadas = 30 g. El grupo INTA «ricos en lípidos» (175 kcal · 15 g) **no existe** en el set UDD y **no se crea un grupo 14**. Queda anotado en la fila del JSON (§5.2) y va a «Fuera de alcance» en la SPEC.

---

## Decisiones del jefe post-críticos

Las «Preguntas del fixer» quedaron cerradas por el jefe el 09-09 (RESOLUCIONES-2 §D). Cada una con su respuesta, en una línea:

1. **`imageLicense` (D-9) — confirmado, y son cuatro llaves.** El RPC emite `imagePath`, `imageVersion`, `imageLicense` e `isGeneric`, con el payload en **~149 kB (+29 %)**. Ya está en §8.2 (RPC), §8.4 (read model) y §10.3 (asserts); PLAN §W5 y TASKS W5.1/W5.2/W5.4/W5.8/W5.9 quedaron alineados. No se saca de ningún lado y el pie de atribución sigue siendo **condicional**.
2. **Fila de Legumbres del sheet de conversión (X-09 / D-8) — manda DATA.** `CL_CONVERSION_MAP` con factor **0,5** ⇒ «Legumbres 1 → Legumbres secas 0,5 · Revisar 125 → 85»; DATA §6.4 caso 16 queda como está, SPEC §7.2 ya está corregida (pie «620 → 555 kcal») y `context/mockups-v1.html` se regenera con ese texto, en tuteo y **en la misma URL**.
3. **Tabla de eventos (X-10) — DATA §11 es la fuente única.** `scope` es `'day' | 'all'` en todas partes y el evento del alumno no lleva `group_code`; SPEC §11 ya quedó como referencia a esta sección.
4. **Fallback sin foto (D-2) — `GroupDot` del grupo.** El RPC **no** emite `category` (evita una quinta llave y payload); SPEC §9.3, PLAN §W5 y TASKS W5.7/W5.8 dicen lo mismo, y §12 decisión 11 de este archivo es la redacción de referencia.
5. **Ventana de «en uso» del set legado — queda como está.** «Versión publicada vigente + borradores abiertos, planes no archivados, ∪ V1» (§7.1) es lo único que hace desaparecer solo el bloque «Legado» al terminar de convertir (S1). Consecuencia aceptada: un plan archivado con targets SMAE no sostiene el legado. El caso D de §10.1 verifica el mismo predicado.
6. **El «9» de STATS y el aviso in-app — se reescribe, no se recuenta acá.** En todo el SDD el número de quienes verán «Legado» se dice como **«los coaches con porciones SMAE vivas (9 por V2 al 08-09; sumar los de V1 con la query de W0.6)»**; la salida real de esa query se pega en TASKS W0.6 y con ese número el owner cierra la lista de destinatarios del banner M2.
7. **W0 partido en dos (R-17) — es calendario, no datos.** `W0a` (DDL + seed + tests SQL, 1 d) y `W0b` (script + curaduría + dry-run + OK del owner + `--apply`, 2 d) viven en PLAN/TASKS; DATA solo describe los artefactos y no lleva estimaciones.

Y las decisiones que este documento hereda de los otros archivos: **D-1** el host del lienzo de `TargetsEditorCard` RN queda sin switch y sigue despachando `SET_TARGET` sin `scope` · **D-3** ningún índice para `findUsedPortionSystemsForCoach` salvo que el EXPLAIN de W0.6 muestre seq scan relevante ⇒ migración aparte con `(version_id, exchange_group_id)` · **D-4** miniatura **36 px en RN y web** · **D-5** la carcasa del banner de conversión la monta W2, W3 solo la enchufa, merge **W2 → W4 → W3** · **D-6** `findUsedPortionSystemsForCoach` con parámetro `usedSystems` es el único nombre, sin alias · **D-7** un solo corte de carnes, `fatEnergyShare ≤ 0,40 → CB · > 0,40 → CA · null → descartar` (§4.3b), sin ningún otro umbral (el `SUPPLEMENT_FAT_MAX` de §4.3b es el guard de `SP → SCP` y no toca el eje de carnes).

**Lo que NO se decide acá**: las preguntas al owner (macros_confirmed, aviso que no bloquea, lácteo por default, crear grupo propio en web, UDD 2019 vs 2021) viven en **SPEC §15 Q1–Q5** y siguen abiertas.
