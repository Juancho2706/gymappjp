# 1. Estructura, carga de datos, hero y navegacion

> Alcance: la **ficha del alumno** (vista del coach) — la pantalla en `/coach/clients/[clientId]` que concentra TODA la informacion de un alumno. Cubre la pagina raiz, el guard de acceso, la carga central `getClientProfileData`, las 6 pestanas, el hero, el banner de alerta superior, las acciones flotantes y las rutas de entrada/salida.

---

## 1.1 Que es la ficha del alumno

La ficha es la pantalla integral que ve el **coach** sobre un alumno concreto. Es un RSC (`ClientProfilePage`) que arma 3 zonas:

1. Barra superior (no se imprime): boton "Atras" a `/coach/clients` y boton "Exportar PDF".
2. El **hero** (`ClientProfileHero`) con identidad + metricas clave + acciones.
3. La fila de **accesos a modulos de pago** (`ModuleLinksRow`).
4. El **dashboard de pestanas** (`ClientProfileDashboard`) con las 6 pestanas y las acciones flotantes (`ProfileFloatingActions`).

Toda la data viene de **una sola carga server-side** (`getClientProfileData`) mas un puñado de queries adicionales para la zona de nutricion del coach. El cliente (`ClientProfileDashboard`) recibe `data` como `any` y calcula derivados en el navegador (graficos, 1RM, badges).

### Archivos involucrados

| Archivo | Rol |
|---|---|
| `apps/web/src/app/coach/clients/[clientId]/page.tsx` | RSC raiz: barra atras/PDF, carga central, hero, fila de modulos, dashboard |
| `_actions/client-detail.actions.ts` | Capa `'use server'`: re-exporta server actions desde el service |
| `services/client/client-detail.service.ts` | Logica real: `getClientProfileData` + todas las queries/calculos |
| `services/client/client-scope.service.ts` | Guards de scoping coach→alumno (`assertCoachClientReadAccess`, `getCoachClientScope`) |
| `ClientProfileDashboard.tsx` | Cliente: tabs, graficos, badges, modal biometria |
| `ProfileTabNav.tsx` | Navegacion de las 6 pestanas |
| `ClientProfileHero.tsx` | Cabecera de identidad + 5 chips de metricas + acciones |
| `ProfileTopAlertBanner.tsx` + `getProfileTopAlert.ts` | Banner de alerta determinista en Overview |
| `ProfileFloatingActions.tsx` | FAB de acciones rapidas (solo mobile) |
| `profileDataHelpers.ts` | Mappers puros de PRs y volumen muscular (RPC → forma del front) |
| `profileOverviewUtils.ts` | Helpers de labels y agregados (edad entreno, actividad relativa, regularidad check-in) |

---

## 1.2 Guard de acceso (autenticacion + scoping)

El control de acceso esta en `getClientProfileData` (`client-detail.service.ts`) y se delega a `client-scope.service.ts`:

1. **Identidad:** `supabase.auth.getClaims()` lee el `sub` del JWT (verificacion local ES256, sin round-trip a `/user`). Si no hay usuario → `throw new Error("Unauthorized")`.
2. **Scoping 3-vias:** `assertCoachClientReadAccess(supabase, user.id, clientId)` resuelve el **workspace activo** del coach via `resolvePreferredWorkspace` y devuelve `{ orgId, activeTeamId, viaTeam }`:
   - **Team (pool):** si hay `activeTeamId`, valida que el alumno pertenezca a ese `team_id` (no filtra por `coach_id` — cualquier miembro del pool accede). Si existe → `viaTeam: true`.
   - **Enterprise:** `coach_id = userId` + `org_id = scope.orgId`.
   - **Standalone:** `coach_id = userId` + `org_id IS NULL` + `team_id IS NULL` (excluye pool y org).
   - Si no encuentra fila → `throw new Error('Client not found')`.

La query principal del cliente **repite** ese filtro de scope (defensa en profundidad): para no-team agrega `.eq('coach_id', user.id)` + `org_id`/`team_id` segun corresponda; para team deja que la RLS sea el techo.

**Bitacora de salud (Ley 21.719):** si el acceso es `viaTeam` y el alumno tiene `team_id`, llama `logTeamClientAccess` (recurso `client_profile`, accion `view`, metadata con `full_name`). Best-effort, solo para pools.

---

## 1.3 Carga central — `getClientProfileData(clientId)`

Es una funcion `cache`-ada (`react.cache`) que dispara las queries en paralelo (`Promise.all`) y luego computa derivados. **Entidades y campos que trae:**

### Alumno y biometria
- **`clients`** (`select *`) + relaciones anidadas:
  - `client_intake (*)` — biometria inicial (`height_cm`, `weight_kg`, etc.).
  - `coaches ( slug )` — para construir deep-links al app del alumno.
- Tras la carga, `client.coach_id`, `client.team_id`, `client.org_id` se usan para gatear modulos y feature-prefs.

### Programa de entrenamiento activo (`activeProgram`)
- **`workout_programs`** con `is_active = true`, orden `created_at` DESC, `limit(2)`. Anida:
  - `workout_plans (id, title, day_of_week, week_variant, ...)`
  - cada plan → `workout_blocks (id, exercise_id, order_index, sets, reps, rest_time, notes, target_weight_kg, tempo, rir)`
  - cada bloque → `exercises (id, name, muscle_group, gif_url, video_url)`
- Se toma `activePrograms[0]` como `activeProgram`.

### Planes de nutricion
- **`nutrition_plans`** (solo `id, is_active`, `is_active = true`) → `nutritionPlans` (se usa para sacar `activeNutritionPlanIds`).
- **Plan activo completo** (`activeNutritionPlanWithMeals` / `activeNutritionPlanFull`): `nutrition_plans (*)` con `is_active = true`, anidando `nutrition_meals (*) → food_items (*) → foods (*)`, ordenado por `order_index` de las comidas. `limit(1).maybeSingle()`.

### Check-ins
- **`check_ins`** (`select *`, orden `created_at` DESC) → `checkIns`. Antes de retornarlos, **firma las URLs de fotos** con `resolveCheckinPhotoUrls(createServiceRoleClient(), checkIns)` (bucket privado; el coach no tiene SELECT de storage, por eso usa service-role).

### Historial de entrenamiento (`workoutHistory`)
- **`workout_plans`** con ventana de **548 dias (~18 meses)** sobre `assigned_date` (corta el full-scan que saturaba memoria). Trae `workout_blocks (id, exercise_id, order_index, section, superset_group, target_weight_kg, reps, sets) → exercises (id, name, muscle_group)` y `workout_logs (id, set_number, weight_kg, reps_done, rpe, logged_at)`.

### Logs de nutricion (`nutritionLogs`)
- **`daily_nutrition_logs`** ventana de **40 dias**, anidando `nutrition_meal_logs (id, meal_id, is_completed, consumed_quantity) → nutrition_meals (name, order_index, day_of_week)`.

### Pagos (`payments`)
- **`client_payments`** (`select *`, orden `payment_date` DESC). Casteado a `any` porque la tabla no esta en los tipos generados.

### Compliance del dia / semana (queries auxiliares)
- **`workout_sessions`** ultimos 14 dias (`date_completed`).
- **`daily_nutrition_logs`** del dia de hoy (`mealCompletions`, `maybeSingle`).
- RPC **`get_client_current_streak`** (`p_client_id`) → racha actual.

### PRs y volumen muscular (RPC, no JS)
- RPC **`get_client_exercise_prs`** → `personalRecords` via `mapExercisePrsRpc` (mappers en `profileDataHelpers.ts`: 1 fila por ejercicio, peso max, orden DESC).
- RPC **`get_client_muscle_volume`** (`p_days_back: 30`) → `muscleVolumeByGroup` via `mapMuscleVolumeRpc` (Σ peso×reps por grupo, 30d).

### Detalle de comidas (`mealDetails`)
- Si hay planes de nutricion activos: **`nutrition_meals`** de esos planes con `food_items (quantity, unit, swap_options) → foods (name, calories, protein_g, carbs_g, fats_g)`, orden `order_index`.

### Datos de nutricion extra
- **`client_food_preferences`** (`preference_type = 'favorite'`) → `clientFavoriteFoods` (`{ id, name }`).
- **`nutrition_plan_cycles`** del coach+alumno → `nutritionPlanCycles`.
- **`nutrition_plan_templates`** del coach → `nutritionTemplatesLite`.
- **`nutrition_plan_history`** del plan activo (limit 20) → `nutritionPlanHistoryEntries`.

### Calculos derivados que retorna
- **`compliance`**: `workoutsThisWeek`, `workoutsPrevWeek`, `workoutsTarget` (dias de la variante A/B efectiva de la semana), `nutritionCompliancePercent` (motor canonico `computeNutritionAdherence` para hoy), `nutritionWeeklyAvgPct` / `nutritionPrevWeeklyAvgPct`, `todayMealsDone`, `todayMealsTotal`, `currentStreak`, `planCurrentWeek`, `planTotalWeeks`, `planDaysRemaining`, `checkInCompliancePercent` (+ `WeekAgo`).
- **`nutritionLogsEnriched`**: cada log con macros consumidos reales (`calculateConsumedMacrosWithCompletionFallback` + mapa de porciones).
- **`nutritionAdherence30d`**, **`todayConsumedMacros`**, **`hasTodayNutritionLog`**, **`nutritionStreakDays`** (dias consecutivos con ≥80% hacia atras, max 120), **`nutritionMonthlyAvgPct`**.
- **`attentionScore`**: via `calculateAttentionScore` (dashboard.service): suma puntos por SIN_CHECKIN_1M (+25), SIN_EJERCICIO_7D (+25), NUTRICION_RIESGO <60% (+20), PROGRAMA_VENCIDO (+15) / POR_VENCER (+8), FUERZA_CAYENDO oneRMDelta<-5 (+15). Aqui `oneRMDelta` se pasa `null`.
- **`profileLastActivityAt`**: max entre `client.updated_at`, ultimo `logged_at` de workout y ultimo `created_at` de check-in.
- **`todayIso`**: fecha de hoy en Santiago.

### Modulos cardio / movement / bodycomp
La carga central **NO** trae datos de esos modulos. El gate de los **accesos** se resuelve aparte en `page.tsx` (`ModuleLinksRow`, ver 1.7) leyendo `clients (team_id, org_id, coach_id)` y consultando `hasModule(...)` por contexto del recurso. Los datos de cada modulo viven en sus propias rutas (`/coach/cardio/[id]`, `/coach/movement/[id]`, `/coach/clients/[id]/bodycomp`).

### Server actions complementarias (mismo service, via `_actions/client-detail.actions.ts`)
`addPayment`, `deletePayment`, `markCheckInReviewed` (set `reviewed_at`/`reviewed_by` + `revalidatePath`), `getWeeklyCompliance`, `getDynamicMetrics` (ultimos 4 check-ins + streak), `getClientNutritionForDate`, `getClientWorkoutForDate`, `updateClientGoalWeight`, `getClientWorkoutActivityDates` (RPC `get_client_activity_dates`, 90d), `getClientHabitsForDate` (tabla `daily_habits`), `getClientNutritionActivityDates` (90d). Todas re-validan acceso con `getClaims` + `assertCoachClientReadAccess` (las de escritura usan `getUser` + `getCoachClientScope`).

---

## 1.4 Las 6 pestanas (`ProfileTabNav`)

Definidas en `ProfileTabNav.tsx`, constante `TABS`. **Orden y nombres reales:**

| # | `id` | Label visible | Icono | Componente que renderiza |
|---|---|---|---|---|
| 1 | `overview` | **Overview** | `LayoutDashboard` | bloque inline (alerta + `ProfileOverviewB3` + `ProfileProgramSummaryCard` + `ProfileCheckInSnapshot` + miniaturas check-in + "Metricas Clave") |
| 2 | `progress` | **Progreso** | `TrendingUp` | `ProgressBodyCompositionB6` + "Panel de Progreso Unificado" (7 graficos) |
| 3 | `workout` | **Analisis** | `BarChart2` | `TrainingTabB4Panels` + Records de peso + Volumen 30d |
| 4 | `program` | **Plan** | `LayoutGrid` | `ProgramTabB7` |
| 5 | `nutrition` | **Nutricion** | `Apple` | `NutritionTabB5` |
| 6 | `billing` | **Facturacion** | `CreditCard` | `BillingTabB8` |

> Nota de mapeo respecto a B3-B8: el `id` interno **no** coincide 1:1 con el orden visual. `overview`=B3, `workout`/Analisis=B4, `nutrition`/Nutricion=B5, `progress`/Progreso=B6, `program`/Plan=B7, `billing`/Facturacion=B8. El **orden visual** del nav es: Overview, Progreso, Analisis, Plan, Nutricion, Facturacion.

**Comportamiento del nav:**
- Tab por defecto: `overview` (`useState<ProfileMainTabId>('overview')`).
- Cambio de tab via `useTransition` (`handleTabChange`) → muestra skeleton mientras `isPending`.
- Es scrollable horizontal en mobile con fade derecho + chevron pulsante de hint (`canScrollRight`, `ResizeObserver`).
- **Badges** (`ProfileTabBadges`) calculados en `ClientProfileDashboard`:
  - `progress`: total de check-ins (si >0).
  - `workout`: cantidad de PRs, o si no, cantidad de planes en el historial.
  - `program`: numero de dias de entrenamiento de la variante efectiva (`programTrainingDayCount`).
  - `nutrition`: `'!'` (alerta amber) si la adherencia nutricional de hoy <60%; si no, cantidad de `mealDetails`.
  - `billing`: cantidad de pagos en estado `pending`.
- Indicador de tab activo animado (`layoutId` framer-motion), color `var(--theme-primary)`.

**Deep-links internos del dashboard:** `goToProgressHistory()` cambia a `progress` y hace scroll a `#profile-progress-panel`; `goToNutritionProgress()` cambia a `nutrition` y scroll a `#nutrition-zone-a-progreso`.

---

## 1.5 El HERO (`ClientProfileHero`)

Cabecera de identidad del alumno. Recibe un subconjunto de `client` + `compliance` + `profileLastActivityAt` + `attentionScore` + `currentWeightKg`/`weightDeltaKg` + `nutritionPlansLength`/`nutritionFirstPlanId`.

**Que muestra:**
- **Avatar:** cuadro con la **primera letra** del `full_name` (no foto real).
- **Nombre** (`full_name`) en titulo grande.
- **Badge de estado:** "Activo" (verde) / "Inactivo" segun `client.is_active !== false`.
- **Badge de Score:** `Score: {attentionScore} · {label}` donde `attentionBadge(score)` da: ≥50 "Urgente" (rose), ≥25 "Revisar" (amber), <25 "Estable" (emerald).
- **Email** del alumno.
- **Linea de metadatos** (identificadores secundarios):
  - Racha: `compliance.currentStreak` dias (icono Flame).
  - "Cliente desde": mes/año de `subscription_start_date || created_at` (`clientSinceLabel`).
  - "Edad entreno": `formatTrainingAgeLabel(subscription_start_date, created_at)` (dias/meses/años desde alta).
- **"Ultima actividad":** `formatRelativeLastActivity(profileLastActivityAt)` ("Hoy", "Ayer", "Hace N dias", "Hace N sem.", o fecha).

**5 chips de metricas clave** (`HeroStatChip`):
1. **Peso:** `currentWeightKg` kg + delta (`weightDeltaKg`): sube=rojo TrendingUp, baja=verde TrendingDown, igual=gris Minus.
2. **Adherencia:** `adherencePct` = `workoutsThisWeek/workoutsTarget` (cap 100%) + barra `Progress`.
3. **Workouts:** `workoutsThisWeek/workoutsTarget` "esta semana".
4. **Programa:** `Sem {planCurrentWeek}/{planTotalWeeks}` + barra de avance.
5. **Comidas hoy:** `todayMealsDone/todayMealsTotal` + `{nutritionCompliancePercent}% plan` (verde si ≥80%, amber si no).

**Acciones del hero:**
- Boton **WhatsApp** (`https://wa.me/{phone sin no-digitos}`) — deshabilitado si no hay `phone`.
- Boton **Nutricion** → `/coach/nutrition-plans/client/{clientId}`.
- Boton **Entrenamiento** → `/coach/builder/{clientId}`.
- Boton **Exportar** → `window.print()` (impresion del navegador).

**Modal "Editar Biometria Inicial":** vive en `ClientProfileDashboard` (pestana Overview, tarjeta "Metricas Clave"), no en el hero. Es un `Dialog` con inputs de Altura (`client.client_intake?.height_cm`) y Peso Inicial (`client.client_intake?.weight_kg`) y botones Cancelar/Guardar. **Importante: los inputs son `defaultValue` y los botones NO tienen handler — es UI no cableada (no persiste).**

---

## 1.6 Banner de alerta superior (`ProfileTopAlertBanner` + `getProfileTopAlert`)

Solo aparece en la pestana **Overview** (renderizado dentro del bloque `overview`). `getProfileTopAlert(...)` calcula una **unica** alerta determinista (sin IA), evaluando reglas **en orden de prioridad** y devolviendo la primera que aplique:

| Prioridad | Condicion | Tipo | Mensaje |
|---|---|---|---|
| 1 | Hay check-ins y el ultimo fue hace **>30 dias** | `warning` | "Hace mas de 1 mes desde su ultimo check-in — conviene contactarle." |
| 2 | `lastWorkoutDate` null **o** ≥7 dias sin entrenar | `danger` | "Adherencia critica: no registra ejercicios en la ultima semana." |
| 3 | `nutritionCompliancePercent < 60` | `warning` | "Solo completo el {N}% de sus comidas (hoy / plan activo)." |
| 4 | `planDaysRemaining <= 0` | `danger` | "El programa esta vencido — necesita uno nuevo." |
| 5 | `planDaysRemaining` 1–3 | `info` | "El programa vence en {N} dia(s)." |
| 6 | `oneRMDelta < -5` | `warning` | "Fuerza cayendo esta semana — revisar carga y recuperacion." |
| 7 | `currentStreak >= 10` | `success` | "🔥 {N} dias de racha activa." |
| — | ninguna | — | no muestra banner (`null`) |

Insumos: `checkIns`, `compliance` y `lastWorkoutDate` (este ultimo derivado en `ClientProfileDashboard` recorriendo `workoutHistory` y tomando el `logged_at` mas reciente). `weeklyWorkoutAdherencePct` y `oneRMDelta` son opcionales (aqui no se pasan, asi que la regla 6 no dispara). El banner (`ProfileTopAlertBanner`) renderiza icono+texto segun `type` (danger/warning/info/success) y no muestra nada si `alert` es null.

---

## 1.7 Fila de accesos a modulos de pago (`ModuleLinksRow`)

RSC en `page.tsx`. Lee `clients (team_id, org_id, coach_id)`. Si el alumno tiene `org_id` (enterprise) → no muestra nada (modulos fuera en v1). Resuelve el **contexto del recurso**: `team_id` presente ⇒ `{ teamId }` (modulos del pool), si no ⇒ `{ coachId }` (standalone). Consulta en paralelo `hasModule` para:
- `cardio` → link "Perfil cardio" a `/coach/cardio/{clientId}` (icono HeartPulse).
- `movement_assessment` → link "Screening de movimiento" a `/coach/movement/{clientId}` (PersonStanding).
- `body_composition` → link "Composicion corporal" a `/coach/clients/{clientId}/bodycomp` (Scale).

Es **espejo visual** (el gate real de escritura de cada pagina es `assertModule`). Si ningun modulo esta activo, no renderiza la fila.

Adicionalmente, `page.tsx` resuelve **"Nutricion Pro"** (`resolveNutritionProEnabled`): consulta `hasModule(supabase, 'nutrition_exchanges', ctx)` por el mismo contexto del recurso (fail-closed; false si `org_id`). Esto habilita los micros avanzados del editor de umbrales en la Zona C de la pestana Nutricion.

---

## 1.8 Acciones flotantes (`ProfileFloatingActions`)

FAB (boton + / x) visible **solo en mobile** (`md:hidden`, oculto en print). Al abrirse despliega hasta 3 accesos rapidos:
- **WhatsApp:** `https://wa.me/{digits}` (solo si el telefono tiene ≥10 digitos via `digitsForWhatsApp`).
- **Check-in alumno:** `/c/{coachSlug}/check-in` (solo si hay `coachSlug`), abre en nueva pestana.
- **Builder:** `/coach/builder/{clientId}` (siempre presente).

El `coachSlug` se deriva de `client.coaches` (array u objeto). Recibe `clientId`, `clientPhone`, `coachSlug` desde `ClientProfileDashboard`.

---

## 1.9 Como se entra / sale de la ficha

- **Entrar:** desde el directorio de clientes (`/coach/clients`), navegando a `/coach/clients/[clientId]`. La pagina usa `Suspense` con `ProfileSkeleton` mientras carga.
- **Volver:** boton "Atras" (`ArrowLeft`, label "Directorio de Unidades") → `/coach/clients`.
- **Exportar PDF:** boton `FileDown` ("Exportar PDF") → abre `/coach/clients/{clientId}/progress-print` en nueva pestana (`target="_blank"`). Hay tambien un boton "Exportar" en el hero que dispara `window.print()`.
- **Salidas a modulos de pago:** los 3 links de `ModuleLinksRow` (cardio, movement, bodycomp) segun entitlement.
- **Salidas a edicion:** hero → "Entrenamiento" (`/coach/builder/{clientId}`) y "Nutricion" (`/coach/nutrition-plans/client/{clientId}`); FAB → Builder y Check-in del alumno (`/c/{slug}/check-in`).
- **Contacto:** WhatsApp del alumno (hero + FAB).


---

## Correcciones y adiciones (revision de completitud)

> Revision adversarial 2: refinamientos verificados contra el codigo. No cambian la arquitectura; precisan detalles para el rediseno.

### [HIGH] progress-print/page.tsx — pantalla "Informe de progreso" (Exportar PDF)

Agregar una subseccion (en fa1 o fa4) "Informe de progreso imprimible (`/coach/clients/[clientId]/progress-print`)":
- RSC propio que reusa `getClientProfileData(clientId)` (mismo guard; `notFound()` si lanza). Se abre en pestana nueva desde el boton "Exportar PDF" (fa1 §1.9).
- No usa el layout de la app: devuelve su propio `<html lang="es">` con CSS de impresion inline (`@media print`, `@page margin 16mm`) y un `<script>` que ejecuta `window.print()` en `window.onload` (dispara el dialogo de impresion al cargar → de ahi "Exportar PDF").
- Contenido: cabecera (nombre del alumno + fecha es-CL) + 4 tarjetas resumen (Check-ins totales, Peso inicial, Peso actual, Cambio total con color rojo si +/verde si −) + tabla de TODOS los check-ins (Foto, Fecha, Peso, Energia n/10, Δ Peso vs check-in previo, Notas truncadas a 100 chars).
- Solo lectura; no persiste nada.

