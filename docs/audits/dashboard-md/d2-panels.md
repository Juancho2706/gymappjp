# 2. Cabecera, KPIs, foco de riesgo, agenda y actividad

> Alcance: la mitad superior del dashboard del coach (`/coach/dashboard`), desde el saludo hasta la actividad reciente. Para cada panel se documenta **qué muestra** (funcional), **qué datos usa** y **cómo se calculan** (algoritmos, ventanas de tiempo, queries, tablas). El énfasis es backend.

---

## 2.0. Cómo llega la data a estos paneles (cadena de orquestación)

Antes de cada panel conviene fijar la tubería, porque casi todos consumen el mismo objeto `DashboardV2Data` armado server-side.

1. `page.tsx` (`CoachDashboardPage`, RSC) → `getCoach()` resuelve el coach autenticado (redirect a `/login` si no hay). Pasa `coach.id` y metadatos (nombre, slug, invite_code, onboarding_guide, tier, logo) a `DashboardContent`.
2. `DashboardContent` (RSC) → `await getCoachDashboardDataV2(userId)` y renderiza `DashboardShell` (client) con la data ya resuelta.
3. `getCoachDashboardDataV2(userId)` (`_data/dashboard.queries.ts`, envuelto en `measureServer`):
   - Crea cliente Supabase SSR (`createClient()`).
   - Resuelve el **org scope** del coach con `resolveCoachDashboardOrgScope` → `resolvePreferredWorkspace`. Si el workspace es `enterprise_coach` usa `workspace.orgId`; si no, `orgId = null` (coach standalone). Este `orgId` filtra TODAS las queries por `org_id` (vía `applyOrgScope`: `eq('org_id', x)` si hay org, `is('org_id', null)` si standalone).
   - Llama `getCoachDashboardDataInner(...)` (el grueso de las queries) y por separado `getCachedDirectoryPulse(userId, orgId)` (el "pulse" por-alumno, ver 2.0.1).
   - Deriva `mrrDeltaPct`, construye `agenda` (`buildAgendaFromPulse`), `kpi`, `clientList`, `clientPaymentSummary`.
4. `DashboardShell` (client) reparte la data en los componentes y maneja el estado de los dos sheets (stats y revenue) que abren ciertos KPIs.

### 2.0.1. Directory Pulse — la fuente común de métricas por alumno

`getCachedDirectoryPulse(coachId, orgId)` (`lib/coach/directory-pulse-cache.ts`) está envuelto en `React.cache` (una sola carga por request; se reusa entre el dashboard y el directorio). Internamente instancia `new DashboardService(supabase).getDirectoryPulse(coachId, orgId)`.

`DashboardService.getDirectoryPulseInner` (`services/dashboard.service.ts`) es el motor que produce un `DirectoryPulseRow[]` (un row por alumno del coach/org). De aquí salen: `attentionScore`/`attentionFlags` (Focus list, KPI "En riesgo", NextBestAction), `lastWorkoutDate`/`lastCheckinDate` (Agenda), adherencia de fuerza y de nutrición (KPI Adherencia), streak, peso, 1RM, etc. Pipeline:

- **Alumnos:** `clients` filtrado por `coach_id` y por `org_id` (eq si org, is null si standalone). Si no hay alumnos → `[]` (todos los paneles caen a empty-state).
- **Ventanas de tiempo:** `now`; `lastWeekStr = now - 7d`; `logsFrom = now - 35d` (todo lo de `workout_logs`/`check_ins`/`daily_nutrition_logs` se trae desde 35 días atrás).
- **workout_logs (35d):** se traen en chunks de `CLIENT_ID_IN_CHUNK = 120` clientes, columnas `client_id, logged_at, weight_kg, reps_done, plan_name_at_log`, `.limit(WORKOUT_LOGS_ROW_CAP = 2000)` por chunk (tope anti-runaway).
- **Último workout real:** se resuelve aparte por RPC `get_clients_last_workout_date(p_client_ids, p_since)` (MAX server-side por GROUP BY) para no depender del cap de filas. Fallback en JS (reduce sobre logs) si el RPC no devuelve.
- **check_ins (35d):** chunked, columnas `client_id, created_at, date, weight, energy_level`.
- **workout_programs activos:** chunked, `is_active = true`, ordenados por `created_at desc`; se toma el más reciente por alumno (`programByClient`).
- **Sets planificados del programa:** RPC `get_workout_program_planned_set_totals(p_program_ids)` en chunks de `PROGRAM_ID_RPC_CHUNK = 80`; fallback `plannedSetsFromProgram` (suma `sets` de los `workout_blocks` de cada plan).
- **Nutrición:** `daily_nutrition_logs` desde `lastWeekStr` (`logDateCutoff`, últimos 7 días), con `nutrition_meal_logs → nutrition_meals → food_items → foods` anidados, y targets congelados (`target_*_at_log`). Adherencia + macros consumidos/objetivo se delegan al motor canónico `computeNutritionAdherence` de `@eva/nutrition-engine` (maneja unidades g/ml/un, día de semana en zona Santiago).
- **Streak:** RPC batch `get_coach_clients_streaks(p_coach_id)` (requiere `auth.uid()=coach`, sesión authenticated); fallback `get_clients_streaks_by_ids(p_client_ids)` para los que falten (ruta service-role/mobile). Algoritmo del streak en 2.4.

> Por cada alumno se computan, entre otros: `percentage` (adherencia de fuerza últimos 7d), `nutritionPercentage`, `lastWorkoutDate`, `lastCheckinDate`, `currentWeight`, `weightDelta7d`, `weightHistory30d`, `adherenceHistory4w`, `oneRMDelta`, `planDaysRemaining/CurrentWeek/TotalWeeks`, `attentionScore`, `attentionFlags`, `streak`, `latestEnergyLevel`. Todo eso alimenta los paneles de esta sección.

### 2.0.2. Attention Score — algoritmo central de riesgo

`calculateAttentionScore(client)` (en `dashboard.service.ts`) recibe `{ lastCheckinDate, lastWorkoutDate, hasActiveWorkoutProgram, nutritionCompliance, planDaysRemaining, oneRMDelta }` y devuelve `{ score, flags }`. Constantes: `CHECKIN_OVERDUE_AFTER_DAYS = 30`, `WORKOUT_INACTIVE_AFTER_DAYS = 7`. Reglas acumulativas:

| Condición | Puntos | Flag |
|---|---|---|
| Hubo check-in alguna vez y `díasDesdeCheckin > 30` | +25 | `SIN_CHECKIN_1M` |
| Tiene programa activo y NO hay último workout | +25 | `SIN_EJERCICIO_7D` |
| Tiene programa activo y `díasDesdeWorkout >= 7` | +25 | `SIN_EJERCICIO_7D` |
| `nutritionCompliance < 60` | +20 | `NUTRICION_RIESGO` |
| `planDaysRemaining <= 0` | +15 | `PROGRAMA_VENCIDO` |
| `planDaysRemaining <= 3` (y > 0) | +8 | `PROGRAMA_POR_VENCER` |
| `oneRMDelta < -5` (1RM cayó >5%) | +15 | `FUERZA_CAYENDO` |

> Notas: el flag de check-in solo dispara si `lastCheckinDate` existe (alumno sin ningún check-in nunca marca `SIN_CHECKIN_1M`). El flag de ejercicio solo aplica si el alumno tiene programa activo. `oneRMDelta` se calcula con Epley (`weight·(1+reps/30)`), promediando el máximo diario de los últimos 7d vs. los 7d previos (`computeOneRMDelta`/`avgDailyMaxEpley`); null si falta data en alguna ventana.

---

## 2.1. GreetingHeader — saludo y resumen de pendientes

**Archivo:** `_components/header/GreetingHeader.tsx` (`'use client'`). Props: `coachName`, `pendingCount`.

**Qué muestra:**
- Fecha de hoy formateada `es-ES` con `weekday`, `day`, `month` largos (línea superior, ej. "lunes, 23 de junio"). Se genera client-side con `new Date().toLocaleDateString`.
- Título "`{greeting}`, `{firstName}`". El `firstName` es `coachName.split(' ')[0]` o `'Coach'` si viene vacío. El nombre se colorea con `--theme-primary` (branding del coach, default `#007AFF`).
- Línea de estado: si `pendingCount > 0` → "Tienes N pendiente(s) hoy." (pluraliza). Si es 0 → "Todo al dia. Buen momento para planificar."

**Cómo se calcula el saludo (`useTimeOfDayGreeting`, `_hooks/useTimeOfDayGreeting.ts`):**
- Hook client-only. Estado inicial `'Hola'` (para SSR/primer paint sin hidratación-mismatch); en `useEffect` lee `new Date().getHours()` y resuelve:
  - `< 6` → "Buenas noches"
  - `< 13` → "Buenos dias"
  - `< 20` → "Buenas tardes"
  - resto (`>= 20`) → "Buenas noches"
- Es hora local del navegador del coach, no del servidor.

**De dónde sale `pendingCount`:** lo calcula `DashboardShell` como `data.agenda.length + data.topRiskClients.length` (suma de items de agenda + alumnos en riesgo). No es una query propia; es derivado de paneles que se documentan abajo.

---

## 2.2. QuickActionsBar — acciones rápidas

**Archivo:** `_components/header/QuickActionsBar.tsx` (`'use client'`). Prop: `clients: ClientListItem[]` (lista `{ id, name }` derivada del pulse: `pulse.map(p => ({ id: p.clientId, name: p.clientName }))`).

Cuatro acciones (dos abren modal, dos son links):

| Acción | Tipo | Qué dispara |
|---|---|---|
| **+ Alumno** | botón | `setCreateOpen(true)` → abre `CreateClientModal` (de `app/coach/clients/CreateClientModal`). Modal de alta de alumno. |
| **+ Programa** | Link | Navega a `/coach/workout-programs` (constructor de programas de fuerza). |
| **+ Nutricion** | Link | Navega a `/coach/nutrition-plans/new` (nuevo plan de nutrición). |
| **+ Pago** | botón | `setPayOpen(true)` → abre `QuickAddPaymentModal` (recibe `clients`). |

### 2.2.1. QuickAddPaymentModal — registrar pago manual

**Archivo:** `_components/payments/QuickAddPaymentModal.tsx`. Es el camino de ingreso de revenue manual que luego alimenta el KPI "Ingresos del mes".

**Campos del formulario:** alumno (`select` poblado con `clients`), monto (CLP entero), fecha del pago (default hoy, `new Date().toISOString().split('T')[0]`), concepto/`service_description` (texto, requerido), meses/`period_months` (opcional, ≥ 1).

**Validación client-side antes de enviar:** alumno obligatorio; monto = `Math.round(Number(amount sin espacios))` debe ser finito y `> 0`; fecha obligatoria; concepto no vacío; si se ingresó período, debe ser número ≥ 1.

**Qué guarda / acción disparada:** dentro de `startTransition` llama al server action `addPayment({ client_id, amount, payment_date, service_description, period_months, status: 'paid' })`. `addPayment` (en `coach/clients/[clientId]/_actions/client-detail.actions.ts`) delega a `addPaymentService`, que inserta una fila en la tabla **`client_payments`** (columnas relevantes: `client_id`, `coach_id`, `payment_date`, `amount`, `status`, `period_months`, descripción). El `status: 'paid'` es lo que hace que el pago cuente para revenue (ver 2.3.1). Tras éxito: cierra el modal y `router.refresh()` (re-fetch del RSC → KPIs actualizados). Si falla, muestra "No se pudo registrar el pago."

---

## 2.3. KpiStrip / KpiTile — la tira de 4 KPIs

**Archivos:** `_components/kpi/KpiStrip.tsx` y `_components/kpi/KpiTile.tsx` (`'use client'`).

`KpiStrip` recibe `kpi: KpiSummary` + dos callbacks (`onAdherenceClick`, `onMrrClick`, conectados en `DashboardShell` a `setStatsSheetOpen(true)` y `setRevenueSheetOpen(true)`). Renderiza 4 `KpiTile`. Cada tile puede ser link (`href`), botón (`onClick`) o estático; los interactivos muestran "Ver detalle →".

`KpiSummary` (armado en `getCoachDashboardDataV2`):
```
{ mrrCurrentMonth, mrrPreviousMonth, mrrDeltaPct, totalClients, riskCount, avgAdherence, avgNutrition }
```

Los 4 tiles, en orden:

### 2.3.1. Ingresos del mes (KPI #1)

- **Muestra:** `mrrCurrentMonth` formateado como CLP (`Intl.NumberFormat('es-CL', currency CLP, 0 decimales)`), con un badge de delta `mrrDeltaPct` (flecha ↑ verde / ↓ rosa según signo) y hint "Mes anterior: `{mrrPreviousMonth}`".
- **Al click:** `onMrrClick` → abre **`RevenueSheet`** (detalle de ingresos + `clientPaymentSummary`).
- **Cómo se calcula (`getCoachDashboardDataInner` + helpers):**
  1. Query `client_payments` del coach (`eq('coach_id', userId)` + org scope vía `clients!inner(org_id)`), desde `clientPaymentsLookbackStart = primer día del mes, hace 13 meses` (para captar pagos antiguos con `period_months` largos que aún reparten al mes actual).
  2. Solo cuentan filas con `status` ∈ {`paid`,`pagado`,`completed`} (`isClientPaymentCountedForRevenue`) — alineado con la pestaña de billing.
  3. Cada pago se **reparte por meses calendario** con `allocatePaymentToMonthKeys(payment_date, amount, period_months)`:
     - Si el pago cae el **último día del mes**, el primer mes de servicio se considera el **siguiente** (ej. 31-mar de una mensualidad de abril → todo el monto cae en abril).
     - Con `period_months > 1`: reparte `amount/periodo` en meses consecutivos (`base = floor(total/pm)`, el remanente va al último mes).
     - Acumula en `revenueByMonth[YYYY-MM]`.
  4. `mrrCurrentMonth = revenueByMonth[mesActual]`; `mrrPreviousMonth = revenueByMonth[mesPrevio]` (claves `YYYY-MM`).
  5. `mrrDeltaPct` (en `getCoachDashboardDataV2`): si `mrrPreviousMonth > 0` → `round((curr - prev)/prev * 100)`; si prev=0 y curr>0 → `100`; si ambos 0 → `0`.
- **Tabla origen:** `client_payments`. No es MRR de suscripción de la plataforma; es revenue que el coach cobra a sus alumnos (manual o registrado).

### 2.3.2. Alumnos activos (KPI #2)

- **Muestra:** `totalClients` (número), sin delta. Hint ninguno.
- **Al click:** Link a `/coach/clients`.
- **Cómo se calcula:** `countCoachClients(supabase, userId, orgId)` (infra `infrastructure/db`) → `count` exacto de `clients` del coach con el org scope aplicado. Es conteo total de alumnos del coach/org, no "activos por uso".

### 2.3.3. En riesgo (KPI #3)

- **Muestra:** `riskCount` (número). Hint: si `> 0` → "Requieren atencion inmediata"; si 0 → "Todos al dia".
- **Al click:** ancla `#focus-list` (scroll a la Focus list).
- **Cómo se calcula:** `riskCount = base.topRiskClients.length`, es decir el tamaño de la lista de riesgo (mismo conjunto que la Focus list, ver 2.4). `topRiskClients` = alumnos del pulse cuyo `attentionFlags` incluye al menos uno de los **flags críticos** `['SIN_CHECKIN_1M','SIN_EJERCICIO_7D']`, ordenados por `attentionScore desc`, **cap a 5**. → `riskCount` nunca pasa de 5.

### 2.3.4. Adherencia (KPI #4)

- **Muestra:** `avgAdherence` como `"{n}%"`. Hint: "Nutricion: `{avgNutrition}%`".
- **Al click:** `onAdherenceClick` → abre **`ClientStatsSheet`** (detalle por alumno de adherencia y nutrición).
- **Cómo se calculan ambos promedios (`getCoachDashboardDataInner`):**
  - `adherenceStats = mapDirectoryPulseToAdherenceStats(pulse)`; `nutritionStats = mapDirectoryPulseToNutritionStats(pulse)`.
  - `avgAdherence = round(Σ adherenceStats[].percentage / N)` si hay alumnos, si no `0`.
  - `avgNutrition = round(Σ nutritionStats[].percentage / N)` si hay alumnos, si no `0`.
  - `percentage` de adherencia por alumno (en el pulse): `min(round(logsCount_7d / totalPlannedSets * 100), 100)`, donde `logsCount_7d` = `workout_logs` del alumno en los últimos 7 días y `totalPlannedSets` = sets planificados del programa activo (RPC `get_workout_program_planned_set_totals`). Si no hay sets planificados → 0%.
  - `nutritionPercentage` = `round(compliancePct)` que devuelve `computeNutritionAdherence` sobre los `daily_nutrition_logs` de los últimos 7 días (motor `@eva/nutrition-engine`).

### 2.3.5. KpiTile (presentación, funcional)

`KpiTile` adapta el tamaño del número a su longitud (`valueSizeClass`). Si recibe `deltaPct` numérico válido, dibuja el badge ↑/↓ con `Math.abs(deltaPct)%`. Renderiza como `<Link>` si hay `href`, como `<button>` si hay `onClick`, o estático. Muestra "Ver detalle →" cuando es interactivo.

---

## 2.4. FocusList — foco de riesgo

**Archivo:** `_components/focus/FocusList.tsx` (`'use client'`). Prop: `items: RiskAlertItem[]` = `data.topRiskClients`. Ancla `id="focus-list"` (destino del KPI "En riesgo" y de algunas reglas de NextBestAction).

**Qué muestra:**
- Header "Focus list" + link "Ver todos" → `/coach/clients?filter=risk`.
- Si no hay items: empty-state "Sin alumnos en riesgo · Todos con check-in y ejercicio al dia."
- Si hay: lista de alumnos; cada fila es Link a `/coach/clients/{clientId}` mostrando `clientName`, una `label` (descripción del primer flag) y un badge con `attentionScore`. Navegación con flechas ↑/↓ vía `useArrowListNav` (ver 2.4.2).

**Qué alumnos lista y cómo se ordena (`getCoachDashboardDataInner` → `topRiskClients`):**
- `criticalFlags = ['SIN_CHECKIN_1M','SIN_EJERCICIO_7D']`.
- Filtra el pulse a los rows cuyo `attentionFlags` contenga **algún** flag crítico (un alumno solo con `NUTRICION_RIESGO` o `PROGRAMA_POR_VENCER` NO entra a la Focus list).
- Ordena por `attentionScore desc`.
- `.slice(0, 5)` (máx. 5).
- Mapea a `RiskAlertItem { clientId, clientName, attentionScore, flags, label }`. La `label` = `FLAG_LABELS[flags[0]]` (etiqueta del **primer** flag), o "Seguimiento recomendado" si no hay flags.

**Diccionario de etiquetas (`FLAG_LABELS`):**
- `SIN_CHECKIN_1M` → "Adherencia critica · sin check-in en 1 mes"
- `SIN_EJERCICIO_7D` → "Adherencia critica · sin ejercicio en 7 dias"
- `NUTRICION_RIESGO` → "Nutricion en riesgo"
- `PROGRAMA_VENCIDO` → "Programa vencido"
- `PROGRAMA_POR_VENCER` → "Programa por vencer"
- `FUERZA_CAYENDO` → "Fuerza cayendo"

> El `attentionScore` (criterio de orden y badge) se calcula con `calculateAttentionScore` (ver 2.0.2). Es la misma cifra que el KPI "En riesgo" cuenta (riskCount = longitud de esta lista).

### 2.4.1. Streak (insumo del pulse, contexto del riesgo)

Aunque no se muestra directo en la Focus list, el `streak` es parte del pulse. Se calcula por RPC `get_client_current_streak(p_client_id)` (SECURITY DEFINER, guard IDOR: solo el propio alumno, su coach, o pool):
- Une fechas de actividad de los últimos **730 días**: `DATE(workout_logs.logged_at)` ∪ `daily_nutrition_logs.log_date` con al menos un `nutrition_meal_logs.is_completed = true`.
- Ordena las fechas desc; si la más reciente es anterior a `ayer` → streak 0.
- Cuenta días consecutivos hacia atrás (cada día exactamente -1 suma; un hueco corta). Devuelve el largo de la racha.
- Batch: `get_coach_clients_streaks(p_coach_id)` agrega todos los alumnos en una llamada (sesión authenticated); fallback `get_clients_streaks_by_ids` para los faltantes.

### 2.4.2. useArrowListNav (navegación teclado)

**Archivo:** `_hooks/useArrowListNav.ts`. Devuelve `{ containerRef, onKeyDown }`. En `ArrowDown`/`ArrowUp` busca los elementos con `[data-arrow-nav-item]` dentro del contenedor, localiza el activo (`document.activeElement`), hace `preventDefault` y enfoca el siguiente/anterior (clamp en los extremos). La Focus list marca cada fila con `data-arrow-nav-item` y conecta `ref`+`onKeyDown`.

---

## 2.5. TodayAgenda — agenda del día

**Archivo:** `_components/today/TodayAgenda.tsx` (`'use client'`). Prop: `items: AgendaItem[]` = `data.agenda`. Ancla `id="agenda"`.

**Qué muestra:**
- Header "Agenda de hoy" + contador "`{N}` pendientes".
- Empty-state si vacío: "Todo cerrado · Sin pendientes en el dia."
- Si hay items: lista; cada uno es Link a `it.href` con un emoji por `kind` (`KIND_ICON`: `programa_vence`→⏳, `checkin_pendiente`→📷, `sin_ejercicio`→💪), `clientName` y `label`.

**Qué eventos contiene y cómo se construyen (`buildAgendaFromPulse(pulse, expiringPrograms)` en `dashboard.queries.ts`):**
1. **Programas por vencer/vencidos:** por cada `expiringPrograms` con `clientId` y `clientName`, agrega item `kind: 'programa_vence'`, label "`{name}` vencio" si `daysLeft <= 0` o "`{name}` vence en `{daysLeft}d`" en otro caso. `href = /coach/clients/{clientId}`.
2. **Check-in pendiente:** por cada row del pulse con flag `SIN_CHECKIN_1M`, item `kind: 'checkin_pendiente'`, label "Check-in pendiente (>30d)", `dueAt = lastCheckinDate`.
3. **Sin ejercicio:** `else if` el row tiene `SIN_EJERCICIO_7D` (excluyente con el de check-in: si ya entró por check-in, no se duplica), item `kind: 'sin_ejercicio'`, label "Sin ejercicio esta semana", `dueAt = lastWorkoutDate`.
4. La lista final se corta a **8 items** (`.slice(0, 8)`).

> La agenda no es de "citas/calendario"; es una lista derivada de los flags de riesgo del pulse + los programas por vencer. `AgendaItem.kind` solo puede ser `programa_vence | checkin_pendiente | sin_ejercicio`.

---

## 2.6. ActivityFeed — actividad reciente

**Archivo:** `_components/activity/ActivityFeed.tsx` (`'use client'`). Prop: `items: ActivityItemClient[]` = `data.recentActivities`.

**Qué muestra:**
- Header "Actividad reciente".
- Empty-state: "Sin actividad reciente."
- Si hay: lista; cada item es Link a `it.href`. Muestra `photoUrl` (avatar/thumbnail de check-in) si existe; si no, un ícono por `type` (`TYPE_ICON`: `nuevo alumno`→UserPlus, `check-in`→CheckCircle, `workout`→Dumbbell, fallback Activity). Muestra `title`, `subtitle` y un "tiempo atrás" relativo (`timeAgo`: <1m → "ahora", <60m → "Nm", <24h → "Nh", resto → "Nd").

**Qué eventos contiene y de dónde salen (`getCoachDashboardDataInner` → `recentActivities`):** se mezclan 3 fuentes en un array `activities`, se ordenan por fecha desc y se cortan a **8**:

1. **Nuevos alumnos** (`findCoachRecentClients(supabase, userId, 5, orgId)`, últimos 5):
   - `type: 'nuevo alumno'`, title "`{full_name}` se ha unido", subtitle "Onboarding completado" o "Pendiente de onboarding" según `c.onboarding_completed`, `date = created_at`, `href = /coach/clients/{id}`.
2. **Check-ins** (query a `check_ins` con join `clients!inner`, scope coach+org, orden `created_at desc`, limit 5):
   - `type: 'check-in'`, title "`{full_name}` subio su Check-in", subtitle "Revisa su progreso semanal", `date = created_at`, `href = /coach/clients/{client.id}`.
   - `photoUrl`: primera foto disponible (`front_photo_url` → `back_photo_url`), firmada con **service-role** vía `resolveCheckinPhotoUrl` (el coach no tiene policy de SELECT en storage; las filas ya vienen scoped por `coach_id`). Soporta el bucket `checkins` privado (dual-lee URL pública legacy y path).
3. **Workouts completados** (query a `workout_logs` con join `clients!inner`, scope coach+org, orden `logged_at desc`, limit 50):
   - Se **deduplica por (client_id + día)** con `seenWorkoutSessions` (un evento por sesión-día, no por set).
   - `type: 'workout'`, title "`{full_name}` completó una sesión", subtitle "Workout registrado", `date = logged_at`, `href = /coach/clients/{client.id}`.

> Tras mezclar: `activities.sort` por `date desc`, `recentActivities = activities.slice(0, 8)`. Tablas: `clients`, `check_ins`, `workout_logs`.

---

## 2.7. NextBestAction — motor de "próxima mejor acción"

**Archivos:** `_components/cs/NextBestAction.tsx` (presentación) + `_lib/nextBestAction.rules.ts` (motor). En `DashboardShell` se resuelve con `useMemo(() => resolveNextBestAction(data), [data])`.

**Qué muestra:** una sola tarjeta destacada con: etiqueta "Proxima accion", `title`, `description`, y un botón CTA (`ctaLabel`) que linkea a `ctaHref`. El `tone` (`warn`/`positive`/`info`) cambia el gradiente.

**Cómo se decide (`resolveNextBestAction(data)`):** motor de reglas con **prioridad por orden de evaluación** — devuelve la **primera** que matchee. Insumos: `kpi`, `topRiskClients`, `agenda`, `expiringPrograms`.

| Prio | id | Condición | tone | title | CTA → href |
|---|---|---|---|---|---|
| 1 | `programas-vencidos` | `expiringPrograms` con `daysLeft <= 0` (al menos 1) | warn | "N programa(s) vencido(s)" | "Revisar programas" → `/coach/programs` |
| 2 | `focus-list` | `topRiskClients.length >= 3` | warn | "N alumnos en riesgo" | "Ver focus list" → `#focus-list` |
| 3 | `adherencia-baja` | `kpi.avgAdherence < 60` | warn | "Adherencia promedio < 60%" | "Ver detalle" → `#adherencia` |
| 4 | `mrr-cayendo` | `kpi.mrrDeltaPct <= -10` | warn | "MRR {pct}% vs mes anterior" | "Ir a facturacion" → `/coach/subscription` |
| 5 | `agenda-hoy` | `agenda.length > 0` | info | "N pendientes hoy" | "Ver agenda" → `#agenda` |
| 6 (default) | `todo-ok` | ninguna anterior | positive | "Todo bajo control" | "Ver alumnos" → `/coach/clients` |

> Es lógica pura sobre `DashboardV2Data` (sin query propia). Cada regla reusa métricas ya calculadas: programas vencidos (2.8), riesgo (2.4), adherencia promedio (2.3.4), delta de MRR (2.3.1), agenda (2.5).

---

## 2.8. ExpiringPrograms — programas por vencer

**Archivo:** `_components/expiring/ExpiringPrograms.tsx` (`'use client'`). Prop: `items: ExpiringProgramItem[]` = `data.expiringPrograms`.

**Qué muestra:**
- Header "Programas por vencer".
- Empty-state: "Sin programas vencidos ni por vencer."
- Si hay: lista; cada item es Link a `/coach/clients/{clientId}` (o `/coach/programs` si no hay clientId). Muestra `clientName` (o "Sin alumno"), `name` del programa, y un badge: "Vencido" si `daysLeft <= 0`, si no "`{daysLeft}d`".

**Cómo se calcula (`getCoachDashboardDataInner` → `expiringPrograms`):**
1. Query a `workout_programs`: `eq('coach_id', userId)`, `eq('is_active', true)`, org scope, `end_date` no nulo, con **ventana de fecha**:
   - `end_date >= expiringEndLower` (= `hoy - 14 días`, para incluir recién vencidos)
   - `end_date <= expiringEndUpper` (= `hoy + 30 días`)
   - `order('end_date' asc)`, `limit(200)`. Join `clients:client_id (id, full_name)`.
2. Para cada fila: parsea `end_date` (YYYY-MM-DD a fecha local), calcula `daysLeft = round((endDate - todayMidnight)/día)`.
3. **Filtro final clave:** `.filter(p => p.daysLeft <= 3)` — solo se conservan programas que vencen en ≤ 3 días o ya vencidos. (Aunque la query trae hasta +30d, el panel solo muestra los muy próximos/vencidos.)

> `ExpiringProgramItem { id, name, endDate, clientId, clientName, daysLeft }`. Estos mismos items alimentan: la regla #1 de NextBestAction (vencidos = `daysLeft <= 0`) y la parte `programa_vence` de la Agenda. Tabla: `workout_programs`.

---

## 2.9. Resumen de fuentes de datos por panel

| Panel | Insumo principal | Tabla(s) / RPC | Ventana |
|---|---|---|---|
| GreetingHeader | hora local + `agenda`+`topRiskClients` | — (derivado) | hoy |
| QuickActions / +Pago | `client_payments` (insert) | `client_payments` | — |
| KPI Ingresos | `client_payments` status pagado, repartido por mes | `client_payments` | hasta -13 meses |
| KPI Alumnos | conteo de clientes | `clients` | total |
| KPI En riesgo | `topRiskClients.length` (cap 5) | pulse | 7d/30d |
| KPI Adherencia | promedio `percentage` / `nutritionPercentage` | `workout_logs`, `daily_nutrition_logs`, RPC sets | 7d |
| FocusList | flags críticos, orden por score, cap 5 | pulse (`calculateAttentionScore`) | 7d/30d |
| TodayAgenda | flags `SIN_CHECKIN_1M`/`SIN_EJERCICIO_7D` + expiring | pulse + `workout_programs` | cap 8 |
| ActivityFeed | nuevos alumnos + check-ins + workouts (dedup día) | `clients`, `check_ins`, `workout_logs` | últimos 5/5/50, cap 8 |
| NextBestAction | reglas sobre kpi/risk/agenda/expiring | — (puro) | — |
| ExpiringPrograms | programas activos, `daysLeft <= 3` | `workout_programs` | -14d a +30d, filtro ≤3d |
