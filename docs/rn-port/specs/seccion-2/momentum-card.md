# Spec §7 Momentum (tira semanal + anillos de cumplimiento) — key: `momentum-card`

Seccion 2 (dashboard alumno). Web = fuente de verdad. Cada afirmacion cita `archivo:linea`.

## 0. Fuentes de verdad y nota de archivos inexistentes

- Web activo (fusion Ola 4): `apps/web/src/app/c/[coach_slug]/dashboard/_components/momentum/MomentumCard.tsx` (server component) + `momentum/MomentumWeekStrip.tsx` (client).
- Anillo: `compliance/ComplianceRing.tsx` (`ComplianceRing` linea 28; `ComplianceRingCluster` linea 77 — cluster NO lo usa MomentumCard, es el legacy standalone).
- Primitivo: `apps/web/src/components/ui/progress-ring.tsx` (`ProgressRing` linea 34).
- Datos scores: `apps/web/src/app/c/[coach_slug]/dashboard/_data/heroComplianceBundle.ts` (`getHeroComplianceBundle` linea 68, `getDashboardNutritionDomainEnabled` linea 276).
- `calendar/WeekCalendar.tsx` + `calendar/CalendarDay.tsx`: predecesores de la tira (misma logica de derivacion de dias, `WeekCalendar.tsx:36-77`). MomentumCard reimplementa esa derivacion inline (`MomentumCard.tsx:50-80`), pero renderiza con `MomentumWeekStrip`, NO con `CalendarDaysRow`. Se documentan porque la nota de alcance los cita, pero **el componente vivo de esta unidad es la tira, no el calendario**.
- **`ComplianceScoresCard.tsx` y `HeroAndComplianceGroup.tsx` NO existen** en el repo (glob vacio). Fueron absorbidos por la fusion Momentum descrita en `MomentumCard.tsx:20-29`. No hay nada que portar de ellos.
- RN contraparte: `apps/mobile/components/alumno/home/MomentumCard.tsx` (existe, ver §Estado RN actual).

## 1. Layout y jerarquia (web `MomentumCard.tsx:82-102`)

```
<section>                                         (82)
  <SectionTitle accent="var(--sport-500)">Momentum  (84)  ← importado de ../shared/SectionTitle, READ-ONLY para esta unidad
  <Card padding="md">                             (85)
    <MomentumWeekStrip days={days} />             (86)  ← tira semanal 7 celdas
    <div className="my-4 h-px bg-[var(--border-subtle)]" />  (87)  ← divisor horizontal
    <div grid cols-3|cols-2>                      (88)  ← fila de anillos
      <ComplianceRing Entrenos sport>             (89)
      {nutritionEnabled && <ComplianceRing Nutricion ember empty=!nutritionHasLogs>}  (90-97)
      <ComplianceRing Check-ins success>          (98)
```

- Wrapper `<section>` (sin clases), titulo de seccion arriba, luego la Card contenedora.
- Orden vertical dentro de Card: tira → divisor → anillos. `MomentumCard.tsx:86-99`.
- Grilla de anillos: `grid items-start gap-2` + `grid-cols-3` cuando `nutritionEnabled`, si no `grid-cols-2` (`MomentumCard.tsx:88`). Nunca deja hueco: al ocultar Nutricion la grilla pasa a 2 columnas (Entrenos + Check-ins).

### Tira semanal (web `MomentumWeekStrip.tsx:13-49`)

- Contenedor `flex gap-1.5` (`:15`) → 7 celdas.
- Cada celda: `flex h-[54px] flex-1 flex-col items-center justify-center gap-1.5 rounded-control` (`:22`). Altura fija 54px, ancho equitativo (`flex-1`), contenido centrado, gap 6px vertical entre letra y marcador.
- 3 estados de fondo (`:23-27`), prioridad isToday > isCompleted > default:
  - `isToday` → `bg-[var(--cta-fill)]` (relleno marca).
  - `isCompleted` (y no hoy) → `border border-subtle bg-surface-card`.
  - resto → `border border-subtle bg-surface-sunken`.
- Letra del dia: `font-display text-xs font-extrabold`, color `text-on-sport` si hoy, si no `text-subtle` (`:30-33`). Texto = `d.label` (L M X J V S D).
- Marcador (contenedor `flex h-4 w-4 items-center justify-center`, `:35`), prioridad (`:36-42`):
  - `isCompleted` → `<Check>` lucide `h-3.5 w-3.5 text-[var(--success-500)]` (**siempre color success, incluso si es hoy**; `:37`).
  - else `isToday` → punto `h-1.5 w-1.5 rounded-full bg-white` (`:39`).
  - else `planned` → punto `h-1.5 w-1.5 rounded-full bg-sport-500/50` (`:41`).
  - else → nada.
- `planned = d.hasWorkout && !d.isCompleted && !d.isToday` (`:17`).

## 2. Tokens, clases, tipografia (verbatim web)

| Elemento | Clase/token web | Ref |
|---|---|---|
| Acento SectionTitle | `var(--sport-500)` | MomentumCard.tsx:84 |
| Card | `padding="md"` | MomentumCard.tsx:85 |
| Divisor | `my-4 h-px bg-[var(--border-subtle)]` | MomentumCard.tsx:87 |
| Grilla anillos | `grid items-start gap-2 grid-cols-3\|grid-cols-2` | MomentumCard.tsx:88 |
| Celda tira radio | `rounded-control` | MomentumWeekStrip.tsx:22 |
| Celda hoy | `bg-[var(--cta-fill)]` | MomentumWeekStrip.tsx:24 |
| Celda hecho | `border border-subtle bg-surface-card` | MomentumWeekStrip.tsx:26 |
| Celda base | `border border-subtle bg-surface-sunken` | MomentumWeekStrip.tsx:27 |
| Letra dia | `font-display text-xs font-extrabold` + `text-on-sport`\|`text-subtle` | MomentumWeekStrip.tsx:31 |
| Check hecho | `text-[var(--success-500)]` (h-3.5 w-3.5) | MomentumWeekStrip.tsx:37 |
| Punto hoy | `bg-white` (h-1.5 w-1.5) | MomentumWeekStrip.tsx:39 |
| Punto planificado | `bg-sport-500/50` (h-1.5 w-1.5) | MomentumWeekStrip.tsx:41 |

### Anillo (web `ComplianceRing.tsx:28-75`)

- Colores de trazo por `color` (`:20-24`): `sport`→`var(--sport-500)`, `ember`→`var(--ember-500)`, `success`→`var(--success-500)`. Empty→`var(--ink-300)` (`emptyStroke`, `:26`).
- Wrapper `flex flex-col items-center gap-2` (`:52`).
- `<ProgressRing value size=76 stroke=7 color={pathColor} label={...}>` (`:53-67`).
- Centro NO vacio: `font-display text-[19px] font-black tabular-nums tracking-[-0.03em] text-strong` con `<span text-[11px]>%</span>` (`:62-66`).
- Centro vacio: `font-display text-lg font-black text-subtle` mostrando `—` (`:59-61`).
- Label: `text-xs font-bold text-strong` (`:70`). Si empty, sublinea `text-[10px] text-subtle` = "Sin datos" (`:71`).

### ProgressRing primitivo (web `progress-ring.tsx:34-107`)

- Defaults: `size=72 stroke=8 color=var(--sport-500) track=var(--track) showValue=true` (`:34-45`). MomentumCard override: size 76, stroke 7.
- SVG 2 circulos: track (`:68-75`) + arco (`:76-89`), `strokeLinecap="round"`, `strokeDasharray={c}` con `c = 2*PI*r`, `r = (size-stroke)/2`, `offset = c*(1 - clamped/100)` (`:46-49,84-85`).
- `transform: rotate(-90deg)` sobre el svg (`:66`).
- Valor clamp 0..100 (`:46`).

## 3. Claro / oscuro

- Todo via tokens DS, hereda dark automatico: `bg-surface-card`, `bg-surface-sunken`, `border-subtle`, `var(--border-subtle)`, `var(--cta-fill)`, `text-strong`, `text-subtle`, `var(--sport-500|ember-500|success-500|ink-300|track)`. No hay valores crudos claro/oscuro en el JSX web salvo `bg-white` del punto de hoy (`MomentumWeekStrip.tsx:39`, blanco fijo sobre relleno marca — a proposito) y el `#fff` implicito del check-en-hoy (ver §Estado RN, divergencia de color).
- El track del anillo (`var(--track)`) flipea por tema en el primitivo web; en RN `ProgressRing.tsx:12-13,63` resuelve `TRACK_LIGHT #E6E9ED` / `TRACK_DARK rgba(255,255,255,0.10)` por luminancia del `theme.background` (paridad de intencion).

## 4. Elementos interactivos y handlers

- **NINGUNO.** Toda la unidad es presentacional puro. La tira (`MomentumWeekStrip`) no tiene `onClick`/`Pressable`; las celdas son `<div>` estaticos. Los anillos no navegan ni abren nada. No hay toasts, no hay navegacion, no hay botones. `SectionTitle` aqui se usa sin `action`/`onAction` (`MomentumCard.tsx:84` pasa solo `accent` + children).
- No hay tooltip en la version fusionada. (El `InfoTooltip` con `t('section.compliance')` vive solo en el legacy `ComplianceRingCluster`, `ComplianceRing.tsx:99-101`, que **no** se usa en MomentumCard.)

## 5. Estados (vacio / carga / error / exito)

- **Carga:** MomentumCard es server component `async` (`MomentumCard.tsx:30`); resuelve datos con `Promise.all` (`:31-37`) antes de render. No hay skeleton propio — el loading lo da el suspense/streaming del layout padre (fuera de esta unidad).
- **Vacio anillo nutricion:** `empty={!scores.nutritionHasLogs}` (`MomentumCard.tsx:95`). Cuando no hay logs en 30d → anillo gris `var(--ink-300)`, centro `—`, sublinea "Sin datos" (`ComplianceRing.tsx:47-49,59-61,71`).
- **Nutricion OFF (master switch):** `nutritionEnabled=false` oculta el anillo de Nutricion completo y grilla a 2 col (`MomentumCard.tsx:88-97`). Gate = `getDashboardNutritionDomainEnabled` (`heroComplianceBundle.ts:276-290`, espejo del gate de `/c/[slug]/nutrition`; fail-open cuando `FEATURE_PREFS_ENABLED` OFF).
- **Check-ins:** el anillo de Check-ins **NUNCA** recibe `empty` en web (`MomentumCard.tsx:98` no pasa la prop). Con 0 check-ins muestra `0%` a color success, no gris/"Sin datos".
- **Entrenos:** idem, sin `empty`; `0%` a color sport si no hay adherencia.
- **Error:** sin manejo local; si el `Promise.all` rechaza, lo captura el error boundary del segmento (fuera de la unidad).

## 6. Validaciones

- Valores de anillo clamp 0..100 en el primitivo (`progress-ring.tsx:46`). Los scores ya vienen 0..100 enteros desde `heroComplianceBundle.ts` (`checkInScore` `Math.min(100, Math.round(...))` `:171`; `nutritionEngagementScore` `:175-177`; `workoutScore` de `computeWorkoutScore30d` `:163`).
- Count-up redondea a entero: `setAnimated(Math.round(v))` (`ComplianceRing.tsx:44`).

## 7. Queries / datos (tablas, filtros, limites)

### Tira semanal (`MomentumCard.tsx:31-80`)
- `getActiveProgram(userId)`, `getClientWorkoutPlans(userId)`, `getRecentWorkoutLogs(userId)` (`:31-34`).
- `activePlans = allPlans.filter(!p.program_id || p.program_id === program?.id)` (`:39`).
- Semana Lun..Dom: `firstDay = curr.getDate() - curr.getDay() + (curr.getDay()===0 ? -6 : 1)` (`:51`); 7 dias (`:52-80`).
- Por dia: `assignedPlan` por `assigned_date === dStr` (`:57`); `programPlan` por `program_id`+`day_of_week`+`workoutPlanMatchesVariant(p, activeVariant, abMode)` (`:58-65`). `dayPlan = assignedPlan ?? programPlan ?? null` (`:66`).
- `isFutureDay = dStr > today` (`:67`).
- `isCompleted = !!dayPlan && !isFutureDay && logs.some(l => l.workout_blocks?.plan_id === dayPlan.id && getSantiagoIsoYmdForUtcInstant(l.logged_at) === dStr)` (`:68-73`). **La completitud exige match del plan.id especifico del dia, no cualquier log.**
- `hasWorkout = !!dayPlan` (`:77`). Fechas en zona **Santiago** (`getTodayInSantiago`, `getSantiagoIsoYmdForUtcInstant`, `:8`).
- Variante A/B: `abMode = !!program?.ab_mode` (`:41`), `weekIdx = programWeekIndex1Based(...)` (`:42`), `activeVariant = resolveEffectiveWeekVariant(...)` (`:43-48`).

### Anillos (`heroComplianceBundle.ts`)
- `getHeroComplianceBundle(userId, coachSlug)` → `scores` (`:68-203`), cacheado con `React.cache` (`:68`).
- `workoutScore`: `computeWorkoutScore30d({todaySantiagoIso, activePlans, program, logs})` (`:163-168`).
- `checkInScore = Math.min(100, Math.round((checkInsLast30 / 4) * 100))`, `checkInsLast30 = getCheckInHistory30Days(userId).length` (`:73,170-171`). **Meta = 4 check-ins/30d.**
- `nutritionHasLogs = getNutritionLogDays30(userId) > 0` (`:74,173`).
- `nutritionEngagementScore = nutritionHasLogs ? Math.min(100, Math.round((nutritionDays/30)*100)) : 0` (`:175-177`). Es ENGAGEMENT de registro (dias con log/30), NO cumplimiento de comidas (`:51-55,174`).
- (Existe `nutritionComplianceScore` real via `computeNutritionAdherence`, `:180,209-259`, pero **el anillo usa `nutritionEngagementScore`**, no este.)
- `getDashboardNutritionDomainEnabled(userId)`: lee `clients(coach_id, team_id, org_id)` por `id=userId` `.maybeSingle()` → `resolveNutritionDomainEnabled(...)` (`:276-290`).

## 8. Animaciones / transiciones

- **Tira: SIN animacion de entrada.** `MomentumWeekStrip` renderiza `<div>` planos (`MomentumWeekStrip.tsx:14-48`). (El stagger `scaleIn`/`staggerContainer(0.04)`/`springs.snappy` vive solo en `CalendarDay.tsx:28,70` del calendario legacy, que no se usa aqui.)
- **Anillo — count-up del numero:** framer `useMotionValue(0)` + `useSpring(mv, {stiffness:60, damping:20})`, `useMotionValueEvent(spring,'change', v => setAnimated(Math.round(v)))` (`ComplianceRing.tsx:31-45`). Con `useReducedMotion` → muestra `value` directo sin animar (`:30,47`).
- **Anillo — llenado del arco:** CSS `transition: stroke-dashoffset var(--dur-slow) var(--ease-spring)` (`progress-ring.tsx:86-88`).
- **Empty:** el count-up se resetea a 0 y no anima (`ComplianceRing.tsx:34-41,47-49`).

## 9. Accesibilidad

- `ProgressRing` web: `role="progressbar"`, `aria-valuenow={Math.round(clamped)}`, `aria-valuemin=0`, `aria-valuemax=100` (`progress-ring.tsx:52-59`); svg `aria-hidden="true"` (`:65`).
- `Check` lucide sin `aria-label` explicito (icono decorativo). Sin roles extra en tira ni celdas.

## 10. Hallazgos Ola 0 (`docs/rn-port/ola0-hallazgos.json`)

- **MomentumCard** (json:10590-10597): web `momentum/{MomentumCard,MomentumWeekStrip}.tsx` → mobile `apps/mobile/components/alumno/home/MomentumCard.tsx`. Prioridad `media`. Reason: "Web momentum/{MomentumCard,MomentumWeekStrip}.tsx. Mobile mismo nombre."
- **ComplianceRing** (json:10638-10645): web `compliance/ComplianceRing.tsx:28` (usa `ui/progress-ring`) → mobile `apps/mobile/components/ComplianceRing.tsx` (top-level). Prioridad `media`. **Existe un `apps/mobile/components/ComplianceRing.tsx` separado que NO es el que usa MomentumCard** (la card usa su `ComplianceItem` inline). Divergencia de organizacion a resolver en el port.
- No hay entrada de `AdherenceStrip` para esta unidad — los hits de `AdherenceStrip` en el json (4624-4638) son de **nutricion** (`/nutrition/_components/AdherenceStrip.tsx`), otra unidad; no aplican aqui.

## 11. Estado RN actual (`apps/mobile/components/alumno/home/MomentumCard.tsx`) — divergencias

Contraparte existe y esta cerca del web. Divergencias observadas (cita RN):

1. **Color del check en dia HOY-completado.** RN: `<Check color={d.isToday ? '#fff' : theme.success}>` (`MomentumCard.tsx:81`). Web: check **siempre** `var(--success-500)` aunque sea hoy (`MomentumWeekStrip.tsx:37`). En RN un dia hoy+hecho pinta el check blanco; en web pinta verde success. **Divergencia visual real.**
2. **`strokeWidth` del check.** RN fuerza `strokeWidth={3}` (`MomentumCard.tsx:81`). Web usa el default de lucide (2) (`MomentumWeekStrip.tsx:37`). Trazo mas grueso en RN.
3. **Anillo Check-ins con estado vacio.** RN pasa `empty={checkInEmpty}` al ComplianceItem de Check-ins (`MomentumCard.tsx:58`) y `home.tsx:342/266` deriva `checkInEmpty`. Web **no** pasa `empty` a Check-ins (`MomentumCard.tsx:98`). En RN 0 check-ins → anillo gris "Sin datos"; en web → `0%` verde. **Divergencia de estado.**
4. **Sin count-up del numero.** RN `ComplianceItem` pasa `pct` estatico al label y `ProgressRing` solo anima el arco (reanimated `withSpring`, `ProgressRing.tsx:74-78`). Web ademas cuenta el numero (framer spring stiffness 60/damping 20, `ComplianceRing.tsx:31-45`). RN numero salta; web sube. **Divergencia de animacion.**
5. **Distribucion de la fila de anillos.** RN: `flexDirection:'row', justifyContent:'space-around'` (`MomentumCard.tsx:53`). Web: `grid items-start gap-2 grid-cols-3|2` (`MomentumCard.tsx:88`). Grid = columnas de ancho igual; space-around = espaciado distinto. Divergencia de layout menor.
6. **`paddingVertical:8` extra** en celdas de la tira RN (`MomentumCard.tsx:77`) que web no tiene (web solo `justify-center`, `MomentumWeekStrip.tsx:22`). Inocuo con altura fija 54 + centrado, pero es valor no presente en web.
7. **Escala de `value` distinta.** RN `ComplianceItem` recibe fracciones 0..1 y hace `Math.round(clamp(0,1)*100)` (`MomentumCard.tsx:97`); web recibe 0..100 ya calculado. Ambos muestran 0..100% — consistente en salida, distinto en contrato.
8. **Props muertas.** RN recibe `workoutDays`, `nutritionDays`, `checkInCount` (`MomentumCard.tsx:31-33`, pasadas desde `home.tsx:340-342`) pero **no las renderiza** (sin sublineas de conteo). Web tambien omite las sublineas a proposito (`MomentumCard.tsx:26-28`). Salida igual (ambos sin conteo), pero en RN son props sin uso → limpiar o dejar documentado.
9. **`SectionTitle` RN** correcto: `accent={theme.primary}` (`MomentumCard.tsx:49`) == web `var(--sport-500)` (sport=marca). Importa de `./SectionTitle` (unidad shell, READ-ONLY).

### Divergencias en la CAPA DE DATOS (viven en el shell `home.tsx`, NO tocar sin reportar)

Estas afectan lo que se ve, pero la derivacion esta en `home.tsx` (archivo shell de otra unidad):

- **Completitud de la tira mas laxa.** `home.tsx:212-217`: `isCompleted = workoutDates.has(dIso)` (cualquier entreno logueado esa fecha). Web exige match del `plan.id` del dia (`MomentumCard.tsx:68-73`). RN marcaria hecho un dia con log de otro plan.
- **`hasWorkout` sin variante A/B.** `home.tsx:206-210,215`: planificado = `day_of_week` OR `assigned_date`, sin `workoutPlanMatchesVariant`/`resolveEffectiveWeekVariant`/`program_id`. Web filtra por variante efectiva y programa (`MomentumCard.tsx:57-66`).
- **Formulas de compliance distintas (legacy mobile).** `home.tsx:246-249`: `workoutTargetDays = plans.length ? min(plans.length*4,30) : 12`; `workoutCompliance = min(1, workoutDates.size/workoutTargetDays)`; `nutritionCompliance = nutritionDates/30`; `checkInCompliance = checkIns/4`. Web: `workoutScore` de `computeWorkoutScore30d` (motor canonico), `checkInScore = min(100,round(checkins/4*100))`, `nutritionEngagementScore = round(nutritionDays/30*100)` (`heroComplianceBundle.ts:163-177`). Nutricion y check-ins coinciden en intencion (dias/30, /4); **entrenos difiere de fondo** (target heuristico vs motor 30d).

## Cambios necesarios en archivos compartidos / shell (NO tocar en esta unidad — reportar)

- `apps/mobile/app/alumno/(tabs)/home.tsx` (shell §home): para paridad de datos habria que (a) endurecer `isCompleted` de la tira a match de plan.id (`home.tsx:212-217`), (b) incorporar variante A/B en `hasWorkout` (`home.tsx:203-217`), (c) alinear `workoutCompliance` al motor 30d (`home.tsx:246-247`). **No editar desde esta unidad.**
- `apps/mobile/components/alumno/home/SectionTitle.tsx` (unidad shell): READ-ONLY, ya correcto para el uso aqui. Sin cambios.
- `apps/mobile/components/alumno/home/types.ts`: `EMBER_500='#FF6A3D'` (`types.ts:101`), `WEEK_LETTERS` (`types.ts:111`), `MomentumDay` — ya presentes. Si el port mueve `MomentumDay` a types compartido, coordinar (hoy vive duplicado en `MomentumCard.tsx:10-15`).
- `apps/mobile/components/ComplianceRing.tsx` (top-level, otra unidad segun Ola 0): existe pero MomentumCard usa su `ComplianceItem` inline; decidir consolidacion sin romper el otro consumidor.

## Sin P0 QA asignado

Esta unidad no tiene un P0 QA de produccion asignado en el brief. (No confundir con los P0 de nutricion `AdherenceStrip`, que son de otra unidad.)
