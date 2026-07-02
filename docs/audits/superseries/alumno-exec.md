# Auditoría SUPERSERIES — Lente Alumno / Ejecución

**Fecha:** 2026-07-01
**Alcance:** cómo se **muestran** y **ejecutan** las superseries del lado del alumno (web `apps/web/src/app/c/**/workout/**` + mobile `apps/mobile/app/alumno/workout/[planId].tsx`), cómo las ve el coach en la **ficha** (`coach/clients/[clientId]`) y en el **preview** de programas, inconsistencias entre superficies y edge cases.
**Modo:** READ-ONLY (no se tocó código).

---

## 1. Cómo se agrupa una superserie (motor de agrupación)

La lógica canónica vive en `apps/web/src/lib/workout-block-grouping.ts` → `groupContiguousSupersetRuns()`:

- Recorre bloques **ya ordenados por `order_index` ascendente** dentro de una sección/área.
- Une un tramo de superserie **solo si** `superset_group` coincide **Y** `next.order_index === prev.order_index + 1` (contigüidad estricta de índice).
- `superset_group` almacena una **letra** (A, B, C…) — el builder la asigna con `nextFreeSupersetLetter` y solo enlaza bloques de la **misma área efectiva** (`usePlanBuilder.ts`), re-letrando tramos partidos y descartando singletons (un superset exige ≥2 bloques contiguos).

Este helper lo consumen **la ejecución del alumno (web)** y **el preview de biblioteca (web)** → misma agrupación en ambas superficies web. **Mobile y la ficha del coach NO lo usan** (ver inconsistencias, §5).

---

## 2. Ejecución del alumno — WEB (`WorkoutExecutionClient.tsx`)

### Cómo se ve
- Cada superserie se renderiza como un **card contenedor** con `border-primary/30 bg-primary/[0.08]`, título **"Superserie (grupo A)"** y un bloque instructivo **"Cómo hacerla"** con una lista ordenada de 3 pasos (líneas 617-643).
- Cada ejercicio del grupo lleva: chip **"Superserie A · N ejercicios"**, prefijo en el chip de músculo **"A-1 · Pecho" / "A-2 · Espalda"** (`${supersetLetter}-${blockIndex+1}`), y entre ejercicios un divisor **"Luego"** (líneas 671-677).
- Los indicadores visuales son claros y consistentes.

### Cómo se ejecuta / loggea (el hallazgo central)
- **Las series NO están intercaladas.** El card dibuja la **tabla completa de series del ejercicio A** (todas sus filas de log) y **debajo** la tabla completa del ejercicio B (líneas 645-882 → cada bloque renderiza `Array.from({length: block.sets})` de `LogSetForm`).
- Pero el texto **"Cómo hacerla"** le dice explícitamente al alumno: *"Completa una serie del primer ejercicio y regístrala. Completa una serie del siguiente ejercicio y regístrala. Repite…"* (alternar A1→B1→A2→B2…).
- **Contradicción layout↔instrucción:** para seguir el protocolo alternado, el alumno debe registrar A1, **bajar** a la tabla de B, registrar B1, **subir** a A, registrar A2… El camino natural que ofrece la UI (llenar toda la tabla A y luego toda la B) es el opuesto a lo prescrito. Alta fricción y confusión.
- **Auto-scroll refuerza el patrón equivocado:** al completar un bloque, `handleLogged` hace scroll al *siguiente bloque incompleto* (líneas 491-500). En una superserie esto empuja a terminar A **entero** y recién ahí saltar a B — justo lo contrario a alternar.

### Rest timer — NO es consciente de la superserie
- Al registrar **cualquier** serie, si `autoTimerEnabled`, se dispara `startRest(block.rest_time)` (`LogSetForm.tsx` líneas 110-115).
- En una superserie el protocolo real es: **0 / mínimo descanso entre A y B**, y descanso **después de completar la ronda**. El timer no distingue "descanso dentro de la superserie" de "descanso tras la ronda": lanza el descanso completo del bloque **después de cada serie**, incluida A→B. Resultado: cuenta regresiva de 90s saltando entre ejercicios que deberían encadenarse. `WorkoutTimerProvider` solo conoce `startRest` genérico por bloque; no hay noción de ronda ni de descanso compartido/encadenado.
- Único paliativo: si el coach pone `rest_time` vacío en el 1er ejercicio, `parseRestTime` → 0 y no arranca. Pero el builder normalmente prescribe descanso por ejercicio.

---

## 3. Ejecución del alumno — MOBILE (`apps/mobile/app/alumno/workout/[planId].tsx`)

- Tiene su **propia** función `groupSupersets` (líneas 641-652) que agrupa por **adyacencia en la lista** (`last?.key === block.superset_group`), **sin** el check de `order_index + 1` del web.
- Agrupa **solo por sección clásica** (`groupBySection`: warmup/main/cooldown/other). **No soporta áreas** (gap de paridad con web; para superseries dentro de sección funciona).
- Indicador: header **"Superserie {A}"** + hint de **1 línea** *"Completa una serie de cada ejercicio y repite."* + borde/tinte primary (líneas 457-466). **Más pobre que web:** sin lista de 3 pasos, sin prefijo "A-1/A-2", sin chip "Superserie A · N ejercicios", sin divisor "Luego".
- **Mismo layout secuencial (no intercalado):** cada `BlockCard` muestra su propio formulario de una serie a la vez (`nextSet`), ejercicio A completo y luego B → misma contradicción con "alternar".
- **Mismo problema de rest timer:** `logSet` dispara `startRest(parseRestTime(block.rest_time))` tras cada serie (líneas 419-422), sin consciencia de superserie.

---

## 4. Vista del COACH

### 4.1 Ficha del alumno — Entreno/Programa (`ProgramTabB7.tsx`) — SIN superseries
- El día se renderiza como **lista plana** ordenada por `order_index` (líneas 223-224, 306-335): punto de color de músculo + nombre + `sets×reps`. **No hay agrupación ni indicador de superserie en absoluto.**
- `superset_group` **se trae** en la query (`client-detail.service.ts` línea 137) pero **nunca se usa** en el render.
- El sheet de detalle del bloque (`prescriptionRows`, líneas 344-366) tampoco muestra pertenencia a superserie.
- **Consecuencia:** el coach revisando en la ficha lo que su alumno ejecuta **no ve las superseries que él mismo programó** — su modelo mental diverge de lo que el alumno ve y ejecuta.

### 4.2 Preview de biblioteca de programas (`ProgramPreviewPanel.tsx`) — CON superseries
- Usa el helper canónico (`groupContiguousSupersetRuns` vía `buildLibrarySections`) → banda **"Superserie · grupo A"** con las filas agrupadas y borde/tinte sport (líneas 264-289). **Consistente con la ejecución del alumno (web).**
- El preview mobile del coach (`ProgramPreviewSheet.tsx`) y el PDF/print también contemplan superserie.

---

## 5. Inconsistencias entre superficies

1. **Ficha del coach NO muestra superseries** (§4.1) vs alumno-web/preview-web SÍ. Es la inconsistencia más grave: la superficie de *revisión* del coach oculta un atributo estructural del entrenamiento.
2. **Algoritmo de agrupación divergente web vs mobile:** web exige contigüidad de `order_index` (`+1`); mobile exige adyacencia en la lista. Con `order_index` con huecos (post-borrado/reconcile), un mismo dato puede renderizar como superserie en mobile pero **partirse en ejercicios sueltos en web** (o viceversa).
3. **Profundidad de la guía inconsistente:** web-alumno da instrucción de 3 pasos; mobile-alumno da 1 línea; preview solo banda. El alumno recibe distinta orientación según dispositivo.
4. **Áreas:** el agrupador web opera por área (`executionAreaGroupsFor`); mobile solo por secciones clásicas. Un plan con áreas custom agrupa distinto entre plataformas.
5. **Layout intercalado:** ninguna superficie de ejecución (web ni mobile) intercala las series realmente; ambas presentan A completo y luego B, contradiciendo su propia instrucción de "alternar".

---

## 6. Edge cases

- **Superset de 1 solo bloque (stray `superset_group`):** `groupContiguousSupersetRuns` empuja el tramo con `type:'superset'` **aunque `run.length === 1`**. Un bloque suelto con letra huérfana renderiza un card **"Superserie (grupo A)" con un único ejercicio** + la instrucción de "alternar ejercicios" (que no tiene sentido). El builder limpia estos singletons, pero datos legacy/importados/copiados podrían tenerlos.
- **Superserie cruzando secciones/áreas:** el builder impide crearla (solo enlaza dentro de la misma área efectiva), pero datos legacy o copiados por assign/duplicate podrían tenerla; se **partiría** bajo dos headers distintos, perdiendo la identidad de superserie (web por área, mobile por sección).
- **`order_index` no contiguo:** el save normal escribe índice contiguo (`workout.service.ts` línea 140 `order_index: index`), lo que mitiga; pero tras borrados/reconcile con huecos, el web puede **degradar silenciosamente** la superserie a bloques sueltos (necesita `+1`). Latente.
- **Superserie incompleta / rondas desparejas:** el contador superior suma **todas** las series (`countUniqueLoggedSets`); un bloque se marca "completo" solo cuando todas SUS series están logueadas. **No hay tracking a nivel de ronda de la superserie**: si el alumno hace 3 rondas de A pero 2 de B, no hay aviso; solo se refleja en el % global < 100 y en que el card de B no queda verde. Ninguna superficie advierte "te falta un ejercicio de la superserie".
- **Superserie de tipos mixtos (strength + cardio/movilidad):** cada bloque se renderiza según su `effType` dentro del card de superserie (funciona), pero el problema del rest-timer se agrava y la semántica "Series × reps" vs grid tipado difiere por ejercicio dentro del mismo grupo.
- **Offline:** la cola (`workout-offline-queue.ts`) es **por serie y agnóstica a superserie** — sin riesgo específico. El drenaje (`OfflineWorkoutQueueSync`) es FIFO idempotente. Nota: offline tampoco recuerda visualmente la pertenencia a superserie más allá de lo que ya trae el plan cacheado.

---

## 7. Mejoras propuestas (priorizadas)

### P0 — Alta
1. **Mostrar superseries en la ficha del coach (`ProgramTabB7`).** Reusar `groupContiguousSupersetRuns` (ya se trae `superset_group`) y pintar la banda "Superserie A" igual que el preview. Cierra la inconsistencia de revisión (§5.1). Bajo costo, alto valor.
2. **Rest timer consciente de superserie.** Distinguir "descanso entre ejercicios de la ronda" (0/mínimo, o un micro-descanso configurable) de "descanso tras completar la ronda". Al loggear una serie de A dentro de una superserie, **no** disparar el descanso completo; dispararlo recién al cerrar la ronda (o tras el último ejercicio del grupo). Aplica a web (`LogSetForm`/`WorkoutTimerProvider`) y mobile (`logSet`).

### P1 — Media
3. **Resolver la contradicción layout↔instrucción (alternado).** O bien (a) intercalar realmente las series por ronda (Ronda 1: A1, B1 → Ronda 2: A2, B2…) con un único punto de registro por ronda, o (b) si se mantiene el layout por-ejercicio, cambiar la copia para que describa el flujo real ("completa el ejercicio A, luego el B" o "registra por columnas") y quitar la instrucción de alternar. Hoy el UI y el texto se contradicen. Ajustar también el auto-scroll para no empujar a terminar A entero si se opta por alternar.
4. **Unificar el algoritmo de agrupación web↔mobile.** Portar `groupContiguousSupersetRuns` (o su equivalente) a mobile como lógica compartida (`@eva/*`) para eliminar la divergencia `order_index+1` vs adyacencia y sumar soporte de áreas. Elimina §5.2 y §5.4.
5. **Igualar la guía de superserie entre superficies** (web detallada / mobile 1 línea / preview banda). Elevar mobile al menos al chip "A-N" + hint claro; considerar acortar la lista de 3 pasos del web a algo escaneable.

### P2 — Baja
6. **Guard de superserie de 1 bloque en el agrupador.** Si `run.length === 1`, degradar a `type:'single'` (defensa ante datos legacy/importados) para no pintar un card "Superserie" con un solo ejercicio.
7. **Aviso de superserie incompleta / rondas desparejas.** Señalizar cuando dentro de un grupo un ejercicio tiene menos series logueadas que su par (indicador de ronda a nivel de superserie), no solo el % global.
8. **Robustez de `order_index`.** Reindexar a contiguo en el save/reconcile (o relajar el `+1` a "orden relativo") para que huecos no degraden silenciosamente la superserie en web.

---

## Archivos clave (rutas absolutas)

- `D:\Proyectos\Antigravity\gymappjp\apps\web\src\lib\workout-block-grouping.ts` — agrupador canónico (web).
- `D:\Proyectos\Antigravity\gymappjp\apps\web\src\app\c\[coach_slug]\workout\[planId]\WorkoutExecutionClient.tsx` — ejecución alumno web (card superserie líneas 616-704, "Luego" 671-677, auto-scroll 491-500).
- `D:\Proyectos\Antigravity\gymappjp\apps\web\src\app\c\[coach_slug]\workout\[planId]\LogSetForm.tsx` — registro de serie + `startRest` post-log (110-115).
- `D:\Proyectos\Antigravity\gymappjp\apps\web\src\app\c\[coach_slug]\workout\[planId]\WorkoutTimerProvider.tsx` — un solo timer, `startRest` genérico por bloque.
- `D:\Proyectos\Antigravity\gymappjp\apps\web\src\app\c\[coach_slug]\workout\[planId]\_data\workout-execution.queries.ts` — query (trae `superset_group`).
- `D:\Proyectos\Antigravity\gymappjp\apps\mobile\app\alumno\workout\[planId].tsx` — ejecución alumno mobile (`groupSupersets` 641-652, `startRest` 419-422).
- `D:\Proyectos\Antigravity\gymappjp\apps\web\src\app\coach\clients\[clientId]\ProgramTabB7.tsx` — ficha coach (SIN superseries, 306-335).
- `D:\Proyectos\Antigravity\gymappjp\apps\web\src\services\client\client-detail.service.ts` — query ficha (trae `superset_group` sin usar, línea 137).
- `D:\Proyectos\Antigravity\gymappjp\apps\web\src\app\coach\workout-programs\components\ProgramPreviewPanel.tsx` — preview biblioteca (CON superseries, 264-289).
- `D:\Proyectos\Antigravity\gymappjp\apps\web\src\app\coach\builder\[clientId]\hooks\usePlanBuilder.ts` — asignación de letra + reglas de contigüidad/área.
- `D:\Proyectos\Antigravity\gymappjp\apps\web\src\lib\workout-offline-queue.ts` — cola offline (por serie, agnóstica).
