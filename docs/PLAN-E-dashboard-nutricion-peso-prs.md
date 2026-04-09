# PLAN E — Dashboard: nutrición, peso, PRs

**Fuente (solo lectura):** `claudeplans/jaunty-fluttering-spark.md`  
**Checklist §11:** pasos **12–14**.

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

## Extracto §4 — tabla de animaciones

| MacroBar (fill) | width 0→% con useInView | lazy + stagger 0.15 |
| MealCompletionRow (check) | SVG pathLength 0→1 | ease 0.3s |
| TrendArrow (bounce) | y [0,±4,0] repeat | — |
| ProgramPhaseBar (marker) | left 0→pct% | smooth delay:0.3 |
| WorkoutPlanCard (list) | stagger fade slide left | smooth |
| PRBadge (entry) | scale 0→1 + rotate | elastic stagger:0.08 |
| RestDayCard (illustration) | y [0,-10,0] repeat | — |

---

## Extracto §7 — skeletons

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

## Extracto §9 — Server actions

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