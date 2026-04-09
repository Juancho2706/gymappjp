# PLAN A — Dashboard: fundamentos y datos

**Fuente (solo lectura, no modificar):** `claudeplans/jaunty-fluttering-spark.md`  
**Checklist §11 del maestro:** pasos **1–3** (`date-utils.ts`, `animation-presets.ts`, `_data/dashboard.queries.ts`).

Extracto literal del plan maestro.

---

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

## Extracto §4 — presets de animación


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