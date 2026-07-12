# SPEC — Unidad `ficha-analisis-plan` (Sección 3, ficha del alumno del coach)

> **Alcance:** dos tabs de la ficha del alumno del coach — **Entreno** (`AnalisisTab.tsx`) y **Programa** (`PlanTab.tsx`).
> **Fuente de verdad (web):** `apps/web/src/app/coach/clients/[clientId]/TrainingTabB4Panels.tsx` (779 L) y `ProgramTabB7.tsx` (818 L) + helpers.
> **RN propios (disjuntos):** `apps/mobile/components/coach/clientDetail/AnalisisTab.tsx` (293 L) · `apps/mobile/components/coach/clientDetail/PlanTab.tsx` (187 L).
> **Read-only (otras unidades — NO tocar):** `shared.tsx`, `app/coach/cliente/[clientId].tsx`, charts `components/coach/charts/*`.
> **Regla dura:** cada afirmación cita `archivo:linea`. Copy VERBATIM del web. Tokens del theme, cero hex nuevo. NO commitear. Gate por unidad: `npx tsc --noEmit` en `apps/mobile` limpio (esta unidad es doc-only → sin cambios de código; el gate aplica a la unidad de implementación que consuma esta spec).

---

## 0. Cómo se montan y qué data reciben (contexto verificado)

- El screen padre `app/coach/cliente/[clientId].tsx:222-228` define 5 tabs: `Resumen · Progreso · Entreno · Programa · Nutrición`. El badge de **Entreno** = `derived.weeklyPRs.length || null` (`[clientId].tsx:225`); el de **Programa** = `data.activeProgram?.planCount || null` (`[clientId].tsx:226`). **READ-ONLY** — no tocar.
- Montaje: `AnalisisTab` recibe `data, selectedDate, onSelectDate, dayDetail, dayLoading` (`[clientId].tsx:287-288`); `PlanTab` recibe `data, onEdit` donde `onEdit=openBuilder` (`[clientId].tsx:289-290`, `openBuilder` en `:112-115` navega a `/coach/program-builder?clientId=…&clientName=…`).
- **Congelamiento (gotcha 6b): N/A directo.** Ambos tabs son componentes puros que reciben `data`/`dayDetail` por props; el fetch vive en el screen padre (`[clientId].tsx:77-101`, `load()` + `loadDay()` en `useEffect`). No tienen fetch propio → no aplica `useFocusEffect`. **Confirmado.**
- **Fuente de datos:** `getCoachClientDetail(clientId)` (`lib/coach-client-detail.ts:573-927`) y `getCoachClientDayDetail(clientId, date)` (`:931-993`). La analítica de entrenamiento viene **precomputada por RPC** (`:722-745`): `get_client_muscle_volume`, `get_client_exercise_prs`, `get_client_strength_series`, `get_client_daily_tonnage`, `get_client_weekly_prs`, `get_client_activity_dates`, `get_client_workout_day_counts`.
- **Claves de día (gotcha 6d): OK en el pipeline actual.** Las RPC devuelven `day` ya en zona Santiago (`:800-809` "la RPC ya devuelve `day` en zona Santiago (YYYY-MM-DD)"); `getSantiagoUtcBoundsForDay(date)` acota el día del detalle (`:932`); `getTodayInSantiago().iso` fija hoy (`[clientId].tsx:67`). **NINGÚN fix nuevo debe introducir prefijo UTC ni TZ del device.** ⚠️ Excepción a vigilar: `PlanTab.tsx:16` (`resolveProgramWeek`) y `:26` (`todayDow`) usan `new Date()`/`Date.now()` del device, no Santiago — ver §3.6.

---

# PARTE A — TAB ENTRENO (`AnalisisTab.tsx` ← `TrainingTabB4Panels.tsx`)

## A1. Layout / jerarquía (web = verdad)

Orden vertical del panel web (`TrainingTabB4Panels.tsx:353-591`, wrapper `<div className="space-y-5">`):

1. **Banner PR de la semana** (`:355-356` → componente `WeeklyPRBanner` `:47-101`).
2. **Fuerza — 1RM estimado (Epley)** (`:358-415`): título + **fila de chips de filtro por grupo muscular** (`:366-399`) + **grid 2/3/4 col** de `StrengthSparkCard` (`:401-414`).
3. **Balance muscular + Tonelaje** — grid `lg:grid-cols-2` (`:417-495`): card **Radar** (`:420-444`) y card **Tonelaje** (`:446-493`).
4. **Historial de sesiones + navegador** (`:497-590`): header con `<input type=date>` + pills recientes + detalle de sesión.

RN actual (`AnalisisTab.tsx:60-139`, wrapper `<View style={{ gap: 14 }}>`):
1. `WeeklyPRBanner` (`:62`).
2. Fuerza (`:65-70`) — **sin chips de filtro**, título distinto.
3. Radar (`:73-78`), **Volumen por grupo (extra RN)** (`:81-102`), Tonelaje (`:105-111`), **fallback series sin peso (extra RN)** (`:114-128`).
4. `SessionHistory` (`:131-137`).

Early return web: si `!hasRadar && !hasBars && weeklyPRs.length===0 && !hasStrength` → `return null` (`:349-351`, el padre decide el vacío). RN: si `!hasTrained` → `<EmptyState icon={Dumbbell} title="Sin entrenamientos" subtitle="Este alumno aún no registra entrenamientos." />` (`AnalisisTab.tsx:56-58`). **Adaptación idiomática aceptada** (RN pinta EmptyState propio en vez de delegar al padre).

## A2. Banner PR de la semana

**Web** (`TrainingTabB4Panels.tsx:47-101`): `Card padding="md"` con `background: linear-gradient(135deg, var(--ember-100), var(--sport-100))`, `border var(--ember-200)` (`:74-76`). Header "Récord de la semana" 13px `font-black uppercase` color `var(--ember-700)` con `Trophy` (`:78-83`). Cuerpo: `top.exerciseName` + `{newWeightKg} kg × {newReps}` font-display (`:84-88`), `Badge tone="success" +{pctChange}% 1RM` **solo si `pctChange != null`** (`:89-93`). Subline **SIEMPRE visible**: `Antes: {prevWeightKg} kg × {prevReps} · e1RM {prevOneRm} → {newOneRm} kg{more>0 && ` · +${more} ejercicio${more===1?'':'s'} más`}` (`:95-98`). Muestra **solo el top PR** (`prs[0]`) + contador textual de "más". Confetti: `useReducedMotion` respetado, `fired.current` → dispara **UNA vez** (`:48-65`).

**RN** (`components/coach/clientDetail/WeeklyPRBanner.tsx:38-105`): card **sólida naranja `#F59E0B`** (`:66`, hex crudo), texto blanco. Kicker `¡NUEVO RÉCORD ESTA SEMANA!` (`:73`), exercise + muscle (`:74-75`), **pager `{idx+1}/{prs.length}` con `ChevronRight`** para ciclar entre PRs (`:77-82`, `next()` `:53-57`). 3 stat-boxes: `{newWeightKg} kg × {newReps}` / `{newOneRm} kg` / `▲ {pctChange}%` — el 3º **solo si pctChange != null** (`:85-100`). El `prevOneRm` solo aparece dentro del 3º box (`:97`); el `Antes: {prevWeightKg} × {prevReps}` **nunca se muestra**. Confetti (`Confetti` `:12-35`, MotiView) **re-dispara en cada mount/next** sin chequeo reduce-motion (`:43-48, :53-57`), `CONFETTI_COLORS` hex fijos (`:9`).

**Divergencias:** paleta (naranja sólido vs gradient ember→sport tokenizado), falta línea "Antes:" incondicional, falta respeto a reduce-motion. Pager + haptics = adaptación RN.

## A3. Sección Fuerza

**Web** (`:358-415`): título `Fuerza — 1RM estimado (Epley)` + `<MetricInfo term="e1rm">` (`:361-364`). **Fila de chips scrolleable** (`:366-399`) — visible si `muscleGroupOptions.length > 1`: chip `Todos · {totalStrengthExercises}` + un chip `{group} · {count}` por grupo; activo `border-sport-500 bg-sport-500 text-white`, inactivo `border-[var(--border-subtle)] bg-surface-sunken text-muted` (`:371-397`). Al filtrar (`filteredStrengthExercises` `:326-331`) muestra **TODAS** las series del grupo, no solo 4. Grid `grid-cols-2 md:grid-cols-3 lg:grid-cols-4` de `StrengthSparkCard` (`:401-406`); empty `Sin series de fuerza para este grupo.` (`:407-413`).

`StrengthSparkCard` (`:104-156`): nombre truncado (`:122`) + **grupo muscular** (`:123`), **1RM actual grande** `font-display` (`:124-127`), delta textual `+{delta} kg período` / `Sin cambio en el periodo` color `var(--success-600)`/`var(--danger-600)`/muted (`:128-135`), sparkline SVG área `var(--sport-500)` opacity .16 + punto de pico `var(--ember-500)` (`:136-150`), pie `Última: {weightKg} kg × {reps}` (`:151-153`).

**RN** (`AnalisisTab.tsx:64-70`, `StrengthCard` `:142-175`): título `Fuerza por ejercicio (1RM estimado)` (`:67`) — **sin chips de filtro, sin MetricInfo**. Solo mapea los `strengthCards` fijos (4 del RPC, `coach-client-detail.ts:897`). `StrengthCard`: cards full-width, `AreaTrend` interactivo `#06B6D4` height 150 con scrub (`:158-159`), `Pill` de trend `▲ +{trend} kg` (oculto si `trend==null`, `:156`), línea de scrub `{label} · {weightKg} kg × {reps} → 1RM {oneRm} kg` **solo al hacer scrub** (`:163-167`), `MetricBox` × 3: Pico 1RM / Sesiones / Volumen total (`:168-172`). **No muestra** grupo muscular, ni 1RM actual como cifra principal, ni "Última serie" sin scrub, ni copy "Sin cambio en el periodo".

## A4. Radar de balance muscular

**Web** (`:283-293, :420-444`): `radarData` filtra `r.volume > 0`, ordena desc, top 8, labels `>10 chars → slice(0,9)+'…'` (`:283-293`). Título `Balance muscular · 30 días` + `<MetricInfo term="volumen">` (`:421-425`), `DarkRadar` SVG (`:159-226`, rings `var(--border-subtle)`, poly `var(--sport-500)`). Requiere `radarData.length >= 3` (`:295`). **Alerta de desequilibrio DENTRO de la card del radar**: solo `imbalances[0]`, copy `Posible desequilibrio: {stronger} ~{ratio}× más volumen que {weaker}`, `bg var(--warning-100)` icono `var(--warning-600)` texto `var(--warning-700)` (`:427-442`).

**RN** (`AnalisisTab.tsx:72-102`): card `Balance muscular (30d)` **sin MetricInfo** (`:75`), `MuscleRadar` (`charts/MuscleRadar.tsx:18-48`) con `rows.slice(0,8)` **sin filtrar volume>0 ni reordenar** (`MuscleRadar.tsx:20`), trunca a 9 chars **sin elipsis** (`:44`). Radar usa `theme.primary`/`theme.mutedForeground` (tokenizado, OK). **Card separada "Volumen por grupo (30d)" (extra RN, no existe en web)** (`:81-102`) con `ProgressBar` por grupo + **TODAS las imbalances** con copy `{stronger} entrena {ratio}× más volumen que {weaker}.` y colores hardcode `#F59E0B14/#F59E0B40/#F59E0B` (`:93-100`).

`detectVolumeImbalances` (`AnalisisTab.tsx:43`) usa el mismo package puro `lib/profile-analytics` (defaults take=6 minRatio=2) — **paridad de cálculo OK**.

## A5. Card de Tonelaje

**Web** (`:446-493`): título `Tonelaje por sesión · 7 días` + `<MetricInfo term="tonelaje">` (`:448-451`). `tonnageBars = tonnageSeries.slice(-7)` (`:341`). Barras con inicial de día `D/L/M/X/J/V/S` (`:347, :480-482`), **última barra `var(--sport-500)`, resto `var(--border-default)`** (`:474-476`), `radius var(--radius-xs)` (`:477`). Línea discontinua = promedio de las 7 (`:452-459, :343-346`), leyenda `Media móvil 7 ses.` (`:488-491`).

**RN** (`AnalisisTab.tsx:104-111`): título `Tonelaje diario + media móvil 7` (`:107`), `BarComposed` (`charts/BarComposed.tsx`, victory-native) grafica **TODA la serie (hasta 21 puntos del RPC)** (`coach-client-detail.ts:741` `p_max_days:21`), línea = `movingAvg` por punto (`:49`), `lineColor="#F59E0B"` hardcode (`:108`), sub `Barras = tonelaje del día · Línea = media móvil de 7 sesiones.` (`:109`). Sin iniciales de día, sin resaltar la última barra. Gate `hasWeighted && tonnagePoints.length >= 1` (`:105`).

## A6. Historial de sesiones

**Web** (`:497-590`): header `Historial de sesiones` + **`<input type=date>` con `CalendarSearch`** que permite cargar **CUALQUIER fecha** (`:501-518`, `handleHistoryDateChange` → `loadWorkoutForDate` `:243-250`). Pills de las **últimas 10** fechas recientes (`:333-336, :522-561`): día 2-dígitos + **mes abreviado** + **punto verde `var(--success-500)`** (`:557`); seleccionado `border-sport-500 bg-sport-100 text-sport-700` (`:536-537, :544, :552`). Empty pills `Sin sesiones registradas aún.` (`:562-566`). Detalle: `isPending` → `Cargando sesión…` (`:572-578`), sin datos → `Moon` + `Sin entrenamiento registrado para este día` (`:579-586`), con datos → `WorkoutDayReadOnly` (`:587`). **Auto-carga `mostRecent` al montar** (`:252-261`).

`WorkoutDayReadOnly` (`:618-778`): header `planTitle || 'Sesión'` + `{N} ej. · {M} sets` (`:640-646`). Por ejercicio: nombre + músculo (`:673-676`); **banner de sustitución de máquina ocupada** `Hizo {substitutedName} · sustituyó {name} (máquina ocupada)` con `ArrowRightLeft`, `border var(--warning-600)/25 bg var(--warning-600)/[0.08]` (`:669-686`); **micro-línea Meta** `Meta {weight}kg ×{reps} · {sets} series · RIR {rir} · tempo {tempo}` + **badge de progresión** (`progressionLabel` `:599-608`: `Lineal +X/sem` / `Doble progresión`) (`:652-702`); pills de series `{set_number}: {done}kg × {reps} · RPE {rpe} · RIR {rir}` con **color del peso según meta** (`over→success-600`, `under→warning-600`, `eq→strong`, `:704-736`) y **`'PC'` cuando `weight_kg` es null** (peso corporal, `:729`), `'—'` para reps null (`:731`); **notas del alumno por serie** con `StickyNote` (`:738-758`); **leyenda de jerga** (`:765-775`) con `<MetricInfo term="rpe">`/`"rir"`.

**RN** (`AnalisisTab.tsx:131-137, SessionHistory :177-238, SessionDetail :240-279`): `SessionHistory` — chips de **TODAS las fechas del año** (`workoutDates371`, `:186-189`), cada chip = **weekday abreviado + número SIN mes** (`:217-221`), sin punto verde, seleccionado = relleno `theme.primary` completo (`:218`). Navegación con **flechas prev/next** (`go(1)/go(-1)` `:192-197`, disabled en extremos `:226, :228`) + **swipe fling L/R** (`Gesture.Race` `:198-201`, con `Haptics.selectionAsync`). Si `sessions.length===0` → `return null` (`:203`, sin mensaje). Loading → `EvaLoader subtitle="Cargando sesión…"` (`:232-233`). `SessionDetail` (`:240-279`): título fijo `Detalle de la sesión` + pill de **tonelaje total (extra RN)** (`:261`); agrupa por ejercicio; pills `{weightKg ?? 0}×{repsDone ?? 0}{· RPE {rpe}}` (`:266-273`). Empty `Sin sets registrados este día.` (`:253-256`).

**Faltantes de datos (el modelo RN no los trae):** `WorkoutDaySet` (`coach-client-detail.ts:192-199`) solo tiene `exerciseName, muscleGroup, setNumber, weightKg, repsDone, rpe` — **falta** `substituted_exercise_name`, `target_weight_at_log`/prescripción del bloque, `note`, `rir`, y el `title` del plan (para el header). La query del día (`getCoachClientDayDetail` `:931-993`) solo selecciona `set_number, weight_kg, reps_done, rpe, logged_at` + `exercises(name, muscle_group)` (`:936-945`).

## A7. Mapa de interacciones — TAB ENTRENO

| # | Elemento (web:línea) | RN actual (línea) | Efecto | Divergencia |
|---|---|---|---|---|
| E1 | Chip de grupo muscular en Fuerza (`:368-397`) | **AUSENTE** | `setSelectedMuscle(group\|null)` → refiltra tarjetas (`:326-331`) | **Falta en RN** (P1) |
| E2 | `StrengthSparkCard` (web estático `:104-156`) | `StrengthCard` con **scrub táctil** en `AreaTrend` (`:158-159`, `onActiveIndex=setActive`) | web: no interactivo · RN: drag revela `{label} · kg × reps → 1RM` | **Gesto añadido en RN** — ver §5 |
| E3 | `<input type=date>` + `CalendarSearch` (`:503-517`) | **AUSENTE** (solo chips de días-con-sesión) | web: cargar CUALQUIER fecha | **Pérdida funcional RN** (P1) |
| E4 | Pill de sesión reciente (`:530-559`) | Chip de sesión (`:217-221`) | `onPress → onSelectDate(date)` (`:217`) → padre recarga `dayDetail` (`[clientId].tsx:91-101`) | contenido divergente (sin mes, sin punto verde) |
| E5 | — (web no tiene) | Flecha `ChevronLeft`/`ChevronRight` (`:226, :228`) | `go(-1)/go(1)` → mueve `selectedDate` una sesión (`:192-197`) + haptic | **Gesto añadido RN** (nav discreta) |
| E6 | — (web no tiene) | **Swipe fling L/R** sobre el bloque historial (`:198-201`) | `go(1)`/`go(-1)` | **Gesto añadido RN** — ver §5 |
| E7 | Tonelaje bars (web estático `:461-485`) | `BarComposed` con **press-state** (`BarComposed.tsx:47, :81`) | web: no interactivo · RN: tooltip Skia al presionar | **Gesto añadido RN** |
| E8 | Pager PR `{idx+1}/{prs.length}` (RN `WeeklyPRBanner:77-82`) | — (web muestra solo top + texto "+N más") | `next()` cicla PR + confetti + haptic | **Gesto añadido RN** — ver §5 |
| E9 | `<MetricInfo>` ×5 (e1rm/volumen/tonelaje/rpe/rir, `:363,424,450,770,773`) | **AUSENTE** | web: popover con glosario | **Falta en RN** (P1) |

---

# PARTE B — TAB PROGRAMA (`PlanTab.tsx` ← `ProgramTabB7.tsx`)

## B1. Layout / jerarquía (web = verdad)

Orden web (`ProgramTabB7.tsx:502-816`, wrapper `<div className="space-y-3.5 p-4">`):
1. **Header "PROGRAMA ACTIVO"** — **card inversa** (`:504-592`).
2. **Estructura del ciclo · N semanas** — si `structureWeeks > 1` (`:594-662`).
3. **Microciclo (L–D)** / **Días del programa** (`:664-690`).
4. **Editar en builder** (`:692-706`).
5. **Exercise detail Sheet** responsive (`:708-814`).

Empty (sin programa): card con `ClipboardX` + `Sin programa asignado` + `Este alumno no tiene un plan de entrenamiento activo.` + Link `Crear o asignar programa` (`:320-349`).

RN (`PlanTab.tsx:50-91`, wrapper `<View style={{ gap: 14 }}>`):
1. `StatCard` "Programa" con `Pencil` (`:52-73`) — **no inversa, sin "PROGRAMA ACTIVO", sin días restantes, sin fases**.
2. **(sin Estructura del ciclo)**.
3. Lista `plansView.map(DayCard)` (`:75-79`) — **solo días con plan, sin descansos**.
4. `Button "Editar en el builder" variant="outline"` (`:81`).
5. `BottomSheetModal` **@gorhom DIRECTO** (`:83-88`) — ⚠️ BOMBA -999.

Empty RN: `<EmptyState icon={Dumbbell} title="Sin programa activo" subtitle="Este alumno no tiene un programa asignado." />` **sin CTA** (`:28-30`).

## B2. Header del programa

**Web** (`:504-592`): superficie **inversa** `background var(--surface-inverse) border var(--border-inverse)` (`:505-508`) — "la única card intencionalmente inversa (dark en ambos temas)" (comentario `:41-43`). Label `PROGRAMA ACTIVO` en `var(--text-on-dark-muted)` (`:511-513`) + nombre `font-display text-lg font-extrabold` `var(--text-on-dark)` (`:514-516`). **Badge de vigencia** (`:518-526`): con fechas → `Badge tone={planDaysRemaining<=3?'warning':'sport'}` texto `{planDaysRemaining<=0?'Vencido':`${planDaysRemaining} días`}`; sin fechas → `DarkChip "En curso"`. Chips (`DarkChip` `:89-107`): `{isWeekly?'Semanal':'Cíclico'}` + badge A/B (`:531-535`) + `{weeksRepeat} sem. ciclo` + `{cycle_length} días / ciclo` (`:529-538`). **Barra de fases** apilada + leyenda si `phases.length>0` (`:541-572`, colores `PHASE_PALETTE` sport/ember/aqua/success/warning-500 `:52-58`). **Progreso**: con fechas → `Semana {planCurrentWeek} de {planTotalWeeks}` + `{weekProgressPct}%` + barra track `var(--border-inverse)` fill `var(--sport-500)` (`:575-586`); sin fechas → `Sin fechas inicio/fin en el programa · progreso por semanas no disponible` (`:588-590`).

**RN** (`PlanTab.tsx:52-73`): `StatCard` normal (`theme.card`), `CardHeader icon={LayoutGrid} title="Programa"` + `TouchableOpacity onPress={onEdit}` con `Pencil` (`:53-55`). Nombre `program.name` `Archivo_700Bold` (`:56`). `metaRow` de `Pill`s: `Cíclico`/`Semanal` (`:58`), A/B `A/B · {activeVariant} esta sem.` **tone="warning"** (`:59`), `{weeks_to_repeat} sem.` (`:60`), `Ciclo {cycle_length}d` (`:61`), **`{planCount} días` (extra, web no lo tiene)** (`:62`). Progreso: solo si `currentWeek` (`:64`), label `Semana del ciclo` + `{currentWeek}/{program.weeks_to_repeat}` (`:66-69`) — **denominador = `weeks_to_repeat`, no el total programado**, sin `%`, `ProgressBar value={currentWeek/weeks_to_repeat}` (`:70`). **Sin barra de fases, sin badge de días restantes, sin superficie inversa, sin fallback sin-fechas.**

`resolveProgramWeek` (`PlanTab.tsx:12-18`): cap a `weeks_to_repeat` — semánticamente distinto al `planCurrentWeek/planTotalWeeks` que el padre web inyecta desde compliance por fechas (ola0 nota: 12 sem / ciclo 4 → web "Semana 6 de 12 · 50%", RN "4/4").

## B3. Estructura del ciclo (AUSENTE en RN)

**Web** (`:594-662`): si `structureWeeks > 1` (`:257`), `SectionTitle Estructura del ciclo · {structureWeeks} semanas` (`:597`) + card con `grid repeat({structureWeeks}, 1fr)` (`:602`). Cada celda 26px color de fase (`phaseForWeek(wk)` `:260-269`), `opacity: cur?1:0.42` (`:616`), borde `2px solid TXT` en la semana actual (`:623`), letra `A/B` si abMode (`:606, :628`), número de semana `font-mono 9px` (`:630-635`). Leyenda de fases + `A/B = variante semanal alternada` (`:640-659`).

**RN:** **completamente ausente** (`PlanTab.tsx` va de header directo a la lista de días). Bloqueado por datos: `program_phases` no está en el select (ver §6).

## B4. Microciclo / Días

**Web** (`:664-690`): `SectionTitle {isWeekly?'Microciclo (L–D)':'Días del programa'}` (`:666`). Weekly → itera `[1..7].map(dow => renderDayCard(planByDow.get(dow),…))` (`:669-671`) — **renderiza los 7 días, con card de "Descanso" `opacity:0.72` para días sin plan** (`:362-390`). Cycle → `plansView.map` (`:684-688`) o mensaje `No hay días con ejercicios en este programa (revisa variantes de semana en el builder).` (`:673-681`).

`renderDayCard` con plan (`:392-473`): cuadro 34×34 con **etiqueta del día** (`Lun`…) en `sport-100/sport-700` (`:408-412`), título `plan.title || 'Entrenamiento'` + `Badge Hoy` si `isToday` (`:414-424`), subtítulo `{blocks.length} ej.{· grupos musculares (hasta 3)…}` (`:425-428`, `uniqueMuscleGroupsFromBlocks`), `ChevronRight rotate 90°` al expandir (`:430-433`). Hoy = borde `var(--sport-400)` + `boxShadow 0 0 0 1px var(--sport-400)` (`:396-401`). `openDow` inicia en `todayDow` → **el día de hoy arranca expandido** (`:206-207`).

**Filas de ejercicio + superseries** (`:435-471`): `groupContiguousSupersetRuns` (`@eva/workout-engine`) agrupa. Bloque suelto → `renderExerciseRow` (`:279-317`): **dot 2×2 color hasheado del grupo** (`muscleDotColor` `:60-65, :300-305`), nombre `text-sm`, `{sets}×{reps}` `font-mono tabular-nums muted` **oculto si ambos null** (`:281-284, :309-313`), `ChevronRight 15px var(--ink-300)` (`:314`). Superserie → bracket `border-l-[3px] border-l-[var(--sport-500)] bg-[var(--sport-100)]/50` (`:455`), label `Superserie {letter} · {n} ejercicios` (`:456-457`), chip ordinal `A1` sport-100/700 por miembro (`:293-299, :462`).

**RN** (`PlanTab.tsx:75-79, DayCard :93-129`): solo `plansView.map(DayCard)` (`:76`) — **no itera 1..7, los días sin plan desaparecen**; `isRest = plan.blocks.length===0` solo cubre planes vacíos existentes (`:95`). Mensaje cíclico vacío `Programa sin días cargados.` texto plano (`:78`). `DayCard`: badge 40×40 con **icono `Dumbbell`/`Moon`** (no la etiqueta del día, `:99-101`); el `dow` va como texto uppercase aparte (`dayName` `:104`); título `plan.title` o `Descanso` (`:108`), subtítulo `{blocks.length} ejercicios` **sin grupos** (`:109`); Pill `plan.week_variant` (extra, web no lo muestra por día, `:105`) + Pill `Hoy` (`:106`). Hoy = solo `borderColor theme.primary+'66'` **sin ring/shadow** (`:97`). `ChevronDown rotate 180°` (`:111`). **`expanded` inicia vacío → nada expandido por defecto** (`:25`). Filas (`:114-124`): **lista plana sin agrupar superseries**, cada fila = card con borde propio `styles.blockRow` (`:176`), sin dot muscular (músculo como subtítulo, `:120`), `{sets}×{reps}` `theme.primary Archivo_700Bold` **siempre visible** (`:122`), sin chevron. `onPress={() => onBlock(block)}` abre el sheet (`:117`).

`todayDow` RN: `new Date().getDay()===0?7:new Date().getDay()` (`:26`) — device TZ, no Santiago (ver §3.6 gotcha 6d).

## B5. Sheet de detalle de ejercicio ⚠️ BOMBA -999

**Web** (`:708-814`): `Sheet` responsive — `useSheetSide()` (`:77-87`) devuelve `'bottom'` si `≤767px`, `'right'` si no (drawer lateral en desktop). `SheetContent side={sheetSide}` `max-h-[88vh] rounded-t-[20px]` en bottom (`:716-723`). Contenido: handle en bottom (`:726-728`), `SheetTitle {ex.name}` (`:730-732`), `SheetDescription` con chip de grupo muscular `Target` o `Ejercicio del programa` (`:734-754`), **`ExerciseMediaDemo`** poster `thumbnail_url` + GIF `gif_url` on-demand con crossfade + placeholder `PlayCircle` + spinner `Loader2` (`:110-193, :756-763`), **tabla de prescripción** con iconos sport (Dumbbell/Weight/Timer/Gauge/Clock) + valor `font-mono 15px` orden `series×reps → peso → descanso → RIR → tempo` (fila series×reps solo si sets||reps != null; RIR solo si `!== ''`) (`:477-500, :766-787`), **notas del coach** `NOTAS DEL COACH` header display 800 sobre SUNKEN (`:790-802`), `Button variant="secondary" Cerrar` (`:804-811`).

**RN** (`PlanTab.tsx:83-88, ExerciseDetail :131-163`): **`<BottomSheetModal ref={sheetRef} index={0} snapPoints={['70%']} enableDynamicSizing={false} enablePanDownToClose>` de `@gorhom/bottom-sheet` DIRECTO** (import `:4`, ref tipo `BottomSheetModal` `:23`). Contenido `ExerciseDetail`: título `{exerciseName}` (`:143`) + grupo muscular como **texto plano muted** (`:144`, sin chip/Target), `Image` **solo `gifUrl`** (`:145-147`, sin poster/placeholder/error, height 220 vs 150 web), tabla de prescripción **sin iconos ni contenedor con borde** (solo hairline entre filas) valor `Archivo_700Bold` no mono, orden `series → peso → descanso → tempo → RIR` (`:133-139, :148-155`), fila `Series × reps` **siempre visible** (`:134`), RIR **no filtra string vacío** (`:138`). Notas: bloque `theme.secondary` **sin header "NOTAS DEL COACH"** (`:156-160`). **No hay botón "Cerrar"** (solo `enablePanDownToClose`).

⚠️ **BOMBA -999 (gotcha 6a) — CRÍTICO.** `PlanTab.tsx:83` usa `@gorhom/bottom-sheet` crudo con `snapPoints={['70%']}` fijo + `enableDynamicSizing={false}`. Bajo el stack actual (`@gorhom/bottom-sheet@5.2.14` escrito para reanimated 3 + `react-native-reanimated@4.1.7` + RN 0.81.5 + Expo SDK 54 New Arch/Fabric), el primer `present()` puede resolver snap points contra `INITIAL_LAYOUT_VALUE = -999` → sheet montado off-screen (invisible), "no abre al primer tap, sí tras visitar otra tab" (`components/Sheet.tsx:116-145` documenta la causa raíz). Este sheet muestra el **detalle del plan/ejercicio = CRÍTICO para el flujo del coach**.
**FIX OBLIGATORIO (reparación central de la unidad):** migrar al wrapper `<Sheet nativeModal>` (`components/Sheet.tsx:155-330`, path RN `<Modal>` que bypasea @gorhom, content-hug con `maxDynamicContentSize` cap desde el mayor snap fraction, swipe-down-to-close vía `PanResponder` preservado `:186-193, :302`). API `open/onClose/title/footer/scrollable` — convertir `selected != null` en `open`, `openBlock`/dismiss en `onClose`. **Preserva el gesto** (swipe-down) y **repara el flujo**.

## B6. Editar en builder

**Web** (`:696-706`): `Link` a `/coach/builder/${clientId}?programId=${activeProgram.id}` (abre el builder **cargado con el programa activo**), `buttonVariants({variant:'sport', size:'lg'})` full, `PencilLine` + `Editar en builder`.

**RN** (`PlanTab.tsx:81`): `Button label="Editar en el builder" variant="outline" leftIcon={Pencil} onPress={onEdit} full`. `onEdit=openBuilder` (`[clientId].tsx:112-115`) navega a `/coach/program-builder?clientId=…&clientName=…` — **NO pasa `programId`** (verificar si el program-builder RN resuelve el programa activo por clientId). Divergencia: variante `outline` vs `sport` primaria, texto `Editar en el builder` vs `Editar en builder`.

## B7. Mapa de interacciones — TAB PROGRAMA

| # | Elemento (web:línea) | RN actual (línea) | Efecto | Divergencia |
|---|---|---|---|---|
| P1 | `Pencil`/onEdit en header (RN `:53-54`; web no lo tiene aquí) | `TouchableOpacity onPress={onEdit}` (`:54`) | navega al builder (`openBuilder`) | RN añade botón lápiz en header (extra) |
| P2 | Badge vigencia (`:518-526`) | **AUSENTE** | web: texto Vencido/N días/En curso | **Falta RN** (P1) |
| P3 | Celda de semana en Estructura del ciclo (`:608-636`) | **AUSENTE (sección entera)** | web: `title` tooltip de fase | **Falta RN** (P1) |
| P4 | Card de día → expandir (`:403-405`) | `TouchableOpacity onPress={onToggle} disabled={isRest}` (`:98`) | `toggle(id)` add/del del `Set expanded` (`:46-48`) | web expande hoy por defecto; RN inicia colapsado |
| P5 | Fila de ejercicio → abrir sheet (`:286-289`) | `TouchableOpacity onPress={() => onBlock(block)}` (`:117`) | `openBlock(block)` → `setSelected` + `present()` (`:42-45`) | ⚠️ BOMBA -999 (ver B5) |
| P6 | Cerrar sheet: `Button Cerrar` (`:804-811`) + backdrop | **AUSENTE botón** — solo `enablePanDownToClose` (`:83`) | web: `setSheetOpen(false)` | **Falta botón Cerrar RN** (P2) |
| P7 | `Link Editar en builder` (`:696-706`) | `Button onPress={onEdit}` (`:81`) | navega al builder | variante/texto/programId divergen |
| P8 | Empty state CTA `Crear o asignar programa` (`:339-345`) | **AUSENTE** (EmptyState sin botón, `:28-30`) | web: Link a `/coach/builder/${clientId}` | **Falta CTA RN** (P1) |
| P9 | — | Chevron rotate en DayCard (`:111`) | señal visual de expandido | adaptación (ChevronDown 180° vs web ChevronRight 90°) — aceptada |

---

## 1. Hallazgos Ola 0 (`docs/rn-port/ola0-hallazgos.json`)

Ambos tabs tienen bloque de auditoría en ola0 (17 discrepancias cada uno). Referencia: `TrainingTabB4Panels` (evidencia web línea ~7301) y `ProgramTabB7`/`PlanTab` (línea ~10775).

### ENTRENO (`AnalisisTab.tsx`) — 2×P0, 8×P1, 7×P2
- **P0** — Detalle de sesión: **banner de sustitución de máquina ocupada AUSENTE**; el modelo `WorkoutDaySet` ni trae `substituted_exercise_name` (fix explícito web B.13/AC-C6). Requiere ampliar `getCoachClientDayDetail`.
- **P0** — Series a peso corporal se pintan como **"0 kg"** (`AnalisisTab.tsx:270` `{weightKg ?? 0}×…`) en vez de **"PC"** (web `:729`) y "—" para reps null.
- **P1** — Micro-línea "Meta" (prescripción) + badge de progresión ausente.
- **P1** — Color del peso según meta (superó/no alcanzó) ausente (todos pintados `theme.foreground`).
- **P1** — Notas del alumno por serie (StickyNote) ausentes (falta campo `note`).
- **P1** — Filtro por grupo muscular en Fuerza (chips + empty state) ausente (RN solo top-4 fijo).
- **P1** — Selector de fecha arbitraria (`<input date>` + `CalendarSearch`) ausente; empty-state sin `Moon` y con otro copy.
- **P1** — Auto-selección de la sesión más reciente al montar: RN arranca en HOY (`[clientId].tsx:67`); si hoy no hay sesión, `sidx=-1` y **ambas flechas quedan muertas** (`:226, :228`), ningún chip resaltado.
- **P1** — Tooltips MetricInfo (e1rm/volumen/tonelaje/rpe/rir) + leyenda de jerga ausentes (existe `components/InfoTooltip.tsx` reutilizable).
- **P1** — Colores hardcodeados fuera del theme: `#F59E0B*` (`:94-96, :108`), `#06B6D4` (`:159, :169`), `WeeklyPRBanner` `#F59E0B` (`:66`) y `CONFETTI_COLORS`. **Rompe claro/oscuro + white-label + contrato de tokens.**
- **P1** — Banner PR: identidad visual/contenido divergen (naranja sólido vs gradient ember/sport; falta "Antes: …" incondicional; confetti sin reduce-motion).
- **P2** — Tarjetas de fuerza (falta grupo muscular / 1RM actual / "Última serie" sin scrub / copy "Sin cambio en el periodo").
- **P2** — Card de tonelaje (ventana 21 vs 7, sin resaltar última barra, sin iniciales de día).
- **P2** — Alerta de desequilibrio: ubicación (card extra RN vs card del radar), cantidad (todas vs `imbalances[0]`), copy.
- **P2** — Radar: falta `filter(volume>0)+sort desc` antes del slice, falta elipsis al truncar, falta MetricInfo.
- **P2** — Pills de sesiones: sin mes (ambiguo cruzando meses), sin punto verde, sin empty-state.
- **P2** — Header del detalle: falta `planTitle`, conteo `ej./sets`, número de serie y RIR en las pills.

*Extras RN sin equivalente web (NO eliminar, regla dura):* card "Volumen por grupo (30d)" con `ProgressBar` (`:81-102`), fallback "Volumen por grupo · series" para calistenia (`:114-128`), pill de tonelaje total (`:261`), pager de PRs + muscleGroup en el banner. *Adaptaciones NO reportadas:* swipe/haptics, scrub táctil en charts, EmptyState de tab.

### PROGRAMA (`PlanTab.tsx`) — 8×P1, 9×P2
- **P1** — Header "PROGRAMA ACTIVO" como card **inversa** ausente (RN usa StatCard normal).
- **P1** — Badge de vigencia (días restantes / Vencido / En curso) ausente (`end_date` disponible, no usado).
- **P1** — Barra de fases + leyenda ausente; **`program_phases` no está en el select** (`coach-client-detail.ts:694`).
- **P1** — Sección "Estructura del ciclo · N semanas" ausente (depende de `program_phases`).
- **P1** — Semántica del progreso: RN usa `weeks_to_repeat` como denominador; web usa total programado por fechas + `%` + fallback sin-fechas.
- **P1** — Microciclo L–D: RN no itera 1..7 ni pinta cards de "Descanso" para días sin plan; sin section titles.
- **P1** — Superseries: RN pinta lista plana; **`superset_group` no está en el select** (`groupContiguousSupersetRuns` lo requiere).
- **P1** — Empty state sin programa: falta CTA "Crear o asignar programa".
- **P2** — Media del sheet: falta poster `thumbnail_url` (**no en el select** `:699`), placeholder, spinner; height 220 vs 150.
- **P2** — Tabla de prescripción: sin iconos sport, sin contenedor con borde, orden RIR/tempo invertido, fila series×reps no condicionada, RIR no filtra `''`.
- **P2** — Sheet: falta chip de músculo con `Target`, header "NOTAS DEL COACH", botón "Cerrar".
- **P2** — Botón builder: `outline` vs `sport`, texto, `programId`.
- **P2** — Badge A/B: RN `tone="warning"` vs web `sport`; RN usa variante del ciclo sin fallback efectivo (el label puede contradecir los días mostrados).
- **P2** — Card de día: falta etiqueta del día en el cuadro, resumen de grupos, ring de hoy, expandir-hoy-por-defecto.
- **P2** — Fila de ejercicio: falta dot muscular hasheado, sets×reps mono muted condicional, chevron; RN usa cards anidadas vs hairline.
- **P2** — Mensaje cíclico sin días: RN texto plano vs card con copy accionable.
- **P2** — Chips del header: alinear copys (`N sem. ciclo`, `N días / ciclo`); decidir Pill `planCount` y `week_variant` por día (extras RN).

**Causa raíz transversal (Programa):** la query mobile (`coach-client-detail.ts:691-705`) **no trae `program_phases`, `superset_group`, ni `exercises.thumbnail_url`**, y no calcula `planCurrentWeek/planTotalWeeks/planDaysRemaining` desde `start/end_date` como el compliance web. Varios P1 se destraban ampliando ese select y `ActiveProgramInfo`/`ProgramBlock` (`:121-155`). Todos los fixes propuestos usan tokens ya en el contrato (surface-inverse, text-on-dark*, sport/ember/aqua/success/warning-500) — ninguno toca la paridad de 86 tokens.

## 2. Hallazgos ronda 5

`docs/audits/rn-parity-qa/r5-audit-coach-core.md`:
- **§3.4 (`:128`)**: "Paneles de tabs (Overview/Progreso/**Entreno/Programa**/Nutrición) + dossier — **no auditados a fondo (R5.3)**. Cada `clientDetail/*Tab.tsx` requiere pasada propia vs su panel web (`TrainingTabB4Panels`, `ProgramTabB7`, …)." → **Esta SPEC es esa pasada a fondo pendiente.**
- **`:119`**: confirma que el set de tabs y el estilo de pill **COINCIDEN** (5 tabs, sin Facturación, pill `h-38 px-3.5 gap-1.5 border-1.5` activo sport-500) — el chrome de tabs NO es parte de esta unidad (owner `ficha-shell-hero`).

## 3. Estado RN actual (divergencias obvias con citas)

1. **BOMBA -999** — `PlanTab.tsx:4, :23, :83` usa `@gorhom/bottom-sheet` crudo con snap fijo 70%. Fix obligatorio → `<Sheet nativeModal>` (`components/Sheet.tsx:145, :270-330`).
2. **Datos incompletos (Programa)** — `coach-client-detail.ts:694-705` no selecciona `program_phases`/`superset_group`/`thumbnail_url`; `ActiveProgramInfo`/`ProgramBlock` (`:121-155`) no los declaran. Bloquea §B3, §B4-superseries, §B5-poster, §B2-badge (parcial).
3. **Datos incompletos (Entreno-día)** — `WorkoutDaySet` (`:192-199`) y la query (`:936-945`) no traen `substituted_exercise_name`, prescripción del bloque, `note`, `rir`, `plan.title`. Bloquea los 2×P0 + P1 del detalle de sesión.
4. **Hex crudos fuera del theme** — `AnalisisTab.tsx:94-96, :108, :159, :169`; `WeeklyPRBanner.tsx:9, :66`. Violan el contrato de tokens (`specs/redesign-eva-ds/token-contract.md`); reemplazar por `theme.warning`/`theme.primary`/`theme.success` + tokens ember/warning (charts: `#06B6D4` no pertenece a ninguna ramp del DS — `global.css:42-75`).
5. **Progreso semanal (Programa)** — `PlanTab.tsx:12-18, :64-72` calcula su propia semana capada a `weeks_to_repeat` sin `%` ni fallback (divergencia semántica con web).
6. **Gotcha 6d (device TZ, no Santiago)** — `PlanTab.tsx:16` (`Date.now()` en `resolveProgramWeek`) y `:26` (`new Date().getDay()` en `todayDow`) usan la TZ del device. La web usa `mondayBasedDayOfWeek(new Date())` (`profileProgramUtils.ts:18-21`) — mismo patrón local, pero el gotcha institucional pide **día calendario Santiago** para claves de día. **PENDIENTE-DECISION** si se endurece a `getSantiagoIsoYmdForUtcInstant`; hoy es paridad-con-web (ambos device-local) → NO es regresión, se anota como riesgo.
7. **Auto-selección (Entreno)** — `[clientId].tsx:67` arranca `selectedDate` en HOY; si hoy no hay sesión, las flechas de `SessionHistory` (`AnalisisTab.tsx:226, :228`) quedan muertas (P1 ola0). El swipe sí funciona (`:198-201`).

## 4. GOTCHAS DE CLASE aplicables a esta unidad

- **6a (@gorhom -999):** `PlanTab.tsx:83` es el candidato exacto. **Migrar a `<Sheet nativeModal>`.** Es la reparación central.
- **6b (congelamiento):** N/A — ambos tabs reciben `data`/`dayDetail` por props del padre. Confirmado, no introducir fetch propio.
- **6c (Fabric 45798, focus TextInput):** N/A — estos tabs no tienen `TextInput` con estilo condicional por focus (el `EditClientForm` vive en el padre, read-only).
- **6d (claves de día Santiago):** el pipeline actual (RPC) ya devuelve `day` en Santiago. NO introducir prefijo UTC/TZ device en fixes nuevos. Vigilar `PlanTab.tsx:16, :26` (ver §3.6).
- **6e (notificaciones locales):** N/A — sin scheduling en esta unidad.

## 5. PENDIENTE-DECISIÓN-CEO (gestos/flujos que NO se auto-sancionan)

1. **Chart scrub táctil (Entreno)** — RN `AreaTrend` (`:158-159`) y `BarComposed` (`:81`) son interactivos (drag/press revela valores); la web es estática. **Gesto añadido en RN.** ¿Se conserva como mejora o se alinea a estático?
2. **Swipe fling en historial (Entreno)** — `AnalisisTab.tsx:198-201` permite cambiar de sesión con swipe L/R; la web no. **Gesto añadido.** ¿Conservar?
3. **Pager de PRs (Entreno)** — `WeeklyPRBanner.tsx:77-82` cicla entre PRs con tap; la web muestra solo el top + "+N más" (texto). **Gesto + cambio de contenido.** ¿Conservar pager o alinear a top-only?
4. **Selector de fecha arbitraria (Entreno)** — la web permite inspeccionar CUALQUIER día (`<input date>`, `:503-517`); RN solo días-con-sesión vía chips. Restaurar exige un `DateTimePicker` nativo = **nuevo gesto/superficie**. Es pérdida funcional real (P1) → decidir si se restaura con picker nativo o se acepta el gap.
5. **Editar-en-builder sin `programId` (Programa)** — `onEdit` RN (`[clientId].tsx:112-115`) navega sin `programId`; la web lo pasa. Verificar que el program-builder RN resuelva el programa activo por `clientId`; si no, es cambio de flujo.

## 6. Notas de datos / queries (para la unidad de implementación)

- **Sin queries propias:** ambos tabs consumen `data`/`dayDetail`. Los fixes de datos se hacen en `lib/coach-client-detail.ts` (**archivo AJENO** — va a `cambiosShell`, no se toca desde los tabs; coordinar con owner `ficha-shell-hero`).
- **Programa — ampliar select (`:694-705`) + tipos (`:121-155`):** añadir `program_phases` a `workout_programs`, `superset_group` a `workout_blocks`, `thumbnail_url` a `exercises`. Calcular `planDaysRemaining`/`planTotalWeeks` desde `start/end_date`.
- **Entreno-día — ampliar `getCoachClientDayDetail` (`:936-945`) + `WorkoutDaySet` (`:192-199`):** añadir `substituted_exercise_name`, `note`, `rir`, prescripción del bloque (`target_weight_kg`/`target_weight_at_log`/`reps`/`sets`/`tempo`/`progression_mode`/`progression_value`) y `workout_plans.title`.
- **Lógica compartida (NO reimplementar):** `filterPlansForStructureView`/`resolveActiveWeekVariantForDisplay`/`effectiveWeekVariantFromPlans` (`lib/program-week-variant.ts`), `groupContiguousSupersetRuns` (`@eva/workout-engine`), `detectVolumeImbalances`/`selectStrengthCardsFromSeries` (`lib/profile-analytics`) — portar solo la UI, reusar los packages puros. `muscleDotColor`/`parseProgramPhases`/`uniqueMuscleGroupsFromBlocks` son portables (web `ProgramTabB7.tsx:60-65`, `profileProgramUtils.ts:23-32`, `profileProgramStructureUtils.ts:34-41`).
- **Charts compartidos** (`components/coach/charts/*`, `ProgramPhasesBar.tsx`) son de otra unidad — cambios de tokens en ellos van a `cambiosShell`.
