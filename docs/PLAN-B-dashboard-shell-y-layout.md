# PLAN B — Dashboard: shell y layout

**Fuente (solo lectura):** `claudeplans/jaunty-fluttering-spark.md`  
**Checklist §11:** paso **4** (`DashboardShell.tsx`). Pull-to-refresh (Plan F).

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

### Extracto §3 — DashboardShell

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
