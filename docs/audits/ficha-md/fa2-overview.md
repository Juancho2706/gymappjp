# 2. Pestaña Overview

La pestaña **Overview** (`activeTab === 'overview'`) es la vista de resumen de la ficha del alumno, renderizada dentro de `ClientProfileDashboard.tsx`. Ocupa una grilla de 12 columnas: la columna principal (`md:col-span-8`) apila la alerta superior, el bloque de cumplimiento + KPIs (`ProfileOverviewB3`), un par tarjeta de programa + snapshot de check-in, y la "Evolución Visual". La columna lateral (`md:col-span-4`) muestra la tarjeta "Métricas Clave".

Toda la data viene de `data` (resultado de `getClientProfileData` vía el RSC padre): `data.workoutHistory`, `data.compliance`, `data.activeProgram`, y `checkIns`. Ningún bloque del Overview vuelve a consultar el backend al renderizar (es todo derivación en cliente de lo ya cargado); la única escritura desde aquí es "Marcar como revisado" en el snapshot de check-in.

---

## 2.1 Alerta principal (ProfileTopAlertBanner)

Primer elemento de la columna principal. Recibe `alert={topAlert}`, calculado por `getProfileTopAlert(...)` en el padre. Es el banner contextual que surfacea la señal más urgente del alumno (riesgo de nutrición, falta de actividad, pagos, etc.). El detalle de su lógica corresponde a su propia función `getProfileTopAlert`; en Overview solo se monta como cabecera.

---

## 2.2 ProfileOverviewB3 — Cumplimiento semanal + KPIs

Componente cliente. Props:

- `workoutHistory: any[]` — historial de planes con bloques y `workout_logs`.
- `checkIns: { created_at, weight? }[]` — todos los check-ins del alumno.
- `compliance: ComplianceShape` — slice de métricas ya calculadas en el backend.
- `onViewNutrition?` — callback de navegación a la Zona A (Progreso) de nutrición; **no recomputa** ningún porcentaje, solo navega.

`ComplianceShape` consume de `compliance`: `workoutsThisWeek`, `workoutsPrevWeek`, `workoutsTarget`, `nutritionWeeklyAvgPct`, `nutritionPrevWeeklyAvgPct`, `checkInCompliancePercent`, `checkInCompliancePercentWeekAgo`, `currentStreak`, `planCurrentWeek`, `planTotalWeeks`, `nutritionCompliancePercent`.

### Cálculos que hace (todos en cliente)

- `target = max(1, workoutsTarget ?? 1)`.
- `workoutPct = min(100, round(workoutsThisWeek / target * 100))`; `prevWorkoutPct` igual con `workoutsPrevWeek`; `workoutDelta = workoutPct - prevWorkoutPct`.
- Nutrición: `nutAvg = nutritionWeeklyAvgPct ?? 0`, `nutPrev = nutritionPrevWeeklyAvgPct ?? 0`, `nutDelta = nutAvg - nutPrev`. Estos valores ya vienen calculados del motor de adherencia; el componente solo muestra y compara.
- Check-in: `checkPct = checkInCompliancePercent ?? 0`, `checkDelta = checkPct - checkInCompliancePercentWeekAgo`.
- `streak = currentStreak ?? 0`, `planCur = planCurrentWeek ?? 1`, `planTot = max(1, planTotalWeeks ?? 4)`.
- `sessions30d = countWorkoutDaysInRange(workoutHistory, hace 30 días, ahora)` (ver `profileOverviewUtils`).
- `calendarData = buildProfileActivityCalendarData(workoutHistory, checkIns, 371)` y `longestStreak = longestActivityStreakFromCalendar(calendarData)` — la mejor racha histórica de los últimos 371 días.
- `weightDelta30d`: ordena los check-ins por fecha descendente (`sortedCi`); si hay menos de 2, es `null`. Toma el peso del más reciente (`latest`) y el primer check-in cuya fecha sea `<= hace 30 días` como `baseline`. Si ambos existen, `weightDelta30d = (latest - baseline)` redondeado a 1 decimal.

### Bloque "Cumplimiento semanal" — 3 anillos (ComplianceRing)

Tres `CircularProgressbar` (lib `react-circular-progressbar`), uno por dimensión. Cada anillo muestra: porcentaje grande dentro del aro, etiqueta, un `valueText`, y una línea de delta "↑/↓/— vs sem. anterior (±N pts)" coloreada (verde sube / rojo baja / neutro).

| Anillo | `valueText` | `percentage` | Color del path | Acción |
|---|---|---|---|---|
| Entrenamientos | `wThis/target` | `workoutPct` | primario (`--theme-primary`, #007AFF) | — |
| Nutrición (7d) | `nutAvg%` | `min(100, nutAvg)` | verde ≥70, ámbar ≥50, rojo <50 | clic → `onViewNutrition`, link "Ver nutrición →" |
| Check-in | `checkPct%` | `checkPct` | verde ≥70, ámbar ≥40, rojo <40 | — |

El anillo de Nutrición es el único interactivo (se vuelve `<button>` si recibe `onClick`). El color de trail/texto se adapta a tema claro/oscuro (`isDark`, resuelto tras montar para evitar mismatch SSR).

### Grilla de 5 KPIs (kpiItems)

Cinco `GlassCard` con ícono, etiqueta, valor y hint:

1. **Mejor racha** — `${longestStreak} día(s)`, hint "histórico" (de `longestActivityStreakFromCalendar`).
2. **Sesiones** — `sessions30d`, hint "últimos 30 días" (`countWorkoutDaysInRange`).
3. **Adherencia entreno** — `workoutPct%`, hint `±workoutDelta% vs sem. ant.`.
4. **Δ Peso (30d)** — `weightDelta30d` con signo y unidad kg, o `—` si `null`; hint "check-ins".
5. **Sem. programa** — `planCur / planTot`, hint "ciclo activo".

---

## 2.3 ProfileProgramSummaryCard — Tarjeta de programa activo

Columna izquierda del par (debajo de los KPIs). Props: `activeProgram` (`data.activeProgram`), `compliance` (slice con `planCurrentWeek`, `planTotalWeeks`, `planDaysRemaining`), `isNutritionAtRisk`, `onViewNutrition`.

### Sin programa
Si `activeProgram` es falsy, renderiza un estado vacío: "Sin programa activo asignado."

### Con programa, muestra
- **Nombre del programa** (`activeProgram.name`) como título.
- **Barra de fases** (`ProgramPhasesBar`): fases parseadas con `parseProgramPhases(activeProgram.program_phases)`. Cada fase normaliza `{ name, weeks (mín 1), color? }`; se omite el bloque si no hay fases.
- **Semana ciclo**: `planCur / planTot` (`planCurrentWeek ?? 1`, `planTotalWeeks ?? 4` con mín 1) + `Progress` bar a `min(100, planCur/planTot*100)`.
- **Días restantes**: `daysLeft = max(0, planDaysRemaining ?? 0)`; un indicador de estado: verde "En track" si `daysLeft > 0`, ámbar "Ciclo vencido" si es 0.
- **Señal de nutrición** (separada del entreno): botón que muestra "Nutrición en riesgo" (rojo, punto pulsante) si `isNutritionAtRisk`, o "Nutrición en track" (verde) si no. Al clic dispara `onViewNutrition` (deep-link a Zona A de nutrición; **no recalcula** adherencia). Si no hay `onViewNutrition`, queda deshabilitado/no-clic.
- **Próximo entrenamiento**: calculado por `resolveNextProgramWorkout(activeProgram, new Date(), planCurrentWeek si > 0)`. Muestra `next.title`, `next.dayName` (con marca "· Hoy" si `isToday`), y conteo `next.exerciseCount ejercicio(s)`.

### resolveNextProgramWorkout (profileProgramUtils)
Lógica del "próximo entreno" del microciclo semanal:
- Toma `program.workout_plans`; si no hay, retorna `null`.
- Resuelve la **variante efectiva A/B** con `resolveEffectiveWeekVariant(program, plans, planCurrentWeek, now)` — cae a la variante que tenga planes si la del ciclo está vacía (evita null por A/B mal armado de una sola semana). Filtra planes con bloques, `day_of_week` no nulo y que matcheen la variante (`workoutPlanMatchesVariant`, considerando `ab_mode`).
- `todayDow = mondayBasedDayOfWeek(now)` (ISO 1=Lunes … 7=Domingo).
- De los planes con `day_of_week` entre 1 y 7 (`weekly`), elige el primero con `day_of_week >= todayDow` (orden ascendente), o el primero del orden si ninguno (wrap-around de la semana). Para días >7 hay un fallback análogo.
- Devuelve `{ dayOfWeek, dayName (WEEKDAY_NAMES o "Día N"), title, exerciseCount (nº de workout_blocks), isToday }`.

---

## 2.4 ProfileCheckInSnapshot — Snapshot del último check-in

Columna derecha del par. Props: `checkIn` (último check-in = `lastCheckIn`, ya ordenado por fecha desc en el padre), `clientId`, `onViewHistory`.

`CheckInRow` lee: `id`, `created_at`, `weight`, `energy_level`, `notes`, `reviewed_at`, `front_photo_url`, `side_photo_url`, `back_photo_url`.

### Sin check-in
Si `checkIn` es falsy: estado vacío "Aún no hay check-ins registrados." + link "Ver panel de progreso" → `onViewHistory`.

### Con check-in, muestra
- Título "Último check-in" + fecha relativa con `formatDistanceToNow(created_at, locale es)` (ej. "hace 3 días").
- **Foto** (`photo = front_photo_url || side_photo_url || back_photo_url`): si existe, miniatura clicable que abre un **modal/Dialog de detalle ampliado** ("Foto del check-in") con la imagen a tamaño completo (`object-contain`, hasta 70vh). El estado `open` controla el Dialog.
- **MetricRow Peso**: `${weight} kg` o `—`.
- **MetricRow Energía**: componente `EnergyStars` — convierte `energy_level` (0–10) a estrellas con `min(5, max(0, round(level/2)))` (escala de 5 estrellas; aria-label "Energía N de 10").
- **MetricRow Notas**: el texto de `notes` (whitespace preservado) o "Sin notas".

### Marcar como revisado
Si el check-in tiene `id`:
- Estado inicial `reviewed = Boolean(checkIn.reviewed_at)`.
- Si ya está revisado: badge verde "Revisado".
- Si no: botón "Marcar como revisado" que llama, dentro de `useTransition`, la **server action `markCheckInReviewed(clientId, checkIn.id)`**.

**Backend de markCheckInReviewed** (`client-detail.service.ts`): autentica al usuario, valida acceso con `assertCoachClientReadAccess`, y hace `UPDATE check_ins SET reviewed_at = now(), reviewed_by = user.id WHERE id = checkInId AND client_id = clientId AND reviewed_at IS NULL` (idempotente: no re-escribe si ya estaba revisado). La action revalida `/coach/clients/${clientId}`. Esto alimenta el tracking de tiempo de respuesta (enterprise). Errores se tragan en silencio (la UI queda sin marcar).

- Botón final "Ver historial en Progreso" → `onViewHistory`.

---

## 2.5 Evolución Visual (Último Mes)

`GlassCard` en la columna principal, debajo del par programa/check-in. No es un componente aparte: vive inline en `ClientProfileDashboard`.

- `checkInsWithPhotos`: filtra `checkIns` que tengan al menos una de las 3 fotos y toma los **primeros 3** (`.slice(0, 3)`).
- Muestra un `AppOnlyBadge` ("Mira las fotos con zoom y desliza entre ellas en la app de EVA") — la galería con zoom/swipe es feature solo de la app móvil; en web es estática.
- Si hay fotos: grilla de hasta 3 miniaturas (`front_photo_url || side_photo_url || back_photo_url`), cada una con overlay de fecha (`día mes`, locale es-ES). Imágenes `unoptimized`.
- Si no: estado vacío "Sin fotos recientes de check-in."

---

## 2.6 Métricas Clave (columna lateral)

`GlassCard` en `md:col-span-4`. Datos calculados en el padre:

- **Peso Actual** (`currentWeight`): `lastCheckIn?.weight || client.client_intake?.weight_kg || 0` — usa el peso del último check-in, y cae a la biometría inicial del intake.
- **Variación Semanal** (`weeklyWeightVariation`): `currentWeight - prevWeightCheckIn.weight`, donde `prevWeightCheckIn` es el **segundo** check-in más reciente (orden desc). Si no hay segundo check-in, es 0. Se muestra el valor absoluto con flecha: ArrowUpRight rojo si subió, ArrowDownRight verde si bajó, Minus neutro si 0.
- Header con un Dialog "Editar Biometría Inicial" (inputs altura/peso prellenados desde `client.client_intake`); los botones Guardar/Cancelar de ese modal no están cableados a una acción de guardado (UI estática en este punto).

---

## 2.7 profileOverviewUtils — qué calcula cada función

- **`checkInRegularityPercentAsOf(referenceDate, checkIns)`**: regularidad de check-in alineada con `getClientProfileData`. Busca el último check-in en o antes de `referenceDate`; si fue ese mismo día = 100%, baja linealmente hasta 0% a los 7 días. `round(100 - min(100, daysSince/7*100))`. (Usada en el backend de adherencia, no directamente en el render del Overview.)
- **`formatTrainingAgeLabel(subscriptionStart, fallbackCreatedAt)`**: antigüedad como alumno desde `subscription_start` (o `created_at`). Devuelve "Reciente", "N día(s)", "N mes(es)", o "N año(s) y M mes(es)".
- **`formatRelativeLastActivity(iso)`**: "Hoy", "Ayer", "Hace N días", "Hace N sem.", o fecha completa, según antigüedad de la última actividad.
- **`buildProfileActivityCalendarData(workoutHistory, checkIns, daysBack=371)`**: construye un mapa fecha→count para el rango `[hoy - daysBack, hoy]`. Cada `workout_log.logged_at` suma **+1** al día; cada check-in suma **+2** al día. Calcula `max` de counts y devuelve por cada día del intervalo `{ date, count, level }`, con `level = 0` si vacío o `min(4, ceil(count/max*4))` (escala 0–4 de intensidad para el heatmap).
- **`longestActivityStreakFromCalendar(data)`**: filtra días con `count > 0`, ordena fechas y cuenta la racha más larga de días **consecutivos** (`differenceInDays === 1`). Alimenta el KPI "Mejor racha".
- **`countWorkoutDaysInRange(workoutHistory, start, end)`**: cuenta días **distintos** (Set por fecha ISO) con al menos un `workout_log.logged_at` dentro del rango. Alimenta el KPI "Sesiones (30d)".

---

## 2.8 Navegación desde el Overview

- `goToNutritionProgress`: `handleTabChange('nutrition')` + scroll a la Zona A de Progreso de nutrición. Usado por el anillo de Nutrición y por la señal de nutrición de la tarjeta de programa. **No recalcula** adherencia — solo navega.
- `goToProgressHistory`: `handleTabChange('progress')` + scroll al panel de progreso. Usado por los enlaces "Ver historial / panel de progreso" del snapshot de check-in.


---

## Correcciones y adiciones (revision de completitud)

> Revision adversarial 2: refinamientos verificados contra el codigo. No cambian la arquitectura; precisan detalles para el rediseno.

### [MED] Backend de markCheckInReviewed: SQL now(), revalidación y swallow de errores mal atribuidos

Corregir 2.4: 'El servicio (`client-detail.service.ts`) autentica, valida con `assertCoachClientReadAccess`, y hace `UPDATE check_ins SET reviewed_at = <ISO del servidor>, reviewed_by = user.id WHERE id = … AND client_id = … AND reviewed_at IS NULL` (idempotente). Si hay error de DB el servicio LANZA. El wrapper action (`client-detail.actions.ts`) llama al servicio y luego hace `revalidatePath('/coach/clients/[clientId]')`. El swallow de errores ocurre en el COMPONENTE (`catch {}` en handleMarkReviewed): si la action lanza, la UI simplemente queda sin marcar.'

