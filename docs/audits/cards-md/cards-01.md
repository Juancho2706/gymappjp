# Info de las cards del listado de alumnos (vista tarjetas)

Documento exhaustivo de TODO lo que muestra y cómo funciona la vista de **tarjetas** del Directorio de Alumnos del coach. Cubre la activación del modo, la paginación, cada dato de la tarjeta `ClientCardV2`, su origen y cálculo en el backend (`DirectoryPulseRow` / `DashboardService.getDirectoryPulse`), las acciones de la card, el encabezado War Room que las acompaña, y el orden y filtros que deciden qué tarjetas aparecen.

---

## 1. Cómo se activa el modo tarjetas y la paginación

### 1.1 Toggle grid / table

El estado de la vista vive en `ClientsDirectoryClient` (`apps/web/src/app/coach/clients/ClientsDirectoryClient.tsx`):

- `const [view, setView] = useState<'grid' | 'table'>('table')` — la vista **arranca en `'table'`** (tabla) por defecto.
- El cambio de vista lo dispara `DirectoryActionBar` vía la prop `onViewChange={setView}` (toggle entre `'grid'` y `'table'`).
- Cuando `view === 'table'` se renderiza `ClientsDirectoryTable`. En cualquier otro caso (`'grid'`) se renderiza el bloque de tarjetas: una grilla `motion.div` que mapea `gridClients.map((client) => <ClientCardV2 .../>)`.
- Un cambio de `view` (entre otros) resetea la paginación: el `useEffect` con dependencias `[search, riskFilter, statusFilter, programFilter, sortKey, sortDir, view]` ejecuta `setGridVisibleCount(48)`.

> Importante: la grilla solo se muestra si `sortedClients.length > 0`. Si el filtrado deja la lista vacía, en lugar de tarjetas se muestra una `GlassCard` "Sin resultados" (texto distinto si hay término de búsqueda `search`).

### 1.2 "Cargar más" — paginación de 48

- `const [gridVisibleCount, setGridVisibleCount] = useState(48)` — se muestran hasta **48 tarjetas** a la vez.
- `gridClients = sortedClients.slice(0, gridVisibleCount)` — la grilla solo renderiza las primeras `gridVisibleCount` de la lista ya filtrada+ordenada.
- Si `sortedClients.length > gridVisibleCount` se muestra un botón **"Cargar más (`N` restantes)"** donde `N = sortedClients.length - gridVisibleCount`.
- Al hacer clic: `setGridVisibleCount((n) => Math.min(n + 48, sortedClients.length))` — suma 48 más, topado al total.
- Cualquier cambio de búsqueda / filtros / orden / vista vuelve a poner el contador en 48 (efecto de reset descrito arriba), para no quedar mostrando "de más" tras un filtro.

### 1.3 Cómo llega `pulse` a cada tarjeta

`ClientsDirectoryClient` recibe `pulseByClientId: Record<string, DirectoryPulseRow>` (mapa indexado por `client.id`). En el `.map` de la grilla, por cada cliente toma `const pulse = pulseByClientId[client.id]` y lo pasa como prop a `ClientCardV2`. Si un cliente no tiene fila de pulse, `pulse` es `undefined` y la card degrada (ver defaults por dato más abajo).

`pulseByClientId` se construye a partir del array `DirectoryPulseRow[]` que produce el backend (sección 3), originado por `getCoachClientsPulse` → `getCachedDirectoryPulse` → `DashboardService.getDirectoryPulse`.

### 1.4 Props que `ClientsDirectoryClient` calcula y pasa a cada `ClientCardV2`

Por cada cliente del slice visible, el componente padre arma:

- **`subscriptionDaysRemaining`** (number | null): si el cliente tiene `subscription_start_date`, calcula `end = start + 1 mes` y `diff = ceil((end - hoy) / día)`. Si no hay fecha de inicio de suscripción → `null`. (Asume ciclo mensual fijo de 1 mes desde el inicio.)
- **`loginUrl`** (string): `coach && appUrl ? `${appUrl}/c/${publicIdentifier}/login` : ''`. Es el portal de login del alumno. `publicIdentifier` = `invite_code` del coach, o su `slug` si no hay código (helper `getCoachPublicIdentifier`).
- **`whatsappLink`** (string): si el cliente tiene `phone` → `https://wa.me/<telefono-solo-digitos>?text=<mensaje>` con el mensaje `Hola <nombre>, aquí tienes tu link de acceso a la app: <loginUrl>` (URL-encoded). Si no hay teléfono → `'#'`.
- **`activeProgramName`** (string | null): nombre del programa con `is_active === true` dentro de `client.workout_programs` (`activeProgram?.name || null`).
- **`remainingDays`** (number | null): se pasa `pulse?.planDaysRemaining ?? null` (días restantes del plan, calculado en backend; NO confundir con la suscripción).
- **`pulse`**: la `DirectoryPulseRow` del cliente (o `undefined`).

---

## 2. ClientCardV2 — cada dato que muestra la tarjeta

Componente: `apps/web/src/components/coach/ClientCardV2.tsx`. A continuación, cada dato visible, su significado, de dónde sale y cómo se calcula.

### 2.1 Variables derivadas del `pulse` (al inicio del componente)

- `adherencePct = pulse?.percentage ?? 0`
- `weightSeries` = mapeo de `pulse.weightHistory30d` a `{ value }[]` (o `[]` si no hay).
- `adherenceSeries` = mapeo de `pulse.adherenceHistory4w` (array de números) a `{ value }[]` (o `[]`).
- `currentWeight = pulse?.currentWeight`
- `weightDelta = pulse?.weightDelta7d`
- `score = pulse?.attentionScore ?? 0`
- `streak = pulse?.streak ?? 0`
- `energy = pulse?.latestEnergyLevel`
- `stars = energy != null ? min(5, max(0, round(energy / 2))) : 0` — convierte el nivel de energía (escala 0–10) a estrellas (0–5).
- `lastLog = lastLogMeta(pulse?.lastWorkoutDate)` — etiqueta y antigüedad en días del último entreno (ver 2.13).
- `nutritionPct = pulse?.nutritionPercentage ?? 0`
- `hasNutritionData = nutritionPct > 0`
- `nutritionRisk = pulse?.attentionFlags?.includes('NUTRICION_RIESGO') ?? false`
- `weekCur = pulse?.planCurrentWeek`, `weekTot = pulse?.planTotalWeeks`
- `weekPct = (weekCur && weekTot>0) ? min(100, round(weekCur/weekTot*100)) : 0` — porcentaje de avance del plan por semanas.
- `ringColor` = verde `#10B981` si `adherencePct > 80`, ámbar `#F59E0B` si `> 50`, rojo `#EF4444` si menor — color del anillo de adherencia.

### 2.2 Avatar con anillo de adherencia + inicial

- En la esquina sup. izquierda hay un `CircularProgressbar` (react-circular-progressbar) cuyo **`value` es `adherencePct`** (adherencia de entrenamiento %). El color del trazo es `ringColor` (verde/ámbar/rojo según el %).
- En el centro del anillo se muestra la **inicial del nombre**: `client.full_name?.[0] ?? '?'` (primera letra del nombre, o `?` si no hay nombre). No hay imagen de avatar real; la tarjeta usa la inicial.

### 2.3 Badge de nutrición baja (sobre el avatar)

- Si `nutritionRisk && hasNutritionData`, se muestra un badge circular rojo con `!` sobre el avatar. `title` y `aria-label` indican `Nutrición baja: <nutritionPct>%`. Significa que el flag `NUTRICION_RIESGO` está activo (adherencia nutricional < 60%) y además hay datos de nutrición.

### 2.4 Nombre del alumno (enlace al perfil)

- `client.full_name` renderizado como `Link` a `profileHref = /coach/clients/${client.id}` (abre la ficha del alumno).

### 2.5 Badge de atención (junto al nombre)

Componente `ClientCardV2AttentionBadge({ score, streak })`. Solo se renderiza si hay `pulse`. Lógica por umbrales:

- `score >= 50` → **"Atención urgente"** (rojo, animado).
- `score >= 25` (y < 50) → **"Revisar"** (ámbar).
- `score === 0 && streak > 10` → **"Destacado"** (verde, con estrella) — racha alta y sin banderas.
- En cualquier otro caso → **"On track"** (verde).

El `score` es `attentionScore` y el `streak` es la racha; ambos del pulse (ver sección 3).

### 2.6 Identificador (email)

- Bajo el nombre se muestra `client.email` — es el identificador visible del alumno en la card.

### 2.7 Botones de acción del encabezado de la card

Cuatro controles en la fila superior derecha (detallados en sección 4):

1. `ResetPasswordButton` (resetea la contraseña del alumno).
2. `ToggleStatusButton` (activa/pausa al alumno; `isActive = client.is_active !== false`).
3. Botón **Eliminar** (icono basura) → abre `AlertDialog` de confirmación.
4. `DropdownMenu` "Más opciones" (Ver perfil, Enviar WhatsApp, Entrenamiento, Nutrición).

### 2.8 Métrica "Adherencia" (mini stat)

- Etiqueta **"Adherencia"** + valor `${adherencePct}%` + barra de progreso al `adherencePct`.
- Es la **adherencia de entrenamiento de la última semana** (`pulse.percentage`): sets logueados últimos 7 días / sets planificados del programa activo (ver 3.3).

### 2.9 Métrica "Peso hoy" + delta 7d

- Etiqueta **"Peso hoy"** + `${currentWeight} kg` (o `—` si null).
- Debajo, el delta de 7 días: `${↑/↓}${|weightDelta|} (7d)` — flecha ↑ si `weightDelta > 0`, ↓ si `< 0`, sin flecha si 0; cadena vacía si `weightDelta == null`.
- `currentWeight` = peso del check-in más reciente con peso; `weightDelta7d` = diferencia (redondeada a 1 decimal) entre el peso actual y el primer check-in de hace ≥7 días (ver 3.5).

### 2.10 Métrica "Energía" (estrellas)

- Etiqueta **"Energía"** + 5 estrellas; se rellenan `stars` (= `round(energy/2)`, tope 5) en ámbar, el resto en gris.
- `energy` = `pulse.latestEnergyLevel` = `energy_level` del check-in más reciente (ver 3.8).

### 2.11 Métrica "Último log" (puntito de actividad)

- Etiqueta **"Último log"** + un punto de color (`dotClass`) + la etiqueta `lastLog.label`.
- Color del punto según días desde el último entreno: verde si `< 3` días, ámbar si `< 7`, rojo (pulsante) si `>= 7`.
- `lastLog` viene de `lastLogMeta(pulse.lastWorkoutDate)` (ver 2.13).

### 2.12 Mini-gráficos (sparklines)

Dos `SparkArea` (gráficos de área con recharts):

- **"Peso (30d)"**: serie `weightSeries` derivada de `pulse.weightHistory30d` (peso de cada check-in de los últimos 30 días, orden ascendente por fecha). Color azul `#007AFF`. Si no hay datos muestra "Sin datos".
- **"Adherencia (4 sem)"**: serie `adherenceSeries` derivada de `pulse.adherenceHistory4w` (cuatro porcentajes, uno por cada una de las últimas 4 semanas). Color verde `#10B981`. Si vacío → "Sin datos".

> El "heatmap/mini-gráfico de adherencia de 4 semanas" se materializa aquí como sparkline de 4 puntos (un valor de % por semana), no como rejilla de calor.

### 2.13 Helper `lastLogMeta` (etiqueta "Último entreno")

- Si no hay fecha → `{ label: 'Sin datos', days: 999 }`.
- `days = differenceInDays(hoy, fecha)`: `<= 0` → "Hoy"; `=== 1` → "Ayer"; resto → `Hace <days>d`.

### 2.14 Tarjeta de Nutrición (bloque condicional)

Solo si `hasNutritionData` (`nutritionPct > 0`):

- Encabezado: **"Baja adherencia nutricional"** si `nutritionRisk`, si no **"Nutrición"**.
- Valor `${nutritionPct}%` + barra de progreso (`min(100, nutritionPct)`), color rojo si en riesgo, verde si no.
- `nutritionPct` = `pulse.nutritionPercentage` = adherencia nutricional calculada por el motor `computeNutritionAdherence` (ver 3.6).

### 2.15 Bloque "Programa" (programa activo + semana + días restantes)

Si `activeProgramName` no es null:

- Etiqueta **"Programa"** + `activeProgramName` (nombre del programa activo).
- A la derecha: **`Sem <weekCur>/<weekTot>`** (semana actual del plan / total de semanas; `—` si falta el dato).
- Barra de progreso al `weekPct` (avance por semanas).
- Pie: **`<remainingDays> días restantes`** (si `remainingDays != null`, mínimo 0) o "Sin fechas de programa"; y si hay `weekTot`, agrega `· <weekTot> semanas totales`.
  - `remainingDays` = `pulse.planDaysRemaining` (ver 3.7).
  - `weekCur`/`weekTot` = `pulse.planCurrentWeek`/`planTotalWeeks`.

Si NO hay programa activo: bloque "Sin programa asignado".

### 2.16 Suscripción (días restantes)

Si `subscriptionDaysRemaining !== null`:

- Texto **"Suscripción: `<N> días`"** (o "Vencida" si `<= 0`). El número se pinta en rojo si `<= 5` días, si no en color de marca.
- `subscriptionDaysRemaining` lo calcula el padre desde `client.subscription_start_date` (inicio + 1 mes − hoy). **Es independiente del programa**: mide la suscripción comercial del alumno, no la duración del plan de entrenamiento.

### 2.17 Botones del pie de la card (atajos)

Fila inferior con accesos rápidos (ver sección 4): **WA** (solo si hay teléfono y loginUrl), **Perfil**, **Workout**, **Nutri**.

### 2.18 Diálogo de eliminación

- `AlertDialog` controlado por `deleteOpen`. Confirma "¿Eliminar a `<full_name>`?". Al confirmar ejecuta `deleteClientAction(client.id)` dentro de un `useTransition` (`runDelete`); si retorna `error`, lo muestra; si no, cierra el diálogo.

### 2.19 Resumen: defaults cuando falta pulse

Si `pulse` es `undefined`/`null`: `adherencePct=0`, sin series (sparklines "Sin datos"), `currentWeight=undefined` (muestra `—`), `weightDelta=undefined` (vacío), `score=0`, `streak=0`, sin estrellas de energía, `lastLog="Sin datos"` (punto rojo), `nutritionPct=0` (no se muestra el bloque de nutrición), sin semana de plan. El **badge de atención NO se renderiza** (solo aparece si hay `pulse`).

---

## 3. `DirectoryPulseRow` y la query que la computa (backend)

Tipo `DirectoryPulseRow` y método `DashboardService.getDirectoryPulse` en `apps/web/src/services/dashboard.service.ts`. Es la fuente de TODAS las métricas de la card. La query se ejecuta vía `getCachedDirectoryPulse` (React.cache, una sola carga por request) llamado por `getCoachClientsPulse`.

### 3.1 Campos de `DirectoryPulseRow`

`clientId`, `clientName`, `percentage` (adherencia entrenamiento %), `lastPlan`, `completedSets`, `totalSets`, `consumed {cal,prot,carb,fat}`, `target {cal,prot,carb,fat}`, `nutritionPercentage`, `lastWorkoutDate`, `lastCheckinDate`, `currentWeight`, `weightDelta7d`, `weightHistory30d []`, `adherenceHistory4w number[]`, `oneRMDelta`, `planDaysRemaining`, `planCurrentWeek`, `planTotalWeeks`, `attentionScore`, `attentionFlags []`, `streak`, `latestEnergyLevel`.

### 3.2 Datos que trae del backend (qué consulta)

`getDirectoryPulseInner(coachId, orgId?)`:

1. **`clients`**: `id, full_name` filtrados por `coach_id = coachId` y (si `orgId !== undefined`) por `org_id = orgId` o `org_id IS NULL`. Si no hay clientes → `[]`.
2. **`workout_logs`** (últimos 35 días, `logsFrom = hoy-35`): `client_id, logged_at, weight_kg, reps_done, plan_name_at_log`, en chunks de 120 IDs, tope `WORKOUT_LOGS_ROW_CAP = 2000` filas por chunk. Alimenta adherencia, 1RM, último plan.
3. **`lastWorkoutDate` exacto** vía RPC `get_clients_last_workout_date` (MAX server-side por cliente, en chunks), para no depender del tope de filas anterior. Map `lastWorkoutDateMap`.
4. **`check_ins`** (últimos 35 días): `client_id, created_at, date, weight, energy_level`. Alimentan peso actual, historial de peso, delta 7d, último check-in, energía.
5. **`workout_programs`** activos (`is_active=true`): `id, client_id, created_at, start_date, end_date, weeks_to_repeat, duration_days`. Se queda el más reciente por cliente (`programByClient`). Alimenta días restantes, semana, total de semanas, y `hasActiveWorkoutProgram`.
6. **Sets planificados** por programa vía RPC `get_workout_program_planned_set_totals` (chunks de 80 program IDs) → `plannedSetTotals`. Denominador de la adherencia.
7. **`daily_nutrition_logs`** (desde `logDateCutoff` = fecha de hace 7 días) con anidado denormalizado: `nutrition_meal_logs (meal_id, is_completed, consumed_quantity, nutrition_meals(... food_items(... foods ...)))` y los `target_*_at_log`. Alimenta adherencia + macros de nutrición.
8. **Streaks** vía RPC `get_coach_clients_streaks` (una llamada por coach, requiere sesión `authenticated`); fallback `get_clients_streaks_by_ids` para los que falten (ruta mobile/service_role).

Luego itera por cliente y construye cada fila:

### 3.3 `percentage` (adherencia de entrenamiento) y `completedSets`/`totalSets`

- `logsLastWeek` = logs con `logged_at >= hoy-7`. `logsCount = logsLastWeek.length` (cada fila de `workout_logs` ≈ un set logueado).
- `totalPlannedSets` = sets planificados del programa activo (de la RPC; fallback en memoria `plannedSetsFromProgram` sumando `sets` de los bloques de los planes).
- `percentage = totalPlannedSets > 0 ? min(round(logsCount/totalPlannedSets*100), 100) : 0`.
- `completedSets = logsCount`, `totalSets = totalPlannedSets`.
- `lastPlan` = `plan_name_at_log` del último log de la semana, o "Sin actividad reciente".

### 3.4 `lastWorkoutDate`

- Preferentemente del `lastWorkoutDateMap` (RPC, MAX exacto). Fallback: máximo `logged_at` en memoria. Null si no hay logs.

### 3.5 Peso: `currentWeight`, `weightHistory30d`, `weightDelta7d`

- `sortedChecks` = check-ins ordenados desc por `created_at`. `withWeight` = los que tienen `weight != null`.
- `currentWeight` = `weight` del check-in más reciente con peso (o null).
- `weightHistory30d` = check-ins con peso de los últimos 30 días, orden ascendente, mapeados a `{ date, value }` (usa `c.date` o los primeros 10 chars de `created_at`).
- `weightDelta7d` = `round((currentWeight - ref.weight)*10)/10`, donde `ref` = primer check-in con `differenceInDays(hoy, created_at) >= 7`. Null si no hay referencia o no hay peso actual.

### 3.6 Nutrición: `nutritionPercentage`, `consumed`, `target`

- Reconstruye, desde el select denormalizado, las entradas del motor: `mealsById` (comidas deduplicadas por id, normalizadas con `normalizeMealForMacros` + `day_of_week`), `logsByDate` (por fecha: `meal_id`, `is_completed`, `consumed_quantity`) y `targetByDate` (targets congelados `target_*_at_log`).
- Llama a `computeNutritionAdherence` (paquete `@eva/nutrition-engine`) con rango `[logDateCutoff, hoy-en-Santiago]`, resolutor de día de semana y `mealAppliesOn` por zona horaria de Santiago.
- `nutritionPercentage = round(summary.compliancePct)`.
- `consumed` = macros consumidos `{cal, prot, carb, fat}`; `target` = macros objetivo `{cal, prot, carb, fat}` (del summary). La card usa el % ; los macros viajan en la fila aunque la card no los pinta directamente.

### 3.7 Plan: `planDaysRemaining`, `planCurrentWeek`, `planTotalWeeks`

Helper `planMeta(activeProgram, now)`:

- `planTotalWeeks` = `weeks_to_repeat` (number) del programa o null.
- `endDate`: usa `end_date` si existe; si no, `start_date + planTotalWeeks*7`; si no, `start_date + duration_days`.
- `planDaysRemaining = differenceInDays(endDate, now)` (puede ser negativo = vencido); null si no se puede calcular.
- `planCurrentWeek`: `floor(diasDesdeInicio/7)+1`, topado a `planTotalWeeks` si existe.

### 3.8 `latestEnergyLevel`

- `energy_level` del check-in más reciente (`sortedChecks[0]?.energy_level ?? null`).

### 3.9 `streak` (racha)

- De `streakMap` (RPC `get_coach_clients_streaks`, fallback `get_clients_streaks_by_ids`). 0 si no se obtuvo. Representa la racha de adherencia/actividad del alumno calculada en Postgres.

### 3.10 `oneRMDelta` (delta de 1RM)

- `computeOneRMDelta(logs)`: compara el promedio del **máximo Epley 1RM diario** de la última semana (`hoy-7..hoy`) vs la semana previa (`hoy-14..hoy-7`).
- Epley: `weight * (1 + reps/30)`. Por día se toma el máximo; luego se promedian los días de cada ventana.
- `oneRMDelta = round((thisAvg - prevAvg)/prevAvg * 100)` (% de cambio). Null si falta alguna ventana o `prevAvg <= 0`.
- La card no lo pinta como número directo, pero alimenta el flag `FUERZA_CAYENDO` y el `attentionScore` (sección 3.11). `adherenceHistory4w` se computa con `adherenceForWindow` sobre 4 ventanas semanales (denominador = sets planificados).

### 3.11 `attentionScore` y `attentionFlags` (cálculo exacto)

`calculateAttentionScore(client)` suma puntos y empuja banderas:

- **`SIN_CHECKIN_1M`** (+25): hay `lastCheckinDate` y `differenceInDays(hoy, lastCheckinDate) > 30` (`CHECKIN_OVERDUE_AFTER_DAYS`). Nota: si nunca hubo check-in, NO suma (solo alerta si ya hubo y pasó >30d).
- **`SIN_EJERCICIO_7D`** (+25): el alumno tiene programa activo y (no hay `lastWorkoutDate`) o (`differenceInDays(hoy, lastWorkoutDate) >= 7`, `WORKOUT_INACTIVE_AFTER_DAYS`).
- **`NUTRICION_RIESGO`** (+20): `nutritionCompliance < 60` (es decir `nutritionPercentage < 60`). Este flag dispara el badge `!` de la card y el modo "riesgo" del bloque de nutrición.
- **`PROGRAMA_VENCIDO`** (+15): `planDaysRemaining !== null && <= 0`.
- **`PROGRAMA_POR_VENCER`** (+8): `planDaysRemaining !== null && <= 3` (y no vencido).
- **`FUERZA_CAYENDO`** (+15): `oneRMDelta !== null && oneRMDelta < -5` (1RM cayó más de 5%).

`attentionScore` = suma de los puntos; `attentionFlags` = lista de banderas activas. Estos umbrales (25/50) determinan el badge de la card (sección 2.5) y los filtros de riesgo (sección 6).

---

## 4. Acciones y enlaces de la card

### 4.1 Enlaces que arma

- `profileHref = /coach/clients/${client.id}` — ficha del alumno.
- `builderHref = /coach/builder/${client.id}` — editor de entrenamiento.
- `nutritionHref = /coach/nutrition-plans/client/${client.id}` — plan de nutrición del alumno.
- `loginUrl` (prop del padre) = `${appUrl}/c/${publicIdentifier}/login` — portal de login del alumno.
- `whatsappLink` (prop del padre) = `https://wa.me/<digitos>?text=Hola <nombre>, aquí tienes tu link de acceso a la app: <loginUrl>`.

### 4.2 Botones del encabezado de la card

- **`ResetPasswordButton`** (clientId, clientName): resetea la contraseña del alumno (genera credencial temporal).
- **`ToggleStatusButton`** (clientId, clientName, isActive): activa/pausa al alumno; `isActive = client.is_active !== false`.
- **Eliminar** (icono basura): abre `AlertDialog`; al confirmar llama `deleteClientAction(client.id)`.
- **DropdownMenu "Más opciones"**: 
  - "Ver perfil" → `router.push(profileHref)`.
  - "Enviar WhatsApp" (solo si `client.phone && loginUrl`) → `window.open(whatsappLink, '_blank', 'noopener,noreferrer')`.
  - "Entrenamiento" → `router.push(builderHref)`.
  - "Nutrición" → `router.push(nutritionHref)`.

### 4.3 Botones del pie de la card (atajos)

- **WA** (solo si `client.phone && loginUrl`): `<a href={whatsappLink} target="_blank">` — abre WhatsApp con el mensaje y el link de acceso.
- **Perfil** → `profileHref`.
- **Workout** → `builderHref`.
- **Nutri** → `nutritionHref`.

---

## 5. Métricas de pulso del encabezado War Room (CoachWarRoom)

`apps/web/src/app/coach/clients/CoachWarRoom.tsx` renderiza el encabezado del directorio que acompaña a las cards. Recibe `clients` (con `id, force_password_change, is_active`), `pulse: DirectoryPulseRow[]`, `activeFilter` y `onFilterChange`.

### 5.1 Header

- Título "Directorio de Alumnos" + `InfoTooltip`. Texto "panel operativo tipo War Room".
- "Actualizado al cargar la página" + botón **sync** (`router.refresh()`).
- **Portal alumnos**: muestra `loginUrl = ${appUrl}/c/${coachSlug}/login` y permite copiarlo al portapapeles (botón con Copy/Check).
- Botón **"Nuevo Alumno"** → abre `CreateClientModal`.

### 5.2 Las 6 stat cards (métricas de pulso, clicables = filtran)

Cada tarjeta es clicable y al hacer clic llama `onFilterChange(stat.filter)`:

1. **Total** = `clients.length`. Filtro `'all'`.
2. **Activos** = clientes con `!force_password_change && is_active !== false`. Filtro `'all'`.
3. **Atención** (⚠️) = `pulse.filter(p => p.attentionScore >= 25 && < 50).length` (= `reviewCount`). Filtro `'review'`.
4. **Riesgo** (🔴) = `pulse.filter(p => p.attentionScore >= 50).length` (= `urgentCount`). Filtro `'urgent'`.
5. **Avg Adher.** = `round(promedio de p.percentage)` (adherencia de entrenamiento media), con `%`. Filtro `'all'`.
6. **Nutri. baja** (🥗) = `pulse.filter(p => attentionFlags incluye 'NUTRICION_RIESGO').length` (= `nutritionLowCount`). Filtro `'nutrition_low'`.

Los números usan `AnimatedNumber` (animación de conteo). La tarjeta seleccionada se marca según `activeFilter`.

### 5.3 Banners de alerta (condicionales, debajo de las stat cards)

- **`urgentCount > 0`**: "`N` cliente(s) con atención urgente (score ≥ 50)" → botón Ver → filtro `'urgent'`.
- **`expiredProgramsCount > 0`** (`pulse` con `planDaysRemaining !== null && <= 0`): "`N` programa(s) vencido(s)" → filtro `'expired_program'`.
- **`pendingPassword > 0`** (clientes con `force_password_change`): "`N` alumno(s) con cambio de contraseña pendiente" → filtro `'password_reset'`.
- **`nutritionLowCount > 0`**: "🥗 `N` alumno(s) con cumplimiento nutricional bajo (<60%)" → filtro `'nutrition_low'`.
- **`noCheckin1m > 0 && urgentCount === 0`** (`pulse` con flag `SIN_CHECKIN_1M`): "ALERTA: `N` cliente(s) llevan más de 1 mes sin check-in" → filtro `'urgent'`.

---

## 6. Orden (sort) y filtros que deciden qué tarjetas se ven

### 6.1 Orden — `clientsDirectorySort.ts`

`sortClientsByKey(clients, pulseByClientId, sortKey, dir)` ordena la lista filtrada. Claves (`DirectorySortKey`) y sus comparadores:

- **`attention_score`** (default, dir desc): por `pulse.attentionScore` (0 si falta). Pone primero a los de mayor urgencia.
- **`name_asc`** (dir asc): `full_name.localeCompare(b, 'es')`.
- **`last_activity`** (dir desc): por timestamp de `pulse.lastWorkoutDate` (0 si null).
- **`adherence_desc`** (dir desc): por `pulse.percentage`.
- **`weight_delta`** (dir desc): por `|pulse.weightDelta7d|` (mayor cambio de peso primero).
- **`plan_days`** (dir asc): por `pulse.planDaysRemaining` (null → 99999, al final).

`defaultSortDir`: `'asc'` para `name_asc` y `plan_days`; `'desc'` para el resto. El estado inicial del sort es `attention_score` desc. Las etiquetas visibles están en `SORT_OPTIONS` (directory-types.ts): "Urgencia (default)", "Nombre A→Z", "Última actividad", "Adherencia ↓", "Peso: mayor cambio", "Días programa".

### 6.2 Filtros que afectan qué tarjetas aparecen

Antes de ordenar y paginar, `filteredClients` aplica 4 condiciones por cliente (`ClientsDirectoryClient`):

**a) Búsqueda (`search`)**: `matchesSearch` = el `full_name` o `email` (en minúsculas) incluye el término.

**b) Filtro de riesgo (`riskFilter`)** — `matchesRiskFilter(client, pulse, filter)`:
- `'all'` → todos.
- `'urgent'` → `pulse.attentionScore >= 50`.
- `'review'` → `25 <= attentionScore < 50`.
- `'on_track'` → `attentionScore < 25`.
- `'expired_program'` → `planDaysRemaining !== null && <= 0`.
- `'password_reset'` → `client.force_password_change`.
- `'nutrition_low'` → `attentionFlags` incluye `'NUTRICION_RIESGO'`.

**c) Filtro de estado (`statusFilter`)** — `matchesStatusFilter(client, filter)`:
- `'archived'` → solo `is_archived === true`.
- (En las demás vistas se **excluyen los archivados** primero: si `is_archived === true` → fuera.)
- `'any'` → todos los no-archivados.
- `'active'` → `is_active !== false && !force_password_change`.
- `'paused'` → `is_active === false`.
- `'pending_sync'` → `force_password_change` truthy.

**d) Filtro de programa (`programFilter`)** — `matchesProgramFilter(client, pulse, filter)`:
- `'any'` → todos.
- `'with_program'` → `client.workout_programs` tiene alguno con `is_active`.
- `'no_program'` → no tiene programa activo.
- `'expired'` → `pulse.planDaysRemaining !== null && <= 0`.

Solo pasan a las tarjetas los clientes que cumplen **las cuatro** condiciones. Cualquier cambio de cualquiera de estos (o del orden o de la vista) resetea la paginación a 48. Si `nonArchivedCount === 0 && archivedCount === 0`, se muestra `ClientsDirectoryEmpty` en vez del directorio.

> Scoping de fondo: los clientes que entran a esta vista ya vienen acotados por workspace (`getCoachClientsWithPrograms`): enterprise (org), team (pool) o standalone (sin org ni team), siempre con RLS como techo.
