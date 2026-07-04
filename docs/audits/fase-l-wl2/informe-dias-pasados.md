# Informe: "hacer un día pendiente" del alumno (días pasados / saltados)

**Fecha:** 2026-07-04
**Rama:** `feat/redesign-eva-design-system`
**Tipo:** SOLO INVESTIGACIÓN (cero cambios de producto)
**Pedido CEO:** "El alumno ya no ve los días de la semana que se saltó ni puede hacer HOY el
entreno que le tocaba otro día (ej. el del martes). Antes existía una UI de semana que lo permitía."

---

## 0. TL;DR (veredicto)

1. **La capacidad NO se borró del todo.** El carrusel de días del dashboard
   (`WorkoutPlanCards`, "Tu programa") sigue linkeando **cada día de la semana actual** a
   `/c/[slug]/workout/[planId]`, y la ejecución (`getWorkoutExecutionData`) **NO tiene ningún
   candado de "hoy debe ser el día agendado"**: el alumno puede abrir el plan del martes un
   sábado y registrar series. Mecánicamente se puede.
2. **Lo que se perdió / degradó es DESCUBRIBILIDAD y el concepto de "pendiente":**
   - El **hero** (la CTA grande) solo conoce **HOY**; en un día sin plan muestra "Día de
     descanso" + "Próximo: …" y ese "próximo" es **solo hacia adelante** (`day_of_week > hoy`).
     Nunca dice "tienes el martes pendiente, hazlo ahora".
   - Las tiras semanales (`MomentumWeekStrip`, `WeekCalendar`) muestran los días saltados con
     un punto apagado, pero son **read-only, sin link**. El alumno "ve" que faltó, pero no hay
     dónde tocar.
   - El carrusel solo muestra la **variante activa de la semana actual** (`workoutPlanMatchesVariant`).
     Un día de una **semana anterior**, o un plan de la variante A durante una semana B, **no
     tiene ruta**. Y una card de día pasado se ve **idéntica** a una futura (sin estado
     "pendiente"/"te lo saltaste").
3. **El problema de fondo es de ATRIBUCIÓN (backend), no solo de UI.** Si el alumno hace el plan
   del martes un sábado, ese registro **nunca se acredita** ni al martes ni al sábado en
   adherencia ni en las tiras: quedan calculadas por `plan_id` **+** día-calendario del `logged_at`.
   El martes queda rojo para siempre y el esfuerzo del sábado es invisible. La **racha** sí lo
   cuenta (usa `DATE(logged_at)`), pero la **adherencia de entrenos** y los puntos de la semana no.

Recomendación (detalle en §5): **Opción M** — "cola de pendientes" en el dashboard + registrar
en `workout_logs` una columna `scheduled_for` (día que el plan cubría) para arreglar la
atribución. Es aditivo (migración no destructiva) y desbloquea tanto la UI como las métricas.

---

## 1. Cómo el sistema elige "el plan del día" hoy

### 1.1 Modelo de datos

Un programa activo (`workout_programs`, `is_active=true`) tiene N `workout_plans`. Cada plan se
ancla al día por **una de dos vías**:

- `assigned_date` (YYYY-MM-DD): plan "clavado" a una fecha concreta (planes sueltos / one-off).
- `day_of_week` (1=Lun … 7=Dom) + `week_variant` ('A' | 'B'): plan **recurrente** del programa
  (se reusa cada semana). En modo A/B (`program.ab_mode`), la semana par usa B, la impar A.

La resolución del "plan de HOY" (idéntica en hero, carrusel, tiras y adherencia) es:

```
todayPlan = plans.find(assigned_date === hoy)
         ?? plans.find(program_id === activo && day_of_week === hoyDow && matchesVariant(A/B))
```

`programWeekIndex1Based(start_date, weeks_to_repeat)` da la semana 1-based (para A/B y para la
sobrecarga progresiva). `resolveEffectiveWeekVariant` cae a la otra variante si la del ciclo no
tiene planes (fix del "dead-end A/B mal armado").

**Archivos clave:**
- `apps/web/src/app/c/[coach_slug]/dashboard/_data/dashboard.queries.ts` (`getActiveProgram`,
  `getClientWorkoutPlans`, `getRecentWorkoutLogs`).
- `apps/web/src/app/c/[coach_slug]/dashboard/_data/heroComplianceBundle.ts` (resuelve `todayPlan`
  + `nextWorkout`).
- `apps/web/src/lib/workout/programWeekVariant.ts` (semana/variante).
- `apps/web/src/lib/workout/workoutAdherence30d.ts` (score de entrenos 30d).

### 1.2 Superficies del dashboard del alumno (rama rediseño)

Orden de render en `dashboard/page.tsx` (móvil):

| Componente | Qué muestra | ¿Toca días pasados? |
|---|---|---|
| `HeroSection` → `WorkoutHeroCard` | Solo el plan de **HOY** ("Hoy entrenás …", CTA "Empezar"). Si no hay plan hoy → `RestDayCard` "Día de descanso" + "Próximo: …" | **No.** Solo hoy. "Próximo" es forward-only (`day_of_week > todayDow`, `heroComplianceBundle.ts:147-161`). |
| `MomentumCard` → `MomentumWeekStrip` | Tira L-M-X-J-V-S-D con puntos (hasWorkout / isCompleted / isToday) + 3 anillos de cumplimiento | **No.** Read-only, sin `<Link>`. Los saltados se ven grises pero no se pueden tocar. |
| `WeekCalendar` (variante equivalente) | Mismos puntos Mon-Sun | **No.** Read-only. |
| `ActiveProgramSection` → `WorkoutPlanCards` | **Carrusel horizontal** de los planes de la **variante activa de esta semana**, ordenados por `day_of_week`. **Cada card es `<Link href={base}/workout/[planId]>`** | **Sí, parcialmente.** Se puede tocar cualquier día de la semana actual. Pero solo hoy tiene estado visual ("hoy"/"hecho"); un día pasado sin registrar se ve igual que uno futuro (ChevronRight genérico). |

`WorkoutPlanCards` filtra `p.program_id === program.id && workoutPlanMatchesVariant(p, activeVariant, abMode)`
→ **solo la semana/variante actual**. No hay planes de semanas previas ni de la otra variante.

### 1.3 Ejecución `/c/[slug]/workout/[planId]`

- No existe `page.tsx` en `/workout` (índice). La única ruta es `/workout/[planId]`; el `planId`
  se elige **fuera** (dashboard). No hay "DayNavigator" de días en la exec — el único
  "DayNavigator" del repo es el de **nutrición** (`nutrition/_components/DayNavigator.tsx`); en la
  exec la palabra solo aparece en un comentario sobre umbrales de swipe entre ejercicios
  (`StepperExecution.tsx`). **No hay, ni hubo, un selector de día dentro de la ejecución de rutina.**
- `getWorkoutExecutionData(planId)` carga el plan por `id` + `client_id` (RLS own-row), valida que
  el programa siga activo, y **trae los logs de HOY** (`logged_at ∈ [inicio, fin]` del día
  Santiago). **No valida que hoy sea el `day_of_week` del plan.** → Abrir el plan del martes un
  sábado funciona: muestra 0 series de hoy y deja registrar.
- Al guardar, `workout_logs` se escribe con `logged_at = now` y `block_id` del plan abierto
  (más `exercise_id` snapshot). El registro queda con la fecha de HOY, no la del día agendado.

---

## 2. Qué se puede hacer HOY vs. qué se perdió

### Se PUEDE (hoy, rama rediseño)
- Abrir cualquier plan de **la semana/variante actual** desde el carrusel "Tu programa" y
  registrarlo hoy (incluido un día que ya pasó esta semana).
- La **racha** (`get_client_current_streak`, `DATE(logged_at)`) cuenta ese entreno para hoy →
  mantiene/extiende la racha del día en que se hace.
- La **sobrecarga progresiva** funciona bien: usa historial por `exercise_id` de días previos a
  hoy (no depende del día agendado) → el peso objetivo del martes-hecho-sábado es correcto.

### Se PERDIÓ / falta
1. **No hay concepto de "pendiente/atrasado".** Nada computa "días de esta semana con plan, ya
   pasados, sin logs" = pendientes. Sin eso no hay badge, ni cola, ni CTA, ni orden.
2. **El hero y las tiras no rutean a días saltados.** La CTA protagonista (hero) solo abre hoy;
   en día de descanso ni siquiera menciona un pendiente. Las tiras muestran el hueco pero no
   linkean.
3. **Días de semanas ANTERIORES no tienen ruta.** El carrusel es solo la semana actual. Un
   entreno de la semana pasada que se saltó no aparece en ningún lado accionable.
4. **La card del día pasado no comunica "pendiente".** Se ve igual que un día futuro; no hay
   "te lo saltaste, hazlo ahora".
5. **Atribución rota (lo más grave, backend):** un entreno "de recuperación" (martes hecho el
   sábado) **no cuenta** en:
   - `computeWorkoutScore30d` (adherencia de entrenos): exige log con `plan_id === planDelDía` **y**
     `DATE(logged_at) === díaAgendado`. El log del sábado tiene el `plan_id` del martes pero fecha
     de sábado → el **martes queda "planificado y no hecho"** (baja el score) y el **sábado**, si
     no tenía plan, no suma nada.
   - Los puntos "completado" de `MomentumWeekStrip` / `WeekCalendar`: misma condición → el martes
     nunca se pinta como hecho.
   Resultado: el alumno hace el trabajo pero la app le sigue mostrando el día en rojo y su
   cumplimiento no mejora. Esto es lo que hace **sentir** que "no se puede hacer el entreno del
   martes".

> Nota de contexto: en `master` el carrusel ya linkeaba cada día igual (verificado en
> `git show master:…/WorkoutPlanCard.tsx`). La capacidad de tocar un día de la semana existe hace
> tiempo; el rediseño la mantuvo pero la enterró bajo el hero + tiras read-only y nunca resolvió
> la atribución. La "UI de semana que lo permitía" que recuerda el CEO era, funcionalmente, este
> mismo carrusel — hoy menos evidente y sin estado de "pendiente".

---

## 3. Cómo lo resuelven Hevy / Strong / Boostcamp / TrainHeroic (jul-2026)

Dos filosofías dominan; EVA es del segundo campo (coach-driven + calendario) y por eso el patrón
de **TrainHeroic** es el más aplicable.

### 3.1 Modelo "cola flexible / next-up" (Hevy, Strong, Boostcamp)
El programa es una **lista ordenada de sesiones** que avanzas cuando entrenas; **no hay fechas
fijas** y por lo tanto **no existe el concepto de "día saltado"**.
- **Hevy:** las rutinas no están atadas a fechas; entras a la pestaña Workout y arrancas la
  rutina que quieras, cuando quieras. Los programas avanzan a la "siguiente" sesión en orden.
- **Strong:** log-first; eliges tu rutina y la registras en cualquier momento, sin candado de fecha.
- **Boostcamp:** programas flexibles/day-based ("siguiente entreno" del programa, no del
  calendario); permite reprogramar/registrar entrenos perdidos.
- Tendencia 2026 documentada: se abandona el "plan estático" con calendario rígido hacia planes
  adaptativos que **rebalancean el split cuando saltas una sesión**; los usuarios de planes
  adaptativos completan ~32% más entrenos/mes.

### 3.2 Modelo "calendario con recuperación" (TrainHeroic — el análogo de EVA)
Mantiene el calendario del coach, pero da tres afordancias para días pasados:
1. **Navegar a cualquier día:** swipe izquierda/derecha en el calendario o dropdown de fecha para
   ver/abrir sesiones de días distintos a hoy (pasados o futuros).
2. **Reprogramar:** menú de 3 puntos → mover la sesión a otra fecha.
3. **Auto-mover al registrar (clave):** *"si empiezas a registrar una sesión que no está agendada
   para hoy, TrainHeroic te pregunta automáticamente si quieres moverla"* → re-atribuye el entreno
   de recuperación a hoy. Limitación: la reprogramación es de una sesión a la vez.

**Lectura para EVA:** como EVA es calendario dirigido por coach (como TrainHeroic), la solución no
es tirar el calendario, sino **(a)** exponer un día-picker/cola que llegue a cualquier día y
**(b)** resolver la atribución cuando se hace un día en fecha distinta a la agendada (el "¿mover a
hoy?" de TrainHeroic). El campo flexible (Hevy/Strong) confirma que el usuario no quiere culpa por
fechas: un pendiente debe poder cerrarse sin penalización.

**Fuentes:**
- Hevy — https://www.hevyapp.com/hevy-tutorial/ , https://www.hevyapp.com/features/gym-routines/
- Strong — https://www.strong.app/ ; comparativa 2026 https://setgraph.app/ai-blog/best-apps-for-strength-training-2026
- Boostcamp — https://www.boostcamp.app/blogs/tips-and-tricks-to-using-boostcamp-app , https://www.boostcamp.app/blogs/top-ten-tips-for-logging-workouts
- TrainHeroic — https://support.trainheroic.com/hc/en-us/articles/18171038167309-How-can-I-view-sessions-other-than-today-s , https://support.trainheroic.com/hc/en-us/articles/18156964554765-As-an-athlete-can-I-reschedule-my-training-sessions
- Tendencia adaptativa 2026 — https://fitbod.me/blog/static-workout-plans-vs-adaptive-training-apps-why-fitbod-adjusts-to-you/

---

## 4. El nudo de `workout_logs`: adherencia / racha / progresión

`workout_logs` se registra por `block_id` + `logged_at` (+ `exercise_id` snapshot, `client_id`).
**No guarda a qué día del calendario/plan "correspondía" el entreno.** Consecuencias al hacer el
martes un sábado:

| Métrica | Fuente | ¿Cuenta el recupero? | Por qué |
|---|---|---|---|
| **Racha** | RPC `get_client_current_streak` = `DISTINCT DATE(logged_at)` | **Sí** (para el sábado) | Solo mira que haya actividad ese día calendario. |
| **Adherencia entrenos 30d** | `computeWorkoutScore30d` | **No** | Exige `plan_id === planDelDía` **y** `DATE(logged_at) === díaAgendado`. Martes queda rojo. |
| **Puntos "completado" tira semanal** | `MomentumWeekStrip` / `WeekCalendar` | **No** | Misma doble condición. |
| **Sobrecarga progresiva** | historial por `exercise_id` < hoy | **Sí, correcto** | No depende del día agendado. |
| **PRs / máximos** | por `exercise_id` | **Sí, correcto** | Igual. |

→ Cualquier solución que quiera que "hacer el martes el sábado cuente como el martes" **necesita
tocar el backend**: o registrar el día objetivo en el log (`scheduled_for`), o re-atribuir el log
a la fecha del día agendado. Sin eso, la UI puede dejar hacer el entreno pero la métrica seguirá
mostrando el día en rojo (justo la queja).

---

## 5. Propuestas (S / M / L) — frontend + backend + DB

### Opción S — "Descubribilidad" (solo frontend, CERO migración)
**Alcance:**
- Card **"Pendientes esta semana"** en el dashboard: computa en el data-layer (ya se tienen
  `activePlans` + `logs`) los días de la semana actual con plan, ya pasados, sin log → lista
  linkeada a `/workout/[planId]`.
- Estado visual **"pendiente"** en las cards del carrusel (color/badge para día pasado sin registrar).
- El `RestDayCard` (día de descanso) menciona pendientes: "Tienes el martes sin hacer → Hacerlo hoy".
- Micro-copy en la exec cuando `plan.day_of_week !== hoy`: "Recuperando el entreno del martes".

**Backend/DB:** ninguno. **Impacto en `workout_logs`/adherencia:** **no arregla la atribución** —
el recupero sigue sin contar en adherencia ni en la tira (el martes queda rojo aunque se haga).
La racha sí. Es un parche de visibilidad.

**Esfuerzo:** bajo (1-2 días). **Riesgo:** mínimo. **Deuda:** deja el bug de atribución vivo.

---

### Opción M — "Cola de pendientes + atribución correcta" ✅ RECOMENDADA
**Alcance frontend (todo lo de S) +:**
- Cola de pendientes ordenada (día más antiguo primero), con CTA "Hacer ahora".
- En la exec, si el plan no es el de hoy, banner "Estás recuperando el entreno del [día]"
  (patrón TrainHeroic "¿mover a hoy?", pero sin fricción: se registra ya atribuido).

**Backend + DB (aditivo, migración NO destructiva, forward-only):**
- Nueva columna `workout_logs.scheduled_for date NULL`. La exec/acción de guardado la setea con el
  día-calendario que el plan cubría (para un plan `assigned_date`, esa fecha; para un plan
  recurrente hecho en fecha distinta a su `day_of_week`, la fecha de la ocurrencia de esta semana
  que se está recuperando). `NULL` = comportamiento legacy (usar `logged_at`).
- **GRANT UPDATE/INSERT** de la columna a `authenticated` en la misma migración (gotcha de
  column-level grants de EVA: sin el grant, PostgREST tira 42501 en runtime). En rigor `workout_logs`
  se inserta vía server action; revisar si el insert es user-scoped o service-role y otorgar según eso.
- **Adherencia/tiras:** cambiar la condición de "hecho" para que atribuya por
  `COALESCE(scheduled_for, DATE(logged_at))`. Así el martes-hecho-sábado marca el **martes** como
  completado. Backfill innecesario (histórico cae al `COALESCE` → `logged_at`, = hoy).
- **Racha:** sin cambios (sigue por `logged_at`; el recupero cuenta para el día real, que es lo
  correcto para "días activos").
- **Progresión/PRs:** sin cambios (ya son por `exercise_id`, correctos).

**Decisión de producto a cerrar con CEO:** ¿un recupero cuenta como el día agendado (rellena el
hueco de adherencia, filosofía "sin culpa") o como el día real? La col. `scheduled_for` permite
**ambas lecturas** sin perder información; recomiendo contar el hueco (rellena martes) para que la
métrica premie cerrar pendientes — alineado con la tendencia adaptativa 2026.

**Esfuerzo:** medio (3-5 días: 1 migración aditiva + tocar la acción de guardado + 2 funciones de
adherencia + UI). **Riesgo:** medio-bajo (aditivo; el `COALESCE` es retro-compatible). **Deja el
sistema correcto de punta a punta.**

---

### Opción L — "Programa flexible / next-up configurable" (rework de modelo)
**Alcance:** introducir por-programa un flag `scheduling_mode` (`calendar` | `flexible`). En
`flexible` el programa se vuelve una **cola ordenada** (estilo Hevy/Boostcamp): el hero muestra
"Siguiente: Día N" sin importar el día de la semana; no hay "saltado", solo "siguiente". El coach
elige el modo por programa.

**Backend + DB:**
- `workout_programs.scheduling_mode text` + posiblemente `sequence_index`/orden explícito de planes.
- Estado de progreso por alumno (qué sesión del programa va "next") → nueva tabla o columna
  (`client_program_progress`) — esto **sí** es schema nuevo y lógica de avance/rollover.
- Adherencia se redefine (sesiones completadas / esperadas por ritmo objetivo, no por día).
- Reescribir hero, carrusel, tiras, adherencia y el builder del coach (elegir modo).

**Esfuerzo:** alto (2-3+ semanas), requiere SDD (SPEC/PLAN/TASKS), decisiones de UX del coach y
migración de datos/semántica de métricas. **Riesgo:** alto (toca el corazón del modelo y el coach).
Es la dirección "2026" de la industria, pero es un proyecto, no un fix.

---

## 6. Recomendación

**Ir por la Opción M.** Resuelve la queja real de punta a punta: (1) el alumno **ve** sus
pendientes y los abre desde una cola clara + carrusel con estado "pendiente"; (2) puede **hacer
HOY** el entreno del martes (ya se puede mecánicamente); y (3) —lo que hoy falla— ese recupero
**cuenta** en la adherencia y pinta el día como hecho, gracias a `scheduled_for` +
`COALESCE(scheduled_for, DATE(logged_at))`. Es aditivo (migración no destructiva, forward-only,
con el GRANT de columna obligatorio de EVA), no rompe racha/progresión, y es el análogo directo del
patrón probado de TrainHeroic sin tirar el modelo de calendario dirigido por coach.

La Opción S sirve solo si se necesita algo hoy mismo sin migración, pero **deja vivo el bug de
atribución** (el martes queda rojo aunque el alumno lo haga) — que es precisamente lo que genera la
sensación de "no se puede". La Opción L es el norte de producto, pero es un rework con SDD y
decisiones de coach; no es la respuesta a esta queja puntual.

### Archivos a tocar si se aprueba M (referencia, no ejecutado)
- DB: nueva migración `supabase/migrations/…_workout_logs_scheduled_for.sql` (columna + grant).
- Guardado: acción de registro de series en
  `apps/web/src/app/c/[coach_slug]/workout/[planId]/_actions/` (setear `scheduled_for`).
- Métricas: `apps/web/src/lib/workout/workoutAdherence30d.ts`,
  `dashboard/_components/momentum/MomentumCard.tsx`, `.../calendar/WeekCalendar.tsx` (usar
  `COALESCE`), y `heroComplianceBundle.ts` (cola de pendientes + hero-aware).
- UI: `dashboard/_components/program/*` (estado "pendiente" + cola), `hero/RestDayCard.tsx`
  (mención de pendiente), exec (banner de recupero).
- Paridad mobile (`apps/mobile`) si aplica en la misma ola.
