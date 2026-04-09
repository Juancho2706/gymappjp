# Plan Maestro — Rework Total del Dashboard del Alumno

## Contexto

El dashboard del alumno (`/c/[coach_slug]/dashboard`) es la pantalla que cada cliente ve **todos los días**. Es el punto de entrada principal al producto desde su perspectiva. Actualmente es un server component monolítico de 447 líneas (`page.tsx`) sin componentes extraídos, sin Suspense granular, sin indicadores de adherencia, sin estado de check-in, sin resumen nutricional en pantalla y con UX mobile sin pulir.

El objetivo es reescribirlo como una experiencia **PWA-first, fluida en iOS y Android, cómoda en desktop**, con streaming architecture, componentes modulares, animaciones de calidad profesional, soporte perfecto de dark/light mode, y datos bien integrados desde Supabase.

**Estado actual del dashboard: 0% rework.**
**Objetivo: 100% — pantalla flagship del producto.**

---

## Archivos Involucrados

### Modificar
```
src/app/c/[coach_slug]/dashboard/page.tsx              [rewrite total — shell + Suspense]
src/app/c/[coach_slug]/dashboard/loading.tsx           [rewrite — nuevo skeleton layout]
src/app/c/[coach_slug]/dashboard/WeightProgressChart.tsx [mover a _components/weight/]
```

### Crear (estructura de carpetas nueva)
```
src/app/c/[coach_slug]/dashboard/
├── _data/
│   └── dashboard.queries.ts          ← todas las queries con React.cache()
│
├── _components/
│   ├── DashboardShell.tsx            ← grid layout orquestador
│   ├── DashboardHeader.tsx           ← greeting + streak (Server async)
│   ├── HeroAndComplianceGroup.tsx    ← agrupa hero+rings en un Suspense
│   │
│   ├── header/
│   │   ├── ClientGreeting.tsx        ← animación entrada (Client)
│   │   └── SettingsModalTrigger.tsx  ← botón settings (Client)
│   │
│   ├── streak/
│   │   └── StreakWidget.tsx          ← flame + contador (Client)
│   │
│   ├── calendar/
│   │   ├── WeekCalendar.tsx          ← strip 7 días (Server async)
│   │   └── CalendarDay.tsx           ← celda individual (Client)
│   │
│   ├── checkin/
│   │   └── CheckInBanner.tsx         ← estado del check-in (Server async)
│   │
│   ├── hero/
│   │   ├── HeroSection.tsx           ← decide workout vs rest (Server)
│   │   ├── WorkoutHeroCard.tsx       ← CTA principal con progreso (Client)
│   │   ├── RestDayCard.tsx           ← día de descanso animado (Client)
│   │   └── QuickLogSheet.tsx         ← sheet de log rápido (Client)
│   │
│   ├── compliance/
│   │   ├── ComplianceRingCluster.tsx ← 3 anillos (Server → Client)
│   │   └── ComplianceRing.tsx        ← un anillo animado (Client)
│   │
│   ├── nutrition/
│   │   ├── NutritionDailySummary.tsx ← resumen macro del día (Server async)
│   │   ├── MacroBar.tsx              ← barra de progreso animada (Client)
│   │   └── MealCompletionRow.tsx     ← toggle de comida (Client, optimistic)
│   │
│   ├── weight/
│   │   ├── WeightWidget.tsx          ← peso + sparkline + tendencia (Server)
│   │   ├── WeightSparkline.tsx       ← mini recharts (Client)
│   │   └── TrendArrow.tsx            ← flecha animada (Client)
│   │
│   ├── program/
│   │   ├── ActiveProgramSection.tsx  ← programa activo semana actual (Server)
│   │   ├── ProgramPhaseBar.tsx       ← timeline de fases (Client)
│   │   └── WorkoutPlanCard.tsx       ← tarjeta plan por día (Client)
│   │
│   ├── records/
│   │   ├── PersonalRecordsBanner.tsx ← PRs recientes (Server async)
│   │   └── PRBadge.tsx               ← chip de PR con confetti (Client)
│   │
│   └── history/
│       ├── RecentWorkoutsSection.tsx ← últimas 5 sesiones (Server async)
│       └── WorkoutLogItem.tsx        ← fila de log (Client)
│
└── _actions/
    └── dashboard.actions.ts          ← nuevas server actions si aplica
```

### Crear (utilidades compartidas)
```
src/lib/animation-presets.ts          ← spring presets + variantes reutilizables
src/lib/date-utils.ts                 ← getTodayInSantiago(), formatRelativeDate()
```

### Reutilizar sin cambios
```
src/lib/workout/programWeekVariant.ts     ← programWeekIndex1Based, resolveActiveWeekVariantForDisplay, workoutPlanMatchesVariant
src/components/ui/glass-card.tsx          ← base de todas las cards
src/components/ui/glass-button.tsx        ← botones con variant brand
src/components/client/ClientSettingsModal.tsx  ← sin cambios
src/app/c/[coach_slug]/nutrition/actions.ts    ← toggleMealCompletion (reutilizar)
src/app/c/[coach_slug]/workout/[planId]/actions.ts  ← logSetAction (reutilizar)
```

---

## 1. Estrategia de Datos — `_data/dashboard.queries.ts`

Todas las funciones se exportan con `React.cache()`. Nunca hay un "fetch todo" monolítico. Cada Suspense boundary llama solo lo que necesita. Las funciones cacheadas aseguran que si dos boundaries piden el mismo dato, solo hay **una** consulta a Supabase.

### Timezone
```typescript
// src/lib/date-utils.ts
export function getTodayInSantiago(): { date: Date; iso: string; dayOfWeek: number } {
  const tzStr = new Date().toLocaleString('en-US', { timeZone: 'America/Santiago' })
  const date = new Date(tzStr)
  const iso = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
  const dow = date.getDay() === 0 ? 7 : date.getDay() // 1=Lun, 7=Dom
  return { date, iso, dayOfWeek: dow }
}

export function formatRelativeDate(dateStr: string): string {
  // Returns "Hace 2 días", "Hace 1 semana", "Hoy", "Ayer"
}
```

### Queries individuales

#### `getClientId(userId)`
```typescript
// Resuelve el clientId del usuario autenticado (users.id → clients.id)
supabase.from('clients').select('id, full_name').eq('id', userId).single()
// Nota: en este schema, clients.id ES el auth user id (FK → auth.users)
```

#### `getDashboardStreak(clientId)`
```typescript
supabase.rpc('get_client_current_streak', { p_client_id: clientId })
// Returns: number
```

#### `getLastCheckIn(clientId)`
```typescript
supabase
  .from('check_ins')
  .select('id, weight, energy_level, created_at')
  .eq('client_id', clientId)
  .order('created_at', { ascending: false })
  .limit(1)
  .maybeSingle()
```

#### `getCheckInHistory30Days(clientId)`
```typescript
supabase
  .from('check_ins')
  .select('id, weight, energy_level, created_at')
  .eq('client_id', clientId)
  .gte('created_at', thirtyDaysAgo.toISOString())
  .order('created_at', { ascending: true })
// Usado por: WeightWidget, ComplianceRings (check-in score)
// React.cache → solo 1 query aunque 2 componentes lo llamen
```

#### `getActiveProgram(clientId)`
```typescript
supabase
  .from('workout_programs')
  .select(`
    id, name, start_date, end_date, weeks_to_repeat, ab_mode, program_phases,
    workout_plans (
      id, title, day_of_week, week_variant,
      workout_blocks ( id, sets, reps, exercises ( id, name ) )
    )
  `)
  .eq('client_id', clientId)
  .eq('is_active', true)
  .maybeSingle()
// Usado por: WeekCalendar, HeroSection, ActiveProgramSection
// React.cache → 1 query para todos
```

#### `getRecentWorkoutLogs(clientId)`
```typescript
supabase
  .from('workout_logs')
  .select('id, logged_at, block_id, weight_kg, reps_done')
  .eq('client_id', clientId)
  .gte('logged_at', thirtyDaysAgo.toISOString())
  .order('logged_at', { ascending: false })
  .limit(200)
// Usado por: ComplianceRings (workout score), RecentWorkoutsSection, PRBanner
```

#### `getActiveNutritionPlan(clientId)`
```typescript
supabase
  .from('nutrition_plans')
  .select('id, name, daily_calories, protein_g, carbs_g, fats_g')
  .eq('client_id', clientId)
  .eq('is_active', true)
  .maybeSingle()
```

#### `getTodayNutritionData(clientId, planId, todayISO)`
```typescript
// Dos queries paralelas:
const [dailyLog, meals] = await Promise.all([
  supabase
    .from('daily_nutrition_logs')
    .select('id, log_date, target_calories_at_log, target_protein_at_log, target_carbs_at_log, target_fats_at_log')
    .eq('client_id', clientId)
    .eq('log_date', todayISO)
    .maybeSingle(),
  supabase
    .from('nutrition_meals')
    .select('id, name, order_index, nutrition_meal_logs ( id, is_completed, log_date )')
    .eq('plan_id', planId)
    .order('order_index', { ascending: true })
])
// Post-process meals: filter nutrition_meal_logs where log_date === todayISO
```

#### `getPersonalRecords(clientId)`
```typescript
// Step 1: logs recientes con peso (últimos 14 días)
const recentLogs = await supabase
  .from('workout_logs')
  .select('weight_kg, reps_done, block_id, logged_at, workout_blocks ( exercise_id, exercises ( id, name ) )')
  .eq('client_id', clientId)
  .not('weight_kg', 'is', null)
  .gte('logged_at', fourteenDaysAgo.toISOString())

// Step 2: máximos históricos por bloque/ejercicio
const allTimeMax = await supabase
  .from('workout_logs')
  .select('block_id, weight_kg')
  .eq('client_id', clientId)
  .not('weight_kg', 'is', null)

// Post-process: agrupar por exercise_id, comparar max reciente vs histórico
// PR = log reciente donde weight_kg >= max histórico previo
```

### Agrupación por Suspense Boundary

```
Boundary 1 — Header (fast ~100ms):
  getClientId() + getDashboardStreak()  [Promise.all]

Boundary 2 — Calendar (~150ms):
  getClientId() + getActiveProgram()  [React.cache deduplica]

Boundary 3 — CheckIn (~120ms):
  getClientId() + getLastCheckIn()

Boundary 4 — HeroAndComplianceGroup (~200ms, el más importante):
  getActiveProgram() + getRecentWorkoutLogs() + getLastCheckIn()  [Promise.all]
  → Deriva: todayPlan, isRestDay, workoutComplianceScore, checkInScore

Boundary 5 — Nutrition (~180ms):
  getClientId() + getActiveNutritionPlan() → getTodayNutritionData()

Boundary 6 — Weight (0ms extra):
  getCheckInHistory30Days()  [React.cache'd, ya resuelto por CheckIn boundary]

Boundary 7 — PRBanner (~250ms):
  getPersonalRecords()  [dos queries secuenciales]

Boundary 8 — Program (0ms extra):
  getActiveProgram()  [React.cache'd]

Boundary 9 — History (0ms extra):
  getRecentWorkoutLogs()  [React.cache'd]
```

---

## 2. Jerarquía de Componentes (árbol completo)

```
page.tsx  (Server, async — resuelve userId, orquesta Suspense)
└── DashboardShell  (Server — grid layout puro)
    │
    ├── [mobile: sticky] [desktop: relative]
    │   └── Suspense fallback=<HeaderSkeleton>
    │       └── DashboardHeader  (Server async)
    │           ├── ClientGreeting  (Client — animación entrada)
    │           ├── StreakWidget  (Client — llama fire)
    │           └── SettingsModalTrigger  (Client — abre ClientSettingsModal)
    │
    ├── Suspense fallback=<CalendarSkeleton>
    │   └── WeekCalendar  (Server async)
    │       └── CalendarDay × 7  (Client — stagger, whileTap)
    │
    ├── Suspense fallback=<CheckInSkeleton>
    │   └── CheckInBanner  (Server async)
    │       └── [urgente] → border izquierdo pulsante
    │
    ├── Suspense fallback=<HeroAndComplianceSkeleton>
    │   └── HeroAndComplianceGroup  (Server async — wrapper eficiente)
    │       ├── HeroSection  (Server — decide rama)
    │       │   ├── WorkoutHeroCard  (Client)
    │       │   │   ├── BlockSummaryList
    │       │   │   ├── SetProgressBar  (Framer Motion width animation)
    │       │   │   ├── GlassButton "Empezar" → href /workout/[planId]
    │       │   │   └── QuickLogSheet  (Client — shadcn Sheet)
    │       │   │       └── ExerciseQuickLogRow × n  (useOptimistic)
    │       │   └── RestDayCard  (Client — floating illustration)
    │       │
    │       └── ComplianceRingCluster  (Client)
    │           ├── ComplianceRing label="Entrenos"  (useMotionValue + useSpring)
    │           ├── ComplianceRing label="Nutrición"
    │           └── ComplianceRing label="Check-ins"
    │
    ├── Suspense fallback=<NutritionSkeleton>
    │   └── NutritionDailySummary  (Server async)
    │       ├── CalorieSummary  [consumed / target]
    │       ├── MacroBar × 3  (Client — Framer Motion, useInView)
    │       └── MealCompletionRow × n  (Client — useOptimistic + SVG checkmark draw)
    │
    ├── Suspense fallback=<WeightSkeleton>
    │   └── WeightWidget  (Server async)
    │       ├── CurrentWeightDisplay + TrendArrow  (Client — bounce animation)
    │       └── WeightSparkline  (Client — Recharts sparkline)
    │
    ├── Suspense fallback=null  [no layout shift]
    │   └── PersonalRecordsBanner  (Server async — null si no hay PRs)
    │       └── PRBadge × n  (Client — scale+rotate spring, confetti si <24h)
    │
    ├── Suspense fallback=<ProgramSkeleton>
    │   └── ActiveProgramSection  (Server async)
    │       ├── WeekBadge + ABVariantBadge
    │       ├── ProgramPhaseBar  (Client — marker slide animation)
    │       └── WorkoutPlanCard × n  (Client — stagger fadeSlideLeft)
    │
    └── Suspense fallback=<HistorySkeleton>
        └── RecentWorkoutsSection  (Server async)
            └── WorkoutLogItem × n  (Client — stagger)
```

---

## 3. Especificaciones Detalladas por Componente

### `page.tsx` — Rewrite total

```typescript
// Solo resuelve userId y orquesta Suspense boundaries
// NO hace fetch de datos aquí
export default async function ClientDashboardPage({ params }) {
  const { coach_slug } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/c/${coach_slug}/login`)

  return (
    <DashboardShell coachSlug={coach_slug}>
      <Suspense fallback={<DashboardHeaderSkeleton />}>
        <DashboardHeader userId={user.id} coachSlug={coach_slug} />
      </Suspense>

      <Suspense fallback={<CalendarSkeleton />}>
        <WeekCalendar userId={user.id} />
      </Suspense>

      <Suspense fallback={<CheckInSkeleton />}>
        <CheckInBanner userId={user.id} coachSlug={coach_slug} />
      </Suspense>

      <Suspense fallback={<HeroAndComplianceSkeleton />}>
        <HeroAndComplianceGroup userId={user.id} coachSlug={coach_slug} />
      </Suspense>

      <Suspense fallback={<NutritionSkeleton />}>
        <NutritionDailySummary userId={user.id} coachSlug={coach_slug} />
      </Suspense>

      <Suspense fallback={<WeightSkeleton />}>
        <WeightWidget userId={user.id} coachSlug={coach_slug} />
      </Suspense>

      <Suspense fallback={null}>
        <PersonalRecordsBanner userId={user.id} />
      </Suspense>

      <Suspense fallback={<ProgramSkeleton />}>
        <ActiveProgramSection userId={user.id} coachSlug={coach_slug} />
      </Suspense>

      <Suspense fallback={<HistorySkeleton />}>
        <RecentWorkoutsSection userId={user.id} coachSlug={coach_slug} />
      </Suspense>
    </DashboardShell>
  )
}
```

---

### `DashboardShell` — Layout grid

```typescript
// Server Component puro — sin lógica, solo estructura visual
interface DashboardShellProps {
  children: React.ReactNode
  coachSlug: string
}

// Layout responsive:
// Mobile/Tablet (<lg): columna única
//   px-4, space-y-4, pb-[calc(80px+env(safe-area-inset-bottom))]
// Desktop (lg+): 2 columnas
//   grid-cols-[minmax(0,1fr)_300px], gap-6
//   Left col: Header, Calendar, CheckIn, Hero+Compliance, Program, History
//   Right col: (sticky top-6) Streak, Weight, Nutrition, PRBanner

// Ejemplo Tailwind:
// <div className="min-h-screen bg-background">
//   <div className="mx-auto max-w-5xl px-4 sm:px-6 py-4
//                   pb-[calc(80px+env(safe-area-inset-bottom))] lg:pb-6">
//     <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-6">
//       <div className="min-w-0 space-y-4">{mainCol}</div>
//       <aside className="hidden lg:flex flex-col gap-4 sticky top-6 self-start">
//         {rightCol}
//       </aside>
//     </div>
//   </div>
// </div>
```

---

### `DashboardHeader` — Server async

```typescript
// Fetch: getClientId() + getDashboardStreak() en paralelo
// Props salientes a clientes: fullName, streak, coachSlug

// Sticky en mobile: "sticky top-0 z-40 bg-background/80 backdrop-blur-xl
//                    border-b border-border/40 pt-safe-top lg:relative lg:top-auto
//                    lg:bg-transparent lg:backdrop-blur-none lg:border-none"

// Estructura visual:
// <header>
//   <div className="flex items-center justify-between px-4 h-14">
//     <ClientGreeting greeting={timeGreeting} firstName={firstName} />
//     <div className="flex items-center gap-2">
//       <StreakWidget streak={streak} />
//       <SettingsModalTrigger coachSlug={coachSlug} />
//     </div>
//   </div>
// </header>
```

---

### `ClientGreeting` — Client Component (solo animación)

```typescript
interface ClientGreetingProps {
  greeting: string   // "Buenas tardes, João"  (computado server-side con hora Santiago)
  dateLabel: string  // "Miércoles, 9 de abril"
}

// Framer Motion: words split y stagger entrada
// variants staggerContainer(0.04)
// cada word: hidden { opacity: 0, y: -6 } → show { opacity: 1, y: 0 }
// transition: springs.snappy

// Saludo por hora (America/Santiago):
// 5–11: "Buenos días"
// 12–18: "Buenas tardes"
// 19+: "Buenas noches"
```

---

### `StreakWidget` — Client Component

```typescript
interface StreakWidgetProps {
  streak: number
}

// streak === 0: texto sutil "Empieza tu racha" en muted-foreground (sin flame)
// streak 1-2:   flame estático + número
// streak 3-6:   flame con pulse suave
// streak 7-29:  flame más grande + glow orange + número bold
// streak 30+:   fire grande + confetti trigger al montar (con guard localStorage)

// Flame animation (streak >= 3):
// animate={{ scale: [1, 1.2, 1] }}
// transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}

// Layout:
// <div className="flex items-center gap-1.5 rounded-full
//                 bg-orange-500/10 dark:bg-orange-400/10
//                 px-2.5 py-1 border border-orange-500/20 dark:border-orange-400/20">
//   <FlameIcon className="w-4 h-4 text-orange-500 dark:text-orange-400" />
//   <span className="text-sm font-bold tabular-nums text-orange-600 dark:text-orange-300">
//     {streak}
//   </span>
//   <span className="text-[10px] text-orange-500/70 dark:text-orange-400/60">días</span>
// </div>
```

---

### `WeekCalendar` — Server async → CalendarDay Client

```typescript
// Server fetches: getClientId + getActiveProgram + getRecentWorkoutLogs
// (todos React.cache'd — sin queries extra)

// Deriva per day (7 días, lun-dom en zona Santiago):
// - hasWorkout: plan existe para ese día en variante activa (workoutPlanMatchesVariant)
// - isCompleted: workout_log existe con logged_at en ese día ISO
// - isToday: día ISO === todayISO
// - isPast: fecha < hoy

// CalendarDay props: dayLabel, dayNumber, isToday, hasWorkout, isCompleted, isPast

// Container animation (Client wrapper):
// variants={staggerContainer(0.04)}
// cada CalendarDay: variants={scaleIn}

// CalendarDay visual states:
// isToday + hasWorkout: bg-[color:var(--theme-primary)] text-white rounded-xl shadow-sm
//                       + ring pulsante: ring-2 ring-[color:var(--theme-primary)]/40 animate-pulse
// isToday + rest: bg-[color:var(--theme-primary)]/15 text-[color:var(--theme-primary)]
// isCompleted (pasado): dot verde ✓ debajo del número
// hasWorkout (futuro): dot brand color/50 debajo
// isPast + !completed: text-muted-foreground/40 (faded)
// default futuro sin workout: text-muted-foreground

// Layout:
// <div className="bg-card border border-border rounded-2xl px-3 py-3 shadow-sm">
//   <div className="grid grid-cols-7 gap-1">
//     {days.map(d => <CalendarDay key={d.iso} {...d} />)}
//   </div>
// </div>
```

---

### `CheckInBanner` — Server async

```typescript
// Fetch: getLastCheckIn
// Lógica de urgencia (días desde último check-in):
// nunca:   variant="empty"   → "Registra tu primer check-in"
// < 3d:    variant="ok"      → "Check-in al día ✓"
// 3-7d:    variant="warning" → "Check-in próximo — hace {N} días"
// > 7d:    variant="overdue" → "¡Check-in pendiente! — hace {N} días"  [pulsante]

// Si variant="ok": no renderiza nada (null) para no tomar espacio

// Layout (cuando muestra):
// <div className={`flex items-center gap-3 rounded-xl p-3 border-l-4
//   ${variantClasses}`}>
//   <StatusIcon />
//   <div className="flex-1">
//     <p className="text-sm font-semibold">{message}</p>
//     <p className="text-xs text-muted-foreground">{dateText}</p>
//   </div>
//   <Link href={/c/[slug]/check-in} className="...">
//     Ir a Check-in
//   </Link>
// </div>

// Colores por variant:
// ok:      hidden
// warning: "bg-amber-50 dark:bg-amber-950/30 border-l-amber-500"
// overdue: "bg-red-50 dark:bg-red-950/30 border-l-red-500"
//          + border pulsa: animate={{ opacity:[1,0.3,1] }} duration:2 repeat:Infinity
// empty:   "bg-muted border-l-muted-foreground/30"
```

---

### `HeroAndComplianceGroup` — Server async (wrapper eficiente)

```typescript
// Fetch en paralelo:
// const [program, recentLogs, lastCheckIn, checkInHistory] = await Promise.all([
//   getActiveProgram(clientId),
//   getRecentWorkoutLogs(clientId),
//   getLastCheckIn(clientId),
//   getCheckInHistory30Days(clientId),
// ])

// Deriva:
// todayPlan: plan del día de hoy según variante A/B (usa programWeekVariant utils)
// isRestDay: !todayPlan
// isAlreadyLogged: algún log del día de hoy referenciando bloques del todayPlan
// totalSetsTarget: suma de blocks.sets del todayPlan
// totalSetsLogged: count de logs del día de hoy en bloques del plan
// workoutComplianceScore: (días con logs en 30d / días con plan asignado en 30d) * 100
// checkInScore: (check-ins en 30d / 4) * 100 — baseline: 1 por semana = 100%
// nutritionScore: calculado desde daily_nutrition_logs (si existen), sino 0

// Pasa todo como props a HeroSection y ComplianceRingCluster
```

---

### `WorkoutHeroCard` — Client Component

```typescript
interface WorkoutHeroCardProps {
  plan: {
    id: string
    title: string
    dayOfWeek: number
    blocks: Array<{ id: string; sets: number; reps: string; exercise: { name: string } }>
  }
  isAlreadyLogged: boolean
  totalSetsTarget: number
  totalSetsLogged: number
  coachSlug: string
}

// Card grande, es el CTA más importante del dashboard
// Ocupa full width en mobile, ~60% en desktop

// Estructura:
// ┌─────────────────────────────────────┐
// │ DÍA · TÍTULO DEL PLAN               │  ← label día + título
// │                                      │
// │ • Ejercicio 1    3 × 8              │  ← lista de bloques (max 4, + N más)
// │ • Ejercicio 2    4 × 6              │
// │ • Ejercicio 3    3 × 10             │
// │                                      │
// │ [████████░░░░░░] 8/12 series        │  ← progress bar animada
// │                                      │
// │ [  EMPEZAR ENTRENAMIENTO  ] [Quick] │  ← CTAs
// └─────────────────────────────────────┘

// Si isAlreadyLogged:
// Overlay verde con ✓ "Entrenamiento completado"
// Botón cambia a "Ver registro"

// Background:
// "bg-gradient-to-br from-[color:var(--theme-primary)]/8
//  dark:from-[color:var(--theme-primary)]/14 to-transparent
//  border border-[color:var(--theme-primary)]/20
//  dark:border-[color:var(--theme-primary)]/30 rounded-2xl p-5"

// Progress bar animation (Framer Motion):
// <motion.div
//   className="h-2 rounded-full bg-[color:var(--theme-primary)]"
//   initial={{ width: '0%' }}
//   animate={{ width: `${(totalSetsLogged / totalSetsTarget) * 100}%` }}
//   transition={springs.lazy}
// />

// Botón primario: GlassButton variant="brand" → href /c/[slug]/workout/[planId]
// Botón secundario: pequeño, outline → onClick abre QuickLogSheet
```

---

### `RestDayCard` — Client Component

```typescript
interface RestDayCardProps {
  nextWorkoutTitle: string | null
  nextWorkoutDayLabel: string | null  // "Mañana", "El jueves"
}

// Ilustración SVG de luna/ola/montaña con floating animation:
// animate={{ y: [0, -10, 0] }}
// transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}

// Fondo:
// "bg-gradient-to-br from-slate-50 to-purple-50/30
//  dark:from-gray-900 dark:to-slate-900 rounded-2xl p-6 text-center"

// Texto:
// "Día de Descanso" — font-display, xl
// "Tu próximo entreno: {nextWorkoutDayLabel}" en muted
// Link sutil "Ver programa completo →"
```

---

### `QuickLogSheet` — Client Component

```typescript
// shadcn Sheet: side="bottom" en mobile, side="right" en desktop
// Detectar con: useSyncExternalStore + matchMedia (patrón ya usado en ProgramPreviewPanel)

// Por cada bloque del plan:
// ┌ Sentadilla ─────────────── 3 series ─ [+ LOGUEAR SET] ┐
// └─────────────────────────────────────────────────────────┘

// Estado local: loggedSets per blockId (starts from totalSetsLogged from props)
// useOptimistic: actualización inmediata en UI
// onConfirm set: calls logSetAction (existente en workout/[planId]/actions.ts)
// reutilizar directamente: import { logSetAction } from '../../workout/[planId]/actions'

// El set se loguea con set_number = loggedSets + 1, peso = 0 (placeholder para quick log)
// El alumno puede editar el peso real entrando al workout completo

// Button "+" animation: whileTap={{ scale: 0.85 }} springs.elastic
// Flash tras tap: bg-[color:var(--theme-primary)]/30 → fade out 300ms
```

---

### `ComplianceRingCluster` — Client Component

```typescript
interface ComplianceRingClusterProps {
  workoutScore: number   // 0-100
  nutritionScore: number // 0-100
  checkInScore: number   // 0-100
}

// GlassCard con título "Últimos 30 días"
// Grid de 3 anillos horizontales

// Layout:
// <div className="grid grid-cols-3 gap-3 p-4">
//   <ComplianceRing value={workoutScore} label="Entrenos" color="brand" />
//   <ComplianceRing value={nutritionScore} label="Nutrición" color="emerald" />
//   <ComplianceRing value={checkInScore} label="Check-ins" color="violet" />
// </div>
```

### `ComplianceRing` — Client Component

```typescript
interface ComplianceRingProps {
  value: number     // 0-100
  label: string
  color: 'brand' | 'emerald' | 'violet'
}

// Usa react-circular-progressbar
// El valor se anima desde 0 hasta props.value usando useMotionValue + useSpring:
const mv = useMotionValue(0)
const spring = useSpring(mv, { stiffness: 60, damping: 20 })
useEffect(() => { mv.set(value) }, [value])
useMotionValueEvent(spring, 'change', v => setAnimatedVal(Math.round(v)))

// Color del stroke por tipo:
// brand: 'var(--theme-primary)'
// emerald: '#10b981'
// violet: '#8b5cf6'

// Track color (useTheme):
// light: '#e5e7eb', dark: '#374151'

// Dentro del anillo: porcentaje en texto
// <span className="text-base font-black">{animatedVal}%</span>

// Tamaño: w-20 h-20 en mobile, w-24 h-24 en desktop
// Reducción motion: si useReducedMotion() → value directo, sin spring
```

---

### `NutritionDailySummary` — Server async

```typescript
// Fetch: getActiveNutritionPlan → getTodayNutritionData (secuencial por dependencia planId)

// Sin plan asignado:
// Card con mensaje "Sin plan nutricional asignado"
// Icono Apple en muted, subtext "Pídele un plan a tu coach"

// Con plan, sin log de hoy:
// Muestra targets con 0 completado, prompt "¡Registra tu primera comida!"
// Link → /c/[slug]/nutrition

// Con plan y log:
// GlassCard:
// 1. Header: nombre del plan + "Hoy" badge + link "Ver todo →"
// 2. "X / Y kcal" — calorie summary (números grandes)
//    [progress bar full width, color brand]
// 3. Tres MacroBars:
//    Proteína: consumed.prot / target.prot (g)  — color rose-500
//    Carbos:   consumed.carb / target.carb (g)  — color amber-500
//    Grasas:   consumed.fat  / target.fat  (g)  — color emerald-500
// 4. Lista de comidas (MealCompletionRow × n)
// 5. Footer link "Plan completo →"

// Nota: consumed viene de daily_nutrition_logs (columnas target_*_at_log)
// Si no hay daily_nutrition_log pero sí plan: usar plan.protein_g etc. como target, 0 como consumed
```

---

### `MacroBar` — Client Component

```typescript
interface MacroBarProps {
  label: string
  consumed: number
  target: number
  unit: 'g' | 'kcal'
  colorClass: string   // "bg-rose-500" | "bg-amber-500" | "bg-emerald-500" | "bg-[color:var(--theme-primary)]"
  delayIndex: number   // para stagger (0, 1, 2)
}

// useInView({ once: true }) — solo anima cuando entra al viewport
// Framer Motion width animation:
// initial={{ width: '0%' }}
// animate={inView ? { width: `${pct}%` } : { width: '0%' }}
// transition={{ ...springs.lazy, delay: delayIndex * 0.15 }}

// Over-target (consumed > target): bar es rojo, ⚠ icono

// "bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden h-2"
```

---

### `MealCompletionRow` — Client Component

```typescript
// Usa toggleMealCompletion (server action existente en nutrition/actions.ts)
// useOptimistic para respuesta inmediata

// SVG checkmark draw animation (pathLength):
// <motion.path
//   initial={{ pathLength: 0, opacity: 0 }}
//   animate={{ pathLength: isCompleted ? 1 : 0, opacity: isCompleted ? 1 : 0 }}
//   transition={{ duration: 0.3, ease: 'easeOut' }}
// />

// Cuando toggle a completado:
// - checkbox background cambia a emerald-500
// - nombre del plato: line-through text-muted-foreground
```

---

### `WeightWidget` — Server async

```typescript
// Datos: getCheckInHistory30Days (React.cache — ya resuelto por CheckIn boundary)
// Derive: currentWeight, lastDate, trend (up/down/stable), delta (kg), sparklineData

// Trend logic:
// promedio últimos 7d vs promedio 7d anteriores
// delta > +0.3kg → 'up', delta < -0.3kg → 'down', else 'stable'

// Layout (GlassCard):
// Header: "Peso" label + "Registrar" button (link a /check-in)
// Centro: "72.5 kg" (text-3xl font-black) + TrendArrow
// Sub: "Hace 3 días" en muted
// WeightSparkline (100% width, 72px height)
// Si no hay datos: empty state con ScaleIcon + "Aún sin registros de peso"
```

---

### `WeightSparkline` — Client Component

```typescript
// Recharts AreaChart puro, sin ejes, sin grid, sin tooltip
// Solo stroke + área gradient
// isAnimationActive={true} (recharts built-in animate)
// Gradient: rgba(var(--theme-primary-rgb), 0.2) → transparent

// Último punto: customDot solo en último elemento (filled circle, color brand)

// <div className="w-full h-[72px] mt-3">
//   <ResponsiveContainer width="100%" height="100%">
//     <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
//       <defs>
//         <linearGradient id="wGrad" x1="0" y1="0" x2="0" y2="1">
//           <stop offset="5%" stopColor={`rgba(${primaryRgb},0.2)`} stopOpacity={1}/>
//           <stop offset="95%" stopColor={`rgba(${primaryRgb},0)`} stopOpacity={0}/>
//         </linearGradient>
//       </defs>
//       <Area type="monotone" dataKey="weight" stroke="var(--theme-primary)"
//             strokeWidth={2} fill="url(#wGrad)" dot={false} />
//     </AreaChart>
//   </ResponsiveContainer>
// </div>
```

---

### `TrendArrow` — Client Component

```typescript
// Flecha que rebota en su dirección
// up:     ArrowUpIcon rojo (subida peso)
// down:   ArrowDownIcon verde (bajada peso)
// stable: MinusIcon muted

// Bounce animation:
// up:   animate={{ y: [0, -4, 0] }}, repeat Infinity, duration 1.5
// down: animate={{ y: [0,  4, 0] }}, repeat Infinity, duration 1.5
// delay: 0.5s (deja que el usuario lea el número primero)

// "{delta > 0 ? '+' : ''}{delta.toFixed(1)} kg" en text-xs al lado
```

---

### `ActiveProgramSection` — Server async

```typescript
// Datos: getActiveProgram (React.cache'd)
// Deriva: weekIndex (programWeekIndex1Based), weekVariant (resolveActiveWeekVariantForDisplay)
// Filtra: planes que coinciden con variante actual (workoutPlanMatchesVariant)
// Ordena: por day_of_week

// Layout (GlassCard):
// Header: nombre del programa + WeekBadge ("Semana 3 de 12")
//         + ABVariantBadge si ab_mode ("Semana A")
// ProgramPhaseBar (si hay program_phases en el JSON)
// WorkoutPlanCard × n (días de la semana con su plan)
// Footer: link "Ver programa completo →" (a /c/[slug]/workout/[planId] del día de hoy)

// Sin programa activo: card con "Sin programa activo" + icono + "Pídele a tu coach"
```

---

### `ProgramPhaseBar` — Client Component

```typescript
interface ProgramPhaseBarProps {
  phases: Array<{ name: string; weeks: number; color?: string }>
  currentWeek: number
  totalWeeks: number
}

// Barra horizontal dividida en segmentos de color por fase
// Marker animado que se desliza a la posición actual

// Marker animation:
// motion.div
// initial={{ left: '0%' }}
// animate={{ left: `${(currentWeek / totalWeeks) * 100}%` }}
// transition={{ ...springs.smooth, delay: 0.3 }}

// Sin phases: solo barra de progreso simple
// <div className="h-2 bg-muted rounded-full overflow-hidden">
//   <motion.div className="h-full bg-[color:var(--theme-primary)] rounded-full"
//     initial={{ width: '0%' }} animate={{ width: `${pct}%` }}
//     transition={springs.lazy} />
// </div>
```

---

### `WorkoutPlanCard` — Client Component

```typescript
// Tarjeta horizontal compacta para cada día del programa
// isToday → highlighted con color brand
// isCompleted → checkmark verde + text ligeramente faded

// Animation: variants={fadeSlideLeft}, stagger from parent (0.05s)
// whileHover: x: 4 (leve slide derecha), cursor pointer

// <Link href={/c/[slug]/workout/[planId]}>
//   <div className={cn(
//     "flex items-center gap-4 rounded-xl p-3 border transition-colors",
//     isToday ? "bg-[color:var(--theme-primary)]/10 border-[color:var(--theme-primary)]/30"
//             : "bg-card border-border hover:bg-accent/50"
//   )}>
//     <!-- Day badge (LUN / MAR...) -->
//     <!-- Plan title + blocks count -->
//     <!-- Checkmark o chevron -->
//   </div>
// </Link>
```

---

### `PersonalRecordsBanner` — Server async

```typescript
// Si no hay PRs nuevos en 14 días → return null (no renderiza nada)
// Si hay PRs: horizontal scroll strip

// "overflow-x-auto scrollbar-none -mx-4 px-4"
// "flex gap-2 w-max py-1"
// PRBadge × n (stagger animation)

// Lógica PR (server-side):
// Paso 1: logs con peso en últimos 14 días
// Paso 2: máximo histórico por exercise_id (todos los tiempos)
// Paso 3: PR = cuando recent_max >= all_time_max (o all_time_max es nulo)
// Uno por ejercicio (el mejor de los 14 días)
// Máximo 5 PRs mostrados (los más impresionantes por peso)
```

---

### `PRBadge` — Client Component

```typescript
// Chip gold/amber con trophy icon
// Si achievedAt es en las últimas 24h: confetti al montar
//   guard: localStorage.getItem(`pr-confetti-${exerciseId}-${date}`) para no repetir

// confetti config: { particleCount: 80, spread: 60, origin: { x: 0.5, y: 0.7 } }

// Entry animation:
// initial: { scale: 0, rotate: -10 }
// animate: { scale: 1, rotate: 0 }
// transition: springs.elastic
// stagger delay: index * 0.08

// "flex items-center gap-1.5 px-3 py-1.5 rounded-full
//  bg-gradient-to-r from-yellow-400/20 to-amber-400/20
//  dark:from-yellow-400/10 dark:to-amber-400/10
//  border border-yellow-400/40 dark:border-yellow-800/50
//  whitespace-nowrap"
```

---

### `RecentWorkoutsSection` — Server async

```typescript
// Datos: getRecentWorkoutLogs (React.cache'd)
// Agrupa logs por fecha ISO → 5 sesiones más recientes
// Cada sesión: { date, sets count, exercises count, planId }

// GlassCard con header "Actividad Reciente"
// divide-y divide-border/30
// WorkoutLogItem × max 5
// Footer: "Ver historial completo →"
```

---

## 4. Animaciones — `src/lib/animation-presets.ts`

```typescript
import { useReducedMotion } from 'framer-motion'

export const springs = {
  snappy:  { type: 'spring', stiffness: 400, damping: 30 },
  smooth:  { type: 'spring', stiffness: 200, damping: 25 },
  lazy:    { type: 'spring', stiffness: 80,  damping: 20 },
  elastic: { type: 'spring', stiffness: 500, damping: 25, restDelta: 0.001 },
} as const

export const staggerContainer = (staggerChildren = 0.06, delayChildren = 0) => ({
  hidden: {},
  show: { transition: { staggerChildren, delayChildren } },
})

export const fadeSlideUp = {
  hidden: { opacity: 0, y: 16 },
  show:   { opacity: 1, y: 0 },
}

export const fadeSlideLeft = {
  hidden: { opacity: 0, x: -10 },
  show:   { opacity: 1, x: 0 },
}

export const scaleIn = {
  hidden: { opacity: 0, scale: 0.85 },
  show:   { opacity: 1, scale: 1 },
}

// Hook para aplicar animaciones o no según prefers-reduced-motion
export function useAnimationVariant<T extends object>(
  fullVariant: T,
  reducedVariant?: Partial<T>
): T {
  const reduced = useReducedMotion()
  if (!reduced) return fullVariant
  // En modo reduced: solo fade (opacity), sin transforms
  return { ...fullVariant, ...reducedVariant } as T
}
```

### Tabla de animaciones por componente

| Componente | Animación | Spring |
|---|---|---|
| ClientGreeting (words) | stagger fade slide up | snappy |
| CalendarDay (7 cells) | stagger scale in | snappy |
| WorkoutHeroCard (entry) | fade slide up | smooth |
| WorkoutHeroCard (progress bar) | width 0→% | lazy |
| StreakWidget (flame) | scale pulse [1,1.2,1] repeat | — |
| ComplianceRing (fill) | useMotionValue 0→value | lazy (stiffness:60) |
| CheckInBanner (overdue border) | opacity pulse [1,0.3,1] repeat | — |
| MacroBar (fill) | width 0→% con useInView | lazy + stagger 0.15 |
| MealCompletionRow (check) | SVG pathLength 0→1 | ease 0.3s |
| TrendArrow (bounce) | y [0,±4,0] repeat | — |
| ProgramPhaseBar (marker) | left 0→pct% | smooth delay:0.3 |
| WorkoutPlanCard (list) | stagger fade slide left | smooth |
| PRBadge (entry) | scale 0→1 + rotate | elastic stagger:0.08 |
| RestDayCard (illustration) | y [0,-10,0] repeat | — |
| QuickLogSheet (+ button) | whileTap scale 0.85 | elastic |

**Todos respetan `useReducedMotion()`** — en modo reduced solo opacity fade, sin transforms.

---

## 5. Layout Responsivo

### Mobile (< 640px) — Prioridad máxima (PWA)
```
Sticky header (h-14, pt-safe-top, bg-background/80 blur)
│ Greeting + StreakWidget + Settings
├── CheckIn Banner (si urgente)
├── WeekCalendar strip (7 cols, compact text-[11px])
├── WorkoutHeroCard / RestDayCard (full width, min-h-[200px])
├── ComplianceRingCluster (3 anillos, w-18 h-18)
├── NutritionDailySummary (full width)
├── WeightWidget (full width, sparkline h-16)
├── PRBanner (horizontal scroll, -mx-4 px-4)
├── ActiveProgramSection (full width)
└── RecentWorkoutsSection (full width)
pb-[calc(80px+env(safe-area-inset-bottom))]  ← bottom nav
```

### Tablet Portrait (768px–1024px)
```
Header (non-sticky)
│ CheckIn Banner
│ WeekCalendar
├─[main col]──────────┬──[side col 280px]──┤
│ WorkoutHeroCard      │ ComplianceRings    │
│ NutritionSummary     │ WeightWidget       │
├─────────────────────┴────────────────────┤
│ PRBanner (full width scroll)             │
│ ActiveProgramSection                     │
│ RecentWorkoutsSection                    │
```

### Desktop (>= 1024px)
```
┌──[coach sidebar 240px]──┬──[main]────────────────┬──[right panel 300px sticky]──┐
│                         │ Header (not sticky)     │ StreakWidget                 │
│                         │ CheckIn Banner          │ ComplianceRingCluster        │
│                         │ WeekCalendar            │ WeightWidget (full chart)    │
│                         │ WorkoutHeroCard         │ NutritionDailySummary        │
│                         │ ActiveProgramSection    │ PRBanner (vertical list)     │
│                         │ RecentWorkoutsSection   │                              │
└─────────────────────────┴─────────────────────────┴──────────────────────────────┘
Right panel: sticky top-6, self-start, flex-col gap-4
DashboardShell: lg:grid-cols-[minmax(0,1fr)_300px]
```

### iOS-specific
- `pt-safe-top` en header sticky (Dynamic Island / notch)
- `pb-safe-bottom` + 80px en DashboardShell para bottom nav
- Touch targets mínimo 44×44px (todos los botones)
- `scrollbar-none` en horizontal scrolls (PR banner)
- `-webkit-overflow-scrolling: touch` en contenedores scroll

### Pull-to-Refresh (mobile PWA)
```typescript
// En DashboardShell (Client wrapper):
// Solo activo cuando window.scrollY === 0
// touchstart: guardar startY
// touchmove: calcular pullDistance = currentY - startY
//   si pullDistance > 0 && pullDistance < 120:
//     mostrar spinner (opacity = pullDistance/60, capped at 1)
//     escalar spinner: scale = Math.min(pullDistance/60, 1)
// touchend: si pullDistance >= 60 → router.refresh()

// Spinner: circular, posición fixed top-safe-top, z-50
// "fixed top-[max(16px,env(safe-area-inset-top))] left-1/2 -translate-x-1/2 z-50"
```

---

## 6. Dark / Light Theme

### Regla base: NUNCA hardcodear colores
Usar siempre clases semánticas Tailwind o `var(--theme-primary)`.

### Mapa semántico
```
bg-background     → blanco (light) / #121212 (dark)
bg-card           → blanco (light) / #1E1E1E (dark)
bg-muted          → gray-100 (light) / gray-800/50 (dark)
text-foreground   → gray-900 (light) / gray-50 (dark)
text-muted-foreground → gray-500 (light) / gray-400 (dark)
border-border     → gray-200 (light) / gray-800 (dark)
```

### Patrones específicos por componente
```
DashboardHeader sticky:
  "bg-background/80 backdrop-blur-xl border-b border-border/40"
  → automático en ambos temas

WorkoutHeroCard gradient:
  "from-[color:var(--theme-primary)]/8 dark:from-[color:var(--theme-primary)]/14"

StreakWidget pill:
  "bg-orange-50 dark:bg-orange-950/50
   text-orange-600 dark:text-orange-300
   border-orange-200 dark:border-orange-800/50"

PRBadge:
  "from-yellow-400/20 to-amber-400/20 dark:from-yellow-400/10 dark:to-amber-400/10
   border-yellow-400/40 dark:border-yellow-800/50"

CheckInBanner overdue:
  "bg-red-50 dark:bg-red-950/30 border-l-red-500 dark:border-l-red-400"

CheckInBanner warning:
  "bg-amber-50 dark:bg-amber-950/30 border-l-amber-500 dark:border-l-amber-400"

RestDayCard:
  "from-slate-50 to-purple-50/30 dark:from-gray-900 dark:to-slate-900"

ComplianceRing track (via useTheme):
  light: trailColor="#e5e7eb", dark: trailColor="#374151"

WeightSparkline gradient:
  light: rgba(--theme-primary-rgb, 0.2)
  dark:  rgba(--theme-primary-rgb, 0.3)  ← un poco más visible en dark

Skeleton en todos los componentes:
  "bg-muted animate-pulse rounded-md"   (auto dark/light via bg-muted)
```

---

## 7. Skeletons — Loading States

### Filosofía
Los skeletons deben **imitar exactamente** la forma del contenido real. Misma altura, misma posición. El alumno no debe ver "saltos" de layout cuando carga el contenido.

### Skeletons a crear

**`DashboardHeaderSkeleton`**
```
h-14 flex items-center justify-between px-4
  Left: Skeleton h-5 w-36 (greeting)
  Right: Skeleton h-7 w-20 rounded-full (streak)
```

**`CalendarSkeleton`**
```
bg-card border rounded-2xl p-3
  grid grid-cols-7 gap-1
    ×7: flex flex-col items-center gap-1.5
      Skeleton h-2 w-5 (day label)
      Skeleton h-8 w-8 rounded-full (day number)
```

**`CheckInSkeleton`**
```
h-14 rounded-xl border — solo Skeleton lleno (sin detalles)
```

**`HeroAndComplianceSkeleton`**
```
Skeleton h-48 rounded-2xl (hero card)
+ grid grid-cols-3 gap-3 mt-4
    ×3: flex flex-col items-center gap-2
      Skeleton w-20 h-20 rounded-full
      Skeleton h-3 w-14
```

**`NutritionSkeleton`**
```
bg-card border rounded-2xl p-4 space-y-3
  Skeleton h-5 w-32 (title)
  Skeleton h-8 w-24 (calorie number)
  ×3: Skeleton h-2 w-full rounded-full (macro bars)
  ×3: Skeleton h-8 w-full rounded-lg (meal rows)
```

**`WeightSkeleton`**
```
bg-card border rounded-2xl p-4
  Skeleton h-8 w-24 (weight number)
  Skeleton h-[72px] w-full rounded-xl mt-3 (sparkline)
```

**`ProgramSkeleton`**
```
bg-card border rounded-2xl p-4 space-y-3
  Skeleton h-5 w-40 (program name)
  Skeleton h-2 w-full (phase bar)
  ×4: Skeleton h-14 w-full rounded-xl (plan cards)
```

**`HistorySkeleton`**
```
bg-card border rounded-2xl
  ×4: div h-14 border-b flex items-center gap-3 px-4
    Skeleton h-8 w-8 rounded-lg
    div space-y-1.5
      Skeleton h-3 w-32
      Skeleton h-2 w-20
```

---

## 8. `loading.tsx` — Rewrite

```tsx
// Componer todos los skeletons en el mismo layout que DashboardShell
// Mobile: columna única, mismo spacing
// Así el loading.tsx COINCIDE exactamente con el layout real

export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-4 space-y-4
                    pb-[calc(80px+env(safe-area-inset-bottom))]">
      <DashboardHeaderSkeleton />
      <CalendarSkeleton />
      <HeroAndComplianceSkeleton />
      <NutritionSkeleton />
      <WeightSkeleton />
      <ProgramSkeleton />
      <HistorySkeleton />
    </div>
  )
}
// No incluir CheckInSkeleton ni PRSkeleton (ambos pueden ser null)
```

---

## 9. Server Actions — `_actions/dashboard.actions.ts`

No se necesitan server actions nuevas. Reutilizar:
- `toggleMealCompletion` de `nutrition/actions.ts` → MealCompletionRow
- `logSetAction` de `workout/[planId]/actions.ts` → QuickLogSheet

La única acción nueva posible si se agrega "quick weight log" desde el WeightWidget:
```typescript
// OPCIONAL: si se quiere log rápido de peso desde WeightWidget
export async function quickLogWeightAction(weight: number) {
  // Insertar en check_ins con solo el campo weight (energy_level = null)
  // revalidatePath('/c', 'layout')
}
// Decidir en implementación si se incluye o se redirige a /check-in
```

---

## 10. Compliance Score — Cálculo Server-Side

Estos valores se calculan en `HeroAndComplianceGroup` antes de pasarlos a los rings:

```typescript
// workoutScore (últimos 30 días):
const thirtyDaysAgo = subDays(today, 30)
const plannedDays = new Set(
  allPlansInProgram
    .filter(p => workoutPlanMatchesVariant(p, activeVariant, abMode))
    .map(p => /* mapear day_of_week a fechas concretas en los últimos 30d */)
).size
const loggedDays = new Set(
  recentLogs.map(l => l.logged_at.split('T')[0])
).size
const workoutScore = plannedDays > 0 ? Math.min(Math.round((loggedDays / plannedDays) * 100), 100) : 0

// checkInScore (baseline: 1 check-in por semana = 100%):
const checkInsLast30 = checkInHistory.length
const checkInScore = Math.min(Math.round((checkInsLast30 / 4) * 100), 100)

// nutritionScore:
// Si hay daily_nutrition_logs en los últimos 30d:
//   nutritionScore = (días con log / 30) * 100
// Si no: 0 (y mostrar el anillo en gris con "Sin datos")
```

---

## 11. Checklist de Implementación (orden recomendado)

1. `src/lib/date-utils.ts` — utilidades de fecha (base de todo)
2. `src/lib/animation-presets.ts` — spring presets
3. `_data/dashboard.queries.ts` — todas las queries con React.cache()
4. `DashboardShell.tsx` — layout grid
5. `DashboardHeader.tsx` + `ClientGreeting.tsx` + `StreakWidget.tsx`
6. `WeekCalendar.tsx` + `CalendarDay.tsx`
7. `CheckInBanner.tsx`
8. `HeroSection.tsx` + `WorkoutHeroCard.tsx` + `RestDayCard.tsx`
9. `QuickLogSheet.tsx`
10. `ComplianceRingCluster.tsx` + `ComplianceRing.tsx`
11. `HeroAndComplianceGroup.tsx` (orquesta 8 + 10 con datos compartidos)
12. `NutritionDailySummary.tsx` + `MacroBar.tsx` + `MealCompletionRow.tsx`
13. `WeightWidget.tsx` + `WeightSparkline.tsx` + `TrendArrow.tsx`
14. `PersonalRecordsBanner.tsx` + `PRBadge.tsx`
15. `ActiveProgramSection.tsx` + `ProgramPhaseBar.tsx` + `WorkoutPlanCard.tsx`
16. `RecentWorkoutsSection.tsx` + `WorkoutLogItem.tsx`
17. `loading.tsx` — rewrite con nuevos skeletons
18. `page.tsx` — rewrite final con todos los Suspense boundaries
19. Pull-to-refresh en `DashboardShell` (Client wrapper)
20. Test E2E: mobile iOS (Safari), mobile Android (Chrome), desktop Chrome/Firefox

---

## 12. Verificación

### Por sección
- [ ] Header sticky en mobile, no sticky en desktop, `pt-safe-top` funciona en iOS
- [ ] Calendar muestra días correctos con zona horaria Santiago, dots correctos por A/B variant
- [ ] CheckInBanner desaparece si check-in reciente (< 3 días), muestra urgencia si > 7 días
- [ ] WorkoutHeroCard muestra el plan correcto del día y la variante A/B correcta
- [ ] RestDayCard muestra próximo día de entreno correctamente
- [ ] QuickLogSheet logra sets con logSetAction y actualiza optimísticamente
- [ ] ComplianceRings se llenan con animación, calculos son correctos
- [ ] NutritionSummary muestra datos del día o targets si sin log
- [ ] MealCompletionRow toggle funciona con optimistic update
- [ ] WeightWidget muestra peso actual + trend arrow correcta
- [ ] PRBadge solo aparece si hay PRs nuevos, confetti solo la primera vez
- [ ] ProgramPhaseBar muestra semana actual correctamente
- [ ] WorkoutPlanCard isToday highlighted, isCompleted con check

### Dark mode
- [ ] Cada componente verificado en tema oscuro sin colores hardcodeados
- [ ] GlassCard, gradients, borders todos correctos en dark

### Responsive
- [ ] iPhone SE (375px) — sin overflow horizontal, CTAs accesibles
- [ ] iPhone 14 Pro (393px) — Dynamic Island safe area correcta
- [ ] iPad (768px) — layout 2 columnas activado
- [ ] Desktop 1440px — right panel sticky funciona

### Performance
- [ ] Lighthouse PWA >= 90 en mobile
- [ ] No re-renders innecesarios (sin use client sin necesidad)
- [ ] React.cache deduplication verificada (ver en network tab = solo 1 query por tipo)
- [ ] Cada Suspense boundary carga de forma independiente (streaming visible en Network)

### Accesibilidad
- [ ] touch targets >= 44px en todos los botones mobile
- [ ] useReducedMotion respetado en todos los animated components
- [ ] Contraste de texto >= 4.5:1 en ambos temas
