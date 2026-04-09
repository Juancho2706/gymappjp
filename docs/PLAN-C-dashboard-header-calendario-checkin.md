# PLAN C — Dashboard: header, calendario, check-in

**Fuente (solo lectura):** `claudeplans/jaunty-fluttering-spark.md`  
**Checklist §11:** pasos **5–7**.

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

---

## Extracto §4 — tabla de animaciones (este sprint)

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


---

## Extracto §7 — skeletons

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