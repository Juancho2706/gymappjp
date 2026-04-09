# PLAN F — Dashboard: programa, historial, loading, page, QA

**Fuente (solo lectura):** `claudeplans/jaunty-fluttering-spark.md`  
**Checklist §11:** pasos **15–20**.

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

## Extracto §4 — animaciones

| PRBadge (entry) | scale 0→1 + rotate | elastic stagger:0.08 |
| RestDayCard (illustration) | y [0,-10,0] repeat | — |
| QuickLogSheet (+ button) | whileTap scale 0.85 | elastic |


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

## Extracto §9 — acción opcional

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

## Extracto §11 — Checklist

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

## Extracto §12 — Verificación

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


---

### Extracto §3 — page.tsx

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
