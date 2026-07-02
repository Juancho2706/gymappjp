# 5. Pestana Nutricion

Hogar de nutricion del alumno visto por el coach. Componente cliente raiz: `NutritionTabB5` (`apps/web/src/app/coach/clients/[clientId]/NutritionTabB5.tsx`). Es un `'use client'` puro: **no hace fetch inicial propio**; recibe todo via props que arma el RSC de la ficha del alumno (page.tsx → `_data`). En runtime solo dispara server actions para datos secundarios (historial por fecha, habitos, restricciones, busqueda de alimentos) y para mutaciones (guardar umbrales, notas, ciclos, restringir alimentos, duplicar plan).

El componente organiza todo en cuatro zonas mas un acordeon "Detalle":
- Zona A · Progreso (adherencia/macros, motor canonico)
- Zona B · Plan y comidas (plan activo, edicion, copiar, lista de comidas, favoritos)
- Zona C · Alertas y contexto (overrides de funciones, alertas, check-in, restricciones, conversacion, umbrales de micros, nota privada, ciclos, habitos)
- Detalle (graficos densos + historial de logs, colapsados por defecto)

---

## 5.0 Gating de dominio y de secciones

Antes de describir cada bloque, dos mecanismos de visibilidad controlan TODO el render (gating = solo render; **nunca borra datos** en DB):

- **`nutritionDomainEnabled`** (default `true`): master switch del dominio Nutricion resuelto para ESTE alumno (heredado del default coach/team, mas el override por-alumno). Si es `false`, `NutritionTabB5` hace **early-return**: muestra una `GlassCard` "Nutricion desactivada para este alumno" + (si hay contexto) el panel `ClientFeaturePrefsPanel` como escape hatch para re-activar. No renderiza ninguna otra zona.
- **`nutritionSectionFlags`** (`Record<NutritionSectionKey, boolean>`): visibilidad por seccion resuelta como `entitled AND wants` (el coach ve lo que ve el alumno). Helper local `showSection(key)`: si `nutritionSectionFlags` es `undefined` (flag global OFF / sin resolver) ⇒ devuelve `true` (comportamiento de HOY: mostrar todo). Las secciones **core** (plan, macros, adherencia) NO llaman `showSection`: van siempre.
  - `showMicros = showSection('micros_base') || showSection('micros_advanced')` controla el editor de umbrales.
  - `showSection('notes')` controla la conversacion bidireccional.
  - `showSection('habits')` controla la card de habitos del dia.

---

## 5.1 Zona A · Progreso (adherencia y macros)

Componente envoltorio `NutritionProgressZone`. Solo se llena si hay `plan` y `kcal > 0`; si no, muestra "Asigna un plan de nutricion con meta calorica para ver el progreso".

**Datos que llegan (props):**
- `activeNutritionPlan` (`plan`): el plan activo como `Record<string, unknown>`. De ahi salen `kcal` (`daily_calories` ?? `target_calories`), `prot`/`carb`/`fat` (`protein_g`/`carbs_g`/`fats_g` ?? `target_*`), `is_custom`, `instructions`, `name`, `nutrition_meals`.
- `todayMacros` (`tm`): `{ calories, protein, carbs, fats }` consumidos hoy.
- `hasTodayNutritionLog`: si el alumno registro comidas hoy.
- `adherence30d` (`DayAdherence[]`), `nutritionTimeline` (filas por dia con `compliancePct`, `mealsDone`, `mealsTotal`, `target_*`, `consumed_*`).
- Metricas precalculadas: `nutritionMonthlyAvgPct`, `nutritionStreakDays`, `nutritionWeeklyAvgPct`, `nutritionPrevWeeklyAvgPct`.

**Bloque "Hoy (Santiago)":**
- Si `!hasTodayNutritionLog`: texto "No ha registrado comidas hoy".
- Si hay log: `ConsumedVsTarget` (energia diaria: `tm.calories` vs `kcal`) + `MacroRingSummary` en modo `isReadOnly` con consumido vs meta de calorias y los 3 macros. Estos son los **numeros canonicos del motor de adherencia** (vienen calculados aguas arriba, el tab no los recomputa).

**Bloque "Adherencia · 30 dias":**
- Si hay `adherence30d` y el plan tiene comidas (`planMealsForStrip`) ⇒ `AdherenceStrip` (cada cuadrado = un dia con al menos una comida completada) + tres KPIs: Promedio mensual (`nutritionMonthlyAvgPct`%), Racha ≥80% (`nutritionStreakDays` dias), Semana vs anterior (`nutritionWeeklyAvgPct`% vs `nutritionPrevWeeklyAvgPct`% con icono de tendencia `weekDelta`).
- Si NO se cumple ⇒ fallback `HeatmapCell` grid de 30 dias (`heatmapDays`, derivado de `nutritionTimeline`): color por `compliancePct` (≥80 verde, 60–80 ambar, <60 rosa, sin log gris).

**Grafico "Ultimos 7 dias · kcal consumidas vs meta del log":** `ComposedChart` con barras = `consumed_calories` por dia (`chart7d`, derivado de `nutritionTimeline`) y linea = meta calorica diaria. Tooltip por dia.

> Toda la Zona A es **solo lectura**: no muta nada.

---

## 5.2 Zona B · Plan y comidas

**Alimentos favoritos del alumno** (`clientFavoriteFoods`, prop persistida): si hay, muestra `Badge`s con los nombres. Texto aclara que el alumno los marco desde su app y aplican a todos sus planes con esos alimentos del catalogo. Solo display.

**Card "Plan activo":** solo si hay `plan`. Muestra:
- Nombre del plan + badge `CUSTOM`/`SYNCED` (segun `is_custom`) con tooltip explicando que CUSTOM = editado para este alumno (no lo afecta la propagacion de plantillas) y SYNCED = vinculado a plantilla (se actualiza al propagar; el historial de adherencia se conserva).
- `kcal / dia`, `instructions` (texto libre), y 3 `MacroShareRing` (proteina/carbos/grasas con gramos y % de kcal de cada macro) + tile "Distribucion (meta kcal macros)".

**Acciones de la card (acceso al editor + copiar):**
1. **"Editar plan"**: `Link` a `/coach/nutrition-plans/client/${clientId}` (editor de plan del alumno; este es el modo `client-plan` que habilita porciones/equivalencias Pro).
2. **"Ver como alumno"** (si hay `coachSlug`): `<a target="_blank">` a `/c/${coachSlug}/nutrition` (vista de la app del alumno).
3. **"Copiar a otro alumno"** (si hay `activeNutritionPlan`): abre el `Dialog` de duplicado.

**Modal "Copiar plan a otro alumno"** (estado `dupOpen`/`dupClients`/`dupTargetId`/`dupLoading`):
- Al abrir (`handleOpenDuplicate`): si aun no cargo, llama `getCoachClientsLite(coachId)` y filtra el alumno actual de la lista. Llena el `Select`.
- Al confirmar (`handleDuplicate`): toma `sourcePlanId = activeNutritionPlan.id` y llama **`duplicatePlanToClient(coachId, sourcePlanId, dupTargetId)`** (`nutrition-coach.actions.ts:940`).
  - **Que hace en backend:** valida scope (`requireCoachNutritionScope` + `applyOrgScope`); verifica que el alumno destino pertenece al coach; lee el plan origen (`nutrition_plans`: name, daily_calories, protein_g, carbs_g, fats_g, instructions) y sus `nutrition_meals` + `food_items` (con `swap_options`); **desactiva** el plan activo previo del destino (`is_active=false`, conserva logs); **inserta** un nuevo `nutrition_plans` para el destino como **`is_custom: true`, `template_id: null`, `is_active: true`** y clona comidas + food_items. Devuelve `{ success, planId }`.
  - El plan se copia como CUSTOM; el historial del alumno actual y el plan origen NO se modifican.
  - Toast de exito/error.

**Lista de comidas del plan (`mealsList`):** solo si hay `mealDetails`. Acordeon por comida: nombre, descripcion, macros agregados (suma de `food_items[].foods.{protein_g,carbs_g,fats_g} * quantity`), y al expandir la lista de alimentos enlazados (nombre, cantidad+unidad, kcal). Solo display.

---

## 5.3 Zona C · Alertas y contexto

Es el corazon "coach-only". Orden de render:

### 5.3.1 ClientFeaturePrefsPanel (override de Funciones por-alumno)
Solo si hay `nutritionOverrideContext`. Panel "Funciones para este alumno": el coach **fuerza mostrar/ocultar** secciones de Nutricion SOLO para este alumno, encima del default coach/team. Recibe `baseEffective` (lo heredado), `override` (lo ya guardado), `entitledByModule`, `domainEnabledBase`, `useTeamBase`. Escribe `client_feature_prefs.sections` (RLS coach-owner/manager). Gating = render. Tambien aparece en el early-return de dominio apagado como escape hatch (su master switch tri-state permite re-activar la nutricion).

### 5.3.2 NutritionCoachAlertsPanel (que detecta)
Recibe `alerts: NutritionCoachAlert[]` ya calculados client-side por `deriveNutritionCoachAlerts` (`nutrition-coach-alerts.ts`) con un `useMemo` sobre props (sin queries nuevas). Si `alerts.length === 0` no renderiza nada. Cada alerta es deterministica con `variant` (danger/warning/info), titulo y descripcion. Reglas:

| id | variant | condicion | mensaje |
|----|---------|-----------|---------|
| `over_restriction` | danger | `kcalTarget > 0 && < 1200` | Meta calorica muy baja (riesgo de no cubrir micros; revisar si es seguro) |
| `adherence_drop` | warning | `prevWeeklyAvgPct > 60 && weeklyAvgPct < 30` | Caida brusca de adherencia semana vs semana anterior (contactar/ajustar) |
| `stagnation` | info | `monthlyAvgPct < 45 && distinctDaysLast30 >= 14` | Adherencia mensual plana pese a registrar (revisar si el plan es realista) |
| `silent_recent` | warning | sin ninguna comida en los ultimos 5 dias `&& distinctDaysLast30 >= 3` | Sin comidas registradas en 5 dias (alumno desconectado o plan dificil) |

Prerrequisito global: si `!hasActivePlan` o sin `santiagoTodayIso`, retorna `[]`. `distinctDaysLast30` = dias distintos con fila en `nutritionTimeline` dentro de la ventana de 30 dias.

### 5.3.3 NutritionCheckinContextCard (contexto de check-in)
Componente `NutritionCheckinContextCard`. Props: `recentCheckIns: NutritionCheckInLite[]` (`{ created_at, weight, energy_level }`) y `nutritionWeeklyAvgPct`.
- Construye `rows`: filtra check-ins con `weight` finito, toma los 5 mas recientes, formatea fecha y kg.
- Muestra la lista peso/fecha (autodeclarado por el alumno) y la adherencia semanal (~%).
- **Aviso cruzado** via `coachCheckinNutritionCaution(weightsKgNewestFirst, weeklyNutritionAdherencePct)` (`nutrition-checkin-coach-copy.ts`): si hay ≥2 pesos, el delta (anterior − reciente) ≥ 1.5 kg y la adherencia semanal < 38 ⇒ muestra una nota ambar sugiriendo revisar deficit/hambre/sostenibilidad. No es diagnostico medico, es seguimiento operativo. Solo display, no muta.

### 5.3.4 ClientFoodRestrictionsCard (restricciones/alergias)
Componente `ClientFoodRestrictionsCard` (props `clientId`, `coachId`). Va siempre que el dominio este ON (no usa `showSection`; ya queda oculto por el early-return de dominio). Es self-contained con su propia carga y busqueda:
- **Al montar:** `getClientFoodRestrictions(clientId)` (`nutrition-coach.actions.ts:1309`) → lee `client_food_preferences` (con join `foods(name)`) filtrando `preference_type IN ('dislike','allergy','intolerance')`. Valida propiedad coach↔alumno (`coachOwnsClient`) antes de devolver.
- **Tres tipos:** `allergy` (Alergia), `intolerance` (Intolerancia), `dislike` (No le gusta), seleccionables con radiogroup.
- **Busqueda de alimentos:** input con debounce (300ms, ≥2 chars) → `searchCoachFoodLibrary(coachId, { search, pageSize:20, page:0 })`. Marca "Ya marcado" los que estan en `restrictedIds`.
- **Agregar (`add`):** optimista (actualiza UI primero) → `setClientFoodRestriction({ clientId, foodId, preferenceType })`.
- **Quitar (`remove`):** optimista → `setClientFoodRestriction({ clientId, foodId, preferenceType: null })`.
- **Backend `setClientFoodRestriction`** (`:1342`): valida coach↔alumno; si `preferenceType === null` hace `delete` de la fila; si no, `upsert` por `onConflict: 'client_id,food_id'`. Solo toca `client_food_preferences`; **no toca el plan ni borra datos**. `revalidatePath` de la ficha.
- **Efecto en el builder (A2/A3):** estas marcas las respeta el PlanBuilder al armar el plan (advierte "no le gusta", bloquea alergia con override).

### 5.3.5 Conversacion de nutricion · hoy (comentarios por comida, bidireccional)
Solo si `showSection('notes')`. Componente `NotesThread` (`currentRole="coach"`). Mapea `coachMealComments` (prop, filas del dia de hoy) a `NotesThreadComment` (`{ id, author_role: 'coach'|'client', body, created_at }`). Hilo **visible para el alumno**.
- **Responder (`handleCoachReply`):** llama **`addCoachMealComment({ clientId, logDate: santiagoTodayIso, body })`** (`nutrition-notes.actions.ts`).
  - Schema Zod: requiere `mealLogId` **o** `logDate` (aca se ancla al dia de hoy), body 1–2000 chars.
  - Backend `NutritionNotesService.addMealComment`: `author_id` = uid de sesion (`getClaims`), `author_role='coach'`; inserta en `nutrition_meal_comments` (`client_id`, `meal_log_id` null, `log_date`, `body`). RLS coach↔alumno. `revalidatePath`.
- **Query de carga (RSC):** `getCoachMealComments(clientId, logDate)` → `listMealComments` lee `nutrition_meal_comments` por `client_id` + `log_date`, orden cronologico.

### 5.3.6 CoachNutrientTargetsEditor (editor de objetivos de nutrientes / umbrales de micros)
Solo si `showMicros`. Componente `CoachNutrientTargetsEditor` (props `clientId`, `initial: NutrientTargetRow[]`, `proEnabled: nutritionProEnabled`).

**Que se setea:** por cada nutriente, hasta tres umbrales: **Piso** (`floor`), **Meta** (`target`), **Techo** (`ceiling`), segun el `intent`:
- `intent='cap'` (Tope): se editan `target` + `ceiling`.
- `intent='aimup'` (Meta): se editan `floor` + `target`.

**Catalogo:**
- **Base** (todos los coaches, `BASE_NUTRIENTS`): `sodium_mg` (Sodio, cap), `fiber_g` (Fibra, aimup).
- **Avanzado** (solo con `proEnabled` / Nutricion Pro = modulo `nutrition_exchanges`, `PRO_NUTRIENTS`): `sugar_g` (Azucar, cap), `saturated_fat_g` (Grasa saturada, cap), `unsaturated_fat_g` (Grasa insaturada, aimup). Si `!proEnabled` muestra hint de upsell.

`initial` puede traer la fila especifica del alumno **y** el default del coach (`client_id` null); `initialByKey` prioriza la fila del alumno por nutriente. Cada nutriente muestra un preview con `NutrientRangeBar` (color + palabra + icono + posicion, color nunca es senal unica).

**Como guarda (`handleSave` → server action):** llama **`upsertClientNutrientTarget({ clientId, nutrientKey, floorValue, targetValue, ceilingValue, intent, provenance:'manual' })`** (`nutrient-targets.actions.ts`).
- Valida con Zod (`UpsertNutrientTargetSchema`): exige al menos un umbral no nulo.
- `coachId` = uid de sesion (`getClaims`), nunca del body.
- **Gate Pro server-side** `assertProNutrientAllowed`: para los `PRO_NUTRIENT_KEYS` (`sugar_g`/`saturated_fat_g`/`unsaturated_fat_g`) lee `clients(team_id, org_id, coach_id)`; si `org_id` ⇒ rechaza; arma ctx (team manda, si no el coach) y exige `hasModule(supabase, 'nutrition_exchanges', ctx)`. Fail-closed. Los base nunca se gatean.
- Backend `NutrientTargetsService.upsertNutrientTarget(coachId, …)`: busca fila viva por `(coach_id, client_id, nutrient_key)` (null-safe en client_id) y hace `update` o `insert` en `nutrient_targets` (`floor_value`, `target_value`, `ceiling_value`, `intent`, `provenance`, `updated_at`). RLS hace cumplir coach↔alumno. `revalidatePath` de la ficha.
- **Query de carga (RSC):** `getCoachNutrientTargets(clientId)` → `listNutrientTargets(coachId, clientId)` lee `nutrient_targets` del coach con `client_id.eq.<id>` OR `client_id.is.null` (targets del alumno + defaults del coach), ordenado por `nutrient_key`.

### 5.3.7 CoachPrivateNotesPanel (nota privada del coach)
Componente `CoachPrivateNotesPanel` (props `clientId`, `notes: PrivateNoteRow[]`). Va siempre (no gateado por showSection). **El alumno NUNCA la ve** (tabla `nutrition_private_notes`, RLS coach-scoped). Hay **una nota viva por par coach↔alumno**:
- `latest = notes[0]`; el textarea precarga su `body` (max 5000 chars). Debajo lista las versiones anteriores (`notes.slice(1)`).
- **Guardar (`handleSave`):** llama **`upsertCoachPrivateNote({ clientId, body })`** (`nutrition-notes.actions.ts`).
  - Zod: body 1–5000 chars no vacio. `coachId` = uid de sesion.
  - Backend `NutritionNotesService.upsertPrivateNote(coachId, clientId, body)`: no hay UNIQUE en la tabla ⇒ find-then-update/insert (busca la mas reciente por `updated_at` y la actualiza, o inserta nueva) en `nutrition_private_notes`. RLS coach-scoped. `revalidatePath`.
  - **Query de carga (RSC):** `getCoachPrivateNotes(clientId)` → `listPrivateNotes` lee `nutrition_private_notes` por `client_id` ordenado por `updated_at` desc.

### 5.3.8 NutritionCycleHistorySection (ciclos del plan + restaurar version)
Componente `NutritionCycleHistorySection` (props `coachId`, `clientId`, `planId`, `santiagoTodayIso`, `activeCycle`, `templates`, `historyEntries`). Si `!planId` no renderiza. Dos sub-funciones:

**Ciclo de dieta** (organizar el plan por fases semanales, cada una con su plantilla):
- Muestra el ciclo activo (`activeCycle`) con nombre, fecha de inicio, y un preview calculado con `resolveNutritionCycleBlockForDate(start_date, blocks, santiagoTodayIso)`: en que semana del ciclo va el alumno hoy y a que bloque/plantilla corresponde (o aviso "sin bloque para esta semana").
- Boton "Definir/Editar ciclo" abre un `Dialog` con form: Nombre, Fecha inicio, y N bloques (`formBlocks`), cada bloque = rango de semanas (`week_start`–`week_end`), `label`, y `template_id` (Select de `templates`). Botones para agregar/quitar filas.
- **Guardar (`saveCycle`):** arma `NutritionPlanCycleUpsertInput` (`is_active: true`) y llama **`upsertNutritionPlanCycle(coachId, clientId, payload)`** (`nutrition-coach.actions.ts:1170`).
  - Backend: valida scope + propiedad del alumno; Zod (`nutritionPlanCycleUpsertSchema`); si `is_active` **desactiva** los demas ciclos del alumno; hace `update` (si trae `id`) o `insert` en `nutrition_plan_cycles` (`coach_id`, `client_id`, `name`, `start_date`, `blocks` JSON, `is_active`). Revalida paths de nutricion del alumno.
  - `router.refresh()` al exito.

**Historial del plan (autosave) + Restaurar version:**
- Solo si hay `historyEntries`. Lista entradas (`label` o fecha) con boton "Restaurar". Tooltip: cada vez que se guarda el plan se guarda una copia previa; restaurar reaplica comidas y metas y **conserva los logs de adherencia existentes**.
- **Restaurar (`restore`):** AlertDialog de confirmacion → **`restoreClientNutritionPlanFromHistory(coachId, clientId, historyRestoreId)`** (`:1108`).
  - Backend: valida scope + propiedad; lee `nutrition_plan_history` (`nutrition_plan_id`, `snapshot`, `client_id`) por id+coach+cliente; verifica que el plan pertenece al workspace; valida el `snapshot` con `ClientPlanSchema`; si pasa, llama `upsertClientNutritionPlanJson(coachId, clientId, {...})` reaplicando name/calorias/macros/instructions y meals+foodItems (con swap_options). Esto **sobrescribe el plan actual y crea otra entrada en el historial** con el estado previo a restaurar.
  - `router.refresh()` al exito.

### 5.3.9 Habitos del dia (card opcional)
Solo si `showSection('habits')` y hay `habitsForDate` con al menos un valor. `habitsForDate` se carga en runtime: al montar `getClientHabitsForDate(clientId, santiagoTodayIso)`, y al cambiar de fecha en el navegador del historial. Muestra Agua (`water_ml`, formato L/ml), Pasos, Sueno (`sleep_hours`), Ayuno (`fasting_hours`), Suplementos (lista) y Nota del alumno (`notes`). Datos registrados por el alumno desde su app. Solo display.

---

## 5.4 Detalle (colapsado por defecto)

Dos `DetailAccordion` (cerrados por defecto, para no montar graficos pesados):

**"Detalle · graficos densos" (`detailCharts`):**
- Pie "Macros meta (kcal)" (`macroMetaPieDetail`): distribucion porcentual de las calorias del plan (`pieData` = pCal/cCal/fCal).
- "Objetivo kcal vs adherencia" (`chartRows`, ultimos 30 de `nutritionTimeline`): barras = `target_calories`, linea = `compliancePct`, banda de referencia 80–100%.
- "Consumido hoy (kcal por macro)" (`pieConsumed`): solo si `hasTodayNutritionLog`.

**"Detalle · historial de logs" (`detailHistory`):**
- "Ultimo dia registrado": comida por comida del log mas reciente (completada/no), con macros estimados.
- "Historial de logs (30)" (`logRowsDesc`): tabla por dia (Fecha, Plan, Obj. kcal, Cons. kcal, Adherencia %, Comidas done/total); resalta filas <60%.
- "Ver dia especifico": `DayNavigator` (estado `historyDate`, `activityDates` cargado con `getClientNutritionActivityDates(clientId)`). Al cambiar fecha (`handleHistoryDateChange`): si no es hoy, `getClientNutritionForDate(clientId, date)` y renderiza `NutritionDayReadOnly` (solo lectura: resumen de macros consumidos calculados con `calculateFoodItemMacros`, lista de comidas con estado, y **swaps aplicados** desde `nutrition_meal_food_swaps`: alimento original → alternativa con cantidad).

---

## 5.5 Resumen de fuentes/efectos backend (Zona Nutricion)

| Accion UI | Server action / query | Tabla(s) | Efecto |
|-----------|----------------------|----------|--------|
| Copiar plan a otro alumno | `duplicatePlanToClient` | `nutrition_plans`, `nutrition_meals`, `food_items` | Inserta plan CUSTOM clonado al destino; desactiva su plan previo (logs intactos) |
| Restricciones (cargar) | `getClientFoodRestrictions` | `client_food_preferences` + `foods` | Lee allergy/intolerance/dislike del alumno |
| Restriccion (set/clear) | `setClientFoodRestriction` | `client_food_preferences` | Upsert/delete por (client_id, food_id); el builder lo respeta |
| Buscar alimentos | `searchCoachFoodLibrary` | catalogo de alimentos del coach | Lee resultados para marcar |
| Conversacion (cargar) | `getCoachMealComments` | `nutrition_meal_comments` | Lee comentarios del dia |
| Conversacion (responder) | `addCoachMealComment` | `nutrition_meal_comments` | Inserta comentario author_role='coach' anclado a logDate |
| Umbrales micros (cargar) | `getCoachNutrientTargets` | `nutrient_targets` | Lee targets del alumno + defaults del coach |
| Umbrales micros (guardar) | `upsertClientNutrientTarget` | `nutrient_targets` | Upsert floor/target/ceiling; gate Pro server-side para azucar/grasas |
| Nota privada (cargar) | `getCoachPrivateNotes` | `nutrition_private_notes` | Lee notas privadas del coach (el alumno no las ve) |
| Nota privada (guardar) | `upsertCoachPrivateNote` | `nutrition_private_notes` | Find-then-update/insert (1 viva por par) |
| Ciclo (guardar) | `upsertNutritionPlanCycle` | `nutrition_plan_cycles` | Upsert; desactiva otros ciclos si is_active |
| Restaurar version | `restoreClientNutritionPlanFromHistory` | `nutrition_plan_history` → reaplica plan | Sobrescribe plan, conserva logs, crea entrada de historial |
| Override de Funciones | `ClientFeaturePrefsPanel` (sus actions) | `client_feature_prefs` | Muestra/oculta secciones SOLO para este alumno |
| Habitos / dia historico | `getClientHabitsForDate`, `getClientNutritionForDate`, `getClientNutritionActivityDates` | logs de nutricion/habitos | Solo lectura |

**Invariantes clave:** `coachId`/`author_id` SIEMPRE de la sesion (`getClaims`/`getUser`), nunca del body; RLS coach↔alumno en todas las escrituras; gating de dominio/secciones es solo render (no borra datos); el gate de Nutricion Pro para micros avanzados es server-side fail-closed.


---

## Correcciones y adiciones (revision de completitud)

> Revision adversarial 2: refinamientos verificados contra el codigo. No cambian la arquitectura; precisan detalles para el rediseno.

### [MED] ClientFoodRestrictionsCard es un acordeon colapsable con badges de conteo (no una card siempre expandida)

Agregar al inicio de 5.3.4: 'La card es un acordeon colapsable (cerrado por defecto): un boton-header togglea el estado `open`; el cuerpo (selector de tipo + busqueda + chips) solo se monta al abrir. El header muestra el icono de alerta en rojo cuando hay >=1 alergia (`allergyCount`) y un badge con el total de restricciones (`items.length`) cuando ya cargaron. La busqueda con debounce solo corre con el panel abierto.'

### [MED] Guardas/validaciones del editor de ciclo (templates vacios, quitar bloque, empty-states)

Agregar a 5.3.8 (Ciclo de dieta): 'Requiere >=1 plantilla: sin plantillas el boton se deshabilita y la card invita a crear una; `saveCycle` ademas aborta con toast si templates esta vacio. No se puede quitar el ultimo bloque (boton Quitar deshabilitado con un solo bloque). Al agregar fila, el nuevo bloque autocalcula su rango de semanas continuando el `week_end` del bloque anterior.'

### [MED] NutrientRangeBar muestra un PREVIEW de ejemplo con valor fijo, no el valor real del alumno

Corregir/precisar en 5.3.6: 'La NutrientRangeBar es un PREVIEW de ejemplo (no el consumo real del alumno): usa un `previewValue` fijo por nutriente (p.ej. sodio 1500 mg, fibra 18 g) y se rotula "Ejemplo (...)". Sirve para visualizar como caeria ese valor entre el piso/meta/techo que el coach esta editando en vivo.'

