# Plan: Rework Workout Execution + Check-in del Alumno

## Context

Dos módulos con uso diario/mensual del alumno están al 68% y 63% respectivamente. El impacto percibido es alto: la pantalla de fin de entrenamiento es pobre (sin PRs, sin desglose), y el check-in es un formulario plano sin contexto ni UX mobile adecuada.

**Scope:** Rework completo — UX, datos, animaciones, PRs, vibración, safe-area.  
**Check-ins:** Mensuales (iniciados por el coach), pero el alumno puede hacer extras libremente. Sin enforcement de cadencia.

**Armonía de datos (descubrimiento crítico):**  
Los workout logs se invalidan solo en `/c` (alumno) pero no en `/coach/clients/[clientId]` (perfil coach). Esto significa que el coach ve PRs y tonelaje **desactualizados** hasta que el alumno o el coach hace un refresco manual. Este plan lo corrige en la misma pasada.

---

## Arquitectura de datos relevante

```
logSetAction()
  → revalidatePath('/c', 'layout')          ← alumno OK
  → (FALTA) revalidatePath('/coach/clients/[clientId]')  ← coach ve datos viejos

submitCheckinAction()
  → revalidatePath('/c', 'layout')          ← alumno OK
  → revalidatePath('/coach/clients/[clientId]') ← coach OK ✓
```

**Queries cacheadas con React.cache() (request-scoped, no persistente):**  
- `getPersonalRecords(clientId)` — PRs dashboard alumno → `PersonalRecordsBanner`  
- `getRecentWorkoutLogs(clientId)` — logs 30d → `RecentWorkoutsSection`, hero compliance rings  
- `getLastCheckIn(clientId)` → `CheckInBanner`  
- `getCheckInHistory30Days(clientId)` → `WeightWidget`  
- `getHeroComplianceBundle(userId, coachSlug)` → compliance rings dashboard  
- `getClientProfileData(clientId)` (coach profile) → Training tab PRs, tonnage, Progress tab

Todos se resetean automáticamente tras `revalidatePath()` en la siguiente request.

---

## Orden de implementación

```
1. actions.ts workout — fix revalidation (fix crítico, 2 líneas)
2. DB Migration — back_photo_url en check_ins
3. workout/page.tsx — añadir exerciseMaxes + activeWeekVariant
4. WorkoutSummaryOverlay.tsx — reescritura completa
5. WorkoutExecutionClient.tsx — progress bar, scroll, block completion
6. LogSetForm.tsx — animaciones de feedback
7. check-in/actions.ts — manejar back_photo
8. check-in/page.tsx — fetch lastCheckIn, header sticky
9. check-in/loading.tsx — nuevo archivo
10. check-in/CheckInForm.tsx — step wizard completo
```

---

## PASO 1 — Fix revalidación workout logs (2 líneas, alto impacto)

**Archivo:** `src/app/c/[coach_slug]/workout/[planId]/actions.ts`

En `logSetAction`, obtener el `clientId` (ya disponible como `user.id`) y el `coachId` del bloque (via la query de `workout_blocks.client_id`). Agregar revalidación del perfil coach:

```typescript
// Ya existe:
revalidatePath('/c', 'layout')

// AGREGAR — para que el tab Training del coach se actualice:
// client_id ya está disponible como user.id
// Necesitamos el clientId para construir la ruta
revalidatePath(`/coach/clients/${user.id}`)
```

**Nota:** `logSetAction` ya tiene `user.id`. Usar directamente.

---

## PASO 2 — Migración DB

**Archivo nuevo:** `supabase/migrations/20260410200000_add_back_photo_url_to_check_ins.sql`

```sql
ALTER TABLE public.check_ins
  ADD COLUMN IF NOT EXISTS back_photo_url text;
```

No-breaking, hereda RLS de fila. Después: regenerar `database.types.ts` via MCP `mcp__supabase__apply_migration` + `mcp__supabase__generate_typescript_types`.

---

## PASO 3 — `workout/[planId]/page.tsx`

**Archivo:** `src/app/c/[coach_slug]/workout/[planId]/page.tsx`

**A. Variante A/B activa:**
```typescript
import { resolveActiveWeekVariantForDisplay } from '@/lib/workout/programWeekVariant'
// Después de fetchear program:
const activeWeekVariant = program ? resolveActiveWeekVariantForDisplay(program) : null
```

**B. All-time exercise maxes para PR detection (nueva query):**

Extraer `exerciseIds` de los bloques del plan. Query:
```typescript
// Obtener max weight por ejercicio en el historial (excluyendo bloques de hoy)
const blockIdsSet = new Set(plan.workout_blocks.map(b => b.id))
const { data: maxData } = await supabase
  .from('workout_logs')
  .select('weight_kg, workout_blocks!inner(exercise_id)')
  .eq('client_id', user.id)
  .not('weight_kg', 'is', null)

const exerciseMaxes: Record<string, number> = {}
maxData?.forEach((log: any) => {
  // Excluir logs de la sesión actual (para que un PR sea vs historia previa)
  if (blockIdsSet.has(log.block_id)) return
  const exId = log.workout_blocks?.exercise_id
  if (!exId || log.weight_kg == null) return
  if (exerciseMaxes[exId] == null || log.weight_kg > exerciseMaxes[exId]) {
    exerciseMaxes[exId] = log.weight_kg
  }
})
```

**C. Props añadidas a `WorkoutExecutionClient`:**
```typescript
exerciseMaxes={exerciseMaxes}
activeWeekVariant={activeWeekVariant}
```

---

## PASO 4 — `WorkoutSummaryOverlay.tsx` (reescritura completa)

**Archivo:** `src/app/c/[coach_slug]/workout/[planId]/WorkoutSummaryOverlay.tsx`

**Props nuevas:**
```typescript
interface WorkoutSummaryOverlayProps {
  planTitle: string
  logs: Array<{ block_id: string; weight_kg: number | null; reps_done: number | null; rpe: number | null; set_number: number }>
  blocks: Array<{ id: string; exercises: ExerciseType | ExerciseType[]; sets: number }>
  exerciseMaxes: Record<string, number>  // exercise_id → max weight histórico
  onDone: () => void
}
```

**Lógica client-side (3 useMemos, sin fetches adicionales):**

```typescript
// 1. exerciseBreakdown — agrupar logs por ejercicio
const exerciseBreakdown = useMemo(() => {
  // Por cada bloque, normalizar exercises (array o objeto único)
  // Agrupar por exercise_id: nombre, muscleGroup, sets[], totalVolume, maxWeight, best1RM
  // epleyOneRM(weight, reps) importado de profileTrainingAnalytics.ts
}, [blocks, logs])

// 2. detectedPRs — ejercicios donde sessionMaxWeight > exerciseMaxes[exId]
const detectedPRs = useMemo(() => {
  return exerciseBreakdown.filter(ex => {
    const historicMax = exerciseMaxes[ex.exerciseId]
    return historicMax != null && ex.maxWeight > historicMax
  }).map(ex => ({
    exerciseName: ex.name,
    newWeightKg: ex.maxWeight,
    prevWeightKg: exerciseMaxes[ex.exerciseId],
    estimated1RM: Math.round(epleyOneRM(ex.maxWeight, ...) * 10) / 10
  }))
}, [exerciseBreakdown, exerciseMaxes])

// 3. muscleGroupVolume — volumen por grupo muscular para mini barras
const muscleGroupVolume = useMemo(() => {
  // Map<muscleGroup, totalVolume> → ordenar desc → calcular pct relativo al max
}, [exerciseBreakdown])
```

**Confetti (useEffect, solo en mount):**
```typescript
useEffect(() => {
  if (detectedPRs.length > 0) {
    // 3 ráfagas: centro + izq + der con delays 0/300/500ms
    confetti({ particleCount: 200, spread: 100, origin: { y: 0.5 } })
    setTimeout(() => confetti({ particleCount: 80, spread: 60, origin: { x: 0.2, y: 0.6 } }), 300)
    setTimeout(() => confetti({ particleCount: 80, spread: 60, origin: { x: 0.8, y: 0.6 } }), 500)
  } else {
    confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } })
  }
}, [])
```

**Layout nuevo (overlay scrollable con `pt-safe pb-8`):**
```
fixed inset-0 z-[9999] bg-background/95 backdrop-blur-sm overflow-y-auto
├── Header: Zap/Trophy icon + "¡Sesión completada!" + planTitle
├── Stats row: [Sets hechos] [Reps totales] [Volumen total kg]
│
├── Sección PRs (solo si detectedPRs.length > 0):
│   Badge: "🏆 N récords personales"
│   Por cada PR (stagger delay 0.1s):
│     Nombre | prevKg → newKg (+X%) | 1RM estimado
│     Fondo: amber/yellow gradient + border-yellow-400/40
│
├── Desglose por ejercicio (stagger fadeSlideUp):
│   Nombre + grupo muscular | sets | volumen
│
├── Volumen por grupo muscular:
│   Barras inline animadas (motion.div width %)
│
└── Botón "Volver al inicio"
```

**`useReducedMotion`:** `const reducedMotion = useReducedMotion()` → omitir `initial`/`animate` de todos los motion.div si true.

**Imports:**
- `epleyOneRM` ← `src/app/coach/clients/[clientId]/profileTrainingAnalytics.ts`
- `springs`, `fadeSlideUp` ← `src/lib/animation-presets.ts`
- `canvas-confetti` (ya instalado)
- `useReducedMotion` de framer-motion

---

## PASO 5 — `WorkoutExecutionClient.tsx`

**Archivo:** `src/app/c/[coach_slug]/workout/[planId]/WorkoutExecutionClient.tsx`

**A. Props nuevas:**
```typescript
exerciseMaxes?: Record<string, number>
activeWeekVariant?: 'A' | 'B' | null
```

**B. Reemplazar 4-cell stat grid por slim progress bar:**
- Eliminar `grid grid-cols-2 md:grid-cols-4` de stat cards del header
- Reemplazar con:
  ```tsx
  {/* Barra de progreso animada */}
  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
    <motion.div
      className="h-full rounded-full"
      style={{ backgroundColor: 'var(--theme-primary)' }}
      initial={{ width: 0 }}
      animate={{ width: `${completionPct}%` }}
      transition={reducedMotion ? { duration: 0 } : springs.smooth}
    />
  </div>
  <div className="flex justify-between mt-1.5 text-xs text-muted-foreground">
    <span><strong className="text-foreground">{completedSetCount}</strong>/{requiredSets} series</span>
    <span style={{ color: 'var(--theme-primary)' }} className="font-bold">{completionPct}%</span>
  </div>
  ```
- Si `activeWeekVariant` no es null: mostrar badge "Semana A" / "Semana B" en el header

**C. Mejorar section headers:**
- Barra izquierda colored (`var(--theme-primary)`, opacity 0.4 en warmup/cooldown, 1 en main)
- Contador de bloques a la derecha
- `<hr className="flex-1 h-px bg-border/50">` visual

**D. Block completion — visual clara:**
- Wrap de cada bloque en `motion.div layout` con `animate={{ opacity: isBlockCompleted ? 0.6 : 1 }}`
- Cuando completo: `<CheckCircle2>` verde top-right con entrada `scale` spring elastic
- Border cambia a `border-emerald-500/30`

**E. Scroll-to-next-block:**
```typescript
const blockRefs = useRef<Map<string, HTMLDivElement>>(new Map())

// En handleLogged, tras actualizar sessionLogs:
// Si el bloque recién logueado ahora está completo → buscar siguiente incompleto
// → scrollIntoView({ behavior: 'smooth', block: 'start' }) con setTimeout 350ms
```

**F. Historial previo — fecha relativa:**
```typescript
import { formatRelativeDate } from '@/lib/date-utils'
// Junto a los datos históricos: formatRelativeDate(date) → "Ayer" / "Hace 3 días"
```

**G. Pasar al WorkoutSummaryOverlay:**
```tsx
<WorkoutSummaryOverlay
  planTitle={plan.title}
  logs={sessionLogs}
  blocks={plan.workout_blocks}
  exerciseMaxes={exerciseMaxes ?? {}}
  onDone={() => router.push(`/c/${coachSlug}/dashboard`)}
/>
```

---

## PASO 6 — `LogSetForm.tsx` (pulido, no reescritura)

**Archivo:** `src/app/c/[coach_slug]/workout/[planId]/LogSetForm.tsx`

*(Ya tiene `useOptimistic` y `navigator.vibrate` — mantener tal cual)*

**A. Submit button — animación scale-pop al pasar a logged:**
```tsx
<motion.button
  key={isLogged ? 'logged' : 'idle'}
  initial={isLogged ? { scale: 0.5, opacity: 0 } : false}
  animate={{ scale: 1, opacity: 1 }}
  transition={springs.elastic}
  ...
/>
```

**B. Row background — transición suave a emerald:**
```tsx
<motion.div
  layout
  animate={{
    backgroundColor: isLogged
      ? 'color-mix(in srgb, #10b981 10%, transparent)'
      : 'transparent',
  }}
  transition={{ duration: 0.4 }}
  className="rounded-xl"
>
  <form ...>
```

**C. Prompt RPE post-log (opcional, si no fue llenado):**
- `AnimatePresence` expand desde height 0 un slider RPE (6–10) visible cuando `isLogged && !existingLog?.rpe`
- Al cambiar el slider, dispatchar el mismo `logSetAction` (la action ya hace UPDATE si existe la fila)

---

## PASO 7 — `check-in/actions.ts`

**Archivo:** `src/app/c/[coach_slug]/check-in/actions.ts`

**A. Zod schema — agregar `back_photo`:**
- Mismas reglas que `photo`: opcional, ≤5MB, tipos JPG/PNG/WEBP

**B. Upload `back_photo`:**
- Path: `{user_id}/{timestamp}-back-{random}.{ext}` en bucket `checkins`
- Mismo patrón exacto que el upload de `photo`
- `backPhotoUrl = publicUrl` o null

**C. Insert — añadir `back_photo_url`:**
```typescript
.insert({ ..., back_photo_url: backPhotoUrl })
```

---

## PASO 8 — `check-in/page.tsx`

**Archivo:** `src/app/c/[coach_slug]/check-in/page.tsx`

**A. Cambiar título "Semanal" → "Mensual"** en header y description.

**B. Fetch last check-in:**
```typescript
const { data: lastCheckIn } = await supabase
  .from('check_ins')
  .select('weight, energy_level, created_at')
  .eq('client_id', user.id)
  .order('created_at', { ascending: false })
  .limit(1)
  .maybeSingle()
```
*(Query directa — no reusar `getLastCheckIn()` del dashboard para evitar contaminación del React.cache() cross-page)*

**C. Header sticky mobile-first:**
- `sticky top-0 z-40 bg-background/95 backdrop-blur-xl pt-safe`
- Referencia: `/c/[coach_slug]/nutrition/page.tsx`

**D. Pasar `lastCheckIn` a `CheckInForm`.**

---

## PASO 9 — `check-in/loading.tsx` (nuevo)

**Archivo nuevo:** `src/app/c/[coach_slug]/check-in/loading.tsx`

```tsx
import { Skeleton } from '@/components/ui/skeleton'

export default function CheckInLoading() {
  return (
    <div className="min-h-dvh pb-20">
      <header className="border-b px-4 py-4 pt-safe sticky top-0 z-40 bg-background/95 backdrop-blur-xl">
        <Skeleton className="h-4 w-16 mb-4" />
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-4 w-64" />
      </header>
      <main className="px-4 py-6 max-w-lg mx-auto space-y-6">
        <div className="flex justify-center gap-3">
          {[1,2,3].map(i => <Skeleton key={i} className="w-8 h-8 rounded-full" />)}
        </div>
        <div className="bg-card border rounded-2xl p-6 space-y-5">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-11 w-full rounded-xl" />
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-8 w-full rounded" />
          <Skeleton className="h-11 w-full rounded-xl mt-4" />
        </div>
      </main>
    </div>
  )
}
```

---

## PASO 10 — `check-in/CheckInForm.tsx` (reescritura completa)

**Archivo:** `src/app/c/[coach_slug]/check-in/CheckInForm.tsx`

**Props:**
```typescript
interface Props {
  coachSlug: string
  coachPrimaryColor: string
  lastCheckIn: { weight: number | null; energy_level: number | null; created_at: string } | null
}
```

**Estado:**
```typescript
currentStep: 1 | 2 | 3
direction: 1 | -1       // para animación direction-aware
weight: string
energyLevel: number     // default 7
notes: string
frontFile: File | null
backFile: File | null
frontPreview: string | null
backPreview: string | null
fileErrors: { front?: string; back?: string }
isPending: boolean
```

**Submit (`handleAction`):**
```typescript
async function handleAction() {
  setIsPending(true)
  const formData = new FormData()
  formData.set('weight', weight)
  formData.set('energy_level', String(energyLevel))
  formData.set('notes', notes)
  if (frontFile) {
    const compressed = await imageCompression(frontFile, { maxSizeMB: 2, maxWidthOrHeight: 1920, useWebWorker: true })
    formData.set('photo', compressed, frontFile.name)
  }
  if (backFile) {
    const compressed = await imageCompression(backFile, { maxSizeMB: 2, maxWidthOrHeight: 1920, useWebWorker: true })
    formData.set('back_photo', compressed, backFile.name)
  }
  startTransition(() => formAction(formData))
}
```

**Transición entre pasos (pattern de `OnboardingForm.tsx`):**
```typescript
const reducedMotion = useReducedMotion()

const stepVariants = {
  hidden: (d: number) => ({ x: d > 0 ? 40 : -40, opacity: 0 }),
  visible: { x: 0, opacity: 1, transition: { duration: reducedMotion ? 0 : 0.28 } },
  exit: (d: number) => ({ x: d > 0 ? -40 : 40, opacity: 0, transition: { duration: reducedMotion ? 0 : 0.2 } }),
}
const goNext = () => { setDirection(1); setCurrentStep(s => s + 1) }
const goPrev = () => { setDirection(-1); setCurrentStep(s => s - 1) }
```

**Step indicator (progress dots):**
```tsx
<div className="flex items-center justify-center gap-2 mb-6">
  {[1, 2, 3].map(step => (
    <motion.div
      key={step}
      animate={{
        width: currentStep === step ? 24 : 8,
        backgroundColor: currentStep >= step ? coachPrimaryColor : 'hsl(var(--muted))',
      }}
      className="h-2 rounded-full"
      transition={springs.snappy}
    />
  ))}
</div>
```

**Paso 1 — Peso + Energía:**
- Banner contexto anterior (si `lastCheckIn`):
  ```tsx
  <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm mb-4">
    <p className="text-xs text-muted-foreground">Tu último check-in</p>
    <p className="font-bold">{lastCheckIn.weight}kg · Energía {lastCheckIn.energy_level}/10</p>
    <p className="text-xs text-muted-foreground">{formatRelativeDate(lastCheckIn.created_at.slice(0, 10))}</p>
  </div>
  ```
  Import: `formatRelativeDate` ← `src/lib/date-utils.ts`
- Input peso (controlled, igual al actual)
- Slider energía 1–10 (controlled, igual al actual)
- Botón "Continuar →" (disabled si `weight` está vacío)

**Paso 2 — Fotos (opcionales):**
- Texto: "Las fotos son opcionales pero ayudan a tu coach a ver tu evolución."
- Upload foto frontal (mismo component que actual, controlado con `frontFile`)
- Upload foto espalda/perfil (mismo componente, `backFile`, label "Foto de espalda o perfil")
- Validación igual: formato + tamaño, errores en `fileErrors.front/.back`
- Botones Atrás + Continuar

**Paso 3 — Notas + Resumen + Submit:**
- Textarea notas (≤1000 chars, opcional)
- Resumen before submit:
  ```tsx
  <div className="rounded-xl border border-border p-3 text-sm space-y-1 mb-4">
    <p>Peso: <strong>{weight}kg</strong></p>
    <p>Energía: <strong>{energyLevel}/10</strong></p>
    <p>Fotos: <strong>{[frontFile, backFile].filter(Boolean).length} adjuntas</strong></p>
  </div>
  ```
- Error general si `state.error`
- Botón submit con spinner si `isPending`

**Navegación:**
```tsx
<div className="flex gap-3 mt-6">
  {currentStep > 1 && (
    <button type="button" onClick={goPrev}
      className="flex-1 h-11 rounded-xl border border-border font-semibold flex items-center justify-center gap-1.5">
      <ChevronLeft className="w-4 h-4" /> Atrás
    </button>
  )}
  {currentStep < 3 ? (
    <button type="button" onClick={goNext}
      disabled={currentStep === 1 && !weight}
      className="flex-1 h-11 rounded-xl font-semibold text-white disabled:opacity-50"
      style={{ backgroundColor: coachPrimaryColor }}>
      Continuar <ChevronRight className="w-4 h-4" />
    </button>
  ) : (
    <button type="button" onClick={handleAction} disabled={isPending}
      className="flex-1 h-11 rounded-xl font-semibold text-white"
      style={{ backgroundColor: coachPrimaryColor }}>
      {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enviar Check-in'}
    </button>
  )}
</div>
```

**Success state:** Igual al actual pero con `motion.div` entrada `{ scale: 0.8, opacity: 0 } → { scale: 1, opacity: 1 }` usando `springs.elastic`.

**Keyboard scroll:** `onFocus` en inputs:
```typescript
const handleInputFocus = (e: React.FocusEvent<HTMLElement>) => {
  setTimeout(() => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300)
}
```

---

## Utilidades reutilizadas (no crear nuevas)

| Utilidad | Archivo fuente |
|----------|----------------|
| `epleyOneRM()` | `src/app/coach/clients/[clientId]/profileTrainingAnalytics.ts` |
| `formatRelativeDate()` | `src/lib/date-utils.ts` |
| `resolveActiveWeekVariantForDisplay()` | `src/lib/workout/programWeekVariant.ts` |
| `springs`, `fadeSlideUp`, `staggerContainer` | `src/lib/animation-presets.ts` |
| `canvas-confetti` | ya instalado (usado en dashboard) |
| `imageCompression` | ya instalado (usado en CheckInForm actual) |
| `useReducedMotion` | framer-motion |

---

## Armonía con otros componentes (tabla de impacto)

| Cambio en este plan | Componente que recibe el beneficio |
|--------------------|------------------------------------|
| Fix `revalidatePath` en `logSetAction` + `/coach/clients/[id]` | `TrainingTabB4Panels` (PRs frescos), `profileTrainingAnalytics` (tonelaje actualizado) |
| `exerciseMaxes` en `page.tsx` | `WorkoutSummaryOverlay` (PRs sesión) |
| `activeWeekVariant` en `page.tsx` | Badge A/B en `WorkoutExecutionClient` header |
| `lastCheckIn` en `check-in/page.tsx` | Banner contexto en `CheckInForm` paso 1 |
| `back_photo_url` en `check_ins` | `ProgressBodyCompositionB6` (photo slider) en perfil coach |
| Título "Mensual" | Consistencia con la realidad del producto |

---

## Archivos a crear/modificar

| Archivo | Acción |
|---------|--------|
| `supabase/migrations/20260410200000_add_back_photo_url_to_check_ins.sql` | Nuevo |
| `src/app/c/[coach_slug]/workout/[planId]/actions.ts` | Modificar (añadir revalidatePath coach) |
| `src/app/c/[coach_slug]/workout/[planId]/page.tsx` | Modificar (exerciseMaxes, activeWeekVariant) |
| `src/app/c/[coach_slug]/workout/[planId]/WorkoutSummaryOverlay.tsx` | Reescritura completa |
| `src/app/c/[coach_slug]/workout/[planId]/WorkoutExecutionClient.tsx` | Modificar (progress bar, scroll, block completion, A/B badge) |
| `src/app/c/[coach_slug]/workout/[planId]/LogSetForm.tsx` | Modificar (animaciones de feedback, RPE post-log) |
| `src/app/c/[coach_slug]/check-in/actions.ts` | Modificar (back_photo) |
| `src/app/c/[coach_slug]/check-in/page.tsx` | Modificar (lastCheckIn, header sticky, título) |
| `src/app/c/[coach_slug]/check-in/loading.tsx` | Nuevo |
| `src/app/c/[coach_slug]/check-in/CheckInForm.tsx` | Reescritura completa |

---

## Verificación

1. **`npm run build`** — sin errores de tipos
2. **Aplicar migración** via `mcp__supabase__apply_migration` y regenerar types con `mcp__supabase__generate_typescript_types`
3. **Workout execution manual:**
   - Completar todos los sets de un bloque → bloque se vuelve tenue + checkmark + scroll al siguiente
   - Completar entrenamiento → overlay con desglose + PRs si aplica + confetti
   - Verificar datos en dashboard alumno (PRs banner, recent workouts) actualizados
   - Verificar datos en tab Training del perfil coach actualizados (fix revalidatePath)
4. **Check-in manual:**
   - 3 pasos con animación direction-aware
   - Dots progresan con color del coach
   - Paso 1: banner con datos del check-in anterior
   - Paso 2: 2 fotos adjuntables, preview individual
   - Paso 3: resumen + enviar → success screen
   - Verificar WeightWidget dashboard actualizado + ProgressBodyCompositionB6 coach actualizado
5. **Safe-area** en iOS (Dynamic Island) — check-in header fijo
6. **`prefers-reduced-motion`** — sin animaciones de posición activas en ambos módulos
