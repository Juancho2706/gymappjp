# 1. Vision general, arquitectura, carga de datos y banners por estado

> Auditoria del **Dashboard del Coach** de EVA. Ruta `/coach/dashboard`. Es el home diario del coach: la primera pantalla tras login, presente en TODOS los tiers (`free` -> `elite`, mas legacy `growth`/`scale`). Esta seccion documenta que es, como se carga (capas RSC -> queries -> service -> Supabase), exactamente que datos llegan al abrir y como se calculan, la composicion de la pantalla, y los banners por estado de suscripcion/tier.

---

## 1.1 Que es el dashboard y su rol

El dashboard del coach (`apps/web/src/app/coach/dashboard/`) es el panel diario operativo del coach. Su proposito es darle, de un vistazo, el "pulso" de su negocio: estado de suscripcion (banners), guia de onboarding, KPIs (ingresos, alumnos, riesgo, adherencia, nutricion), lista de alumnos en riesgo, la siguiente mejor accion, la agenda del dia, programas por vencer, feed de actividad reciente y dos graficos (sesiones por dia / alumnos nuevos por mes).

- Es la **landing post-login** de la zona `/coach/*`.
- Se renderiza para todos los tiers; el contenido NO cambia por tier salvo: los **banners** (free-tier / dunning / trial / teams-bridge), los textos de la **guia de onboarding** (bloque de nutricion y branding gateados por tier), y la presencia del **modal de bienvenida free** (`?welcome=free`).
- El `title` de la pagina (metadata) es `'Dashboard'`.

---

## 1.2 Capas y flujo de datos

El dashboard respeta el data-flow obligatorio: `page.tsx` (RSC) -> `DashboardContent` (RSC, llama a `_data/dashboard.queries`) -> `services/dashboard.service` + repositories en `infrastructure/db` -> Supabase. El render del cuerpo es client (`DashboardShell` es `'use client'`).

### 1.2.1 `page.tsx` (RSC) — `CoachDashboardPage`

`apps/web/src/app/coach/dashboard/page.tsx`

1. Llama `getCoach()` (`@/lib/coach/get-coach`). Si no hay coach -> `redirect('/login')` (este es el **guard de acceso** efectivo de la pagina: sin sesion de coach no se renderiza nada).
2. Normaliza el tier crudo de DB con `normalizeCoachSubscriptionTier(coach.subscription_tier)`: hace lowercase y reconoce los 6 valores del CHECK de DB (`free`, `starter`, `pro`, `elite`, `growth`, `scale`); cualquier otro valor cae a `'starter'`. Es PARSE del valor de DB, no logica de venta (no baja growth/scale a tiers vendibles).
3. Renderiza dentro de un `<Suspense fallback={<BrandCoachLoadingShell />}>` el componente `DashboardContent`, pasandole props derivadas del coach (NO los datos del dashboard todavia). El `Suspense` envuelve la frontera de fetch de datos (`DashboardContent` es async y hace `await getCoachDashboardDataV2`), por lo que mientras carga se muestra el `BrandCoachLoadingShell` (skeleton brandeado).

Props que `page.tsx` pasa a `DashboardContent`:

| prop | origen | nota |
|---|---|---|
| `userId` | `coach.id` | id del coach autenticado |
| `coachName` | `coach.full_name ?? coach.brand_name ?? 'Coach'` | fallback en cascada |
| `coachSlug` | `coach.slug` | identificador publico |
| `coachInviteCode` | `coach.invite_code` | codigo de invitacion (link/QR de alumno) |
| `initialOnboardingGuide` | `coach.onboarding_guide ?? DEFAULT_COACH_ONBOARDING_GUIDE` | `DEFAULT_COACH_ONBOARDING_GUIDE = {}` es una **referencia estable** entre renders RSC (un `{}` nuevo cada render dispararia efectos del checklist) |
| `subscriptionTier` | `normalizeCoachSubscriptionTier(...)` | tier ya normalizado |
| `hasCoachLogo` | `Boolean(coach.logo_url?.trim())` | si tiene logo cargado (alimenta auto-completado del paso de branding) |

#### `getCoach()` — fuente de la sesion del coach

`apps/web/src/lib/coach/get-coach.ts`. Esta `cache`-eada (React.cache) por request para deduplicar auth+lookup entre layout y page.

- Hace `supabase.auth.getClaims()` (verificacion **local** del JWT con llaves ES256 + JWKS cacheado, sin round-trip a GoTrue `/user`). Toma `claims.sub` como `userId`. Si no hay `sub` -> retorna `null` (lo que en page.tsx provoca el redirect a `/login`).
- Con el id, llama `findCoachById(supabase, userId)` y castea a `CoachSession`.
- `findCoachById` (`infrastructure/db/coach.repository.ts`) hace `SELECT` de columnas especificas de `coaches` (id, full_name, brand_name, slug, invite_code, primary_color, logo_url, subscription_status, subscription_tier, current_period_end, trial_ends_at, active_org_id, use_brand_colors_coach, loader_*, onboarding_guide, brand_secondary_color, accent_*, neutral_tint, logo_url_dark, brand_font_key, loader_variant) con `.eq('id', coachId).maybeSingle()`.

> Nota de guard: la verdadera proteccion de la zona `/coach/*` (sesion valida, estado de suscripcion bloqueante) vive en el middleware/proxy y en el layout de coach, no en `page.tsx`. La pagina solo redirige si `getCoach()` retorna null.

### 1.2.2 `DashboardContent` (RSC) — frontera de fetch

`apps/web/src/app/coach/dashboard/_components/DashboardContent.tsx`

Componente server async. Recibe las props del coach, hace **una sola llamada**:

```
const data = await getCoachDashboardDataV2(userId)
```

y renderiza `<DashboardShell data={data} coachId={userId} ...resto de props />`. Es el unico lugar donde se pide la data del dashboard.

### 1.2.3 `_data/dashboard.queries.ts` — orquestador de queries

`getCoachDashboardDataV2(userId)` (envuelto en `measureServer('getCoachDashboardDataV2', ...)` para telemetria de performance):

1. `createClient()` (Supabase SSR con cookies del coach).
2. `resolveCoachDashboardOrgScope(supabase, userId)` -> resuelve el `orgId` del scope: llama `resolvePreferredWorkspace(db, userId)` (`services/auth/workspace.service`); si el workspace activo es `enterprise_coach` retorna su `orgId`, de lo contrario `null`. **Todo el dashboard se acota por este `orgId`**: standalone -> `org_id IS NULL`; coach enterprise -> `org_id = <orgId>`. El helper `applyOrgScope(query, column, orgId)` aplica `.eq(column, orgId)` o `.is(column, null)`.
3. `getCoachDashboardDataInner(userId, supabase, undefined, orgId)` -> calcula el grueso (ver 1.3).
4. `getCachedDirectoryPulse(userId, orgId)` -> el **pulso de alumnos** (ver 1.3.10), cache-eado por request (`@/lib/coach/directory-pulse-cache`, `React.cache`).
5. Deriva campos finales: `mrrDeltaPct`, `agenda` (de pulse + expiring), `kpi` (objeto resumen), `clientList`, `clientPaymentSummary`.
6. Retorna `{ ...base, pulse, mrrDeltaPct, agenda, kpi, clientList, clientPaymentSummary }`.

> Existe una variante `getCoachDashboardDataV2WithClient(userId, supabase, orgId?)` con la misma logica pero recibiendo el cliente Supabase desde afuera (usada por rutas que ya tienen un cliente, p. ej. mobile/service-role). No la consume `/coach/dashboard`.

### 1.2.4 `DashboardShell` (client) — presentacion

`apps/web/src/app/coach/dashboard/_components/DashboardShell.tsx` (`'use client'`). Recibe `data: DashboardV2Data` + props del coach. No vuelve a pedir datos; solo deriva memos locales y arma la UI (ver 1.4). Maneja dos hojas (`Sheet`) con estado local (`statsSheetOpen`, `revenueSheetOpen`).

---

## 1.3 Que datos llegan al abrir (y como se calculan)

El shape final es `DashboardV2Data` (`_data/types.ts`). A continuacion, cada bloque que llega, su origen, su algoritmo y sus ventanas de tiempo. La mayoria del trabajo pesado lo hace `getCoachDashboardDataInner` con un solo `Promise.all` de 13 consultas paralelas.

### Ventanas de tiempo definidas en `getCoachDashboardDataInner`

- `clientPaymentsLookbackStart` = primer dia del mes, hace **13 meses** (para captar pagos con `period_months` largos que aun reparten ingreso al mes actual).
- `thirtyDaysAgo` = ahora − 30 dias (señal de alumno activo + serie de workouts).
- `expiringEndUpper` = hoy + 30 dias (YMD); `expiringEndLower` = hoy − 14 dias (YMD): ventana de programas "por vencer/vencidos".

### Las 13 consultas paralelas (Promise.all)

1. `countCoachClients(supabase, userId, orgId)` -> `clientsCount`.
2. `workout_plans` count (`count: 'exact', head: true`) por `coach_id = userId` -> `activePlans` (NOTA: `workout_plans` no tiene `org_id`; se acota solo por coach).
3. `findCoachRecentClients(supabase, userId, 5, orgId)` -> 5 alumnos mas recientes (id, full_name, email, created_at, onboarding_completed).
4. `check_ins` ultimos 5 (id, created_at, front_photo_url, back_photo_url, clients!inner(id, full_name, coach_id, org_id)) por `clients.coach_id = userId`, scoped por `clients.org_id`, orden desc por created_at, limit 5.
5. `check_ins` señal 30d: 1 fila (limit 1) con `created_at >= thirtyDaysAgo` (existencia de check-in reciente).
6. `workout_programs` expiring: activos (`is_active = true`) con `end_date` no nulo dentro de `[expiringEndLower, expiringEndUpper]`, scoped por `org_id`, orden asc por end_date, limit 200.
7. RPC `get_coach_client_signups_last_6_months({ p_coach_id })` -> conteo de altas por mes (YYYY-MM).
8. RPC `get_coach_workout_sessions_30d({ p_coach_id })` -> serie server-side de sesiones unicas por dia (zona Santiago) ultimos 30 dias.
9. `workout_logs` ultimos 30d (logged_at, client_id) por `clients.coach_id`, scoped org -> fallback JS del AreaChart + señal de actividad.
10. `workout_logs` recientes para el feed: ultimos 50 (id, logged_at, client_id, clients!inner(...)), orden desc.
11. `client_payments` (client_id, payment_date, amount, status, period_months, clients!inner(org_id)) por `coach_id = userId`, scoped por `clients.org_id`, con `payment_date >= clientPaymentsLookbackStart`.
12. `pulse` -> `getCachedDirectoryPulse(userId, orgId)` (a menos que venga `pulseOverride`).
13. `findCoachById(supabase, userId)` -> `coachSubscription` (de aqui salen `subscription_status`, `current_period_end`, `trial_ends_at` para los banners).

### 1.3.1 KPIs (`kpi: KpiSummary`)

Objeto armado en `getCoachDashboardDataV2`:

| campo | calculo |
|---|---|
| `mrrCurrentMonth` | ingresos asignados al mes calendario actual (ver 1.3.7) |
| `mrrPreviousMonth` | ingresos asignados al mes anterior |
| `mrrDeltaPct` | si `mrrPreviousMonth > 0`: `round((cur − prev) / prev * 100)`; si prev=0 y cur>0: `100`; sino `0` |
| `totalClients` | `clientsCount` (count exacto de `clients` del coach en el scope) |
| `riskCount` | `base.topRiskClients.length` (alumnos con flag critico, ver 1.3.8) |
| `avgAdherence` | promedio redondeado de `adherenceStats[].percentage` (0 si vacio) |
| `avgNutrition` | promedio redondeado de `nutritionStats[].percentage` (0 si vacio) |

`avgAdherence`/`avgNutrition` se calculan en `getCoachDashboardDataInner` promediando los `percentage` de `mapDirectoryPulseToAdherenceStats(pulse)` y `mapDirectoryPulseToNutritionStats(pulse)`.

`kpi` se muestra en `KpiStrip`. Click en adherencia abre `ClientStatsSheet`; click en MRR abre `RevenueSheet`.

### 1.3.2 Pulso de alumnos (`pulse: DirectoryPulseRow[]`)

El "pulso" es la metrica per-alumno mas rica del dashboard. Lo produce `DashboardService.getDirectoryPulse(coachId, orgId)` (`services/dashboard.service.ts`), cache-eado por `getCachedDirectoryPulse`. Es la base de: KPIs de adherencia/nutricion, focus list (riesgo), agenda (check-in/sin ejercicio), `clientList`, `clientPaymentSummary` (cruce de nombres) y las dos hojas. Detalle del algoritmo en 1.3.10.

### 1.3.3 Agenda (`agenda: AgendaItem[]`)

`buildAgendaFromPulse(pulse, expiringPrograms)`. Combina:

- Por cada `expiringProgram` con `clientId`+`clientName`: item `kind: 'programa_vence'`, label `"<name> vencio"` si `daysLeft <= 0`, sino `"<name> vence en <daysLeft>d"`, href `/coach/clients/<clientId>`.
- Por cada fila de pulse: si tiene flag `SIN_CHECKIN_1M` -> item `checkin_pendiente` ("Check-in pendiente (>30d)", `dueAt = lastCheckinDate`); ELSE si tiene `SIN_EJERCICIO_7D` -> item `sin_ejercicio` ("Sin ejercicio esta semana", `dueAt = lastWorkoutDate`).
- Se cortan a los **primeros 8** (`.slice(0, 8)`).

Se muestra en `TodayAgenda`. `pendingCount` del header = `agenda.length + topRiskClients.length`.

### 1.3.4 Actividad reciente (`recentActivities: ActivityItemClient[]`)

En `getCoachDashboardDataInner`. Se construye un array `activities` mezclando tres fuentes y se ordena por fecha desc, cortando a **8**:

- **Nuevos alumnos** (`recentClientsRaw`, max 5): tipo `'nuevo alumno'`, titulo `"<full_name> se ha unido"`, subtitulo `onboarding_completed ? 'Onboarding completado' : 'Pendiente de onboarding'`, fecha `created_at`, href `/coach/clients/<id>`.
- **Check-ins** (`recentCheckinsRaw`, max 5): tipo `'check-in'`, titulo `"<full_name> subio su Check-in"`, subtitulo "Revisa su progreso semanal", fecha `created_at`, href cliente, `photoUrl` (ver abajo).
- **Workouts** (`recentWorkoutsRaw`, max 50): tipo `'workout'`, **deduplicados por `(client_id + dia)`** (una actividad por alumno por dia), titulo `"<full_name> completó una sesión"`, subtitulo "Workout registrado", fecha `logged_at`, href cliente.

**Firma de foto del check-in:** para cada check-in se toma la primera foto disponible (`front_photo_url || back_photo_url`) y se firma con `resolveCheckinPhotoUrl(checkinPhotoAdmin, first)` usando un cliente **service-role** (`createServiceRoleClient()`), porque el coach no tiene policy de SELECT en Storage y el bucket `checkins` es privado; las filas ya estan scoped por coach. Resultado en `signedCheckinPhotos` (Map id->url firmada). Se muestra en `ActivityFeed`.

### 1.3.5 Programas por vencer (`expiringPrograms: ExpiringProgramItem[]`)

De `expiringProgramsRaw` (consulta 6). Para cada programa parsea `end_date` (YYYY-MM-DD a Date local), calcula `daysLeft = round((endDate − todayMidnight) / dia)`, y se queda con `{ id, name, endDate, clientId, clientName, daysLeft }`. **Filtra a los que tienen `daysLeft <= 3`** (incluye vencidos con dias negativos). Se muestra en `ExpiringPrograms`. Tambien alimenta la agenda y la "siguiente mejor accion".

### 1.3.6 Señal de alumno activo 30d (`hasStudentSignal30d`)

`hasCheckinLast30d` (existe ≥1 check-in en 30d, consulta 5) `||` `hasWorkoutLast30d` (existe ≥1 `workout_logs` en 30d, consulta 9). Booleano. Lo consume el `CoachOnboardingChecklist` (paso 4 "tu alumno ya uso la app").

### 1.3.7 Ingresos / MRR (`mrrCurrentMonth`, `mrrPreviousMonth`)

Fuente: `client_payments` (pagos que el coach registra de sus alumnos), consulta 11, ventana de 13 meses atras. Algoritmo:

1. Filtra solo pagos contados para revenue: `isClientPaymentCountedForRevenue(status)` -> status (lowercase) en `{ paid, pagado, completed }` (alineado a la pestaña de billing B8).
2. Por cada pago: `allocatePaymentToMonthKeys(payment_date, amount, period_months)` reparte el monto en meses calendario:
   - Parsea `amount` (number/string tolerante) y la fecha (YYYY-MM-DD).
   - `pm = max(1, period_months ?? 1)`.
   - **Regla fin de mes:** si el pago cae el ULTIMO dia del mes, el primer mes de servicio es el **siguiente** (ej. 31 mar + mensualidad -> abril).
   - Reparte `floor(total/pm)` por mes y el residuo al ultimo mes, en `pm` meses consecutivos desde el inicio. Devuelve `{ 'YYYY-MM': monto }`.
3. Acumula en `revenueByMonth`. `mrrCurrentMonth = revenueByMonth[mesActual]`, `mrrPreviousMonth = revenueByMonth[mesAnterior]` (claves via `monthKeyFromYm`).

Se exponen via `kpi.mrrCurrentMonth/PreviousMonth/DeltaPct` y se detallan en `RevenueSheet`.

### 1.3.8 Alumnos en riesgo / focus list (`topRiskClients: RiskAlertItem[]`)

En `getCoachDashboardDataInner`. De `pulse`:

- `criticalFlags = ['SIN_CHECKIN_1M', 'SIN_EJERCICIO_7D']`.
- Filtra filas de pulse cuyos `attentionFlags` incluyan algun flag critico.
- Ordena por `attentionScore` desc, toma los **top 5**.
- Mapea a `{ clientId, clientName, attentionScore, flags, label }`. El `label` es la etiqueta humana del PRIMER flag via `FLAG_LABELS` (p. ej. `SIN_CHECKIN_1M` -> "Adherencia critica · sin check-in en 1 mes"); si no hay flags -> "Seguimiento recomendado".

`FLAG_LABELS` completo: `SIN_CHECKIN_1M`, `SIN_EJERCICIO_7D`, `NUTRICION_RIESGO`, `PROGRAMA_VENCIDO`, `PROGRAMA_POR_VENCER`, `FUERZA_CAYENDO`. Se muestra en `FocusList`. `riskCount = topRiskClients.length`.

### 1.3.9 Graficos (`areaData`, `barData: ChartPoint[]`)

- **AreaChart (`areaData`)** = sesiones de workout unicas por dia, ultimos 30 dias. Camino preferido: la serie server-side `get_coach_workout_sessions_30d` (`{ day, sessions }`); se mapea sobre un esqueleto de 30 dias (clave `DD/MM`). Fallback (si la RPC falla/vacia): agrega `workoutLogs30d` en JS deduplicando por `(client_id + dia)`. Solo se incluyen dias con `sesiones > 0` (chart limpio).
- **BarChart (`barData`)** = alumnos nuevos por mes, ultimos 6 meses deslizantes. Usa `signupMap` (de la RPC `get_coach_client_signups_last_6_months`, o **fallback** `findCoachClientSignupDates` agregado en JS por YYYY-MM si la RPC falla/vacia). Claves por nombre de mes abreviado (`Ene`..`Dic`). `{ name, alumnos }`.

Se renderizan en `DashboardCharts` (cargado con `dynamic(..., { ssr: false })`).

### 1.3.10 `getDirectoryPulse` — algoritmo del pulso (per-alumno)

`DashboardService.getDirectoryPulseInner(coachId, orgId)` (envuelto en `measureServer`). Devuelve `DirectoryPulseRow[]`:

1. Trae `clients` (id, full_name) del coach en el scope (`org_id` por `eq`/`is` segun orgId). Si no hay clientes -> `[]`.
2. Ventanas: `lastWeekStr` = ahora−7d; `logsFrom` = ahora−35d.
3. **workout_logs** ultimos 35d, por chunks de `CLIENT_ID_IN_CHUNK = 120` ids con `.in(...)`, `limit WORKOUT_LOGS_ROW_CAP = 2000` por chunk (tope anti-runaway; solo afecta adherencia/1RM, no la fecha de ultimo workout). Columnas: client_id, logged_at, weight_kg, reps_done, plan_name_at_log.
4. **last-workout-date exacto** via RPC `get_clients_last_workout_date({ p_client_ids, p_since })` (MAX server-side, por chunks) -> `lastWorkoutDateMap`. Bypasea el row-cap.
5. **check_ins** 35d por chunks (client_id, created_at, date, weight, energy_level).
6. **workout_programs** activos por chunks (id, client_id, created_at, start_date, end_date, weeks_to_repeat, duration_days, is_active), orden desc por created_at; se toma el mas reciente por cliente (`programByClient`).
7. **Sets planificados** via RPC `get_workout_program_planned_set_totals({ p_program_ids })` (chunks de `PROGRAM_ID_RPC_CHUNK = 80`); fallback `plannedSetsFromProgram` (suma sets de blocks).
8. **Nutricion** (`daily_nutrition_logs` con `nutrition_meal_logs` y `nutrition_meals`+`food_items`+`foods` anidados) desde `log_date >= lastWeek` por chunks. Se reconstruyen entradas del motor canonico y se delega a `computeNutritionAdherence` (`@eva/nutrition-engine`) para macros consumidos/objetivo y `compliancePct` (maneja unidades g/ml/un correctamente). Resolucion de dia/semana en zona Santiago.
9. **Streaks**: RPC batch `get_coach_clients_streaks({ p_coach_id })` (requiere sesion authenticated, `auth.uid()=coach`); fallback `get_clients_streaks_by_ids({ p_client_ids })` para los faltantes (ruta service-role/mobile).

Por cada cliente se computa:

- `percentage` (adherencia 7d) = `min(round(logsLastWeek / totalPlannedSets * 100), 100)` (0 si no hay sets planificados).
- `completedSets` = `logsLastWeek.length`; `totalSets` = `totalPlannedSets`.
- `lastPlan` = `plan_name_at_log` del ultimo log de la semana, o "Sin actividad reciente".
- `lastWorkoutDate` = del `lastWorkoutDateMap` (RPC) o fallback reduce en memoria.
- `lastCheckinDate`, `currentWeight` (ultimo check-in con peso), `weightDelta7d` (delta vs check-in ≥7d atras, 1 decimal), `weightHistory30d` (serie peso 30d), `latestEnergyLevel`.
- `adherenceHistory4w` = adherencia por cada una de las ultimas 4 semanas (`adherenceForWindow`).
- `oneRMDelta` (%): compara el promedio de max 1RM Epley diario de los ultimos 7d vs los 7d previos (`computeOneRMDelta` con `epley1RM(w,r)=w*(1+r/30)`).
- `planDaysRemaining`, `planCurrentWeek`, `planTotalWeeks` (`planMeta`: deriva fin de plan de end_date, o start+weeks*7, o start+duration_days; semana actual de days/7).
- `nutritionPercentage` = `round(compliancePct)`; `consumed`/`target` macros.
- `attentionScore` + `attentionFlags` via `calculateAttentionScore` (ver 1.3.11).
- `streak` (del streakMap, 0 si falta).

### 1.3.11 `calculateAttentionScore` — scoring de atencion

`services/dashboard.service.ts`. Suma puntos y flags (constantes: `CHECKIN_OVERDUE_AFTER_DAYS = 30`, `WORKOUT_INACTIVE_AFTER_DAYS = 7`):

| condicion | puntos | flag |
|---|---|---|
| `lastCheckinDate` existe y > 30 dias | +25 | `SIN_CHECKIN_1M` |
| tiene programa activo y SIN `lastWorkoutDate` | +25 | `SIN_EJERCICIO_7D` |
| tiene programa activo y dias desde workout >= 7 | +25 | `SIN_EJERCICIO_7D` |
| `nutritionCompliance < 60` | +20 | `NUTRICION_RIESGO` |
| `planDaysRemaining <= 0` | +15 | `PROGRAMA_VENCIDO` |
| `planDaysRemaining <= 3` (y >0) | +8 | `PROGRAMA_POR_VENCER` |
| `oneRMDelta < -5` | +15 | `FUERZA_CAYENDO` |

Este score ordena `topRiskClients`. Solo `SIN_CHECKIN_1M` y `SIN_EJERCICIO_7D` cuentan como "criticos" para entrar a la focus list.

### 1.3.12 `adherenceStats` / `nutritionStats` (para las hojas)

Derivados de `pulse` via `mapDirectoryPulseToAdherenceStats` / `mapDirectoryPulseToNutritionStats`. Comparten `baseClientStatFields` (clientId, clientName, lastPlan, fechas, peso, historiales, oneRMDelta, plan meta, attentionScore/flags, streak, latestEnergyLevel). Adherence agrega `percentage` (adherencia), `completedSets`, `totalSets`, `nutritionCompliance`. Nutrition agrega `percentage` (=nutritionPercentage), `consumed`, `target`, `adherence` (=adherencia de workout). Alimentan el `ClientStatsSheet`.

### 1.3.13 `clientList` y `clientPaymentSummary`

- `clientList = pulse.map(p => ({ id, name }))` (lista plana para el `QuickActionsBar`).
- `clientPaymentSummary` (`buildClientPaymentSummary`): por cada alumno del pulse cruza el ULTIMO pago `paid/pagado/completed` (de `_rawClientPayments`): `lastPaymentDate`, `lastPaymentAmount` (redondeado), `lastPaymentPeriodMonths`, `nextRenewalDate` (last_payment + period_months), `hasRecentPayment` (pago en los ultimos 35 dias). Se ordena dejando primero a los SIN pago reciente. Alimenta el `RevenueSheet`.

### 1.3.14 Datos de suscripcion (`subscriptionStatus`, `currentPeriodEnd`, `trialEndsAt`)

De `coachSubscription` (`findCoachById`): `subscription_status`, `current_period_end`, `trial_ends_at`. Solo se usan para los `BillingBanners` (ver 1.5). NO se usan para gatear acceso aqui.

### 1.3.15 Shape final (`DashboardV2Data`)

`_data/types.ts`: `{ kpi, activePlans, hasStudentSignal30d, clientList, clientPaymentSummary, adherenceStats, nutritionStats, recentActivities, expiringPrograms, topRiskClients, areaData, barData, agenda, pulse, subscriptionStatus, currentPeriodEnd, trialEndsAt }`. Tipos auxiliares: `KpiSummary`, `ExpiringProgramItem`, `ChartPoint`, `AgendaItem`, `AdherenceStat`, `NutritionStat`, `ClientPaymentSummary`, `ClientListItem`, `RiskAlertItem` (re-exportado de queries), `ActivityItemClient` (re-exportado), `AttentionFlag`/`DirectoryPulseRow` (de `dashboard.service`).

---

## 1.4 Composicion de la pantalla (`DashboardShell` / `DashboardContent`)

`DashboardContent` (RSC) solo hace fetch y delega a `DashboardShell`. La pantalla la arma `DashboardShell` (client). Orden de secciones (todas con animacion stagger framer-motion) de arriba a abajo:

1. **AmbientBackground** (fondo decorativo fijo) + `FreeWelcomeModal` (dentro de `Suspense`, ver 1.5.5).
2. **Banners** (`motion.div`):
   - `BillingBanners` (dunning/trial — ver 1.5).
   - Si `subscriptionTier === 'free'`: `FreeTierBanner`.
   - Si `subscriptionTier === 'elite'` y `kpi.totalClients >= 80`: `TeamsBridgeBanner`.
3. **Header** (`motion.header`): `GreetingHeader` (saludo + `pendingCount = agenda.length + topRiskClients.length`) y, a la derecha, `QuickActionsBar` (recibe `data.clientList`) + `AppOnlyBadge` (mensaje "Notificaciones, offline y gestos: todo mejor en la app de EVA").
4. **CoachOnboardingChecklist** (`motion.section`): guia de inicio (ver 1.4.1).
5. **KpiStrip** (`motion.section`): KPIs; `onAdherenceClick` abre `ClientStatsSheet`; `onMrrClick` abre `RevenueSheet`.
6. **Grid 12 cols** (`motion.section`): `FocusList` (col 8, `data.topRiskClients`) + `NextBestAction` (col 4, `nextAction`).
7. **Grid 12 cols** (`motion.section`): `TodayAgenda` (col 8, `data.agenda`) + `ExpiringPrograms` (col 4, `data.expiringPrograms`).
8. **ActivityFeed** (`motion.section`): `data.recentActivities`.
9. **DashboardCharts** (`motion.section`): `areaData` + `barData` (lazy, `ssr: false`, fallback skeleton animado).
10. Fuera del flujo: `ClientStatsSheet` (con `adherenceStats` + `nutritionStats`) y `RevenueSheet` (con `kpi` + `clientPaymentSummary`), controlados por estado local.

**Condicionales clave:** banners free/elite-teams (por tier + conteo); el contenido del checklist y el modal de bienvenida (por tier / query param). El resto de secciones se renderiza siempre (cada componente maneja su propio empty-state internamente).

**`nextAction`** = `resolveNextBestAction(data)` memoizado (ver 1.4.2).

### 1.4.1 CoachOnboardingChecklist (onboarding state)

`apps/web/src/app/coach/dashboard/CoachOnboardingChecklist.tsx` (`'use client'`). Guia de 4 pasos para "poner el estudio en marcha". Recibe `coachId`, `coachSlug`, `coachInviteCode`, `initialOnboardingGuide` (Json), `totalClients`, `activePlans`, `hasStudentSignal30d`, `subscriptionTier`, `hasCoachLogo`.

**Estado / persistencia (doble fuente):**

- `initialOnboardingGuide` = `coaches.onboarding_guide` (jsonb). Se normaliza con `normalizeGuideFromJson` a `{ completed, dismissed, ahaMomentSent }`.
- `localStorage` por coach (`eva:coach-onboarding:v1:<coachId>`): para no perder progreso entre cuentas en el mismo browser.
- Al montar: si el estado del servidor tiene actividad, gana (mergeando `dismissed`); sino usa localStorage y, si tiene actividad, lo sube al server via `persistOnboardingGuideAction`.
- Cambios se persisten con debounce de 450ms a `persistOnboardingGuideAction` (`_actions/onboarding-guide.actions.ts`) y a localStorage.

**Pasos y auto-completado (`autoCompleted`):**

| paso | auto-completa si |
|---|---|
| `profile_branding` | `hasCoachLogo` o `brandTourSeen` (localStorage del tour de marca) |
| `first_client` | `totalClients > 0` |
| `first_plan` | `activePlans > 0` |
| `first_checkin` | `hasStudentSignal30d` (check-in o workout en 30d) |

El paso 1 admite override manual (`Desmarcar` -> `false` explicito). `completedCount`/`progressPct` (sobre 4). Al llegar a 4 (`allDone`) dispara confetti una vez por sesion y emite evento `aha_moment`. Cada cambio de paso emite `step_completed`/`step_reopened` via `POST /api/coach/onboarding-events` (`emitOnboardingEvent`).

**Gates por tier en los textos/CTAs:**

- Si `isFree` (`subscriptionTier === 'free'`): muestra panel de "lo que incluye Free" + el paso de branding ofrece "Desbloquear con Starter" (link a `/coach/subscription`) y permite "Marcar como visto" sin personalizar.
- `NutritionTierBlock`: usa `getTierCapabilities(tier).canUseNutrition`. Si NO (free/starter) -> bloque "Planes de nutricion en Pro o superior" con CTA a `/coach/subscription`. Si SI (pro/elite/growth/scale) -> los 3 pasos de nutricion (`COACH_NUTRITION_ONBOARDING_STEPS`).

**Estados de visibilidad:** si `dismissed && allDone` -> no renderiza nada; si `dismissed && !allDone` -> tira mini-banner "Continuar guia"; mientras `!ready` -> skeleton. Subcomponentes: `OnboardingCompactLoopStrip`, `OnboardingStepsVignetteCarousel`, `OnboardingStepsJumpNav`, `OnboardingGemelliCoachCard`/`StudentCard` (link a `/coach/settings/preview` y a la app del alumno via `buildCoachStudentPath`).

### 1.4.2 NextBestAction (`resolveNextBestAction`)

`_lib/nextBestAction.rules.ts`. Funcion pura que, dado `DashboardV2Data`, devuelve UNA accion sugerida (primera regla que matchea, en orden de prioridad):

1. **Programas vencidos** (`expiringPrograms` con `daysLeft <= 0`): tono `warn`, CTA "Revisar programas" -> `/coach/programs`.
2. **>= 3 alumnos en riesgo** (`topRiskClients.length >= 3`): `warn`, "Ver focus list" -> `#focus-list`.
3. **Adherencia < 60%** (`kpi.avgAdherence < 60`): `warn`, "Ver detalle" -> `#adherencia`.
4. **MRR cayendo** (`kpi.mrrDeltaPct <= -10`): `warn`, "Ir a facturacion" -> `/coach/subscription`.
5. **Pendientes hoy** (`agenda.length > 0`): `info`, "Ver agenda" -> `#agenda`.
6. **Default "Todo bajo control"**: `positive`, "Ver alumnos" -> `/coach/clients`.

Se renderiza en `NextBestAction` (col 4 de la primera grid).

---

## 1.5 Banners por estado de suscripcion / tier

### 1.5.1 BillingBanners (dunning / trial)

`apps/web/src/app/coach/dashboard/_components/banners/BillingBanners.tsx` (`'use client'`). Recibe `subscriptionStatus`, `currentPeriodEnd`, `trialEndsAt`, `activeClientCount` (= `kpi.totalClients`). Calcula `nowMs` en `useEffect` (evita hydration mismatch; mientras `nowMs === null` no renderiza). Solo muestra UN banner, en este orden de prioridad:

1. **`blocked`** = `subscriptionStatus === 'canceled'` Y `current_period_end <= ahora`: banner `danger` -> "Tu suscripcion esta cancelada. Reactiva para recuperar acceso." con link **Reactivar** -> `/coach/subscription`.
2. **`canceledGrace`** = `canceled` Y `current_period_end > ahora`: banner `warn` -> "Cancelaste tu plan. Acceso hasta por N dias." Si `dias <= 7` y `activeClientCount > 0`: recomienda tier via `getRecommendedTier(activeClientCount)` y ofrece link "Activar <tier>" -> `/coach/reactivate?tier=<tier>`; sino link **Renovar** -> `/coach/subscription`.
3. **`trialActive`** = `trial_ends_at > ahora`: banner `info` -> "Periodo de prueba · N dias restantes." Misma logica de recomendacion (`dias <= 7` + clientes>0) con link "Activar <tier>" -> `/coach/reactivate?tier=<tier>`, o **Activar plan** -> `/coach/subscription`.
4. Si nada aplica -> `null` (sin banner).

`getRecommendedTier(clientCount)` = primer SALE_TIER cuyo `maxClients >= clientCount`, o `'elite'` (`@eva/tiers`). `Banner` interno acepta tono `info`/`warn`/`danger` con su icono (`AlertTriangle`/`Clock`).

> Importante: estos banners NO incluyen `past_due`/`paused`/`pending_payment`/`expired` directamente. Esos estados son **bloqueantes** (`SUBSCRIPTION_BLOCKED_STATUSES` en `lib/constants`) y se manejan en el gate de suscripcion del layout/middleware (el coach es interceptado antes del dashboard), no en este banner.

### 1.5.2 FreeTierBanner

En `DashboardShell.tsx`. Se renderiza solo si `subscriptionTier === 'free'`. Muestra `used/max` alumnos (`max = TIER_CONFIG.free.maxClients = 3`, `used = min(totalClients, 3)`), una barra de progreso (`pct`), y un link a `/coach/subscription`: si esta lleno (`used >= max`) -> "Expandir limite →"; sino "Ver planes →". Si lleno usa estilo de alerta (ambar).

### 1.5.3 TeamsBridgeBanner

En `DashboardShell.tsx`. Se renderiza solo si `subscriptionTier === 'elite'` Y `kpi.totalClients >= 80`. Muestra `totalClients/max` (`max = TIER_CONFIG.elite.maxClients = 100`) y `pct`, con copy "¿Mas de 100 alumnos o trabajas con otros profesionales? Conoce EVA Teams" y un CTA `mailto:contacto@eva-app.cl?subject=Quiero conocer EVA Teams` ("Conversemos →"). Es el puente comercial a EVA Teams.

### 1.5.4 Upsell de onboarding (gates por tier dentro del checklist)

Ademas de los banners, el `CoachOnboardingChecklist` actua como upsell contextual (ver 1.4.1): panel "lo que incluye Free", paso de branding gateado (Starter+), y `NutritionTierBlock` gateado (Pro+). Todos linkean a `/coach/subscription`.

### 1.5.5 FreeWelcomeModal

`_components/FreeWelcomeModal.tsx` (`'use client'`, dentro de `Suspense` en el shell). Se abre solo si la URL trae `?welcome=free` Y no existe `localStorage['eva_free_welcome_seen']`. Muestra bienvenida + primeros pasos + que incluye el plan Free. Al cerrar (boton "Empezar ahora" o cerrar dialog): setea `localStorage`, cierra y hace `router.replace` quitando `?welcome=free` de la URL. Tiene link secundario "Ver todos los planes" -> `/coach/subscription`. Es independiente del tier real del coach (se dispara por el query param tras el signup free).

---

## 1.6 Guards de acceso (resumen)

- **`page.tsx`**: `if (!coach) redirect('/login')` — unica proteccion explicita en la pagina. Depende de `getCoach()` -> `getClaims()` (JWT local) -> `findCoachById`.
- **Scope org**: `resolveCoachDashboardOrgScope` -> `resolvePreferredWorkspace`; todos los datos se acotan a `org_id IS NULL` (standalone) o `org_id = <orgId>` (coach enterprise). Un coach enterprise ve SOLO los alumnos/datos de su org activa.
- **Estado de suscripcion bloqueante** (`past_due`/`paused`/`pending_payment`/`expired` + `canceled` vencido): se intercepta en el layout/middleware de coach (fuera del scope de estos archivos); el dashboard asume coach con acceso y solo muestra banners informativos para `canceled`-en-gracia / `trial` / `canceled`-vencido.
- **Service-role acotado**: la firma de fotos de check-in usa `createServiceRoleClient()` pero solo sobre filas ya scoped por coach; no bypasea el scoping de negocio.
