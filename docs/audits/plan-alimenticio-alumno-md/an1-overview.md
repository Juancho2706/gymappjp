# 1. Vision general, arquitectura, carga de datos y gating

> Auditoria del **Plan Alimenticio del alumno** de EVA. Ruta canonica `/c/[coach_slug]/nutrition` (rewrite a `/e/[org_slug]/nutrition` y `/t/[team_slug]/nutrition` via proxy — mismas pantallas, cambia la marca). Es uso diario y la palanca de valor Pro del lado alumno. Esta seccion enfatiza el BACKEND: que datos llegan, como se gatean y como se compone la pantalla. El registro/guardado (toggle, porcion, satisfaccion, off-plan, habitos, cola offline) se aborda en detalle en secciones posteriores; aca se documenta la carga (lecturas) y el gating.

---

## 1.1 Que es y su rol

El **Plan Nutricional** del alumno es la superficie diaria donde el alumno:

- ve el plan que su coach le armo (comidas + alimentos + macros objetivo),
- registra que comio (marca comida completa, ajusta porcion consumida, da satisfaccion),
- registra comidas **fuera de plan** (off-plan),
- ve su progreso de macros del dia (anillos), micros (sodio/fibra + avanzados Pro), proporcion del plato,
- ve y construye su **adherencia** (racha, 30 dias),
- registra **habitos**, deja **notas** al coach, ve **lista de compras**, **recetas-idea** y un **recap semanal**,
- (Pro) ve la pauta por **intercambios/equivalencias**.

Es la **palanca de valor Pro** del lado alumno: las secciones avanzadas (micros avanzados, objetivos por composicion corporal, pauta por intercambios) dependen de modulos de pago del coach/team — todo gateado server-side.

---

## 1.2 Capas (Clean Architecture aplicada a esta ruta)

```
page.tsx (RSC)                 ← orquesta auth, plan, Promise.all de ~15 cargas, gating de dominio
  └─ _data/*.queries.ts        ← React.cache, lecturas Supabase (dedupe por request)
       └─ services/ + @eva/*   ← logica de aplicacion + motores PUROS (nutrition-engine, feature-prefs)
            └─ infrastructure/db/*.repository.ts  ← acceso DB (exchanges.repository, etc.)
                 └─ Supabase (PostgreSQL + RLS)
  └─ _components/NutritionShell ('use client')  ← presentacion + acciones (server actions)
       └─ _actions/*.actions.ts ('use server')  ← escrituras (toggle, porcion, satisfaccion, notas…)
```

**Identidad del alumno:** `auth.uid()` ES el `clients.id` (identidad legacy de EVA). RLS es el techo: el alumno solo lee/escribe su propia fila. Casi todas las queries filtran `client_id = userId` (y RLS lo refuerza).

**Componente raiz de presentacion:** `NutritionShell` (client component) recibe TODO ya cargado por props desde la RSC. No hace lecturas de plan/macros; solo dispara server actions y refetch puntuales (`fetchLogForDate`, `getClientFoodFavoritesForClient`).

---

## 1.3 page.tsx — flujo de la RSC (`ClientNutritionPage`)

`apps/web/src/app/c/[coach_slug]/nutrition/page.tsx`:

1. `const { coach_slug } = await params`.
2. `base = await getClientBasePath(coach_slug)` — resuelve el base path real (`x-client-base-path` del proxy, o fallback `/c/${coach_slug}`). Cubre que la misma page sirva `/c`, `/e`, `/t`.
3. **Auth:** `const { user, hasClientRow } = await getClientNutritionUser()`.
   - `getClientNutritionUser()` (`_data/nutrition-auth.queries.ts`) hace `supabase.auth.getClaims()` (verificacion LOCAL del JWT ES256 — sin round-trip a GoTrue `/user`; el proxy ya valido/refresco la sesion). `user = { id: claims.sub }`. Luego lee `clients` con `select('id').eq('id', user.id).maybeSingle()` para confirmar que existe la fila → `hasClientRow`.
   - Si `!user` → `redirect(${base}/login)`. Si `!hasClientRow` → `redirect(${base}/login)`.
4. **Plan activo:** `const plan = await getActiveNutritionPlan(user.id)`.
   - Si `!plan` → renderiza `<NutritionNoPlanFromServer coachSlug userId />` (corta aca; no carga el resto).
5. `const { iso: today } = getTodayInSantiago()` — "hoy" en America/Santiago (zona canonica de la app).
6. **Scope del alumno:** `const clientScope = await getClientScope(user.id)` → `{ teamId, orgId }`. Alimenta el resolver de feature-prefs (capa base = team cuando hay teamId y no orgId).
7. Arma `prefsInput = { domain:'nutrition', coachId: plan.coach_id ?? '', clientId: user.id, planId: plan.id, clientTeamId, clientOrgId }`.
8. **`Promise.all` de ~15 cargas** (paralelas) — ver §1.4.
9. **Gate de dominio:** si `!domainEnabled` → `<NutritionDomainOff coachSlug />` (oculta TODA la nutricion). Ver §1.7.
10. Deriva `plateProportion = platePropFromMacros(plan.protein_g ?? 0, plan.carbs_g ?? 0)`, `hasTodayWorkout = heroBundle.hero.hasWorkout`, y la **marca del tenant** server-side: `pdfBrand = pdfBrandFromProxyHeaders(headersList)` + `brandLogoUrl = pdfBrand.poweredByEva ? null : headersList.get('x-coach-logo-url')` (free tier ⇒ EVA, AC4).
11. Renderiza el shell: header con back a `${base}/dashboard`, titulo "Plan Nutricional" + `plan.name`, `InfoTooltip`. Dentro de `<main>`:
    - `<PushNotificationBanner />`
    - `weeklyRecap && <WeeklyRecapCard recap={weeklyRecap} />`
    - `plan.instructions && <details>` "Indicaciones del coach" (texto plano, `whitespace-pre-wrap`).
    - `<NutritionShell ...todas las props />` (corazon de la pantalla).
    - `sectionFlags.recipes && <RecipeIdeasSection recipes={recipes} />` (gateado fuera del shell).

> **Gotcha de gating:** las recetas se renderizan FUERA de `NutritionShell` pero la visibilidad la decide `sectionFlags.recipes` (resuelto en el mismo `Promise.all`). El resto de secciones opcionales se gatea DENTRO del shell con el mismo `sectionFlags`.

---

## 1.4 QUE DATOS LLEGAN — enumeracion de cada carga

### 1.4.1 Plan activo — `getActiveNutritionPlan(userId)`
`_data/nutrition.queries.ts` (React.cache). Lee `nutrition_plans` (no `SELECT *`):

- Plan: `id, client_id, coach_id, name, daily_calories, protein_g, carbs_g, fats_g, instructions, is_active, plan_mode`.
- Anidado `nutrition_meals (id, name, description, order_index, plan_id, day_of_week, ...)`.
- Anidado en cada comida `food_items (id, meal_id, quantity, unit, swap_options, ...)`.
- Anidado en cada food item `foods (id, name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, household_grams, household_label)`.
- Filtros: `.eq('client_id', userId).eq('is_active', true).order('order_index', {referencedTable:'nutrition_meals'}).maybeSingle()`.
- **Regla clave:** si el plan existe pero `nutrition_meals.length === 0` → devuelve `null` (un plan activo sin comidas es un draft auto-creado al pulsar "Asignar" sin armar; se trata como "sin plan" para no mostrar plan vacio).

Este es el unico fetch del plan completo (la jerarquia comida→alimento→food). El plan se considera estable durante el dia (de ahi React.cache).

### 1.4.2 Log del dia — `getNutritionLogForDate(userId, planId, today)`
React.cache. Lee `daily_nutrition_logs`:

- `id, client_id, plan_id, log_date, target_calories_at_log, target_protein_at_log, target_carbs_at_log, target_fats_at_log, plan_name_at_log`.
- Anidado `nutrition_meal_logs (meal_id, is_completed, consumed_quantity, satisfaction_score)`.
- Anidado `nutrition_meal_food_swaps (meal_id, original_food_id, swapped_food_id, swapped_quantity, swapped_unit)`.
- Filtros: `.eq('client_id').eq('plan_id').eq('log_date').maybeSingle()`. Devuelve `null` si no hay log ese dia.

Es el **read model del registro del dia**: que comidas estan marcadas (`is_completed`), porcion consumida (`consumed_quantity`), satisfaccion (`satisfaction_score`) e intercambios aplicados. Los `target_*_at_log` son snapshots del objetivo al momento del log (para que la adherencia historica no cambie si el coach edita macros despues).

### 1.4.3 Adherencia 30d — `getNutritionAdherence30d(userId, planId)`
React.cache. Lee `daily_nutrition_logs` con ventana calendario: `dateFrom = hoy(Santiago) - 30 dias`. Select: `log_date, nutrition_meal_logs (meal_id, is_completed, consumed_quantity)`. Filtros `.eq('client_id').eq('plan_id').gte('log_date', dateFrom).order('log_date', asc)`. Devuelve `[]` si nada. Alimenta el `AdherenceStrip`, `NutritionStreakBanner` y el set `adherenceDates` (puntos en el `DayNavigator`).

### 1.4.4 Bundle de cumplimiento/hero — `getHeroComplianceBundle(userId, coach_slug)`
`../dashboard/_data/heroComplianceBundle.ts` (React.cache, compartido con el dashboard). En esta pantalla solo se usa `heroBundle.hero.hasWorkout` (para el `WorkoutContextBanner`: "tienes entreno hoy"). El bundle ademas computa scores de workout/nutricion/check-in y el motor canonico `computeNutritionAdherence` (no consumido aqui, pero cargado por dedupe). Lee programa activo, planes, logs de workout, check-ins 30d, dias con log de nutricion y los inputs de adherencia 30d.

### 1.4.5 Modulo intercambios (Pro) — `getStudentExchangeData({ clientId, planId, planCoachId, planMode })`
`_data/nutrition-exchanges.queries.ts`. Devuelve un `StudentExchangeBundle | null`. **Bundle vacio/null si el plan es `plan_mode==='grams'` o el modulo `nutrition_exchanges` esta OFF** (AC5 — la vista queda byte-identical sin Pro). Cuando esta ON: `{ enabled, variants[], groups[], equivalences[], targetsByMealId, variantByMealId }`. Alimenta los chips de intercambio por comida, la hoja de equivalencias y el PDF de pauta.

### 1.4.6 Recetas-idea — `getAssignedRecipesForClient(userId)`
`_data/recipes.queries.ts` (Feature L). Recetas asignadas por el coach (inspiracion, solo lectura). Se renderizan en `<RecipeIdeasSection>` fuera del shell, gateadas por `sectionFlags.recipes`.

### 1.4.7 Headers del proxy — `headers()`
Lista de headers de la request. Se usa para resolver la marca (`pdfBrandFromProxyHeaders`) y el logo (`x-coach-logo-url`), todo SERVER-SIDE (el alumno nunca decide su marca).

### 1.4.8 Notas del dia — `getClientMealComments(today)`
`_data/nutrition-notes.queries.ts`. Hilo bidireccional coach⇄alumno para la fecha. Devuelve `MealCommentRow[]` (con `author_role`, `body`, `created_at`). Alimenta `NotesThread` (gateado por `sectionFlags.notes`).

### 1.4.9 Lista de compras — `getShoppingList(userId)`
`_data/shopping.queries.ts`. Devuelve `ShoppingListView` (lista derivada del plan + estado persistido de marcado, agrupada por pasillo). Gateada por `sectionFlags.shopping`.

### 1.4.10 Recientes off-plan — `getRecentIntakeFoods(10)`
`_data/intake.queries.ts`. Hasta 10 `IntakeFoodRef` (alimentos del catalogo usados recientemente) para quick-add en el `OffPlanLogger`. Gateado por `sectionFlags.off_plan_log`.

### 1.4.11 Micros del plan del dia — `getPlanDayMicros(userId, planId, today)`
`_data/sections.queries.ts` (React.cache). Re-lee `nutrition_plans` (solo `nutrition_meals.day_of_week` + `food_items.quantity/unit` + `foods.serving_size, fiber_g, sodium_mg, sugar_g, saturated_fat_g, unsaturated_fat_g` — columnas de micros AUSENTES del fetch principal del plan). Filtra las comidas aplicables al dia con `nutritionMealAppliesOnIsoYmdInSantiago` y suma con `sumMealMicros` (motor PURO `@eva/nutrition-engine`). Devuelve `DayMicros = { sodiumMg, fiberG, sugarG, saturatedFatG, unsaturatedFatG }`; cada nutriente es `null` si ningun alimento del dia aporta datos (`anyData` flag). Redondeo: sodio entero, resto a 1 decimal.

### 1.4.12 Topes/metas de micros — `getMicroTargetsForClient(plan.coach_id, userId)`
`_data/sections.queries.ts` (React.cache). Si no hay `coachId` → `{}`. Usa `NutrientTargetsService(supabase).listNutrientTargets(coachId, clientId)`. Resuelve por nutriente (`sodium_mg`, `fiber_g`, `sugar_g`, `saturated_fat_g`, `unsaturated_fat_g`) un `MicroTarget = { floor?, target?, ceiling? }`. **Precedencia:** fila especifica del alumno (`client_id === clientId`) gana sobre el default del coach (`client_id == null`). Si una fila no tiene ningun valor, se omite.

### 1.4.13 Nutricion Pro habilitada — `getNutritionProEnabledForClient(plan.id)`
`_data/sections.queries.ts` (React.cache, **distinto** del homonimo en `feature-prefs.service.ts`). Resuelve el contexto del recurso con `findPlanModuleContext(supabase, planId)` (infrastructure/db/exchanges.repository) y luego `hasExchangesModuleForClientContext(supabase, { clientTeamId, clientOrgId, planCoachId })`. Fail-closed. Gobierna los micros AVANZADOS del panel (azucar/grasas) — NO el modo de la pauta (un plan en gramos tambien los muestra si el coach tiene Pro). Se pasa al shell como `nutritionProEnabled`.

### 1.4.14 Dominio nutricion ON/OFF — `resolveNutritionDomainEnabled({ coachId, clientId, clientTeamId, clientOrgId })`
`services/feature-prefs.service.ts`. Master switch del dominio entero. Ver §1.6 y §1.7.

### 1.4.15 Visibilidad por seccion — `resolveFeaturePrefs(prefsInput)`
`services/feature-prefs.service.ts`. Devuelve `Record<NutritionSectionKey, boolean>` (`sectionFlags`). Es el CHOKE POINT unico del gating de secciones. Ver §1.6.

### 1.4.16 Recap semanal — `getNutritionWeeklyRecap(userId)`
`_data/recap.queries.ts` (Feature K). Recap motivacional on-demand desde el motor (tono adaptativo). Si existe, se pinta `<WeeklyRecapCard>` arriba del shell. No gateado por seccion (vive en la page, no en el shell).

> **Resumen de tablas leidas en la carga:** `clients` (auth + scope), `nutrition_plans` (×2: plan completo + micros), `daily_nutrition_logs` (×2: dia + 30d, ademas dentro del hero bundle), `coach_feature_prefs`/`team_feature_prefs`/`client_feature_prefs` (gating), `nutrient_targets` (topes micros), `coach_addons`/`coaches`/`teams`/`organizations` (via helpers de entitlement), mas las del hero bundle (workout, check-ins) y las de notas/shopping/intake/recipes/recap/exchanges.

---

## 1.5 NAVEGACION POR DIA — `DayNavigator`

`_components/DayNavigator.tsx` (client). Props: `selectedDate, onDateChange, adherenceDates: Set<string>, isLoading`.

- **UI:** chevron izquierda (dia anterior), label central ("Hoy" / "Ayer" / `weekday day month` en `es-CL`), chevron derecha (dia siguiente, **deshabilitado si `isToday`** — no se navega al futuro). Punto verde bajo el label si `adherenceDates.has(selectedDate)` y no es hoy. Boton "Volver a hoy" si no es hoy (tap al label central tambien vuelve a hoy).
- **Swipe:** drag horizontal (framer-motion) — swipe izquierda → dia siguiente, derecha → anterior (umbrales `SWIPE_OFFSET=60px` o `SWIPE_VELOCITY=400`). Desactivado con `reduce-motion`.
- **Calculo de fecha:** `noon(iso) = parseISO(${iso}T12:00:00)` (mediodia para evitar drift de TZ), `addDays(±1)`, `format(...,'yyyy-MM-dd')`. "Hoy" se recalcula con `getTodayInSantiago()` dentro del componente.

**Que recarga al cambiar de dia** (logica en `NutritionShell.handleDateChange`, no en el navigator):
- Si esta **offline** (`!navigator.onLine`) → `toast.error('Sin conexion — no se puede cargar otro dia')` y NO cambia. (Solo el dia de hoy tiene copia local cacheada; los historicos requieren red.)
- Si online → `setSelectedDate(date)` + `startDateTransition(async () => { const { dailyLog } = await fetchLogForDate(userId, plan.id, date); setCurrentLog(dailyLog) })`.
- `fetchLogForDate` (server action) re-lee SOLO el `daily_nutrition_logs` de esa fecha (no el plan; el plan es el mismo). `isDateLoading` (useTransition) mueve el skeleton del label y desactiva acciones.

**Que cambia derivado del dia** (memos en el shell): `isToday = selectedDate === today`; `mealsVisible` (filtra comidas aplicables al `day_of_week` de la fecha via `nutritionMealAppliesOnIsoYmdInSantiago`); el read model de completions/porciones/satisfaccion/swaps se recomputa desde el `currentLog` recargado; los anillos de macros y los micros (estos NO se recargan — `dayMicros` es del dia inicial; ver gotcha). **Solo se puede registrar el dia de hoy** (`isToday`): los historicos son read-only (banner "Estas viendo un dia historico…").

> **Gotcha:** `dayMicros`, `microTargets`, `notes` (cargados en la page para `today`) NO se recargan al cambiar de dia — el shell solo refetchea `daily_nutrition_logs` via `fetchLogForDate`. El panel de micros y el de plato siguen mostrando el dia inicial aunque el `DayNavigator` cambie. Las comidas y la adherencia si reflejan el dia seleccionado. (Candidato a revisar en el rediseño.)

---

## 1.6 GATING por feature-prefs (el corazon del control de visibilidad)

Modelo (plan §4.x): **`visible = ENTITLED (billing, fail-closed) AND ENABLED (preferencia coach/team/cliente)`**. El paquete PURO `@eva/feature-prefs` define el catalogo + el resolver; `services/feature-prefs.service.ts` lo cablea a Supabase.

### 1.6.1 Catalogo de secciones — `@eva/feature-prefs` (`NUTRITION_SECTIONS`)
12 secciones (`NutritionSectionKey`), cada una con `{ key, label, tooltip, core, defaultOn, requiresModule, presets }`:

| key | core | requiresModule | preset minimo | que controla en la pantalla |
|---|---|---|---|---|
| `plan` | si | — | todos (core) | comidas del plan (`MealCard`) — SIEMPRE visible |
| `macros` | si | — | todos (core) | anillos de macros (`MacroRingSummary`) — SIEMPRE |
| `adherence` | si | — | todos (core) | `AdherenceStrip` + racha — SIEMPRE |
| `micros_base` | no | — | intermedio | panel de micros base (sodio/fibra) |
| `plate` | no | — | intermedio | `PlatePanel` (metodo del plato) |
| `off_plan_log` | no | — | intermedio | `OffPlanLogger` (registrar fuera de plan) |
| `notes` | no | — | intermedio | `NotesThread` (notas al coach) |
| `habits` | no | — | intermedio | `HabitsTracker` |
| `recipes` | no | — | intermedio | `RecipeIdeasSection` (fuera del shell) |
| `shopping` | no | — | intermedio | `ShoppingListView` (colapsable) |
| `micros_advanced` | no | `nutrition_exchanges` | profesional | micros avanzados (azucar/grasas) en `MicrosPanel` |
| `goals_bodycomp` | no | `body_composition` | profesional | objetivos por composicion corporal |

- **core** (`plan`/`macros`/`adherence`): SIEMPRE ON, no toggleables, no gateables por entitlement.
- **opcionales gratis** (intermedio): visibles segun preset/preferencia, sin modulo de pago.
- **Pro** (`micros_advanced` req `nutrition_exchanges`; `goals_bodycomp` req `body_composition`): exigen modulo + preset profesional.
- **Presets:** `basico` (solo core) / `intermedio` (core + opcionales gratis) / `profesional` (todo). Default seguro = `basico` (`normalizePreset`).

> **Nota de cobertura:** en `NutritionShell`, los flags consumidos hoy son `micros_base`/`micros_advanced` (panel de micros), `plate`, `off_plan_log`, `notes`, `habits`, `shopping`; y `recipes` en la page. `goals_bodycomp` NO se consume en esta pantalla (existe en el catalogo pero el shell no lo lee). El default cuando `sectionFlags` esta ausente es `ALL_SECTIONS_VISIBLE` (fail-OPEN, comportamiento legacy/offline/cache).

### 1.6.2 Resolver server-side — `resolveFeaturePrefs(input)`
`services/feature-prefs.service.ts` (React.cache). Pasos:

1. `userDb = createClient()` (request-scoped, RLS techo) + `serviceDb = createServiceRoleClient()` (para leer flags del tenant, espejo de `getStudentExchangeData`).
2. `useTeamBase = !!input.clientTeamId && !input.clientOrgId` (team base solo si hay team y NO es enterprise).
3. `Promise.all([getFeaturePrefsEnabled(), entitledByModuleForNutrition(serviceDb, {...})])`.
   - **`getFeaturePrefsEnabled()`**: lee flag `FEATURE_PREFS_ENABLED` de Edge Config. **Fail-CLOSED a `false`** si no hay `EDGE_CONFIG` o falla (=> bypass de prefs).
   - **`entitledByModuleForNutrition`**: computa entitlement por modulo (`nutrition_exchanges`, `body_composition`) context-aware y fail-closed. Si hay `planId`, `findPlanModuleContext` GANA (pool-wins: el contexto del recurso/plan manda sobre los hints del input). Reusa `hasExchangesModuleForClientContext` y `hasModule` (con eso vienen GRATIS el pool-wins team>coach y el kill-switch `EVA_DISABLED_MODULES`). NO reimplementa entitlement.
4. **FLAG OFF / ausente / Edge caido ⇒ fail-OPEN** (comportamiento de HOY): para cada seccion, core ⇒ `true`; opcional ⇒ `entitled` (si `requiresModule`, entitlement del modulo; si no, `true`). O sea: se muestra TODO lo entitled, ignorando las preferencias por completo (grandfathering transicional — nadie pierde superficie por no tener fila de prefs aun).
5. **FLAG ON ⇒ modelo completo:** lee base (team o coach) + override del alumno, y llama al resolver puro:
   - `readTeamPrefs` o `readCoachPrefs` (segun `useTeamBase`) via `serviceDb` — `coach_feature_prefs`/`team_feature_prefs` (`preset, sections`).
   - `readClientPrefs(userDb, clientId, domain)` — `client_feature_prefs.sections` (override por-alumno, RLS techo).
   - `resolveSections({ domain, entitledByModule, preset, useTeamBase, coachSections, teamSections, clientSections })`.

### 1.6.3 Resolver PURO — `resolveSections` (`@eva/feature-prefs`)
Por seccion (con el dominio prendido):
- `core` ⇒ siempre `true`.
- `entitled = requiresModule ? entitledByModule[requiresModule] === true : true`.
- `wants = clientSections?.[k] ?? base?.[k] ?? section.presets[preset]` (mas-especifico-gana: alumno > base coach/team > preset).
- resultado = `core || (entitled && wants === true)`.

**Invariante de oro:** la PREFERENCIA SOLO ACHICA. Si una seccion no esta entitled, ningun `wants=true` la prende. El entitlement (billing) es el unico gate de dinero; la preferencia es input no confiable que solo oculta lo ya permitido.

### 1.6.4 Conveniencias
- `getNutritionProEnabledForClient` (en `feature-prefs.service.ts`, distinto del de `sections.queries.ts`): `resolveFeaturePrefs(...).micros_advanced === true`. Generaliza el gating de Pro pasando por el resolver unico.
- `resolveNutritionDomainEnabled`: master switch del dominio (ver §1.7).

---

## 1.7 Estados terminales / fallbacks de la page

La page tiene 4 ramas de salida segun el estado del alumno:

### 1.7.1 Dominio nutricion ON/OFF — `NutritionDomainOff`
`resolveNutritionDomainEnabled({coachId, clientId, clientTeamId, clientOrgId})` (master switch `_enabled`, key reservada del jsonb `sections`, plan §4.8). Distinto de las secciones: si devuelve `false`, el coach apago el dominio ENTERO ⇒ la page renderiza `<NutritionDomainOff coachSlug />` y oculta TODO (menu + contenido), NUNCA pantalla en blanco. No mira entitlement — es pura preferencia. **Fail-OPEN del flag** `FEATURE_PREFS_ENABLED` (flag OFF/ausente/Edge caido ⇒ `true` = dominio prendido). Resolucion mas-especifico-gana: `clientSections._enabled ?? base._enabled ?? true`.

`NutritionDomainOff.tsx` (RSC): header con back a `${base}/dashboard`, icono `Salad`, copy "Nutricion no disponible / Tu coach no tiene activada la seccion de nutricion por ahora…", boton "Volver al inicio". Distinto de "sin plan": aca el coach decidio no usar la superficie para este alumno/team.

> El dashboard espeja este gate con `getDashboardNutritionDomainEnabled(userId)` (lee `clients.coach_id/team_id/org_id` y llama el mismo resolver) para ocultar el anillo de cumplimiento y el resumen diario de nutricion cuando el dominio esta OFF.

### 1.7.2 Sin plan — `NutritionNoPlanFromServer` / `EmptyNutritionState`
Cuando `getActiveNutritionPlan` devuelve `null` (sin plan, o plan-draft sin comidas), la page renderiza `<NutritionNoPlanFromServer coachSlug userId />` (client component, `_components/`):

- Estado `loading`: "Buscando copia local del plan en este dispositivo…".
- Intenta `tryLoadNutritionRecoveryBundle(coachSlug, userId)` (cache local del mismo alumno+slug):
  - Si **online** ⇒ si habia cache (`hadCachedRef`) hace `router.refresh()`; setea `mode='empty'`.
  - Si **offline** y hay bundle valido ⇒ `mode='cached'`: renderiza un header propio + banner amarillo "Copia local…" (con timestamp `cachedAt` y aviso de dia stale si `cacheLogDate !== todayIso`) + `instructions` si las hay + `<NutritionShell>` alimentado desde el bundle (`plan`, `adherence`, `dailyLog`, `today=todayIso`, **SIN** `sectionFlags`/exchange/etc ⇒ fail-OPEN dentro del shell).
  - Si no hay bundle ⇒ `mode='empty'`.
- `mode='empty'` ⇒ `<EmptyNutritionState coachSlug />` (RSC-like client): header con back, icono `Apple`, "Sin plan asignado / Tu coach aun no te ha asignado un plan nutricional…". Es el estado normal de un alumno sin plan asignado.

> **Resiliencia offline:** la page NO ve la cache local — eso lo maneja `NutritionNoPlanFromServer` en el cliente (la RSC siempre devolvio `null`). La copia local se escribe desde `NutritionShell` (`writeNutritionReadModelCache`) cuando el alumno tiene plan; sirve para que, si el servidor falla transitoriamente o no hay red, el alumno todavia vea su plan de hoy.

### 1.7.3 Con plan + dominio ON ⇒ render completo
Rama feliz: `<NutritionShell>` con todas las props (ver §1.4 y secciones 2+).

---

## 1.8 NutritionShell — como se compone (mapa de bloques)

`_components/NutritionShell.tsx` (client). Recibe todo por props; gatea el RENDER de las secciones opcionales con `sectionFlags` (default `ALL_SECTIONS_VISIBLE` = fail-OPEN). Orden de bloques (top→bottom):

1. **Banner offline** (`!isOnline`): aviso de copia local + cola de marcas.
2. **`WorkoutContextBanner`** (`hasTodayWorkout`): contexto de entreno del dia.
3. **`DayNavigator`** (§1.5).
4. **Banner "dia historico"** (`!isToday`): solo lectura.
5. **Banner "ves N de M comidas"** (`mealsSorted.length > mealsVisible.length`): comidas fijadas a otro `day_of_week`.
6. **`NutritionStreakBanner`** (si hay adherencia y comidas): racha.
7. **`MacroRingSummary`** (CORE): anillos calorias/proteina/carbos/grasa, `isReadOnly={!isToday}`.
8. **`MicrosPanel`** (`sectionFlags.micros_base || sectionFlags.micros_advanced`): sodio/fibra (base) + azucar/grasas (avanzado, `proEnabled = nutritionProEnabled && sectionFlags.micros_advanced`).
9. **`PlatePanel`** (`sectionFlags.plate && plateProportion`).
10. **Lista de `MealCard`** (CORE, animada con `AnimatePresence`/`fadeSlideLeft` por `selectedDate`): cada comida visible, con chips de intercambio (Pro), override de macros derivado de targets, completion/porcion/satisfaccion/favoritos/swaps.
11. **`OffPlanLogger`** (`sectionFlags.off_plan_log && isToday`).
12. **`ExchangeEquivalencesSheet`** (`exchangeEnabled`): hoja de equivalencias al tocar un chip.
13. **`HabitsTracker`** (`sectionFlags.habits`).
14. **`NotesThread`** (`sectionFlags.notes`): hilo coach⇄alumno.
15. **Botones de export** (`totalMeals > 0`): "Copiar detalle" / "Copiar resumen" (WhatsApp) / "Descargar PDF" (o "Pauta PDF" si `exchangeEnabled`).
16. **`ShoppingListView`** (`sectionFlags.shopping`, colapsable `<details>`).
17. **`AdherenceStrip`** (CORE, si hay adherencia y comidas).

Estado local clave del shell: `selectedDate`, `currentLog` (read model del dia), `useOptimistic` para completions y porciones, `favoriteFoodIds`, `isOnline`, `adherenceBoost` (cache offline), multiples `useTransition` (toggle/date/portion/satisfaction/swap/pdf). Las escrituras y la cola offline se detallan en secciones posteriores.

---

## 1.9 Scoping coach / team / org

- **Identidad:** `auth.uid()` = `clients.id`. RLS techo: el alumno solo lee su propia fila de `clients` y sus propios logs.
- **Scope:** `getClientScope(userId)` lee `clients.team_id, org_id`. Determina la base del resolver de prefs:
  - `clientTeamId` y NO `clientOrgId` ⇒ `useTeamBase=true` ⇒ base = `team_feature_prefs` (alumno de un pool/team plano).
  - `clientOrgId` (enterprise) ⇒ `useTeamBase=false` ⇒ base = `coach_feature_prefs` (enterprise NO usa team-base).
  - standalone (ni team ni org) ⇒ base = `coach_feature_prefs` del `plan.coach_id`.
- **Entitlement pool-wins:** cuando hay `planId`, `findPlanModuleContext` resuelve el contexto del RECURSO (team del pool manda sobre el coach dueño del plan). Asi un alumno de team hereda el Pro del team aunque su coach individual no lo tenga.
- **Marca:** resuelta server-side desde headers del proxy (`x-coach-logo-url`, `pdfBrandFromProxyHeaders`); el alumno nunca decide marca. Free tier ⇒ EVA (powered-by).
- **Base path:** `x-client-base-path` del proxy permite que `/c`, `/e/[org]`, `/t/[team]` sirvan la MISMA page con links correctos al dashboard/login del tenant.

---

## 1.10 Observaciones para el rediseño (resumen)

- **Choke point unico de gating:** `resolveFeaturePrefs` + `@eva/feature-prefs`. Mantener: ningun componente lee `sections` jsonb directo. La preferencia SOLO achica; el entitlement es el unico gate de dinero (fail-closed).
- **Doble fail-safe del flag:** `FEATURE_PREFS_ENABLED` fail-OPEN para no romper a coaches sin fila de prefs (grandfathering); `FEATURE_PREFS_ENABLED` fail-CLOSED en `getFeaturePrefsEnabled` (sin Edge ⇒ bypass prefs). El neto es "mostrar todo lo entitled" cuando el flag esta apagado.
- **Plan-draft vacio = sin plan:** invariante a preservar (`getActiveNutritionPlan` devuelve `null` si 0 comidas).
- **Micros/notas no recargan por dia:** `dayMicros`, `microTargets`, `notes` se cargan para `today` y no siguen al `DayNavigator` (solo `daily_nutrition_logs` se refetchea). Bug latente / candidato de rediseño.
- **`goals_bodycomp` definido pero no consumido** en esta pantalla.
- **Paridad RN:** el mismo `@eva/feature-prefs` (puro) debe alimentar `apps/mobile`; el gating de secciones avanzadas (micros avanzados, intercambios, bodycomp) es justamente la brecha de paridad conocida (mobile no importa feature-prefs aun).
