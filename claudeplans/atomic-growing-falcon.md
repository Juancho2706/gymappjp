# Plan Maestro: REWORK TOTAL — Directorio de Alumnos + Perfil del Alumno
## Objetivo: derrotar a la competencia

> El coach debe sentir que tiene un **centro de comando de alto rendimiento**. Cada pixel trabaja. Cada número es accionable. La UI no solo muestra datos — los interpreta. El coach entra al directorio y en 3 segundos sabe quién necesita su atención hoy.

---

## Stack de librerías

| Librería | Versión | Uso |
|----------|---------|-----|
| `framer-motion` | ya instalada | Animaciones, layout transitions, stagger |
| `recharts` | ya instalada | AreaChart, BarChart, RadarChart, RadialBar |
| `react-activity-calendar` | nueva | Heatmap de actividad estilo GitHub |
| `react-circular-progressbar` | nueva | Rings de compliance y KPIs |
| `@lottiefiles/react-lottie-player` | nueva | Animaciones SVG para empty states y celebraciones |
| `date-fns` | nueva (o nativa) | Cálculos de fechas precisos |
| `react-confetti` | ya existe canvas-confetti | Celebración en PRs |

---

# ═══════════════════════════════════════
# PLAN A: DIRECTORIO DE ALUMNOS
# ═══════════════════════════════════════

## Concepto: "War Room" del Coach

El directorio deja de ser una lista de tarjetas y se convierte en un **panel de control operativo**. El coach abre esta vista y el sistema ya hizo el trabajo de priorizar: quién está en riesgo, quién está brillando, quién no se ha visto en días.

---

## Archivos a modificar
- `src/app/coach/clients/page.tsx`
- `src/app/coach/clients/ClientsDirectoryClient.tsx` (refactor completo)
- `src/app/coach/clients/ClientsHeader.tsx` → reemplazar con `CoachWarRoom.tsx`
- `src/components/coach/ClientCard.tsx` → reemplazar con `ClientCardV2.tsx`
- `src/services/dashboard.service.ts` (ampliar)

---

## TASK A0: Motor de datos — "Attention Score"

### Concepto clave: el Attention Score

Cada cliente recibe un puntaje de 0-100 que el coach usa instintivamente para priorizar. El sistema lo calcula en el servidor y lo usa para el **sort por defecto** (mayor urgencia primero).

```typescript
// src/services/dashboard.service.ts — nueva función

export function calculateAttentionScore(client: ClientData): {
  score: number          // 0-100 (más alto = más urgente)
  flags: AttentionFlag[] // razones específicas
} {
  let score = 0
  const flags: AttentionFlag[] = []

  // Factor 1: Días sin check-in (máx 25pts)
  const daysSinceCheckin = differenceInDays(new Date(), lastCheckinDate)
  if (daysSinceCheckin > 7)  { score += 25; flags.push('SIN_CHECKIN_7D') }
  else if (daysSinceCheckin > 3) { score += 10; flags.push('CHECKIN_TARDIO') }

  // Factor 2: Adherencia baja (máx 25pts)
  if (adherence < 50)  { score += 25; flags.push('ADHERENCIA_CRITICA') }
  else if (adherence < 70) { score += 15; flags.push('ADHERENCIA_BAJA') }

  // Factor 3: Nutrición en riesgo (máx 20pts)
  if (nutritionCompliance < 60) { score += 20; flags.push('NUTRICION_RIESGO') }

  // Factor 4: Programa vencido o por vencer (máx 15pts)
  if (planDaysRemaining <= 0)  { score += 15; flags.push('PROGRAMA_VENCIDO') }
  else if (planDaysRemaining <= 3) { score += 8; flags.push('PROGRAMA_POR_VENCER') }

  // Factor 5: Fuerza cayendo (máx 15pts)
  if (oneRMDelta < -5) { score += 15; flags.push('FUERZA_CAYENDO') }

  return { score, flags }
}
```

**Badge visual por score:**
- 🔴 `score >= 50` → "ATENCIÓN URGENTE"
- 🟡 `score 25-49` → "REVISAR"
- 🟢 `score < 25` → "ON TRACK"
- ⭐ `score === 0 + racha > 10d` → "DESTACADO" (gamification inversa)

---

## TASK A1: Ampliar `getAdherenceStats` y `getNutritionStats`

Agregar a los stats por cliente:
```typescript
{
  lastWorkoutDate: string | null       // para semáforo de actividad
  lastCheckinDate: string | null       // para alertas de check-in
  currentWeight: number | null         // último check-in
  weightDelta7d: number | null         // diferencia con hace 7 días
  weightHistory30d: { date: string, value: number }[]  // para sparkline
  adherenceHistory4w: number[]         // adherencia semanal últimas 4 semanas
  oneRMDelta: number | null            // delta 1RM semana vs semana anterior
  planDaysRemaining: number | null
  planCurrentWeek: number | null
  planTotalWeeks: number | null
}
```

---

## TASK A2: "War Room" Header — CoachWarRoom.tsx

### Layout en 3 zonas:

```
┌─────────────────────────────────────────────────────────────────┐
│  DIRECTORIO DE ALUMNOS                          [+ NUEVO ALUMNO]│
│  Gestión centralizada · actualizado hace 2min         [⟳ sync] │
├─────────────────────────────────────────────────────────────────┤
│  [5 STAT CARDS con contadores animados]                         │
│  Total   │ Activos  │ ⚠️ Atención │ 🔴 Riesgo │ ★ Avg Adher. │
│   12     │   10     │     2       │     1      │    78%       │
├─────────────────────────────────────────────────────────────────┤
│  ALERTA: 2 clientes llevan más de 7 días sin check-in  [→ ver] │
└─────────────────────────────────────────────────────────────────┘
```

### Stat Cards animadas (framer-motion):
- `useMotionValue` + `useSpring` para contadores que "cuentan" hacia el valor real
- `staggerChildren: 0.08` para efecto dominó
- `whileHover={{ scale: 1.03, y: -3 }}` con `type: "spring"`
- Click en "⚠️ Atención" filtra automáticamente el directorio por alumnos en riesgo

### Banner de alertas inteligentes:
- Si hay clientes con `score >= 50`: muestra banner rojo con count
- Si hay programas vencidos: muestra banner naranja
- Si hay `force_password_change`: banner amarillo
- Los banners tienen botón para filtrar directamente

---

## TASK A3: ActionBar — Búsqueda + Filtros + Sort

```tsx
<ActionBar className="sticky top-0 z-10 backdrop-blur-xl">
  {/* Búsqueda con shortcut kbd */}
  <SearchInput
    placeholder="Buscar alumno... (⌘K)"
    onKeyDown={handleCmdK}
    icon={<Search />}
  />

  {/* Filtros activos como chips removibles */}
  {activeFilters.map(f => (
    <FilterChip key={f} label={f} onRemove={() => removeFilter(f)} />
  ))}

  {/* Dropdown de filtros */}
  <FilterDropdown options={[
    { group: "Estado", items: ["Activo", "Pausado", "Pendiente Sync"] },
    { group: "Riesgo", items: ["Atención Urgente", "En Riesgo", "On Track"] },
    { group: "Programa", items: ["Con Programa", "Sin Programa", "Vencido"] },
  ]} />

  {/* Sort con indicador visual del criterio activo */}
  <SortButton options={[
    { label: "Urgencia (default)", value: "attention_score" },
    { label: "Nombre A→Z", value: "name_asc" },
    { label: "Última actividad", value: "last_activity" },
    { label: "Adherencia ↓", value: "adherence_desc" },
    { label: "Peso: mayor cambio", value: "weight_delta" },
  ]} />

  {/* Toggle Grid / Table */}
  <ViewToggle value={view} onChange={setView} />
</ActionBar>
```

---

## TASK A4: ClientCardV2 — La tarjeta más informativa del mercado

### Card en modo Grid (default):

```
┌────────────────────────────────────────────────────┐
│ ┌─────────┐  CAROLINA              [🔴 ATENCIÓN]   │
│ │ ring 84%│  juanether@gmail.com    [⋮ acciones]   │
│ │  [C]    │                                        │
│ └─────────┘                                        │
├────────────────────────────────────────────────────┤
│  ADHERENCIA   PESO HOY    ENERGÍA    ÚLTIMO LOG    │
│  ████░ 84%    99kg ↑2     ★★★★☆      Hace 2d 🟢   │
├────────────────────────────────────────────────────┤
│  ▁▂▄▆▅▇▅▄  (sparkline peso 30d)                   │
│  ▃▅▇▅▃▅▇▃  (sparkline adherencia 4 semanas)       │
├────────────────────────────────────────────────────┤
│  PROGRAMA: Copia de Juan Go...  ████░░ Sem 1/4     │
│  27 días restantes · 4 semanas totales             │
├────────────────────────────────────────────────────┤
│  [💬 WA] [👁 Ver perfil]   [🏋️ Workout] [🍎 Nutri]  │
└────────────────────────────────────────────────────┘
```

### Detalles de implementación:

**Avatar con compliance ring:**
```tsx
<CircularProgressbar
  value={adherence}
  strokeWidth={6}
  styles={buildStyles({
    pathColor: adherence > 80 ? '#10B981' : adherence > 50 ? '#F59E0B' : '#EF4444',
    trailColor: 'rgba(255,255,255,0.1)',
    strokeLinecap: 'round',
  })}
/>
// Avatar centrado dentro del ring con position: absolute
```

**Attention Score badge:**
- Posicionado top-right de la card
- `score >= 50`: badge rojo pulsante con `animate-pulse`
- `score 25-49`: badge amarillo estático
- `score 0`: badge verde o badge ⭐ si tiene racha larga

**Energía en estrellitas:**
```tsx
// energy_level (1-10) mapeado a 5 estrellas
const stars = Math.round(energyLevel / 2)
// renderizar con lucide Star filled/outline
```

**Semáforo de último log:**
```tsx
const getDotColor = (days: number) =>
  days < 3 ? 'bg-emerald-500' :
  days < 7 ? 'bg-amber-500' :
             'bg-red-500 animate-pulse'
```

**Sparklines mejorados (recharts):**
```tsx
<ResponsiveContainer width="100%" height={32}>
  <AreaChart data={weightHistory30d}>
    <defs>
      <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="5%" stopColor={themeColor} stopOpacity={0.3}/>
        <stop offset="95%" stopColor={themeColor} stopOpacity={0}/>
      </linearGradient>
    </defs>
    <Area dataKey="value" fill="url(#sparkGrad)" stroke={themeColor} strokeWidth={1.5} dot={false}/>
  </AreaChart>
</ResponsiveContainer>
```

**Hover animation:**
```tsx
<motion.div
  whileHover={{ y: -6, boxShadow: "0 24px 48px rgba(0,0,0,0.25)" }}
  transition={{ type: "spring", stiffness: 350, damping: 28 }}
>
```

**Stagger del grid:**
```tsx
const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } }
}
const itemVariants = {
  hidden: { opacity: 0, y: 24, scale: 0.96 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 300, damping: 24 } }
}
```

**Menú contextual (⋮ tres puntos):**
- DropdownMenu existente de shadcn
- Items: Ver perfil, Enviar WhatsApp, Resetear contraseña, Pausar/Activar, Eliminar
- Items destructivos con ícono rojo

---

## TASK A5: TableView — Vista densa para power users

Columnas ordenables (click en header con icono ↑↓):

| Col | Tipo | Ordenable |
|-----|------|-----------|
| Avatar + Nombre + Email | compuesto | por nombre |
| Estado | badge | sí |
| Score | número + badge color | sí (default) |
| Adherencia | progress bar inline | sí |
| Peso | número + delta | sí |
| Último Log | fecha relativa + dot | sí |
| Programa | texto + barra mini | no |
| Días Rest. | número | sí |
| Acciones | botones | no |

- `@tanstack/react-virtual` para virtualizar si >20 clientes
- Filas con hover highlight glassmorphism
- Row click navega al perfil
- Responsive: en mobile colapsa a columnas esenciales

---

## TASK A6: Skeleton + Empty states

**Skeleton de card:**
- Reproduce exactamente el layout de ClientCardV2
- Shimmer animado con `animate-shimmer` (ya definido en globals.css)

**Empty state "0 alumnos":**
- Lottie animation (o SVG animado) de un entrenador con clipboard
- Headline: "Tu equipo te espera"
- Subtítulo: "Agrega tu primer alumno y empieza a transformar vidas"
- Botón CTA prominente

**Empty state búsqueda sin resultados:**
- Texto con el término buscado resaltado
- "Prueba buscando por email o nombre completo"

---

# ═══════════════════════════════════════
# PLAN B: PERFIL DEL ALUMNO
# ═══════════════════════════════════════

## Concepto: "Radiografía Completa del Atleta"

El perfil pasa de ser un dashboard de tabs a un **informe vivo**. Cada sección tiene opinión propia. El coach no tiene que interpretar los números — el sistema ya le dice "esto está bien", "esto merece atención", "este cliente está rompiendo un récord".

---

## Archivos a modificar
- `src/app/coach/clients/[clientId]/page.tsx`
- `src/app/coach/clients/[clientId]/ClientProfileDashboard.tsx` → dividir en tabs separados
- `src/app/coach/clients/[clientId]/actions.ts` (ampliar)
- Nuevos: `src/app/coach/clients/[clientId]/tabs/*.tsx` (7 tabs)

---

## TASK B0: Ampliar `getClientProfileData`

Agregar a los datos actuales:
```typescript
// Más datos de workout_logs para muscle balance y PRs
const [personalRecords, muscleVolumeByGroup, mealDetails] = await Promise.all([
  // PRs: max weight_kg para cada exercise_id (sin Epley, raw max)
  supabase
    .from('workout_logs')
    .select('weight_kg, reps_done, workout_blocks(exercise_id, exercises(name, muscle_group))')
    .eq('client_id', clientId)
    .order('weight_kg', { ascending: false }),

  // Volumen por grupo muscular últimos 30 días
  supabase.rpc('get_volume_by_muscle_group', { p_client_id: clientId, p_days: 30 }),

  // Detalle de alimentos por comida (para tab nutrición)
  supabase
    .from('nutrition_meals')
    .select('*, food_items(quantity, unit, foods(name, calories, protein_g, carbs_g, fats_g))')
    .in('plan_id', activePlanIds),
])
```

Nota: `get_volume_by_muscle_group` puede ser una RPC nueva o calcularse en JS agrupando por `exercises.muscle_group`.

---

## TASK B1: ProfileHeader — Hero de alto impacto

### Layout desktop:

```
┌──────────────────────────────────────────────────────────────────────┐
│ [← Directorio]                              Última actividad: hoy   │
│                                                                      │
│  ┌──────────┐  CAROLINA NOMBRE         [ACTIVO] [SCORE: 🟢 12]      │
│  │ gradient │  juanetherchile@gmail.com                             │
│  │   [C]    │  🔥 Racha: 8 días · 📅 Cliente desde: Mar 2024       │
│  │   ring   │  💪 Edad de entrenamiento: ~14 meses                  │
│  └──────────┘                                                        │
│                                                                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │  99 kg   │ │  84%     │ │  3/5 días│ │ Sem 1/4  │ │  0/2 hoy │  │
│  │  Peso    │ │Adherencia│ │Workouts  │ │ Programa │ │ Comidas  │  │
│  │  ↑2.1kg  │ │  ████░   │ │  esta sem│ │ progreso │ │  hoy     │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
│                                                                      │
│  [💬 WhatsApp]  [🍎 Nutrición]  [💪 Entrenamiento]  [⬇️ Exportar]   │
└──────────────────────────────────────────────────────────────────────┘
```

### Nuevo: "Training Age" (Edad de entrenamiento)
```typescript
const trainingAgeMonths = differenceInMonths(new Date(), new Date(client.subscription_start_date))
const trainingAge = trainingAgeMonths < 12
  ? `${trainingAgeMonths} meses`
  : `${Math.floor(trainingAgeMonths / 12)} año${...} y ${trainingAgeMonths % 12} meses`
```

### Nuevo: botón "Exportar PDF"
- Genera un reporte PDF del cliente para entregarle (o para documentación)
- Usa `window.print()` con un print-optimized layout, o `jspdf` + `html2canvas`
- Incluye: datos básicos, progreso de peso, adherencia, programa activo

---

## TASK B2: Tab Navigation — Sticky con badges

```tsx
const TABS = [
  { id: 'overview',    label: 'Overview',       icon: LayoutDashboard, badge: null },
  { id: 'training',   label: 'Entrenamiento',   icon: Dumbbell,        badge: workoutCount },
  { id: 'nutrition',  label: 'Nutrición',        icon: Apple,           badge: nutritionRisk ? '!' : null },
  { id: 'body',       label: 'Composición',      icon: Scale,           badge: checkInCount },
  { id: 'checkins',   label: 'Check-ins',        icon: CalendarCheck,   badge: checkInCount },
  { id: 'program',    label: 'Programa',         icon: ListChecks,      badge: null },
  { id: 'payments',   label: 'Pagos',            icon: CreditCard,      badge: pendingCount },
]
```

- Tab bar sticky (top: header height) con `position: sticky`
- Indicador de tab activo: línea inferior con `layoutId="tab-indicator"` (framer-motion)
- Transición de contenido: `AnimatePresence mode="wait"` con slide horizontal

---

## TASK B3: Tab OVERVIEW — Centro de comando del atleta

### Panel 1: Alerta Prioritaria (NUEVO — diferenciador clave)

Una card de fondo gradient que muestra **la alerta más urgente del cliente**, calculada con reglas deterministas (prioridad descendente). Es lo primero que el coach ve al entrar al perfil.

```typescript
// Lógica de reglas puras — sin AI
function getTopAlert(data: ClientData): Alert | null {
  if (daysSinceCheckin > 7)            return { type: 'warning',  msg: 'Hace +7 días sin check-in — considera enviarle un mensaje' }
  if (adherence < 50)                  return { type: 'danger',   msg: `Adherencia crítica esta semana: ${adherence}%` }
  if (nutritionCompliance < 60)        return { type: 'warning',  msg: `Solo completó el ${nutritionCompliance}% de sus comidas` }
  if (planDaysRemaining <= 0)          return { type: 'danger',   msg: 'El programa está vencido — necesita uno nuevo' }
  if (planDaysRemaining <= 3)          return { type: 'info',     msg: `El programa vence en ${planDaysRemaining} días` }
  if (oneRMDelta < -5)                 return { type: 'warning',  msg: 'Fuerza cayendo esta semana — revisar carga' }
  if (streak >= 10 && adherence > 80)  return { type: 'success',  msg: `🔥 ${streak} días en racha con ${adherence}% adherencia` }
  return null
}
```

La card varía de color según el tipo: rojo (danger), amarillo (warning), azul (info), verde (success). Si no hay alertas: se oculta completamente (no se muestra nada vacío).

### Panel 2: Compliance Rings (3 en fila)

Tres `CircularProgressbar` grandes en fila:
- **Entrenamientos:** X/Y días · % completado · color theme-primary
- **Nutrición:** X% promedio semanal · color emerald o red según valor
- **Check-in:** puntaje de regularidad (días desde último / 7 días) · semáforo

Debajo de cada ring: número grande + sub-label + delta vs semana anterior con flecha.

### Panel 3: Activity Heatmap — "Historial de Actividad"

```tsx
import ActivityCalendar from 'react-activity-calendar'

// Transformar workout_sessions + check_ins en ActivityData
const activityData = buildActivityData({
  workoutSessions: workoutHistory,
  checkIns: checkIns,
  // Nivel 0-4 según actividad ese día
})

<ActivityCalendar
  data={activityData}
  colorScheme="light"  // o dark según tema
  theme={{
    dark: ['#1E1E1E', themeColor]  // escala de grises a themeColor
  }}
  labels={{ legend: { less: 'Menos', more: 'Más' } }}
  renderBlock={(block, activity) => (
    <Tooltip content={`${activity.date}: ${activity.count} actividades`}>
      {block}
    </Tooltip>
  )}
/>
```

### Panel 4: KPI Grid (2x3)

```
┌─────────────┬─────────────┬─────────────┐
│ 🔥 Racha    │ ⭐ Mejor    │ 💪 Sesiones │
│   8 días    │  12 días    │  47 total   │
│   actual    │  histórico  │  último mes │
├─────────────┼─────────────┼─────────────┤
│ 📊 Adher.   │ ⚖️ Δ Peso  │ 🎯 Sem Prog │
│   84% avg   │  -2.1 kg    │    1/4      │
│   + 5% sem  │  último mes │  programa   │
└─────────────┴─────────────┴─────────────┘
```

Cada KPI: glassmorphism card con micro-animación de entrada (stagger), hover subtle glow.

### Panel 5: Resumen del Programa

```tsx
<ProgramSummaryCard>
  <ProgramName /> 
  <PhasesBar /> {/* SharedProgramPhasesBar ya existe */}
  <WeekProgress currentWeek={1} totalWeeks={4} />
  <DaysRemaining days={27} /> {/* con micro countdown style */}
  <NextWorkout day="Lunes" title="Pecho + Tríceps" exercises={5} />
</ProgramSummaryCard>
```

"Próximo entrenamiento" es nuevo: busca el siguiente día con workout_plan según `day_of_week` y muestra el título + cantidad de ejercicios.

### Panel 6: Snapshot del último Check-in

```tsx
<CheckInSnapshot>
  <CheckInDate>{relative}</CheckInDate>
  <PhotoThumbnail src={frontPhotoUrl} /> {/* clickable, abre modal */}
  <MetricRow icon={Scale}   label="Peso"   value={`${weight} kg`} />
  <MetricRow icon={Battery} label="Energía" value={<EnergyStars level={energy} />} />
  <MetricRow icon={StickyNote} label="Notas" value={notes} />
  <LinkButton href="#checkins">Ver historial completo →</LinkButton>
</CheckInSnapshot>
```

---

## TASK B4: Tab ENTRENAMIENTO — Laboratorio de rendimiento

### Panel 1: Banner de PRs esta semana

Si el cliente tiene un Personal Record nuevo esta semana:
```tsx
<PRBanner>
  🏆 ¡Nuevo Récord Personal! — Carolina levantó 80kg en Sentadilla
  (antes: 75kg · +6.7%)
</PRBanner>
```
Con confetti si hay PR (canvas-confetti al montar el componente).

### Panel 2: Fuerza — Cards por ejercicio principal

Para cada ejercicio clave (bench, squat, deadlift y los top 3 del cliente por volumen):

```tsx
<StrengthCard exercise="Press de Banca">
  {/* 1RM estimado actual */}
  <BigNumber>92.5 kg <span>1RM est.</span></BigNumber>
  <Delta>↑ 3.5 kg esta semana</Delta>

  {/* AreaChart evolución temporal */}
  <AreaChart data={oneRMHistory}>
    {/* gradiente themeColor */}
    {/* punto marcado en PR absoluto */}
  </AreaChart>

  {/* Stats compactos */}
  <StatRow label="Máx Registrado" value="92.5 kg" />
  <StatRow label="Última sesión"  value="4 series × 8 reps @ 80kg" />
  <StatRow label="RPE promedio"   value="7.5" />
</StrengthCard>
```

Usar `recharts` AreaChart con `ReferencePoint` en el PR máximo (punto marcado con ícono estrella).

### Panel 3: Volumen Total — Tonnage por sesión

```tsx
<VolumeChart>
  <BarChart data={sessions}>
    {/* barra = tonelaje */}
    {/* línea de tendencia = promedio móvil 7 sesiones */}
    {/* CustomTooltip: fecha + tonelaje + ejercicios + density */}
  </BarChart>

  <SummaryRow>
    <Stat label="Tonelaje promedio" value="4,200 kg/sesión" />
    <Stat label="Densidad"          value="70 kg/min est." />
    <Stat label="Volumen total mes" value="33,600 kg" />
  </SummaryRow>
</VolumeChart>
```

### Panel 4: Muscle Balance Radar

```tsx
<RadarChart data={muscleVolume}>
  {/* 8 ejes: Pecho, Espalda, Piernas, Hombros, Bíceps, Tríceps, Core, Glúteos */}
  {/* Area fill: themeColor 0.3 opacity */}
  {/* Detectar desequilibrios: si ratio entre ejes es > 2:1 → highlight el eje deficiente */}
</RadarChart>

{/* Análisis automático */}
{imbalances.length > 0 && (
  <ImbalanceAlert>
    ⚠️ Posible desequilibrio: Pecho recibe 3x más volumen que Espalda
  </ImbalanceAlert>
)}
```

### Panel 5: Historial de sesiones — Lista expandible

```tsx
<SessionsList>
  {sessions.map(session => (
    <SessionRow key={session.id}>
      <SessionHeader>
        <Date>{formatRelative(session.date)}</Date>
        <PlanName>{session.planTitle}</PlanName>
        <Stats>
          <Chip>{session.totalSets} series</Chip>
          <Chip>{formatWeight(session.tonnage)}</Chip>
          <Chip>RPE {session.avgRPE}</Chip>
        </Stats>
        <Chevron onClick={toggle} />
      </SessionHeader>

      <AnimatePresence>
        {expanded && (
          <motion.div ...>
            <ExerciseTable>
              {/* ejercicio | series | kg | reps | RPE | notas */}
            </ExerciseTable>
          </motion.div>
        )}
      </AnimatePresence>
    </SessionRow>
  ))}
</SessionsList>
```

---

## TASK B5: Tab NUTRICIÓN — Análisis profundo

### Panel 1: Plan Activo — Ficha completa

```tsx
<ActivePlanCard>
  <PlanHeader name={plan.name} isActive />

  {/* Targets de macros con gauges circulares pequeños */}
  <MacroGrid>
    <MacroGauge label="Calorías" target={2200} unit="kcal" color="#007AFF" />
    <MacroGauge label="Proteínas" target={180} unit="g"   color="#10B981" />
    <MacroGauge label="Carbos"   target={220} unit="g"   color="#F59E0B" />
    <MacroGauge label="Grasas"   target={70}  unit="g"   color="#EF4444" />
  </MacroGrid>

  {/* Distribución de macros en PieChart */}
  <MacroPieChart protein={180} carbs={220} fats={70} />

  {/* Instrucciones del plan si existen */}
  {plan.instructions && <PlanInstructions />}
</ActivePlanCard>
```

### Panel 2: Adherencia — Heatmap 30 días

Grid de 30 días (6 filas × 5 columnas o 5 filas × 6 columnas):
```tsx
<NutritionHeatmap>
  {last30Days.map(day => (
    <HeatmapCell
      key={day.date}
      color={getComplianceColor(day.mealCompliancePercent)}
      // rojo < 60%, amarillo 60-80%, verde > 80%, gris = sin datos
      tooltip={`${day.date}: ${day.mealsCompleted}/${day.totalMeals} comidas`}
      // framer-motion whileHover scale + tooltip
    />
  ))}
  <Legend items={['Sin datos', '<60%', '60-80%', '>80%']} />
</NutritionHeatmap>
```

### Panel 3: Tendencia calórica — Objetivo vs Consumido

```tsx
<CalorieTrendChart>
  <ComposedChart data={nutritionLogs}>
    <Bar dataKey="targetCals" fill="rgba(var(--theme-primary-rgb), 0.2)" />
    <Line dataKey="consumedCals" stroke={themeColor} strokeWidth={2} dot={{ r: 3 }} />

    {/* Banda de zona óptima: ±200 kcal */}
    <ReferenceArea
      y1={targetCals - 200} y2={targetCals + 200}
      fill="rgba(16, 185, 129, 0.1)"
      label="Zona óptima"
    />

    <CustomTooltip>
      {/* fecha, cals objetivo, cals consumidas, diferencia, % adherencia */}
    </CustomTooltip>
  </ComposedChart>
</CalorieTrendChart>
```

### Panel 4: Desglose de comidas del plan

Acordeón por comida, expandible, con detalle de alimentos:
```tsx
<MealAccordion>
  {meals.map(meal => (
    <MealItem key={meal.id}>
      <MealHeader>
        <MealName>{meal.name}</MealName>
        <MealMacros protein={total.prot} carbs={total.carbs} fats={total.fats} />
        <CompletionBadge completed={wasCompleted(meal.id)} />
      </MealHeader>

      <AnimatePresence>
        {expanded && (
          <FoodTable>
            {meal.food_items.map(item => (
              <FoodRow food={item.food} quantity={item.quantity} unit={item.unit} />
            ))}
          </FoodTable>
        )}
      </AnimatePresence>
    </MealItem>
  ))}
</MealAccordion>
```

### Panel 5: Historial de logs — Tabla con highlight

```tsx
<NutritionLogTable>
  {nutritionLogs.slice(0, 30).map(log => (
    <LogRow
      className={log.adherencePercent < 60 ? 'border-l-2 border-red-500' : ''}
    >
      <Date>{log.logDate}</Date>
      <PlanName>{log.planNameAtLog}</PlanName>
      <Calories target={log.targetCals} consumed={log.consumedCals} />
      <AdherenceBar percent={log.adherencePercent} />
      <MealsCompleted>{log.mealsCompleted}/{log.totalMeals}</MealsCompleted>
    </LogRow>
  ))}
</NutritionLogTable>
```

---

## TASK B6: Tab COMPOSICIÓN CORPORAL

### Panel 1: Weight AreaChart mejorado

```tsx
<WeightAreaChart>
  <AreaChart data={checkIns}>
    {/* gradiente fill */}
    <Area dataKey="weight" stroke={themeColor} fill="url(#weightGrad)" dot={{ r: 4 }} />
    {/* puntos marcados en cada check-in = clickables */}

    <CustomTooltip>
      peso, fecha, energy_level (estrellitas), notas, miniatura de foto
    </CustomTooltip>
  </AreaChart>

  <StatsSummary>
    <Stat label="Peso inicial"    value={firstWeight} />
    <Stat label="Peso actual"     value={lastWeight} />
    <Stat label="Cambio total"    value={totalDelta} trend />
    <Stat label="Ritmo mensual"   value={monthlyRate} />
    <Stat label="Proyección 4sem" value={projected4w} subLabel="si continúa la tendencia" />
  </StatsSummary>
</WeightAreaChart>
```

**Proyección a 4 semanas** (diferenciador):
```typescript
// Regresión lineal simple sobre los últimos 30 días de check-ins
const slope = linearRegression(checkIns.map((c, i) => [i, c.weight]))
const projected = lastWeight + (slope * 28) // 28 días
```

### Panel 2: BMI + Energía gauge

```tsx
<HealthMetrics>
  {/* BMI si hay altura en client_intake */}
  <BMICard>
    <BMIValue>{bmi.toFixed(1)}</BMIValue>
    <BMIScale current={bmi} /> {/* barra horizontal con zona destacada */}
    <BMICategory>{bmiCategory}</BMICategory>
  </BMICard>

  {/* Energía promedio como gauge semicircular */}
  <EnergyGauge>
    <RadialBarChart data={[{ value: avgEnergy * 10 }]}>
      {/* gauge de 0-100% con colores de verde a rojo */}
    </RadialBarChart>
    <BigNumber>{avgEnergy.toFixed(1)}<span>/10</span></BigNumber>
    <Label>Energía promedio (7 días)</Label>
  </EnergyGauge>
</HealthMetrics>
```

### Panel 3: Photo Comparison Slider mejorado

```tsx
<PhotoComparison>
  {/* Selectores de fecha para elegir qué check-ins comparar */}
  <DateSelector
    label="Check-in base"
    options={checkInsWithPhotos}
    value={baseCheckIn}
    onChange={setBaseCheckIn}
  />
  <DateSelector
    label="Check-in comparar"
    options={checkInsWithPhotos}
    value={compareCheckIn}
    onChange={setCompareCheckIn}
  />

  {/* PhotoComparisonSlider ya existe — mantener */}
  <PhotoComparisonSlider before={basePhoto} after={comparePhoto} />

  {/* Delta de métricas entre los dos check-ins seleccionados */}
  <ComparisonDeltas base={baseCheckIn} compare={compareCheckIn} />
</PhotoComparison>
```

### Panel 4: Timeline de check-ins

Lista vertical cronológica con todas las entradas:
```tsx
<CheckInTimeline>
  {checkIns.map((ci, i) => (
    <TimelineEntry key={ci.id} isFirst={i === 0} isLast={i === checkIns.length - 1}>
      <TimelineDot color={getEnergyColor(ci.energy_level)} />
      <TimelineContent>
        <DateBadge>{formatDate(ci.date)}</DateBadge>
        <MetricsRow>
          <Weight>{ci.weight} kg</Weight>
          <Energy stars={ci.energy_level} />
        </MetricsRow>
        {ci.front_photo_url && (
          <PhotoThumb src={ci.front_photo_url} onClick={() => openLightbox(ci)} />
        )}
        {ci.notes && <Notes>{ci.notes}</Notes>}
      </TimelineContent>
    </TimelineEntry>
  ))}
</CheckInTimeline>
```

---

## TASK B7: Tab PROGRAMA — Vista estructural

### Panel 1: Header del programa

```tsx
<ProgramHeader>
  <ProgramName>{program.name}</ProgramName>
  <StructureBadge>{isWeekly ? 'Semanal' : 'Cíclico'}</StructureBadge>
  <WeeksBadge>{program.weeks_to_repeat} semanas</WeeksBadge>
  <PhasesBar phases={program.program_phases} /> {/* SharedProgramPhasesBar */}
  <ProgressIndicator currentWeek={currentWeek} totalWeeks={totalWeeks} />
  <EditButton href={`/coach/builder/${clientId}`} />
</ProgramHeader>
```

### Panel 2: Vista semanal del programa

Grid de días (Mon-Sun) con cards de entrenamiento:
```tsx
<WeeklyGrid>
  {DAYS_OF_WEEK.map(day => {
    const plan = plans.find(p => p.day_of_week === day)
    return (
      <DayCard key={day} active={plan !== null} isToday={isToday(day)}>
        <DayLabel>{day}</DayLabel>
        {plan ? (
          <>
            <PlanTitle>{plan.title}</PlanTitle>
            <ExerciseCount>{plan.workout_blocks.length} ejercicios</ExerciseCount>
            <MuscleGroups groups={getUniqueGroups(plan.workout_blocks)} />

            {/* Lista de ejercicios expandible */}
            <ExerciseList blocks={plan.workout_blocks} />
          </>
        ) : (
          <RestDay>Descanso</RestDay>
        )}
      </DayCard>
    )
  })}
</WeeklyGrid>
```

### Panel 3: Detalle de ejercicio (modal/drawer)

Click en ejercicio abre Sheet desde abajo (mobile) o drawer lateral (desktop):
```tsx
<ExerciseDetailSheet>
  <ExerciseName>{exercise.name}</ExerciseName>
  <MuscleGroup>{exercise.muscle_group}</MuscleGroup>
  {exercise.gif_url && <ExerciseGif src={exercise.gif_url} />}
  <Prescription sets={block.sets} reps={block.reps} tempo={block.tempo} rir={block.rir} />
  {block.notes && <CoachNote>{block.notes}</CoachNote>}

  {/* Historial del cliente en este ejercicio */}
  <ExerciseHistory logs={logsForExercise} />
</ExerciseDetailSheet>
```

---

## TASK B8: Tab PAGOS — Timeline financiero

```tsx
<PaymentsTimeline>
  <PaymentsSummary>
    <Stat label="Total cobrado" value={formatCurrency(totalAmount)} />
    <Stat label="Último pago" value={formatRelative(lastPayment.date)} />
    <Stat label="Próx. vencimiento" value={nextRenewal} />
    <AddPaymentButton />
  </PaymentsSummary>

  <Timeline>
    {payments.map(payment => (
      <PaymentEntry key={payment.id}>
        <TimelineDot color={payment.status === 'paid' ? 'green' : 'orange'} />
        <PaymentCard>
          <Amount>{formatCurrency(payment.amount)}</Amount>
          <Description>{payment.service_description}</Description>
          <DateBadge>{formatDate(payment.payment_date)}</DateBadge>
          <PeriodBadge>{payment.period_months} mes(es)</PeriodBadge>
          <StatusBadge status={payment.status} />
          {payment.receipt_image_url && <ReceiptThumb src={payment.receipt_image_url} />}
          <DeleteButton />
        </PaymentCard>
      </PaymentEntry>
    ))}
  </Timeline>
</PaymentsTimeline>
```

---

## TASK B9: UX Transversal del Perfil

### Transiciones entre tabs
```tsx
<AnimatePresence mode="wait">
  <motion.div
    key={activeTab}
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -8 }}
    transition={{ duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
  >
    {content}
  </motion.div>
</AnimatePresence>
```

### Sticky tab bar con indicador animado
```tsx
// framer-motion layoutId para la línea de indicador
<motion.div
  layoutId="active-tab-indicator"
  className="absolute bottom-0 h-0.5 bg-[--theme-primary]"
  transition={{ type: "spring", stiffness: 500, damping: 35 }}
/>
```

### Skeleton loading por tab
Cada tab exporta su propio `<TabNameSkeleton />` que reproduce el layout de la tab con shimmer.

### Floating action (mobile)
```tsx
<FloatingActionMenu> {/* solo en mobile, position: fixed bottom-20 right-4 */}
  <FABItem icon={MessageCircle} label="WhatsApp" onClick={openWhatsApp} />
  <FABItem icon={Camera}        label="Check-in" href={checkinUrl} />
  <FABItem icon={Dumbbell}      label="Workout"  href={builderUrl} />
</FloatingActionMenu>
```

---

# ═══════════════════════════════════════
# PLAN DE EJECUCIÓN
# ═══════════════════════════════════════

## Fase 1: Setup y datos (sin UI aún)
1. `npm install react-activity-calendar react-circular-progressbar date-fns`
2. `src/services/dashboard.service.ts` → `calculateAttentionScore` + campos extra
3. `src/app/coach/clients/page.tsx` → traer adherence + nutrition stats del servidor
4. `src/app/coach/clients/[clientId]/actions.ts` → añadir PRs, muscle volume, meal details
5. Verificar con `npx tsc --noEmit`

## Fase 2: Directorio — Header + Stats
1. `CoachWarRoom.tsx` (reemplaza `ClientsHeader.tsx`) con `StatsStrip` animado
2. Banners de alerta inteligentes
3. `ActionBar` con search, filtros, sort, view toggle
4. Verificar que los números vienen del servidor y no están hardcoded

## Fase 3: Directorio — Cards
1. `ClientCardV2.tsx` con ring de compliance + attention score badge
2. Sparklines de peso y adherencia
3. Semáforo de último log
4. Quick actions siempre visibles
5. Stagger animation del grid
6. TableView con columnas ordenables

## Fase 4: Perfil — Header + Overview
1. `ClientProfileHeader` hero redesign con Training Age + stat chips
2. `OverviewTab.tsx` con InsightBanner + Compliance Rings + Heatmap + KPIs
3. `ProgramSummaryCard` con next workout
4. `CheckInSnapshot` con thumbnail

## Fase 5: Perfil — Training + Nutrition
1. `TrainingTab.tsx` con PRs banner + StrengthCards por ejercicio + RadarChart
2. `NutritionTab.tsx` con macro gauges + heatmap 30d + calorie trend + meal accordion

## Fase 6: Perfil — Body + Program + Payments + UX
1. `BodyCompositionTab.tsx` con weight projection + BMI gauge + timeline
2. `ProgramTab.tsx` con weekly grid + exercise detail drawer
3. `PaymentsTab.tsx` con timeline financiero
4. Sticky tabs con framer layoutId
5. AnimatePresence entre tabs
6. FloatingActionMenu mobile
7. Skeletons por tab

---

# VERIFICACIÓN END-TO-END

## Directorio
- [ ] Attention Score ordena correctamente (más urgentes primero por default)
- [ ] Banners de alerta aparecen solo cuando hay alumnos en esa condición
- [ ] Ring de compliance en avatar usa datos reales (no hardcoded 84%)
- [ ] Semáforo rojo aparece si no hay actividad en >7 días
- [ ] Sparklines dibujan datos reales del cliente
- [ ] Filtros + sort funcionan en combo sin recarga de página
- [ ] Vista tabla es usable en pantallas de 1024px

## Perfil
- [ ] InsightBanner muestra el insight correcto según datos del cliente
- [ ] Heatmap de actividad cubre los últimos 12 meses reales
- [ ] PRs banner dispara confetti solo cuando hay PR esta semana
- [ ] RadarChart usa datos de volumen reales (no dummy data)
- [ ] Proyección de peso calcula con regresión lineal correcta
- [ ] PhotoComparison permite seleccionar cualquier par de check-ins
- [ ] ExerciseDetailSheet muestra historial real del ejercicio seleccionado
- [ ] Tab indicator sigue al tab activo con spring animation
- [ ] Todo el perfil es usable en 375px de ancho (mobile)
- [ ] `useReducedMotion()` desactiva todas las animaciones cuando el SO lo pide

---

# NOTAS DE DISEÑO

- **El sistema ya tiene colores personalizables por coach** (`--theme-primary`): respetar en todos los charts y elementos de énfasis
- **Dark mode es el modo primario**: verificar que todos los nuevos colores tienen su variante dark
- **Glassmorphism**: usar el `GlassCard` existente como base de todas las nuevas cards
- **Datos vacíos**: si no hay check-ins, mostrar CTA para pedirle al alumno que haga el primero
- **Cero SQL nuevo obligatorio**: toda la data existe — solo es cuestión de traerla correctamente
- **Sin mocks**: si un dato no está disponible, el componente lo indica con "Sin datos" — nunca datos fake en producción
