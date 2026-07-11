# SPEC §8 Programa activo (day-cards + fase + pendientes) — `active-program`

**Unidad:** `active-program` · Sección 2 (dashboard alumno)
**Fuente de verdad (web):**
- `apps/web/src/app/c/[coach_slug]/dashboard/_components/program/ActiveProgramSection.tsx` (server component, 1-131)
- `apps/web/src/app/c/[coach_slug]/dashboard/_components/program/WorkoutPlanCard.tsx` (client, 1-90)
- `apps/web/src/app/c/[coach_slug]/dashboard/_components/program/ProgramPhaseBar.tsx` (client, 1-74)
- Motor de datos: `apps/web/src/app/c/[coach_slug]/dashboard/_data/weekPendingWorkouts.ts` (1-181)

**Contraparte RN:**
- `apps/mobile/components/alumno/home/ActiveProgramSection.tsx` (1-127; incluye `DayCard` interna 87-126)
- `apps/mobile/components/alumno/home/ProgramPhaseBar.tsx` (1-72)
- Wiring: `apps/mobile/app/alumno/(tabs)/home.tsx:219-243, 345-359`; tipos `apps/mobile/components/alumno/home/types.ts`

**P0 QA asignado:** ninguno. Hallazgos Ola 0 de esta unidad son P1/P2 (ver secciones abajo).

---

## 1. Estructura de datos y contrato (server web → props)

`ActiveProgramSection` web es **async server component**: recibe `{ userId, coachSlug }` (`ActiveProgramSection.tsx:17`) y hace 3 fetches en paralelo (`:19-23`): `getActiveProgram(userId)`, `getClientWorkoutPlans(userId)`, `getRecentWorkoutLogs(userId)`. Toda la derivación ocurre server-side.

En RN el shell `home.tsx` hace UN fetch y deriva en un `useMemo` (`home.tsx:219-243`), pasando props ya calculadas al componente presentacional. El contrato RN (`ActiveProgramSection.tsx:17-33`) es:
`program: Program`, `currentWeek: number`, `totalWeeks: number`, `planDays: PlanDayView[]`, `pending: PendingDay[]`, `todayPlanId: string | null`, `onStart: (planId) => void`.

### Derivaciones server web (a replicar por el shell RN, NO tocar el componente)
- `activePlans = allPlans.filter(p => !p.program_id || p.program_id === program?.id)` (`:24`).
- `abMode = !!program.ab_mode` (`:37`).
- `weekIdx = programWeekIndex1Based(program, userLocalDate)` (`:38`), fuente `@/lib/workout/programWeekVariant`.
- `activeVariant = resolveEffectiveWeekVariant(program, planes-del-programa, weekIdx, userLocalDate)` (`:41-46`) — cae a la variante que SÍ tiene planes si la del ciclo está vacía (A/B mal armado).
- `programPlans = activePlans.filter(p => p.program_id === program.id && workoutPlanMatchesVariant(p, activeVariant, abMode)).sort((a,b) => (a.day_of_week ?? 0) - (b.day_of_week ?? 0))` (`:48-50`). **Orden por `day_of_week` ascendente.**
- Estado por día vía `deriveWeekWorkoutStatus({ userLocalDate, todayIso, program, activePlans, logs })` (`:61`) → `week.days` (Lun→Dom con `status`) y `week.pending`.
- `cardPlans` (`:65-74`): por cada `programPlan`, `{ id, title, day_of_week, status: statusByDow.get(dow) ?? 'upcoming', isToday: dow === todayDow }`.
- `pending = week.pending`; `oldestPending = pending[0] ?? null` (`:76-77`).
- `todayPlanId = week.days.find(d => d.isToday)?.planId ?? null` (`:79`).
- `totalWeeks = Math.max(1, program.weeks_to_repeat ?? 1)` (`:81`); `currentWeek = weekIdx ?? 1` (`:82`).
- `phases = Array.isArray(program.program_phases) ? program.program_phases as PhaseSeg[] : null` (`:83-84`).

### Estados de día (`WeekDayStatus`, `weekPendingWorkouts.ts:35-45`)
`rest` (sin plan = descanso, nunca pendiente) · `done` (log del plan en ese mismo día calendario Santiago) · `today` (es hoy y sin completar) · `pending` (día pasado con plan sin log → recuperable) · `upcoming` (día futuro con plan).
Reglas (`:142-156`): `isCompleted` requiere `dayPlan && !isFuture && logs.some(l => l.workout_blocks?.plan_id === dayPlan.id && sameSantiagoYmd)`. Orden precedencia: `!dayPlan→rest`, `isCompleted→done`, `isToday→today`, `isFuture→upcoming`, else `pending`.
`pending` (`:168-178`): solo días PASADOS con plan sin log, ordenados `dateIso` asc (más antiguo primero), enriquecidos con `dayLabel` (nombre completo `DAY_NAMES_FULL[dow-1]`, `:9`) y `shortLabel` (`DAY_NAMES_SHORT`, `:10`).

**Nota web (producto, CEO 2026-07-04, `weekPendingWorkouts.ts:85-91`):** la ejecución NO tiene candado de fecha; el log cuenta el día real. Recuperar un pendiente sólo lleva a `/workout/[planId]`.

---

## 2. Layout y jerarquía (web)

Contenedor: `<Card padding="md" className="gap-4">` (`ActiveProgramSection.tsx:87`). Hijos en orden:

1. **Header** (`:88-97`): `<div className="flex flex-wrap items-center justify-between gap-2">` con:
   - `<h2 className="flex min-w-0 items-center gap-2 font-display text-base font-bold text-strong">` → `<Calendar className="h-4 w-4 shrink-0 text-sport-500" />` + `<span className="truncate">{program.name}</span>` (`:89-92`).
   - `<Badge tone="sport" variant="soft">Semana {currentWeek} de {totalWeeks}{abMode ? ` · Sem ${activeVariant}` : ''}</Badge>` (`:93-96`).
2. **ProgramPhaseBar** `phases / currentWeek / totalWeeks` (`:98`).
3. **CTA pendiente** (condicional `oldestPending`, `:102-121`) — ver §4.
4. **WorkoutPlanCards** — carrusel horizontal (`:123`).
5. **Link "Ver entreno de hoy →"** (condicional `todayPlanId`, `:124-128`).

---

## 3. ProgramPhaseBar — layout, tokens, estados, animación

Props: `{ phases: PhaseSeg[] | null, currentWeek, totalWeeks }` (`ProgramPhaseBar.tsx:13-21`). `PhaseSeg = { name: string; weeks: number; color?: string }` (`:7-11`).
`pct = totalWeeks > 0 ? Math.min(100, (currentWeek/totalWeeks)*100) : 0` (`:22`).

### Estado SIN fases (`!phases || !Array.isArray(phases) || phases.length === 0`, `:24`)
Barra de progreso simple (`:25-35`):
- Track: `<div className="h-2 overflow-hidden rounded-pill bg-[var(--track)]">`.
- Relleno: `<motion.div className="h-full rounded-pill" style={{ backgroundColor: 'var(--sport-500)' }} initial={{width:'0%'}} animate={{width:`${pct}%`}} transition={springs.lazy}>`.
- `springs.lazy = { type:'spring', stiffness:80, damping:20 }` (`@/lib/animation-presets:6`).

### Estado CON fases (`:40-71`)
`segs`: por cada fase i, `before = suma weeks previos`; `isCurrent = currentWeek > before && currentWeek <= before + weeks`; `isPast = before + weeks < currentWeek` (`:40-45`).
- Fila de barras: `<div className="flex gap-[3px]">`; cada seg `<div title={name} className="h-2 rounded-pill [isCurrent→bg-sport-500 | isPast→bg-sport-200 | futuro→bg-surface-sunken]" style={{flexGrow: weeks, flexBasis: 0}}>` (`:49-60`).
- Fila de nombres: `<div className="mt-1.5 flex justify-between">`; cada `<span className="text-[10px] [isCurrent→font-extrabold text-sport-600 | else font-semibold text-subtle]">{name}</span>` (`:62-70`).

### Contraparte RN (`ProgramPhaseBar.tsx`)
Equivalencias válidas: `motion.div`→`MotiView`, `springs.lazy`→`timing 700ms` con respeto reduce-motion (`useEvaMotion`, `:24,33`). **Divergencias vivas (Ola 0, ver §6):** track usa `bg-surface-sunken` en vez de `bg-track`; sin `Array.isArray` en el guard (`:27`); relleno usa `theme.primary` en vez de clase `bg-sport-500`.

---

## 4. CTA "pendientes" (día pasado sin registrar)

Web (`ActiveProgramSection.tsx:102-121`): `<Link href={`${base}/workout/${oldestPending.planId}`}>` con clases:
`group flex items-center gap-3 rounded-control border border-ember-200 bg-ember-100 px-3.5 py-3 transition-colors hover:bg-ember-200`.
Contenido:
- Círculo icono (`:107-109`): `<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ember-500 text-[var(--text-on-ember)]">` → `<RotateCcw className="h-[18px] w-[18px]" />`. `--text-on-ember = ink-950 = #0B0E13` (icono casi negro).
- Texto (`:110-118`): título `<p className="text-[13px] font-bold leading-tight text-ember-700">` con copy VERBATIM: `pending.length === 1 ? 'Tienes 1 día pendiente' : `Tienes ${pending.length} días pendientes`` + ` esta semana`. Subtítulo `<p className="mt-0.5 truncate text-[11.5px] font-semibold text-ember-700/80">Recuperar Día {oldestPending.dayOfWeek} · {oldestPending.dayLabel}</p>`.
- Flecha (`:119`): `<ArrowRight className="h-4 w-4 shrink-0 text-ember-700 transition-transform group-hover:translate-x-0.5" />`.

**Handler:** navegación a `/workout/[planId]` del pendiente MÁS ANTIGUO. Sin toast, sin confirm. En RN → `onStart(oldestPending.planId)` (`ActiveProgramSection.tsx:52`), que el shell resuelve a `router.push('/alumno/workout/[id]')` (`home.tsx:356`).

**Adaptación idiomática RN válida:** `<Link>`→`<TouchableOpacity activeOpacity={0.82}>` sin efecto hover; el hover `translate-x-0.5` de la flecha y el `hover:bg-ember-200` no tienen equivalente (se pierden por diseño, aceptable). Preserva navegación + textos + estructura visual.

---

## 5. WorkoutPlanCards (carrusel day-cards)

Web `WorkoutPlanCard.tsx`: `WorkoutPlanCards({ coachSlug, plans })`. `base = useBasePath(`/c/${coachSlug}`)` (`:28`).
Contenedor carrusel (`:31`): `<div className="hide-scrollbar -ml-0.5 flex gap-2 overflow-x-auto pl-0.5">`. Comentario de kit: day-cards de 96px (`:30`, ref `alumno-dashboard.jsx:413-424`).
`DAYS = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']` (`:9`).

Por cada plan (`:32-86`): `dow = day_of_week ?? 1`, `done = status==='done'`, `pending = status==='pending'`, `isToday`.
`<Link href={`${base}/workout/${p.id}`}>` con `aria-label` (`:41-47`): `pending → `${title} · pendiente, recuperar`` | `isToday → `${title} · hoy`` | else `title`.
Clases card (`:48-55`): base `block w-24 shrink-0 rounded-control border p-3 transition-colors`, luego:
- `isToday → border-sport-500 bg-sport-100`
- `pending → border-ember-200 bg-ember-100 hover:bg-ember-200`
- else → `border-subtle bg-surface-card hover:bg-surface-sunken`

Fila superior (`:57-75`): `<div className="flex items-center justify-between">`:
- Label día (`:58-65`): `text-[10.5px] font-extrabold uppercase tracking-wide` + color `isToday→text-sport-600 | pending→text-ember-700 | else→text-subtle`. Texto `{DAYS[dow-1]}`.
- Icono estado (`:66-74`): `done → <CheckCircle2 className="h-3.5 w-3.5 text-[var(--success-500)]" />` | `isToday → <Play className="h-3 w-3 text-sport-600" />` | `pending → <span aria-hidden className="h-2 w-2 rounded-full bg-ember-500" />` | else → `<ChevronRight className="h-[13px] w-[13px] text-[var(--ink-300)]" />`.

Título (`:76`): `<p className="mt-1.5 line-clamp-2 text-[13px] font-bold leading-tight text-strong">{title}</p>`.
Pie (`:77-84`): `<p className="mt-0.5 text-[10.5px] [pending→font-bold text-ember-700 | else→text-subtle]">{pending ? 'Pendiente' : `Día ${dow}`}</p>`.

**Handler:** cada card navega a su propio `/workout/[id]`. Sin toast. RN → `onStart(d.plan.id)` (`ActiveProgramSection.tsx:74`).

### Link "Ver entreno de hoy →" (`ActiveProgramSection.tsx:124-128`)
`<Link href={`${base}/workout/${todayPlanId}`} className="block text-center text-[11px] font-bold text-sport-600">Ver entreno de hoy →</Link>`. Solo si `todayPlanId` existe. Copy VERBATIM `Ver entreno de hoy →`.

---

## 6. Estados vacío / carga / error

- **Sin programa** (`ActiveProgramSection.tsx:26-34`): `<Card padding="lg" className="text-center">` → `<Calendar className="mx-auto h-10 w-10 text-muted" />` + `<p className="font-bold text-strong">Sin programa activo</p>` + `<p className="-mt-2 text-xs text-muted">Pídele a tu coach que te asigne uno</p>`. Copy VERBATIM.
- **Programa sin días esta semana** (`:52-58`): `<Card padding="lg" className="text-center"><p className="text-sm text-muted">No hay días visibles para esta semana del programa.</p></Card>`. Ocurre cuando `programPlans.length === 0` (variante A/B activa sin planes).
- **Carga / error:** el componente no maneja loading/error propios (server component; el shell decide). En RN el loading lo maneja `home.tsx:274+` (skeleton) y la ausencia de `data.program` oculta la sección (`home.tsx:346`).

---

## 7. Tokens (web) — referencia claro/oscuro

- `--sport-500` (marca, white-label runtime), `--sport-200`, `--sport-100` (light `#E8F1FF` / dark `rgba(38,128,255,0.20)`), `--sport-600` (light `#1462DC` / dark `#7FB0FF`).
- `--ember-500` (`#FF6A3D`), `--ember-200` (light `#FFD6C7`), `--ember-100` (light `#FFEDE6` / dark `rgba(255,106,61,0.20)`), `--ember-700` (light `#C23E14` / dark `#FFB79E`, **theme-aware**).
- `--text-on-ember = ink-950 = #0B0E13` (ambos modos).
- `--track` (light `ink-100` / dark `rgba(255,255,255,0.10)`) — **distinto** de `--surface-sunken` (light `ink-50` / dark `#1F262F`).
- `--text-subtle` (light `#646F7D` / dark `#86919E`); `--text-muted`; `--ink-300` (light `#A8B1BD` / dark `#414C5A`); `--success-500`; `--surface-card`.
Regla dura de la unidad: RN debe usar clases NativeWind DS (`text-ember-700`, `bg-ember-100`, `bg-sport-100`, `text-sport-600`, `bg-track`, `text-subtle`) para theme-awareness; las constantes hardcodeadas `EMBER_*` de `types.ts:101-108` NO son theme-aware.

---

## Hallazgos Ola 0 (`docs/rn-port/ola0-hallazgos.json`)

Inventario: `ActiveProgramSection` (json:10606-10613, prioridad **media**, `usedIn: alumno`, reason "Web program/{ActiveProgramSection,WorkoutPlanCard}.tsx. Mobile mismo nombre") y `ProgramPhaseBar (alumno)` (json:10614-10621, prioridad **media**, reason "Web ProgramPhaseBar.tsx:13. Mobile mismo nombre"). Nota json:10156: el nombre `ProgramPhasesBar` es la barra del **coach** (`components/coach/ProgramPhasesBar.tsx`), NO esta unidad — los hallazgos P2 de `compact`/`min-w`/fallback indigo (json:2300-2318, 8062-8068) son del coach y quedan FUERA de esta unidad.

### ProgramPhaseBar (alumno) — discrepancias (json:6051-6079)
1. **P1 — Track sin fases** (json:6053-6057): mobile usa `bg-surface-sunken` (`ProgramPhaseBar.tsx:29`); web usa `bg-[var(--track)]` (distinto: en claro track=ink-100 vs sunken=ink-50; en oscuro track=blanco@10% vs sunken=#1F262F sólido). Fix: `className="bg-track dark:bg-track/10"` (patrón de `ProgressBar.tsx:50`).
2. **P2 — Relleno white-label** (json:6060-6064): mobile `theme.primary`; web `bg-sport-500` (con marcas clampeadas difieren y `theme.primary` cambia claro/oscuro cuando web no). Fix: `className="bg-sport-500"` en el MotiView.
3. **P2 — Animación** (json:6067-6071): mobile `timing 700ms`; web `springs.lazy` (spring stiffness 80/damping 20). Fix: usar spring vía Moti/Reanimated; **conservar** el respeto reduce-motion de mobile.
4. **P2 — Guard Array.isArray** (json:6074-6078): mobile `if (!phases || phases.length === 0)` (`:27`) SIN `Array.isArray`; un objeto truthy con `length` undefined crashea en `phases.map` (`:40`). Fix: añadir `!Array.isArray(phases)`.

### ActiveProgramSection / WorkoutPlanCard — discrepancias (json:6084-6154)
1. **P1 — Semanas A/B (ab_mode)** (json:6086-6090): web filtra por variante efectiva (`workoutPlanMatchesVariant`) y añade ` · Sem ${activeVariant}` al Badge cuando `ab_mode` (`ActiveProgramSection.tsx:37-50, 93-96`). Mobile Badge fijo `Semana {currentWeek} de {totalWeeks}` (`:44`) SIN sufijo, y `planDays` no filtra por variante (`home.tsx:220`). Fix: seleccionar `week_variant`/`ab_mode` en el fetch, portar `programWeekVariant.ts`, filtrar `planDays`, añadir sufijo al Badge. **Cambio de shell requerido — ver cambiosShell.**
2. **P1 — ember-700 hardcodeado** (json:6093-6097): mobile usa constante `EMBER_700 = '#C2410C'` (`ActiveProgramSection.tsx:61,64,68,96,121`) no theme-aware; web `text-ember-700` (light #C23E14 / dark #FFB79E). En dark queda rojizo oscuro sobre fondo oscuro. Fix: clase `text-ember-700`.
3. **P1 — Icono RotateCcw** (json:6100-6104): mobile `color="#fff"` (`:58`); web `text-[var(--text-on-ember)]` = #0B0E13 (casi negro). Fix: token `text-on-ember`.
4. **P2 — Superficie CTA pendiente** (json:6107-6111): mobile `EMBER_500 + '38'`/`'1A'` (`:55`); web `border-ember-200 bg-ember-100`. En dark el fondo queda 10% vs 20% del token. Fix: clases `border-ember-200 bg-ember-100`.
5. **P2 — Day-card pending** (json:6114-6118): mobile `EMBER_500 + '55'`/`'14'` (`:94-95`), alphas distintos al propio CTA; web comparte `border-ember-200 bg-ember-100`. Fix: mismas clases.
6. **P2 — Day-card today** (json:6121-6125): mobile `theme.primary` para border/label/Play y `primary + '1A'` fondo (`:94-96,113`); web `bg-sport-100 border-sport-500 text-sport-600` (label/Play en sport-600, no sport-500; fondo sport-100). Fix: clases sport DS.
7. **P2 — Neutros day-card** (json:6128-6132): mobile `theme.mutedForeground` para label/pie/chevron (`:96,117,121`); web usa `text-subtle` para label/pie y `text-[var(--ink-300)]` para chevron. En claro el chevron mobile queda más oscuro. Fix: `text-subtle` + exponer ink-300.
8. **P2 — Estados vacíos ausentes** (json:6135-6139): mobile no tiene rama para `program == null` (el shell oculta la sección, `home.tsx:346-359`) ni para `planDays` vacío (`ActiveProgramSection.tsx:72-76` renderiza card con carrusel vacío). Web muestra "Sin programa activo" y "No hay días visibles…". Fix: renderizar ambas cards guía.
9. **P2 — Orden day-cards** (json:6142-6146): web ordena por `day_of_week` (`ActiveProgramSection.tsx:48-50`); mobile deriva `planDays` sin sort (`home.tsx:220-229`), carrusel puede quedar desordenado. Fix: añadir `.sort((a,b)=>day_of_week)`. **Cambio de shell — ver cambiosShell.**
10. **P2 — Accesibilidad day-cards** (json:6148-6153): web `aria-label` condicional (`WorkoutPlanCard.tsx:41-47`); mobile `DayCard` solo `testID` (`:99-105`), sin `accessibilityLabel`. Fix: añadir `accessibilityLabel` con misma lógica.

---

## Estado RN actual — divergencias observadas directamente (citas RN)

- **A/B ausente:** `ActiveProgramSection.tsx:44` Badge fijo sin sufijo `· Sem X`. El shell no selecciona `week_variant`/`ab_mode` (`home.tsx:220,237-243`) y `currentWeek` es una aproximación local por `startDate`/`weeksToRepeat` (`home.tsx:238-243`), no el `programWeekIndex1Based` del web.
- **Estado `today`/`pending` derivado distinto:** `home.tsx:227` deriva `status` con `dIso < todayIso → pending` sobre 7 días del calendario local, mientras web usa `deriveWeekWorkoutStatus` (Lun-lunes, variante efectiva, log por día Santiago). Además el tipo RN `DayStatus` (`types.ts:84`) omite `rest` (web lo tiene).
- **ember-700 no theme-aware:** `ActiveProgramSection.tsx:61,64,68,96,121` usan `EMBER_700` (`types.ts:103` = `#C2410C`), no la clase `text-ember-700`.
- **Icono RotateCcw blanco:** `ActiveProgramSection.tsx:58` `color="#fff"` (web usa ink-950).
- **Superficies ember/sport con alpha hardcodeado:** CTA `:55` (`'38'`/`'1A'`), day-card `:94-95` (`'55'`/`'14'`), today `:94-96,113` (`theme.primary`), en vez de clases DS `bg-ember-100`/`bg-sport-100`.
- **Track de phase bar:** `ProgramPhaseBar.tsx:29` `bg-surface-sunken` en vez de `bg-track`; guard `:27` sin `Array.isArray`; animación `:33` timing 700ms en vez de spring lazy.
- **Estados vacíos ausentes** y **sin sort** de day-cards (ver Ola 0 #8, #9).
- **Accesibilidad:** `DayCard` (`:99-105`) sin `accessibilityLabel`; el CTA pendiente (`:51`) y "Ver entreno de hoy" (`:79`) tampoco tienen label explícito.

### Funcionalidad RN existente que NO debe eliminarse (regla dura #2)
- `testID`s: `program-pending-cta` (`:51`), `program-day-${plan.id}` (`:100`).
- `numberOfLines`: título programa `numberOfLines={1}` (`:42`), subtítulo pendiente `={1}` (`:64`), título day-card `={2}` (`:120`), pie `={1}` (`:121`), nombres de fase `={1}` (`ProgramPhaseBar.tsx:63`) — este último es adaptación RN válida (web usa `flex justify-between` con truncado natural).
- Respeto reduce-motion en la phase bar (`ProgramPhaseBar.tsx:24,33`) — conservar aunque se migre a spring.

---

## cambiosShell (archivos fuera de esta unidad — NO tocar, reportar)

1. **`apps/mobile/app/alumno/(tabs)/home.tsx:220-234`** — derivación de `planDays`/`pending`/`todayPlanId`. Requiere: (a) `.sort((a,b) => (a.day_of_week ?? 0) - (b.day_of_week ?? 0))` sobre los planes del programa (Ola 0 #9); (b) para paridad A/B, filtrar por variante efectiva y pasar `activeVariant`/`abMode` para el sufijo del Badge (Ola 0 #1); (c) alinear la derivación de estado con `deriveWeekWorkoutStatus` (semana Lun-Dom, log por día Santiago, estado `rest`).
2. **`apps/mobile/app/alumno/(tabs)/home.tsx:236-243`** — `currentWeek` es aproximación local; para paridad exacta debe usar `programWeekIndex1Based` (portar/compartir `apps/web/src/lib/workout/programWeekVariant.ts`).
3. **`apps/mobile/app/alumno/(tabs)/home.tsx:346-359`** — la sección se oculta cuando `!data.program`; para paridad con web (card "Sin programa activo") el shell debe renderizar el estado vacío en vez de ocultar (Ola 0 #8). Decisión de diseño pendiente: mantener oculto o mostrar card guía.
4. **`apps/mobile/components/alumno/home/types.ts:84`** — `DayStatus` omite `'rest'`; si se alinea con `deriveWeekWorkoutStatus` habría que añadirlo (archivo compartido de tipos, no de esta unidad).
