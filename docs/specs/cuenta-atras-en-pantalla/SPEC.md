---
status: active
owner: product-engineering
last_verified: "2026-09-10"
canonical: false
---

# SPEC — Cuenta atrás en pantalla

> Reloj embebido en la superserie, guardado automático a 0, «Fuerza por tiempo» y preferencia del alumno «pasar solo al descanso».
>
> Origen: feedback del coach **Movens** (10-09-2026, Pro pagado, 9 alumnos activos) + la feature D5 que pidió el owner el mismo día. Decisiones del owner: V1–V4 y D1–D5 (§3). Arquitectura y resoluciones del jefe: R1–R23 (§4.1) y **R24–R38** (§4.2, que mandan donde choquen). Mockup v2 aprobado (artifact `bab4d4d3` v2) para A, B, C y D; la sección F la fija R11b.
>
> Un solo tren (D1) con un **único orden de salida (R35)**: **W0 migra → W6 deploya → W6 OTA** sobre runtime 1.1.2. Plan de ejecución en [PLAN.md](PLAN.md); tareas en [TASKS.md](TASKS.md); contrato de datos ejecutable, tests y QA en [DATA-TESTING.md](DATA-TESTING.md) (mismos nombres canónicos de la carpeta `docs/specs/cuenta-atras-en-pantalla/`).

Cada regla de comportamiento de este documento está numerada **CA-nn** y redactada como criterio de aceptación verificable: si no se puede probar con un test o con un paso de QA, no es una regla de este SPEC.

---

## 1. Problema (con evidencia)

### P1 · El reloj existe, pero la superserie no lo monta

La cuenta atrás de un hold vive **solo** en la pantalla dedicada de Movilidad:

- RN: `apps/mobile/components/alumno/workout/v3/MobilityScreenV3.tsx:141` — `useCountdown(holdSec, () => finishSide(holdSec), false)` (importado de `./timing`, `:19`), con `holdSeedValues` (`:143`) y los botones «Iniciar hold» (`:289`) / «Listo este lado»–«Listo» (`:301`, `:317`).
- Web: `apps/web/src/app/c/[coach_slug]/workout/[planId]/v3/MobilityStepV3.tsx:89` — `useExecCountdown(holdSeconds, …)` (`:11`), anillo SVG con `DASH = 2 * Math.PI * 92` (`:107-108`, `:173`).

En la superserie **no hay ningún reloj**: un miembro tipado cae a la fila clásica de cajas. RN: `apps/mobile/components/alumno/workout/v3/SupersetScreenV3.tsx` monta `ActiveSetRow` con `typedMode` por miembro y `FieldBox`; web: `apps/web/src/app/c/[coach_slug]/workout/[planId]/v3/SupersetStepV3.tsx:361` despacha a `LogSetForm` (`TypedLogSetRow`) sin countdown. El alumno mira otro reloj y escribe el número a mano.

### P2 · En la web, el botón grande no arranca el reloj

En la pantalla sola de Movilidad web, el CTA grande dice **«Listo»** y el arranque es un tap sobre el anillo con un rótulo de 10 px: `MobilityStepV3.tsx:195` imprime `countdown.done ? 'Registra abajo' : 'Tocar para iniciar'`. RN ya tiene el patrón correcto (juicy «Iniciar hold» antes de arrancar, `MobilityScreenV3.tsx:270-271` lo documenta). Un alumno apurado toca «Listo», se salta el reloj y escribe el tiempo a mano.

### P3 · «Fuerza» no sabe de segundos

`REPS_UNIT_VALUES = ['reps', 'passes', 'breaths', 'jumps', 'floors']` (`packages/schemas/workout.ts:64`) y el CHECK de la DB acepta exactamente ese conjunto (`supabase/migrations/20260725221804_cardio_modality_axes.sql:54`). Para una plancha con disco o un wall sit el coach tiene que disfrazar el ejercicio de Movilidad o de Cardio, y pierde carga, RIR, tempo y progresión.

### P4 · Nada se guarda solo al llegar a 0

Hoy `finishSide` solo **siembra** las cajas (`MobilityScreenV3.tsx:120-143`); el commit lo dispara el alumno. El precedente exacto de guardado automático ya existe en cardio: `packages/workout-engine/cardio-autolog.ts` + `LogSetForm.tsx:1819-1830` (`if (cardioAutolog?.submit) formRef.current?.requestSubmit()`).

### P5 · Datos que lo prueban (STATS, LIVE 10-09, solo lectura)

| Dato | Valor |
|---|---|
| Bloques de movilidad de Movens con `duration_sec` | **32** (30 / 45 / 60 s) |
| De esos, dentro de una superserie | **21 de 32** ⇒ sin reloj en RN y en web |
| Holds registrados por sus alumnos que salieron de superseries | **29 de 32**, escritos a mano |
| Bloques roller de Movens con `duration_sec` | **0** (4 roller, todos en superserie, ninguno con duración) |
| «plancha frontal mantenida» | cargada como **Cardio 3 × 1 min**, sin carga, sin RIR, sin progresión |
| Alumnos activos | **9** · 3 con app iOS · 6 desde web/PWA o Android |
| Bloques strength en LIVE con `duration_sec > 0` y `reps_unit NULL` | **2** (legado: 600 s y 120 s) ⇒ `duration_sec` **no** sirve como señal de modo |

---

## 2. Objetivo

Que el alumno vea la cuenta atrás **donde el coach la prescribió**, que el tiempo se anote y se envíe solo, y que el coach pueda prescribir «X segundos con carga» dentro de Fuerza — sin que nadie que solo use reps note un cambio.

**Criterio de salida del tren (heredado del mockup v2, verificable en QA):**

- **CA-01** En la superserie B del plan «Dia B» de Movens el alumno toca «Iniciar hold», ve `0:30` bajar por lado, y al llegar a 0 el teléfono **vibra y avisa** (nunca «suena» — R31, CA-101), la serie queda guardada con `30 / 30` **sin escribir nada**, y la tarjeta activa pasa a «Press pallof horizontal con banda» con el aviso «¡Sigue sin detenerte!».
- **CA-02** En «Cat/Camel» (pantalla sola), al llegar a 0 la serie se guarda y **la pantalla no se mueve** hasta que el alumno toca «Descansar 30 s» o «Siguiente serie».
- **CA-03** «plancha frontal mantenida» vuelve a ser Fuerza con `3 × 30 s · 10 kg`, y el ejecutor muestra el anillo de 130 px con los tiles KG + SEG.
- **CA-04** Un coach que solo usa reps observa **0 diff** en el payload de una serie de fuerza y en el resumen de sesión (test de payload byte-idéntico, `DATA-TESTING.md`).

---

## 3. Decisiones del owner (literales de `DECISIONS.md`, no se reabren)

### 3.1 Reglas del mockup v2 (mensaje literal del owner, 10-09)

> «las cosas que tienen timer y tengan video pues no quites el video o multimedia, o sea solo haz el timer un poco más chico debajo del multimedia, y ahora deberíamos hacer que las anotaciones de tiempo sean automáticas con el timer, a esto quiero decir automático anotarla y enviarla pero NO AUTOMÁTICO PASAR AL SIGUIENTE EJERCICIO O DESCANSO, en las superseries sí debería ser automático pasar al siguiente ejercicio de superserie»

- **V1 · Video intacto.** El media del ejercicio no se colapsa ni se quita cuando corre el reloj. El reloj va DEBAJO del media, más chico (anillo ~80 px en superserie, ~130 px en fuerza por tiempo; la Movilidad sola conserva su anillo de 214 px).
- **V2 · Guardado automático.** Al llegar a 0, el tiempo se anota y se ENVÍA (se guarda el log) sin que el alumno toque nada.
- **V3 · Nada automático hacia adelante en pantalla sola.** Tras guardar, la app NO pasa sola al descanso ni al siguiente ejercicio ni a la siguiente serie. El alumno toca «Descansar N s» o «Siguiente serie».
- **V4 · Superserie sí avanza.** Dentro de una superserie, tras guardar el hold, la tarjeta activa pasa sola al siguiente miembro de la ronda.

### 3.2 Decisiones del 10-09 (AskUserQuestion, respuestas literales)

- **D1 · Alcance = «Todo en un solo tren».** Superserie + web + guardado automático + Fuerza por tiempo salen juntos: un deploy web y una OTA sobre 1.1.2.
- **D2 · Fin de ronda = «Espera el toque "Descansar"».** Cuando el hold que termina es el ÚLTIMO miembro de la ronda: guarda solo y muestra «Ronda lista · Descansar N s»; el descanso de grupo arranca cuando el alumno toca. Nunca se va solo al descanso.
- **D3 · Fuerza por tiempo = «Selector "Reps | Segundos" en Fuerza».** Mismo bloque de fuerza con `duration_sec` + `reps_unit = 'sec'`. Conserva carga, RIR, tempo, descanso, lado y progresión. Sin quinto tipo ni pantallas de tipo nuevas.
- **D4 · Progresión en modo tiempo = «+ Peso» y «+ Segundos».** El eje «reps» del código de progresión se remapea a segundos por sesión. Doble progresión apagada en modo tiempo.

### 3.3 Feature agregada por el owner el 10-09 durante el plan (mensaje literal)

> «aprovechar y cuando el alumno entra por primera vez a hacer un workout que le mandó el coach, en el primer ejercicio mostrar un modal donde le pregunta si quiere que cuando termine los ejercicios pase automático al descanso o no, y sea un toggle que puede activarlo allí o en opciones del workout routine que anda haciendo (tuerquita), esta es feature nueva»

- **D5 · Preferencia «descanso automático» del alumno (feature F).** Modal de una sola vez, en el primer ejercicio del primer entreno que el alumno ejecuta de un plan de su coach: «¿Quieres que al terminar cada serie pase solo al descanso?» con un toggle. El mismo toggle vive en la tuerca del entreno (`ExecSettingsSheet`, web y RN). Persistida por alumno. Por defecto APAGADA (regla V3). Encendida: tras aplastar una serie o tras el guardado automático a 0, el descanso arranca solo (pantalla sola y último miembro de la ronda en superserie); apagada: comportamiento V3/D2.

### 3.4 Decisiones previas que este tren hereda (no reabrir)

Mockup aprobado antes de tocar UI; la UI la implementa Fable, los workers hacen motor/datos/tests · Ejecutor V3: el primer lado del hold lo inicia el alumno (QA4 h8a); nada corre solo al abrir una pantalla; **cardio cierra la ronda solo con el CTA y NO se toca en este tren** · Un solo camino de ejecutor (V3); OTA sobre runtime 1.1.2, sin build nativa · Todo en todos los planes: ningún gate por tier.

---

## 4. Resoluciones del jefe (R1–R38)

Dos tandas. **R1–R23** (§4.1) salieron con el OUTLINE; **R24–R38** (§4.2) salieron después de los críticos y los refutadores y **mandan sobre R1–R23 donde choquen**. Cada regla de R24–R38 está aplicada en el cuerpo de este SPEC, con el CA-nn que la hace verificable.

### 4.1 R1–R23 (literales y en orden)

- **R1 · Preferencia D5 = el carril `autoTimer` existente, re-encuadrado y per-alumno (cierra G1, C3, C4).** Una sola preferencia, nombre en UI «Pasar solo al descanso». Persistencia local con dueño: `localStorage`/`AsyncStorage`, clave `eva:exec-autorest-v1:<clientId>` (valores `'1'`/`'0'`) y `eva:exec-autorest-seen-v1:<clientId>` para el modal; sin tabla ni RLS nueva (`client_feature_prefs` no admite escritura del alumno). **Default por cohorte**: (a) si existe la clave nueva → su valor; (b) si no y existe `omni_autotimer` → copiarla (migración de lectura); (c) si no hay clave y el alumno TIENE historial → ON (lo que vive hoy, cero regresión); (d) si no hay clave y es su PRIMER entreno → OFF + modal (D5 literal). La pref gobierna **solo** el arranque del cronómetro de descanso: tras «Aplastar serie» (hoy) y tras el guardado automático a 0 (nuevo), en pantalla sola y en el último miembro de la ronda. **Nunca** gobierna el avance de paso ni el avance de miembro (V4). Con la pref OFF **no se cancela** un descanso que el alumno arrancó a mano (cambio chico, se declara). El lector `isRestAutoTimerEnabled()` se reemplaza por `readAutoRestPref(clientId, cohort)` en los 4 puntos (RN `ExecutorV3.tsx:762`, `:822`; web `LogSetForm.tsx:662`, `:2034`). **Corrección obligatoria con el código (§11.1): en la web `isRestAutoTimerEnabled` no existe (0 hits) y `:662`/`:2034` solo consumen la prop `autoTimerEnabled`; los puntos reales son 3 (2 en RN + el estado de `WorkoutExecutionClient.tsx:1222-1227`), y las etiquetas fuerza/tipada van invertidas respecto del borrador.**
- **R2 · Columna y payload de fuerza por tiempo (cierra G2, C1).** `actual_hold_sec` = segundos sostenidos (suma L+R en `per_side`), `reps_done = NULL` (nunca 0), `actual_duration_sec = NULL`, `weight_kg` del tile (`null` = peso corporal), `rpe`/`rir`/`note` como fuerza. Nueva `buildStrengthTimePayload(values, blockId, setNumber, {sideMode, holdSource})` en `set-log-payload.ts`; `buildStrengthPayload` **no se toca**. Keys del keypad: `weight`, `actual_hold_sec`, `hold_left_sec`, `hold_right_sec`, `rpe`, `rir`. Tile de unidad «SEG».
- **R3 · Predicado único del modo tiempo (cierra G3, C2).** `isStrengthTimeBlock(block, exercise) := effectiveExerciseType(...) === 'strength' && block.reps_unit === 'sec' && (block.duration_sec ?? 0) > 0`, exportado de `packages/workout-engine/workout-exercise-type.ts`; la copia web `apps/web/src/lib/workout-exercise-type.ts` **re-exporta** del motor (colapsar `hasTypedPrescription`/`typedBlockSummary`). `reps_value` **NO** se escribe como espejo (sin evidencia de consumidores). `reps` (NOT NULL legacy) = `compactDuration(duration_sec)` + sufijo de lado (`"30s"`, `"30s/lado"`). Test que congela H8: `{duration_sec: 600, reps_unit: null}` ⇒ `false`.
- **R4 · Migraciones y orden (cierra G4, C11; refuta A5).** Dos migraciones aditivas, misma wave: (1) recrear `workout_blocks_poly_check` con `'sec'` en `reps_unit` — el writer copia la definición vigente desde LIVE con `pg_get_constraintdef` (nunca de memoria) y documenta rollback; (2) `CREATE OR REPLACE FUNCTION public.get_client_exercise_prs` con `AND wl.reps_done IS NOT NULL AND wl.reps_done > 0`. Más el fix cliente `apps/web/src/app/api/pr-card/route.tsx:79-85` (`.gt('reps_done', 0)`). **Orden obligatorio, precisado por R35: las dos migraciones se aplican en LIVE en W0** (son aditivas y ningún cliente viejo escribe `'sec'`), el código que escribe `'sec'` sale en W6 ⇒ **W0 migra → W6 deploya → W6 OTA**. D1 sigue siendo un tren (3 artefactos). Protocolo LIVE: tx-rollback primero (regla del owner), luego aplicar.
- **R5 · Auto-avance de PASO se mantiene como hoy (cierra G5).** V3 gobierna el descanso y la serie siguiente, no el salto de paso a los ~350 ms al cerrar la última serie de un bloque (RN `ExecutorV3.tsx:1798-1811`, web `WorkoutExecutionClient.tsx:1967-1973`). Se declara como interpretación.
- **R6 · Vencimiento en background (cierra G6, C6).** `useCountdown`/`useExecCountdown` ganan la señal de vencimiento fuera de foco (RN `timing.ts:74-82`; web `useExecCountdown.ts:86-99` con `visibilitychange`), **más `endAtMs` y `prime(seconds)` (R27, CA-08e)**. **Precisión obligatoria de R27 (§6.3): el campo del contrato se llama `expiredWhileAway` —reemplaza a `viaAppState`, que no se usa en ningún nombre de este tren salvo la prop de PostHog `via_app_state` (CA-08d)— y se DERIVA de la evidencia (`endAtMs` + estado de la app), nunca de quién disparó el fin.** Si el lado terminó en background: se guarda **el objetivo** (`prescribedSec`), `hold_source='timer'`, y el lado 2 **NO arranca solo**: queda en «Iniciar lado derecho». Si terminó en foreground: lado 2 arranca solo (como hoy, A1). Copy honesto en el SPEC: «si estabas fuera de la app, se guarda al volver».
- **R7 · Edición del hold por lado entra al tren (cierra G7).** `openSet` pasa `sideMode` al `typedCtx` y siembra `hold_left_sec`/`hold_right_sec` desde `metadata` (RN `ExecutorV3.tsx:556-586`; espejo web en el sheet «Editar»). Toda edición manual reescribe `metadata.hold_source='manual'` junto con los lados (el UPDATE reemplaza el jsonb entero).
- **R8 · Visibilidad de la fila de captura (cierra G8, C8).** Superserie: **sin arrancar** → módulo + fila de cajas (camino manual de hoy, sigue existiendo); **corriendo** → solo módulo (mockup) — **en `paused` las cajas vuelven a verse (DECISIONS-2, CA-92b) y ocultar nunca es desmontar (R26, CA-92)**; **guardado** → tarjeta del miembro «hecho» con «⏱ 30 s / 30 s», tap = editar. Pantalla sola: la fila de captura sigue **siempre visible** (QA4 h8b) debajo del módulo; corriendo se deshabilita, no se oculta.
- **R9 · Estado «ronda lista» (cierra G9).** `pendingRoundRest: { groupId, round, seconds } | null` en el orquestador (RN `ExecutorV3`, web `WorkoutExecutionClient`), nunca en la fila. Se limpia en: nuevo commit de cualquier miembro, cambio de paso, omitir bloque, finalizar entreno. Tocar «Ronda lista · Descansar N s» llama al mismo `startRest(secs, {countKind:'ronda', setIndex, setTotal})` de hoy **en RN**; **en la web no existe `countKind` y el rótulo «Ronda N de M» viaja en `label` (R28, CA-42b)**. **R28 amplía la forma del estado: lleva el `RestRoundContext` completo, calculado en el commit y guardado antes del reset de `restRoundContextRef` (CA-40b).** Con pref D5 ON, el orquestador llama `startRest` solo, sin CTA.
- **R10 · Mockup de D5 (cierra G10).** El artifact del plan (jefe) incluye la sección F: modal de primera vez y fila de la tuerca, RN y web, con los copys de R11b. Se aprueba junto con el plan; W5 no arranca sin ese OK.
- **R11 · Copys y validez del builder: manda el mockup (cierra G11, C10, C12).** Grupo «Prescripción», segmented «Reps | Segundos», campo «Segundos por serie *» (placeholder «Ej. 30», hint «el alumno ve la cuenta atrás»), rango **5–600 s** como validación dura (UI + Zod `superRefine` cuando `reps_unit==='sec'`), hint de RIR «cuántos segundos quedan en el tanque», progresión «Ninguna | Peso | Segundos» (RN) / «+ Peso | + Segundos» (web), chip de lista «Por tiempo», resumen de prescripción `3 × 30 s · 10 kg`, línea de log `10 kg × 30 s` (y `10 kg × 30 s por lado`). Convención tipográfica: `30s` (sin espacio) solo en chips ≤ 20 chars vía `compactDuration`; `30 s` en líneas largas. Ficha del coach: META deja de asumir `isTyped = kind !== 'strength'`.
- **R11b · Copys de D5 (r7 §7, aprobados por el jefe).** Modal: título «¿Pasamos solo al descanso?», cuerpo «Cuando termines una serie, podemos arrancar tu descanso automáticamente. Si prefieres, lo arrancas tú con el botón.», toggle «Pasar solo al descanso» (ON: «El descanso empieza solo al terminar cada serie.» / OFF: «Tú decides cuándo empieza el descanso.»), CTA «Listo», pie «Puedes cambiarlo cuando quieras en los ajustes del entrenamiento (⚙).». Fila de la tuerca: «Pasar solo al descanso» con los mismos sublabels (reemplaza «Cronómetro automático»). CTAs post-guardado: «Descansar 90 s» (segundos reales) / «Siguiente serie»; fin de ronda «Ronda lista · Descansar 90 s»; anillo «¡Listo!» + chip «Guardado · 30 s».
- **R12 · Roller fuera del tren (cierra G12, C9).** RN usa cronómetro ascendente y la web no tiene countdown: es trabajo nuevo, Movens tiene 0 roller con duración. `HoldModuleV3` nace con `kind: 'mobility' | 'strength_time'` y deja `'roller'` documentado como extensión. Se declara en «Fuera de alcance».
- **R13 · `holdAnchor` fuera; pérdida declarada (cierra G13).** Si el SO mata el proceso, el hold en curso se pierde y el alumno lo reinicia (copy del SPEC). `logged_at` tardío: el writer de DATA-TESTING audita `day-completion`/racha con Grep y declara el caso «vuelve después de medianoche» como aceptado.
- **R14 · Señal de primer entreno y exclusiones (cierra G14, C5).** `esPrimerEntreno = previousHistory vacío && exerciseMaxes vacío && sessionLogs.length === 0` (todo en el bundle, 0 queries). Marca «visto» se escribe **al responder** (o al cerrar sin responder → marca + OFF). Web: `WorkoutExecutionClient` recibe `clientId={rootUser.id}` desde `page.tsx:75-94`. Demo: sumar `is_demo` al select del bundle (web `workout-execution.queries.ts`, RN `lib/client.ts:17`) y **no mostrar** el modal si `is_demo`; fallback si no llega: confiar en el historial. Storage inaccesible → no mostrar (fail-safe). El resolver es una función **pura** con test.
- **R15 · Paridad del payload web (cierra G15, C7).** Web: `holdPrefill` gana `submit` + `source`; `LogSetForm` acepta `actual_hold_sec` como serie válida en fuerza tiempo (guard `w==null && r==null` → `w==null && r==null && hold==null`); la `key` del form incluye el eje tiempo; el writer lee `LogSetForm.tsx:800-915` y documenta la rama `formData.delete('metadata')`; cola offline web de fuerza gana `actualHoldSec` + `metadata`. Test de paridad: `buildStrengthTimePayload` (RN) vs objeto que la web manda a `logSetAction` para el caso canónico (bilateral y per_side).
- **R16 · Ficha del coach y mapa muscular (cierra G16).** Formato R11. Un hold de fuerza **sí** enciende el mapa muscular (`session-summary.ts:201-235`, ~8 líneas + 1 test): una plancha con disco trabaja core; coherente con movilidad.
- **R17 · Tests y baseline (cierra G17).** Crear `packages/workout-engine/superset-rounds.test.ts`; tabla de baseline de CI («rojo antes del tren / rojo esperado después»: `nutrition-smoke`, `profile-analytics/overview.test.ts` nocturno); checklist del owner ≥ 12 puntos × 3 plataformas; persona/seed Playwright del caso canónico ampliando `seed:e2e-personas`.
- **R18 · Aviso, sonido, háptica (cierra G18).** Entra: háptica en foreground a 0; notificación local «Terminó tu hold» **solo si ya hay permiso** (id `eva-hold-end`, `data.type='hold-end'`, cancelar en los últimos 2 s como `useRestTimerEngine.ts:270`). No entra: sonido (sin QA de device), pedir permiso antes, Live Activity (build). Copiar al SPEC la lista «no prometer» de s2 §4 recortada (1, 2, 3, 4, 5, 7, 9, 11).
- **R19 · Observabilidad (cierra G19).** Eventos: `hold_timer_started {block_id, exercise_type, context, side_mode}`, `hold_timer_completed {block_id, exercise_type, context, hold_source, closes_round, via_app_state}`, `hold_early_finished {block_id, exercise_type, context, elapsed_sec, prescribed_sec}`, `rest_autostart_pref_set {source: 'first_modal'|'settings_sheet', enabled}`. Se elimina `hold_auto_saved`. Adopción a 72 h: `SELECT metadata->>'hold_source', count(*) FROM workout_logs WHERE logged_at >= <deploy> AND actual_hold_sec IS NOT NULL GROUP BY 1`. Sentry: `captureException(err, {tags:{area:'hold-autolog'}})` en el camino de auto-envío, web y RN. Umbral de alarma: > 2 % de auto-envíos con error en 72 h.
- **R20 · Waves y presupuesto (cierra G20).** Orden duro: W0 → W1 → (W2 ‖ W3 ‖ W4) → W5 → W6. Migraciones en W0, antes del deploy y de la OTA de W6 (R35). **Presupuesto vigente: ≈ 12 días-agente (R38, que reemplaza los ≈ 11 de este R20).** (Detalle en [PLAN.md](PLAN.md).)
- **R21 · A1 confirmado.** Arranque manual del primer lado en superserie y pantalla sola («Iniciar hold» / «Iniciar serie»); lado 2 auto según R6.
- **R22 · A2 confirmado.** «Listo» antes de 0 guarda `elapsed` (≥ 1 s; con 0 s no envía), `hold_source='manual'`, mismo flujo posterior. Con «Listo» en el lado izquierdo per_side: guarda el lado y pasa al derecho (que arranca solo, R6 foreground).
- **R23 · CueBar sin gesto (cierra r2 G8).** Con V4 el CueBar («¡Sigue sin detenerte!») se dispara sin toque; duración sube de 1650 ms a **2400 ms** solo cuando el origen es `timer`; el marquee «CONTINÚA SIN DESCANSO» se mantiene.

### 4.2 R24–R38 (posteriores a los críticos; mandan sobre §4.1)

| # | Qué decide | Dónde vive en este SPEC |
|---|---|---|
| **R24** | CTA **«Descansar N s» / «Siguiente serie»** en **todas** las pantallas con la pref OFF (fuerza clásica, movilidad, fuerza por tiempo y último miembro de la ronda). Hoy no existe ningún botón manual de descanso en V3. Tareas `[UI · Fable]` nuevas en W3 y W4 (**+0,25 d-a cada una**) + punto de QA. **CA-80 se reescribe sobre este camino.** | **CA-95**, **CA-80**, §11.2 |
| **R25** | Default de la pref como **constante única** `AUTOREST_DEFAULT_STRATEGY = 'cohort'` en `auto-rest-pref.ts` (RN y web), pasada como `strategy: 'cohort' \| 'off'` a `resolveAutoRestDefault`. Divergencia con la letra de D5 declarada, con su pregunta Q1 al owner | **CA-70b**, §11.1 |
| **R26** | **Invariante de montaje**: la fila del miembro activo nunca se desmonta mientras el módulo esté montado (web `hidden` + `inert`; RN `display:'none'`) | **CA-92**, §9.1 |
| **R27** | `expiredWhileAway` **reemplaza** a `viaAppState` en el contrato, en los hooks y en los tests; el hook gana **`prime(seconds)`** (arma el reloj en `idle` sin arrancarlo) | **CA-08b**, **CA-08c**, **CA-08e**, §6.3 |
| **R28** | `pendingRoundRest` lleva el **`RestRoundContext`** completo, armado en el commit y guardado **antes** del reset de `restRoundContextRef`; en la web **no hay `countKind`**: el rótulo va en `label` | **CA-40b**, **CA-42b**, §11.2 |
| **R29** | El módulo se monta **solo si hay reloj que montar**: `duration_sec > 0` (movilidad) o `isStrengthTimeBlock` (fuerza). Sin duración, la fila manual de hoy queda tal cual. «Listo» desde `idle` conserva el comportamiento de hoy | **CA-97**, **CA-90**, §9.1 |
| **R30** | **«seg/ses»** en las 5 superficies que hoy imprimen «rep/ses» cuando `isStrengthTimeBlock`; la progresión por segundos sigue siendo cartel, sin motor | **CA-62b**, §9.5 |
| **R31** | El criterio de salida dice **«vibra y avisa»**, nunca «suena»; la notificación copia las **4 reglas del fix QA-10**; se suman a «Qué NO se promete» los ítems **6** y **8** de `research/s2 §4` y el de **keep-awake** | §12, **CA-96**, §18 punto 5 |
| **R32** | El **modal D5** se muestra en el primer ejercicio **después** de que el overlay del Despegue se retira, **sin importar** si el bloque tiene descanso; `clientId` nulo ⇒ sin modal; `is_demo` se lee en el **fetch raíz** del alumno | **CA-67**, **CA-72**, **CA-93** |
| **R33** | CSS: `.exec-v3-holdwrap` / `.exec-v3-holdnum` son de `CardioStepV3` y **no se tocan**; el módulo usa **`.exec-v3-holdmod`** con `--exec-hold-size` (80/130/214) | **CA-99**, §9.2 |
| **R34** | Lados de un hold: regla única **`holdSidesFor(sideMode)`** — `per_side` ⇒ `['left','right']`; `alternating` y `null` ⇒ `['single']` | **CA-91**, §8.2 |
| **R35** | Las dos migraciones se aplican en **W0**, no en W6: **W0 migra → W6 deploya → W6 OTA**. M2 cambia récords ya listados y se menciona en el **aviso general a coaches** del cierre, junto con el cambio de W5.3 | **CA-26b**, R4 de §4.1 |
| **R36** | `readAutoRestPref` es **síncrona con caché hidratada una vez** (disciplina de `rest-timer-preferences.ts`); en la web la verdad vive en `WorkoutExecutionClient`, no en `LogSetForm` | **CA-70c**, §11.1 |
| **R37** | Fuerza por tiempo `per_side` en la web: **rama propia** en `StrengthLogSetForm`, sin `buildStrengthPayload` ni `formData.delete('metadata')`. Tarea de **código** en W4 | **CA-98**, §9.4 |
| **R38** | Presupuesto: **≈ 12 días-agente**. Orden de recorte: notificación del SO (W3) → mapa muscular (R16) → Playwright del caso canónico | R20 de §4.1, [PLAN.md](PLAN.md) |

---

## 5. Modelo de dominio

| Entidad | Definición vigente en este tren |
|---|---|
| **Bloque de fuerza por tiempo** | `workout_blocks` con tipo efectivo `'strength'`, `reps_unit = 'sec'`, `duration_sec ∈ [5,600]`, `reps = compactDuration(...)+sufijo`, `sets ≥ 1`. Conserva `target_weight_kg`, `rir`, `tempo`, `rest_time`, `warmup_rest_time`, `side_mode`, `superset_group`, `section`. `progression_type ∈ {null,'weight','reps'}` donde `'reps'` = «+ Segundos»; `progression_mode` nunca `'double'`. `distance_*`, `hr_zone`, `target_pace_sec_per_km`, `interval_config`, `load_*` = `NULL`. |
| **Log de hold** (movilidad y fuerza por tiempo) | `actual_hold_sec` (L+R en `per_side`), `reps_done NULL`, `metadata: { left_sec?, right_sec?, hold_source: 'timer'\|'manual' }`. Sin `hold_source` = registro anterior al tren (desconocido, **nunca** «manual»). |
| **Preferencia D5** | `autoRest: boolean` per-alumno, local, con default por cohorte (R1). `seen: boolean` per-alumno. |
| **Módulo de hold** | Máquina de estados por serie activa (§7). Un solo componente `HoldModuleV3` con `kind ∈ {'mobility','strength_time'}` y `size ∈ {'ss','solo130','solo214'}`. **Se monta solo si hay reloj que montar**: `duration_sec > 0` (movilidad) o `isStrengthTimeBlock` (fuerza) — R29, CA-97. |
| **Ronda de superserie** | `isRoundComplete(members, round, logs, extraLoggedBlockId?)` (`packages/workout-engine/superset-rounds.ts:48`) **sin diff** + estado nuevo `pendingRoundRest: { groupId, round, totalRounds, seconds, label, roundContext } \| null` (R9 ampliado, **CA-40b**). |

---

## 6. Reglas del motor (pseudocódigo canónico)

### 6.1 Contrato puro (copiado de OUTLINE §4; vive en `packages/workout-engine/hold-autolog.ts`)

```
// packages/workout-engine/hold-autolog.ts (PURO)
HoldEndReason = 'expired' | 'done-early' | 'paused' | 'restart'
decideHoldAutolog({ reason, elapsedSec, prescribedSec, side: 'single'|'left'|'right', context: 'solo'|'superset',
                    closesRound, expiredWhileAway }) → {   // ← R6 precisado: evidencia, no emisor (§6.3)
  fillSeconds: number|null,           // expired ⇒ prescribedSec; done-early ⇒ min(elapsed, prescribed); paused ⇒ elapsed; restart ⇒ null
  submit: boolean,                    // true si (expired|done-early) y side ∈ {single,right}; false en left, paused, restart, elapsed<=0
  holdSource: 'timer'|'manual'|null,  // expired ⇒ 'timer'; done-early ⇒ 'manual'; resto null
  advanceSide: boolean,               // side==='left' && reason∈{expired,done-early}
  autoStartNextSide: boolean,         // advanceSide && !expiredWhileAway (R6, §6.3)
  advance: 'next-member'|'stay',      // superset && submit && !closesRound ⇒ 'next-member' (V4); resto 'stay' (V3, D2)
}
// El motor NUNCA arranca descansos. La UI decide: pref D5 ON ⇒ startRest; OFF ⇒ CTA «Descansar N s» / «Ronda lista · Descansar N s».
```

- **CA-05** `decideHoldAutolog` es una función pura, sin React ni RN, con test unitario en `packages/workout-engine/`; ninguna plataforma duplica la regla.
- **CA-06** El motor **nunca** llama `startRest` ni `cancelRest`: no importa `TimerProvider` ni ningún hook.

### 6.2 Tabla de decisión (r3 §2.3, alineada a R2, R6 y R22)

| `reason` | `context` | `side` | `closesRound` | `fillSeconds` | `submit` | `holdSource` | `advance` | `autoStartNextSide` |
|---|---|---|---|---|---|---|---|---|
| `expired` | solo | `single` / `right` | — | `prescribedSec` (R6) | **true** | `timer` | `stay` (V3) | — |
| `expired` | solo | `left` | — | `prescribedSec` (R6) | **false** ¹ | `timer` ² | `stay` | `!expiredWhileAway` (R6, §6.3) |
| `expired` | superset | `single` / `right` | `false` | `prescribedSec` | **true** | `timer` | **`next-member`** (V4) | — |
| `expired` | superset | `single` / `right` | **`true`** | `prescribedSec` | **true** | `timer` | **`stay`** ⇒ «Ronda lista · Descansar N s» (**D2**) | — |
| `expired` | superset | `left` | — | `prescribedSec` | **false** ¹ | `timer` ² | `stay` | `!expiredWhileAway` (R6, §6.3) |
| `done-early` | cualquiera | `single` / `right` | según fila `expired` | `min(elapsed, prescribed)` (R22) | **true** si `elapsed ≥ 1` | **`manual`** | igual que la fila `expired` correspondiente | — |
| `done-early` | cualquiera | `left` | — | `min(elapsed, prescribed)` | **false** ¹ | `manual` ² | `stay` | **true** (R22: el lado derecho arranca solo en foreground) |
| `paused` | cualquiera | — | — | `elapsed` | **false** | `null` | `stay` | — |
| `restart` | cualquiera | — | — | `null` | **false** | `null` | `stay` | — |
| cualquiera con `elapsed <= 0` | — | — | — | `null` ³ | **false** | `null` | `stay` | — |

¹ En `per_side` el lado izquierdo **no envía**: acumula en `metadata.left_sec` y la serie se guarda **una sola vez** al cerrar el lado derecho, con `actual_hold_sec = L + R` (mismo contrato que movilidad hoy, `packages/workout-engine/set-log-payload.ts:121-130`). Una serie por ronda; el índice único no admite dos.
² El `holdSource` del lado izquierdo se **arrastra** hasta el envío: si cualquiera de los dos lados fue `manual`, la serie se guarda con `hold_source = 'manual'` (regla conservadora: el reloj no se acredita un valor que el alumno cortó).

³ `elapsed <= 0` cubre el «Listo» pulsado desde `running`/`paused` sin tiempo medible (R22: con 0 s no envía). **No** cubre el «Listo» desde `idle`, que es un camino aparte y NO pasa por el motor: siembra el objetivo en la fila sin enviar (**CA-90**, §7).

- **CA-07** `advance` es una **recomendación** del motor; el descanso lo dispara la UI (§11.2), nunca el motor.
- **CA-08** Con `expiredWhileAway = true` en el lado izquierdo, la UI muestra «Iniciar lado derecho» y **no** arranca el lado 2 (R6). Con `expiredWhileAway = false`, el lado 2 arranca solo (paridad con `MobilityScreenV3.tsx:141` de hoy). La señal se deriva según **§6.3**: **nunca** se toma de quién disparó el fin.
- **CA-09** Un `restart` no borra lo ya guardado: la serie enviada sigue en `sessionLogs` y el módulo vuelve a `idle` (§7).

### 6.3 `expiredWhileAway` — derivación por evidencia (precisión obligatoria de R6)

`expiredWhileAway` **no** se deduce de quién disparó el fin. Los dos caminos a `triggerDone` compiten y **gana el primero**:

- **RN**: el tick del intervalo (`apps/mobile/components/alumno/workout/v3/timing.ts:63-68`) y el listener de `AppState` (`:73-79`) llaman al mismo `triggerDone` de disparo único (`:50-56`). Al desbloquear el teléfono, el intervalo pendiente puede correr **antes** del evento de `AppState`.
- **Web**: el `setInterval` de `useExecCountdown.ts:71-83` **no se congela** en pestaña oculta, se *throttlea*; el `visibilitychange` (`:89-99`) llega después.

En los dos casos, leer la señal del emisor daría `expiredWhileAway = false` con la app fuera de foco: el lado 2 arrancaría solo con el alumno lejos y V2 escribiría **datos falsos**.

**Regla canónica** — evaluada dentro de `triggerDone`, con el fin absoluto que ya existe (RN `timing.ts:61`; web `useExecCountdown.ts:73`):

```
expiredWhileAway :=
     (Date.now() - endAtMs) > 1500                  // el fin quedó atrás más de un tick largo
  || AppState.currentState !== 'active'             // RN
  || document.visibilityState !== 'visible'         // web
```

- **CA-08b** El campo del contrato se llama `expiredWhileAway` y **reemplaza** a `viaAppState` en `decideHoldAutolog`; el hook lo expone junto a `endAtMs`.
- **CA-08c** El test `W1.T1` (`DATA-TESTING.md` §6.1, casos 5–6) prueba **los dos caminos de disparo** con reloj falso — tick primero y evento primero — y exige el **mismo** resultado: `expiredWhileAway = true`, `autoStartNextSide = false`, `fillSeconds = prescribedSec`.
- **CA-08d** El evento PostHog conserva el nombre de prop `via_app_state` (R19, §15.1) y transporta el valor de `expiredWhileAway`. Es la **única** aparición de `viaAppState`/`via_app_state` en todo el tren: en el contrato, en los hooks, en los tests y en la UI el nombre es `expiredWhileAway`.
- **CA-08e · `prime(seconds)` en los dos hooks (R27).** Hoy `restart()` **siempre arranca** el reloj (RN `apps/mobile/components/alumno/workout/v3/timing.ts:88-96` hace `setStarted(true); setRunning(true)`; web `apps/web/src/app/c/[coach_slug]/workout/[planId]/v3/useExecCountdown.ts:30-32` lo documenta como «reinicia a `seconds` y arranca»). Con eso no hay forma de dejar el lado derecho **armado y quieto** cuando el izquierdo venció fuera de foco (CA-08): la única salida sería no re-sembrar el objetivo o arrancar igual, que es justo el dato falso que R6 evita. Regla: los dos hooks ganan `prime(seconds)`, que fija el objetivo y el remanente y deja el estado en **`idle`** (`started = false`, `running = false`, sin `endAtMs`); `restart()` **no cambia de semántica**. Lo consumen `use-hold-module` (RN) y su espejo web para el paso `sideDone(left) → running(der)` cuando `expiredWhileAway = true`, y para el reset de CA-21. Caso obligatorio en el test del hook: tras `prime(30)` el remanente es 30, `started === false` y ningún tick corre.

### 6.4 Reglas fijas (invariantes del guardado)

- **CA-10 · Idempotencia.** La clave de una serie es `(client_id, block_id, set_number, día-Santiago)` — índice único `workout_logs_one_set_per_day` (`supabase/migrations/20260707120000_workout_logs_unique_set_per_day.sql:62`). Un doble disparo del reloj **sobreescribe la misma fila**; nunca crea una serie fantasma.
- **CA-11 · Anti-doble-envío local.** Además del índice único, cada superficie mantiene un `savedRef` por `block:set:side` (patrón `sentSetsRef` de cardio) para que un re-render, un `visibilitychange` o un `restart` no disparen dos submits.
- **CA-12 · El avance de miembro se aplica tras el optimismo local (síncrono), nunca tras el `await` de red** — misma disciplina que la decisión de descanso de hoy (`apps/mobile/components/alumno/workout/v3/ExecutorV3.tsx:748-754`, comentario «Decisión de descanso — SÍNCRONA, ANTES del await de red»).
- **CA-13 · Una fila por serie en `per_side`**: `actual_hold_sec = L + R`, lados en `metadata`, `hold_source` en el **mismo** objeto jsonb (el UPDATE reemplaza el jsonb entero).
- **CA-14 · Cardio no se toca.** Ningún cambio de este tren entra en `cardio-autolog.ts`, `CardioScreenV3` ni `CardioStepV3`; la ronda de cardio se sigue cerrando solo con el CTA.

---

## 7. Estados del módulo de hold (máquina de estados)

```
              ┌───────── restart ─────────┐
              ▼                           │
   ┌────────────────┐  «Iniciar hold» ┌───────────┐  «Pausar»   ┌──────────┐
   │      idle      │ ───────────────►│  running  │◄───────────►│  paused  │
   └────────────────┘                 └───────────┘  «Reanudar»  └──────────┘
                                         │      │                    │
              reloj a 0 (expired)        │      │ «Listo» (done-early, elapsed ≥ 1 s)
              side = left ───────────────┘      └──────────┬────────┘
                       ▼                                   ▼
                 ┌────────────┐  auto si !expiredWhileAway  ┌──────────────┐
                 │ sideDone   │ ──────────────────────────► │ running(der) │
                 │  (left)    │  manual si expiredWhileAway └──────────────┘
                 └────────────┘                                │
                                                               ▼
                                                        ┌─────────────┐
                                                        │    done     │  (serie enviada)
                                                        └─────────────┘
```

| Estado | Qué se ve | Qué se puede hacer | Reglas |
|---|---|---|---|
| `idle` | Anillo lleno con el objetivo (`0:30`), sidepill del lado | «Iniciar hold» (juicy; **«Iniciar serie»** en fuerza por tiempo, CA-50b) · «Listo» (secundario, **siembra sin enviar**, CA-90) | **CA-15** Nada arranca solo al montar el módulo (R21, decisión previa «nada corre solo al abrir una pantalla»). El módulo solo existe si hay duración prescrita (CA-97). |
| `running` | Anillo bajando, sidepill, pie «luego: lado derecho · arranca solo» | «Pausar» (secundario) · «Listo este lado»/«Listo» (juicy) | **CA-16** El tick es `endTime`-based y se reconstruye al volver del background: el reloj no «cuenta» con la app cerrada, se recalcula. |
| `paused` | Anillo detenido | «Reanudar» · «Listo» | **CA-17** Pausar **no** guarda ni envía (`submit=false`). |
| `sideDone(left)` | Chip del lado izquierdo con sus segundos | auto → `running(right)` si el fin fue en foreground; si no, el reloj queda **armado y quieto** con `prime(prescribedSec)` (CA-08e) y el botón «Iniciar lado derecho» | **CA-18** El lado izquierdo **no** envía la serie. |
| `done` | Anillo «¡Listo!» + chip «Guardado · 30 s» | con la pref OFF, «Descansar N s» / «Siguiente serie» en pantalla sola y «Ronda lista · Descansar N s» si el hold cerró la ronda (R24, CA-95); avance automático de miembro si la ronda sigue abierta (V4) | **CA-19** Al entrar en `done` la serie ya viajó (o está encolada offline). |
| `restart` | vuelve a `idle` | — | **CA-20** `restart` **no** borra lo guardado: reabre el módulo para volver a medir la misma serie, y un nuevo envío sobreescribe la fila (CA-10). |

- **CA-90 · «Listo» desde `idle` siembra, no envía (atajo del alumno que cronometró con su reloj).** Hoy `MobilityScreenV3.tsx:302` y `:311` hacen `finishSide(Math.max(0, holdSec - remaining) || holdSec)`: sin arrancar el reloj, `remaining === holdSec` ⇒ el `|| holdSec` **siembra los segundos prescritos** en la fila de captura. Ese camino **se conserva** en RN y web: desde `idle`, «Listo» escribe `prescribedSec` en la fila (por lado si corresponde) y **no** envía; el alumno confirma con el CTA de la fila y la serie se guarda con `hold_source = 'manual'`. La regla `elapsed ≥ 1 s` de R22 aplica **solo** desde `running`/`paused`. Sin esta regla, R22 («con 0 s no envía») dejaría el CTA como un no-op silencioso, sin siembra ni mensaje. **Punto de QA:** «"Listo" sin arrancar deja el 30 escrito en la caja».
- **CA-21** El módulo se resetea a `idle` cuando cambia el miembro activo **o** la ronda (superserie) y cuando cambia la serie activa (pantalla sola).
- **CA-22** Mientras corre el descanso de grupo (interstitial montado), el módulo no cuenta: no compite con el descanso.

---

## 8. Contrato de datos

### 8.1 Bloque de fuerza por tiempo (`workout_blocks`)

| Columna | Modo **Segundos** | Modo **Reps** (hoy) |
|---|---|---|
| `exercise_type_override` | `NULL`, o `'strength'` si el ejercicio del catálogo es de otro tipo | idem |
| **`reps_unit`** | **`'sec'`** ← señal canónica y única del modo | `NULL` |
| **`duration_sec`** | entero **5–600** (R11) | `NULL` |
| **`reps`** (NOT NULL legacy) | `compactDuration(duration_sec)` + sufijo de lado ⇒ `"30s"`, `"30s/lado"` | texto del coach (`"8-12"`) |
| `reps_value` | **`NULL`** — R3: no se escribe espejo | `NULL` |
| `sets` | series del hold, ≥ 1 | idem |
| `target_weight_kg`, `rir`, `tempo`, `rest_time`, `warmup_rest_time`, `notes`, `instructions`, `side_mode`, `superset_group`, `section` | **se conservan** (D3) | idem |
| `progression_type` | `'weight'` («+ Peso») o `'reps'` («+ Segundos», D4) | idem |
| `progression_mode` | **nunca `'double'`** — el toggle a Segundos lo baja a `'weekly_linear'` | libre |
| `distance_value/unit`, `hr_zone`, `target_pace_sec_per_km`, `interval_config`, `load_value`, `load_unit` | **`NULL`** | `NULL` |

- **CA-23** `reps_unit = 'sec'` exige la migración aditiva del CHECK `workout_blocks_poly_check` (hoy `reps|passes|breaths|jumps|floors`, `supabase/migrations/20260725221804_cardio_modality_axes.sql:54`) y el enum Zod `REPS_UNIT_VALUES` (`packages/schemas/workout.ts:64`). Sin las dos, el bloque rebota antes de llegar a la DB. **0 filas se backfillean.**
- **CA-24** Validación dura 5–600 s en UI **y** en Zod (`superRefine` cuando `reps_unit === 'sec'`); fuera de rango ⇒ el bloque no guarda y el botón dice «Datos incompletos».

### 8.2 Log de hold (`workout_logs`)

| Columna | Bilateral (incluye **`alternating`**, CA-91) | `per_side` |
|---|---|---|
| `weight_kg` | KG del tile (`null` = peso corporal) | mismo KG para los dos lados |
| **`reps_done`** | **`NULL`** — nunca `0` | **`NULL`** |
| **`actual_hold_sec`** | segundos sostenidos (entero) | **suma L + R** |
| `actual_duration_sec` | **`NULL`** (es el eje de cardio/roller; usarlo metería el hold en `totalCardioDurationSec`, `packages/workout-engine/session-summary.ts:251`) | `NULL` |
| `rpe` / `rir` / `note` | como cualquier serie de fuerza | idem |
| **`metadata`** | `{ "hold_source": "timer" \| "manual" }` | `{ "left_sec": n, "right_sec": n, "hold_source": "timer" \| "manual" }` |

- **CA-91 · Una sola regla de lados para el eje hold: `holdSidesFor(sideMode)`.** Hoy `alternating` se captura **distinto por plataforma**: movilidad lo trata como bilateral (`packages/workout-engine/set-log-payload.ts:122` mira solo `sideMode === 'per_side'`; `apps/mobile/components/alumno/workout/v3/typed-screen-model.ts:146-148` ⇒ `['single']`), y fuerza/web lo tratan por lado (`set-log-payload.ts:260`, `LogSetForm.tsx:357`). Si el SDD manda a la vez «reusar la rama de movilidad» y «`per_side`/`alternating` ⇒ dos lados», RN pediría un lado y la web dos, sobre la **misma** serie. **Regla única de este tren: solo `per_side` captura dos lados**; `alternating` se captura **bilateral**, igual que movilidad hoy. Se expresa como un helper del motor, `holdSidesFor(sideMode): ('single'|'left'|'right')[]` (`packages/workout-engine/`), consumido por `buildStrengthTimePayload`, el `keypad-flow` de fuerza por tiempo y el hook `use-hold-module`. Divergencia declarada: `buildStrengthPayload` sigue tratando `alternating` por lado en el eje reps (`set-log-payload.ts:260`) y **no se toca** (CA-04). Casos obligatorios: `alternating` en la tabla de payloads de `DATA-TESTING.md` §5.4 y en el test `W1.T2`.
- **CA-25** `reps_done NULL` mantiene **0 diff** en racha, tonelaje, volumen muscular, series de fuerza y PR semanales: 10 de 13 RPC que leen `workout_logs` filtran por `reps_done > 0` o por `weight_kg*reps > 0`.
- **CA-26** Las dos excepciones se corrigen en este tren (R4): la RPC `get_client_exercise_prs` (que hoy no filtra `reps_done`) y la ruta `apps/web/src/app/api/pr-card/route.tsx:77-86` (que selecciona `weight_kg, logged_at` con `.not('weight_kg','is',null)` y sin filtro de reps). Sin eso, un wall sit de 20 kg aparecería como PR «20 kg × 0 reps».
- **CA-26b · Las dos migraciones se aplican en W0 y el cambio de récords se avisa en una línea (R35).** M1 (CHECK) y M2 (`get_client_exercise_prs`) se validan con tx-rollback y **se aplican en LIVE en W0**, no en W6: son aditivas y **ningún cliente viejo escribe `'sec'`**, así que no hay ventana rota entre la migración y el deploy —el código que escribe `'sec'` sale recién en W6—. **W0 migra → W6 deploya → W6 OTA**, un solo orden en los cuatro archivos del SDD. M2 **cambia récords ya listados** (617 filas, 25 alumnos, 72 pares alumno-ejercicio afectados: los holds sin reps dejan de contar como PR): se aplica igual en W0 y se menciona en **una línea del aviso general a coaches** del cierre (`news_items`), **sin mensajes individuales**. En esa misma línea va el cambio de W5.3 (CA-80: con la pref OFF ya no se corta un descanso arrancado a mano).
- **CA-27** Sin PR ni e1RM ni celebración de récord en modo tiempo (A4): `packages/workout-engine/pr-detect.ts` ya exige `reps_done > 0`, así que se cumple con 0 diff de motor; el guard se blinda con test.

### 8.3 `metadata.hold_source`

- `'timer'` ⇒ el reloj llegó a **0 solo** y la app auto-envió (V2), incluido el vencimiento en background (R6).
- `'manual'` ⇒ **cualquier otra vía**: «Listo» antes de 0 (R22), edición del valor guardado (R7), tipeo directo en la fila o en el keypad, o hold escrito en la superserie sin arrancar el reloj.
- **CA-28** Se escribe en **todo** hold guardado —**movilidad, roller y fuerza por tiempo**—, no solo en los del reloj: de eso depende que la métrica de adopción de §15 no mienta y que no aparezca un tercer estado `sin_marca` en §8.2. **Roller: siempre `'manual'`** (no tiene cuenta atrás en este tren, R12), en el commit de `apps/mobile/components/alumno/workout/v3/RollerScreenV3.tsx:153` (el `buildTypedPayload('roller', …)`, que pasa a llevar el contexto-objeto con `holdSource`). Métrica única para los tres (DECISIONS-2, DATA-2).
- **CA-29** No hay tercer valor. Un log **sin** la clave es un registro anterior a este tren: los lectores lo tratan como *desconocido*, **nunca** como `'manual'`.
- **CA-30** `hold_source` debe declararse en `WorkoutLogSetSchema.metadata` (`packages/schemas/workout.ts`) o Zod v4 lo **estripa** en el camino web (el propio archivo documenta que estripa lo no declarado; por eso hubo que declarar `skipped`/`skip_reason`). `grep -rn "hold_source" apps packages supabase` ⇒ 0 resultados hoy: la clave es nueva de punta a punta.
- **CA-31** Cuando el jsonb ya tiene lados, `hold_source` viaja **en el mismo objeto**; mandarla sola borraría `left_sec`/`right_sec` (el UPDATE reemplaza el jsonb entero).

### 8.4 Predicado `isStrengthTimeBlock`

```ts
// packages/workout-engine/workout-exercise-type.ts
isStrengthTimeBlock(block, exercise) :=
      effectiveExerciseType(block, exercise) === 'strength'   // :74
   && block.reps_unit === 'sec'
   && (block.duration_sec ?? 0) > 0
```

- **CA-32** Es la **fuente única**; `apps/web/src/lib/workout-exercise-type.ts` re-exporta del motor y deja de duplicar `hasTypedPrescription`/`typedBlockSummary`.
- **CA-33** Test que congela el legado H8: `{ duration_sec: 600, reps_unit: null }` ⇒ **`false`**. Los 2 bloques strength en LIVE con `duration_sec` y `reps_unit NULL` siguen siendo fuerza clásica; **0 planes migran**.
- **CA-34** El routing de pantalla **no cambia**: `effectiveExerciseType` sigue devolviendo `'strength'` y el paso sigue siendo `ExerciseScreenV3` (RN) / `ExerciseStepV3` (web). D3: sin quinto tipo.

---

## 9. Superficies por plataforma

### 9.1 Estados de visibilidad (R8, precisado por R26 y R29) — regla transversal

| Contexto | Sin arrancar (`idle`) | Corriendo (`running`) | En pausa (`paused`) | Guardado (`done`) |
|---|---|---|---|---|
| **Superserie** (RN `SupersetScreenV3`, web `SupersetStepV3`) | Módulo **+ fila de cajas** (el camino manual de hoy sigue existiendo) | **Solo el módulo** a la vista (mockup: «sin cajas para escribir mientras corre») — la fila se **oculta**, no se desmonta (CA-92) | Las cajas **vuelven a verse**, editables, junto al módulo detenido y a «Reanudar» (CA-92b) | Tarjeta del miembro «hecho» con «⏱ 30 s / 30 s»; **tap = editar** |
| **Pantalla sola** (Movilidad, Fuerza por tiempo) | Módulo + fila de captura | Módulo + fila de captura **deshabilitada** (no oculta) | Módulo + fila de captura **habilitada** | Módulo en «¡Listo!» + fila con el valor guardado, editable |

- **CA-35** En la pantalla sola la fila de captura está **siempre visible** (decisión QA4 h8b): corriendo se deshabilita, nunca se desmonta.
- **CA-92b · Las cajas se ocultan solo en `running`.** En `paused` vuelven a verse y son editables: el alumno que pausa para corregir el número no puede quedarse sin dónde escribirlo. Se ocultan **solo** en `running`, y siempre con `hidden` + `inert` (web) / `display:'none'` (RN), nunca desmontando (CA-92); pasar a `paused` es volver a mostrarlas, no volver a montarlas. Entre `running` y `paused` lo único que cambia es la visibilidad.
- **CA-97 · El módulo se monta solo cuando hay reloj que montar (R29).** Predicado único, idéntico en RN y web: `duration_sec > 0` para movilidad, `isStrengthTimeBlock(block, exercise)` para fuerza. Sin duración prescrita —hay **94 bloques de movilidad en LIVE sin `duration_sec`**— **no se monta el módulo**: la fila manual de hoy queda exactamente como está, sin anillo, sin CTA de arranque y sin cambio de layout. Nada de montar un anillo en `0:00` ni de inventar un objetivo por defecto. **Punto de QA:** «bloque de movilidad sin segundos ⇒ la pantalla se ve igual que antes del tren».
- **CA-36** Siempre existe un camino manual de escritura: 29 de 32 holds de Movens hoy se escriben a mano y ese flujo no puede desaparecer.
- **CA-92 · Invariante de montaje (R26): la fila del miembro activo NUNCA se desmonta mientras el módulo está montado.** R8 dice «corriendo ⇒ solo el módulo» y solo aclara «nunca se desmonta» para la pantalla sola (CA-35). En la superserie web el auto-envío es `formRef.current.requestSubmit()` sobre el `<form>` del `LogSetForm`, renderizado **dentro** de la tarjeta activa (`apps/web/src/app/c/[coach_slug]/workout/[planId]/v3/SupersetStepV3.tsx:289-372`): si se ocultara desmontando, `formRef` sería `null` y V2 **no guardaría nada, en silencio** — justo en los 21 de 32 bloques de Movens que viven en superserie, con 6 de sus 9 alumnos en PWA. Por eso ocultar = `hidden` + `aria-hidden` + `inert` (web) / `display:'none'` con el árbol montado (RN), **nunca** un condicional de render. Verificación obligatoria: test web-DOM en `DATA-TESTING.md` §6.2 — con el módulo en `running` el `<form>` sigue en el DOM y `holdPrefill.submit` produce **un solo** `logSetAction` — y el assert equivalente en el punto 8 del QA web (§7.2 de `DATA-TESTING.md`).

### 9.2 Superserie — RN y web

| Qué | RN | Web |
|---|---|---|
| Ancla del módulo | justo después de `<ExecMediaV3>` y antes de la prescripción compacta (`SupersetScreenV3.tsx:459-462`) | dentro de `.exec-v3-ss-body-in`, tras cerrar `<ExecMediaCard/>` y antes de `.exec-v3-rx` (`SupersetStepV3.tsx:296-298`) |
| Tamaño | anillo **80 px**, trazo 9, aqua `#18ABD4` para movilidad / color de marca para fuerza por tiempo | mismo, vía `.exec-v3-holdmod[data-size="ss"]` + `--exec-hold-size` (clase **nueva**, CA-99) |
| Envío | `onCommit` → `logSet` con `buildTypedPayload` (movilidad) o `buildStrengthTimePayload` (fuerza tiempo) | `holdPrefill.submit` → `formRef.current?.requestSubmit()` (precedente cardio, `LogSetForm.tsx:1819-1830`) |
| CueBar | envoltura local del commit, no `onCommitSet` directo (`SupersetScreenV3.tsx:321`, `:667`) | `handleActiveLogged` (`SupersetStepV3.tsx:219`, `:361`) — se dispara solo por pasar por el mismo `onLogged` |

- **CA-99 · CSS del anillo: clase nueva, cardio intacto (R33).** `.exec-v3-holdwrap` y `.exec-v3-holdnum` **no se tocan**: hoy las usa `CardioStepV3` (`apps/web/src/app/c/[coach_slug]/workout/[planId]/v3/CardioStepV3.tsx:518`, `:538`, `:689`, `:711`, `:722`) además de `MobilityStepV3` (`:154`, `:178`), y sus reglas viven en `apps/web/src/app/globals.css:5417` y `:5449`. Tocarlas para meter tres tamaños movería el anillo de cardio, que este tren tiene prohibido tocar (CA-14). Regla: el módulo estrena **`.exec-v3-holdmod`** con la variable `--exec-hold-size` (**80** en superserie, **130** en fuerza por tiempo, **214** en Movilidad sola) y sus propios selectores de número, trazo y estados. **Movilidad sola migra al módulo nuevo en W4** conservando sus 214 px y su trazo 23 (CA-47); cardio se queda con las clases viejas.
- **CA-37 (V1)** El media del miembro activo **no** se colapsa ni se quita cuando corre el reloj; el módulo va debajo.
- **CA-38 (V4)** Tras guardar un hold que **no** cierra la ronda, la tarjeta activa pasa sola al siguiente miembro. El avance sale del optimismo ya existente (`firstIncompleteInRounds`, `packages/workout-engine/superset-rounds.ts:84`): **no** hay navegación nueva.
- **CA-39 (R23)** El CueBar «¡Sigue sin detenerte!» se dispara **sin gesto** y dura **2400 ms** cuando el origen es `timer` (hoy 1650 ms, `SupersetScreenV3.tsx:170`, `SupersetStepV3.tsx:131`); con origen manual sigue en 1650 ms. El marquee «CONTINÚA SIN DESCANSO» no cambia.
- **CA-40 (D2)** Si el hold que termina cierra la ronda: se guarda, **no** arranca ningún descanso y la nota de descanso del pie se convierte en el CTA «Ronda lista · Descansar N s». El estado vive en `pendingRoundRest` del orquestador (R9), nunca en la fila.
- **CA-40b · Forma canónica de `pendingRoundRest` (R28, amplía R9 con evidencia de código).** `{ groupId, round, totalRounds, seconds, label, roundContext }`, donde `roundContext` es el **mismo `RestRoundContext`** que hoy arma `ExecutorV3.tsx:770-790` — `{ roundNumber, totalRounds, next: { nombre, prescripción, tag } }` — sin tipo nuevo ni forma paralela. La forma corta `{groupId, round, seconds}` **no alcanza**: `ExecutorV3.tsx:696` pone `restRoundContextRef.current = null` en **cada** commit, y el contexto (`{roundNumber, totalRounds, next}` con nombre, prescripción, ejercicio y tag) solo se arma dentro de la rama que hoy llama `startRest` (`:770-791`), leyendo `members`, `projected` y `effByBlock`, que solo existen ahí. El interstitial lo consume al montar (`:1763`). Con D2 el descanso arranca **después**, así que si el contexto no se guarda en el commit, D2 llega con `roundContext = null` y se pierden el banner «Ronda N lista», los dots y la próxima ronda (E3.5): CA-42 y el punto Q7 del QA quedarían inalcanzables. **Regla:** el contexto se **calcula en el commit** (donde están los datos) y se guarda dentro de `pendingRoundRest` **antes del reset de `restRoundContextRef` de `:696`** — el orden importa: guardar después del reset deja `roundContext = null` y reintroduce el bug entero. Al tocar el CTA, la UI **repone** `restRoundContextRef.current = pendingRoundRest.roundContext` **antes** de llamar `startRest`. La misma forma vale en los cuatro archivos del SDD y en el espejo web.
- **CA-41** `pendingRoundRest` se limpia en cuatro eventos: nuevo commit de cualquier miembro, cambio de paso, omitir bloque, finalizar entreno.
- **CA-42 (RN)** Tras reponer el contexto (CA-40b), el CTA llama el **mismo** `startRest(seconds, { autoStart: true, label, setIndex: round, setTotal: totalRounds, countKind: 'ronda' })` de hoy (`ExecutorV3.tsx:796-802`), para que la notificación siga imprimiendo «Ronda 2 de 4» y no «Serie 2 de 4». **Solo RN**: `countKind`, `setIndex` y `setTotal` **no existen en la web** (`grep -rn countKind apps/web/src` ⇒ 0 resultados; `RestOptions` es `{label?, warmup?}`, `WorkoutTimerProvider.tsx:18-21`, y `ActiveTimer` `kind:'rest'` es `{seconds, label?, warmup?}`, `:41-45`).
- **CA-42b (web) · No se amplía `RestOptions`: el rótulo viaja en `label` (R28).** El CTA de D2 en la web llama `startRest(String(groupRestSeconds), { label })` — la misma firma que usa hoy `LogSetForm.tsx:668` y `:2036-2040` — y el banner de ronda se pinta con el `roundContext` repuesto en el cliente, sin pasar por el provider. **`countKind` no existe en la web y este tren no lo crea**: `RestOptions` es `{label?, warmup?}` (`WorkoutTimerProvider.tsx:33`, y `grep -rn countKind apps/web/src` ⇒ 0 resultados). El «Ronda N de M» que en RN va en `countKind`/`setIndex`/`setTotal`, en la web se escribe dentro de `label`. Ninguna tarea de W4 amplía el provider. El punto Q7 del QA (§7.2 de [DATA-TESTING.md](DATA-TESTING.md)) se verifica en RN; en la PWA se verifica el banner y el `label`, no el texto de una notificación.

### 9.3 Movilidad sola

- **CA-43 (B, paridad RN)** En web, antes de arrancar el CTA grande es **«Iniciar hold»** (juicy) y «Listo» pasa a secundario; corriendo, «Pausar» es secundario y «Listo este lado»/«Listo» es juicy. Requiere `started: boolean` en `useExecCountdown` (hoy la interfaz expone `timeLeft, isActive, done, frac, toggle, restart`, `useExecCountdown.ts:19-31`), porque sin él la web no distingue «nunca arrancó» de «pausado».
- **CA-44** El anillo sigue tappable (afordancia redundante), pero el rótulo de 10 px «Tocar para iniciar» (`MobilityStepV3.tsx:195`) deja de ser el único camino de arranque.
- **CA-44b · «Registra abajo» se retira.** El mismo rótulo de `MobilityStepV3.tsx:195` imprime hoy `countdown.done ? 'Registra abajo' : 'Tocar para iniciar'`. Con V2 la serie ya se guardó sola cuando el reloj llega a 0, así que «Registra abajo» manda al alumno a hacer algo que ya está hecho. En `done` el anillo dice **«¡Listo!»** y debajo va el chip **«Guardado · 30 s»** (CA-45, §10.1); el string «Registra abajo» desaparece del repo.
- **CA-45 (V2)** Al llegar a 0 del último lado la serie se guarda sola, sin tocar nada; el anillo pasa a «¡Listo!» con el chip «Guardado · 30 s».
- **CA-46 (V3)** Tras guardar, la pantalla **no** se mueve: aparecen «Descansar N s» (juicy) y «Siguiente serie» (secundario). Nada arranca solo salvo pref D5 ON (§11).
- **CA-47** El anillo de la Movilidad sola conserva sus **214 px** y su trazo 23 (V1).
- **CA-48 (R7)** Tocar la serie guardada abre «Editar» con **los dos lados** sembrados desde `metadata` (`hold_left_sec`/`hold_right_sec`), y `openSet` pasa `sideMode` al `typedCtx`. Hoy no lo pasa deliberadamente (`ExecutorV3.tsx:556-562`), y con V2 la edición se vuelve el camino principal: sin el fix, editar un hold `per_side` borra el desglose.

### 9.4 Fuerza por tiempo (ejecutor)

- **CA-49** Anillo de **130 px** en color de marca, debajo del media, en la misma posición que en movilidad (`ExerciseScreenV3.tsx:335-338` RN, `ExerciseStepV3.tsx:174-177` web).
- **CA-50** Tiles **KG + SEG**: el alumno ajusta el KG **antes** de iniciar; el reloj llena SEG.
- **CA-50b · Los tres CTA de fuerza por tiempo, por estado.** En `idle` el botón grande dice **«Iniciar serie»** (juicy) y **reemplaza** al «Aplastar serie» de hoy (`ExerciseScreenV3.tsx`, JuicyButton 60 px): dos botones grandes compitiendo en el mismo lugar es el bug de producto que R8 evita. Mientras el reloj **no** se haya arrancado, **«Aplastar serie» sigue disponible solo si el alumno escribió los SEG a mano** en la caja —el camino manual de R8, que nunca puede desaparecer (CA-36)—; con la caja vacía no se pinta. Tras el guardado, los CTA son **«Descansar N s» / «Siguiente serie»** (R24, CA-95).
- **CA-51** La prescripción compacta imprime `{sets} × {compactDuration(duration_sec)}` en vez de `{sets} × {reps}` (`compactDuration` en `packages/workout-engine/workout-exercise-type.ts:98`).
- **CA-52** El guard web de serie vacía se extiende: `w == null && r == null` pasa a `w == null && r == null && hold == null` (`LogSetForm.tsx:~848`); sin eso el auto-guardado de fuerza por tiempo **queda bloqueado en silencio**.
- **CA-53** La `key` del form web incluye el eje tiempo (hoy `key={\`log-${weight_kg}-${reps_done}\`}`, `LogSetForm.tsx:1098`); sin eso el input uncontrolled queda rancio tras la reconciliación.
- **CA-98 · Rama propia para `per_side` en fuerza por tiempo web (R37, tarea de CÓDIGO en W4, no «documentar»).** En `StrengthLogSetForm` (`LogSetForm.tsx`, abre en `:316`) la rama `perSideReps` (`:357`, que hoy incluye `alternating`) llama a `buildStrengthPayload` y ejecuta `formData.delete('metadata')` (`:820`, `:840`): por ese camino un hold por lado perdería `left_sec`/`right_sec`/`hold_source` en silencio. Regla: **si `isStrengthTimeBlock`, la rama `perSideReps` no llama a `buildStrengthPayload` ni borra `metadata`**. Lee `hold_left_sec` / `hold_right_sec`, arma `{ left_sec, right_sec, hold_source }` y hace **un único** `formData.set('metadata', …)`; `reps_done` se **elimina** del FormData (CA-25: nunca `0`). Los lados salen de `holdSidesFor(sideMode)` (CA-91), así que `alternating` cae a `['single']` y **no** entra a esta rama. Caso obligatorio en el test de paridad `W1.T2` y en la tabla de payloads de §5.4 de [DATA-TESTING.md](DATA-TESTING.md).
- **CA-54** La cola offline web de **fuerza** encola `actualHoldSec` + `metadata` (hoy solo `weightKg/repsDone/rpe/rir/note/metadata`). En RN no hay trabajo: `PendingLog` ya transporta `actual_hold_sec` (`apps/mobile/lib/offline-cache.ts:42`) y `metadata` (`:51`).

### 9.5 Builder del coach (web y RN)

- **CA-55** Dentro de Fuerza aparece el grupo **«Prescripción»** con un segmented **«Reps | Segundos»** (web `apps/web/src/app/coach/builder/[clientId]/components/BlockEditSheet.tsx`, junto al bloque de Series/Repeticiones `:734-753`; RN `apps/mobile/components/coach/BlockEditorSheet.tsx`). No aparece un quinto tipo: el segmented «Tipo de ejercicio» sigue con 4 columnas (`:677-678`).
- **CA-56** Con «Segundos»: el campo «Repeticiones *» se reemplaza por **«Segundos por serie *»** (5–600); se conservan Series, Peso Objetivo (kg), RIR / RPE, Tempo, Recuperación, lado y descanso de calentamiento.
- **CA-57** Validez del bloque en modo Segundos: `sets ≥ 1` **y** `duration_sec ∈ [5,600]`. La regla vive en un `isBlockComplete(block, type)` extraído al motor y consumido por web y RN (hoy la validez de strength exige `reps` no vacío).
- **CA-58** Al cambiar de Segundos a Reps se manda `duration_sec: null` **explícito** y `reps_unit: null`; `undefined` deja residuo vivo en el passthrough del builder RN (`apps/mobile/lib/plan-builder/serialize.ts:111-135`).
- **CA-59** El espejo `reps` se genera en los dos serializadores desde `legacyRepsSummaryFor` (`packages/workout-engine/workout-exercise-type.ts:184-189`), no con lógica duplicada: web `WeeklyPlanBuilder.tsx:1017-1024`, RN `serialize.ts:84`.
- **CA-60** El preview del alumno deja de pintar «Sin prescripción» para un bloque en segundos: `StudentLivePreview.tsx:73-86` devuelve `${sets} × ${compactDuration(duration_sec)}${sideSuffix}` en la rama strength (hoy cae al `return null` de `:85` y pinta el chip rojo de `:112-116`).
- **CA-61** La lista del día muestra el chip **«Por tiempo»** y el resumen `3 × 30 s · 10 kg`.
- **CA-62 (D4)** Progresión: «Ninguna | Peso | Segundos» (RN) / «+ Peso | + Segundos» (web). La doble progresión queda **bloqueada** en modo tiempo con un guard real en `apps/web/src/lib/workout/progression.ts`, no solo con copy: con `reps = "45s"` y `reps_done NULL` el algoritmo de doble progresión deja el peso congelado en `holding`.
- **CA-62b · «seg/ses» en las 5 superficies que hoy imprimen «rep/ses» (R30, tarea de W2).** Con `progression_type = 'reps'` el cartel de progresión hoy dice literalmente `+2 rep/ses` en: `apps/web/src/app/c/[coach_slug]/workout/[planId]/WorkoutExecutionClient.tsx:749` y su espejo RN `apps/mobile/components/alumno/workout/workout-ui.ts:31` (**los dos de cara al alumno**), más `apps/web/src/app/coach/builder/[clientId]/components/BlockEditSheet.tsx:1190`, `ExerciseBlock.tsx:307` y `PrintProgramDialog.tsx:151` (cara al coach). En un bloque con `isStrengthTimeBlock` los cinco imprimen **«seg/ses»** (`+2 seg/ses`); en cualquier otro bloque el string no cambia. *(Hallazgo del fixer, verificado con Grep: hay un sexto lugar, el PDF del programa `apps/mobile/lib/program-pdf.ts:55`; se repunta con la misma regla y sin costo aparte.)* La progresión por segundos sigue siendo **cartel, sin motor**, exactamente como hoy «+ Reps»: nada recalcula `duration_sec` por sesión.

### 9.6 Ficha del coach y resumen de sesión

- **CA-63** La META de la pestaña de entreno deja de asumir `isTyped = kind !== 'strength'` (`apps/web/src/app/coach/clients/[clientId]/TrainingTabB4Panels.tsx:678`; espejo RN `apps/mobile/components/coach/clientDetail/AnalisisTab.tsx` y `apps/mobile/lib/coach-client-detail.ts:1292`), que hoy imprimiría `×30s · 3 series`.
- **CA-64** Un helper nuevo `formatStrengthTimeSetLine` da la línea de log `10 kg × 30 s` (y `10 kg × 30 s por lado`), consumido por las 4 superficies que hoy caen a «peso × reps»: `TrainingTabB4Panels.tsx:739`, `AnalisisTab.tsx:607`, `LogSetForm.tsx:960`, `apps/mobile/components/alumno/workout/SetRow.tsx:454`. **No** se toca el contrato documentado `formatLoggedSetLine('strength') === null` (`packages/workout-engine/logged-set-summary.ts:154`).
- **CA-65 (R16)** Un hold de fuerza **enciende** el mapa muscular del resumen (`packages/workout-engine/session-summary.ts:201-235`): una plancha con disco trabaja core, igual que movilidad.

### 9.7 Tuerca + modal D5

- **CA-66** La fila «Cronómetro automático» de la tuerca se **renombra** a «Pasar solo al descanso» en las dos plataformas (RN `apps/mobile/components/alumno/workout/v3/ExecSettingsSheet.tsx:203-215`; web `apps/web/src/app/c/[coach_slug]/workout/[planId]/v3/ExecSettingsSheet.tsx:187-202`), con los sublabels de R11b. **No** se agrega una segunda fila: dos switches sobre el mismo `startRest` sería un bug de producto.
- **CA-67 · Cuándo y dónde aparece el modal (R32).** Se monta junto a los demás sheets del ejecutor y se cierra escribiendo la marca «visto» (§11.1). **Momento exacto:** en el **primer ejercicio** de la sesión (`stepIndex === 0`) y **después** de que el overlay del Despegue/morph se retira y la pantalla del ejercicio ya es interactiva — RN, cuando la fase pasa a `'session'` (`apps/mobile/components/alumno/workout/v3/ExecutorV3.tsx:312-317` fija la fase inicial y `:363-370` hace el salto por `subscribeMorphStartConfirmed`); web, el equivalente del mismo salto. Pisar el Despegue con un modal rompe la única animación de entrada del ejecutor y deja al alumno respondiendo una pregunta sobre descansos antes de ver el ejercicio.
- **CA-67b · Se muestra aunque el bloque no tenga descanso.** El modal pregunta por la **preferencia global** del alumno, no por ese bloque: se muestra igual con `rest_time = 0`. A7 habla del **comportamiento** (sin descanso configurado no hay nada que arrancar, CA-75), no del modal. Condicionarlo a `rest_time > 0` dejaría a un alumno cuyo primer bloque es un calentamiento sin descanso sin la pregunta y con el default silencioso.

---

## 10. Copys canónicos

### 10.1 Ejecutor — módulo de hold (mockup v2 + R11b)

| Superficie | Copy |
|---|---|
| CTA de arranque (superserie y movilidad sola) | **«Iniciar hold»** |
| CTA de arranque (fuerza por tiempo) | **«Iniciar serie»** |
| Control corriendo | **«Pausar»** / **«Reanudar»** (secundario) |
| Cierre de lado (per_side, lado 1) | **«Listo este lado»** (juicy) |
| Cierre (bilateral o último lado) | **«Listo»** (juicy) |
| Sidepill | **«Lado izquierdo»** / **«Lado derecho»** / **«Sostén la posición»** |
| Pie del sidepill (per_side, lado 1) | **«luego: lado derecho · arranca solo»** |
| Pie del sidepill si el lado 1 venció en background (R6) | **«Iniciar lado derecho»** |
| Anillo tras guardar | **«¡Listo!»** + chip **«Guardado · 30 s»** |
| Fuerza por tiempo tras guardar | **«¡Listo!»** + chip **«✓ 10 kg × 30 s»** |
| CTA post-serie con la pref OFF, en **las cuatro** superficies (fuerza clásica, movilidad, fuerza por tiempo y fin de ronda) — R24, CA-95 | **«Descansar 90 s»** (segundos reales del bloque) · secundario **«Siguiente serie»** |
| Fin de ronda en superserie (D2) | **«Ronda lista · Descansar 90 s»** |
| Miembro guardado en la superserie | **«⏱ 30 s / 30 s · guardado»** |
| Aviso entre miembros | **«¡Sigue sin detenerte!»** (existente) |
| Marquee de la superserie | **«CONTINÚA SIN DESCANSO»** (existente, sin cambios) |
| Prescripción compacta, hold | **«Hold 30s/lado · 3 series»** |
| Prescripción compacta, fuerza por tiempo | **«3 × 30s · 10 kg · RIR 2»** |
| «Anterior» en fuerza por tiempo | **«Anterior: 10 kg × 30 s»** |
| Notificación local del fin del hold (R18) | **«Terminó tu hold»** |

### 10.2 Builder (R11, mockup sección C)

| Elemento | Copy |
|---|---|
| Grupo | **«Prescripción»** |
| Segmented | **«Reps»** / **«Segundos»** |
| Hint del grupo (web) | **«series × segundos, con carga · el alumno ve cuenta atrás»** |
| Campo | **«Segundos por serie \*»**, placeholder **«Ej. 30»**, hint **«5–600 segundos»** / **«el alumno ve la cuenta atrás»** |
| Series | **«Series \*»**, hint **«1–20 series»** |
| Peso | **«Peso Objetivo (kg)»**, hint **«en kg, acepta decimales»** |
| RIR | **«RIR / RPE»**, hint **«cuántos segundos quedan en el tanque»** |
| Progresión | RN **«Ninguna | Peso | Segundos»** · web **«+ Peso | + Segundos»** |
| Chip de la lista del día | **«Por tiempo»** |
| Resumen de prescripción | **«3 × 30 s · 10 kg»** |
| Línea de log | **«10 kg × 30 s»** / **«10 kg × 30 s por lado»** |

**Convención tipográfica (R11):** `30s` (sin espacio, vía `compactDuration`) **solo** en chips de ≤ 20 caracteres; `30 s` (con espacio) en líneas largas, resúmenes y logs.

### 10.3 Preferencia D5 (R11b, literal)

| Elemento | Copy |
|---|---|
| Título del modal | **«¿Pasamos solo al descanso?»** |
| Cuerpo | **«Cuando termines una serie, podemos arrancar tu descanso automáticamente. Si prefieres, lo arrancas tú con el botón.»** |
| Toggle | **«Pasar solo al descanso»** |
| Sublabel ON | **«El descanso empieza solo al terminar cada serie.»** |
| Sublabel OFF | **«Tú decides cuándo empieza el descanso.»** |
| CTA del modal | **«Listo»** |
| Pie del modal | **«Puedes cambiarlo cuando quieras en los ajustes del entrenamiento (⚙).»** |
| Fila de la tuerca | **«Pasar solo al descanso»** (reemplaza «Cronómetro automático»), mismos sublabels sin punto final |
| `accessibilityLabel` / `aria-label` del toggle | **«Pasar solo al descanso»** |

- **CA-68** Todos los copys de usuario van en **«tú» chileno neutro**; ningún voseo entra a la app.
- **CA-69** Los strings «Descansar N s», «Siguiente serie» y «Ronda lista · Descansar N s» **no existen hoy** en el repo: son nuevos de este tren y no pueden divergir entre RN y web.

---

## 11. Preferencia D5 — «Pasar solo al descanso»

### 11.1 Qué es, dónde vive, qué default tiene (R1, R14)

Es **la misma preferencia que hoy se llama «Cronómetro automático»** (`omni_autotimer`), re-encuadrada y hecha per-alumno. Hoy es device-scoped y su default es **ON**.

**Los «4 puntos» de R1, corregidos con el código (obligatorio para W5.3 y §3.6 de `DATA-TESTING.md`):** no son cuatro lecturas equivalentes. `grep -rn isRestAutoTimerEnabled apps/web/src` ⇒ **0 resultados**: en la web **no** existe ese lector.

| Plataforma | Puntos **reales** de lectura | Qué se hace en W5 |
|---|---|---|
| **RN** | **2**: `ExecutorV3.tsx:762` (superserie) y `:822` (bloque suelto), vía `isRestAutoTimerEnabled()` (importado en `:86`) | Se reemplazan por `readAutoRestPref({ clientId, hasHistory })` |
| **Web** | **1**: el estado `const [autoTimerEnabled, setAutoTimerEnabled] = useState(true)` + su lectura de `omni_autotimer` en `WorkoutExecutionClient.tsx:1222-1227`, que baja como **prop** `autoTimerEnabled` (declarada en `LogSetForm.tsx:144`, default `true` en `:330` y `:1667`) | Ese estado pasa a `resolveAutoRestDefault` + `clientId`; la prop y su cableado **no cambian de nombre** |
| **Web · consumidores de la prop** | `LogSetForm.tsx:662` — **fila de FUERZA** (`StrengthLogSetForm`, abre en `:316`), dentro de `buildRest()` — y `:2034` — **fila TIPADA** (`TypedLogSetRow`, abre en `:1660`) | **No** son puntos de preferencia: solo cambia la **semántica de `cancelRest`** (CA-80). `LogSetForm` **no** recibe ni necesita `clientId` |

> ⚠ Las etiquetas «fila tipada» / «fila de fuerza» estaban **invertidas** en el borrador: `:662` es fuerza y `:2034` es tipada. La corrección vale para los cuatro archivos del SDD.

| Pieza | Valor canónico |
|---|---|
| Clave del valor | `eva:exec-autorest-v1:<clientId>` — valores `'1'` / `'0'` (carril `exec-settings`, no `'true'/'false'`) |
| Clave del modal | `eva:exec-autorest-seen-v1:<clientId>` |
| Carril | `localStorage` (web) / `AsyncStorage` (RN). **Sin tabla, sin RLS nueva**: `client_feature_prefs` no admite escritura del alumno |
| API | `readAutoRestPref({ clientId, hasHistory })` (**síncrona**, CA-70c), `writeAutoRestPref`, `resolveAutoRestDefault({ clientId, hasHistory, strategy })`, `resolveShowAutoRestModal({ clientId, ... })` (los dos `resolve*` son **puros**, con test) |
| `clientId` en web | prop nueva `clientId` a `WorkoutExecutionClient` desde `page.tsx` (`rootUser` se resuelve en `:61`); hoy el ejecutor web no lo tiene. **Puede ser `null`** (CA-93) |
| Estrategia del default | una sola constante **`AUTOREST_DEFAULT_STRATEGY = 'cohort'`** (tipo `'cohort' \| 'off'`) declarada en `auto-rest-pref.ts` —RN y web— y **pasada** como `strategy` a `resolveAutoRestDefault` (CA-70b) |

**Default por cohorte (R1), en este orden:**

1. Existe `eva:exec-autorest-v1:<clientId>` ⇒ su valor.
2. No existe, pero existe `omni_autotimer` ⇒ se **copia** (migración de lectura; la vieja se lee con `!== 'false'`).
3. No existe ninguna y el alumno **tiene** historial ⇒ **ON** (es lo que vive hoy: cero regresión para los 9 alumnos de Movens y el resto de la base).
4. No existe ninguna y es su **primer entreno** ⇒ **OFF + modal** (D5 literal).

- **CA-70b · Divergencia declarada respecto de la letra de D5, pendiente Q1 del owner.** D5 dice literalmente «Por defecto APAGADA (regla V3)»; R1 fija **ON para quien tiene historial**. El SPEC implementa la **cohorte** (recomendación del jefe) y lo declara acá para que nadie lea dos defaults contradictorios. Para que un «OFF global» no exija reabrir código ni QA, el default se implementa como **una sola constante**: `AUTOREST_DEFAULT_STRATEGY = 'cohort'` vive en `auto-rest-pref.ts` (una copia en RN y una en web, con el mismo nombre y el mismo valor) y `resolveAutoRestDefault` la **recibe** como parámetro `strategy: 'cohort' | 'off'`, que es lo que hace testeable la variante sin tocar el resolver. Con `'off'` los pasos 3 y 4 colapsan en **OFF**. Si el owner responde Q1 = «OFF global», el cambio es **una línea por plataforma** más la fila del test de cohortes (`W1.T4`) que ya cubre la variante: no es rama muerta, es una fila verde desde W1.
- **CA-70c · La lectura de la pref es SÍNCRONA, con caché hidratada una vez (R36).** La decisión de `maybeStartRest` corre **antes** del `await` de red y no puede esperar a `AsyncStorage` (`apps/mobile/components/alumno/workout/v3/ExecutorV3.tsx:748-754` documenta esa disciplina: «Decisión de descanso — SÍNCRONA, ANTES del await de red», CA-12). Regla, calcada de `apps/mobile/components/alumno/workout/timers/rest-timer-preferences.ts` (que ya resuelve exactamente este problema y se hidrata desde `TimerProvider.tsx:11`): **caché en memoria + hidratación única al montar el ejecutor con el `clientId` + escritura optimista** (se actualiza la caché y se persiste sin bloquear). `readAutoRestPref` devuelve un `boolean`, nunca una promesa; mientras la caché no esté hidratada devuelve el default resuelto (CA-94). **Web:** la verdad vive en el estado de `WorkoutExecutionClient` y baja como prop `autoTimerEnabled` a `LogSetForm` — `LogSetForm` **no** lee storage ni recibe `clientId` (§11.3) —, con el mismo hook hidratación-safe que evita EVA-NEXTJS-18 (RG14).
- **CA-70 · Dos señales distintas, y `hasHistory := !showModal` (F5, obligatorio).** `hasHistory` (default de la pref) y `esPrimerEntreno` (mostrar el modal) **no** son lo mismo, pero la segunda alimenta a la primera:
  - **`esPrimerEntreno`** (modal) sigue con las 3 señales del bundle: `previousHistory` vacío && `exerciseMaxes` vacío && `sessionLogs.length === 0` — **0 queries**, funciona offline — más las exclusiones de CA-72.
  - **`hasHistory`** (pref) **no** puede salir de esas tres tal cual: `previousHistory` y `exerciseMaxes` están acotados a los ejercicios **de este plan** y además filtran `.not('weight_kg','is',null)` (`apps/web/src/app/c/[coach_slug]/workout/[planId]/_data/workout-execution.queries.ts:263-272` y `:286-297`); un veterano con mesociclo nuevo resolvería «sin historial» ⇒ la pref quedaría **OFF**, que es la regresión T9 que R1 quiere evitar.
  - **Regla única del tren, sin query ni señal nueva: `hasHistory := !showModal`.** El único lugar donde se resuelve la cohorte (RN y web, W5) calcula primero `showModal = resolveShowAutoRestModal({ …bundle, seen, storageAvailable })` y pasa `hasHistory: !showModal` a `resolveAutoRestDefault`. Leído en castellano: **la pref solo nace OFF cuando el alumno va a ver el modal y decidir**; en cualquier otro caso (veterano, plan 100 % nuevo, demo, `stepIndex > 0`, modo `repeat`/`past-date`/`recover`, storage inaccesible) nace **ON**, que es lo que la base vive hoy.
  - **`weekStatusDays` NO se usa** como fuente de `hasHistory`: es de la semana en curso y devuelve `null` sin programa activo o en modo ciclo (`apps/web/src/app/c/[coach_slug]/workout/[planId]/_data/week-status.queries.ts:22-39`), así que un veterano que no entrenó esta semana volvería a parecer novato. Tampoco `lastSessionByBlock` ni la racha en RN. El nombre canónico `readAutoRestPref({ clientId, hasHistory })` **no cambia**: cambia solo quién alimenta ese booleano. Derivación completa y tabla de casos en §3.6.a de [DATA-TESTING.md](DATA-TESTING.md).
- **CA-94 · Regla mínima de seguridad (fail-safe del default).** Si el modal **no se muestra** por cualquier motivo (`is_demo`, modo ≠ normal, `stepIndex > 0`, storage inaccesible), la pref resuelve **ON**: nunca queda OFF sin que el alumno lo haya decidido —es la misma regla `hasHistory := !showModal` de CA-70 vista desde el otro lado—. **Excepción: `clientId == null` en web**, donde no hay clave nueva que resolver y la pref sale del carril legacy `omni_autotimer` (CA-93). Caso obligatorio en `W1.T4`: *veterano con plan de ejercicios 100 % nuevos ⇒ `enabled === true`*.
- **CA-93 · `clientId` puede llegar `null`: fallback y fail-safe.** `page.tsx` contempla `rootUser === null` (`rootUser ? getExecutorWeekStatusDays(rootUser.id) : Promise.resolve(null)`, `:68`) y los redirects que abortan miran `data.user`/`data.plan`, no `rootUser`. Sin fallback, la clave quedaría `eva:exec-autorest-v1:undefined` y **todos los alumnos de ese navegador compartirían** preferencia y marca «visto». Regla (R32, literal): `clientId = rootUser?.id ?? data.user?.id ?? null`; con `clientId == null` la preferencia **cae a la clave legacy por dispositivo** —`omni_autotimer`, el carril de hoy: **se lee y se escribe** esa clave, **sin clave nueva** namespaceada y **sin** `eva:exec-autorest-v1:undefined`— y el modal **no se muestra** (preguntar y no poder guardar la respuesta por alumno es peor que no preguntar). Que se lea el carril legacy es justamente lo que respeta un OFF previo del alumno en ese navegador: dejar la pref en ON lo pisaría. `clientId` entra además en la firma de `resolveShowAutoRestModal` (hoy no lo acepta) y suma un caso al test puro `W1.T4`.
- **CA-71** El modal se muestra **una sola vez por alumno y por superficie**; la marca «visto» se escribe **al responder**, y también si el alumno lo cierra sin responder (marca + OFF), para no hostigar.
- **CA-72** El modal **no** se muestra: si `clients.is_demo`, si el modo es editor de día pasado / repetir / recuperar, ni si el storage es inaccesible (fail-safe: no mostrar y dejar el default vigente). **`is_demo` se lee en el fetch RAÍZ del alumno (R32)** —web `getClientRootUser` (`apps/web/src/app/c/[coach_slug]/_data/client-root.queries.ts`, ya `cache()`-ada y consumida por `layout.tsx:32`), RN `apps/mobile/lib/client.ts`—, no en una query nueva del ejecutor: es un campo más en un select que ya corre, 0 queries extra. Si el campo no llega (payload viejo, error parcial), se **confía en el historial** (R14) y el modal se rige solo por `esPrimerEntreno`.
- **CA-73 · Limitación declarada:** la preferencia **no se sincroniza web ↔ RN**. Un alumno que la enciende en el celular la verá con su default en la PWA, y el modal puede salir una vez por superficie. Sincronizar exigiría una política RLS nueva: está fuera de alcance (§14).
- **CA-74** Un falso positivo conocido y aceptado: un alumno veterano al que el coach le arma un plan con ejercicios 100 % nuevos puede ver el **modal** una vez. No se compra una query extra por él. Su **preferencia** sí queda protegida en el mismo movimiento: como `hasHistory := !showModal` (CA-70), ese alumno nace con la pref **OFF solo mientras responde el modal**, y su respuesta manda; ningún otro caso de los de CA-94 nace apagado. El falso positivo cuesta **un modal**, nunca una regresión de comportamiento.

### 11.2 Quién llama `startRest` en cada celda (G1)

Las 6 celdas del cruce **pref × contexto**. «El alumno» = un CTA visible; «el orquestador» = llamada programática tras el commit.

| Contexto | **Pref OFF** (V3 / D2) | **Pref ON** |
|---|---|---|
| **Pantalla sola** (**fuerza clásica**, Movilidad, Fuerza por tiempo), tras guardar a 0 o tras «Aplastar serie» | **El alumno**, tocando «Descansar N s» — CTA **nuevo** de este tren (CA-95). El camino automático se corta donde hoy: RN `ExecutorV3.tsx:822-823` (`if (!isRestAutoTimerEnabled()) timers.cancelRest()` → pasa a `readAutoRestPref(...)`); web, con la prop `autoTimerEnabled` en `LogSetForm.tsx:662` (fila de **fuerza**) y `:2034` (fila **tipada**). El CTA invoca el **mismo** `timers.startRest(secs, { autoStart: true, label, warmup, setIndex, setTotal, countKind: 'serie' })` de `ExecutorV3.tsx:830-837` (web: `startRest(restTimeStr, { label })`, la firma real de `RestOptions`) | **El orquestador**, con esa misma llamada `ExecutorV3.tsx:830-837`; web `LogSetForm.tsx:673` (**fuerza**, rama con `warmup`) / `:2042` (**tipada**). Sin CTA intermedio |
| **Superserie, miembro NO último de la ronda** | **Nadie.** No hay descanso entre miembros: RN `ExecutorV3.tsx:805` (`timers.cancelRest()` cuando la ronda no cierra); web `LogSetForm.tsx:667-668` (**fuerza**) y `:2038-2040` (**tipada**) solo disparan con `closesRound()`. La tarjeta pasa sola al siguiente miembro (V4) | **Nadie** — idéntico. V4 manda y la pref **no** aplica: no existe descanso de miembro |
| **Superserie, ÚLTIMO miembro de la ronda (D2)** | **El alumno**, tocando «Ronda lista · Descansar N s». El orquestador guarda `pendingRoundRest` (R9 ampliado, CA-40b) y **no** llama nada; el CTA **repone el contexto de ronda** y luego invoca `timers.startRest(seconds, { autoStart: true, label, setIndex: round, setTotal: totalRounds, countKind: 'ronda' })` — la misma llamada de `ExecutorV3.tsx:796-802`. **Web (CA-42b): `startRest(String(groupRestSeconds), { label })`** — `countKind`/`setIndex`/`setTotal` no existen en el provider web (`WorkoutTimerProvider.tsx:18-21`) | **El orquestador**, con esa misma llamada de `ExecutorV3.tsx:796-802` / web `LogSetForm.tsx:667` (fuerza) y `:2039` (tipada). No se pinta el CTA |

- **CA-95 · El CTA «Descansar N s» hay que crearlo: hoy no existe (obligatorio, si no la celda «pref OFF» queda vacía).** Con la pref OFF —el default del alumno nuevo según D5— el alumno quedaría **sin descanso y sin botón**: en el ejecutor V3 de RN los únicos `startRest` de serie son automáticos (`ExecutorV3.tsx:796` y `:830`), y en la web el `ManualTimerButton` solo se pinta con `!execV3Active` (`WorkoutExecutionClient.tsx:2995-2998`), es decir **nunca** en V3. Regla (R24): tras cerrar **cualquier** serie con la pref OFF y `rest_time > 0` —tocada con «Aplastar serie» o cerrada por el reloj, no solo el guardado a 0— la UI pinta **«Descansar N s»** (juicy) + **«Siguiente serie»** (secundario), llamando al **mismo** `startRest` de la tabla de arriba (RN con `countKind:'serie'`; web `startRest(restTimeStr, { label })`, CA-42b). **Las cuatro superficies son obligatorias, sin excepción: fuerza clásica, movilidad, fuerza por tiempo y el último miembro de la ronda** (donde el par se pinta como «Ronda lista · Descansar N s» / «Siguiente serie», CA-40). Sin la fuerza clásica el hueco quedaría justo donde vive la mayoría de los bloques. Es una tarea `[UI · Fable]` nueva en **W3** (RN) y **W4** (web), **+0,25 d-a cada una**, ya contadas en los ≈ 12 d-a de R38. **Punto de QA:** «alumno nuevo, fuerza clásica, pref OFF ⇒ hay cómo descansar».
- **CA-75** Con `rest_time` = 0 (bloque sin descanso) no hay nada que arrancar en ninguna celda: hoy ya cae en `timers.cancelRest()` (`ExecutorV3.tsx:838-839`), rama que **no** es el gate de la preferencia y por eso **sí** conserva su `cancelRest` (no la toca CA-80). El CTA «Descansar N s» **no se pinta**; queda solo «Siguiente serie». El **modal** D5, en cambio, se muestra igual en un bloque sin descanso (CA-67b): pregunta por la preferencia global.
- **CA-76** El descanso de **aproximación** (warmup, serie 1 de bloques ≥ 3 series, `ExecutorV3.tsx:819-820`) queda gobernado por la misma pref, porque el gate está aguas abajo (`:822`).

### 11.3 Qué gobierna y qué NO gobierna

**Gobierna** — y solo esto: el arranque del cronómetro de descanso, tanto tras «Aplastar serie» (camino vivo) como tras el guardado automático a 0 (camino nuevo). Los puntos reales son **3, no 4** (tabla de §11.1): RN `ExecutorV3.tsx:762` y `:822` (lectura de la pref), y en la web el **estado** de `WorkoutExecutionClient.tsx:1222-1227` que alimenta la prop `autoTimerEnabled`. `LogSetForm.tsx:662` (fila de **fuerza**) y `:2034` (fila **tipada**) **consumen** esa prop: ahí solo cambia la semántica de `cancelRest` (CA-80).

**No gobierna:**

- **CA-77** El **avance de miembro** dentro de la superserie (V4): con la pref OFF o ON, la tarjeta activa pasa sola al siguiente miembro.
- **CA-78** El **avance de paso** al cerrar la última serie de un bloque (R5): se mantiene exactamente como hoy (`ExecutorV3.tsx:1798-1811`, `WorkoutExecutionClient.tsx:1967-1973`), incluido cuando el disparador fue el reloj. Se declara como interpretación de V3: V3 gobierna el descanso y la serie siguiente, no el salto de paso.
- **CA-79** El **guardado** (V2): la serie se envía igual con la pref ON o OFF.
- **CA-80 · Cambio de comportamiento declarado (R1, reescrito sobre el camino de R24).** Con la pref **OFF**, cerrar una serie **ya no cancela** un descanso en curso: **no se arranca uno nuevo, pero no se corta el que ya corre**. Hoy `if (!autoTimerEnabled) { cancelRest(); return }` mata cualquier descanso vivo, en la fila de **fuerza** (`LogSetForm.tsx:662`, dentro de `buildRest()`), en la **tipada** (`:2034`) y en RN (`ExecutorV3.tsx:822-823`). Ese auto-skip nació cuando OFF significaba «este alumno no quiere descanso automático **y no tiene ningún otro modo de arrancarlo**». Con R24 eso deja de ser cierto: OFF pasa a ser el default del alumno nuevo **y** aparece el CTA «Descansar N s», así que el `cancelRest` mataría exactamente el descanso que el alumno acaba de pedir a mano —basta que la app cierre la serie siguiente, o que un re-render dispare `buildRest()`, para que el cronómetro desaparezca sin que nadie lo toque—. **Regla:** con OFF la rama hace `return` **sin** `cancelRest()`; el descanso en curso solo lo corta el alumno (o el `cancelRest` que ya existe al registrar la siguiente serie con la pref ON). En los dos puntos web es el **único** cambio: no leen la preferencia, solo reciben la prop `autoTimerEnabled` (§11.3). Es un cambio de comportamiento **visible**, así que va en **una línea del aviso general a coaches** del cierre (CA-26b) y como punto de QA: «arrancar el descanso a mano con la pref OFF y cerrar la serie ⇒ el cronómetro sigue corriendo».

---

## 12. Qué NO se promete (R18 + lista de s2 §4 recortada)

Redacción honesta para el SPEC, el copy del producto y el aviso al coach. Ninguna de estas frases puede aparecer en la app ni en el mensaje a Movens:

1. ❌ **«El tiempo se guarda exactamente cuando el reloj llega a 0.»** Con la app en background el envío ocurre **cuando el alumno vuelve a la app**; `logged_at` puede quedar minutos después del fin real. Lo que se promete: *«el valor guardado es el objetivo del hold; si estabas fuera de la app, se envía al volver»*.
2. ❌ **«Vibra cuando termina aunque tengas la pantalla apagada.»** La háptica es JS y el JS está congelado en background. Lo único que puede avisar con la pantalla apagada es la notificación del sistema, y solo con permiso ya concedido.
3. ❌ **«Suena un beep al terminar.»** `sound.ts` depende de que el build enlace `expo-audio` y el propio archivo declara que la reproducción real «se confirma en device». Sin QA de device, **no se promete sonido**.
4. ❌ **«Ves el conteo del hold en la pantalla de bloqueo / Dynamic Island.»** Eso es Live Activity: **build nativa**, fuera de una OTA.
5. ❌ **«Nunca se pierde un hold.»** Si el SO mata el proceso en background, el hold en curso se pierde y el alumno lo reinicia (R13: `holdAnchor` persistido queda fuera del tren).
6. ❌ **«El aviso llega al segundo exacto en Android.»** El binario trae `SCHEDULE_EXACT_ALARM` en el manifest mergeado, pero en Android 13+ ese permiso **no se pre-concede** en instalaciones nuevas; sin él `expo-notifications` cae a `setAndAllowWhileIdle` (inexacto, diferible por Doze ~9 min; `ExpoSchedulingDelegate.kt:105-120`). Promesa segura: *«te avisa al terminar»*, **sin** «al segundo». **Aplica**: este tren programa notificación local en Android (canal `'default'`).
7. ❌ **«El lado derecho arranca solo siempre.»** Si el lado izquierdo venció con la app en background, el lado 2 **no** arranca solo (R6): queda esperando «Iniciar lado derecho», para no fabricar datos falsos.
8. ❌ **«Funciona igual en la PWA de iOS.»** En PWA iOS en background el JS se congela y no hay equivalente confiable de notificación local sin push con la app instalada en la pantalla de inicio. **Aplica**: 6 de los 9 alumnos de Movens entran por web/PWA o Android, y el punto 7 del QA web se corre en Safari iOS.
9. ❌ **«No hace falta permiso.»** Sin permiso de notificaciones el aviso es un no-op silencioso. Es aceptable y deliberado, pero hay que decirlo.
11. ❌ **«El reloj sigue contando con la app cerrada.»** No cuenta: se **reconstruye** desde `endTime` al volver. La diferencia importa para el copy que ve el alumno.

*(La numeración conserva la de `research/s2-rn-timer-background.md` §4. El único ítem fuera es el **10** —«cero riesgo de doble aviso»—, que este tren mitiga cancelando la notificación en los últimos ~2 s. Los ítems **6** y **8** se reponen: sí aplican, porque el tren programa notificación en Android y porque la mayoría de los alumnos de Movens está en PWA/Android.)*

**Keep-awake — riesgo declarado (no cubierto por R18).** `apps/mobile/components/alumno/workout/v3/ExecutorV3.tsx:229-241` condiciona `activateKeepAwakeAsync` a `execSettings.keepAwake`, la fila de la **misma** tuerca que este tren renombra. Con esa preferencia en OFF, la pantalla se apaga a mitad de un hold de 30–600 s, el JS se congela y la rama de R6 (guardar el objetivo, lado 2 parado) deja de ser excepción y pasa a ser el **camino normal**.

- **CA-96 · Decisión de W3 (tarea explícita, no opcional).** W3 decide y deja escrito si el módulo de hold **fuerza** `activateKeepAwakeAsync` con **tag propio** mientras `state === 'running'` y lo libera al salir del estado o al desmontar, sin tocar la preferencia del alumno. Es aditivo y va por OTA: `expo-keep-awake` ya está enlazada (`apps/mobile/package.json:67`) y ya se importa en `ExecutorV3.tsx:4`. **Punto de QA obligatorio (§7.1 de `DATA-TESTING.md`):** «keep-awake OFF + hold de 30 s sin tocar el teléfono».

**Sí entra (R18 + R31):** háptica en foreground al llegar a 0 · notificación local **«Terminó tu hold»** solo si ya hay permiso, con id `eva-hold-end` y `data.type = 'hold-end'` propios (para no barrer las del descanso), cancelada en los últimos ~2 s como hace `useRestTimerEngine.ts:270`.

- **CA-100 · La notificación del hold copia las 4 reglas del fix QA-10 (R31).** `apps/mobile/components/alumno/workout/timers/hold-notification.ts` se escribe **calcando** el patrón ya endurecido de `apps/mobile/components/alumno/workout/timers/cardio-notification.ts:15-21`, que a su vez lo copió 1:1 del descanso: **(a)** identificador estable —acá `eva-hold-end`— en cada `schedule`, para que re-agendar **reemplace** en vez de apilar; **(b)** **todas** las operaciones (`schedule`/`cancel`/`dismiss`/`sweep`) **serializadas por una cola de promesas**, que es lo que eliminó las carreras `cancel ↔ schedule` y las huérfanas apiladas en MIUI; **(c)** el `dismiss` retira además las ya **entregadas** del tipo `hold-end`; **(d)** un **sweep** al arrancar cancela cualquier programada huérfana del mismo tipo. Más el flujo de permiso compartido: **nunca promptea**, solo programa si el permiso **ya** está concedido (`getRestNotifPermission`); sin permiso es un no-op silencioso y el reloj de la pantalla funciona igual. Descanso, cardio y hold conviven en la misma sesión: compartir id o `data.type` haría que uno cancelara al otro.
- **CA-101 · El criterio de salida del hold se dice «vibra y avisa», nunca «suena» (R31).** Ni el copy del producto, ni el guion del aviso a Movens, ni el punto de QA pueden prometer sonido: lo que entrega el tren a 0 es **háptica en primer plano** y, con permiso ya concedido, la **notificación del SO**. La corrección se aplica también sobre el mockup v2 y el artifact del plan, que decían «suena a 0» (§18, punto 5).

---

## 13. Alcance (A–F)

| Familia | Qué entra |
|---|---|
| **A · Reloj en la superserie** | `HoldModuleV3` (RN + web) debajo del media de la tarjeta activa, anillo 80 px con CSS propio (`.exec-v3-holdmod`, R33), montado solo si hay duración (R29), para movilidad y fuerza por tiempo. Arranque manual (R21), guardado a 0 (V2), avance de miembro (V4), freno D2 con `pendingRoundRest` + `RestRoundContext` (R28), CueBar sin gesto (R23), estados de visibilidad con la fila siempre montada (R8 + R26) y el CTA «Descansar N s» / «Siguiente serie» (R24). |
| **B · «Iniciar hold» en la web** | `MobilityStepV3` con juicy «Iniciar hold» + «Listo» secundario, `started`, `endAtMs` y `prime(seconds)` en `useExecCountdown` (R27), sin «Registra abajo», paridad total con RN. |
| **C · Fuerza por tiempo** | Segmented «Reps \| Segundos» dentro de Fuerza en builder web y RN, validez 5–600 s, limpieza al cambiar de modo, `reps` espejo, preview, lista del día, ficha del coach, resumen, progresión «+ Peso / + Segundos» con «seg/ses» en las 5 superficies (R30), ejecutor con anillo 130 + tiles KG/SEG y los CTA de CA-50b, sin PR. Incluye las **2 migraciones aditivas** de R4, **aplicadas en W0** (R35). |
| **D · Guardado automático a 0** | `decideHoldAutolog` puro con `expiredWhileAway` (R27), `buildStrengthTimePayload` + `holdSidesFor` (R34), rama `per_side` propia en la web (R37), `metadata.hold_source` declarado en el schema, idempotencia, cola offline (RN verificada, web de fuerza ampliada), reconcile y optimismo, edición por lado (R7), background (R6), aviso R18 + R31 («vibra y avisa», nunca «suena»). |
| **E · Android** | **Sin código**: runbook de testers que ejecuta el owner (§17) + el cambio de copy «app en iOS» → «app en iOS y Android» **preparado y no aplicado** hasta que Google apruebe. |
| **F · Preferencia D5** | `auto-rest-pref` con default por cohorte en una constante (R25), lectura síncrona con caché (R36), modal de primera vez tras el Despegue (R32), fila de la tuerca renombrada, `clientId` en web, `is_demo` en el fetch raíz, reemplazo de la lectura de la pref en los **3 puntos reales** (§11.1, no los 4 del borrador de R1) y el CTA «Descansar N s» / «Siguiente serie» de R24. Requiere el mockup de la sección F aprobado (R10) antes de tocar UI. |

---

## 14. Fuera de alcance (declarado)

- **Roller con reloj** (R12): RN usa cronómetro ascendente y la web no tiene countdown ⇒ es trabajo nuevo, no reuso. Movens tiene **0 bloques roller con `duration_sec`**. `HoldModuleV3` nace con `kind: 'mobility' | 'strength_time'` y deja `'roller'` documentado como punto de extensión.
- **`holdAnchor` persistido** (R13): si el SO mata el proceso, el hold en curso se pierde.
- **Sonido al llegar a 0** (R18): sin QA de device previa.
- **Live Activity / lockscreen del hold**: exige build nativa.
- **PR / e1RM / celebración de récord en modo tiempo** (A4).
- **Sincronización servidor de la preferencia D5** (R1): exigiría una política RLS nueva sobre `client_feature_prefs`.
- **Frenar el salto de paso** tras la última serie del bloque (R5).
- **Cardio**: no se toca (regla del BRIEF y de las decisiones vigentes del ejecutor V3).

---

## 15. Métrica de éxito (R19)

### 15.1 Los 4 eventos PostHog

| Evento | Cuándo | Props |
|---|---|---|
| `hold_timer_started` | al tocar «Iniciar hold» / «Iniciar serie» | `{ block_id, exercise_type, context, side_mode }` |
| `hold_timer_completed` | al llegar a 0 y guardarse solo | `{ block_id, exercise_type, context, hold_source, closes_round, via_app_state }` |
| `hold_early_finished` | al tocar «Listo» antes de 0 | `{ block_id, exercise_type, context, elapsed_sec, prescribed_sec }` |
| `rest_autostart_pref_set` | al fijar el toggle D5 | `{ source: 'first_modal' \| 'settings_sheet', enabled }` |

- **CA-81** `context ∈ {'solo','superset'}` —el **mismo literal del contrato del motor** (§6.1 `decideHoldAutolog`), que es el que ya usan el contrato de datos y las props del evento en [DATA-TESTING.md](DATA-TESTING.md); si un emisor mandara `'standalone'`, los tres eventos `hold_*` quedarían partidos en dos series en PostHog. W6.1 emite este literal en las dos plataformas—; `exercise_type` es el tipo **efectivo**. Sin PII: ni nombre ni correo del alumno.
- **CA-82** RN emite con el wrapper `captureAppEvent(event, props)` (`apps/mobile/lib/analytics.ts`, no lanza y no bloquea); web con `ph?.capture(event, props)` (patrón `LogSetForm.tsx:895`). Se verifica con Grep que ninguno de los 4 nombres colisione con eventos existentes.
- **CA-83** Se **elimina** el `hold_auto_saved` propuesto en el brief original: es redundante con `hold_timer_completed`.

### 15.2 Consulta SQL de adopción (fuente de verdad a 72 h)

```sql
SELECT metadata->>'hold_source' AS hold_source, count(*)
FROM workout_logs
WHERE logged_at >= '<timestamp del deploy>'
  AND actual_hold_sec IS NOT NULL
GROUP BY 1;
```

- **CA-84 · Umbral de éxito.** A 72 h del deploy, en los holds de los alumnos de Movens, `hold_source = 'timer'` debe ser **> 50 %** de las filas con `actual_hold_sec` no nulo. Hoy la línea base es **0 %** (la clave no existe) y 29 de 32 holds venían de superseries escritos a mano. Un `'timer'` bajo con `hold_timer_started` alto significa que el alumno arranca el reloj pero no lo deja llegar a 0 ⇒ mirar `hold_early_finished`.
- **CA-85** `metadata` no tiene índice: la consulta va **siempre** acotada por `logged_at`, nunca a tabla completa.

### 15.3 Sentry

- **CA-86** Todo error del camino de auto-envío se reporta con `captureException(err, { tags: { area: 'hold-autolog' }, extra: { blockId, exerciseType } })` en **ambas** plataformas (patrón vivo: `apps/mobile/components/alumno/workout/v3/session-morph.tsx:311` usa `tags: { area: 'exec-v3-despegue' }`).
- **CA-87 · Umbral de alarma:** más del **2 %** de auto-envíos con error en 72 h ⇒ se revierte el auto-guardado por OTA (el módulo queda como reloj sin envío, camino manual intacto).

---

## 16. Riesgos

| # | Riesgo | Evidencia (`archivo:línea`) | Mitigación |
|---|---|---|---|
| **RG1** | **El descanso arranca solo y rompe V3.** Cualquier submit de una fila no logueada llama `startRest` si `autoTimerEnabled` | web `LogSetForm.tsx:2033-2047` y `:658-676`; RN `ExecutorV3.tsx:822-837` | La pref D5 (§11.2) es el único gate, en los **3 puntos reales** de §11.1 (2 en RN + el estado web), con lectura síncrona (CA-70c). Test de las 6 celdas de la tabla 2×3. |
| **RG2** | **El contexto de ronda se pierde con D2.** `restRoundContextRef` se resetea en cada commit y solo se llena dentro de la rama «ronda cerrada» | RN `ExecutorV3.tsx:696` (reset en cada commit), `:770-791` (única rama que lo arma), `:1763` (lo consume el interstitial) | `pendingRoundRest` guarda `{groupId, round, totalRounds, seconds, label, roundContext}` (**CA-40b**): el contexto se calcula **en el commit** y el CTA **repone** `restRoundContextRef.current` antes de `startRest(..., countKind:'ronda', setIndex, setTotal)` (`:796-802`). Sin esto, D2 pierde banner + dots + próxima ronda y la notificación imprime «Serie N de M». |
| **RG3** | **Doble envío de la serie.** El guardado por reloj no pasa por la guarda de doble-tap de la fila | RN `SetRow.tsx:942-956`; precedente `sentSetsRef` en cardio | Índice único `workout_logs_one_set_per_day` (`supabase/migrations/20260707120000_workout_logs_unique_set_per_day.sql:62`) + `savedRef` por `block:set:side` (CA-11). |
| **RG4** | **`hold_source` se estripa en la web.** `WorkoutLogSetSchema.metadata` es un `z.object` cerrado y Zod v4 estripa lo no declarado | `packages/schemas/workout.ts` (el comentario del archivo lo declara; por eso hubo que declarar `skipped`/`skip_reason`) | Declararla en el schema y en `WorkoutLogMetadata` (`packages/workout-engine/session-logs.reconcile.ts:38-41`). Test de round-trip web. |
| **RG5** | **El guard de serie vacía bloquea fuerza por tiempo en silencio** | `LogSetForm.tsx:~848` (`if (w == null && r == null) return`) | CA-52 + test que envía una serie solo con `actual_hold_sec` y verifica que llega a `logSetAction`. |
| **RG6** | **Editar un hold `per_side` borra el desglose.** `openSet` pasa el `typedCtx` sin `sideMode` a propósito | RN `ExecutorV3.tsx:556-562` (el comentario lo declara: «DELIBERADAMENTE SIN `sideMode`») y `:585-586` | R7 entra al tren: `sideMode` en el `typedCtx` + siembra de `hold_left_sec`/`hold_right_sec` desde `metadata`; toda edición reescribe `hold_source='manual'`. |
| **RG7** | **`reps_unit='sec'` rebota contra el CHECK y contra Zod** | `supabase/migrations/20260725221804_cardio_modality_axes.sql:54`; `packages/schemas/workout.ts:64` | R4 + R35: dos migraciones aditivas, texto copiado de LIVE con `pg_get_constraintdef`, tx-rollback antes de aplicar, y un solo orden — **W0 migra → W6 deploya → W6 OTA** (CA-26b). |
| **RG8** | **`duration_sec > 0` como señal convertiría 2 bloques reales en holds de 10 y 2 minutos** | 2 bloques strength en LIVE con `duration_sec` 600/120 y `reps_unit NULL` (STATS) | R3: el predicado exige `reps_unit === 'sec'` (AND, no OR) + test que congela el caso (CA-33). |
| **RG9** | **Un wall sit se cuela como PR «20 kg × 0 reps»** | `get_client_exercise_prs` no filtra `reps_done`; `apps/web/src/app/api/pr-card/route.tsx:77-86` selecciona `weight_kg` sin filtro de reps | R4: `CREATE OR REPLACE` con `reps_done > 0` + `.gt('reps_done', 0)` en la ruta. |
| **RG10** | **Flip del default de la pref rompe a la base viva.** Hoy sin clave ⇒ ON | RN `ExecutorV3.tsx:762`, `:822`; web `LogSetForm.tsx:330`, `:1667` (default `true`) | Default por cohorte (R1) + clave **nueva** namespaceada por `clientId`; `omni_autotimer` **no** es la fuente del default, pero sí se **copia** al crear la clave nueva (paso 2 de §11.1) y sigue siendo el carril único cuando `clientId == null` (CA-93). |
| **RG11** | **Dos toggles sobre el mismo `startRest`** si D5 entra como fila nueva | RN `ExecSettingsSheet.tsx:203-215`; web `ExecSettingsSheet.tsx:187-202` | CA-66: se **renombra** la fila existente, no se agrega una segunda. |
| **RG12** | **Datos falsos por vencimiento en background**: hoy el fin del lado 1 dispara `finishSide` **y** `restart`, así que el lado 2 arrancaría sin el alumno | RN `MobilityScreenV3.tsx:120-143` (`countdown.restart(holdSec)`) | R6 + §6.3: flag `expiredWhileAway` **derivado de la evidencia** (`endAtMs` + estado de la app), no del emisor del disparo — en RN el tick (`timing.ts:63-68`) puede ganarle al evento de `AppState` (`:73-79`) y en la web el `setInterval` solo se *throttlea* (`useExecCountdown.ts:71-83`); se guarda el **objetivo**, el lado 2 no arranca solo, copy honesto (§12 ítem 7). |
| **RG13** | **El módulo empuja el CTA fuera de pantalla** en teléfonos chicos | RN `SupersetScreenV3.tsx` (media 150 px) + `bottomClearance` del stepper (`ExecutorV3.tsx:1954`) | R8: corriendo se oculta la fila de cajas en superserie; QA de device en pantalla chica dentro del checklist. |
| **RG14** | **Hidratación (EVA-NEXTJS-18)**: leer `localStorage` en el primer render del ejecutor web rompe SSR | patrón vigente en `v3/exec-settings.ts` (hook hidratación-safe) | La pref se lee con el mismo hook hidratación-safe; el modal no se monta en el primer paint. |
| **RG15** | **Live Activity pisada**: `LiveActivityKind` no tiene `'hold'` y solo admite un `kind` a la vez | `apps/mobile/components/alumno/workout/timers/live-activity.ts:34`; `TimerProvider.tsx:126-131` | El módulo de hold **no** usa Live Activity (§14). |
| **RG16** | **`logged_at` tardío cruza medianoche** ⇒ la serie cae en otro día para el índice único y la racha | ventana Santiago en `apps/mobile/lib/workout-session.ts:989-991` | R13: se audita `day-completion`/racha en `DATA-TESTING.md` y el caso «vuelve después de medianoche» se declara **aceptado**, no resuelto. |
| **RG17** | **Baseline de CI rojo** se confunde con una regresión del tren | `nutrition-smoke` (job sin `NEXT_PUBLIC_SUPABASE_*`), `profile-analytics/overview.test.ts` (rojo por la hora del día) | R17: tabla «rojo antes del tren / rojo esperado después» en `DATA-TESTING.md`; ningún gate se declara verde sin ejecución real. |
| **RG18** | **Keep-awake OFF apaga la pantalla a mitad del hold** ⇒ el JS se congela y la rama R6 (objetivo guardado, lado 2 parado) se vuelve el camino normal, no la excepción | `ExecutorV3.tsx:229-241` (`if (execSettings.keepAwake)`), fila de la **misma** tuerca que este tren renombra | CA-96: W3 decide si el módulo fuerza `activateKeepAwakeAsync` con tag propio mientras `running`, aditivo y por OTA (`expo-keep-awake` ya enlazada, `apps/mobile/package.json:67`) + punto de QA «keep-awake OFF + hold de 30 s sin tocar el teléfono». |
| **RG19** | **La fila del miembro activo se desmonta al ocultarla** ⇒ `formRef` en `null` y el auto-envío web **no guarda nada, en silencio** (21/32 bloques de Movens, 6/9 alumnos en PWA) | `SupersetStepV3.tsx:289-372` (el `LogSetForm` vive dentro de la tarjeta activa); precedente `formRef.current?.requestSubmit()` en `LogSetForm.tsx:1819-1830` | CA-92: ocultar con `hidden`/`aria-hidden`/`inert`, nunca con condicional de render; test web-DOM + assert en el QA. |
| **RG20** | **`clientId` nulo comparte la preferencia entre alumnos del mismo navegador** (`eva:exec-autorest-v1:undefined`) | `page.tsx:68` contempla `rootUser === null`; los redirects miran `data.user`/`data.plan` | CA-93: `clientId = rootUser?.id ?? data.user?.id ?? null`; con `null` la pref **cae a la clave legacy por dispositivo** `omni_autotimer` (se lee y se escribe ahí, sin clave nueva) y el modal no se muestra (R32). No se inventa una clave `…:undefined` ni se fuerza ON: quedar ON pisaría un OFF previo del alumno en ese navegador. |

---

## 17. Android (E) — sin código

Estado: app Android en **closed testing Alpha** (1.1.2, build 86). La solicitud de producción salió el **06-09** y Google responde **≤ 13-09**. Hasta entonces Play devuelve «no disponible» a quien no sea tester. **No hay trabajo de código en este tren.**

### 17.1 Runbook «alumno Android hoy» (lo ejecuta el owner)

1. El coach manda los correos **Gmail** de sus alumnos con Android (los 6 de Movens sin app iOS, o los que él confirme).
2. El owner pega esos correos en la lista **«EVA TESTERS»** (Play Console → Testing → Closed testing, a nivel cuenta). El contador del panel cuenta **opt-ins**, no correos.
3. Cada alumno abre el link de opt-in (`play.google.com/apps/testing/cl.evaapp.eva`) **con esa misma cuenta Google** y acepta ser tester.
4. Recién ahí Play Store le muestra «Instalar». Sin el paso 3 la app no aparece, aunque el correo esté en la lista.
5. Instala build 86 (runtime 1.1.2) y entra con su código de coach: flujo estándar, sin cambios de este tren.
6. **Mientras tanto**, la web funciona igual en Android con el mismo link y clave.

### 17.2 Runbook «cuando Google apruebe»

1. Llega el correo de aprobación a la cuenta de Play.
2. Play Console → **Producción → Crear versión** con el **mismo AAB build 86** (no hay cambio nativo ⇒ no se fuerza build nueva).
3. Completar países de distribución (Chile como mínimo) y enviar a revisión.
4. Aprobado: Play pasa de «solo testers» a público general.
5. **Recién entonces** se aplica el cambio de copy (§17.3), se corren los tests que lo cubren y sale con el siguiente deploy/OTA.
6. Actualizar la fila de `docs/operations/MOBILE_RELEASES_OTA.md` que dice «closed testing Alpha de Play» y las entradas correspondientes de `docs/status/CURRENT.md`.

### 17.3 Copy en espera (preparado, **no aplicado**)

- **CA-88** El cambio «app en iOS» → «app en iOS y Android» se prepara en 2 archivos y 1 test — `apps/mobile/components/coach/InviteStudent.tsx:214`, `apps/web/src/lib/email/transactional-templates.ts:270` y su test `transactional-templates.test.ts:284` (que fija el string) — y **queda sin aplicar** hasta el correo de aprobación de Google. `TASKS.md` lo lleva como tarea explícitamente bloqueada.
- **CA-89** Las reglas de tienda no cambian por este tren: iOS sigue con cero menciones de pago; el único copy afectado es el de «Invitar alumno».

---

## 18. Decisiones del writer (para revisión del jefe)

Puntos en los que el OUTLINE calla y este SPEC decidió con los mapas:

1. **Enlaces relativos solo a los tres hermanos del slug.** El set del SDD está cerrado (`PLAN.md`, `TASKS.md`, `DATA-TESTING.md` existen), así que la cabecera y las referencias principales usan enlaces relativos a esos tres archivos —lo único que `scripts/check-docs.mjs` puede resolver dentro de la carpeta— y las menciones en línea quedan en backticks. Ninguna otra ruta del repo se enlaza: van siempre en code span con `archivo:línea`.
2. **«Siguiente serie» no re-arma el reloj**: el módulo vuelve a `idle` y el alumno debe tocar «Iniciar hold»/«Iniciar serie» otra vez (coherente con R21 y con la decisión vigente «nada corre solo al abrir una pantalla»). El OUTLINE fija el CTA pero no su efecto sobre el módulo.
3. **`hold_source` se arrastra entre lados con criterio conservador**: si cualquiera de los dos lados de un `per_side` fue `manual`, la serie completa se guarda como `'manual'`. R22 define el caso por lado pero no el valor de la fila única que resulta.
4. **El módulo se resetea también al cambiar de ronda**, no solo al cambiar de miembro (CA-21): en la web el reset de hoy depende solo de `activeBlockId`, así que la ronda 2 del mismo miembro heredaría el reloj de la ronda 1.
5. **Delta declarado contra el mockup aprobado: donde decía «suena a 0» ahora dice «vibra y avisa a 0».** El mockup v2 (artifact `bab4d4d3`) describía el criterio de salida con «suena a 0», pero §12 ítem 3 prohíbe prometer sonido: `sound.ts` declara que la reproducción real «se confirma en device» y R18 lo deja fuera del tren. **R31 cierra la divergencia corrigiendo la fuente**: el mockup v2 y el artifact del plan pasan a decir **«vibra y avisa a 0»**, y esa es la frase única del criterio de salida (CA-101). **Lo que entrega este tren:** háptica en primer plano al llegar a 0 y notificación local «Terminó tu hold» **solo si ya hay permiso**. **El sonido es backlog (B3), no alcance.** La misma frase se repite en (a) el guion del aviso a Gerardo de **W6** y (b) el punto de QA del hold — el owner hará el QA con el mockup en la mano y, sin esto escrito, no oiría nada y lo reportaría como bug.
6. **La línea del mockup «roller = misma pieza, caja "Seg"» queda superada por R12**: roller sale del tren y el módulo nace con `kind: 'mobility' | 'strength_time'` más un punto de extensión documentado. Se declara acá para que nadie lea el mockup como contrato vigente en ese punto.

---

## 19. Lo único abierto: Q1 del owner (no bloquea)

Los cinco puntos que este SPEC llevaba como «pendientes del jefe» quedaron **cerrados por R24–R38** y viven como reglas normales del documento: `alternating` en el eje hold ⇒ **R34 / CA-91** (solo `per_side` captura dos lados, vía `holdSidesFor`); ampliar `RestOptions` en la web ⇒ **R28 / CA-42b** (no se amplía: el rótulo viaja en `label`); keep-awake durante el hold ⇒ **R31 / CA-96** (W3 lo decide y lo deja escrito, con su punto de QA); presupuesto del CTA «Descansar N s» ⇒ **R24 + R38** (+0,25 d-a en W3 y en W4, dentro de los ≈ 12 d-a).

Queda **una sola pregunta abierta, que no bloquea el SDD ni la ejecución**:

- **Q1 · Default de la preferencia D5: por cohorte (recomendación del jefe) vs OFF global (letra de D5).** El SPEC implementa la **cohorte** (R1) y lo declara en **CA-70b**. La decisión está aislada en la constante `AUTOREST_DEFAULT_STRATEGY` de `auto-rest-pref.ts`, con la variante `'off'` cubierta por una fila del test `W1.T4`: si el owner responde «OFF global» **incluso después de W5**, el cambio es de **una línea por plataforma**, sin código nuevo ni QA nueva.

---

*Fin del SPEC. El contrato ejecutable (migraciones, payloads byte a byte, tests y checklist de QA) vive en `DATA-TESTING.md`; el orden de ejecución y el presupuesto en `PLAN.md`.*
