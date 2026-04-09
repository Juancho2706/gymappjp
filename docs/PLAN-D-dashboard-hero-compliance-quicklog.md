# PLAN D — Dashboard: hero, compliance, quick log

**Fuente (solo lectura):** `claudeplans/jaunty-fluttering-spark.md`  
**Checklist §11:** pasos **8–11**.

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

---

## Extracto §4 — tabla de animaciones

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

---

## Extracto §7 — HeroAndComplianceSkeleton

**`HeroAndComplianceSkeleton`**
```
Skeleton h-48 rounded-2xl (hero card)
+ grid grid-cols-3 gap-3 mt-4
    ×3: flex flex-col items-center gap-2
      Skeleton w-20 h-20 rounded-full
      Skeleton h-3 w-14
```


---

## Extracto §10 — Compliance score

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
