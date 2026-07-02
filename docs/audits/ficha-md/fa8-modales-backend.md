# 8. Modales transversales, acciones y backend

Esta seccion inventaria los modales, sheets y acciones que viven dentro de la ficha del alumno (`/coach/clients/[clientId]`), junto con el backend que cada uno toca: la server action que invocan, que reciben y validan, que persisten y que `revalidatePath` disparan. Tambien describe como `ClientProfileDashboard` orquesta las pestanas y resume el modelo de datos que alimenta la ficha.

Archivos centrales:
- `apps/web/src/app/coach/clients/[clientId]/page.tsx` (RSC que arma los datos y props)
- `apps/web/src/app/coach/clients/[clientId]/ClientProfileDashboard.tsx` (orquestador client-side de tabs)
- `apps/web/src/app/coach/clients/[clientId]/_actions/client-detail.actions.ts` (server actions del detalle)
- `apps/web/src/services/client/client-detail.service.ts` (logica de aplicacion + fetch agregado)
- `apps/web/src/services/client/client.service.ts` (pagos, peso objetivo, compliance semanal)
- `apps/web/src/services/client/client-scope.service.ts` (guards de scoping coach->alumno)

---

## 8.1 Orquestacion de pestanas en `ClientProfileDashboard`

`ClientProfileDashboard` es el componente cliente (`'use client'`) que recibe `data` (el bloque completo devuelto por `getClientProfileData`) mas las props server-side de nutricion (targets, notas, comentarios, flags Pro y de dominio, override por-alumno).

**Estado de tab activa:**
- `const [activeTab, setActiveTab] = useState<ProfileMainTabId>('overview')` — el tab por defecto es `overview`.
- `const [isPending, startTransition] = useTransition()` — el cambio de tab se envuelve en `startTransition`, asi React marca la transicion como no-bloqueante y muestra un skeleton (`isPending && <div animate-pulse>...`) mientras hace el swap.
- `handleTabChange(id)` envuelve `setActiveTab(id)` dentro de `startTransition`. Es la unica via para cambiar de tab; se pasa a `ProfileTabNav` (la barra de navegacion superior) como `onChange`.
- No hay lazy/code-splitting real (no `React.lazy`/`dynamic`): TODOS los paneles de tab (`ProfileOverviewB3`, `TrainingTabB4Panels`, `NutritionTabB5`, `ProgressBodyCompositionB6`, `ProgramTabB7`, `BillingTabB8`) estan importados estaticamente arriba. El "lazy" es solo de **render condicional**: cada tab se renderiza unicamente cuando `activeTab === '<id>' && !isPending`, dentro de un `<AnimatePresence mode="wait" initial={false}>` que anima la entrada/salida (`tabMotion`, respeta `useReducedMotion`).

**Tabs disponibles (`ProfileMainTabId`):** `overview`, `progress`, `workout`, `program`, `nutrition`, `billing`.

**Badges de tab (`tabBadges: ProfileTabBadges`)** — calculados en el render y pasados a `ProfileTabNav`:
- `progress`: numero total de check-ins (`checkInTotal`) si > 0.
- `workout`: cantidad de PRs (`prCount`); si no hay PRs, cae a `data.workoutHistory.length`.
- `program`: `programTrainingDayCount` (dias con bloques que matchean la variante A/B efectiva de la semana actual, via `resolveEffectiveWeekVariant` + `workoutPlanMatchesVariant`).
- `nutrition`: `'!'` si `isNutritionAtRisk` (cumplimiento de nutricion < 60%), si no el `mealDetailCount`.
- `billing`: cantidad de pagos con `status === 'pending'` (`pendingPayments`).

**Deep-links entre tabs (scroll a zona):**
- `goToProgressHistory()` → cambia a `progress` y, en `requestAnimationFrame`, hace `scrollIntoView` al `#profile-progress-panel`. Lo usa `ProfileCheckInSnapshot` ("Ver historial en Progreso").
- `goToNutritionProgress()` → cambia a `nutrition` y hace scroll a `#nutrition-zone-a-progreso`. Lo usan `ProfileOverviewB3` y `ProfileProgramSummaryCard` (`onViewNutrition`). El comentario del codigo recalca que NO recomputa numeros, solo navega.

**Datos derivados en el cliente (no tocan backend):** el dashboard hace bastante calculo de presentacion sobre `data` ya recibida: series del grafico de peso/energia (`weightData`), 1RM estimado por ejercicio clave (`calculate1RM = weight * (1 + reps/30)`), volumen/tonelaje (`tonnageDataMap`), densidad de entrenamiento, timeline e "inteligencia forense" de nutricion (`nutritionHistory`, `accumulatedData` con diferencial calorico acumulado), `lastCheckIn`, `currentWeight`, `weeklyWeightVariation`, `topAlert` (via `getProfileTopAlert`). Todo esto es agregacion pura en memoria; el unico write desde este nivel es el formulario de peso objetivo (ver 8.3).

---

## 8.2 Server actions de `client-detail.actions.ts` (inventario completo)

El archivo `_actions/client-detail.actions.ts` es `'use server'`; sus exports son finos: en su mayoria delegan 1:1 a `client-detail.service.ts` (que tambien es `'use server'`). El detalle real de cada operacion (auth, scoping, persistencia) vive en el service. Inventario:

### `getClientProfileData(clientId)`
- **Delega a:** `getClientProfileDataService` (= `getClientProfileData` en el service, envuelto en `React.cache`).
- **Que hace:** es la consulta maestra de la ficha. Auth via `supabase.auth.getClaims()` (verificacion local del JWT ES256, sin `/user`). Si no hay usuario, `throw 'Unauthorized'`. Llama `assertCoachClientReadAccess(supabase, user.id, clientId)` que devuelve `{ orgId, viaTeam }`.
- **Que persiste:** nada (lectura). Excepcion: si `viaTeam && client.team_id`, escribe **bitacora de acceso a datos de salud** (Ley 21.719) via `logTeamClientAccess` (best-effort) con `resource: 'client_profile', action: 'view'`.
- **Devuelve:** el objeto completo de la ficha (ver 8.7).

### `addPayment(data)`
- **Recibe:** `{ client_id, amount, service_description, period_months?, payment_date, status? }`.
- **Delega a:** `addPaymentService` → `getCoachClientScope` + `addPaymentForCoach(supabase, user.id, data, scope)` (en `client.service.ts`).
- **Auth/validacion:** `supabase.auth.getUser()` (boundary de mutacion → usa `getUser`, no `getClaims`); `throw 'Unauthorized'` si no hay user. `addPaymentForCoach` llama `assertCoachCanManageClient` (verifica que el cliente exista con `coach_id = user.id`, `is_active = true` y el `org_id` del scope; si no, `throw 'Client not found in active workspace'`).
- **Persiste:** INSERT en `client_payments` con `{ ...data, coach_id }`.
- **revalidatePath:** `/coach/clients/${data.client_id}`.

### `deletePayment(paymentId, clientId)`
- **Delega a:** `deletePaymentService` → `getCoachClientScope` + `deletePaymentForCoach(supabase, user.id, paymentId, scope)`.
- **Auth/validacion:** `getUser()`; `deletePaymentForCoach` primero busca el pago por `id` + `coach_id` (si no existe → `throw 'Payment not found'`), luego revalida con `assertCoachCanManageClient` sobre `payment.client_id`.
- **Persiste:** DELETE en `client_payments` por `id` + `coach_id`.
- **revalidatePath:** `/coach/clients/${clientId}`.

### `markCheckInReviewed(clientId, checkInId)`
- **Delega a:** `markCheckInReviewedService`; ademas el wrapper en `client-detail.actions.ts` agrega `revalidatePath('/coach/clients/${clientId}')` tras el service.
- **Auth/validacion:** `getUser()` (mutacion); `assertCoachClientReadAccess`.
- **Persiste:** UPDATE en `check_ins` set `reviewed_at = now()`, `reviewed_by = user.id` filtrando `id = checkInId`, `client_id = clientId`, `is reviewed_at NULL` (idempotente: solo marca el primer review; sirve a metricas de tiempo de respuesta enterprise). Si hay error → `throw error.message`. Devuelve `{ success: true }`.

### `getWeeklyCompliance(clientId)`
- **Delega a:** `getWeeklyComplianceService` → `getWeeklyComplianceForClient(supabase, clientId)`.
- **Auth:** `getClaims()` + `assertCoachClientReadAccess` (lectura).
- **Que calcula (en `client.service.ts`):** cumplimiento semanal de los ultimos 7 dias en Santiago. Lee `workout_sessions` (>= inicio de semana), plan de nutricion activo + `daily_nutrition_logs`. Target de entrenos fijo = 4. Para nutricion, cuenta comidas planificadas aplicables por dia (`nutritionMealAppliesOnIsoYmdInSantiago`) vs `nutrition_meal_logs` completados. Devuelve `{ workoutCompliance, nutritionCompliance, workoutSessions, nutritionMealLogs, mealCompletions }` (porcentajes 0-100). No persiste.

### `getDynamicMetrics(clientId)`
- **Delega a:** `getDynamicMetricsService`. Auth: `getClaims()` + `assertCoachClientReadAccess`.
- **Lee:** ultimos 4 `check_ins` (`energy_level, weight, created_at`) + RPC `get_client_current_streak`. Devuelve `{ latestCheckIns, currentStreak }`. No persiste.

### `getClientNutritionForDate(clientId, date)`
- **Auth:** `getClaims()` + `assertCoachClientReadAccess`.
- **Lee:** una fila de `daily_nutrition_logs` por `client_id`+`log_date` con joins: `nutrition_meal_food_swaps` (con `original_food`/`swapped_food` resueltos a `foods`) y `nutrition_meal_logs` → `nutrition_meals` → `food_items` → `foods`. Es el detalle "que comio ese dia" para el coach. No persiste.

### `getClientWorkoutForDate(clientId, date)`
- **Auth:** `getClaims()` + `assertCoachClientReadAccess`.
- **Lee:** `workout_logs` cuyo `logged_at` cae en los bounds UTC del dia en Santiago (`getSantiagoUtcBoundsForDay`), con join `workout_blocks!inner` → `exercises` + `workout_plans`. Detalle "que entreno ese dia". No persiste.

### `updateClientGoalWeight(clientId, goalWeightKg)`
- **Delega a:** `updateClientGoalWeightService` → `getCoachClientScope` + `updateClientGoalWeightForCoach`.
- **Auth:** `getUser()` (mutacion). Si no hay user → devuelve `{ error: 'Unauthorized' }` (no throw).
- **Persiste:** UPDATE en `clients` set `goal_weight_kg = goalWeightKg` filtrando `id`, `coach_id` y el scope de org (`applyClientScope`). Devuelve `{ ok: true }` o `{ error }`. **No hace revalidatePath** (el cliente actualiza estado local optimista, ver 8.3).

### `getClientWorkoutActivityDates(clientId)` → `string[]`
- **Auth:** `getClaims()`; si falla `assertCoachClientReadAccess`, retorna `[]` (no throw).
- **Lee:** RPC `get_client_activity_dates(p_client_id, p_days_back: 90)` (Postgres ya devuelve dias distintos en zona Santiago). Devuelve dias YYYY-MM-DD unicos. Alimenta heatmaps/calendarios de actividad de entrenamiento.

### `getClientHabitsForDate(clientId, date)`
- **Auth:** `getClaims()`; si falla el guard, retorna `null`.
- **Lee:** una fila de `daily_habits` (`water_ml, steps, sleep_hours, fasting_hours, supplements, notes`) por `client_id`+`log_date`. Habitos del dia del alumno. No persiste.

### `getClientNutritionActivityDates(clientId)` → `string[]`
- **Auth:** `getClaims()`; si falla el guard, retorna `[]`.
- **Lee:** `daily_nutrition_logs.log_date` de los ultimos 90 dias; devuelve fechas unicas. Alimenta el calendario de actividad de nutricion.

**Patron de auth transversal:** las **lecturas** usan `getClaims()` (verificacion local del JWT, sin round-trip a GoTrue) y degradan a `[]`/`null` o `throw 'Unauthorized'`. Las **mutaciones** (`addPayment`, `deletePayment`, `markCheckInReviewed`, `updateClientGoalWeight`) usan `getUser()` por ser boundary de cambio. El scoping 3-vias (standalone / enterprise-org / team-pool) vive centralizado en `client-scope.service.ts` (`getCoachClientScope` + `assertCoachClientReadAccess`).

---

## 8.3 Editar Biometria Inicial (modal)

- **Donde:** tab `overview`, card "Metricas Clave" (col derecha). Boton lapiz (`Edit2`) abre un `Dialog` con titulo "Editar Biometria Inicial".
- **Campos:** Altura (`client.client_intake?.height_cm`) y Peso Inicial (`client.client_intake?.weight_kg`), ambos `Input` con `defaultValue` precargado.
- **Backend:** **NINGUNO.** Es un modal placeholder: los `Input` no estan controlados, no hay `onClick`/`onSubmit` en "Guardar Cambios" ni en "Cancelar", y no se importa ninguna server action para `client_intake`. Hoy no persiste. (La altura real para IMC se lee de `client.client_intake.height_cm` que viene del intake, no de este modal.)

### Peso objetivo inline (mini-form, SI persiste)
- **Donde:** tab `progress`, dentro del "Panel de Progreso Unificado". Un `<form>` con label "Objetivo (kg)", un `input number` (`goalWeightInput`) y boton "OK".
- **Flujo:** `onSubmit` parsea el valor (`parseFloat`); si `Number.isFinite && > 0` lo usa, si no `null`. Setea `isSavingGoal=true`, `await updateClientGoalWeight(client.id, newVal)`, actualiza estado local `setGoalWeight(newVal)` (optimista; el grafico de peso dibuja una `ReferenceLine` de objetivo) y `setIsSavingGoal(false)`.
- **Backend:** `updateClientGoalWeight` → UPDATE `clients.goal_weight_kg` (ver 8.2). Sin revalidatePath ni toast: la UI confia en el estado local.

---

## 8.4 Detalle / revision de check-in

### Snapshot del ultimo check-in (`ProfileCheckInSnapshot`)
- **Donde:** tab `overview`, col izquierda. Muestra el ultimo check-in: relativo de fecha, foto (front/side/back, la primera disponible), Peso, Energia (estrellas = `round(level/2)`) y Notas.
- **Modal de foto:** `Dialog` "Foto del check-in" que amplia la imagen (`object-contain`).
- **Accion "Marcar como revisado":** boton que llama `handleMarkReviewed` → `markCheckInReviewed(clientId, checkIn.id)` dentro de `startTransition`. Estado optimista: si tiene exito, `setReviewed(true)` muestra "Revisado" (CheckCircle2 verde); si falla, swallow silencioso (la UI queda sin revisar). Solo se muestra si `checkIn.id` existe y aun no esta `reviewed_at`.
- **Backend:** `markCheckInReviewed` (ver 8.2) — UPDATE `check_ins.reviewed_at`/`reviewed_by`, idempotente, con `revalidatePath`. Sirve a metricas de tiempo de respuesta enterprise.
- **"Ver historial en Progreso":** boton que llama `onViewHistory` (= `goToProgressHistory`), navega al tab `progress` (sin backend).

### Detalle de check-in en el tab Progreso (`ProgressBodyCompositionB6`)
- **Donde:** tab `progress`. Renderiza la curva de peso (AreaChart), stats (peso inicial/actual/cambio total/ritmo 30d via `linearRegressionKgPerDay`/proyeccion 4 sem), IMC (si hay `heightCm`), energia media 7d (gauge radial) y una "Linea de tiempo de check-ins".
- **Modal "Check-in" (`dotDetail`):** al hacer clic en un punto del grafico de peso o en la miniatura de la timeline, se abre un `Dialog` con peso, energia (estrellas), foto ampliada y notas. Es 100% client-side: lee de los `checkIns` ya cargados, **sin backend**.
- **Comparativa de fotos:** si hay >= 2 check-ins con `front_photo_url`, dos `<select>` (base / comparar con) + deltas de peso/energia + boton "Abrir comparativa" que monta `PhotoComparisonSlider` (slider before/after). Todo en memoria, sin backend.
- **Datos:** los `front_photo_url`/`side_photo_url`/`back_photo_url` ya vienen firmados desde el server (`resolveCheckinPhotoUrls` con service-role, porque los coaches no tienen policy de SELECT en storage).

---

## 8.5 Detalle de medicion corporal

- En la ficha "core" la composicion corporal mostrada en `ProgressBodyCompositionB6` se deriva de **check-ins** (peso, energia, fotos, IMC calculado de altura del intake), no de mediciones antropometricas dedicadas.
- Las mediciones corporales avanzadas (BIA / ISAK del modulo `body_composition`) **no viven en esta ficha**: la fila `ModuleLinksRow` (en `page.tsx`) muestra el enlace "Composicion corporal" → `/coach/clients/${clientId}/bodycomp` solo si `hasModule(supabase, 'body_composition', ctx)` es true (gate server-side por contexto del recurso: team del pool manda, si no el coach; enterprise queda fuera). Es un deep-link a otra ruta, no un modal de la ficha. La misma fila condiciona "Perfil cardio" (`/coach/cardio/...`, modulo `cardio`) y "Screening de movimiento" (`/coach/movement/...`, modulo `movement_assessment`).

---

## 8.6 Copiar plan a otro alumno · Eliminar rutina · Historial de ciclos + restaurar · Registrar pago · Acciones flotantes

### Copiar plan a otro alumno / Eliminar rutina (FUERA de la ficha)
- Estas acciones de **entrenamiento** no viven en `/coach/clients/[clientId]` ni en sus tabs. La ficha solo enlaza al **builder** para editarlas:
  - `ProgramTabB7` (tab `program`) ofrece "Editar en builder" y "Crear o asignar programa" → `/coach/builder/${clientId}`.
  - `ProfileFloatingActions` ofrece "Builder" → `/coach/builder/${clientId}`.
- La logica de copiar/clonar plan y eliminar rutina/programa reside en `apps/web/src/app/coach/builder/[clientId]/_actions/builder.actions.ts` (fuera del alcance de esta seccion del documento).

### Historial de ciclos + Restaurar (SI vive en la ficha, tab Nutricion)
- **Componente:** `NutritionCycleHistorySection`, montado dentro de `NutritionTabB5` (tab `nutrition`). Recibe `coachId`, `clientId`, `planId`, `santiagoTodayIso`, `activeCycle` (de `data.nutritionPlanCycles[0]`), `templates` (`data.nutritionTemplatesLite`) e `historyEntries` (`data.nutritionPlanHistoryEntries`). Si no hay `planId`, no renderiza nada.
- **Ciclo de dieta (definir/editar):** `Dialog` con nombre, fecha de inicio y "bloques" (rangos de semanas + etiqueta + plantilla). Muestra vista previa de en que bloque va el alumno hoy (`resolveNutritionCycleBlockForDate`). Guardar → `saveCycle` arma `NutritionPlanCycleUpsertInput` y llama `upsertNutritionPlanCycle(coachId, clientId, payload)` dentro de `startTransition`; ante exito muestra `toast.success('Ciclo guardado')`, cierra modal y `router.refresh()`; ante error `toast.error(res.error)`.
  - **Backend `upsertNutritionPlanCycle`** (`nutrition-coach.actions.ts`): `requireCoachNutritionScope(coachId)`, valida con `nutritionPlanCycleUpsertSchema` (Zod), verifica que el cliente pertenezca al workspace activo (`coach_id` + `applyOrgScope`). Si `is_active`, desactiva los otros ciclos del cliente (`update is_active=false`). Luego UPDATE (si trae `id`) o INSERT en `nutrition_plan_cycles` con `{ coach_id, client_id, name, start_date, blocks(JSON), is_active, updated_at }`. `revalidateClientNutritionPaths(coachId, clientId)` + `revalidatePath('/coach/nutrition-plans')`. Devuelve `{ success, cycleId }`.
- **Historial del plan (autosave) + Restaurar:** lista las `historyEntries` (label o fecha). "Restaurar" abre un `AlertDialog` de confirmacion; al confirmar, `restore()` llama `restoreClientNutritionPlanFromHistory(coachId, clientId, historyRestoreId)`; ante exito `toast.success('Plan restaurado desde el historial')` + `router.refresh()`.
  - **Backend `restoreClientNutritionPlanFromHistory`:** `requireCoachNutritionScope`, valida cliente y plan en el workspace activo, lee la fila de `nutrition_plan_history` (por `id`+`coach_id`+`client_id`), valida el `snapshot` con `ClientPlanSchema` (Zod), y reaplica via `upsertClientNutritionPlanJson` (reescribe nombre, macros, instrucciones y comidas/foodItems del plan `nutrition_plan_id`). La reconciliacion de comidas conserva los logs de adherencia existentes (invariante de `reconcileMeals`). Devuelve `{ success, error? }`.

### Registrar pago / eliminar pago (`BillingTabB8`, tab Billing)
- **Modal "Registrar pago":** boton "Nuevo pago" abre un `Dialog` con campos Monto (number, CLP), Fecha (date, default hoy), Concepto (texto) y Meses (number, opcional, para estimar renovacion).
- **Validacion cliente (`onAddPayment`):** monto finito y > 0; fecha presente; concepto no vacio; periodo en meses vacio o numero >= 1. Setea `formError` con mensajes en español si falla.
- **Submit:** dentro de `startAddTransition`, `await addPayment({ client_id, amount: round, payment_date, service_description, period_months, status: 'paid' })`; al exito cierra modal, resetea form y `router.refresh()`; al fallo setea `formError` generico.
- **Backend `addPayment`** (ver 8.2): INSERT en `client_payments` + `revalidatePath('/coach/clients/${client_id}')`.
- **Eliminar pago:** boton papelera por fila → `window.confirm('¿Eliminar este pago del historial?')`; si confirma, `startDeleteTransition(async () => { await deletePayment(p.id, clientId); router.refresh() })`.
- **Backend `deletePayment`** (ver 8.2): DELETE en `client_payments` + `revalidatePath`.
- **Resumenes (solo lectura, calculados en cliente):** Total cobrado (suma de pagos `paid`/`pagado`/`completed`), Ultimo pago (fecha relativa) y Proxima renovacion estimada (`addMonths(ultimoPago, period_months)`).

### Acciones flotantes (`ProfileFloatingActions`)
- **Donde:** boton flotante (FAB con `+`) visible solo en mobile (`print:hidden md:hidden`), abajo a la derecha. Al abrir despliega hasta 3 accesos:
  - **WhatsApp:** solo si `clientPhone` produce >= 10 digitos (`digitsForWhatsApp`); link `https://wa.me/<digitos>` en nueva pestana. Sin backend.
  - **Check-in alumno:** solo si hay `coachSlug`; link a `/c/${coachSlug}/check-in` (la app del alumno) en nueva pestana. Sin backend.
  - **Builder:** link a `/coach/builder/${clientId}`. Sin backend.
- Es navegacion pura: no invoca server actions. El telefono y el slug salen de `data.client.phone` y `client.coaches.slug`.

---

## 8.7 Modelo de datos que alimenta la ficha (resumen)

Todo lo que ve la ficha proviene de **un solo** fetch maestro `getClientProfileData(clientId)` (`React.cache`, en `client-detail.service.ts`), mas un segundo bloque de props de nutricion resueltas en `page.tsx`. El service ejecuta consultas en paralelo (`Promise.all`) y agrega.

**Consultas base (paralelas):**
- `clients` (+ `client_intake (*)`, `coaches ( slug )`) — scoped por workspace (standalone excluye org+team; team deja que RLS filtre; enterprise filtra `coach_id`+`org_id`).
- `workout_programs` activo (+ `workout_plans` → `workout_blocks` → `exercises`), limit 2.
- `nutrition_plans` activos (`id, is_active`) y aparte el plan activo completo (`nutrition_plans` → `nutrition_meals` → `food_items` → `foods`).
- `check_ins` (todos, orden desc) — fotos firmadas con service-role (`resolveCheckinPhotoUrls`).
- `workout_plans` historicos (ventana de 548 dias, ~18 meses) con `workout_blocks` → `exercises` + `workout_logs` (corta el full-scan que causo el incidente Supabase 2026-06-12).
- `client_payments` (todos, orden por `payment_date`).
- `daily_nutrition_logs` (ventana ~40 dias) + `nutrition_meal_logs` → `nutrition_meals`.
- `workout_sessions` (ultimos 14 dias).
- `daily_nutrition_logs` de hoy (compliance del dia).
- RPC `get_client_current_streak`.

**Agregaciones server-side (no JS sobre miles de filas):**
- RPC `get_client_exercise_prs` → `mapExercisePrsRpc` → `personalRecords` (PR de peso maximo por ejercicio, orden desc). El mapper vive en `profileDataHelpers.ts`.
- RPC `get_client_muscle_volume(p_days_back: 30)` → `mapMuscleVolumeRpc` → `muscleVolumeByGroup` (Σ peso×reps por grupo, orden desc). `profileDataHelpers.ts` tambien conserva `buildPersonalRecordsFromLogs`/`buildMuscleVolumeFromLogs` (version JS de respaldo con la misma forma de salida).

**Calculos de aplicacion en el service:**
- Nutricion: motor canonico `computeNutritionAdherence` (cumplimiento de hoy), `calculateConsumedMacrosWithCompletionFallback` con `portionPctMapFromMealLogs` (macros consumidos por dia y de hoy), `nutritionLogsEnriched`, `nutritionAdherence30d`, `nutritionMonthlyAvgPct`, `nutritionStreakDays` (racha de dias con >= 80%), promedios semanal/previo.
- Entrenamiento: `weeklyWorkoutTarget` (dias con bloques en la variante A/B efectiva), `completedWorkoutsCount`/`...PrevWeek` (de `workout_sessions`, o fallback a dias unicos con `workout_logs`).
- Programa: `planCurrentWeek`/`planTotalWeeks`/`planDaysRemaining` (de `start_date`/`end_date`/`weeks_to_repeat`).
- Check-in: `checkInCompliancePercent` (regularidad via `checkInRegularityPercentAsOf`).
- `attentionScore` via `calculateAttentionScore` (de `dashboard.service`) con last check-in/workout, programa activo, cumplimiento nutricion, dias restantes.
- `profileLastActivityAt` (max entre `client.updated_at`, ultimo `workout_log`, ultimo check-in).

**Bloque adicional (paralelo):** `client_food_preferences` (favoritos), `nutrition_plan_cycles` (ciclos del cliente), `nutrition_plan_templates` (plantillas lite del coach), y `nutrition_plan_history` (ultimas 20 versiones del plan activo).

**Props de nutricion resueltas en `page.tsx`** (no en el service): `getCoachNutrientTargets`, `getCoachPrivateNotes`, `getCoachMealComments` (anclado a hoy), `resolveNutritionProEnabled` (modulo `nutrition_exchanges`), `resolveNutritionDomainEnabled`, `resolveFeaturePrefs` (flags por seccion entitled AND wanted) y `resolveClientFeaturePrefsOverrideContext` (panel "Funciones para este alumno"). Estas gobiernan que zonas de la nutricion ve el coach (igual que ve el alumno) y los umbrales de micros avanzados.

---

## 8.8 Resumen de que se guarda con optimistic / toast / revalidate

| Accion | Optimistic UI | Toast | revalidatePath / refresh | Persiste |
|---|---|---|---|---|
| Peso objetivo inline | Si (`setGoalWeight`) | No | No (estado local) | `clients.goal_weight_kg` |
| Marcar check-in revisado | Si (`setReviewed(true)`, swallow en error) | No | `revalidatePath('/coach/clients/[id]')` | `check_ins.reviewed_at/reviewed_by` |
| Registrar pago | No (usa `router.refresh()`) | No (`formError` inline) | `revalidatePath` (server) + `router.refresh()` | INSERT `client_payments` |
| Eliminar pago | No (`window.confirm` + `router.refresh()`) | No | `revalidatePath` (server) + `router.refresh()` | DELETE `client_payments` |
| Guardar ciclo de dieta | No (`router.refresh()`) | Si (`toast.success/error`) | `revalidateClientNutritionPaths` + `/coach/nutrition-plans` + `router.refresh()` | UPSERT `nutrition_plan_cycles` |
| Restaurar plan del historial | No (`AlertDialog` + `router.refresh()`) | Si (`toast.success/error`) | via `upsertClientNutritionPlanJson` | reescribe `nutrition_plans`/`nutrition_meals` (conserva logs) |
| Editar biometria inicial | — | — | — | NO persiste (placeholder) |
| Acciones flotantes (WA / check-in / builder) | — | — | — | NO persiste (navegacion) |
| Detalle check-in / medicion (modales lectura) | — | — | — | NO persiste (lectura en memoria) |

**Notas de patron:** los toasts (`sonner`) solo se usan en el modulo de nutricion (ciclos/restaurar). Pagos y check-in usan errores inline / swallow + `router.refresh()`. El unico write con optimistic verdadero (estado local sin refetch) es el peso objetivo. Todas las mutaciones pasan por las server actions de `_actions/client-detail.actions.ts` (ficha core) o `_actions/nutrition-coach.actions.ts` (ciclos/restaurar), siempre con guard de scoping coach->alumno antes de tocar la DB.
