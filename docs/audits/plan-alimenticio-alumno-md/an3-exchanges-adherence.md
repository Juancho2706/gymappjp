# 3. Intercambios Pro, adherencia, recap y racha

> Alcance: las cinco piezas del plan alimenticio del ALUMNO que viven en `apps/web/src/app/c/[coach_slug]/nutrition`: los chips de intercambio (`ExchangeMealChips`) + el bottom-sheet de equivalencias (`ExchangeEquivalencesSheet`), la tira de adherencia de 30 días (`AdherenceStrip`), el recap semanal (`WeeklyRecapCard`), la racha (`NutritionStreakBanner`) y el banner de contexto de entreno (`WorkoutContextBanner`). El foco es BACKEND: qué datos llegan, cómo se calculan, dónde se gatea el módulo de pago y cómo degrada cuando está OFF. Estas piezas son **read-only del lado alumno**: no escriben nada (los chips/equivalencias los prescribe el coach; la adherencia/racha/recap se derivan de `daily_nutrition_logs` que escribe el flujo de marcado de comidas, fuera de esta sección).

---

## 3.0 Cómo se cablean en la página y el shell

Todo se orquesta en el RSC `apps/web/src/app/c/[coach_slug]/nutrition/page.tsx` y se pasa por props al cliente `NutritionShell`:

1. `page.tsx` carga `getActiveNutritionPlan(user.id)` (de `_data/nutrition.queries.ts`). Si no hay plan (o el plan está vacío = draft auto-creado), renderiza `NutritionNoPlanFromServer` y corta — ninguna de estas cinco piezas se monta.
2. En un único `Promise.all` se piden en paralelo, entre otros: `getNutritionAdherence30d` (→ `adherence`), `getStudentExchangeData` (→ `exchange`), `getHeroComplianceBundle` (→ `heroBundle`, de donde sale `hasTodayWorkout`) y `getNutritionWeeklyRecap` (→ `weeklyRecap`).
3. `WeeklyRecapCard` se renderiza **directo en `page.tsx`** (`{weeklyRecap && <WeeklyRecapCard recap={weeklyRecap} />}`), por encima del `NutritionShell`.
4. `NutritionShell` recibe `hasTodayWorkout`, `adherence` y `exchange`, y monta internamente `WorkoutContextBanner`, `NutritionStreakBanner`, `AdherenceStrip`, `ExchangeMealChips` (dentro de cada `MealCard`) y `ExchangeEquivalencesSheet`.

Las cinco piezas comparten la convención de día-de-semana **America/Santiago** (`getNutritionDayOfWeekFromIsoYmdInSantiago`, `nutritionMealAppliesOnIsoYmdInSantiago`, `getTodayInSantiago` de `@/lib/date-utils`), donde 1=Lun … 7=Dom y `day_of_week == null` significa "la comida aplica todos los días".

---

## 3.1 Intercambios Pro (módulo `nutrition_exchanges`) — vista del alumno

### 3.1.1 Qué es y qué ve el alumno

El módulo de pago **`nutrition_exchanges`** ("Nutrición Pro" / "porciones") cambia el plan de modo **gramos** a modo **intercambios**: en vez de "150 g de arroz", el coach prescribe **porciones por grupo de intercambio** ("2C · 1LAC · 1F") y el alumno consulta **equivalencias** (qué alimento cubre 1 porción de ese grupo, con medida casera + gramos).

Del lado alumno hay dos componentes:

- **`ExchangeMealChips`** — chips por comida. Renderiza una fila de chips tipo `2C`, `1LAC`, `1F`, cada uno con el código del grupo en un badge de color y el número de porciones. Tap en un chip abre el sheet de equivalencias **de ese grupo** (vía callback `onChipTap`). Se monta DENTRO de cada `MealCard` como `exchangeContent` (`NutritionShell.tsx`).
- **`ExchangeEquivalencesSheet`** — bottom-sheet (modal mobile-first) con la lista de equivalencias del grupo tocado: **alimento + medida casera (`portionLabel`) + gramos (`portionGrams`)**, con búsqueda local por nombre. La cabecera muestra los macros de referencia por porción del grupo (`≈ kcal · P g · C g · G g`) y, si el grupo no tiene macros confirmados (`macrosConfirmed === false`), un badge **"(provisional)"**.

El sheet se monta una sola vez en `NutritionShell` (`{exchangeEnabled && exchange && <ExchangeEquivalencesSheet ... />}`); su visibilidad la controla el estado `equivalenceGroup` (`useState<ExchangeGroup | null>`). `onChipTap` = `setEquivalenceGroup(group)`; cerrar = `setEquivalenceGroup(null)`.

Además del chip por comida, el alumno ve:
- Una **etiqueta de variante de día** sobre los chips cuando la comida tiene `dayVariantId` asignado (ej. "Entreno AM", "Descanso") — `variantNameById.get(mealVariantId)`.
- **Macros derivados** mostrados en el `MealCard` vía `macroOverride`: cuando la comida tiene targets de intercambio, el shell **NO usa los macros de los food_items**, sino que los recalcula con `macrosForTargets(mealTargets, exchange.groups)` (Σ porciones × ref del grupo). Es decir, en modo intercambios el anillo de la comida refleja el cálculo por porciones, no por gramos.
- El botón de PDF de la fila inferior cambia de "Exportar PDF" a **"Pauta PDF"** y descarga la pauta de porciones con equivalencias (`downloadNutritionExchangePdf`, import dinámico) en vez del PDF de gramos.

### 3.1.2 De dónde salen los datos: `getStudentExchangeData`

`_data/nutrition-exchanges.queries.ts` expone `getStudentExchangeData` (envuelto en `React.cache`). Crea **dos clientes Supabase**:

- `createClient()` — cliente **request-scoped del alumno** (RLS es el techo).
- `createServiceRoleClient()` — **service-role**, usado SOLO para el catálogo de grupos y los flags de módulo del tenant (el alumno no tiene policy `xg_select` sobre `exchange_groups`).

Delega en `getStudentExchangeBundle(supabase, serviceDb, input)` del servicio `services/nutrition-exchanges/nutrition-exchanges.service.ts`. Input: `{ clientId, planId, planCoachId, planMode }` (el `plan_mode` viene del `getActiveNutritionPlan`).

> **Gotcha documentado en el código:** `createRawAdminClient` NO bypasea RLS si lleva cookies (corre como el usuario). El bypass real es `createServiceRoleClient` (sin cookies). Por eso el catálogo de grupos usa `serviceDb`.

### 3.1.3 El bundle del alumno: `getStudentExchangeBundle`

Tipo de retorno `StudentExchangeBundle`:

| Campo | Tipo | Significado |
|---|---|---|
| `enabled` | `boolean` | Módulo ON para el contexto del alumno |
| `planMode` | `'grams' \| 'exchanges'` | Modo del plan |
| `groups` | `ExchangeGroup[]` | Catálogo de grupos referenciados por el plan |
| `targetsByMealId` | `Record<string, MealExchangeTarget[]>` | Porciones prescritas por comida |
| `variants` | `DayVariant[]` | Variantes de día del plan |
| `variantByMealId` | `Record<string, string \| null>` | Variante asignada por comida |
| `equivalences` | `ExchangeFoodEquivalence[]` | Alimentos → porción (medida casera + gramos) |

Flujo de `getStudentExchangeBundle` (todo fail-closed; cualquier corte devuelve `EMPTY_BUNDLE`):

1. **Si `planMode !== 'exchanges'` → `EMPTY_BUNDLE`** inmediato. (Plan en gramos = el alumno nunca ve chips; la vista degrada idéntica, AC5.)
2. Lee la fila `clients` del propio alumno (RLS lo permite) para sacar `team_id` y `org_id` (su tenant).
3. **Gate del módulo por contexto del RECURSO** vía `hasExchangesModuleForClientContext(serviceDb, { clientTeamId, clientOrgId, planCoachId })`:
   - Si el alumno es de **pool team** (`clientTeamId && !clientOrgId`) → decide `teams.enabled_modules[nutrition_exchanges] === true` (lee con `getTeamEnabledModules`).
   - Si no (standalone) → decide `coaches.enabled_modules[nutrition_exchanges] === true` (lee con `getCoachEnabledModules`) del coach dueño del plan (`planCoachId`).
   - Sin coach ni team → `false`.
   - **Si no está habilitado → `EMPTY_BUNDLE`.** "El pool manda": un alumno de pool depende del entitlement del team, no de su coach individual.
4. Carga asignaciones comida↔variante (`findMealVariantAssignments`, cliente alumno) y, en paralelo (`Promise.all`):
   - `findMealExchangeTargetsByMealIds` (targets, cliente alumno; RLS techo `met_client_select`).
   - `findDayVariantsByPlan` (variantes, cliente alumno).
5. Junta los `exchangeGroupId` únicos de los targets y resuelve el **catálogo de grupos** con `findExchangeGroupsByIdsForTenant(serviceDb, groupIds, tenant)` — **doble acotamiento (data minimization)**: SOLO los ids ya presentes en el plan + SOLO grupos del tenant (`is_system` OR `coach_id = planCoachId` OR `team_id = clientTeamId`).
6. **Defensa en profundidad PURA**: filtra los grupos con `groupMatchesTenant(g, tenant)` (un id cross-tenant copiado nunca resuelve aunque pasara el SQL; unit-tested).
7. Construye `targetsByMealId` **descartando targets cuyo grupo no quedó en `allowedGroupIds`** (si un grupo no es visible para el tenant, su chip no aparece).
8. Construye `variantByMealId` desde las asignaciones.
9. Carga **equivalencias** con `findExchangeFoodsByGroupIds(db, [...allowedGroupIds])` usando el **cliente del alumno** (RLS de `foods` es el techo; los alimentos de su plan/system ya son visibles).
10. Devuelve `{ enabled: true, planMode: 'exchanges', groups, targetsByMealId, variants, variantByMealId, equivalences }`.

### 3.1.4 Tablas y columnas leídas

- **`nutrition_plans`** (`plan_mode`, `coach_id`, `client_id`) — modo + dueño + tenant.
- **`clients`** (`team_id`, `org_id`) — tenant del alumno.
- **`exchange_groups`** (`id, slug, code, name, coach_id, team_id, is_system, ref_calories, ref_protein_g, ref_carbs_g, ref_fats_g, color, sort_order, composed_of, macros_confirmed`) — catálogo. Constante `GROUP_COLUMNS` en `exchanges.repository.ts`. RLS `xg_select` (sin policy para alumno → service-role).
- **`meal_exchange_targets`** (`id, meal_id, exchange_group_id, portions, notes`) — porciones prescritas. RLS techo lectura alumno `met_client_select`.
- **`nutrition_plan_day_variants`** (`id, plan_id, name, sort_order, created_at`) — variantes de día. RLS techo lectura alumno `npdv_client_select`.
- **`nutrition_meals`** (`id, day_variant_id`) — asignación comida→variante.
- **`foods`** (`id, name, exchange_group_id, exchange_portion_grams, exchange_portion_label`) — equivalencias (medida casera + gramos por grupo).
- **`coaches.enabled_modules`** / **`teams.enabled_modules`** (jsonb) — entitlements del módulo.

### 3.1.5 Mapeos y tipos de dominio

- `ExchangeGroup` (`domain/nutrition/exchange.types.ts`): incluye `code` (término de dominio, **no se traduce**: 'C','P','F','V','LAC','ARL','SP','G','LEG'), `refCalories/refProteinG/refCarbsG/refFatsG` (macros **por porción**, provisorios hasta `macrosConfirmed`), `composedOf` (grupo compuesto, ej. Legumbres = 1P + 1C; null = simple) y `color` (hex del badge; null = paleta derivada por sortOrder).
- `MealExchangeTarget`: `{ mealId, exchangeGroupId, portions (> 0, hasta 99, numeric admite 0.5), notes }`.
- `ExchangeFoodEquivalence`: `{ foodId, name, exchangeGroupId, portionGrams (null-able), portionLabel (medida casera, null-able) }`.
- `DayVariant`: `{ id, planId, name, sortOrder }`.
- El repository mapea snake_case → camelCase y parsea `composed_of` (jsonb) con `parseComposedOf` (valida que cada parte tenga `code: string` y `portions: number`).

### 3.1.6 Cálculo de chips, color y macros derivados (`exchange-calc.ts`)

PURO, sin IO (apto para builder, PDF y app del alumno; el plan maestro lo moverá a `@eva/calc` como move 1:1).

- **`ExchangeMealChips`** ordena las filas por `group.sortOrder` (desempate por `code.localeCompare`), filtra `portions > 0` y muestra `formatPortions(portions) + group.code`. `formatPortions` rinde enteros como '1' y fracciones como '0.5'/'1.5'.
- **Color del badge**: `exchangeGroupColor(group)` usa `group.color` si es hex válido `#RRGGBB`; si no, una paleta fallback determinística por `sortOrder` (`EXCHANGE_FALLBACK_COLORS`, 9 colores dark-friendly).
- **Macros derivados por comida** (lo que ve el alumno en el anillo del `MealCard`): `macrosForTargets(targets, groups)` = expande compuestos con `expandComposedGroups` (1 LEG → 1P + 1C por porción prescrita; si falta un grupo base, NO expande y usa los `ref_*` propios del compuesto) y suma `ref_* × portions` con redondeo a 1 decimal.
  - `expandComposedGroups` omite targets de grupos desconocidos (id no presente en `groups`).
  - `dayTotals` / `dayTotalsByVariant` suman por día y por variante (comida con `dayVariantId` null cuenta en TODAS las variantes; contrato DB: NULL = aplica a todas).
- **Badge "provisional"** en el sheet: la cabecera lo muestra cuando `!group.macrosConfirmed`. (Helper `hasUnconfirmedMacros` existe para chequear a nivel de comida.)
- El sheet filtra `equivalences` por `f.exchangeGroupId === group.id` y aplica el término de búsqueda local (`f.name.toLowerCase().includes(term)`), todo en cliente (`useMemo`).

### 3.1.7 Gating y seguridad — resumen de capas

- **Capa 1 (modo):** `plan_mode !== 'exchanges'` → bundle vacío.
- **Capa 2 (entitlement por recurso, "pool manda"):** team → `teams.enabled_modules`; standalone → `coaches.enabled_modules`. Fail-closed.
- **Capa 3 (data minimization SQL):** grupos acotados a ids del plan + tenant.
- **Capa 4 (defensa en profundidad PURA):** `groupMatchesTenant` re-filtra; targets con grupo no permitido se descartan.
- **Degradación (AC5):** con el módulo OFF o el plan en gramos, `exchange` llega vacío, `exchangeEnabled = !!exchange?.enabled = false`, y la vista es **byte-identical** al modo gramos (sin chips, sin sheet, PDF normal).

> El alumno **NO escribe** intercambios. Las mutaciones (`saveMealExchangeTargets`, `setNutritionPlanMode`, variantes, asignar variante) son del coach/servicio, todas pasando por `assertExchangesModuleForPlan` (gating server-side por recurso) y `verifyGroupsVisibleToActor` (coerción del payload client-controlled — el FK de `meat_exchange_targets` NO valida visibilidad). La bitácora `pdf_generate` (`team_access_logs`, Ley 21.719) se registra **solo** cuando un coach de team descarga la pauta de un alumno de SU pool; **el alumno descargando su propia pauta NO genera bitácora** (`shouldLogExchangePdf` → false; en el shell el `handleDownloadExchangePdf` del alumno no llama ninguna action de log).

---

## 3.2 `AdherenceStrip` — tira de adherencia de 30 días

### 3.2.1 Qué muestra

Una grilla de **30 celdas** (una por día, últimos 30 días incluyendo hoy), cada celda coloreada por % de comidas del plan completadas ese día. Hoy lleva un anillo. Header: "Adherencia — 30 días" + `InfoTooltip` + contador "X/30 días" (= días con al menos una comida completada). Leyenda de colores. Es **read-only**.

Se monta al final del `NutritionShell` SOLO si `adherenceEffective.length > 0 && (plan.nutrition_meals?.length ?? 0) > 0`.

### 3.2.2 Qué datos llegan

Props: `data: DayAdherence[]` y `planMeals: { id, day_of_week? }[]`.

- `data` = `adherence`, salida de **`getNutritionAdherence30d(user.id, plan.id)`** (`_data/nutrition.queries.ts`).
- `planMeals` = `planMealsForAdherence` (en `NutritionShell`): `(plan.nutrition_meals ?? []).map(m => ({ id: m.id, day_of_week: m.day_of_week ?? null }))`.

`getNutritionAdherence30d` (cacheado): consulta `daily_nutrition_logs` filtrando `client_id`, `plan_id`, `log_date >= today-30` (zona Santiago, `getTodayInSantiago` + `subDays`), seleccionando `log_date` y los `nutrition_meal_logs (meal_id, is_completed, consumed_quantity)` anidados, ordenado por `log_date` asc. Tipo:

```
DayAdherence = { log_date: string; nutrition_meal_logs: { meal_id: string; is_completed: boolean }[] }
```

### 3.2.3 Cómo se calcula (cliente, `useMemo`)

La ventana se reconstruye en cliente (NO se confía en qué días vinieron):

1. Mapea `data` por `log_date`.
2. Ancla hoy a mediodía (`parseISO(today + 'T12:00:00')`) para evitar saltos DST.
3. Itera `i = 29 … 0` (subDays) → 30 ISO consecutivos.
4. Para cada día: `planned` = comidas del plan que aplican ese día (`nutritionMealAppliesOnIsoYmdInSantiago(m, iso)` — respeta `day_of_week`/null). `applicableIds` = sus ids.
5. `completed` = logs `is_completed && applicableIds.has(meal_id)` (cruza el log del día contra las comidas aplicables a ESE día).
6. `pct = planned > 0 ? completed / planned : 0`.

> **Importante:** esta tira **no usa el motor canónico `computeNutritionAdherence`**; calcula su propio % en cliente. El criterio (comidas completadas / comidas aplicables ese día) coincide conceptualmente con el motor pero es un cálculo independiente.

- **Color por celda** (`getColor`): `pct === 0` → "sin reg." (gris); `>= 0.8` → verde; `>= 0.5` → ámbar; `> 0` → rojo. (1–49% rojo, 50–79% ámbar, 80%+ verde.)
- **Contador "X/30 días"**: `registeredDays = days.filter(d => d.completed > 0).length` — días con **al menos una** comida completada (engagement, no cumplimiento).

### 3.2.4 Resiliencia offline

`AdherenceStrip` recibe `adherenceEffective`, no `adherence` directo. En `NutritionShell`, si el dispositivo está **offline** y el servidor devolvió `adherence` vacío, se intenta levantar la tira desde el **read-model cache local** (`readNutritionReadModelCache(coachSlug, plan.id)`), validando `c.today === today` y `c.clientUserId === userId`. Si hay caché válida → `adherenceBoost`. `adherenceEffective = adherenceBoost ?? adherence`. La misma copia local se escribe en cada render del día actual (`writeNutritionReadModelCache`). Hay un banner "Sin conexión" explicando que se guarda copia del plan de hoy + barra de adherencia.

---

## 3.3 `WeeklyRecapCard` — recap semanal

### 3.3.1 Qué muestra

Tarjeta motivacional read-only: título + subtítulo de **tono adaptativo**, % de adherencia de 7 días (cifra grande), delta vs. la semana anterior (con icono ↑/↓/–), "X de 7 días registrados", y un botón **"Compartir mi semana"** que abre WhatsApp (`https://wa.me/?text=...`) con un texto generado (`shareText`). En estado `start` no muestra cifras ni botón.

Renderizada en `page.tsx` (no en el shell): `{weeklyRecap && <WeeklyRecapCard recap={weeklyRecap} />}`.

### 3.3.2 De dónde salen los datos: `getNutritionWeeklyRecap`

`_data/recap.queries.ts` (cacheado). A diferencia de la tira de 30d, este SÍ usa el **motor canónico** `computeNutritionAdherence` de `@eva/nutrition-engine` — las mismas cifras que el resto de la app (auditable, snapshot-primero). On-demand: **reusa el loader cacheado de 30d** (`getNutritionAdherenceInputs30d`), sin tabla nueva ni cron.

Tipo `WeeklyRecap`:

| Campo | Significado |
|---|---|
| `thisWeekPct` | Cumplimiento de comidas % (Σ hechas / Σ aplicables) últimos 7 días |
| `lastWeekPct` | Idem 7 anteriores (null si no hubo ningún registro esa semana) |
| `deltaPct` | `thisWeekPct - lastWeekPct` (null sin base de comparación) |
| `daysLoggedThisWeek` | Días con al menos un registro en los últimos 7 (0..7) |
| `tone` | `'great' \| 'good' \| 'gentle' \| 'start'` |

### 3.3.3 Cómo se calcula

1. `getNutritionAdherenceInputs30d(clientId)` (de `dashboard.queries.ts`) trae `plan` (con `nutrition_meals → food_items → foods`, `daily_calories/protein_g/carbs_g/fats_g`) y `logs` (30d de `daily_nutrition_logs` con `target_*_at_log` snapshot + `nutrition_meal_logs (meal_id, is_completed, consumed_quantity)`). Si no hay plan activo → `null` → la tarjeta no se renderiza.
2. Normaliza comidas: `normalizeMealForMacros(m)` + `day_of_week` → `AdherenceMeal[]`.
3. `liveTarget` = macros del plan vigente.
4. Arma `logsByDate` (Map por `log_date`) y `targetByDate` (Map de snapshot por fecha, **solo si `target_calories_at_log != null`** — usa el target congelado al momento del log, fallback al `liveTarget`).
5. Define dos ventanas con ancla `getTodayInSantiago`:
   - **esta semana** = hoy-6 … hoy (`windowOf(0, 6)`).
   - **semana anterior** = hoy-13 … hoy-7 (`windowOf(7, 13)`).
6. Corre `computeNutritionAdherence` en cada ventana (resolver `getNutritionDayOfWeekFromIsoYmdInSantiago`).
7. `thisWeekPct = min(100, round(thisAgg.summary.compliancePct))`. `daysLoggedThisWeek = thisAgg.perDay.filter(d => d.hasLog).length`. `lastWeekPct` solo si la semana anterior tuvo algún `hasLog`. `deltaPct` solo si hay base.
8. **Tono**: `daysLoggedThisWeek === 0 → 'start'`; `thisWeekPct >= 85 → 'great'`; `>= 60 → 'good'`; resto `'gentle'`. (Mapa de textos `TONE` en el componente: great/good/gentle/start con títulos y subtítulos sin culpa.)

### 3.3.4 El motor canónico `computeNutritionAdherence`

`packages/nutrition-engine/adherence.ts` (PURO; sin Next/Supabase/React/RN/date-utils — la convención día se inyecta via `dayOfWeekResolver`/`mealAppliesOn`). Invariantes críticas:

- **compliancePct diario** = `mealsDone / applicableMeals`.
- **compliancePct de RANGO** = `Σ(mealsDone) / Σ(applicableMeals)` — **nunca** el promedio de los % diarios.
- `consumedMacros` via `calculateConsumedMacrosWithCompletionFallback` (usa `consumed_quantity` como % de porción cuando existe).
- `targetMacros` por día = snapshot de `targetByDate` si existe, si no `liveTarget`.
- `loggingEngagementPct` = `daysWithLog / rangeDays * 100` — campo SEPARADO, jamás fusionado en compliancePct.
- `mealAppliesOn` default: `day_of_week == null` → aplica todos los días; si no, compara con `dayOfWeekResolver(iso)`.
- `enumerateDates` ancla a mediodía UTC para evitar DST; rango invertido → solo el primer día.
- `computeStreak`: un día cuenta si tiene comidas aplicables y `mealsDone >= applicableMeals` (100%); días sin comidas aplicables son **neutros** (no rompen ni suman); devuelve `current` (cola) y `longest`. (Nota: el recap NO usa este streak; usa el suyo el `NutritionStreakBanner`.)

### 3.3.5 `shareText`

Genera: `"Mi semana en nutrición: {thisWeekPct}% de adherencia · {daysLoggedThisWeek}/7 días registrados[ · +{deltaPct}% vs la semana pasada 📈] 💪"`. El delta solo se agrega si `deltaPct > 0`.

---

## 3.4 `NutritionStreakBanner` — racha de adherencia

### 3.4.1 Qué muestra

Banner que aparece **solo** cuando hay racha viva (≥2 días) o cuando la racha está "en riesgo" (gracia de 1 día). Dos estados visuales:

- **Racha viva**: icono llama, "{N} de 7 días de racha" (o "{N} días" si N>7) + subtítulo motivacional según el largo (≥7 "¡Semana perfecta!", ≥3 "Vas muy bien", si no "Buen comienzo") + `InfoTooltip` explicando el cálculo.
- **En riesgo** (grace day): icono alerta ámbar, "Racha en riesgo · {priorCount} de 7 días", "Registra tus comidas de hoy para mantenerla."

Se monta en `NutritionShell` solo si `adherenceEffective.length > 0 && totalMeals > 0`.

### 3.4.2 Qué datos llegan

Mismas props que `AdherenceStrip`: `adherenceData: DayAdherence[]` (= `adherenceEffective`, mismo loader `getNutritionAdherence30d` + boost offline) y `planMeals: { id, day_of_week? }[]` (= `planMealsForAdherence`). **No** hace queries propias; calcula todo en cliente desde la ventana de 30d.

### 3.4.3 Cómo se calcula (cliente, `useMemo`)

Criterio de "día cumplido" distinto al de la tira: aquí un día cuenta con **≥50%** de comidas (no 100%).

- `dayMet(iso)`: comidas aplicables ese día (`nutritionMealAppliesOnIsoYmdInSantiago`). Si **no hay comidas planificadas** → `null` (día neutro, se salta). Si hay → `completed / applicable >= 0.5`.
- `countFrom(startOffset)`: cuenta hacia atrás (hasta 365 días), saltando días neutros (`null`), sumando mientras `met === true`; corta en el primer `met === false` devolviendo `{ count, brokeOffset }`.
- **Racha viva**: `live = countFrom(0)` (incluye hoy). Si `live.count > 0` → `{ count: live.count, atRisk: false }`.
- **Grace day (en riesgo)**: si hoy aún no cuenta y `live.brokeOffset === 1` (lo que rompió fue **ayer**), se mira `prior = countFrom(2)`; si `prior.count >= 2` → `{ count: 0, atRisk: true, priorCount: prior.count }`. Es decir, fallar ayer no reinicia inmediatamente: hay un día de gracia para recuperar registrando hoy ≥50%.
- Render: si `atRisk` → banner ámbar. Si no, **`count < 2` no muestra nada** (la racha mínima visible es 2).

> Criterios distintos por componente (intencional): tira de 30d colorea por porcentaje continuo; racha exige ≥50%; el streak del motor canónico (`computeStreak`) exige 100%. El tooltip del banner aclara "al menos la mitad de las comidas que aplican a ese día (mismo criterio que la barra de adherencia)" — aunque la barra colorea por gradiente, el umbral de "registrado" que usan ambos es haber completado comidas aplicables.

---

## 3.5 `WorkoutContextBanner` — contexto de entreno en la nutrición

### 3.5.1 Qué muestra y por qué

Banner informativo (status, no prescripción médica) que aparece **solo si hoy hay entreno en el plan**: "Hoy tienes entreno en tu plan." + tooltip aclarando que es recordatorio educativo (no sustituye indicación médica/nutricional) + "Hidrátate y distribuye carbohidratos alrededor de la sesión según lo que acordaste con tu coach."

Propósito: cerrar el loop entreno↔nutrición sin dar consejos médicos (timing de comidas, hidratación, macros peri-entreno) — el texto explícitamente delega la prescripción al coach.

### 3.5.2 Qué datos llegan

Única prop: `hasTodayWorkout: boolean`. Si `false`, el componente **retorna null** (no se monta).

- En `NutritionShell` se renderiza `<WorkoutContextBanner hasTodayWorkout={hasTodayWorkout} />` arriba del `DayNavigator`.
- `hasTodayWorkout` viene de `page.tsx`: `heroBundle.hero.hasWorkout`, donde `heroBundle = getHeroComplianceBundle(user.id, coach_slug)` (de `../dashboard/_data/heroComplianceBundle`).
- En `heroComplianceBundle.ts`, `hasWorkout = !!todayPlan` — verdadero si el alumno tiene un `workout_plan` previsto para hoy (microciclo / fecha asignada del programa de entrenamiento). Es decir, el dato cruza el **dominio de entrenamiento** (`workout_plans`/`workout_programs`) hacia la página de nutrición.

No hace queries propias; es presentación pura de un booleano resuelto server-side en el bundle del dashboard.

---

## 3.6 Notas para el rediseño (paridad)

- **Cinco cálculos de adherencia/racha conviven** y deben preservarse byte-a-byte para no romper números:
  1. `AdherenceStrip` (cliente, % continuo, color por umbral 0.5/0.8).
  2. `NutritionStreakBanner` (cliente, ≥50%, grace day de 1).
  3. `WeeklyRecapCard`/`getNutritionWeeklyRecap` (servidor, motor canónico, Σ/Σ, ventanas 7+7).
  4. `computeStreak` del motor (100%, neutros — usado por el recap solo si se leyera `streak`, hoy el recap no lo usa).
  5. Macros derivados de intercambios (`macrosForTargets`, Σ porciones × ref con expansión de compuestos).
- **Día-de-semana SIEMPRE America/Santiago**, `day_of_week == null` = todos los días. Anclar a mediodía al iterar fechas (DST).
- **Gating del módulo de pago es server-side y por RECURSO** ("pool manda"): nunca decidir por el coach del alumno si el alumno es de team. Fail-closed en cada capa; degradación a vista idéntica al modo gramos.
- **Service-role acotado** para `exchange_groups` (el alumno no tiene policy); resto con cliente del alumno (RLS techo). Mantener data minimization (ids del plan + tenant) y el doble filtro `groupMatchesTenant`.
- **El alumno no escribe nada** en estas piezas; la bitácora Ley 21.719 NO aplica a su propia descarga.
- **Offline**: `AdherenceStrip` y `NutritionStreakBanner` dependen de `adherenceEffective` (boost desde `readNutritionReadModelCache`); preservar el read-model local del día + adherencia.
- **El recap se renderiza en `page.tsx`, no en el shell**; el banner de entreno y los demás, dentro del shell.
