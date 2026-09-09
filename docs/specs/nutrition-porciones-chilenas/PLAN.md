---
status: draft
owner: product-engineering
last_verified: "2026-09-08"
canonical: false
---

# PLAN — Porciones a la chilena (Nutrición V2)

> Origen: audios de la nutricionista `nutricionista-pame-cid` reenviados por `jotap-coach` el 08-09-2026 («la porción de
> carbohidratos vale la mitad», «no pude poner más de una», «mis pacientes verían otro grupo», «¿metas distintas por
> día?», «que cada porción muestre alimentos con medida casera y foto»). Decisiones del owner: D1-A · D2-A · D3-A ·
> D4-A · D5 (lectura técnica en [SPEC](SPEC.md) §3). Datos, SQL y tablas copiables: [DATA](DATA.md). Checklist
> ejecutable: [TASKS](TASKS.md). Verificado contra `rnmobiledenuevo` @ `f93378c3` y LIVE el 08-09. Producción: 9
> coaches usan porciones (337 targets en 44 versiones), 5 grupos custom de 4 coaches, 2.507 equivalencias globales, 27
> con medida casera real, 1 solo plan con el «caso Pame» de metas parciales.

## Reparto (regla de la casa)

| Rol | Modelo | Qué hace en este tren |
|---|---|---|
| Jefe | Fable (tope) | Orquesta, escribe las instrucciones por worker, **juzga** cada wave contra lo pedido, aplica migraciones y seeds por MCP, corre los gates pesados, resuelve los merges. Nunca ejecuta fan-outs. |
| Worker mecánico | Sonnet | Las 13 filas del seed, la tabla de genéricos curados, `SYSTEM_EXCHANGE_CODES`, `GROUP_REFS`, `database.types.ts` a mano, consultas SQL de verificación, copys en el módulo compartido. |
| Worker guiado | Opus | Implementación con informe delante: visibilidad y orden del picker, `BUMP_PORTION_TARGET` + stepper RN, conversión SMAE→chileno, metas con `scope`, parche por texto del RPC, sheets del alumno. En duda entre Sonnet y Opus → Opus. |
| UI | Jefe u Opus **con el mockup aprobado delante** | `mockups-v1.html` (M1–M5 + paridad web) manda sobre cualquier improvisación visual; los tokens salen del mapa de estilos, nunca de hex nuevos. |
| Owner | — | OK del dry-run de equivalencias (artifact), OK de push/deploy/migraciones/OTA, QA en device, avisos a los coaches. |

Tras cada wave: pasada de juicio del jefe sobre el diff real ⇒ correcciones numeradas **BLOQUEA/MEJORA** al MISMO
worker. Un worker no entrega «verde» sin pegar la salida real del gate.

## Orden obligado y paralelismo

**Orden obligado: dato antes que código** (W0 antes que todo: sin los 13 grupos en LIVE, W1 no tiene qué filtrar y W3
no tiene destino), **motor antes que superficie** (W1 antes de W2/W3/W4: `portionSystem` viaja por el tipo del engine
y los 3 mapeadores), **dry-run aprobado antes de escribir equivalencias** (informe → OK del owner → `--apply`).

1. **W0 · Datos** (3 d = W0a 1 + W0b 2) — migraciones, seed **apagado** de los 13, script de
   derivación con dry-run y la curaduría de genéricos. **Sin backfill de coaches** (R14-bis).
2. **W1 · Motor y visibilidad** (2 d) — `portionSystem?`, `findUsedPortionSystemsForCoach`, `coaches.portion_system`,
   `visibleExchangeGroupsForCoach`, contrato de la ruta móvil, orden por set, conteo web.
3. **W2 ∥ W3 ∥ W4** (2 d · 2 d · 1 d) — tres workers distintos, en paralelo.
4. **W5 · Equivalencias del alumno** (2 d) — depende de W0; de W2/W3/W4 no depende.
5. **W6 · Cierre** (0,5 d) — docs, suite completa, push, deploy READY, OTA android/ios y recién ahí el **encendido del
   set chileno** (las migraciones y el seed apagado ya se aplicaron en W0), E2E, avisos, QA del owner.

Colisiones del paralelismo (las tres, declaradas): `packages/nutrition-v2/editor-state.ts` lo tocan W2 (bump +
`qeGroupRefPerPortion`), W3 (`REPLACE_PORTION_GROUPS`) y W4 (`SET_TARGET.scope`); y `EditablePortionsSection.tsx` (RN)
+ `EditablePortionsCard.tsx` (web) los tocan W2 (picker con secciones, fila usada, stepper) y W3 (banner de
conversión) — por eso **la carcasa del banner la monta W2** y W3 solo le cablea el `onPress` (R-06), en vez de rebasar
W3 encima de dos archivos reescritos. **Cada worker en su worktree; el jefe mergea en el orden W2 → W4 → W3**, porque
W3 es el que más superficie nueva agrega y conviene rebasarlo último. `nutrition-portions-copy.ts` se reparte por
bloque: `builder.*` para W2/W3, `student.*` para W5 y `EDITOR_COPY.targets/publish` (`microcopy.ts` web y su espejo
RN) para W4.

## Arquitectura por ola (sin cambios de capa)

```text
W0 · Datos (DB + script; cero código de producto)
  supabase/migrations/20260909120000_exchange_groups_portion_system.sql                 NUEVO
  supabase/migrations/20260909120500_exchange_groups_no_duplicate_system_code.sql       NUEVO
  supabase/migrations/_POST_DEPLOY_20260909121000_exchange_groups_cl_seed.sql           NUEVO
  supabase/migrations/_POST_DEPLOY_20260909121000_exchange_groups_cl_seed_rollback.sql  NUEVO
  supabase/tests/exchange_groups_portion_system_rollback.sql                            NUEVO
  scripts/nutrition-portions-cl/derive-cl-equivalences.mjs                              NUEVO
  scripts/nutrition-portions-cl/generic-foods-cl.json                                   NUEVO
  scripts/output/cl-equivalences-<fecha>.md                                             SALIDA del dry-run

W1 · Motor y visibilidad
  packages/nutrition-engine/exchange-types.ts                     portionSystem?: 'smae'|'cl' (OPCIONAL)
  apps/web/src/domain/nutrition/exchange.types.ts:8-29            la SEGUNDA interface ExchangeGroup, idem
  packages/nutrition-v2/exchange-visibility.ts  NUEVO (CL_CODES, systemOf, isClGroup,
                                          visibleExchangeGroupsForCoach, compareVisibleGroups)
                                          · read-models.ts (SYSTEM_EXCHANGE_CODES + 13)
  packages/nutrition-v2/editor-state.ts   QePortionGroup.portionSystem?,
                                          comparePickerGroups (NUEVO; compareCatalogGroups sin cambios)
  apps/web/src/infrastructure/db/exchanges.repository.ts   GROUP_COLUMNS:32 + mapper +
                                          findUsedPortionSystemsForCoach NUEVO · SIN filtro de set
  apps/web/src/services/nutrition-exchanges/nutrition-exchanges.service.ts  NO SE TOCA (R13):
                                          getExchangeGroupsForCoach:92-98 alimenta 5 caminos y
                                          el conflicto (:188-193, :215-221) sigue viendo AMBOS sets
  apps/web/src/app/coach/nutrition-v2/_actions/portions-groups.actions.ts  conteo por
                                          getExchangeListCounts + visibilidad del loader del picker web
  apps/web/src/app/coach/nutrition-v2/[clientId]/_quick-edit/QuickEditProvider.tsx  loader del picker web
  apps/mobile/lib/nutrition-v2-exchange-groups.api.ts:31-48       mapper: portionSystem por grupo +
                                          portionSystem + legacySystems del payload (legacy en cliente)
  apps/web/src/app/api/mobile/nutrition-v2/exchange-groups/route.ts:111-117  visibilidad MARCANDO +
                                          respuesta { groups, foodCounts, portionSystem, legacySystems }
  apps/mobile/lib/nutrition-exchanges.coach.ts:85-86              solo GROUP_COLUMNS (espejo); el filtro NO
                                          va acá: la función no tiene consumidor (backlog con el wizard RN)
  apps/mobile/components/nutrition-v2/quick-edit/EditablePortionsSection.tsx:273  partición por sección
  apps/web/src/app/coach/nutrition-v2/[clientId]/_quick-edit/EditablePortionsCard.tsx:285  idem (web)
  apps/web/src/lib/database.types.ts (a mano) · scripts/nutrition-portions/heuristics.ts
                                          (GROUP_REFS + 13 y la unión ExchangeGroupCode de :52)

W2 · Picker, bump, tap-to-edit, D5   (RN = worker A, web = worker B; del alumno solo la cabecera, R11)
  packages/nutrition-v2/editor-state.ts   BUMP_PORTION_TARGET, findPortionTargetByGroup, portionsAfterBump,
                                          formatPortionsEsCl, qeGroupRefPerPortion
  packages/nutrition-v2/nutrition-portions-copy.ts   builder.{setChile,setLegacy,legacyBadge,groupUsedBump,
                                          groupBumped,groupBumpedUndo,groupAtMax,stepperEditHint}
  apps/mobile/components/nutrition-v2/quick-edit/{EditablePortionsSection,EditableSlotCard,QuickEditMode}.tsx
  apps/web/src/app/coach/nutrition-v2/[clientId]/_quick-edit/{EditablePortionsCard.tsx,microcopy.ts}
  + la CARCASA del banner de conversión (props + «Ahora no»), que W3 solo cablea (colisión R-06)
  apps/web/src/app/c/[coach_slug]/nutrition-v2/_components/PortionEquivalencesSheet.tsx
  apps/mobile/components/alumno/nutrition-v2/PortionEquivalencesSheet.tsx

W3 · Conversión SMAE → chileno
  packages/nutrition-v2/exchange-conversion.ts   NUEVO (CL_CONVERSION_MAP, convertPortionsToCl, round05)
  packages/nutrition-v2/editor-state.ts          REPLACE_PORTION_GROUPS
  packages/nutrition-v2/nutrition-portions-copy.ts   convert.{title,intro,footer,cta,review,dairyChoice}
  apps/mobile/components/nutrition-v2/quick-edit/PortionConversionSheet.tsx                NUEVO
  apps/web/src/app/coach/nutrition-v2/[clientId]/_quick-edit/PortionConversionDialog.tsx   NUEVO
  (el banner «Ahora no» ya lo montó W2 como carcasa: W3 solo le pasa el `onPress` que abre el sheet/diálogo)

W4 · Metas por día
  packages/nutrition-v2/editor-state.ts   SET_TARGET.scope, STEP_TARGET.scope, qeTargetsEqual,
                                          qeDaysMissingTargets, qeTargetsGapBar, APPLY_BASE_TARGETS
  apps/mobile/components/nutrition-v2/quick-edit/{TargetsEditorCard,PublishBar,QuickEditMode,EditorRibbon}.tsx
  apps/web/src/app/coach/nutrition-v2/[clientId]/_quick-edit/{TargetsEditorCard,PublishBar,
                                          QuickEditPlanView,EditorRibbon}.tsx

W5 · Equivalencias del alumno
  supabase/migrations/20260909130000_nutrition_today_v2_exchange_foods_media_generic.sql   NUEVO (por texto)
  supabase/tests/nutrition_today_v2_exchange_foods_media_generic_rollback.sql              NUEVO
  packages/nutrition-v2/read-models.ts            imagePath, imageVersion, imageLicense, isGeneric (opcionales)
  packages/nutrition-v2/exchange-foods-origin.ts  NUEVO (splitExchangeFoodsByOrigin)
  packages/nutrition-v2/nutrition-portions-copy.ts   student.{sheetGenericsTitle,sheetBrandsTitle,photoCredit}
  apps/web/src/app/c/[coach_slug]/nutrition-v2/_components/PortionEquivalencesSheet.tsx
  apps/mobile/components/alumno/nutrition-v2/PortionEquivalencesSheet.tsx
  apps/mobile/lib/nutrition-v2-food-media.ts (foodMediaThumbnailUrlFromPath) · apps/web/src/lib/food-image.ts

W6 · Cierre
  docs/specs/nutrition-porciones-chilenas/{SPEC,PLAN,TASKS,DATA}.md · docs/status/{CURRENT,MOBILE_PARITY}.md
  docs/testing/TEST_STATUS.md · docs/archive/current-historial-2026-09.md (recibe la prosa del tope de 16 KB)
```

## W0 · Datos (ARREGLA el dato de raíz)

**Objetivo y entregables.** Que existan en LIVE los 13 grupos chilenos con valores confirmados y que el set chileno
nazca con equivalencias derivadas por la fórmula correcta: dos migraciones aditivas,
un `_POST_DEPLOY_` de datos con su rollback, el script con dry-run e informe, el JSON de genéricos curados y las
consultas de verificación con su resultado pegado en TASKS.

**Archivos exactos.** Los ocho del bloque W0 son **nuevos** (la última migración del repo es
`supabase/migrations/20260906213000_foods_density_review.sql`, de ahí el prefijo `20260909…`);
`scripts/nutrition-portions-cl/` es carpeta nueva y `scripts/output/` ya existe. Cabecera de cada migración con el
patrón narrativo de `20260906213000_foods_density_review.sql:1-40` (título,
`-- SPEC: docs/specs/nutrition-porciones-chilenas/SPEC.md §<n>`, «Por qué existe», «Qué hace», notas).

**Migraciones y cómo se aplican.**
- `20260909120000_…portion_system.sql` — `exchange_groups.portion_system text not null default 'smae'` + CHECK
  `in ('smae','cl')` + comentario; `coaches.portion_system text not null default 'cl'` + CHECK +
  `grant update (portion_system) on public.coaches to authenticated` (patrón `coaches.persona`,
  `supabase/migrations/20260822002122_onboarding_v2_persona_demo.sql:49`). Aditiva pura: no toca índices, policies ni
  CHECKs. `exchange_groups` tiene grants a nivel de TABLA (`20260611093001_nutrition_exchanges.sql:148-150`) ⇒ la
  columna nueva no necesita re-grant.
- `20260909120500_…no_duplicate_system_code.sql` — `create unique index if not exists exchange_groups_system_code_uq on
  public.exchange_groups (code) where is_system and deleted_at is null;`, precedido de la verificación de 0 duplicados.
- `_POST_DEPLOY_20260909121000_…cl_seed.sql` — las 13 filas (UUID `0000e8c1-0000-0000-0000-0000000000NN`,
  `macros_confirmed = true`, `composed_of = null`, `sort_order` 210–330) **con `deleted_at = now()`: nacen apagadas**
  (`xg_select` no las devuelve, así que entre W0 y W6 ningún coach ve 22 grupos sin filtro de visibilidad —
  `db-datos:B3`); `on conflict (id) do update … where exchange_groups.macros_confirmed = false` (con `true` nunca
  dispara) y **nunca** `deleted_at = null` acá: encenderlas es exclusivo de W6.8. **No hay bloque de backfill de
  coaches (R14-bis)**: los 106 quedan en `portion_system = 'cl'` (el default) y el SMAE aparece como «Legado» mientras
  `findUsedPortionSystemsForCoach` lo devuelva. Asserts en voz alta: 13 grupos sembrados y apagados, 0 códigos del
  sistema duplicados una vez encendidas.
- **Protocolo (AGENTS.md §Supabase).** Primero un `BEGIN;` con el DDL completo + los `EXPLAIN` del mapa de DB
  (picker, freeze por `code`, sheet por `exchange_group_foods`, conteo de coaches con targets SMAE = 9, que **solo
  dimensiona el aviso**: no mueve a nadie) **+ el EXPLAIN de
  `findUsedPortionSystemsForCoach` en su forma por-request** (el join de cuatro tablas que W1 corre en cada apertura
  del picker) + `ROLLBACK;`, con la salida pegada en TASKS. **Índice: ninguno por defecto (D-3)** — solo si ese EXPLAIN
  muestra un **seq scan relevante** sobre `nutrition_slot_exchange_targets_v2` se agrega `(version_id,
  exchange_group_id)` en una **migración aparte**, con su tarea propia; nada de índices preventivos. Recién con eso el jefe
  aplica por MCP `apply_migration` en orden 120000 → 120500 → seed, corre `get_advisors` y verifica que
  `count(*) … is_system and deleted_at is null` **sigue en 9** (las 13 están apagadas); el «= 22» se verifica en W6.8,
  no acá. **La versión LIVE puede diferir del nombre del archivo**: TASKS registra ambas («archivo `20260909120000` /
  versión LIVE `<ts>`»), igual que `docs/specs/nutrition-cantidades-honestas/TASKS.md:116-122`.

**Script de derivación (el paso con OK humano en el medio).** `node
scripts/nutrition-portions-cl/derive-cl-equivalences.mjs --dry-run` recorre las 2.507 filas globales `source =
'catalog'`, **excluye del universo derivado todo `food_id` que aparezca en `generic-foods-cl.json`** (los curados se
cargan antes y mandan: sin esa exclusión el mismo alimento cae en dos grupos con dos gramajes — el caso del yogurt
natural, `R-13`), mapea cada alimento a su grupo chileno destino —**los dos ejes partidos por grasa usan la misma
`fatEnergyShare(food)`** (kcal desde grasa / kcal totales; adimensional, sirve para leche y para queso; DATA §4.3):
lácteos `< 0,15` → `LD` · `0,15–0,40` → `LS` · `> 0,40` → `LE`, y **carnes `≤ 0,40` → `CB` · `> 0,40` → `CA` ·
`share == null` ⇒ descartar** (R16: `CB` es 2×9/65 ≈ 28 % y `CA` 8×9/120 = 60 %; mandar los 603 alimentos de `P` a
`CB` a ciegas listaría una longaniza de ~80 g como «1 porción de 65 kcal · 2 g de grasa», casi 4× el dato real)— y
calcula gramos con `suggestPortionGrams`
(`packages/nutrition-v2/exchange-lists.ts:114-129`) **forzando el macro clave por grupo** (R1: hoy
`dominantExchangeMacro` da `carbs` para descremados y `fats` para enteros ⇒ gramos inconsistentes entre subgrupos),
redondea con `roundPortionGrams` (`:95-99`), descarta `null` y > 5.000 g, y escribe
`scripts/output/cl-equivalences-<fecha>.md` con conteo por grupo, distribución de gramos, top 20 sospechosos (> 600 g
o < 5 g), el histograma de `fatEnergyShare` de los dos ejes y la auditoría de R7 (filas SMAE que difieren > 20 % de la
fórmula correcta). `VL` no se deriva masivamente. **Verificación obligatoria antes del `--apply`** (R16): los ~15
genéricos de carnes del JSON curado caen **15/15** en el grupo que dice el manual, y el control «0 filas en `CB` cuyo
alimento tenga `share > 0,40`» sale en verde en las verificaciones de W0.
El informe va al owner como artifact; **con su OK** corre `--apply` con service role: `insert … on conflict on
constraint egf_group_food_owner_uq do nothing` y, para los genéricos curados de `generic-foods-cl.json`, un `update`
acotado a `portion_label is null and source = 'catalog' and coach_id is null and org_id is null` (S6). Cero `do update`
sobre filas con dueño: las 19 filas propias de 3 coaches ganan por `owner_rank = 0` y no se tocan.

**Contratos.** Los 13 códigos son nuevos y ninguno colisiona con `C P F V LAC ARL SP G LEG`: es obligatorio, no
cosmético, porque `resolveExchangeGroupsForDraft`
(`apps/web/src/app/coach/nutrition-v2/_actions/plan-persistence.ts:399-411`) usa `.maybeSingle()` y reventaría al
publicar. El seed **no re-numera** `sort_order` del SMAE ni toca sus `ref_*`. `foods.exchange_*` no se toca: el set
chileno vive solo en `exchange_group_foods`, y de ahí que W1 deba cambiar el conteo del picker web.

**Gates W0.** `BEGIN … ROLLBACK` con EXPLAIN (salida pegada, incluido el de `findUsedPortionSystemsForCoach`) ·
`supabase/tests/exchange_groups_portion_system_rollback.sql` por MCP en LIVE · verificación post-seed (13 grupos
sembrados **apagados**, 0 códigos duplicados al encenderlos en tx, **`cl` = 106 y `smae` = 0 en `coaches`** (nadie se
mueve, R14-bis), conteos por grupo, muestras
de gramos, «0 filas en `CB` con `share > 0,40`»). **`pnpm docs:check` NO es gate de W0** (R-19): el checker recién
tiene qué verificar cuando el SDD viva en `docs/specs/`; W0–W5 corren los gates de código. La única tarea de docs de
W0 es **W0.0**: crear `docs/specs/nutrition-porciones-chilenas/` con los cuatro archivos en `status: draft` y el
frontmatter que exige `scripts/check-docs.mjs:104`.

**Riesgos y rollback.** (a) *Re-correr el seed V1 revive grupos borrados y repisa `sort_order`*
(`_POST_DEPLOY_20260611093002_nutrition_exchanges_seed.sql:43,47`): el seed chileno nace en `macros_confirmed = true`,
así que ni se pisa ni pisa. (b) *Backfill de más*: **no aplica, porque no hay backfill** (R14-bis); el conteo de los 9
coaches con targets SMAE solo dimensiona el aviso in-app. (c) *Rollback del set*: **soft-delete, nunca `delete`**
(`nutrition_slot_exchange_targets_v2.exchange_group_id` es `on delete restrict`), y **en dos ramas** (R-01 + DATA §3.4),
que el propio `_rollback.sql` decide:
  1. **Nadie prescribió todavía con grupos chilenos** (ni targets en `nutrition_slot_exchange_targets_v2` ni borradores
     los referencian) ⇒ `update exchange_groups set deleted_at = now() where is_system and portion_system = 'cl'`
     (vuelta al estado «apagado» de W0) + borrado de las equivalencias `source = 'catalog'` de esos grupos.
     `exchange_group_foods` con dueño **no** se borra.
  2. **Algún target o borrador vivo referencia un grupo chileno** ⇒ el archivo **`raise exception` y aborta**: apagarlos
     con `deleted_at` dejaría esos borradores impublicables (`xg_select` exige `deleted_at is null` y
     `resolveExchangeGroupsForDraft` falla cerrado con `EXCHANGE_GROUP_NOT_FOUND`). La vuelta atrás es **de código**:
     revertir el deploy y la OTA. Sin filtro de visibilidad los 22 grupos se ven, pero nada se rompe.
  El rollback **no toca `coaches.portion_system`** (nadie fue movido) y las columnas **no se droppean**: el rollback
  funcional es dejar de filtrar por ellas.

**Estimación.** 3 días-agente, partidos en dos (R-17: la curaduría sola no cabía en 1,5 d):
- **W0a · DDL y datos de estructura (1 d)** — las dos migraciones, el seed apagado con sus asserts (sin backfill), el
  `_rollback.sql` de dos ramas y `supabase/tests/exchange_groups_portion_system_rollback.sql`. **Sonnet** con la tabla
  de DATA delante; aplicación en LIVE: **jefe**.
- **W0b · Script, curaduría y dry-run (2 d)** — `derive-cl-equivalences.mjs` completo, `generic-foods-cl.json` con sus
  ~165 filas transcritas de los manuales (nombre, gramos, medida casera, página, notas) y la desambiguación de
  `food_id` por nombre exacto contra un catálogo donde «arroz» da 88 coincidencias y «queso» 195, informe, OK del
  owner y `--apply`. **Opus**; lectura del informe: **jefe**; OK del dry-run: **owner**.

## W1 · Motor y visibilidad (ARREGLA el catálogo ofrecido)

**Objetivo y entregables.** Que el picker de las tres superficies muestre el set del coach primero y el legado
colapsado solo si lo usa, y que el conteo de equivalencias no mienta: `portionSystem?` **opcional** en las **dos**
interfaces `ExchangeGroup` y en `QePortionGroup`, los **productores** de los dos inputs de la visibilidad
(`findUsedPortionSystemsForCoach` + lectura de `coaches.portion_system`), `visibleExchangeGroupsForCoach` como función
pura única aplicada **solo en los bordes de presentación** (R13), el contrato nuevo de la ruta móvil, orden por set, conteo web por
`getExchangeListCounts`, tipos DB a mano y `GROUP_REFS` ampliado.

**Archivos exactos.** Los del bloque W1. `packages/nutrition-v2/exchange-visibility.ts` es nuevo y cae dentro de
`packages/nutrition-v2`, raíz ya declarada en `scripts/check-nutrition-v2-boundaries.mjs:29-42` ⇒ **no hay que tocar
`V2_ROOTS`** (esa lista es fail-closed: una raíz declarada que no existe hace salir el checker con 1).

**Reglas duras.**
- **Dónde va el filtro (B-01/R13).** Ni `findExchangeGroupsForScope`
  (`apps/web/src/infrastructure/db/exchanges.repository.ts:90-104`) ni `getExchangeGroupsForCoach`
  (`nutrition-exchanges.service.ts:92-98`) **se tocan**. El repo es el catálogo de autorización/escritura y sus dos
  únicos callers le pasan literalmente ese array a `findExchangeGroupConflict` (`:188` → `:193` y `:215` → `:221`):
  filtrar ahí dejaría a un coach `'cl'` crear un custom con `code` `C`, `LAC`, `LEG`, `FR` o `PCT` (el índice único es
  parcial `where is_system` y no lo atrapa). Y `getExchangeGroupsForCoach` alimenta **5 caminos**, entre ellos
  `apps/web/src/app/api/mobile/nutrition/exchanges/group-foods/route.ts:74-82`, que devolvería **404 `GROUP_NOT_FOUND`** para
  un grupo escondido. La visibilidad vive **solo en los bordes de presentación**: (a) el loader del picker web
  (`QuickEditProvider.tsx` + `portions-groups.actions.ts`), (b) la respuesta de la ruta móvil viva
  (`api/mobile/nutrition-v2/exchange-groups/route.ts:111-117`, **marcando, no filtrando**: el cliente particiona) y
  (c) el sheet RN sobre la lista ya mergeada (R17). El test de la ola ataca
  `createExchangeGroup`/`updateExchangeGroup`, no la función pura (que pasa igual).
- **Los dos inputs tienen productor propio (B-02/R14).** (1) `findUsedPortionSystemsForCoach(db, coachId):
  Promise<PortionSystem[]>` (nombre canónico, OUTLINE §13; el parámetro que consume `visibleExchangeGroupsForCoach` se
  llama `usedSystems`) en `exchanges.repository.ts`, con el mismo join de cuatro tablas **más la rama V1
  `meal_exchange_targets`**, `select distinct g.portion_system` y `limit 2`, con su **EXPLAIN en el tx-rollback de W0**
  (corre en cada apertura del picker en las tres superficies; índice solo si el plan lo pide). (2) Lectura de
  `coaches.portion_system` por `coachId` en esos mismos bordes de presentación. (3) La ruta móvil pasa a devolver
  `{ groups, foodCounts, portionSystem, legacySystems }` y cada grupo trae `portionSystem?`; **`legacy` no viaja por
  fila**: se deriva en el cliente con `systemOf` (R18), porque un grupo del plan sin dato nunca puede declararse legado
  desde el servidor. El mapeador `apps/mobile/lib/nutrition-v2-exchange-groups.api.ts:31-48` propaga `portionSystem` y
  **tolera la ausencia de las tres llaves nuevas** (hoy descarta cualquier llave que no liste). (4) **Fail-open**: si falla cualquiera de las dos lecturas
  se muestra **todo** el catálogo sin marcar legado, nunca se esconde — el catálogo ya es best-effort en
  `QuickEditMode.tsx:641-647`, que se traga el error.
- **`portionSystem` es OPCIONAL y va en los dos tipos (B-03/R15).** `portionSystem?: 'smae' | 'cl'` en
  `packages/nutrition-engine/exchange-types.ts` **y** en `apps/web/src/domain/nutrition/exchange.types.ts:8-29` (hay
  **dos** interfaces `ExchangeGroup` campo por campo idénticas; la del dominio es la que devuelve el repo web).
  `NutritionExchangeGroupReadSchema` (`packages/nutrition-v2/read-models.ts:238-254`) **no se toca**: así el contrato
  A4 y `read-models.test.ts:333-336` quedan intactos, y `reconstructExchangeGroups` no tiene que inventar un campo que
  el snapshot congelado no guarda. `GROUP_COLUMNS` suma la columna en el repo web (`exchanges.repository.ts:32`) **y**
  en el de RN (`apps/mobile/lib/nutrition-exchanges.coach.ts:85-86`).
- **`QePortionGroup` gana el campo y `systemOf` cae al set del coach (B-06/R18).** `portionSystem?: 'smae' | 'cl'` en
  `editor-state.ts:247-258`, propagado en `catalogToPortionGroups` (`:588-600`); `collectPortionGroups` (`:549-568`) lo
  deja `undefined` porque el snapshot no lo guarda. `systemOf(group, coachSystem)` =
  `group.portionSystem ?? (CL_CODES.has(group.groupCode) ? 'cl' : coachSystem)` ⇒ **un grupo del plan sin dato nunca se
  marca legado**. `isClGroup(group, coachSystem)` = `systemOf(group, coachSystem) === 'cl'`. **Los dos helpers, más
  `CL_CODES`, nacen en `packages/nutrition-v2/exchange-visibility.ts` en la misma tarea que la visibilidad (W1.4)**, no
  en `editor-state.ts`: W3 los **importa** (es la primera línea de `convertPortionsToCl`, DATA §6) y no los redefine.
- **Hay DOS comparadores, no uno (B-05/R17).** `compareCatalogGroups` (`editor-state.ts:571-575`, sobre
  `ExchangeGroup`) **no cambia**, y `mergePortionGroupChoices` (`:641-650`, «plan primero, catálogo después», fijado
  por `quick-edit-state.test.ts:578`) **tampoco**. El «tercer criterio» de R4 vive en `comparePickerGroups` (nuevo, en
  `editor-state.ts`, sobre `QePortionGroup` + `legacy`) y en `compareVisibleGroups` (nuevo, en
  `exchange-visibility.ts`, sobre `VisibleExchangeGroup`: propio antes que legado, `sortOrder` asc, empate por `code`), y **la partición por sección se hace en el consumidor, sobre la lista ya
  mergeada**: RN `EditablePortionsSection.tsx:273` y web `EditablePortionsCard.tsx:285` parten en «Sistema chileno» /
  «Propios» / «Legado (SMAE)» antes de renderizar, en vez de confiar en el orden de entrada. Nada de `sort_order`
  negativo.
- `findExchangeGroupConflict` (`nutrition-exchanges.service.ts:137-152`) es **pura** y sigue viendo **ambos** sets: no
  es una propiedad suya, es una propiedad de su caller (por eso el filtro no baja al repo).
- T-01: si algún día el filtro bajara a SQL, va como condición **AND separada**; nunca dentro del `.or()` de PostgREST,
  donde un paréntesis mal puesto devuelve grupos ajenos. Hoy va en TypeScript sobre 14–22 filas.
- **`apps/mobile/lib/nutrition-exchanges.coach.ts` no se filtra (R-05)**: `fetchCoachExchangeGroups` no tiene ningún
  consumidor (su única aparición fuera de la definición es un comentario en el wizard RN retirado,
  `builder/[clientId].tsx:354`). Solo se le suma la columna a `GROUP_COLUMNS`; el retiro queda en backlog junto con el
  wizard.
- `SYSTEM_EXCHANGE_CODES` (`packages/nutrition-v2/read-models.ts:638-649`) suma los 13; si no,
  `reconstructExchangeGroups` marcaría `isSystem: false` a los grupos chilenos reconstruidos del snapshot. Y
  `apps/web/src/lib/database.types.ts` se edita **a mano** (regen completo prohibido: deja 13 errores en archivos V1).
- `GROUP_REFS` (`scripts/nutrition-portions/heuristics.ts:113-124`) suma los 13 **y** la unión cerrada
  `ExchangeGroupCode` de `heuristics.ts:52` se amplía con los códigos nuevos (R-09), o el archivo no compila (`:72`,
  `:78-80` la usan).

**Gates W1.** `pnpm exec vitest run packages/nutrition-v2 packages/nutrition-engine` · vitest de
`apps/web/src/services/nutrition-exchanges` (incluido el test de `createExchangeGroup`/`updateExchangeGroup` que exige
que el conflicto vea ambos sets, y que `getExchangeGroupsForCoach` siga devolviendo los 22 sin filtrar) y
`tests/mobile-nutrition-exchange-groups-api.test.ts` (contrato `{ groups, foodCounts, portionSystem, legacySystems }`
con `portionSystem?` por grupo, las tres llaves nuevas opcionales y **sin** `legacy` por fila) · `pnpm typecheck` · tsc mobile · eslint por archivo ·
`pnpm check:nutrition-v2-boundaries`.

**Riesgos y rollback.** (a) *El picker miente en una de las tres superficies*: lo atrapan el test de la ruta móvil y el
QA en device. (b) *`scripts/nutrition-portions/` queda muerto*: `verifyGroupRefs` aborta con `missing_in_fixture` al ver
13 grupos del sistema nuevos (`classify-lib.ts:150-154`); por eso `GROUP_REFS` se amplía acá (R5). (c) Rollback: la
visibilidad es una función pura, revertirla es un commit.

**Estimación.** 2 días-agente (1,5 no cubría los productores nuevos, el contrato de la ruta móvil ni el segundo tipo
`ExchangeGroup`). Tipos, productores y visibilidad: **Opus**. `SYSTEM_EXCHANGE_CODES`, `GROUP_REFS` +
`ExchangeGroupCode` y `database.types.ts`: **Sonnet**.

## W2 · Picker, bump, tap-to-edit y Legumbres (ARREGLA lo que Pame no pudo hacer)

**Objetivo y entregables.** Que tocar un grupo ya usado sume media porción con toast deshacible en vez de no hacer
nada, que el número del stepper se pueda escribir en RN y que ninguna etiqueta «1 porción ≈» diga 0 kcal:
`BUMP_PORTION_TARGET` y helpers en el paquete, picker RN y web con secciones por set, fila usada viva y chip «Legado
(SMAE)», stepper RN con `TextInput` siempre montado, y `qeGroupRefPerPortion` aplicado en las etiquetas del coach **y**
en la cabecera de los dos sheets del alumno (R11).

**Archivos exactos.** Los del bloque W2. **No se tocan los wizards**:
`apps/mobile/app/coach/nutrition-v2/builder/[clientId].tsx` y
`apps/web/src/app/coach/nutrition-v2/[clientId]/builder/_components/PortionsGroupPicker.tsx` están tras rutas retiradas
que redirigen al editor único; cualquier tarea que los mencione es QA fantasma.

**Reglas duras.**
- **Las secciones del picker se arman en el componente, no en el merge.** `mergePortionGroupChoices`
  (`editor-state.ts:641-650`) sigue devolviendo «plan primero, catálogo después» — su orden está fijado por
  `quick-edit-state.test.ts:578` y ese test no se edita. RN (`EditablePortionsSection.tsx:273`) y web
  (`EditablePortionsCard.tsx:285`) parten la lista **ya mergeada** con `visibleExchangeGroupsForCoach` +
  `comparePickerGroups` en «Sistema chileno · INTA 1999 · UDD 2019», «Propios» y «Legado (SMAE) · Lo usás en {n}
  planes» (colapsada). Un grupo del plan sin `portionSystem` cae al set del coach vía `systemOf`, así que **nunca**
  aparece bajo el chip «Legado» por falta de dato.
- La fila usada deja de estar `disabled` **salvo en el tope 99** (existe en LIVE: el grupo propio de `josefit` tiene 99
  porciones): ahí queda `disabled` con `groupAtMax`, sin toast de acción.
- El guard de unicidad de `ADD_PORTION_TARGET` (`packages/nutrition-v2/editor-state.ts:1946-1950`) y el no-op de
  `addPortionGroup` (`apps/mobile/lib/nutrition-v2-builder-portions.ts:190-194`) **se conservan**: son los dos
  cinturones contra violar `unique (meal_slot_id, exchange_group_id)`.
- El bump se resuelve por `exchangeGroupId` (el picker no conoce el `targetKey`) y el «Deshacer» restaura el **valor
  previo capturado**, no `-0,5`. Toast con `id` estable (`portion-bump:<slotKey>:<groupId>`) para que dos taps
  actualicen un solo toast (`apps/mobile/components/Toast.tsx:133-139`).
- Stepper RN calcado de `apps/mobile/components/nutrition-v2/quick-edit/QuantityStepper.tsx:91-109`: `TextInput`
  **siempre montado** (árbol estable en Fabric), `keyboardType="decimal-pad"`, `inputAccessoryViewID` del
  `KeyboardDoneBar`, valor crudo mientras se tipea y formateo en `onBlur`. Nada de swap botón↔input.
- `style` como objeto, nunca función, junto a `className` (css-interop descarta el prop y el elemento pierde todo el
  estilo); el resalte de 1,2 s respeta `useReducedMotion`. `formatPortionsEsCl` se exporta del paquete y reemplaza las
  tres copias privadas, o el toast y el preview van a imprimir «1,5» y «1.5» en la misma pantalla.

**Gates W2.** `pnpm exec vitest run packages/nutrition-v2` + los tests del reducer web
(`…/_quick-edit/quick-edit-state.test.ts`) + el RTL nuevo · `pnpm typecheck` · tsc mobile · eslint por archivo (web y
`--config eslint.mobile.config.mjs`) · `pnpm check:tokens`.

**Riesgos y rollback.** (a) *Doble tap en el mismo frame* (Android): guard con `useRef` de «ya elegí en esta apertura»,
reseteado en `onClose`. (b) *Separador decimal*: en Android el `decimal-pad` usa la locale del device;
`parsePortionsValue` normaliza `,`→`.` y «1,3» falla con el mensaje correcto. (c) *Accessory view dentro de una sheet
nativa*: el `KeyboardDoneBar` del padre no aplica, hay que montar otro. (d) *Copy que miente*:
`QE_COPY.portionsPickerHint` (`microcopy.ts:125`) dice que los usados «aparecen desactivados» y ningún gate lo atrapa.
(e) Rollback: todo es UI y estado, revert del commit.

**Estimación.** 2 días-agente. **Opus A** (RN) ∥ **Opus B** (web) con los mockups M1 y M3 delante; los helpers del
paquete los escribe Opus A y Opus B los consume.

## W3 · Conversión SMAE → chileno (AGREGA la única puerta nueva)

**Objetivo y entregables.** Que un coach con planes SMAE pueda pasarlos al set chileno viendo el antes y el después,
sin que nada se escriba solo y sin tocar versiones publicadas: `convertPortionsToCl` puro con su tabla de casos,
`REPLACE_PORTION_GROUPS` en el reducer, `PortionConversionSheet` RN y `PortionConversionDialog` web, y el banner con
«Ahora no» (30 días por plan, storage local). Archivos: los del bloque W3.

**Reglas duras.**
- **Solo sobre el borrador** (S4/T-05). Nunca un `update nutrition_slot_exchange_targets_v2 set portions = …`. Se
  publica por el camino normal con `p_expected_current_version_id`
  (`apps/web/src/app/coach/nutrition-v2/_actions/plan-persistence.ts:691-693`), que da `STALE_BASE` en vez de pisar una
  publicación concurrente.
- **`ARL` + `G` colapsan a `AG`** (R2/T-06): si una franja tiene ambos se suman **antes** de armar el payload y el
  preview lo muestra como una fila con dos orígenes. Dos targets al mismo grupo violan
  `unique (meal_slot_id, exchange_group_id)` y abortan el RPC entero con un 23505 que no nombra la franja.
- **`LAC` → `LD` preseleccionado con selector de tres** (R3), factor por kcal, fila siempre marcada «Revisar». Reescala
  `dest = max(0,5; round05(orig × factor))` con `round05(x) = Math.round(x*2)/2`; «Revisar» si
  `|kcal_dest − kcal_orig| / kcal_orig > 0,10` o si el destino es lácteo.
- Grupos custom (S5): reemplazo ofrecido **solo con match único** (±5 kcal, ±1 g) y confirmación explícita; el custom
  no se borra nunca (soft-delete rompería borradores ajenos). El de `josefit` no matchea nada.
- **El destino se decide con `isClGroup`/`systemOf` de W1**, no con un campo inventado: `catalog.filter(isClGroup)`
  sobre `readonly QePortionGroup[]` funciona porque W1 le sumó `portionSystem?` al tipo y `systemOf` cae al set del
  coach (con `CL_CODES` como fallback por código para los grupos que vienen del plan).
- **El conversor no reordena la franja (R-08).** `QePortionTarget` **no tiene `orderIndex`**: el orden es la posición
  en el array. Devolver `[...converted, ...kept]` mandaría todo lo convertido al principio y cambiaría, sin avisar en
  el preview, el orden que ve el alumno. Cada bucket destino se materializa **en la posición del primer target de
  origen** que lo alimenta, y el criterio de la tarea se escribe «conserva la **posición relativa** y la nota de cada
  target», nunca «conserva `orderIndex`».
- El preview muestra el delta de macros del día con `dayTotalsByVariant`
  (`packages/nutrition-engine/exchange-calc.ts:126-142`) antes/después: es lo único que le dice a la nutri si el
  redondeo la movió del objetivo.

**Gates W3.** `pnpm exec vitest run packages/nutrition-v2 packages/nutrition-engine` (tabla completa: los 9 orígenes, el
colapso, los tres lácteos, el custom con y sin match, el piso 0,5, el tope 99) · RTL del diálogo web · `pnpm typecheck`
· tsc mobile · eslint por archivo · `pnpm check:tokens`.

**Riesgos y rollback.** (a) *El colapso mal hecho revienta la publicación entera*: test unitario obligatorio antes de
tocar UI. (b) *El coach se arrepiente*: no se publica nada hasta que toque Publicar y la versión anterior sigue con sus
snapshots congelados. (c) *Banner molesto*: «Ahora no» lo esconde **30 días por plan**, en storage local
(`AsyncStorage` en RN, `localStorage` en web). No sobrevive al cambio de dispositivo y **no lleva columna nueva**: es
aceptable a propósito. (d) Rollback: revert; la conversión no escribe en DB por sí sola.

**Estimación.** 2 días-agente. **Opus** para el conversor puro + tests (primero) y **Opus** para las dos UIs con el
mockup M2 delante.

## W4 · Metas por día (ARREGLA el caso Pame)

**Objetivo y entregables.** Que escribir metas desde un día cualquiera no deje al resto de la semana sin objetivo y que
al publicar la barra lo diga con una acción, sin bloquear: `scope?: 'day' | 'all'` en `SET_TARGET`/`STEP_TARGET`,
`qeTargetsEqual`, `qeDaysMissingTargets`, `qeTargetsGapBar`, `APPLY_BASE_TARGETS`, switch «Solo el {día}» en RN y web,
aviso ámbar en las dos `PublishBar` y punto de atención en chips, rail y cápsula. Archivos: los del bloque W4.

**Cero DDL.** Un día con `target_calories NULL` no hereda del base porque `nutrition_v2_ensure_day_snapshot` copia una
variante entera sin `coalesce`
(`supabase/migrations/20260714192500_nutrition_v2_draft_delete_and_effective_versions.sql:43-52, 86-92` — el archivo
`…_nutrition_v2_day_snapshot.sql` **no existe**, R-04); por eso `scope: 'all'` **escribe** en el base y en los días que
heredaban, en vez de «escribir solo en el base».

**Reglas duras.**
- `scope` ausente ⇒ comportamiento byte-idéntico al actual: los **16 tests** de
  `packages/nutrition-v2/editor-state.day-errors.test.ts` y los **87** de `_quick-edit`
  (`quick-edit-state.test.ts` **58** + `quick-edit-state.meta.test.ts` **22** + `quick-edit-publish-guards.test.ts`
  **7**) siguen verdes sin editarlos. **103 en total**, contados en el repo el 08-09 (ninguno usa `.each`); el «16 +
  106 = 122» de la versión anterior era falso y habría hecho que un worker creyera que rompió 19 tests.
- `scope: 'all'` **no pisa** un día con metas propias distintas (`qeTargetsEqual` evaluado antes del cambio), mismo
  criterio que `APPLY_BASE_PORTIONS`.
- **Avisa, no bloquea**: no se crea severidad `warning` en `validateQuickEdit`. El aviso vive **fuera** de `errors`, por
  la misma vía que `qeDaysMissingBasePortions` + `PortionsDayGapNotice`. Si bloqueara, los planes publicados con metas
  parciales quedarían irrepublicables — el daño que reparó `ee6766ae` el 02-09. El botón primario pasa a «Publicar
  igual» mientras el aviso está visible, en caja **ámbar** (`warning-500/30`), nunca la roja de validación.
- Default del switch: oculto en el día base y en planes de un solo día; **OFF** si el día activo tiene los mismos
  targets que el base; **ON** si ya tenía metas propias distintas.
- **`TargetsEditorCard` RN tiene DOS hosts y el switch va en UNO solo (R-07, resuelto por evidencia en SPEC §7.5)**: la
  hoja del header (`QuickEditMode.tsx:2383-2402`, `SET_TARGET` con `activeVariant.key` en `:2398`) **lleva el switch
  «Solo el {día}»**; la card del lienzo (`:2011-2020`) se pinta **solo con `editorMode === false`**, o sea nunca dentro
  del editor único, así que queda **byte-idéntica y sin switch**: su criterio es «sigue despachando `SET_TARGET` con
  `variant.key` y **sin `scope`**», comportamiento actual intacto. Declararlo así es lo que R-07 pedía (que el segundo
  host no quede sin decidir); el espejo web sigue siendo el Popover + la card `md:hidden`.
- El aviso de metas parciales vive en la **`PublishBar`** —visible siempre— desde que se abre el editor: no es un modal
  ni aparece recién al pulsar Publicar (coherente con el mockup M4 y con r3).

**Gates W4.** `pnpm exec vitest run packages/nutrition-v2` (incluye el archivo nuevo `editor-state.day-targets.test.ts`)
+ los tests del reducer web · `pnpm typecheck` · tsc mobile · eslint por archivo · `pnpm check:tokens`.

**Riesgos y rollback.** (a) *Regresión silenciosa en los 103 tests del editor*: el primer caso del archivo nuevo es
«`SET_TARGET` sin `scope` = comportamiento actual». (b) *Estrategia `flexible` sin franjas* (el plan de Pame): las
metas son el plan entero, el aviso y el switch deben aparecer igual. (c) *Backfill*: no hay — solo 1 plan en LIVE tiene
metas parciales y se arregla con «Ir a Base». (d) Rollback: revert; `scope` es opcional.

**Estimación.** 1 día-agente. **Opus** (la lógica es compartida; cada plataforma es un solo componente), con el mockup
M4 delante.

## W5 · Equivalencias del alumno (ARREGLA el PDF de Pame)

**Objetivo y entregables.** Que el alumno vea «½ unidad · 50 g» con foto en vez de «20 g», con los genéricos del manual
arriba y las marcas abajo: parche por texto de `get_nutrition_today_v2`, read model con `isGeneric`, `imagePath`,
`imageVersion` e `imageLicense` opcionales, el helper de URL por path, `splitExchangeFoodsByOrigin` y los dos sheets con secciones,
miniatura y pie de atribución.
Archivos: los del bloque W5. El sheet V1 RN (`apps/mobile/components/alumno/nutrition/ExchangeEquivalencesSheet.tsx`),
`useStudentExchanges` y la ruta `apps/web/src/app/api/mobile/nutrition/exchanges/student-bundle/route.ts` **no se
tocan**: están vivos pero sin consumidor V2 (backlog de retiro).

**Migración (la única delicada del tren).**
`20260909130000_nutrition_today_v2_exchange_foods_media_generic.sql` parchea la definición **VIVA** por texto
(`pg_get_functiondef`), con dos empalmes y asserts de 1 hit por ancla, como
`supabase/migrations/20260906210308_nutrition_v2_item_lineage.sql:723-828`. **Copiar el cuerpo de la última definición
del repo revertiría la fuga cross-tenant B1**; se mantienen los canarios (`cl.coach_id from public.clients cl` ≥ 3
apariciones, `public.exchange_group_foods egf`) y se suman `position('isGeneric' in v_def) > 0` y
`position('food_media fm' in v_def) > 0`.
- Empalme 1 (ancla `'portionGrams', ranked.exchange_portion_grams` + `order by eg.code, ranked.name, ranked.id`):
  agrega `isGeneric`, `imagePath`, `imageVersion` e `imageLicense`, y ordena por `owner_rank, ranked.is_generic desc,
  portion_label_present desc, ranked.name, ranked.id` — el **mismo** orden que va dentro del `row_number()` antes del
  tope de 60 y repetido en el `jsonb_agg` (`db-datos:B1`), para que un genérico **con** medida casera quede arriba de
  uno sin ella (en Postgres `true` va después de `false` en ASC, de ahí los `desc`; queda comentado para que nadie lo
  «arregle»).
- Empalme 2 (anclas `into v_exchange_foods` … `where ranked.rn <= 60;`): arrastra `f.brand is null` por `cand`/`ranked`
  y suma el `left join lateral` de `food_media` (precedencia `product_photo` > `eva_illustration`) **después** del cap
  de 60, servido por `food_media_food_kind_idx`.
- Se emiten **cuatro llaves: `imagePath` (el `object_path`), `imageVersion` (entero chico), `isGeneric` e
  `imageLicense`** (la licencia de la foto, para el pie de atribución condicional; OUTLINE §13 y SPEC §9.4) — R-02
  cierra la contradicción a favor de que la versión **sí viaja**: `foodMediaThumbnailUrl`
  (`apps/mobile/lib/nutrition-v2-food-media.ts:43-58`) arma `…/object/public/${bucket}/${path}?v=${media.version}` y
  **sin `version` no se puede reutilizar**. Lo que **no** viaja es el objeto media completo (+136 % de payload,
  116 → 274 kB medido en LIVE) porque el caché offline RN descarta en silencio todo lo que pase de 750 kB
  (`apps/mobile/lib/nutrition-v2-cache.ts:6`); con path + versión + licencia + flag sube ~29 % (116 → ~149 kB peor caso; el caso
  real, 3,86 grupos promedio, pasa de ~91 a ~117 kB). El `bucket` es constante por CHECK y no viaja.
- **Helper nuevo con tarea propia** (hoy no existe ninguno que arme la URL desde un path suelto):
  `foodMediaThumbnailUrlFromPath(path, version)` en `apps/mobile/lib/nutrition-v2-food-media.ts` y su gemelo web en
  `apps/web/src/lib/food-image.ts`, ambos con test de la URL construida (path encodeado por segmento, `?v=` presente,
  `null` si falta el path o la base).

**Reglas duras de UI.** Miniatura `FoodThumbnail size="sm"` (36 px en RN **y** en web; el kit ofrece 36/48/64 y no se
agrega un 40, R-11). **Fallback sin foto = el `GroupDot` del grupo**, que es lo que ya hace el sheet hoy: `FoodThumbnail`
toma `fallbackCategory` (una categoría del catálogo) y el read model del sheet **no trae `category`**
(`PortionEquivalencesSheet.tsx:243-247` lo documenta) — no hay «ícono derivado del nombre» en el kit y el RPC no emite
`category` (R-10). Secciones
«Genéricos · INTA · UDD» y «Marcas y productos»; medida casera en negrita con los gramos en mono debajo; si
`portion_label` es `null`, gramos como hoy (es el estado normal de las marcas, no un error). Pie único «Fotos: Open
Food Facts (CC BY-SA)» cuando hay al menos una foto: 1.316 fotos del catálogo son `cc_by_sa` y todas traen
`attribution`. **Prohibido** `render/image` para redimensionar (cuota de Image Transformations): se usan los helpers
existentes contra `/storage/v1/object/public/…`.

**Gates W5.** `pnpm exec vitest run packages/nutrition-v2` (read models **con y sin** las llaves nuevas:
retrocompatibilidad de binarios viejos) · vitest de `apps/web/src/app/c/[coach_slug]/nutrition-v2` ·
`tests/mobile-nutrition-v2-portions.test.ts` · `supabase/tests/nutrition_today_v2_exchange_foods_media_generic_rollback.sql`
por MCP con `BEGIN … ROLLBACK` · `tests/team/exchange-lists-isolation.sql` extendido con la foto (regresión B1) · tsc
web + mobile · eslint por archivo.

**Riesgos y rollback.** (a) *Revertir B1 al parchear*: anclas + asserts + canario. (b) *Payload y caché offline*: se
mide el Today real de un alumno con 7 grupos antes y después; si preocupa, cap de 40 para grupos con foto. (c) *Jank
del sheet con 60 filas con imagen*: la salida barata es cortar a 30 visibles + «Ver más», no virtualizar. (d) Rollback
del RPC: parche inverso por texto sobre la definición viva (nunca un `create or replace` con cuerpo copiado); el read
model tolera la ausencia de las llaves porque son opcionales.

**Estimación.** 2 días-agente (1,5 no contemplaba los dos helpers `…FromPath` con sus tests ni las cuatro llaves del
RPC). Parche del RPC: **Opus** con revisión del jefe antes de aplicar. Read model, helpers y sheets: **Opus** con el
mockup M5 delante.

## W6 · Cierre (MIDE y entrega)

**Secuencia (la real, con el fix de `db-datos:B3` / R14-ter).** Lo de datos ya pasó en W0 —migraciones `20260909120000`
y `20260909120500` aplicadas en LIVE, `_POST_DEPLOY_` del seed con los 13 grupos **apagados** (`deleted_at = now()`) y
`--apply` del script de equivalencias— así que W6 arranca con el set sembrado pero invisible. Después: docs (§Docs y
cierre) → suite completa una vez → push a `rnmobiledenuevo` = `master` **solo con pedido
explícito del owner** → deploy Vercel READY → OTA 1.1.2 android/ios desde `.github/workflows/mobile-ota.yml` (nunca a
mano) → **encendido del set chileno en W6.8** por MCP (`update exchange_groups set deleted_at = null where is_system and
portion_system = 'cl'`, recién con el deploy READY y **las dos OTAs publicadas**, porque hasta ese momento no hay
filtro de visibilidad en producción; criterio: `count(*) … is_system and deleted_at is null` = **22 vivos**, 0 códigos
duplicados; apagado = la misma sentencia con `deleted_at = now()`) → `pnpm qa:prod:suave` → avisos → QA del owner en
device. **Gates:**
`pnpm test` (suite completa, **una sola vez**, con la CPU libre y avisando al owner) · `pnpm typecheck` · tsc mobile ·
`pnpm lint` · `pnpm check:tokens` · `pnpm check:nutrition-v2-boundaries` · `pnpm docs:check` · `pnpm qa:prod:suave`.
**Riesgo**: `CURRENT.md` está en 16.106 B de un tope de 16.384 (`scripts/check-docs.mjs:117`) ⇒ mudar prosa al archivo
histórico ANTES de escribir la entrada nueva, o `docs:check` se pone rojo. **0,5 días-agente**: **jefe** (docs, gates,
release) y **owner** (OK de push/deploy/OTA, QA, avisos).

## Gates por ola (reales, con salida pegada en TASKS)

| Gate | Comando | Cuándo |
|---|---|---|
| Vitest paquete | `pnpm exec vitest run packages/nutrition-v2 packages/nutrition-engine` | W1–W5 |
| Vitest tocados | `pnpm exec vitest run <archivos de la ola>` | cada ola con código |
| RTL web | `pnpm exec vitest run "apps/web/src/app/coach/nutrition-v2/[clientId]/_quick-edit"` | W2, W3, W4 |
| Typecheck web | `pnpm typecheck` | W1–W5 (avisar antes: come CPU) |
| Typecheck mobile | `pnpm --filter @eva/mobile exec tsc --noEmit` | W1–W5 |
| Lint por archivo | `pnpm exec eslint <archivo>` · `pnpm lint:mobile -- <archivo>` | cada ola (modo CPU ocupado) |
| Tokens | `pnpm check:tokens` | W2, W3, W4, W5 |
| Boundaries V2 | `pnpm check:nutrition-v2-boundaries` | W1, W5, W6 |
| Docs | `pnpm docs:check` | **W6** (R-19: recién cuando el SDD vive en `docs/specs/`; W0 solo lo crea en `draft`) |
| SQL en LIVE | MCP `execute_sql` con `BEGIN … ROLLBACK` sobre `supabase/tests/*.sql` | W0 y W5 |
| E2E nutrición | `pnpm test:e2e:nutrition` (**opcional**: solo si existen las envs `E2E_*`) | W6 |
| Tipos DB | edición a mano de `apps/web/src/lib/database.types.ts` | tras aplicar W0 en LIVE |
| Suite completa | `pnpm test` | **una vez**, W6, antes del push |
| E2E | `pnpm qa:prod:suave` | cierre del tren |

Modo CPU ocupado (regla del owner): vitest y eslint por archivo mientras otra sesión corre tsc o la suite; avisar antes
de un typecheck completo. E2E solo al cierre, un navegador.

## Contratos que NO se rompen

1. **UNIQUE `(meal_slot_id, exchange_group_id)`** (`20260718140000_nutrition_portions_v2.sql:60`): el bump actualiza, no
   agrega; la conversión colapsa `ARL`+`G` antes del payload.
2. **Snapshots congelados** (`plan-persistence.ts:577` re-lee la fuente al publicar): un plan publicado no cambia de
   significado porque cambie el catálogo, y la expansión de compuestos usa los `ref_*` **congelados** (guardián en
   `packages/nutrition-v2/portions-qa.test.ts:141`).
3. **El filtro de set jamás toca la resolución por id** (`findExchangeGroupsByIdsForTenant`,
   `resolveExchangeGroupsForDraft`), **ni el catálogo de autorización** (`findExchangeGroupsForScope`, del que come
   `findExchangeGroupConflict`), **ni el servicio `getExchangeGroupsForCoach`** (R13: alimenta 5 caminos, entre ellos
   el `group-foods` móvil, que devolvería 404 `GROUP_NOT_FOUND`). Vive **solo en los bordes de presentación** —loader
   del picker web, respuesta de la ruta móvil (marcando) y sheet RN sobre la lista mergeada— y **falla abierto**.
4. **Códigos del sistema únicos**: índice `exchange_groups_system_code_uq` + assert del seed; cinco caminos de código
   dependen de eso.
5. **Los tests existentes de `editor-state.day-errors` y de los tres archivos de `_quick-edit` siguen verdes sin
   editarlos** (16 + 87 = **103** al 08-09; si el número cambió, manda la salida real, no esta cifra): `scope` y
   `portionSystem` son opcionales, `BUMP_PORTION_TARGET` es una acción nueva y ni `mergePortionGroupChoices` ni
   `compareCatalogGroups` cambian de comportamiento. Y **cero DDL en W4**: `scope: 'all'` escribe en el base *y* en los
   días que heredaban porque `nutrition_v2_ensure_day_snapshot` copia una variante entera sin `coalesce`
   (`supabase/migrations/20260714192500_nutrition_v2_draft_delete_and_effective_versions.sql:43-52, 86-92`, **la ruta
   real, verificada en el repo**; el `…_nutrition_v2_day_snapshot.sql` que citaban las versiones viejas no existe).
6. **Canario B1 del RPC**: el parche por texto mantiene los asserts de `cl.coach_id from public.clients cl` y de
   `public.exchange_group_foods egf`; el copy-body está prohibido.
7. **RLS y tier**: cero cambios en `exchange_groups` (los 13 son `is_system`, legibles por `xg_select`), los writes a
   `is_system` siguen negados en las tres capas, y nada de esto se esconde por plan (V2 es estándar en Free).

## Docs y cierre

### `docs/status/CURRENT.md`

**Antes de escribir**: el archivo mide 16.106 bytes y el tope de `pnpm docs:check` es 16.384
(`scripts/check-docs.mjs:117`). Hay que mudar prosa vieja a `docs/archive/current-historial-2026-09.md` en el mismo
commit. Se edita la fila «Nutrition V2» de «Estado por frente» (no se duplica) y se agrega UNA entrada numerada en
«Prioridades vigentes», de ≤ 4 líneas:

```text
1. **Tren «Porciones a la chilena» (Nutrición V2, reporte de `nutricionista-pame-cid` 08-09) — EN PRODUCCIÓN
   <fecha> <hora>Z, QA del owner <estado>, SDD `<status>`** ([tareas](../specs/nutrition-porciones-chilenas/TASKS.md);
   `master` = `rnmobiledenuevo` = `<sha>`, deploy `<dpl_id>` READY, 3 migraciones en LIVE `<ts1>`…`<ts3>` + seed
   `_POST_DEPLOY_` aplicado y set chileno **encendido** tras las OTAs, OTA 1.1.2 android `<id>` / ios `<id>`): set chileno INTA/UDD de 13 grupos como estándar
   con SMAE en «Legado» y conversión iniciada por el coach; el picker suma ½ en vez de bloquear; las metas escriben en
   todos los días salvo «Solo este día»; equivalencias con medida casera y foto. Queda: <…>.
```

### `docs/status/MOBILE_PARITY.md` (blockquote fechado, arriba de todo)

```text
> **2026-09-<dd> (tren «Porciones a la chilena», Nutrición V2 — W0–W6 EN PRODUCCIÓN ~<hh:mm>Z: `master` =
> `rnmobiledenuevo` = `<sha>`, deploy `<dpl_id>` READY, 3 migraciones en LIVE `<ts1>`/`<ts2>`/`<ts3>` + seed
> `_POST_DEPLOY_20260909121000`, OTA 1.1.2 `production` android `<id>` (run <n>) / ios `<id>` (run <n>); QA del owner
> en device <estado>)** ([SDD](../specs/nutrition-porciones-chilenas/SPEC.md), mockups M1–M5 aprobados el 08-09).
> Paridad web + RN: **picker** con secciones «Sistema chileno · INTA 1999 · UDD 2019» y «Legado (SMAE)» colapsable y
> fila usada viva que suma media porción (`BUMP_PORTION_TARGET`) con toast «Deshacer» y resalte de 1,2 s; **stepper de
> porciones RN** con tap-to-edit y teclado decimal (paridad con `StepperField` web); **etiqueta «1 porción ≈»** expande
> `composed_of` (`qeGroupRefPerPortion`) en los seis lugares, incluida la cabecera del sheet del alumno (Legumbres deja
> de decir 0 kcal); **conversión SMAE → chileno** (`PortionConversionSheet` RN / `PortionConversionDialog` web) con
> preview por franja, selector de lácteo y delta del día, solo sobre el borrador; **metas del día** con switch «Solo el
> {día}» (`SET_TARGET.scope`) y aviso ámbar no bloqueante en `PublishBar` con «Ir a Base»; **sheet de equivalencias del
> alumno** con secciones Genéricos/Marcas, medida casera en negrita y miniatura `FoodThumbnail sm`. Lógica pura en
> `packages/nutrition-v2/` (`exchange-visibility`, `exchange-conversion`, `exchange-foods-origin`, `editor-state`).
```

Es la **primera** entrada de paridad sobre el sheet de equivalencias del alumno: se agrega, no se edita ninguna.

### `docs/testing/TEST_STATUS.md` (sección de tren, patrón de `TEST_STATUS.md:345`)

```text
## Tren «Porciones a la chilena» (Nutrición V2) — W0–W6, 2026-09-<dd> (worktree `porciones-chilenas`)

SDD en [`docs/specs/nutrition-porciones-chilenas/`](../specs/nutrition-porciones-chilenas/TASKS.md). Gates del jefe
tras el juicio de los workers (salida real):

- `pnpm exec vitest run packages/nutrition-v2 packages/nutrition-engine …` ⇒ **<n> archivos / <n> tests verdes** (<s> s).
  Nuevos: `exchange-visibility`, `exchange-conversion`, `editor-state.day-targets`, `editor-state.portions-ref`,
  `exchange-foods-origin`, `EditablePortionsCard.test.tsx`.
- `pnpm typecheck` ⇒ <res> · tsc mobile ⇒ <res> · eslint por archivo (web/paquete y mobile) ⇒ <res>.
- `pnpm check:tokens` ⇒ <res> · `pnpm check:nutrition-v2-boundaries` ⇒ <n> archivos OK · `pnpm docs:check` ⇒ <res>.
- SQL: `exchange_groups_portion_system_rollback.sql` y `nutrition_today_v2_exchange_foods_media_generic_rollback.sql`
  validados en LIVE en una sola transacción con **ROLLBACK** · `pnpm qa:prod:suave` ⇒ <n>/9 (run `<id>`).
```

Solo el resultado consolidado (fecha, SHA o run, entorno, comando, resultado, bloqueador): nada de logs largos.

### Avisos (los manda el owner)

**A los coaches con porciones SMAE vivas — banner in-app, no push masivo** (9 por V2 al 08-09; **hay que sumar los de
V1**, que la query de W0.6 cuenta en la misma pasada, y con ese número se cierra la lista de destinatarios). Mismo texto
del banner del editor: «Este plan usa las porciones anteriores (SMAE). Ahora EVA trae el sistema chileno (INTA/UDD):
cereales a 140 kcal y 30 g, lácteos por grasa, carnes bajas y altas. Puedes convertir el borrador y revisar antes de
publicar.» con «Ver conversión» y «Ahora no».

**A `nutricionista-pame-cid`, por el canal por el que llegó el reporte:**

```text
Hola Pame, soy Juan Manuel, de EVA. Escuché tus audios y tenías razón en todo.

1) La porción de carbohidratos estaba con valores mexicanos (70 kcal · 15 g). Ya está el sistema chileno del INTA y la
   UDD: «Panes, cereales y tubérculos» son 140 kcal y 30 g de carbohidrato, los lácteos van separados por grasa
   (descremado, semi y entero) y las carnes en bajas y altas. Son 13 grupos con los valores del manual.
2) Ahora puedes poner más de una porción del mismo grupo: si tocas uno que ya está en la comida le suma media porción y
   te avisa. También puedes tocar el número y escribirlo.
3) Tus pacientes ven exactamente los mismos grupos que tú: no hay dos catálogos.
4) Las metas se guardan para todos los días salvo que actives «Solo este día», y si algún día queda sin meta la app te
   avisa antes de publicar.
5) Cuando tu paciente toca «equivalencias» ve primero los genéricos con la medida casera del manual («½ marraqueta ·
   50 g», «¾ taza de arroz cocido · 130 g») y foto; las marcas quedan después, para que no tengas que mandar tu PDF.

Si algo no te calza con tu manual, dímelo y lo revisamos. Gracias por el reporte: cambió el producto.
```

**A `dudu` (3 grupos propios con valores INTA) y `josefit` (grupo propio «Proteinapro»):**

```text
Hola, te aviso un cambio en EVA. Agregamos el sistema chileno de porciones (INTA 1999 / UDD 2019) como estándar: 13
grupos con los valores del manual, así no hay que cargarlos a mano. Tus grupos propios siguen tal cual, nadie los tocó,
y tus planes publicados no cambian. Cuando abras un plan con los grupos anteriores vas a ver un aviso para convertirlo:
te muestra el antes y el después franja por franja y no guarda nada hasta que publiques. Si prefieres seguir como
estás, «Ahora no» y listo.
```

Los grupos propios de `dudu` probablemente calcen con un chileno: la conversión se lo ofrece con confirmación, nunca
automático.

### Analytics (PostHog; Ley 21.719: sin kcal, gramos, nombres de alimentos ni ids)

Los cinco eventos son `nutrition_portion_group_bumped`, `nutrition_portion_conversion_previewed`,
`nutrition_portion_conversion_applied`, `nutrition_targets_scope` (con `scope: 'day' | 'all'`, el mismo enum que
`SET_TARGET.scope`) y `nutrition_equivalences_opened`. **Su forma exacta —props, tipos y tramos— vive en una sola
fuente: [DATA](DATA.md) §11** (fix `seguridad:S-07`); acá no se reescribe, para que ningún worker tenga dos tablas
entre las que elegir. De ahí salen las tres reglas que no se negocian: `surface: 'rn' | 'web'` en los cinco,
`group_code` **solo en los eventos del coach** (1, 2 y 3) y nunca en el del alumno, y `rows_bucket` como **tramo**,
jamás el número. Los enums viven en el paquete compartido y web y RN los importan literal, como
`captureNutritionItemImplausible` (`apps/mobile/lib/analytics.ts:145-169`).

## Estimación

**12,5 días-agente**: W0 **3** (W0a 1 + W0b 2) · W1 **2** · W2 2 · W3 2 · W4 1 · W5 **2** · W6 0,5. Con W2 ∥ W3 ∥ W4 en
workers distintos, el calendario real son ~9 jornadas más el QA del owner. La subida contra la estimación anterior
(10 d / ~7 jornadas) es deliberada: la curaduría de las ~165 filas de genéricos con su desambiguación de `food_id` es
sola más de un día (R-17), W1 sumó los dos productores de la visibilidad y el contrato de la ruta móvil (R14), y W5
sumó los dos helpers de URL por path (R-02). Fuera de alcance: infraestructura de «sistemas de porciones» por país
(desproporcionada para 9 coaches), PDF brandeado, platillos chilenos, micronutrientes, la reclasificación de los 2.253
alimentos sin grupo y el grupo INTA «ricos en lípidos» de 175 kcal — la palta va a `AG` (2 cucharadas = 30 g) y **no se
crea un grupo 14** (R-16).

## Decisiones del jefe post-críticos

Las «Preguntas del fixer» quedaron cerradas por el jefe el 09-09 (RESOLUCIONES-2 §D). Cada una con su respuesta, en una
línea:

1. **Corte del eje de carnes (D-7) — 0,40 único, en todo el SDD.** `fatEnergyShare ≤ 0,40 → CB` · `> 0,40 → CA` ·
   `null → descartar`, y **ningún otro umbral**: los que proponía la versión anterior de DATA §4.3b quedan borrados.
   [DATA](DATA.md) §4.3b ya está escrito con `MEAT_SPLIT = { CB_MAX: 0.40 }`, y el único `SUPPLEMENT_FAT_MAX` que
   sobrevive es el guard de `SP → SCP`, que **no** tiene nada que ver con el eje de carnes.
2. **Fallback de miniatura sin foto (D-2) — `GroupDot` del grupo.** El RPC **no** emite `category` (evita una quinta
   llave y payload); se queda lo que el sheet ya hace hoy, y no hay tarea nueva en W5 por este punto.
3. **`recyclingKey` en `FoodThumbnail` (R-18) — se saca.** No es prop del kit y la lista no está virtualizada: SPEC §9.3
   ya lo retiró y W5 no toca el componente compartido.
4. **Segundo host RN de `TargetsEditorCard` (D-1) — sí, sin switch.** El host del lienzo
   (`QuickEditMode.tsx:2011-2020`, solo con `editorMode === false`) queda byte-idéntico y **sigue despachando
   `SET_TARGET` sin `scope`**; con eso R-07 queda satisfecho por declaración y W4.3 no lo empareja «de paso».
5. **`CA`/`LGS` desde INTA y palta en `AG` (R-15 / R-16) — aceptados por el jefe.** La palta va a `AG` (2 cucharadas =
   30 g) y **no se crea un grupo 14**: queda anotado en SPEC §14 «Fuera de alcance» como decisión del jefe (R-16). Lo
   que sí es pregunta al **owner** —y por eso no se responde acá— vive en SPEC §15: **Q5** (fijar el set con el PDF UDD
   2019 y verificar después contra la edición 2021) y **Q1** (`macros_confirmed = true` en los 13).

Y las tres decisiones que este documento hereda de los otros archivos: **D-3** ningún índice para
`findUsedPortionSystemsForCoach` salvo que el EXPLAIN de W0.6 muestre seq scan relevante ⇒ migración aparte con
`(version_id, exchange_group_id)` (§W0) · **D-4** miniatura **36 px en RN y web** (§W5) · **D-5** la carcasa del banner
de conversión la monta W2, W3 solo la enchufa, y el jefe mergea en el orden **W2 → W4 → W3** (§Orden obligado) ·
**D-6** `findUsedPortionSystemsForCoach` con parámetro `usedSystems` es el único nombre, sin alias ni «reemplaza a…».

**Lo que NO se decide acá**: las preguntas al owner (macros_confirmed, aviso que no bloquea, lácteo por default, crear
grupo propio en web, UDD 2019 vs 2021) viven en **SPEC §15 Q1–Q5** y siguen abiertas.
