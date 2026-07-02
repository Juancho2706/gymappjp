# 4. Modulo Pro: Intercambios (nutrition_exchanges)

El add-on de pago "Nutricion Pro". Reemplaza la prescripcion por gramos de alimentos por una prescripcion por **porciones de grupos de intercambio** (metodo SMAE/UDD), con variantes de dia, totales derivados, equivalencias por alimento, PDF branded y objetivos por composicion corporal. Esta seccion enfatiza el backend: que datos llegan, que se calcula, como se persiste/propaga/reconcilia, que servicio/accion/RPC/tabla toca, y las invariantes de seguridad de datos.

`module_key` canonico: `nutrition_exchanges` (constante `MODULE_KEYS` en `services/entitlements.service.ts`, junto a `cardio`, `movement_assessment`, `body_composition`).

---

## 4.1. Que es el sistema de intercambios / porciones

### Conceptos de dominio (`domain/nutrition/exchange.types.ts`)

- **Grupo de intercambio (`ExchangeGroup`)** — unidad de PORCION con macros de referencia POR PORCION (`refCalories`, `refProteinG`, `refCarbsG`, `refFatsG`). Tiene `code` (chip corto: `C`, `P`, `F`, `V`, `LAC`, `ARL`, `SP`, `G`, `LEG` — termino de dominio, NO se traduce), `name`, `slug`, `color` (hex del badge, null = paleta derivada), `sortOrder`, `composedOf` (grupo compuesto, null = simple), `macrosConfirmed` (false ⇒ badge "referencial"). Ownership 3-vias: `isSystem` (catalogo global), `coachId` (propio del coach), `teamId` (del pool).
- **Grupo compuesto (`ComposedGroupPart`)** — un grupo cuyas macros se expanden en otros grupos base. El unico system es `LEG` (Legumbres) = `[{code:'P',portions:1},{code:'C',portions:1}]`: 1 porcion de LEG = 1P + 1C. Sus `ref_*` son 0 (no duplicar macros).
- **Objetivo por comida (`MealExchangeTarget`)** — porciones prescritas de un grupo en UNA comida (`mealId`, `exchangeGroupId`, `portions` > 0 hasta 99, `notes`). La pauta real asigna porciones **por comida**, no por dia; los totales diarios se DERIVAN.
- **Variante de dia (`DayVariant`)** — tipo de dia de la pauta ('Descanso', 'Entreno AM', 'Entreno PM'), con `planId`, `name`, `sortOrder`.
- **Equivalencia alimento→porcion (`ExchangeFoodEquivalence`)** — `foodId`, `name`, `exchangeGroupId`, `portionGrams`, `portionLabel` (medida casera: '3/4 taza', '1 unidad chica').
- **Modo de plan (`NutritionPlanMode`)** — `'grams'` (flujo legacy, default) | `'exchanges'` (este modulo). Per-plan, columna `plan_mode`.

### El gate del modulo (entitlement server-side)

La resolucion del entitlement es por **contexto del RECURSO** (regla LOCKED en `entitlements.service.ts`): si el alumno del plan es de pool (`team_id` y NO `org_id`) decide `teams.enabled_modules`; en caso contrario decide `coaches.enabled_modules` del coach dueno. Los modulos del team NO se filtran a los clientes standalone del coach (no es union).

- `hasModule(db, key, ctx)` — boolean. `ctx.teamId` presente ⇒ manda el team (pool wins); si no, los flags del coach. Aplica el **kill-switch de operador** `EVA_DISABLED_MODULES` (CSV; apaga el modulo para TODOS por encima del entitlement, requiere redeploy). Default OFF (`{}`).
- `assertModule(db, key, ctx)` — guard que LANZA `Error('Modulo no habilitado: nutrition_exchanges')` si no esta ON. Se llama al tope de toda action/RSC del modulo.
- `getTeamEnabledModules` / `getCoachEnabledModules` leen el jsonb `enabled_modules` de `teams`/`coaches`.

**Donde se ancla el gate en el flujo de intercambios:**

1. `assertExchangesModuleForPlan(db, planId)` (`nutrition-exchanges.service.ts`): carga `findPlanModuleContext(db, planId)` (plan + tenant del alumno) y llama `assertModule(db, 'nutrition_exchanges', moduleCtxForPlan(ctx))`. `moduleCtxForPlan` decide: si `clientTeamId && !clientOrgId` ⇒ `{teamId}`; si no ⇒ `{coachId}`. Devuelve el `PlanModuleContext` (planId, coachId, clientId, planMode, clientTeamId, clientOrgId). **Toda** action de escritura del modulo pasa por aca.
2. `hasExchangesModuleForClientContext(db, ctx)` — version fail-closed para la vista del alumno (pool wins).
3. Espejo de UI en el builder (`getHasExchangesModule` en `_data/exchange.queries.ts`) — solo para mostrar/ocultar; el techo real es `assertModule` en las actions.

### `/exchanges/page` como puerta (`coach/nutrition-plans/exchanges/page.tsx`)

Superficie directa del modulo (plan 05 F5.7). El editor de intercambios NO vive aca: vive DENTRO del builder de cada plan. Esta ruta solo existe para que una URL directa al modulo apagado muestre un aviso AMABLE en vez de un error seco. Logica:

1. `supabase.auth.getClaims()` (verificacion local del JWT ES256, sin `/user`); sin user ⇒ `redirect('/login')`.
2. `getPreferredWorkspaceForRender(user.id)`. Si el workspace es `enterprise_coach` ⇒ `<ModuleOffNotice moduleKey="nutrition_exchanges" />` (enterprise no vende este modulo aca).
3. `activeTeamId` = teamId si el workspace es `coach_team`, si no null.
4. `hasModule(supabase, 'nutrition_exchanges', { teamId: activeTeamId, coachId: activeTeamId ? null : user.id })`. Si OFF ⇒ `<ModuleOffNotice />`.
5. Si ON ⇒ `redirect('/coach/nutrition-plans')` (el modo se activa por alumno dentro del builder del plan). `metadata.title = 'Nutricion Pro | EVA'`.

---

## 4.2. Donde vive el editor: builder modo `client-plan`

El modo intercambios SOLO se edita en `/coach/nutrition-plans/client/[clientId]` (PlanBuilder modo `client-plan`). En modo `template` (`/new`, `/[templateId]/edit`) NO hay editor de porciones: si el coach tiene Pro y el flag `micros_advanced` esta ON, el builder muestra solo un aviso ("Las porciones y equivalencias se configuran al asignar este plan a un alumno, no en la plantilla").

### Ensamblado del bundle (`client/[clientId]/page.tsx`)

Tras resolver auth/cliente y el master switch del dominio nutricion (`resolveNutritionDomainEnabled`, redirige a `/coach/dashboard` si OFF):

1. `sectionFlags = resolveFeaturePrefs({ domain:'nutrition', coachId, clientId, clientTeamId, clientOrgId, planId })`. Estas flags hornean **entitlement AND preferencia** (coach/team/cliente, pool-wins). Las dos que gobiernan Pro: `goals_bodycomp` (hornea `body_composition`) y `micros_advanced` (hornea `nutrition_exchanges`).
2. `hasExchanges = getHasExchangesModule(user.id, { orgId, activeTeamId })` (espejo de entitlement).
3. Si `hasExchanges`, en `Promise.all`: `getExchangeGroups(user.id, scope)` (catalogo), `getPlanExchangeBundle(plan.id)` (targets+variantes+modo; si el plan aun no existe ⇒ bundle vacio modo `grams`), `getCoachPdfBrand(user.id, scope)` (marca del tenant resuelta server-side). Luego `getExchangeEquivalencesForGroups(groups.ids)`.
4. Ensambla `ExchangeBuilderData` (`{ planId, planMode, groups, targetsByMealId, variants, variantByMealId, equivalences, brand, brandLogoUrl, clientName }`) y lo pasa como prop `exchange` al PlanBuilder junto a `sectionFlags`.

### Gating efectivo en el cliente (`PlanBuilder.tsx`)

- `microsAdvancedVisible = sectionFlags ? sectionFlags.micros_advanced === true : !!exchange` (fail-OPEN al legacy si faltan flags).
- `exchangeEnabled = !!exchange && mode === 'client-plan' && microsAdvancedVisible`.
- `exchangeActive = exchangeEnabled && planMode === 'exchanges'`.
- **Render-only:** si el modulo se apaga a posteriori, el modo `exchanges` YA persistido en DB se conserva; solo se oculta la superficie de edicion. El gate de dinero/escritura es server-side.

`getCoachPdfBrand` (en `_data/exchange.queries.ts`) resuelve la marca por workspace: team ⇒ marca del `teams` (name/primary_color/logo_url); org ⇒ marca de `organizations`; standalone ⇒ marca del coach (`brand_name||full_name`, `primary_color`, `logo_url`, `subscription_tier`). Free tier fuerza marca EVA (`resolvePdfBrand` retorna `EVA_PDF_BRAND` con `poweredByEva:true`, y entonces `logoUrl` se anula).

---

## 4.3. Toggle Gramos ↔ Porciones (ExchangeModePanel)

### Que cambia funcionalmente

El `ExchangeModePanel` es el panel cabecera del builder en modo client-plan. Componentes funcionales:

- **Switch Gramos ↔ Porciones** — `checked={active}`, deshabilitado si `!canToggle` (plan sin id ⇒ "guarda el plan primero") o `togglePending`. Al cambiar dispara `onToggleMode(checked)` ⇒ `handleToggleExchangeMode` en PlanBuilder.
- **`handleToggleExchangeMode(next)`**: requiere `exchange.planId`; setea `planMode` optimista; llama `setPlanModeAction({ planId, mode })`; si falla revierte y muestra toast. El switch es **NO destructivo**: conserva `food_items` y `meal_exchange_targets` (solo cambia `nutrition_plans.plan_mode`).
- **Efecto del modo activo en el resto del builder:**
  - `useEffect`: al activarse `exchangeActive`, fuerza `autoSync = false` — en modo porciones los objetivos (`daily_*`) son el REQUERIMIENTO que fija la nutri, no se auto-sincronizan con la suma de alimentos por gramos.
  - El guardado del plan (`handleSave`) NO exige que cada comida tenga >= 1 alimento (en gramos si lo exige); envia `plan_mode: 'exchanges'` y los `id` de DB de las comidas persistidas (matching por ID).
  - Totales del sidebar (`sidebarTotals`) en modo porciones se derivan de los targets del primer "dia entero" (`exchangeTotalsByVariant[0]`), no de los gramos.
  - `MealCanvas` recibe `exchangeMode={exchangeActive}` y `renderMealExtra` que monta un `ExchangeTargetsEditor` por comida.

### Totales por variante vs objetivo

Bloque "Totales derivados vs objetivo": por cada fila de `totalsByVariant` muestra `{nombre variante o "Dia completo"}` y `{kcal derivadas}/{goals.calories} kcal · P {derivada}/{goals.protein} · C .../ ... · G .../...`. La fuente es `dayTotalsByVariant(exchangeMealsLike, dayVariants, exchange.groups)` (calculo puro, ver 4.5). El objetivo (`goals`) viene de los campos `daily_*` del plan que fija la nutri en el sidebar.

Otros controles del panel:
- Aviso `provisional` (si algun grupo usado tiene `macros_confirmed=false`).
- **Gestor de variantes de dia**: chips de variantes existentes con boton borrar; presets `['Descanso','Entreno AM','Entreno PM']` (solo los que no existen) como botones de creacion rapida; input + boton "Agregar" para nombre libre.
- **PDF**: radiogroup `compact` | `equivalences`, boton "Descargar", preview del nombre del tenant (`brand.brandName`).

---

## 4.4. ExchangeTargetsEditor — editor por comida

Componente por comida (montado via `renderMealExtra`). Funcional:

- `targetByGroup` (Map groupId→draft) desde `targets`. Calcula en vivo `mealMacros = macrosForTargets(targets, groups)`, `summary = portionsSummaryLabel(...)`, `provisional = hasUnconfirmedMacros(...)`.
- Por cada grupo del catalogo: chip de color + `code`, nombre, `{refCalories} kcal/"1"` (con `*` si `!macrosConfirmed`), y stepper −/+ (step=1 por defecto; prop preparada para 0.5 — pendiente Fran). `setPortions` clampa a `[0,99]` redondeando a 1 decimal; porciones 0 ⇒ se elimina el target de la lista (no se persiste un 0).
- Cambios disparan `onChange(mealId, targets)` ⇒ `handleExchangeTargetsChange` en PlanBuilder.
- **`handleExchangeTargetsChange`**: actualiza estado local; si la comida NO esta persistida (`meal-*`) no guarda; si lo esta, marca `saving`, **debounce de 700ms** y llama `saveMealExchangeTargetsAction({ mealId, targets })`; setea estado `saved`/`error`.
- `persistable = isPersistedMealId(mealId)`: comidas nuevas (`meal-*`) tienen steppers deshabilitados con hint "guarda primero".
- Indicador de save (`idle`/`saving`/`saved`/`error`), badge "referencial", summary (`portionsSummaryLabel`) y totales derivados (`mealMacros`).
- **Selector de variante** (solo si hay variantes): botones "Todas" (variantId=null) + una por variante. `onVariantChange` ⇒ `handleMealVariantChange` ⇒ `assignMealVariantAction` (transition, no debounce). Solo si la comida esta persistida.

---

## 4.5. VARIANTES DE DIA

### Que son y como se modelan

Una **variante de dia** es un tipo de dia de la pauta (Descanso / Entreno AM / Entreno PM, presets editables). Permiten que una comida aplique solo a ciertos dias. Coexiste con `nutrition_meals.day_of_week` (que NO se toca).

**Modelo en DB (migracion `20260611093001_nutrition_exchanges.sql` §4):**
- Tabla `nutrition_plan_day_variants`: `id`, `plan_id` (FK `nutrition_plans` ON DELETE CASCADE), `name`, `sort_order` (default 0), `created_at`.
- `nutrition_meals.day_variant_id` (FK `nutrition_plan_day_variants` **ON DELETE SET NULL**) — columna aditiva nullable; indice FK completo.

**Contrato semantico clave (calculo y RLS):** `day_variant_id` **NULL = la comida aplica a TODAS las variantes**. Una comida con variante X aplica solo a X. Planes viejos (sin variantes, todo NULL) quedan intactos.

### Como se persisten

CRUD via `nutrition-exchanges.service.ts` → `exchanges.repository.ts`, todo con `assertExchangesModuleForPlan` + `setPlanLastEditedBy` (awareness del pool):

- **Crear** `createPlanDayVariant(db, {actorCoachId, planId, name})`: limite **6 variantes por pauta** (`existing.length >= 6` ⇒ error); no permite nombre duplicado (case-insensitive); `insertDayVariant(db, planId, name, existing.length)` (sort_order = cantidad actual). Action: `createDayVariantAction`.
- **Renombrar** `renamePlanDayVariant` → `renameDayVariant`. Action: `renameDayVariantAction`.
- **Borrar** `deletePlanDayVariant` → `deleteDayVariant`. Por el ON DELETE SET NULL, las comidas de esa variante quedan en "todas" (NULL). El cliente tambien reconcilia su estado local (`variantByMealId` → null donde apuntaban). Action: `deleteDayVariantAction`.
- **Asignar variante a comida** `assignMealDayVariant(db, {actorCoachId, mealId, variantId})`: resuelve el plan via `findMealPlanId`; **valida que la variante pertenece al mismo plan** (`findDayVariantPlanId(variantId) === planId`) — defensa contra asignar una variante de otro plan; `setMealDayVariant(mealId, variantId)`. Action: `assignMealVariantAction`.

`findMealVariantAssignments(db, planId)` lee `{mealId, dayVariantId}` de todas las comidas del plan (alimenta `variantByMealId` en builder y alumno).

---

## 4.6. CALCULO (`services/nutrition-exchanges/exchange-calc.ts`)

Modulo **PURO** (sin IO/Next/Supabase), reusable en builder (client), PDF y app del alumno. Redondeo `round1` (1 decimal). `ZERO = {calories:0, proteinG:0, carbsG:0, fatsG:0}`.

### Expansion de grupos compuestos — `expandComposedGroups(targets, groups)`

Devuelve `EffectiveTarget[]` (`{group, portions, sourceGroup}`). Logica:
1. Mapea targets a su `ExchangeGroup` por id; descarta grupos desconocidos (id no presente en `groups`) y `portions <= 0`.
2. Si el grupo NO tiene `composedOf` ⇒ se emite tal cual.
3. Si SI lo tiene: por cada parte resuelve el grupo base por `code` con `findByCode` (prioriza `isSystem`). Si ALGUN code no resuelve ⇒ **fallback honesto**: el compuesto NO se expande y se usa con sus propios `ref_*`. Si todos resuelven ⇒ emite una fila por parte con `portions = round1(part.portions × target.portions)`.
   - Ejemplo: target `1 LEG` ⇒ `1 P` + `1 C` (LEG tiene `ref_*` = 0, las macros vienen de P y C reales).

### Macros derivados — `macrosForTargets(targets, groups)`

Expande compuestos y suma `group.ref{Calories,ProteinG,CarbsG,FatsG} × portions` por grupo efectivo. Redondea a 1 decimal. **Esta es la formula central del modo intercambios:** Σ porciones × macros de referencia del grupo (tras expandir compuestos).

### Totales del dia y por variante

- `dayTotals(meals, groups)` — suma `macrosForTargets` de todas las comidas (sin distincion de variante).
- `dayTotalsByVariant(meals, variants, groups)` — si no hay variantes ⇒ una entrada `{variantId:null, name:null, totals: dayTotals(...)}`. Con variantes ⇒ por cada variante suma las comidas cuyo `dayVariantId == null` (aplica a todas) **O** `=== v.id`. Implementa el contrato NULL=todas. Cada `MealTargetsLike` es `{targets, dayVariantId?}`.

### Helpers de presentacion (puros, usados por editor y PDF)

- `formatPortions(n)` — render compacto (1 ⇒ '1', 0.5 ⇒ '0.5').
- `portionsSummaryLabel(targets, groups)` — "2C · 1LAC · 1F" ordenado por `sortOrder` (desempate `code`), **SIN** expansion (la nutri prescribe "1LEG").
- `hasUnconfirmedMacros(targets, groups)` — true si algun grupo usado tiene `macrosConfirmed=false` (badge "referencial", AC3).
- `exchangeGroupColor(group)` — hex valido del grupo o color deterministico de `EXCHANGE_FALLBACK_COLORS` por `sortOrder % len`.

---

## 4.7. Persistencia, reconciliacion y cascade-safety

Hay **dos caminos de escritura** de los targets:

### A) Edicion granular por comida (debounce) — `saveMealExchangeTargets`

`saveMealExchangeTargetsAction` → service `saveMealExchangeTargets(db, {actorCoachId, mealId, targets})`:
1. `findMealPlanId(mealId)` ⇒ plan; sin plan ⇒ error.
2. `assertExchangesModuleForPlan(planId)` (gate).
3. **`verifyGroupsVisibleToActor(db, groupIds)`** — coercion server-side del payload client-controlled (gotcha F4 movida-areas): TODO `exchangeGroupId` debe resolver contra los grupos visibles para el actor (RLS `xg_select` es el techo). El FK de `meal_exchange_targets` NO valida visibilidad — esta verificacion si. Si falta alguno ⇒ "Grupo de intercambio no disponible en este contexto."
4. `replaceMealExchangeTargets(db, mealId, targets)` — **delete + insert** de los targets de ESA comida (sin filas dependientes; `meal_exchange_targets` no tiene hijos). Mapea a `{meal_id, exchange_group_id, portions, notes||null}`.
5. `setPlanLastEditedBy(planId, actorCoachId)`.

`replaceMealExchangeTargets` es idempotente por comida: el estado final = el array enviado. Sin targets ⇒ solo borra.

### B) Guardado del plan completo (boton Guardar) — reconcile por ID

En `handleSave` (PlanBuilder), modo exchanges activo: cada comida persistida lleva su `id` de DB en el payload; modo gramos NO lo lleva. Action `upsertClientNutritionPlanJson` (`nutrition-coach.actions.ts`):

1. Si `data.plan_mode === 'exchanges' && data.id`, prueba en DB el `plan_mode` real (`probe`). `allowEmptyMeals = probe.plan_mode === 'exchanges'` (modo verificado en DB, no por payload).
2. Schema: `allowEmptyMeals ? ExchangesClientPlanSchema : ClientPlanSchema` (relajado permite `foodItems` vacio).
3. Guarda snapshot en `nutrition_plan_history` (source `auto_before_save`) antes de mutar.
4. **Reconciliacion por ID** (`reconcileMealsById`, ver abajo) — SOLO en modo exchanges:
   - `toDelete`: borra `food_items` y luego `nutrition_meals` de esos ids (CASCADE borra SUS `meal_exchange_targets` y deja `day_variant_id` huerfano N/A). **Borra los targets de la comida ELIMINADA, no de otra.**
   - `toUpdate`: UPDATE in-place por id (name/description/order_index/day_of_week) + delete/insert de `food_items`. El row id se conserva ⇒ `meal_exchange_targets`, `day_variant_id` y `nutrition_meal_logs` viajan con SU comida.
   - `toInsert`: insert de comidas nuevas.
5. El modo gramos usa matching por `order_index` (byte-identical legacy, AC1) — NO pasa por reconcile.

> El campo `plan_mode` NO lo escribe `upsertClientNutritionPlanJson` (lo cambia solo `setPlanModeAction`). El payload envia `plan_mode` solo para decidir el schema relajado y el branch de reconcile.

### `meal-reconcile.ts` — reconciliacion PURA por ID

`reconcileMealsById(existingIds, incoming)`. Motivo (mustFix R1): el matching legacy emparejaba por `order_index` y actualizaba in-place; pero `meal_exchange_targets` y `day_variant_id` estan pegados al ROW ID — tras drag-and-drop + guardar, 'Cena' heredaba las porciones de 'Desayuno' y borrar una comida intermedia CASCADE-borraba los targets de la ULTIMA comida. Algoritmo:
- Un id solo puede reclamar SU fila y solo una vez (payload duplicado ⇒ insert defensivo).
- `toUpdate`: incoming con `dbId` existente y no reclamado. `toInsert`: el resto (id null o id que ya no existe). `toDelete`: existentes no reclamados.

Resultado: la prescripcion por porciones SIEMPRE viaja con su comida; los logs de adherencia del alumno (`nutrition_meal_logs`, ON DELETE CASCADE sobre `nutrition_meals`) se preservan para las comidas que se actualizan, y solo se borran los de comidas realmente eliminadas. Unit-tested (`meal-reconcile.test.ts`).

### `nutrition-exchanges.service.ts` — orquestador

Ademas de lo anterior:
- `getPlanExchangeEditorData(db, planId)` — round-trip del editor: `{planMode, targetsByMealId, variants, variantByMealId}`. Lee assignments (`findMealVariantAssignments`), luego en `Promise.all` targets (`findMealExchangeTargetsByMealIds`) y variantes (`findDayVariantsByPlan`); agrupa targets por meal.
- `setNutritionPlanMode(db, {actorCoachId, planId, mode})` — `assertExchangesModuleForPlan` + `setPlanMode` + `setPlanLastEditedBy`. (El switch a 'exchanges' exige modulo ON; volver a 'grams' tambien se valida por contexto — si el modulo se apago, la pauta degrada en UI, no por action).
- `getExchangeEquivalences(db, groupIds)` → `findExchangeFoodsByGroupIds`.
- Vista del alumno: `getStudentExchangeBundle(db, serviceDb, input)` — ver 4.10.

---

## 4.8. Repository + tablas + RLS / grants + schemas Zod

### `exchanges.repository.ts` (NUEVO archivo; no toca `nutrition.repository.ts`)

RLS es el TECHO; el cliente user-scoped solo sub-filtra. Funciones clave:
- `findExchangeGroupsForScope(db, coachId, {orgId, activeTeamId})` — catalogo 3-vias con `.or('is_system.eq.true, coach_id.eq.<id>[, team_id.eq.<id>]')`, `deleted_at IS NULL`, orden `sort_order, code`.
- `findExchangeGroupsByIdsForTenant(serviceDb, ids, tenant)` — para el alumno: doble acotamiento (data minimization, patron F5 areas): SOLO ids ya presentes en el plan + SOLO grupos del tenant (system / coach del plan / team del alumno). Recibe el cliente service-role YA acotado por el caller.
- `findMealExchangeTargetsByMealIds`, `replaceMealExchangeTargets`, `setPlanMode`, `setPlanLastEditedBy`, `findPlanModuleContext` (plan + `clients(team_id, org_id)` embebido), `findMealPlanId`.
- Variantes: `findDayVariantsByPlan`, `insertDayVariant`, `renameDayVariant`, `deleteDayVariant`, `findDayVariantPlanId`, `setMealDayVariant`, `findMealVariantAssignments`.
- `findExchangeFoodsByGroupIds` — equivalencias desde `foods` (`exchange_group_id`, `exchange_portion_grams`, `exchange_portion_label`), filtra null, ordena por name.
- Mappers `mapExchangeGroupRow` (parsea `composed_of` jsonb defensivamente), `mapTargetRow`, `mapDayVariantRow`. `GROUP_COLUMNS` selecciona columnas explicitas (nunca `SELECT *`).

> **Frontera con `food_swap_groups`** (documentada): swap_group = equivalencia VISUAL del modo gramos (food_ids[]); exchange_group = unidad de PORCION con macros de referencia. Sin FK entre ambas; no consolidar.

### Tablas y DDL (`20260611093001_nutrition_exchanges.sql` — aditiva/idempotente/forward-only)

1. **`exchange_groups`** — catalogo. CHECK `exchange_groups_owner_chk`: system ⇒ coach_id NULL y team_id NULL; custom ⇒ exactamente uno de coach_id/team_id (`(coach_id IS NULL) <> (team_id IS NULL)`). Soft-delete (`deleted_at`). UNIQUE parciales de slug por scope entre filas vivas. Indices FK completos. Trigger `handle_updated_at`. Refs `ref_* >= 0`.
2. **`foods`** (+columnas aditivas nullable) — `exchange_group_id` (FK `exchange_groups`), `exchange_portion_grams`, `exchange_portion_label`. Modo gramos intacto. Indice FK.
3. **`nutrition_plans.plan_mode`** y **`nutrition_plan_templates.plan_mode`** (text NOT NULL default `'grams'` ⇒ todo lo existente byte-identical). CHECK `plan_mode IN ('grams','exchanges')`. `nutrition_plan_templates.team_id` (marcador de scope para F7).
4. **`nutrition_plan_day_variants`** + **`nutrition_meals.day_variant_id`** (ON DELETE SET NULL).
5. **`meal_exchange_targets`** — `meal_id` (FK `nutrition_meals` ON DELETE CASCADE), `exchange_group_id` (FK `exchange_groups`), `portions numeric CHECK (>0 AND <=99)` (numeric permite 0.5), `notes`. **UNIQUE (meal_id, exchange_group_id)** — un grupo no se repite en una comida.

### Grants (hardening obligatorio — §6 de la migracion)

Sin el bloque, anon nace con ALL (incl. TRUNCATE, que RLS no filtra). Por eso: `REVOKE ALL` a anon+authenticated en las 3 tablas; `GRANT SELECT,INSERT,UPDATE,DELETE` a `authenticated`; `GRANT ALL` a `service_role`. anon queda SIN privilegios.

### RLS (§7) — policies por operacion, sin EXISTS correlacionado

- **`exchange_groups`**: `xg_select` (system OR coach propio OR `team_id IN current_user_team_ids()`, `deleted_at IS NULL`); writes solo sobre custom (`NOT is_system`): coach sobre las suyas, team SOLO gestores (`current_user_managed_team_ids()`); system inmutable; `xg_service` (service_role). El ALUMNO NO recibe policy de SELECT del catalogo — la app resuelve los grupos referenciados via service-role acotado.
- **`meal_exchange_targets`**: `met_coach_all` (FOR ALL — meal_id del plan cuyo `coach_id = auth.uid()`, subquery autocontenida no correlacionada), `met_client_select` (SELECT — plan cuyo `client_id = auth.uid()`), `team_met_member_all` (pool, `current_user_pool_meal_ids()`), `met_service`.
- **`nutrition_plan_day_variants`**: espejo por `plan_id` (`npdv_coach_all`, `npdv_client_select`, `npdv_pool_all` via `current_user_pool_nutrition_plan_ids()`, `npdv_service`).
- **`nutrition_plan_templates`**: guards RESTRICTIVE `npt_team_id_guard` / `_upd` — `team_id IS NULL OR team_id IN current_user_team_ids()` (evita forjar team_id ajeno).

> Invariante de seguridad: aunque `meal_exchange_targets.exchange_group_id` (FK) acepta cualquier grupo existente, `verifyGroupsVisibleToActor` (service) + `xg_select` (RLS) garantizan que un coach no puede prescribir un grupo que no ve. El alumno solo lee grupos del tenant de su plan (doble filtro: `findExchangeGroupsByIdsForTenant` + `groupMatchesTenant`).

### Schemas Zod (`packages/schemas/nutrition-exchanges.ts`) — SAFE FOR MOBILE

Gotcha Zod 4: usa `z.guid()` (no `.uuid()`, que rechaza UUIDs de seeds legacy).
- `PlanModeSchema = z.enum(['grams','exchanges'])`; `SetPlanModeSchema {planId, mode}`.
- `ExchangeTargetSchema {exchangeGroupId, portions(>0,<=99), notes(<=300 nullish)}`.
- `SaveMealExchangeTargetsSchema {mealId, targets[]}` — max 20 grupos/comida + refine **grupo no repetido** (espeja UNIQUE de DB).
- `dayVariantName` (trim, 1..40). `CreateDayVariantSchema`, `RenameDayVariantSchema`, `DeleteDayVariantSchema`, `AssignMealVariantSchema {mealId, variantId nullable}`.
- `ExchangesMealSchema` (= `MealSchema` + `id?` guid + `foodItems` puede ir vacio, max 20). `ExchangesClientPlanSchema` (1..10 comidas) — variante RELAJADA usada SOLO cuando el plan ya esta en modo exchanges (verificado en DB).
- `ExchangePdfFormatSchema = z.enum(['compact','equivalences','full'])`; `LogNutritionPdfGeneratedSchema {planId, format}`.

### Seed system (`_POST_DEPLOY_20260611093002_..._seed.sql`)

NO entra al historial del CLI; se corre manual (MCP). Idempotente: grupos `ON CONFLICT (id) DO UPDATE ... WHERE macros_confirmed=false` (jamas pisa lo confirmado con Fran); foods INSERT solo si no existe (por nombre, system) y UPDATE de equivalencia solo si `exchange_group_id IS NULL`. **9 grupos system** (UUIDs fijos `0000e8c0-...-0001..0009`): C, P, F, V, LAC, ARL, SP, G simples + LEG compuesto (`composed_of` 1P+1C, ref_* = 0). ~37 equivalencias de alimentos chilenos (SMAE/UDD). **TODOS `macros_confirmed=false`** (valores provisorios, badge "referencial"). Asserts: >=9 grupos system y >=30 foods system con equivalencia.

---

## 4.9. PDF branded de la pauta (`lib/nutrition-exchange-pdf.ts`)

Generacion 100% client-side con jsPDF (decision SPEC: cero servidor, cero Chromium — el plan NO viaja). `buildExchangePdfModel` es PURO; `downloadNutritionExchangePdf` renderiza con import dinamico de `jspdf`.

### Datos de entrada (`ExchangePdfParams`)

`{format, brand (PdfBrand), logoDataUrl, planName, clientName, instructions, goals (objetivo de la nutri = daily_*), meals (id/name/notes/dayVariantId/targets), variants, groups, equivalences, fileStem}`. Disparo desde el builder (`handleDownloadExchangePdf`): resuelve el logo via `loadBrandLogoDataUrl(exchange.brandLogoUrl)` (fetch→canvas→dataURL, fallback null) y pasa la marca resuelta server-side.

### Modelo puro (`buildExchangePdfModel`)

- `format === 'full'` ⇒ LANZA "Formato completo disponible proximamente (v2)" (stub).
- `sections` (PdfVariantSection[]) = `dayTotalsByVariant(...)`: una seccion por variante (o una sin titulo si no hay variantes). Cada seccion incluye solo las comidas de esa variante (NULL=todas) y sus totales derivados.
- `mealLine`: `codes` (portionsSummaryLabel, sin expansion), `rows` (badge por grupo: code/color/portions/groupName, ordenadas por sortOrder), `kcal` (`macrosForTargets(...).calories`).
- `nomenclature`: leyenda de los grupos USADOS (sortOrder), con `refKcal`.
- `macrosProvisional`: `hasUnconfirmedMacros` sobre todos los targets ⇒ aviso "referencial".
- Si `format === 'equivalences'`:
  - `equivalenceSections`: por grupo usado con equivalencias, `refLabel` ("1 porcion ≈ N kcal · P · CHO · G") + lista de alimentos (name/portionLabel/grams).
  - `shoppingList`: lista de compras semanal — por grupo, **maximo de porciones/dia entre variantes** × 7, con hasta 3 ejemplos del grupo.

### Render jsPDF (A4, mm)

- **Header branded**: barra de color de marca (`palette.headerBg`), franja accent, logo (dataURL) o badge inicial+color de fallback, nombre del tenant, titulo del plan, nombre del alumno, fecha `es-CL`.
- **Requerimientos diarios** (`goals`): kcal · P · CHO · G.
- Aviso provisional (si aplica) + Indicaciones (`instructions`).
- **Secciones por variante**: titulo "DIA {variante}", comidas con barra accent, codigos (summary), filas con badge de grupo (`exchangeGroupColor`), `{porciones} ×  {grupo}`, notas; totales derivados de la seccion.
- **Agua** (texto fijo) + **Nomenclatura de codigos**.
- Si `equivalences`: pagina nueva con "EQUIVALENCIAS POR GRUPO" (filas alimento/medida/gramos) + "LISTA DE COMPRAS (SEMANAL ESTIMADA)" (grupo/porciones-dia/porciones-semana + ejemplos).
- **Footer** en todas las paginas: `{generatedWithLabel}. Uso personal. No reemplaza valoracion clinica...` + paginado.
- Nombre de archivo: `fileStem` saneado (`[^\w\-]` → `_`, <=80) o `pauta-porciones`.

Paleta (`nutrition-pdf-brand.ts` → `derivePdfPalette`): `poweredByEva` ⇒ paleta EVA EXACTA (accent emerald-500, header slate-900, "Generado con EVA Fitness"); si no, accent = `brand.primaryColor`, header oscurecido por luminancia, "Generado con {marca}".

### Bitacora del PDF (Ley 21.719 — AC7)

`handleDownloadExchangePdf` dispara `void logNutritionPdfGeneratedAction({planId, format})` (fire-and-forget). Action → `logExchangePdfGenerated`:
- Re-aplica `assertExchangesModuleForPlan` (R2/AC2: con el modulo OFF/kill-switch lanza y el catch degrada a no-op — un coach de team no puede seguir falseando la bitacora).
- `shouldLogExchangePdf({activeTeamId, clientTeamId, clientOrgId})`: registra SOLO si el actor es coach con workspace team ACTIVO y el alumno pertenece a ESE pool (`activeTeamId && !clientOrgId && clientTeamId === activeTeamId`). Standalone/enterprise ⇒ no-op.
- Si aplica: `logTeamClientAccess(... resource:'nutrition_plan', action:'pdf_generate', metadata:{format, plan_id})` en `team_access_logs` con `actor_coach_id = auth.uid()`. El alumno descargando su propia pauta NO genera bitacora (titular de la data). Best-effort: nunca rompe la descarga.

---

## 4.10. Objetivos por composicion corporal (panel Pro del sidebar)

Es un panel SEPARADO del modo intercambios, gobernado por el modulo **`body_composition`** (no por `nutrition_exchanges`), aunque ambos viven en "Nutricion Pro". Vive en `PlanBuilderSidebar.tsx`.

- **Gating**: prop `proBodyComp` = `sectionFlags ? sectionFlags.goals_bodycomp === true : !!exchange` (fail-OPEN al entitlement legacy). `goals_bodycomp` hornea `body_composition`. El panel solo se monta en `mode === 'client-plan'` y si `clientProfile.weight_kg` existe.
- **Calculo**: BMR via **Katch-McArdle / Cunningham** a partir de la masa magra (LBM derivada de `clientProfile.weight_kg` + composicion corporal, `bcLeanMass`), luego `computeTDEE(bmr, activity)` → calorias → macros, delegando en helpers de calculo. Requiere `proBodyComp && weight_kg && bcLeanMass != null` (`useMemo` retorna null si falta peso o masa magra).
- **Desbloqueo**: el peso/composicion del alumno viene de `intake` (`clientProfile = { weight_kg, height_cm }`), pasado a PlanBuilder desde `getClientNutritionPlanPageAuthData`. Sin esos datos, el panel queda inerte (no hay objetivos por composicion). El panel basico (Mifflin-St Jeor) si funciona solo con peso/altura sin masa magra.
- Estos objetivos, al aplicarse, escriben los campos `daily_*`/`goals` del plan — que en modo intercambios son el REQUERIMIENTO contra el que se comparan los totales derivados de porciones.

---

## 4.11. Paridad mobile (referencia)

Existen rutas API mobile que hablan PostgREST/servicios directos para intercambios: `app/api/mobile/nutrition/exchanges/targets`, `.../variants`, `.../meal-variant`. Reusan los mismos schemas (`@eva/schemas/nutrition-exchanges`), servicios y RLS/grants (mismo techo), por lo que las invariantes de gating, visibilidad de grupos y reconcile aplican identicas. (El builder completo de intercambios en RN figura como FALTANTE en la auditoria de paridad RN-web; el motor server es el mismo).

---

## 4.12. Invariantes criticas (resumen para el rediseno)

- **Switch de modo NO destructivo**: conserva food_items y targets; solo cambia `plan_mode`.
- **NULL = todas las variantes** (calculo y RLS dependen de esto).
- **Reconcile por ID** en modo exchanges (NUNCA por order_index): targets/variante/meal_logs viajan con su comida; borrar comida solo borra SUS targets (CASCADE) y deja day_variant_id intacto en el resto.
- **Gate server-side** (`assertModule` por contexto del recurso, pool-wins) en TODA action; UI es solo espejo; render-only si el modulo se apaga (la data persistida no se pierde).
- **Visibilidad de grupos** verificada server-side (`verifyGroupsVisibleToActor`) — el FK no alcanza.
- **Catalogo del alumno** via service-role doble-acotado + filtro de tenant (`findExchangeGroupsByIdsForTenant` + `groupMatchesTenant`); el alumno no tiene policy de SELECT en `exchange_groups`.
- **macros_confirmed=false** en todo el seed ⇒ badge "referencial" en editor y PDF hasta validar con Fran.
- **Compuestos** (LEG) se expanden en P+C para macros, pero se muestran "1LEG" en summary/PDF (sin expansion).
- **Bitacora PDF** solo en contexto team y solo coach (Ley 21.719); con modulo OFF degrada a no-op.
- **PDF 100% client-side** (privacidad: el plan no viaja al servidor).
- **Limites**: 6 variantes/pauta, 20 grupos/comida, portions (0,99], notes <=300, nombre variante 1..40.
