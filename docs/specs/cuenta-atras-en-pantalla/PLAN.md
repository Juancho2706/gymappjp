---
status: done
owner: product-engineering
last_verified: "2026-09-10"
canonical: false
---

# PLAN — Cuenta atrás en pantalla

Ver [SPEC](SPEC.md) · [TASKS](TASKS.md) · [DATA-TESTING](DATA-TESTING.md). Un solo tren (D1): rama
`rnmobiledenuevo`, **dos migraciones aditivas**, un deploy web y una OTA runtime **1.1.2**
android+ios. Sin dependencias nuevas, sin cambios nativos, sin DDL destructiva.
Esfuerzo total **12,25 ≈ 12 días-agente** (R38) + QA del owner.

Jerarquía que gobierna este archivo: `DECISIONS.md` (owner, V1–V4 y D1–D5) > las resoluciones del
jefe **R24–R38** > `DECISIONS-2` > `OUTLINE.md` §2 (R1–R23) > los mapas de `maps/` > este PLAN.
Ningún worker reabre V1–V4, D1–D5 ni R1–R38.

> **Corrección del supuesto A5 (refutada por R4).** El brief decía «sin migraciones». El CHECK
> `workout_blocks_poly_check` **no admite `reps_unit = 'sec'`**
> (`supabase/migrations/20260725221804_cardio_modality_axes.sql:51-65`, verificado en LIVE con
> `pg_get_constraintdef`) y el enum espejo de Zod tampoco
> (`packages/schemas/workout.ts:64`). El tren lleva **2 migraciones aditivas** y un orden único
> (**R35**): **W0 migra → W6 deploya → W6 OTA**. No hay ninguna migración que se aplique en W6.

---

## Arquitectura (sin cambios de capa)

```text
supabase/migrations/                 2 migraciones ADITIVAS (R4) — se APLICAN EN W0 (R35)
  <ts>_workout_blocks_reps_unit_sec.sql        DROP+ADD workout_blocks_poly_check + 'sec'
  <ts>_get_client_exercise_prs_reps_filter.sql CREATE OR REPLACE + AND reps_done > 0
        │
packages/schemas/workout.ts          REPS_UNIT_VALUES += 'sec' · metadata += hold_source
                                     superRefine 5–600 s cuando reps_unit === 'sec'
packages/plan-builder/               types.ts RepsUnit += 'sec'
  block-type-fields.ts               + stripFieldsForStrengthMode(block, 'reps'|'sec', durationSec)
        │
packages/workout-engine/             MOTOR PURO (sin React / Supabase / RN)
  hold-autolog.ts        (nuevo)     decideHoldAutolog({reason, elapsedSec, prescribedSec, side,
                                       context, closesRound, expiredWhileAway}) → decisión,
                                       NUNCA descansos                     (R27)
  set-log-payload.ts                 + buildStrengthTimePayload(...)   (buildStrengthPayload INTACTO)
  workout-exercise-type.ts           + isStrengthTimeBlock · formatStrengthTimeObjective
                                       + rama strength de legacyRepsSummaryFor
  keypad-flow.ts                     + strengthTimeMode y sus 2 juegos de pasos
  logged-set-summary.ts              + formatStrengthTimeSetLine  (formatLoggedSetLine INTACTO)
  session-summary.ts                 hold de fuerza enciende el mapa muscular (R16)
  session-logs.reconcile.ts          + HoldSource y metadata.hold_source
  repeat-seed.ts                     la semilla NO hereda hold_source
  superset-rounds.ts                 CERO diff (V4 y D2 salen del motor que ya existe)
        │
        ├── apps/web   → v3/HoldModuleV3.tsx (nuevo) + useExecCountdown ext. → pasos V3 (Fable)
        └── apps/mobile→ v3/HoldModuleV3.tsx (nuevo) + v3/use-hold-module.ts → pantallas V3 (Fable)
        │
        └── preferencia D5: v3/auto-rest-pref.ts (nuevo, uno por plataforma), puro + storage local
```

Regla dura de arquitectura para las waves de producto (W2–W5): **el motor es el único dueño de la
semántica**. Web y RN **no** reimplementan el predicado del modo tiempo, la decisión de guardado a 0,
el cierre de ronda ni el formato de las líneas de log: consumen `@eva/workout-engine` y
`@eva/plan-builder`. El barrel `packages/workout-engine/index.ts` lo toca **solo W1**.

Tres invariantes que ningún wave puede romper:

1. **El módulo de reloj nunca guarda ni arranca descansos.** RN emite `onCommit(payload, source)` y el
   payload lo construye el motor; la web emite `holdPrefill.submit` y el envío lo hace
   `formRef.current?.requestSubmit()` sobre el `<form>` del `LogSetForm` — el mismo camino ya probado
   por cardio (`apps/web/src/app/c/[coach_slug]/workout/[planId]/LogSetForm.tsx:1829`).
2. **El video no se colapsa nunca** (V1): el módulo se monta **debajo** de `ExecMediaV3` /
   `ExecMediaCard`, jamás en su lugar.
3. **La preferencia D5 gobierna solo el arranque del cronómetro de descanso** (R1). Nunca gobierna el
   avance de miembro (V4) ni el salto de paso (R5).

---

## Waves — resumen

| Wave | Qué entra | Depende de | Días-agente | Modelo del worker | Gate de salida |
|---|---|---|---|---|---|
| W0 · Decisiones + DB | 2 migraciones aditivas validadas con tx-rollback **y aplicadas en LIVE** (R35); enums de `@eva/schemas` y `@eva/plan-builder`; `stripFieldsForStrengthMode` | — | 1 | **Opus** | vitest de `packages/schemas` + `packages/plan-builder` verde; `ROLLBACK` ejecutado y registrado; M1 y M2 en `list_migrations` |
| W1 · Motor puro | `hold-autolog.ts`, `buildStrengthTimePayload`, `isStrengthTimeBlock`, keypad `strength_time`, resúmenes, mapa muscular, guard de progresión, tests (incl. `superset-rounds.test.ts`) | W0 | 2 | **Opus** | `pnpm exec vitest run packages/workout-engine` verde con los casos de aceptación de TASKS W1 |
| W2 · Coach | Builder web + RN «Reps \| Segundos», validez única, preview, chips, ficha, print, serialize RN, **«seg/ses» en los 5 lugares que hoy dicen «rep/ses» (R30)** | W1 | 2 | Opus (datos) + **Fable (UI)** | vitest web + `pnpm typecheck` + `tsc --noEmit` mobile |
| W3 · Alumno RN | `HoldModuleV3` + `use-hold-module`, superserie (R8/V4/D2/CueBar), movilidad, fuerza por tiempo, `pendingRoundRest` con `RestRoundContext` (R28), edición R7, `expiredWhileAway` + `prime()` (R27), `holdSidesFor` (R34), `hold-notification` (R31), **CTAs «Descansar N s» / «Siguiente serie» (R24)** | W1 (el mockup **v2 ya aprobado**, secciones A y B, cubre lo `[UI · Fable]`) | 2,75 | Opus (datos) + **Fable (UI)** | `pnpm --filter @eva/mobile exec tsc --noEmit` + `expo export --platform android` |
| W4 · Alumno web | `HoldModuleV3` web, `useExecCountdown` ext. (`started`, `expiredWhileAway`, `prime`), superserie, movilidad (B), fuerza por tiempo, `LogSetForm` (R15 + **rama `per_side` propia, R37**), `pendingRoundRest`, `pr-card`, **CSS nuevo `.exec-v3-holdmod` (R33)**, **CTAs R24** | W1 (el mockup **v2 ya aprobado**, secciones A, B y C, cubre lo `[UI · Fable]`) | 2,25 | Opus (datos) + **Fable (UI)** | vitest web + `pnpm typecheck` |
| **M · Mockup F aprobado** | Sección F del artifact: modal de primera vez + fila de la tuerca, RN y web, con los copys de R11b | W3, W4 (estados reales) | 0,25 | **Fable (jefe)** | **Aprobación explícita del owner por artifact — sin ella W5 no arranca** |
| W5 · Preferencia D5 | `auto-rest-pref` con cohorte, modal de una vez, tuerca renombrada, `clientId` web, `is_demo`, reemplazo de la lectura de la preferencia en sus **3 puntos reales** (2 en RN + el estado de `WorkoutExecutionClient.tsx:1222-1227` en web; en web **no existe** `isRestAutoTimerEnabled`) | W3, W4, **M** | 1 | Opus (datos) + **Fable (UI)** | vitest + `tsc --noEmit` mobile + `expo export` |
| W6 · Cierre | Analytics R19, Sentry, docs, gates reales, Playwright del caso canónico con **seed sintético**, QA del owner en 3 plataformas, **verificar** M1/M2 (ya aplicadas en W0) → deploy web → OTA, aviso general a coaches | todo | 1 | **Fable (jefe)** + owner | Tabla de gates con salida real + QA del owner verde |

**Orden duro (R20 + R35)**: W0 → W1 → (W2 ‖ W3 ‖ W4) → M → W5 → W6, con un solo orden de salida:
**W0 migra → W6 deploya → W6 OTA**. W2, W3 y W4 pueden correr en paralelo porque solo comparten el
contrato de W1; el barrel del motor ya quedó cerrado en W1.

**Presupuesto (R38): 12,25 ≈ 12 días-agente.** Se arma así: los **11 d-a** del OUTLINE §7,
**+0,25** por el paso **M** de mockups (la sección F que el propio R10 exige y §7 no
presupuestaba), **+0,5** porque **W6 sube de 0,5 a 1 d-a** (4 eventos de analytics, Sentry
en dos plataformas, 4 documentos, Playwright, 1 deploy, 2 OTA y el aviso a coaches — el mismo cierre
costó 1 d-a en el tren `ciclo-real-y-por-lado`) y **+0,5** por las dos tareas `[UI · Fable]` de
**R24** (CTAs «Descansar N s» / «Siguiente serie»), **+0,25 en W3** y **+0,25 en W4**. Las tres
tareas de bloqueo que descubrieron los writers (`holdSource` en el carril tipado, la fila de fuerza
del auto-envío web, el predicado de montaje) y el formateador de progresión con sus 5 consumidores
**se absorben dentro de sus waves**: no suman d-a (decisión del jefe, R38).

**Orden de recorte si no cabe (R38), en este orden y no en otro:** (1) la **notificación del SO** del
hold — `TASKS` **W3.6** (R18/R31); (2) el **mapa muscular** del hold de fuerza — `TASKS` **W1.9**
(R16); (3) el **Playwright del caso canónico** — `TASKS` **W6.10**, que queda **con causa anotada**
en `TEST_STATUS`. Nunca se recortan las migraciones, los tests de paridad ni las CTAs de R24 (sin
ellas el alumno nuevo con la preferencia OFF **no tiene cómo descansar**). ⚠ Punteros verificados
contra `TASKS`: **W3.10** es *montar `HoldModuleV3` en `SupersetScreenV3`* —la feature A completa, lo
único que pidió Movens— y **W1.8** es `formatStrengthTimeSetLine`; ninguno de los dos es recortable.

Criterio de salida del tren: en el plan **«Dia B»** de Movens, la superserie B muestra el reloj bajo
el video, llega a 0, guarda sola y salta al press pallof (V1+V2+V4); al cerrar la ronda espera el
toque en «Ronda lista · Descansar 90 s» (D2); «plancha frontal mantenida» se prescribe como fuerza
por tiempo `3 × 30 s · 10 kg` (D3); y un coach que solo usa reps tiene **0 diff** en payload y en
resumen.

---

## W0 · Decisiones y DB — 1 día-agente · **Opus**

**Objetivo.** Que `reps_unit = 'sec'` y `metadata.hold_source` sean **legales** en la DB y en Zod
antes de que exista una sola línea de UI que los escriba. Bloquea todo el tren.

**Archivos exactos.**

| Archivo | Cambio |
|---|---|
| `supabase/migrations/<ts>_workout_blocks_reps_unit_sec.sql` (nuevo) | `ALTER TABLE public.workout_blocks DROP CONSTRAINT IF EXISTS workout_blocks_poly_check;` + `ADD CONSTRAINT` con la **definición vigente copiada literal desde LIVE** (`SELECT pg_get_constraintdef(oid) …`, **nunca de memoria**) y la única diferencia `reps_unit = ANY (ARRAY['reps','passes','breaths','jumps','floors','sec'])`. Precedente exacto del patrón: `supabase/migrations/20260725221804_cardio_modality_axes.sql:49-65` (ya hizo esto para `'jumps'`/`'floors'`). **0 filas afectadas** (LIVE: `SELECT reps_unit, count(*)` ⇒ `NULL 8878, passes 72, reps 4, floors 2, breaths 2, jumps 2`; ninguna `'sec'`). Rollback en la cabecera: `UPDATE … SET reps_unit = NULL WHERE reps_unit = 'sec'` + recrear el constraint sin `'sec'`. |
| `supabase/migrations/<ts>_get_client_exercise_prs_reps_filter.sql` (nuevo) | `CREATE OR REPLACE FUNCTION public.get_client_exercise_prs(...)` sobre el linaje vigente, sumando `AND wl.reps_done IS NOT NULL AND wl.reps_done > 0` al `WHERE`. Hoy la RPC filtra **solo** por `weight_kg > 0`, así que un hold con disco entraría como récord «20 kg × 0 reps» (`reps_at_max = COALESCE(reps_done,0)`). Misma firma, mismos grants, `REVOKE`/`GRANT` reponidos del linaje. Corrige además un caso preexistente. |
| `packages/schemas/workout.ts:64` | `REPS_UNIT_VALUES` += `'sec'`, y actualizar el doc `:58-63` nombrando la migración nueva (ese comentario declara ser «superset EXACTO del CHECK»: tiene que seguir siéndolo). |
| `packages/schemas/workout.ts:301-320` | `WorkoutLogSetSchema.metadata` += `hold_source: z.enum(['timer','manual']).nullable().optional()`. **Sin esto, Zod v4 estripa la clave y `hold_source` nunca llega a la DB por el camino web** (el propio archivo lo documenta en `:293-297`, por eso hubo que declarar `skipped`/`skip_reason`). |
| `packages/schemas/workout.ts:163-190` (`superRefine`) | Regla nueva: `reps_unit === 'sec'` exige `duration_sec` entre **5 y 600** (R11). No toca la rama de cardio. |
| `packages/plan-builder/types.ts:22` | `RepsUnit` += `'sec'`. |
| `apps/web/src/domain/workout/types.ts:34` | Espejo de `RepsUnit` en el dominio web (r4 §0.1); si los dos enums no se mueven juntos, el builder web no compila. |
| `packages/plan-builder/block-type-fields.ts` (tras `:114`) | **Nuevo export** `stripFieldsForStrengthMode(block, mode: 'reps' \| 'sec', durationSec?)`. `'sec'` ⇒ `{duration_sec, reps_unit: 'sec', progression_mode: mode === 'double' ? 'weekly_linear' : igual}`; `'reps'` ⇒ `{duration_sec: null, reps_unit: null}` con **`null` explícito, nunca `undefined`** (regla R32 documentada en `:12-17`: en RN un `undefined` es no-op y `_raw` repone el valor viejo). **No toca** `sets`, `target_weight_kg`, `rir`, `tempo`, `rest_time`, `warmup_rest_time`, `side_mode`, `superset_group` (D3). `reps_value` **no** se escribe (R3: sin consumidores verificados). |

**No se toca en W0**: `workout_blocks.reps` sigue `NOT NULL` con `min(1)` en Zod (`:128`) — el espejo
lo escribe el builder en W2; `duration_sec` ya lo acepta el CHECK (`duration_sec >= 0`) y Zod
(`:156`, `0..86400`); `actual_hold_sec` es `integer NULL` **sin CHECK**; el índice único
`workout_logs_one_set_per_day` (creado en `supabase/migrations/20260707120000_workout_logs_unique_set_per_day.sql:62`)
**ya da la idempotencia del guardado automático** y no se modifica.

**Protocolo LIVE (no negociable, regla del owner).** Antes de aplicar: transacción con el
`DROP`+`ADD` del CHECK y un `INSERT` de prueba con `reps_unit='sec'` ⇒ `ROLLBACK`; conteo previo de
filas que violarían el constraint nuevo (debe ser **0**); `EXPLAIN` de `get_client_exercise_prs`
antes y después del filtro.

**Cuándo se aplican: M1 y M2 SE APLICAN EN LIVE EN W0, apenas cierra el tx-rollback (R35).** No hay
ninguna migración «para W6»: dejarlas ahí rompía las waves del medio, porque durante W2/W3/W4
cualquier guardado real con `reps_unit='sec'` rebota con **`23514`** y —como el builder guarda **por
programa completo**— se pierde el plan entero; tampoco se podrían ejecutar el round-trip de W2 ni el
punto de DB del Playwright. Aplicarlas en W0 es seguro y **aditivo puro**: 0 filas afectadas y
**ningún cliente desplegado hoy puede escribir `'sec'`** (el enum de Zod aún no lo tiene), así que no
existe ventana rota — el código que escribe `'sec'` sale recién con el deploy de W6. El orden del
tren queda en una sola línea: **W0 migra → W6 deploya → W6 OTA**. W6 no aplica nada: **verifica** que
las dos estén en `list_migrations` y que la ACL de `get_client_exercise_prs` siga idéntica **antes**
de desplegar. `TASKS` y `DATA-TESTING` llevan este mismo orden (M1/M2 numeradas dentro de W0; W6
solo verifica).

**Efecto de M2 sobre datos ya listados (R35).** El filtro `reps_done > 0` cambia récords **que hoy ya
se muestran**: **617 filas, 25 alumnos, 72 pares (alumno × ejercicio) afectados**. Se aplica igual en
W0 y se avisa en **una línea del aviso general a coaches** del cierre (`news_items`), **sin mensajes
individuales**.

**Dependencias.** Ninguna. Es la primera wave.

**Criterios de salida.** (1) `reps_unit='sec'` acepta en LIVE dentro de una tx y el `ROLLBACK` queda
registrado en `DATA-TESTING.md`; (2) un `metadata` con `hold_source` sobrevive el parse de
`WorkoutLogSetSchema` y uno con `hold_source: 'otro'` se rechaza; (3) un bloque strength clásico
valida **byte-idéntico**; (4) `stripFieldsForStrengthMode` hace round-trip reps→sec→reps dejando
`null` explícito.

**Gate real.** `pnpm exec vitest run packages/schemas packages/plan-builder`
(⚠ **no existe** `pnpm --filter @eva/schemas test`: esos paquetes **no tienen script `test`** —
verificado en sus `package.json`; los tests de `packages/**` corren bajo el project `web-node`,
`vitest.config.ts:55,86-90`).

---

## W1 · Motor puro — 2 días-agente · **Opus**

**Objetivo.** Que toda la semántica nueva (decisión de guardado a 0, payload de fuerza por tiempo,
predicado del modo, formatos) exista como funciones **puras testeadas** antes de que web y RN la
consuman. Bloquea W2, W3, W4 y W5.

**Archivos exactos.**

| Archivo | Cambio |
|---|---|
| `packages/workout-engine/hold-autolog.ts` (**nuevo**) | `HoldEndReason = 'expired' \| 'done-early' \| 'paused' \| 'restart'`, `HoldAutologDecision`, `decideHoldAutolog(...)` con la tabla canónica del OUTLINE §4, **con el campo renombrado a `expiredWhileAway` (R27)**: la señal se **deriva de evidencia** (`(now - endAtMs) > 1500 ms` o app no activa), nunca del emisor del disparo, y `autoStartNextSide = advanceSide && !expiredWhileAway`. `viaAppState` **no es nombre de este tren**. También sale de acá **`holdSidesFor(sideMode)` (R34)**: `per_side` ⇒ `['left','right']`, `alternating` y `null` ⇒ `['single']`, con test en W1 y assert de paridad web↔RN; lo consumen `buildStrengthTimePayload`, el `keypad-flow` de fuerza por tiempo y `use-hold-module`. Devuelve `{fillSeconds, submit, holdSource, advanceSide, autoStartNextSide, advance}`. **Reusa** el acumulador de reloj de pared de `cardio-autolog.ts:84-116` (`createCardioElapsed`…, son tipo-agnósticas) — **no lo duplica**; aplica el mismo tope `min(elapsed, prescribedSec)` de `cardio-autolog.ts:64-70` y el mismo `elapsed <= 0 ⇒ NO_OP` de `:64`. Hermana `mergeHoldCaptureValues` (espejo de `mergeCardioCaptureValues`, `:212-232`) para que la semilla de la fila y el payload del auto-envío sean **la misma mezcla**. **Nunca arranca descansos.** No toca cardio. |
| `packages/workout-engine/set-log-payload.ts` (tras `:281`) | **Nuevo export** `buildStrengthTimePayload(values, blockId, setNumber, ctx?: {sideMode?, holdSource?})` ⇒ `weightKg: num(values.weight)`, **`repsDone: null`** (nunca 0), `actualHoldSec` (L+R en `per_side`), **`actualDurationSec` ausente**, `rpe`, `rir`, `note`, `metadata` **solo** si hay lados o `holdSource` (misma convención de `:279`). Interna `strengthHoldValues(values, sideMode)` que reusa la lógica de la rama mobility `per_side` de `typedLogValues` (`:121-130`). |
| `packages/workout-engine/set-log-payload.ts:250-281` | **PROHIBIDO TOCAR** `buildStrengthPayload`. Está congelado por 30+ asserts (`set-log-payload.strength-side.test.ts`, `set-log-payload.per-side.test.ts`, `executor-mapping.parity.test.ts:290-330`). Función nueva > sobrecarga. |
| `packages/workout-engine/workout-exercise-type.ts` | Tras `:46`: `STRENGTH_TIME_REPS_UNIT = 'sec'`. Tras `:95`: **`isStrengthTimeBlock(block, exercise)`** = `effectiveExerciseType(...) === 'strength' && block.reps_unit === 'sec' && (block.duration_sec ?? 0) > 0` — **fuente única**, nadie compara `reps_unit === 'sec'` a mano. `:184-189` (rama strength de `legacyRepsSummaryFor`): devolver `compactDuration(duration_sec) + sideSuffix(side_mode)` **antes** del `if (block.reps?.trim())` de `:185`. Tras `:217`: `formatStrengthTimeObjective(block)` ⇒ `"3 × 30s"` / `"3 × 30s por lado"`. `typedBlockSummary` (`:197-217`) **sin cambio**: con `reps = "30s"` la rama `:202` ya produce `"3×30s"`. |
| `packages/workout-engine/set-log-payload.ts:143-150` (`TypedPayloadContext`) y `:162-169` (`buildLogMetadata`) | **Corrección de bloqueo (CA-28/CA-31/CA-84).** El carril **tipado** —el que usa **movilidad**, o sea el caso que originó el tren: **21 de 32** bloques de Movens— hoy no tiene por dónde marcar la fuente: `buildStrengthTimePayload` recibe `holdSource`, pero movilidad envía con `buildTypedPayload`, cuyo contexto **solo conoce `hrMetadata`** (`:143-150`) y cuyo `metadata` se define **solo** en `per_side` (`:120-136`, `:205-208`). Sin esto `metadata.hold_source` **no tiene escritor en movilidad**: CA-28 sería falso y la métrica «> 50 % `'timer'`» de SPEC §15.2 inmedible, y R7 no podría escribir `'manual'`. Entra: `TypedPayloadContext` gana **`holdSource?: HoldSource \| null`** y `buildLogMetadata(side, hr, holdSource)` lo **mezcla igual que `hr`** ⇒ el bilateral **también** gana `metadata: { hold_source }` y el `per_side` lo lleva **en el MISMO objeto** que `{left_sec, right_sec}` (el jsonb se reemplaza entero). **Test obligatorio de las 3 claves** (`left_sec`, `right_sec`, `hold_source`) en `per_side` y de `{hold_source}` solo en bilateral, **más** el test de que **sin `holdSource` el payload sigue byte-idéntico** (sin la key `metadata`, los 30 asserts de paridad intactos). Consecuencia documental: `SPEC` §9.2 y `DATA-TESTING` §3.3 registran también la **firma de movilidad**, no solo la de fuerza por tiempo. **Alcance de la marca (DECISIONS-2 · DATA-2, obligatorio)**: `hold_source` se escribe en **todo hold guardado — movilidad, roller y fuerza por tiempo**; el **roller siempre `'manual'`** (no tiene reloj en este tren, R12). Así la métrica de adopción es **única** y ningún hold guardado queda `sin_marca`, que sería un tercer estado en §8.2 que nadie definió. |
| `packages/workout-engine/typed-keypad.ts` | **CERO diff** (el modo tipado no gana miembro; la marca de fuente viaja por el **contexto** del payload, fila de arriba, no por el keypad). `TypedKeypadMode` **no** gana miembro: fuerza no cruza al carril tipado, porque `buildTypedPayload` fuerza `weightKg: null` (`set-log-payload.ts:191`) y `rir: null` (`:199`) — borraría el disco y el esfuerzo (R18 del tren anterior). |
| `packages/workout-engine/keypad-flow.ts` | Tras `:70` (`KeypadTarget`): `strengthTimeMode?: boolean`, hermano de `sideMode`. Tras `:108`: `STRENGTH_TIME_KEYPAD_STEPS = [weight, {key:'actual_hold_sec', mode:'integer', unit:'seg', label:'Segundos'}]` y `STRENGTH_TIME_PER_SIDE_KEYPAD_STEPS = [weight, hold_left_sec, hold_right_sec]` — **mismas keys que movilidad** (`typed-keypad.ts:102-103`) para que el motor las lea con una rama sola. En `keypadStepsForTarget` (`:153-167`), entre `:163` y `:164`, la rama por `target.strengthTimeMode`. `typedTargetFor` (`:132-141`) **sin cambio**: strength sigue devolviendo `null`. |
| `packages/workout-engine/logged-set-summary.ts` (tras `:182`) | **Nuevo export** `formatStrengthTimeSetLine(log)` ⇒ `"10 kg × 30 s"`, `"10 kg × 30 s por lado"`, asimétrico `"10 kg × Izq. 30 s · Der. 25 s"`, sin peso `"30 s"`, sin hold `null`. Reusa `loggedSideSeconds` (`:76-83`). **`formatLoggedSetLine('strength') sigue devolviendo `null`** (`:154`): es el interruptor documentado en `:167-171` y **no se toca**. |
| `packages/workout-engine/session-summary.ts` | `:35-45` (`SummaryBlock`) += `reps_unit`. `:201-235` (rama strength, R16): un bloque en modo tiempo **no** aporta a `strengthVol` (`:233`, es una barra en kg) pero **sí** a `muscleWork` (`:234`) con el mismo proxy que ya usa movilidad en `:195` ⇒ la plancha con disco enciende el core. |
| `packages/workout-engine/session-logs.reconcile.ts` | Tras `:11`: `export type HoldSource = 'timer' \| 'manual'`. `:13-24` (`WorkoutLogSideMetadata`) += `hold_source?: HoldSource \| null` con el doc de quién la escribe y de que `undefined` = log anterior al tren (**nunca** «manual»). `:38-41`, `:79`, `:116`, `:156-195` sin cambio: heredan por composición ⇒ cola offline y reconcile lo transportan gratis. |
| `packages/workout-engine/session-logs.optimistic.ts` | **Cero diff** (`:58` ya preserva `metadata` íntegro). |
| `packages/workout-engine/repeat-seed.ts:102` | Strippear `hold_source` de la semilla: la fuente del hold de HOY se decide hoy, no se hereda. Precedente en el mismo archivo (`:10-12`, la nota tampoco se siembra). |
| `packages/workout-engine/day-completion.ts`, `cycle-completions.ts`, `superset-rounds.ts`, `pr-detect.ts`, `workout-save-reconcile.ts` | **Cero diff en los cinco.** V4 y D2 salen del `isRoundComplete` / `firstIncompleteInRounds` que ya existen; `detectPR` descarta solo por `reps_done > 0` ⇒ A4 se cumple sin código. |
| `packages/workout-engine/index.ts` (tras `:45`) | `export * from './hold-autolog'`, junto a `cardio-autolog`. **Único wave que edita el barrel.** |
| `apps/web/src/lib/workout-exercise-type.ts:80-89,133-152` | **Colapsar las copias**: re-exportar `hasTypedPrescription`, `typedBlockSummary`, `isStrengthTimeBlock` y `formatStrengthTimeObjective` del motor, igual que ya se hizo con `legacyRepsSummaryFor` (`:126`). Sin esto hay que replicar la rama strength a mano ⇒ drift garantizado. |
| `apps/web/src/lib/workout/progression.ts:50-59` y `:142-149` | `ProgressionBlockInput` += `reps_unit`, `duration_sec`. **Guard D4**: en modo tiempo, `case 'double'` cae a `weekly_linear`. Es **obligatorio, no cosmético**: `parseRepsTop('30s')` devuelve **30** (`:42-48`, regex `\d+`) ⇒ hoy la doble progresión trataría 30 segundos como 30 reps y subiría el peso sola. Comentario en `:42` avisando que ese número no son reps. |
| `packages/workout-engine/workout-exercise-type.ts` (tras `formatStrengthTimeObjective`) | **Nuevo export `formatProgressionTag(block)`** ⇒ `+{n} kg/sem` \| **`+{n} seg/ses`** \| `+{n} rep/ses`, resolviendo la unidad con `isStrengthTimeBlock`. **Decisión del writer 4**: el crítico lo pedía como tarea de W2, pero el formateador vive en el motor y **el barrel `index.ts` lo toca solo W1** (regla dura de arquitectura de este PLAN) ⇒ **se crea en W1 y se cablea en W2**. Sin él, D4 remapea `progression_type='reps'` y **cinco** superficies siguen imprimiendo «rep/ses» —dos en la cara del alumno—: una plancha que sube 5 s por sesión se anuncia «+5 rep/ses» en el ejecutor y en el PDF. |

**Tests que crea o amplía esta wave** (detalle por caso en [TASKS](TASKS.md) W1 y en
[DATA-TESTING](DATA-TESTING.md)): `hold-autolog.test.ts` (nuevo, la tabla del OUTLINE §4 completa),
`set-log-payload.strength-time.test.ts` (nuevo), **`superset-rounds.test.ts` (nuevo — hoy no existe;
V4 y D2 se apoyan enteros en `isRoundComplete` y no tiene test propio en el paquete)**,
`superset-holds.parity.test.ts` (nuevo, caso canónico «Dia B»), y ampliaciones de
`workout-exercise-type.test.ts` (congela H8), `keypad-flow.test.ts`, `logged-set-summary.test.ts`,
`session-summary.test.ts`, `day-completion.test.ts`, `pr-detect.test.ts`, `repeat-seed.test.ts`,
`session-logs.reconcile.test.ts`, `executor-mapping.parity.test.ts` y
`apps/web/src/lib/workout/progression.test.ts`.

**Dependencias.** W0 (los enums y el schema tienen que existir antes de que el motor los tipee).

**Criterios de salida.** (1) `decideHoldAutolog` cubre las 8 filas de la tabla del OUTLINE §4 con
test, **con `expiredWhileAway` (R27) probado por los dos caminos de disparo —tick y AppState /
`visibilitychange`— con reloj falso y el mismo resultado**, y `holdSidesFor` (R34) cubre `per_side`,
`alternating` y `null`; (2) `isStrengthTimeBlock({duration_sec: 600, reps_unit: null})` ⇒ **`false`** (congela los 2
bloques strength legacy de LIVE con `duration_sec` 600 y 120); (3) el payload de un coach que solo
usa reps es **byte-idéntico** (test de identidad sobre `buildStrengthPayload`);
(4) `formatLoggedSetLine('strength', …)` sigue devolviendo `null` con y sin `actual_hold_sec`;
(5) un bloque de reps con `progression_mode: 'double'` da resultado byte-idéntico;
(6) **`buildTypedPayload('mobility', …, {sideMode:'per_side', holdSource:'timer'})` devuelve
`metadata: { left_sec, right_sec, hold_source }` (las 3 claves) y el bilateral devuelve
`metadata: { hold_source }`**, mientras que **sin `holdSource` el payload no gana la key `metadata`**;
(7) `formatProgressionTag` devuelve `+5 seg/ses` en modo tiempo y `+2 rep/ses` / `+2,5 kg/sem` en los
otros dos, con test de los tres casos.

**Gate real.** `pnpm exec vitest run packages/workout-engine packages/schemas packages/plan-builder`
+ `pnpm exec vitest run apps/web/src/lib/workout/progression.test.ts`.

---

## W2 · Coach: «Reps | Segundos» dentro de Fuerza — 2 días-agente · Opus (datos) + **Fable (UI)**

**Objetivo.** Que el coach pueda prescribir una plancha con disco o un wall sit **sin disfrazar el
ejercicio de Cardio**, con carga, RIR, tempo, descanso, lado y progresión intactos (D3), y que toda
superficie del coach diga la verdad (`3 × 30 s · 10 kg`).

**Capa de datos y validez — Opus.**

| Archivo | Cambio |
|---|---|
| `apps/web/src/app/coach/builder/[clientId]/components/BlockEditSheet.tsx:580-591` | Rama strength de `blockIsValid` (`:590`) pasa a `sets >= 1 && (modoSeg ? duration_sec ∈ [5,600] : !!reps?.trim())`. |
| `apps/web/src/app/coach/builder/[clientId]/WeeklyPlanBuilder.tsx:945-959` y `:1017-1024` | `blockIncomplete` acepta el modo tiempo; **`reps` espejo**: en modo segundos se puebla con `legacyRepsSummaryFor(...)` (que W1 ya sabe resolver) porque `workout_blocks.reps` es `NOT NULL` y Zod exige `min(1)`. `duration_sec` (`:1056`) y `reps_unit` (`:1050`) **ya viajan**: cero cambios de mapper. |
| `apps/mobile/app/coach/program-builder.tsx:78-91` | Espejo de la validez RN (strength `:90`) + copy de la alerta `:1939`. |
| `apps/mobile/lib/plan-builder/serialize.ts:84` | `reps` espejo: en modo tiempo pasa por `legacyRepsSummaryFor` en vez de `b.reps || '8-10'`. Sin esto el coach guarda `"8-12"` con un reloj de 30 s. `editedTypedColumns` (`:111-135`) ya escribe `reps_unit`/`duration_sec` **si están definidos** ⇒ la conmutación a Reps debe mandar **`null` explícito** (vía `stripFieldsForStrengthMode` de W0). |
| **Extraer `isBlockComplete(block, type)` al motor** | La misma regla de validez está copiada en **tres** archivos (`BlockEditSheet.tsx:590`, `WeeklyPlanBuilder.tsx:958`, `program-builder.tsx:90`). Se extrae una función pura y los tres la llaman. Es la única forma de que el modo tiempo no quede válido en un builder e inválido en el otro. |
| **Tarea R30 · «+ Segundos» en TODAS las superficies que hoy dicen «rep/ses»**, los 5 puntos: `apps/web/src/app/c/[coach_slug]/workout/[planId]/WorkoutExecutionClient.tsx:749` **(cara del alumno)**, `apps/mobile/components/alumno/workout/workout-ui.ts:31` **(su espejo RN, cara del alumno)**, `apps/web/src/app/coach/builder/[clientId]/components/ExerciseBlock.tsx:307`, `apps/web/src/app/coach/builder/[clientId]/components/PrintProgramDialog.tsx:151` y `apps/mobile/lib/program-pdf.ts:55` | Los cinco tienen **hardcodeado** `progression_type === 'weight' ? 'kg/sem' : 'rep/ses'`; con D4 («+ Segundos» remapea `progression_type='reps'`) los **dos primeros son cara del alumno** y el PDF va al coach. Pasan a consumir **`formatProgressionTag(block)`** del motor (creado en W1) — junto con `BlockEditSheet.tsx:1190`, que ya estaba cubierto, son **6** consumidores y **cero** fórmulas sueltas. El chip de `ExerciseBlock.tsx:307` usa el sufijo corto (`↑{n}s`, misma convención que `BuilderBlockCard.tsx`). **Chequeo añadido al punto Q3 del QA del coach**: una plancha con «+ Segundos» dice `seg/ses` en el builder, en el ejecutor del alumno y en el PDF. **La progresión por segundos sigue siendo cartel (sin motor que suba el objetivo solo), igual que «+ Reps» hoy** (R30). |
| `apps/web/src/app/coach/builder/[clientId]/components/TemplatePickerDialog.tsx:102-148` y `apps/web/src/services/workout/workout.service.ts:1372-1405` | **Sin cambio de código**, pero **sí test**: una plantilla con un bloque en modo tiempo tiene que poder aplicarse y sincronizarse. Sin `'sec'` en el enum (W0), una plantilla así **rompe el plan entero** al re-validar, no solo ese bloque. |
| `apps/web/src/services/workout/workout.service.ts:178-198` y `apps/web/src/app/coach/builder/[clientId]/program-read-mappers.ts:50-106` | **Sin cambio**: la whitelist y el mapper de lectura ya incluyen `reps_unit` y `duration_sec`. |

**Capa de pantalla — Fable** (el mockup v2 aprobado, sección C, ya fija estos copys; no hay mockup
nuevo que esperar en esta wave):

- `BlockEditSheet.tsx:729-901`: grupo **«Prescripción»** con segmented **«Reps | Segundos»** encima
  del grid `:731`; en modo segundos la celda derecha pasa a **«Segundos por serie \*»**
  (placeholder «Ej. 30», hint «el alumno ve la cuenta atrás», rango duro 5–600). Series, Peso, RIR,
  Tempo, Recuperación, Descanso calentamiento y Ejes adicionales **quedan igual** (D3).
- `BlockEditSheet.tsx:1145-1230` (progresión): «+ Peso» / **«+ Segundos»** (mismo
  `progression_type: 'reps'`), sufijo **`seg/ses`**, hint de RIR «cuántos segundos quedan en el
  tanque», y **doble progresión oculta** en modo tiempo (`:1207-1220`).
- `apps/mobile/components/coach/BlockEditorSheet.tsx:322-376` y `:69-77`: mismo segmented sobre
  `:324`; opción de progresión rotulada **«Segundos»**, placeholder `1 (seg)`, nota de doble
  progresión oculta.
- Chips y previews: `StudentLivePreview.tsx:73-86` (deja de pintar «Sin prescripción» en falso),
  `ExerciseBlock.tsx:102-110,255-282`, `BuilderBlockCard.tsx:88-93,155-177` (badge `↑{n}s`),
  `PrintProgramDialog.tsx:112` («3 series × 30 s»), chip de lista **«Por tiempo»**.
- Ficha del coach: `ProgramTabB7.tsx:487-501` y `PlanTab.tsx:563-571` dejan de asumir
  `isTyped = kind !== 'strength'` ⇒ fila «Objetivo» con `3 × 30 s`;
  `TrainingTabB4Panels.tsx:680-693,739`, `AnalisisTab.tsx:607-637`,
  `apps/mobile/lib/coach-client-detail.ts:1292` y `LogSetForm.tsx:960` +
  `apps/mobile/components/alumno/workout/SetRow.tsx:454` pasan por
  `formatStrengthTimeSetLine` **dentro de su rama de fuerza**, conservando over/under, «PC» y RPE/RIR.

**Convención tipográfica (R11), sin excepciones**: `30s` (sin espacio, vía `compactDuration`) en
chips de ≤ 20 caracteres; `30 s` (con espacio) en líneas largas de ficha y resumen. Resumen de
prescripción `3 × 30 s · 10 kg`; línea de log `10 kg × 30 s` / `10 kg × 30 s por lado`.

**Dependencias.** W1 (predicado y formatos). No depende de W3/W4.

**Criterios de salida.** (1) Conmutar Reps→Segundos→Reps deja el bloque limpio con `null` explícito y
recupera un `reps` tipeable; (2) un bloque en modo tiempo sobrevive el round-trip web **y** RN;
(3) el chip dice `3 × 30s` y la preview `3 × 30 s · 10 kg`, nunca «Sin prescripción»;
(4) «Datos incompletos» no aparece con `duration_sec` válido y **sí** aparece sin reps y sin segundos;
(5) un bloque de fuerza clásico de otro coach se ve **exactamente igual** que antes del deploy.

**Gate real.** `pnpm exec vitest run apps/web/src/app/coach/builder packages/plan-builder tests/mobile/plan-builder-serialize.test.ts tests/mobile/plan-builder-type-change.test.ts tests/mobile/plan-builder-strip-roundtrip.test.ts`
+ `pnpm typecheck` + `pnpm --filter @eva/mobile exec tsc --noEmit`.

---

## W3 · Alumno RN — 2,75 días-agente (2,5 + 0,25 de R24) · Opus (datos) + **Fable (UI)**

**Objetivo.** Que el reloj entre a la tarjeta activa de la superserie **debajo del video**, guarde
solo a 0, avance al siguiente miembro y frene en el último de la ronda — todo por OTA sobre 1.1.2.

**Capa de datos y estado — Opus.**

| Archivo | Cambio |
|---|---|
| `apps/mobile/components/alumno/workout/v3/timing.ts:39-100` | `useCountdown` gana **`expiredWhileAway: boolean`** en el payload del `onDone` (R6 + **R27**), **derivado de evidencia y no del emisor**: `(Date.now() - endAtMs) > 1500 \|\| AppState.currentState !== 'active'` al disparar `triggerDone`. Da igual si ganó el tick (`:63-68`) o la reconciliación de `AppState` (`:73-86`): los dos caminos tienen que dar el mismo valor. Se expone **`endAtMs`** (lo necesita el aviso del SO). **Además `prime(seconds)` (R27)**: deja el reloj armado en `idle` **sin arrancarlo** — hoy `restart()` siempre arranca (`:88-96`, hace `setStarted(true)` y `setRunning(true)`), y sin `prime` no se puede pintar «el lado derecho espera tu toque» (R6/R21). `started` (`:15-30`) **ya existe**. El invariante del efecto que depende de `remaining` **se conserva**. |
| `apps/mobile/components/alumno/workout/v3/use-hold-module.ts` (**nuevo**) | Hook fino: `useCountdown` + secuencia de lados **por `holdSidesFor(sideMode)` del motor (R34)**, no por una regla propia (`typed-screen-model.ts:146` sigue siendo el precedente de movilidad) + `decideHoldAutolog`. **No re-implementa la cuenta.** `autoStart` por defecto `false` (A1/R21, «nada corre solo al abrir una pantalla»); el lado 2 arranca solo **solo si `!expiredWhileAway`** (R6/R27) y, cuando venció fuera de foco, el hook llama **`prime(seconds)`** para dejarlo armado en «Iniciar lado derecho» sin correr. Guard de un envío por serie con `sentSetsRef`, calcado de `CardioScreenV3.tsx:364`. La siembra de la fila va por `typedSeedPatch` con nonce (`SetRow.tsx:894-901`), **nunca** por `seedValues` (remontaría la fila y cerraría el keypad — comentario explícito en `CardioScreenV3.tsx:610`). **Marca de fuente (CA-28)**: al armar el payload de **movilidad** el hook pasa el contexto como **objeto** `{ sideMode, holdSource }` a `buildTypedPayload` (la firma ampliada en W1) — no como el `sideMode` suelto histórico. Es el único punto de RN donde se escribe `hold_source` en movilidad; `apps/mobile/lib/workout-session.ts:974` solo reenvía la `metadata` **si viene**. |
| `apps/mobile/components/alumno/workout/v3/ExecutorV3.tsx:754-843` (`maybeStartRest`) | Estado nuevo **`pendingRoundRest`** en el orquestador (R9), **nunca en la fila**, y con el **contexto completo de la ronda (R28)**: lleva `seconds` **más el mismo `RestRoundContext`** que hoy arma `ExecutorV3.tsx:772-791` (`roundNumber`, `totalRounds`, `next` = {nombre, prescripción, tag}), tipado con el `RestRoundContext` que ya se importa en `:104`. Se **construye en el commit y se guarda ANTES del reset de `restRoundContextRef`** (`:696`), que se limpia en cada commit (`:295`, `:696`) — si se lee después, el interstitial diría «Serie N de M» en vez de «Ronda N de M». Con `hold_source === 'timer'` y ronda cerrada, **no** se llama `startRest`: al tocar «Ronda lista · Descansar N s» se pasa **ese** contexto al **mismo** `startRest(secs, {autoStart:true, countKind:'ronda', setIndex: round, setTotal: totalRounds})` de `:796`. Reglas de limpieza: nuevo commit de cualquier miembro, cambio de paso, omitir bloque, finalizar entreno. |
| `apps/mobile/components/alumno/workout/v3/ExecutorV3.tsx:556-586` (`openSet`, R7) | Pasar `sideMode` al `typedCtx` y sembrar `hold_left_sec`/`hold_right_sec` desde `metadata`. Hoy el archivo declara en `:556-559` que **deliberadamente no** lo pasa porque «confirmar borraría el hold guardado»: con V2 la edición pasa a ser el camino normal, así que la deuda se vuelve bug visible y **entra al tren**. Toda edición manual reescribe `metadata.hold_source = 'manual'` **junto con los lados** (el UPDATE reemplaza el jsonb entero). |
| `apps/mobile/components/alumno/workout/v3/ExecutorV3.tsx:1798-1811` | **Sin cambio** (R5): el salto de paso a los ~350 ms al cerrar la última serie del bloque se mantiene igual que hoy. V3 gobierna el descanso y la serie siguiente, no el salto de paso. Se declara como interpretación. |
| `apps/mobile/components/alumno/workout/v3/RollerScreenV3.tsx:148-154` (`confirm`) | **Roller con marca `'manual'` (DECISIONS-2 · DATA-2).** El roller **no gana reloj** en este tren (R12, sigue con `useStopwatch` ascendente en `:103`), pero **sí** entra a la métrica única de `hold_source`: la llamada `buildTypedPayload('roller', values, block.id, activeSet, block.side_mode ?? null)` de `:153` pasa a la **firma con contexto-objeto** ampliada en W1 ⇒ `buildTypedPayload('roller', values, block.id, activeSet, { sideMode: block.side_mode ?? null, holdSource: 'manual' })`. **Siempre `'manual'`**, nunca `'timer'`. Sin esto el roller queda `sin_marca` y §8.2 gana un tercer estado. Espejo web en `RollerStepV3.tsx` con la misma regla. |
| `apps/mobile/components/alumno/workout/timers/hold-notification.ts` (**nuevo**, R18 + **R31**) | Aviso local «Terminó tu hold» con id estable **`eva-hold-end`** y `data.type = 'hold-end'` (para no barrer las del descanso, `rest-notification.ts:52-53,239-243`). **Copia las 4 reglas del fix QA-10 documentadas en `cardio-notification.ts:15-21`**: (a) identificador estable en cada schedule ⇒ a lo sumo existe UNA; (b) **todas** las ops (schedule/cancel/dismiss/sweep) **serializadas por una cola de promesas**; (c) el dismiss retira además las **ya entregadas** de este tipo; (d) sweep al arrancar de cualquier programada huérfana del tipo. **Permiso: nunca promptea**, solo programa si ya está concedido (patrón `rest-notification.ts:176`). Se cancela en los últimos ~2 s y al volver a foreground, copiando `useRestTimerEngine.ts:270` y `:312-313` — sin eso, el handler global (`apps/mobile/lib/push.ts:86-95`) muestra la notificación **también con la app abierta**. El criterio de salida del hold es **«vibra y avisa»**, nunca «suena»: el sonido a 0 queda fuera del tren (B3). |
| `apps/mobile/lib/workout-session.ts` y `apps/mobile/lib/offline-cache.ts` | **Sin cambio de contrato, pero con verificación explícita**: `PendingLog` ya transporta `actual_hold_sec` (`:42`), `actual_duration_sec` (`:39`) y `metadata: WorkoutLogMetadata` (`:51`), y el drain spreadea el ítem entero (`:130-133`) ⇒ `hold_source` viaja gratis offline. Se cubre con test, no se toca el código. |

**Capa de pantalla — Fable** (mockup v2 aprobado, secciones A y B; el modal de D5 **no** es de esta
wave):

| Archivo | Punto de inserción exacto | Qué entra |
|---|---|---|
| `apps/mobile/components/alumno/workout/v3/HoldModuleV3.tsx` (**nuevo**) | — | Presentación del reloj: `ProgressRing` + `formatClock` + pastilla de lado + «luego: …» + CTAs. `HoldModuleKind = 'mobility' \| 'strength_time'`; `HoldModuleSize = 'ss' \| 'solo130' \| 'solo214'`. `reducedMotion` baja como prop a `ProgressRing`/`JuicyButton`. |
| `SupersetScreenV3.tsx` | **justo después de `<ExecMediaV3 …/>` (`:453-459`) y antes de la prescripción compacta (`:462`)** | `<HoldModuleV3 size="ss">` (anillo ~80 px) cuando el miembro activo tiene reloj. V1 cumplido por construcción: el media de 150 px queda intacto arriba. |
| `SupersetScreenV3.tsx:325-333` (`handleCommit` local) | — | El módulo entrega su commit **por esta envoltura**, no por `onCommitSet` directo, para que el CueBar se dispare (`:327-330`). **R23**: con V4 el CueBar sale **sin gesto**, así que su auto-dismiss sube de 1650 ms a **2400 ms** solo cuando el origen es `timer` (`:167-172`). El marquee «CONTINÚA SIN DESCANSO» se mantiene. |
| `SupersetScreenV3.tsx:239-243` y `:152-153` | — | Reset del módulo al cambiar de miembro activo **y de ronda**; suspensión de la cuenta mientras corre el descanso de grupo (`restingNow`). |
| `SupersetScreenV3.tsx:638-660` | nota «Descanso {N}s al cerrar la ronda» | Se convierte en el CTA **«Ronda lista · Descansar 90 s»** cuando `pendingRoundRest` apunta a este grupo (D2). `groupRestSec` ya se calcula en `:231-234`. |
| `MobilityScreenV3.tsx:120-138` (`finishSide`) y `:221-323` | — | El módulo reemplaza el bloque de hold manteniendo el anillo **214 px** (V1). A 0 se **guarda solo** (V2). Post-guardado: anillo «¡Listo!» + chip «Guardado · 30 s» + CTAs **«Descansar 30 s»** (juicy) y **«Siguiente serie»** (secundario) — nada arranca solo (V3). La fila de captura tipada (`:327-351`) sigue **siempre visible** (QA4 h8b); corriendo se **deshabilita, no se oculta** (R8). |
| `ExerciseScreenV3.tsx` | **después de `<ExecMediaV3 …/>` (`:329-335`), antes de la prescripción (`:338`)** | Variante fuerza por tiempo: anillo **130 px** + tiles **KG / SEG** (`SetRow.tsx:1046-1065`, el tile «Reps» conmuta a «SEG» por prop nueva `strengthTimeMode`) + prescripción `{sets} × {compactDuration(duration_sec)}`. **CTAs del modo tiempo (DECISIONS-2 PLAN 2)**: en `idle` ⇒ **«Iniciar serie»** (juicy); mientras el reloj **no** arrancó, «Aplastar serie» queda disponible **solo si el alumno escribió SEG a mano** (camino manual de R8); tras el guardado ⇒ el par **«Descansar N s» / «Siguiente serie»** de R24. La rueda dual y `repsHint` (`:172-201`) se desactivan o pasan a kg\|seg en modo tiempo. |
| `SupersetScreenV3.tsx`, `MobilityScreenV3.tsx`, `ExerciseScreenV3.tsx` — **tarea nueva `[UI · Fable]` de R24, +0,25 d-a** | tras cerrar cualquier serie | **CTAs «Descansar N s» / «Siguiente serie» en TODAS las pantallas con la preferencia OFF.** Hoy en V3 **no existe** un botón manual de descanso: RN solo tiene los dos `startRest` automáticos de `ExecutorV3.tsx:796` y `:830`. Con R1 (OFF por defecto en el primer entreno) ese hueco sería **la experiencia por defecto**: el alumno nuevo no tendría cómo descansar. Regla: tras cerrar una serie (tocada o por reloj) con pref **OFF** y `rest_time > 0`, se pinta el par **«Descansar N s»** (juicy, llama al **mismo** `startRest` de hoy) / **«Siguiente serie»** (secundario) en **fuerza clásica**, **movilidad**, **fuerza por tiempo** y en el **último miembro de la ronda** («Ronda lista · Descansar N s», que además pasa el `RestRoundContext` de R28). Sin `rest_time` no se pinta nada (no hay descanso que arrancar). Punto de QA propio: «alumno nuevo, fuerza clásica, pref OFF ⇒ hay cómo descansar». |

**Visibilidad de la fila de captura (R8), las 3 superficies × 3 estados**: superserie **sin arrancar**
⇒ módulo + fila de cajas (el camino manual que hoy usan 29 de 32 holds de Movens **sigue existiendo**);
**corriendo** ⇒ solo módulo; **guardado** ⇒ tarjeta del miembro «hecho» con `⏱ 30 s / 30 s` y tap =
editar. Pantalla sola: la fila **nunca** se oculta. **Ocultar es `display: 'none'`, jamás desmontar**
(R26): en `paused` la fila vuelve a verse (editable + «Reanudar»), y desmontarla mataría el estado de
captura del alumno.

**Predicado único de montaje del módulo (R29; vale para RN y para W4).** El `HoldModuleV3` se monta
**si `duration_sec > 0`** (movilidad) **o `isStrengthTimeBlock(block, exercise)`** (fuerza). Sin
duración, la fila manual de hoy queda **tal cual**: sin anillo y sin CTA. No es un caso de
laboratorio: en LIVE hay **94** bloques de movilidad **sin `duration_sec`** (425 totales, 331 con
duración). La pantalla sola ya se salva por el guard `holdSec > 0` de `MobilityScreenV3.tsx:86,221`,
pero **la superserie no lo hereda** ⇒ sin el predicado se pintaría un anillo en `0:00` con una CTA
muerta (riesgo 2 de `research/s1`). El piso de **5 s** de R11 es la **validez del builder para
bloques nuevos**, no el predicado de montaje: un bloque legacy de 1–4 s igual monta el módulo. Entra
con **test del predicado** y con **un punto de QA sobre un bloque de movilidad sin duración**.
Corolario: con `duration_sec < 10` **no se programa** la notificación local del hold (R18/R31) — no
alcanza para salir de la app y volver, y la propia notificación se cancela en los últimos ~2 s.
Corolario 2 (**CA-90**): «Listo» desde `idle` conserva el comportamiento de hoy, sembrar el objetivo.

**Dependencias.** W1. Lo `[UI · Fable]` de la superserie y la movilidad usa el mockup v2 **ya
aprobado**; nada de esta wave espera al mockup F.

**Criterios de salida.** (1) En «Dia B» el reloj corre bajo el video y a 0 la serie queda guardada sin
tocar nada; (2) la tarjeta salta sola al press pallof y el CueBar aparece; (3) al cerrar la ronda
aparece «Ronda lista · Descansar 90 s» y **nada** arranca hasta el toque; (4) bloquear la pantalla a
mitad del hold izquierdo y volver a los 3 min guarda **30 s** (el objetivo, no el reloj de pared) y el
lado derecho **no** arranca solo (queda `prime`ado, R27); (5) una serie guardada por reloj en avión
sobrevive al drenado con `hold_source` en el jsonb; (6) editar un hold `per_side` **no** borra el
desglose; (7) **R24**: un alumno con la preferencia OFF que cierra una serie de **fuerza clásica**
con `rest_time > 0` ve «Descansar N s» / «Siguiente serie» y puede arrancar su descanso.

**Gate real.** `pnpm --filter @eva/mobile exec tsc --noEmit` y
`pnpm --filter @eva/mobile exec expo export --platform android`;
`pnpm exec vitest run tests/mobile` sin rojos nuevos. Sin dependencias nativas nuevas: el tren tiene
que caber en la OTA 1.1.2.

---

## W4 · Alumno web — 2,25 días-agente (2 + 0,25 de R24) · Opus (datos) + **Fable (UI)**

**Objetivo.** Paridad exacta con W3 en la PWA y el escritorio, más el punto (B) del mockup:
«Iniciar hold» como botón grande en la pantalla sola de movilidad.

**Capa de datos — Opus.**

| Archivo | Cambio |
|---|---|
| `apps/web/src/app/c/[coach_slug]/workout/[planId]/v3/useExecCountdown.ts:21-31,34-116` | **Aditivo**: `started: boolean` (hoy no existe; sin él la web no distingue «nunca arrancó» de «pausado» y el botón juicy no puede alternar), **`endAtMs`** y **`expiredWhileAway`** en el `onDone` (**R27**, mismo nombre y misma derivación que RN: `(Date.now() - endAtMs) > 1500 \|\| document.visibilityState !== 'visible'`, espejo del re-sync por `visibilitychange` de `:86-99`), más **`prime(seconds)`**: arma el reloj en `idle` **sin arrancarlo** — hoy `restart()` «reinicia a `seconds` **y arranca**» (`:30-32`). Los dos llamadores actuales (`MobilityStepV3.tsx:89`, `CardioStepV3.tsx:444`) siguen compilando. |
| **(a)** `LogSetForm.tsx:265` (prop) y el efecto `:1800-1811` de **`TypedLogSetRow`** (`:1660+`) | `holdPrefill` gana **`submit?: boolean`** y **`source?: 'timer' \| 'manual'`**; al final del efecto, `if (holdPrefill?.submit && !isLogged) formRef.current?.requestSubmit()` (el `formRef` de esta fila es el de `:1724`) — espejo exacto de la línea que ya usa cardio (`:1829`). **Se copia el gate `\|\| isLogged` del efecto de cardio (`:1820`)**, que `holdPrefill` hoy **no tiene** (`:1802`): sin submit era inofensivo, con submit permitiría **re-enviar una serie ya logueada**. Con esto el auto-envío de **movilidad** recorre el mismo camino que el botón ✓: cola offline, optimismo, `onLogged`, CueBar. |
| **(b)** `LogSetForm.tsx` — **`StrengthLogSetForm`** (`:316-1658`), NUEVO | **Corrección de bloqueo (H1).** `holdPrefill` **solo existe en la fila tipada**: se destructura en `:1677`, su efecto vive en `:1800-1811` y los refs `holdRef`/`holdLeftRef`/`holdRightRef` en `:1729-1731`. Pero **fuerza por tiempo se pinta en la fila de FUERZA** (guard `:848`, tile `:1143-1170`) ⇒ tal como estaba escrito, **C no auto-guardaba en web y fallaba en silencio**. Entra en `StrengthLogSetForm`: inputs `name="actual_hold_sec"` (+ `hold_left_sec` / `hold_right_sec` en `per_side`), sus refs, el efecto por **nonce** que vuelca los segundos medidos y, si `submit` y **no** `isLogged`, `formRef.current?.requestSubmit()` sobre **su propio `formRef` (`:449`)**. Mismos nombres de campo que movilidad (R2) para que el motor los lea con una rama sola. |
| `LogSetForm.tsx:848` (rama de **fuerza**) | **Guard de serie vacía**: hoy `if (w == null && r == null) return` **bloquea** el auto-guardado de fuerza por tiempo (reps `null`, solo segundos). Pasa a `w == null && r == null && hold == null`. ⚠ Sin este cambio, C no guarda nada y el fallo es silencioso. |
| `LogSetForm.tsx:838-846`, `:1912-1930` y `:1933` (`collectMetadata`) | **Tarea de CÓDIGO, no de documentación (R37).** Hoy hay dos ramas de `metadata`: la de fuerza hace `formData.delete('metadata')` (`:842`) y la tipada arma la de `per_side` (`:1928-1929`). **Rama propia para fuerza por tiempo `per_side`**: en `StrengthLogSetForm`, si `isStrengthTimeBlock`, la rama `perSideReps` **no** llama a `buildStrengthPayload` **ni** ejecuta `formData.delete('metadata')`; lee `hold_left_sec` / `hold_right_sec`, arma `{left_sec, right_sec, hold_source}` y hace **un único** `formData.set('metadata', …)`, con `reps_done` **eliminado** del FormData. **`hold_source` viaja en el MISMO objeto que `{left_sec, right_sec}`** — el jsonb se reemplaza entero en la action (`_actions/workout-log.actions.ts:150-178`), mandarlo solo borraría los lados. **Corrección de bloqueo (F1)**: hoy la rama tipada escribe `metadata` **solo si `perSide`** y en **bilateral ni pasa por ahí** (`:1930-1931`) ⇒ los holds bilaterales de movilidad saldrían **sin marca** y CA-28/CA-84 quedarían ciegos. Entra: la rama de movilidad escribe `metadata` **también en bilateral** (`{ hold_source }` cuando la fuente existe, `delete` cuando no, para no ensuciar el jsonb de quien registra a mano sin reloj) y **`collectMetadata` (`:1933-1934`) amplía su tipo** a `{ left_sec?, right_sec?, hold_source? }` — hoy lo tiene fijo en los dos lados y tiraría la clave del optimismo local. |
| `LogSetForm.tsx:854-874` (encolado de fuerza) y `:1098` (`key` del form) | La cola offline de **fuerza** no encola hoy `actualHoldSec` ni `metadata` ⇒ se agregan (`workout-offline-queue.ts:146` ya los serializa). La `key` del form (`log-${weight}-${reps}`) no cambia al cambiar solo los segundos ⇒ el input uncontrolled queda rancio tras la reconciliación: se suma el eje tiempo. |
| `LogSetForm.tsx:662` (**fila de FUERZA**, `buildRest`) y `:2034` (**fila TIPADA**) | Canal de supresión del descanso: con `hold_source === 'timer'` y la preferencia D5 apagada, el submit **no** llama `startRest`; con la ronda cerrada tampoco (`:2036-2040`, D2). En W5 estas dos lecturas pasan a `readAutoRestPref`. **Corrección del writer 7**: la atribución estaba invertida — `:658-676` es `buildRest` de `StrengthLogSetForm` y `:2031-2047` la rama de `TypedLogSetRow`. **En web no existe `countKind` (R28)**: `RestOptions` acepta solo `{label, warmup}` (`WorkoutTimerProvider.tsx:20-21,33`) y el `ActiveTimer` de descanso solo `{seconds, label, warmup}` (`:41`); `countKind`/`setIndex`/`setTotal` son **exclusivos de RN** (`TimerProvider.tsx:39,52`). **Resolución: el rótulo «Ronda N de M» viaja en `label`** — el CTA de D2 en web llama `startRest(String(groupRestSeconds), { label: 'Ronda N de M · <siguiente>' })`, armado con el mismo contexto de ronda que guarda `pendingRoundRest` (R28). No se amplía `RestOptions`: el interstitial nativo con contador de rondas sigue siendo **backlog B13**. |
| `apps/web/src/app/c/[coach_slug]/workout/[planId]/WorkoutExecutionClient.tsx` | `pendingRoundRest` en el orquestador (R9, espejo de W3) **con el contexto completo de la ronda (R28)**: `seconds` + `roundNumber`, `totalRounds` y el `next` que arma el rótulo, guardado **en el commit** y consumido al tocar el CTA. `clientId={rootUser.id}` recibido desde `page.tsx:61` (hoy el archivo **no tiene** `clientId`; es prop aditiva y cuesta 0 queries) — ⚠ `getClientRootUser()` **puede devolver `null`** (`page.tsx:61,68`): ese camino se cubre en W5 (R32). `:1967-1973` (salto de paso) **sin cambio** (R5). |
| `apps/web/src/app/api/pr-card/route.tsx:79-85` | `.gt('reps_done', 0)` en el select de la curva (hoy filtra **solo** por `weight_kg`) ⇒ el peso de un hold no entra a la PR-card. Complementa la migración de W0. |
| `apps/web/src/app/globals.css:5417-5424,5433,5449` | **CSS nuevo, cardio intacto (R33).** `.exec-v3-holdwrap` (fijo en 214×214 px, `:5417`) y `.exec-v3-holdnum` (60 px, `:5449`) **las usa `CardioStepV3`** (`:518`, `:538`, `:689`, `:711`, `:722`) ⇒ **no se tocan**. El módulo estrena **`.exec-v3-holdmod`** con la variable **`--exec-hold-size`** (80 / 130 / 214) y **sus propios selectores**; **Movilidad sola migra al módulo nuevo en W4 conservando sus 214 px** (`MobilityStepV3.tsx:154,178`). Sin esto el anillo empuja la fila de captura fuera del viewport en móvil. **Se conserva `.exec-v3-hold-fill`** para no perder el bloque `prefers-reduced-motion` de `:6390`. El `strokeWidth` es atributo JSX (`MobilityStepV3.tsx:164,171`) ⇒ pasa a prop del módulo. El `DASH = 2π·92` sigue válido: es coordenada de viewBox, no px. |

**Capa de pantalla — Fable.**

- `apps/web/.../v3/HoldModuleV3.tsx` (**nuevo**): misma pieza visual y mismos estados que RN. Su
  **única** salida es `onMeasured` — nunca llama `logSetAction`, `enqueueWorkoutLog` ni `startRest`.
- `SupersetStepV3.tsx`: `<HoldModuleV3 size="ss">` **entre `<ExecMediaCard/>` (`:292-296`) y
  `.exec-v3-rx` (`:298`)**, dentro de `.exec-v3-ss-body-in`. El estado local del reloj resetea por
  `activeBlockId` **+ `currentRound`** (hoy `:192-194` resetea solo por bloque: la ronda 2 del mismo
  miembro tiene que empezar en 0). `handleActiveLogged` (`:219-226`) **no se toca**: el CueBar sale
  solo. `.exec-v3-ss-restnote` (`:452-457`) se vuelve el CTA «Ronda lista · Descansar 90 s».
- `MobilityStepV3.tsx:223-238` (**punto B del mockup**): el CTA único de hoy se parte en **dos
  botones apilados** (paridad con RN `MobilityScreenV3.tsx:272-321`): arriba el control
  («Iniciar hold» juicy sin arrancar / «Pausar»-«Reanudar» secundario corriendo), abajo el cierre
  («Listo este lado» / «Listo»). El rótulo de 10 px «Tocar para iniciar» (`:193-197`) deja de tener
  sentido; el anillo sigue siendo tappable como afordancia redundante.
- `ExerciseStepV3.tsx`: `<HoldModuleV3 size="solo130">` **entre `<ExecMediaCard/>` (`:174`) y
  `.exec-v3-rx` (`:177`)**; la prescripción (`:177-187`) imprime
  `{sets} × {compactDuration(duration_sec)} · {kg} · RIR · desc`; el tile REPS conmuta a **SEG**
  (`LogSetForm.tsx:1143-1170`) con `name="actual_hold_sec"`, conservando `.exec-v3-val` /
  `.exec-v3-valinput` / `.exec-v3-valu` para cero drift visual.
- Panel post-guardado compartido (`HoldDoneActions`) para movilidad y fuerza por tiempo: anillo
  «¡Listo!» + chip «Guardado · 30 s» + «Descansar N s» / «Siguiente serie».
- **Tarea nueva `[UI · Fable]` de R24 (+0,25 d-a): el par «Descansar N s» / «Siguiente serie» también
  en la web, en las cuatro superficies.** Hoy el único botón manual de descanso de la web es el
  `ManualTimerButton` de la barra legacy (`WorkoutExecutionClient.tsx:296`, montado en `:2998` fuera
  del camino V3) ⇒ con la preferencia OFF el alumno nuevo **no tiene cómo descansar**. Con pref OFF y
  `rest_time > 0`: «Descansar N s» (juicy, mismo `startRest` de hoy) / «Siguiente serie»
  (secundario) en **fuerza clásica**, **movilidad**, **fuerza por tiempo** y en el **último miembro
  de la ronda** («Ronda lista · Descansar N s», con el rótulo de ronda en `label`, R28).
- **Invariante de montaje del formulario (R26), no negociable:** la fila del miembro activo (el
  `<form>` del `LogSetForm`) **nunca se desmonta** mientras el `HoldModuleV3` esté montado. R8
  («corriendo ⇒ solo el módulo») se implementa con `hidden` + `inert`, **jamás** con un condicional
  de render: si el `<form>` desaparece, `holdPrefill.submit` no tiene a quién llamar y el guardado
  automático se pierde en silencio. Test web-dom: con el módulo en `running`, el `<form>` sigue en el
  DOM y `holdPrefill.submit` produce **exactamente un** `logSetAction`.

**Regla de hidratación (EVA-NEXTJS-18), no negociable**: **toda** preferencia o estado que venga de
`localStorage` se lee en `useEffect`, **nunca** en el initializer de `useState` — el patrón vigente
está documentado en `WorkoutExecutionClient.tsx:1222-1227` y en `v3/exec-settings.ts:82-98`.
Tampoco `Date.now()` en el cuerpo del render.

**Dependencias.** W1. Paralela a W3 salvo el contrato del motor.

**Criterios de salida.** Los mismos 7 de W3, más: (7) en la pantalla sola de movilidad el arranque es
un botón grande «Iniciar hold», no un tap sobre el anillo; (8) el anillo compacto **no** empuja la
fila de captura fuera del viewport a 390 px **y cardio se ve exactamente igual que antes (R33)**;
(9) un auto-envío fallido (coach en pausa) no deja la tarjeta activa retrocediendo en silencio: el
error se ve; (10) **R24**: con la preferencia OFF hay «Descansar N s» / «Siguiente serie» en las
cuatro superficies; (11) **R26**: con el módulo corriendo el `<form>` sigue montado y el auto-envío
produce exactamente un `logSetAction`.

**Gate real.** `pnpm exec vitest run "apps/web/src/app/c/[coach_slug]/workout/[planId]" packages/workout-engine`
+ `pnpm typecheck` + `pnpm check:tokens`.

---

## M · Mockup de la sección F (Fable, jefe) — 0,25 días · **bloquea W5**

Regla de la casa: **mockup aprobado por el owner ANTES de tocar UI**, diseñado contra el CÓDIGO vivo.
El artifact `bab4d4d3 v2` cubre A, B, C y D pero **no** cubre la feature F/D5 (R10). Esta lámina suma:

| Pieza | Contra qué código se dibuja |
|---|---|
| Modal de primera vez, RN | `Sheet` con `nativeModal` + `forceDark` (`apps/mobile/components/Sheet.tsx:82,110,157`), montado junto a la tuerca en `ExecutorV3.tsx:2107-2120` |
| Modal de primera vez, web | Clases `.exec-v3-settings*` (`apps/web/src/app/globals.css:5143-5246`), montado dentro de `[data-exec-v3]` **sin portal** para heredar `--exec-brand` (`WorkoutExecutionClient.tsx:3030-3041`) |
| Fila de la tuerca renombrada | RN `v3/ExecSettingsSheet.tsx:198-221` (hoy «Cronómetro automático», con `danger` rojo en OFF) · web `v3/ExecSettingsSheet.tsx:179-207` |

**Copys canónicos (R11b), no se inventan variantes.** Modal: título «¿Pasamos solo al descanso?»;
cuerpo «Cuando termines una serie, podemos arrancar tu descanso automáticamente. Si prefieres, lo
arrancas tú con el botón.»; toggle «Pasar solo al descanso» (ON: «El descanso empieza solo al terminar
cada serie.» / OFF: «Tú decides cuándo empieza el descanso.»); CTA «Listo»; pie «Puedes cambiarlo
cuando quieras en los ajustes del entrenamiento (⚙).». Fila de la tuerca: «Pasar solo al descanso»
con esos mismos sublabels. El **rojo de `danger`** del OFF **se va**: con default OFF para el alumno
nuevo, apagado deja de ser una avería y pasa a ser una elección legítima.

**Gate de salida.** Artifact con los 3 estados (modal, tuerca ON, tuerca OFF) en RN y web, aprobado
**explícitamente** por el owner. Sin ese OK, W5 hace **solo** su capa de datos.

---

## W5 · Preferencia D5 «Pasar solo al descanso» — 1 día-agente · Opus (datos) + **Fable (UI)**

**Objetivo.** Una sola preferencia por alumno que gobierne **el arranque del cronómetro de descanso**,
con modal de una vez en el primer entreno y toggle permanente en la tuerca.

**La preferencia ya existe con otro nombre (R1).** `omni_autotimer` / «Cronómetro automático» hace
exactamente lo que pide D5, es **device-scoped** y su **default es ON**
(`apps/mobile/components/alumno/workout/timers/rest-timer-preferences.ts:37,54,171-179`;
`WorkoutExecutionClient.tsx:1222,1227`). D5 no es motor nuevo: es re-encuadrarla, hacerla por alumno,
cambiar el default **solo para quien recién entra** y agregar el modal.

**Capa de datos — Opus.**

| Archivo | Cambio |
|---|---|
| `apps/mobile/components/alumno/workout/v3/auto-rest-pref.ts` (**nuevo**) y `apps/web/.../v3/auto-rest-pref.ts` (**nuevo**) | Claves `eva:exec-autorest-v1:<clientId>` (`'1'`/`'0'`) y `eva:exec-autorest-seen-v1:<clientId>`. Patrón calcado de `v3/exec-settings.ts` (cache + `useSyncExternalStore` + hidratación única en RN; `readBool`/`writeBool` + evento `exec-settings-changed` en web). El `clientId` **en la clave** hace imposible leer la del otro alumno en el mismo dispositivo (lección del bug de marca cruzada). API: `readAutoRestPref({clientId, hasHistory})`, `writeAutoRestPref`, y **`resolveAutoRestDefault` como función pura con test**. **`readAutoRestPref` es SÍNCRONA, con caché en memoria hidratada una vez (R36)**: misma disciplina que `timers/rest-timer-preferences.ts` (caché + hidratación al montar el ejecutor con `clientId` + escritura optimista), porque la decisión de `maybeStartRest` se toma **antes** del `await` de red (`ExecutorV3.tsx:748-754`); un `await` ahí llegaría tarde y el descanso arrancaría igual. En **web** la verdad vive en `WorkoutExecutionClient` (estado + prop **`autoTimerEnabled`** hacia `LogSetForm`), **no** en `LogSetForm`. |
| Default **por cohorte** (R1) + **constante única (R25)** | `resolveAutoRestDefault` recibe **`strategy: 'cohort' \| 'off'`** desde la constante **`AUTOREST_DEFAULT_STRATEGY = 'cohort'`** declarada en `auto-rest-pref.ts` (RN y web). Ramas: (a) existe la clave nueva ⇒ su valor; (b) no existe pero sí `omni_autotimer` ⇒ **copiarla** (migración de lectura); (c) sin clave y **con** historial ⇒ **ON** (es lo que viven hoy: cero regresión para la base); (d) sin clave y **sin** historial (primer entreno) ⇒ **OFF + modal** (D5 literal). Si el owner responde **Q1 = «OFF global»**, el cambio es **una línea** (`AUTOREST_DEFAULT_STRATEGY = 'off'`) más la fila del test de cohortes que ya cubre la variante. La divergencia respecto de la letra de D5 (que pedía OFF para todos) queda declarada en el SPEC con su pregunta Q1. |
| Reemplazo de la lectura de la preferencia — **3 puntos reales, no «4 puntos»** | Ver la tabla de abajo (copiada de `SPEC` §11.1, fuente única). `grep -rn isRestAutoTimerEnabled apps/web/src` ⇒ **0 resultados**: en la web **ese lector no existe**. |
| Cambio de comportamiento declarado (**W5.3**) | Con la pref **OFF** ya **no se cancela** un descanso que el alumno arrancó a mano: hoy esas 4 ramas hacen `cancelRest()` y con OFF masivo eso mataría descansos manuales. OFF pasa a significar «no arranco uno nuevo», no «mato el que hay». Se declara en el SPEC y va en **una línea del aviso general a coaches** del cierre (`news_items`), **sin mensajes individuales** (DECISIONS-2 PLAN 3). |
| `is_demo` **en el fetch raíz del alumno** (R32): web `getClientRootUser` (`apps/web/src/app/c/[coach_slug]/_data/client-root.queries.ts`, consumido en `page.tsx:61`) y RN `apps/mobile/lib/client.ts:17` | Sumar **`is_demo`** al select existente (aditivo, 0 queries nuevas): el modal **no** se muestra en el alumno demo, al que el coach entra por «Vive tu app» (`apps/mobile/lib/vive-tu-app.ts:8-16`). Si `is_demo` no llega, el fallback es **confiar en el historial** (R14). |
| **`clientId` nulo en web (R32, literal)** | `getClientRootUser()` puede devolver `null` (`page.tsx:61,68` ya contempla `rootUser === null`). En ese caso la preferencia **cae a la clave legacy por dispositivo**: se **lee Y se escribe `omni_autotimer`** —el comportamiento exacto de hoy—, **sin** tocar `eva:exec-autorest-v1:<clientId>` (que quedaría `…:undefined` y compartiría preferencia entre alumnos del mismo navegador, RG20) y **sin modal**: sin dueño no hay a quién persistirle la respuesta. ⚠ Ni «no se persiste» ni «no se lee ni se escribe» ni «la pref queda ON»: **leer `omni_autotimer` respeta un OFF previo**, quedar ON lo pisaría. |
| Señal de «primer entreno» (R14) | `esPrimerEntreno = previousHistory vacío && exerciseMaxes vacío && sessionLogs.length === 0` — **las tres viajan ya en el bundle** (web `page.tsx:81`, RN `workout-session.ts:257`) ⇒ **0 queries, offline-safe**. Es una función **pura con test**, no un `useEffect`. La marca «visto» se escribe **al responder** (o al cerrar sin responder ⇒ marca + OFF). Storage inaccesible (modo privado) ⇒ **no mostrar** (fail-safe: un modal repetido es hostigamiento). Excluidos por construcción: personas E2E (reciben historial sembrado) y los modos `?fecha` / `?repetir` / `?recuperar`. |

**Los «4 puntos» corregidos con el código — son 3 (copia literal de `SPEC` §11.1, fuente única).**

| Plataforma | Puntos **reales** de lectura | Qué se hace en W5 |
|---|---|---|
| **RN** | **2**: `ExecutorV3.tsx:762` (superserie) y `:822` (bloque suelto), vía `isRestAutoTimerEnabled()` (importado en `:86`) | Se reemplazan por `readAutoRestPref({ clientId, hasHistory })` |
| **Web** | **1**: el estado `const [autoTimerEnabled, setAutoTimerEnabled] = useState(true)` + su lectura de `omni_autotimer` en `WorkoutExecutionClient.tsx:1222-1227`, que baja como **prop** `autoTimerEnabled` (declarada en `LogSetForm.tsx:144`, default `true` en `:330` y `:1667`) | Ese estado pasa a `resolveAutoRestDefault` + `clientId`; la prop y su cableado **no cambian de nombre** |
| **Web · consumidores de la prop** | `LogSetForm.tsx:662` — **fila de FUERZA** (`StrengthLogSetForm`, abre en `:316`) dentro de `buildRest()` — y `:2034` — **fila TIPADA** (`TypedLogSetRow`, abre en `:1660`) | **No** son puntos de preferencia: **consumen la prop `autoTimerEnabled`, no leen storage**. Solo cambia la **semántica de `cancelRest`** (CA-80). `LogSetForm` **no** recibe ni necesita `clientId` |

> ⚠ Las etiquetas estaban **invertidas** en los borradores: `:662` es **fuerza** y `:2034` es **tipada**. La corrección vale para los cuatro archivos del SDD.

**De dónde sale `hasHistory` (F5, obligatorio): `hasHistory := !showModal`.** Es la **misma señal**
que decide el modal (`esPrimerEntreno` + exclusiones de §3.7 de [DATA-TESTING](DATA-TESTING.md)),
negada — **no** `weekStatusDays` ni `lastSessionByBlock`/racha: esas están acotadas al plan o a la
semana en curso y devolverían «sin historial» para un veterano con mesociclo nuevo, que es justo la
regresión que R1 evita. 0 queries, offline-safe, y el nombre canónico
`readAutoRestPref({clientId, hasHistory})` **no cambia** — cambia solo quién alimenta ese booleano.
Limitación declarada: un veterano con plan 100 % nuevo puede ver el modal **una vez** (cuesta un
modal, no una regresión). La regla es de **no-regresión T9**: ningún wave puede sustituirla.

**Capa de pantalla — Fable, después del OK del mockup F.**

- **Cuándo aparece el modal (R32).** En el **primer ejercicio** de la sesión y **después** de que el
  overlay del **Despegue**/morph se retira y la pantalla del ejercicio ya es interactiva — en RN, el
  salto a `phase === 'session'` que hace el morph (`ExecutorV3.tsx:312-317` para el consumo de la
  marca y `:363-370` para la suscripción `subscribeMorphStartConfirmed`), y su equivalente web.
  Aparece **sin importar si ese bloque tiene descanso**: la preferencia es global y A7 habla del
  comportamiento, no del modal.
- `apps/mobile/.../v3/AutoRestModalV3.tsx` (nuevo) montado en `ExecutorV3.tsx:2107-2120`, disparado
  con `phase === 'session' && stepIndex === 0` **una vez que el overlay se retiró**, con guard de una
  sola vez por montaje.
- `apps/web/.../v3/AutoRestModalV3.tsx` (nuevo) montado en `WorkoutExecutionClient.tsx:3034-3041`,
  disparado en efecto post-montaje (nunca en el initializer) y **nunca con `clientId` nulo**.
- Filas renombradas: `v3/ExecSettingsSheet.tsx:198-221` (RN) y `:179-207` (web) — «Pasar solo al
  descanso», sublabels de R11b, sin `danger` rojo.

**Tabla de decisión que este wave implementa** (quién llama `startRest`):

| Situación | Pref **OFF** (V3/D2) | Pref **ON** |
|---|---|---|
| Pantalla sola, tras guardar a 0 | Nadie. CTA «Descansar N s» / «Siguiente serie» | El orquestador, con `countKind: 'serie'` |
| **Fuerza clásica**, tras «Aplastar serie» (sin reloj de por medio) | Nadie. CTA «Descansar N s» / «Siguiente serie» (**R24**) | El orquestador, como hoy |
| Superserie, miembro **no** último de la ronda | Nadie (hoy es `cancelRest()`); avanza de miembro (V4) | Nadie: no hay descanso de miembro. V4 manda igual |
| Superserie, **último** de la ronda | Nadie. CTA «Ronda lista · Descansar 90 s» | El orquestador, con `countKind: 'ronda'` |
| Bloque sin `rest_time` (`parseRestTime === 0`) | Nada que arrancar | Nada que arrancar |

**Invariante**: D5 **nunca** gobierna el avance de miembro (V4) ni el salto de paso (R5).

**Nota de plataforma (R28)**: `countKind: 'serie' \| 'ronda'` (con `setIndex` / `setTotal`) existe
**solo en RN** (`TimerProvider.tsx:39,52`); en web el `RestOptions` acepta `{label, warmup}`
(`WorkoutTimerProvider.tsx:20-21,33`). Las celdas «con `countKind`» de la tabla valen para RN; **en
web el rótulo «Ronda N de M» viaja en `label`**, armado con el contexto que guarda `pendingRoundRest`
⇒ el alumno lee lo mismo en las dos plataformas. Lo que queda en backlog **B13** es el interstitial
web con contador propio, no el copy.

**Dependencias.** W3, W4 y **M** (mockup F aprobado). Sin el OK del owner, esta wave entrega solo
`auto-rest-pref.ts`, el resolver puro y sus tests.

**Criterios de salida.** (1) Un alumno con historial y sin clave **no nota nada** (sigue ON);
(2) un alumno nuevo ve el modal **una sola vez** y su respuesta manda; (3) el toggle de la tuerca y el
del modal son **el mismo** estado; (4) el alumno demo **no** ve el modal; (5) el `resolveAutoRestDefault`
tiene test de las 4 ramas de cohorte **y de la variante `strategy: 'off'`** (R25); (6) con `clientId`
nulo en web no hay modal y la preferencia **lee y escribe `omni_autotimer`** (clave legacy por
dispositivo), sin clave nueva y respetando un OFF previo (R32); (7) la lectura
de la preferencia es **síncrona** y la decisión se toma antes de cualquier `await` de red (R36).

**Gate real.** `pnpm exec vitest run tests/mobile "apps/web/src/app/c/[coach_slug]/workout/[planId]"`
+ `pnpm --filter @eva/mobile exec tsc --noEmit` + `pnpm --filter @eva/mobile exec expo export --platform android`
+ `pnpm typecheck`.

---

## W6 · Cierre — 1 día-agente · **Fable (jefe)** + owner

**Objetivo.** Observabilidad, documentación, gates reales, QA del owner en 3 plataformas y la salida
en el orden obligatorio.

Contenido: los **4 eventos PostHog** de R19 (`hold_timer_started`, `hold_timer_completed`,
`hold_early_finished`, `rest_autostart_pref_set` — RN por `captureAppEvent`
(`apps/mobile/lib/analytics.ts:136-139`), web por `ph?.capture` (patrón `LogSetForm.tsx:895`), sin
PII; la prop de `hold_timer_completed` **conserva el nombre `via_app_state`** de R19 y transporta el
valor de **`expiredWhileAway`** — el rename de R27 es del contrato del motor, no del evento); Sentry con `tags: { area: 'hold-autolog' }` en el camino de auto-envío de **las dos**
plataformas (patrón `v3/session-morph.tsx:311`); la consulta de adopción a 72 h
(`SELECT metadata->>'hold_source', count(*) FROM workout_logs WHERE logged_at >= <deploy> AND actual_hold_sec IS NOT NULL GROUP BY 1`,
declarando que **no hay índice sobre `metadata`** ⇒ es una consulta acotada por fecha, no un
dashboard); docs (`docs/status/CURRENT.md` ≤ 16 KB, `docs/status/MOBILE_PARITY.md`,
`docs/testing/TEST_STATUS.md`, las 4 specs a `status: done` al cerrar el QA); **Playwright del caso
canónico con seed sintético** (DECISIONS-2 PLAN 1: extensión de `seed:e2e-personas` con un alumno
E2E, **nunca datos de Movens**; el assert final es una consulta de DB **en solo lectura**), **solo al
cierre** y con 1 navegador; y la salida en el **orden único (R35): W0 ya migró → deploy web → OTA**
1.1.2 android+ios por `.github/workflows/mobile-ota.yml` (publicar a mano está prohibido por runbook).

**W6 no aplica ninguna migración: M1 y M2 se aplicaron en W0 (R35).** Acá se **verifica** —antes de
desplegar— que las dos aparecen en `list_migrations` con su timestamp y que `has_function_privilege`
confirma la ACL de `get_client_exercise_prs` idéntica a la previa. Si la verificación falla, **no hay
deploy**.

Antes de la OTA, **aviso general a coaches** (`news_items`) con lo que el tren cambia para todos:
(a) **M2 corrige récords ya listados** — el filtro `reps_done > 0` toca **617 filas, 25 alumnos, 72
pares alumno × ejercicio**, en **una línea** y **sin mensajes individuales** (R35); (b) **una línea
por W5.3**: con «Pasar solo al descanso» apagado, un descanso que el alumno arrancó a mano **ya no se
cancela** (DECISIONS-2 PLAN 3); (c) **flota mixta**: un alumno en 1.1.2 sin la OTA ve el bloque en
modo tiempo como fuerza clásica con `reps = "30s"` de objetivo y registra a mano (degradación
honesta, sin crash).

Y el **aviso a Gerardo (Movens)**, que es el caso que originó el tren: (a) sus 21 bloques de
movilidad en superserie ahora traen reloj y se guardan solos; (b) «plancha frontal mantenida» puede
pasar de Cardio a **Fuerza por tiempo** con carga y RIR — el cambio lo hace él, el tren **no migra
datos**.

**Android (A6, sin código en este tren).** El runbook de testers lo ejecuta **el owner** en Play
Console; el cambio de copy «app en iOS» → «app en iOS y Android» queda **preparado y NO aplicado**
hasta que llegue el correo de Google (respuesta esperada ≤ 13-09). Son 2 archivos + 1 test:
`apps/mobile/components/coach/InviteStudent.tsx:214`,
`apps/web/src/lib/email/transactional-templates.ts:270` y su guard
`apps/web/src/lib/email/transactional-templates.test.ts:284`, que fija el string literal y rompe CI si
se cambia uno sin el otro. La variante web `InviteStudentSheet.tsx:159` **no menciona iOS** y no se
toca.

---

## Gates (proporcionales, todos antes del push)

| Gate | Comando |
|---|---|
| Tests | `pnpm test` (vitest, suite completa) |
| Motor y schemas | `pnpm exec vitest run packages/workout-engine packages/schemas packages/plan-builder` |
| Typecheck web | `pnpm typecheck` |
| Typecheck mobile | `pnpm --filter @eva/mobile exec tsc --noEmit` |
| Bundle mobile | `pnpm --filter @eva/mobile exec expo export --platform android` |
| Lint | `pnpm lint` (2 pasadas: `apps/web/src tests scripts tools` + `eslint.mobile.config.mjs` sobre `apps/mobile`) |
| Tokens | `pnpm check:tokens` |
| Docs | `pnpm docs:check` (incluye el tope de 16 KB de `CURRENT.md`) |
| E2E | `pnpm test:e2e` del ejecutor, **solo al cierre**, 1 navegador |
| Humo prod | `pnpm qa:prod:suave` **después** del deploy |
| SQL (**en W0**, R35) | tx-rollback de las 2 migraciones **con la prueba positiva adentro** (bloque temporal sobre un plan del alumno E2E, `UPDATE reps_unit='sec'`, `ROLLBACK` ⇒ en LIVE solo persiste la migración) + conteo de filas en violación (0) + `EXPLAIN` de `get_client_exercise_prs` antes/después. **W6 solo verifica `list_migrations` + ACL** |

**Baseline de CI rojo preexistente (R17), para no declarar verde lo que ya estaba rojo:**

| Test | Estado ANTES del tren | Estado esperado DESPUÉS |
|---|---|---|
| `nutrition-smoke` (job de CI) | rojo — el job corre sin `NEXT_PUBLIC_SUPABASE_*` | rojo, sin relación con este tren |
| `apps/web/.../profile-analytics/overview.test.ts` | rojo **según la hora del día** (depende del reloj) | igual; si corre de noche, sigue rojo |

⚠ **Corrección del writer 2**: el OUTLINE §7 listaba
`pnpm --filter @eva/workout-engine test` como gate de W1. **Ese script no existe**: ni
`@eva/workout-engine` ni `@eva/schemas` ni `@eva/plan-builder` tienen script `test` en su
`package.json`. Los tests de `packages/**/*.test.ts` corren bajo el project `web-node`
(`vitest.config.ts:55,86-90`), así que el gate real es por ruta:
`pnpm exec vitest run packages/workout-engine`.

---

## QA del owner (solo contra algo desplegado; 3 plataformas)

El checklist **canónico**, casilla por casilla, es el de [DATA-TESTING](DATA-TESTING.md) §7:
**45 puntos = 18 (RN iOS device) + 15 (PWA móvil) + 12 (web desktop de coach)**. Es el único que
cubre los tres puntos que el `SPEC` declara **obligatorios** y que ningún otro listado tiene:
**CA-96 keep-awake** (§7.1 p17), **CA-97 / R29 movilidad sin `duration_sec`** (§7.1 p18) y
**R31 notificación del SO** (§7.1 p16). [TASKS](TASKS.md) § «QA del owner» **referencia** ese
checklist, no lo duplica. Entre los 45 van V1, V2, V3, V4, D2, D5, fuerza por tiempo, modo avión,
bloqueo de pantalla a mitad del hold y el punto nuevo de **R24** («alumno nuevo, fuerza clásica,
preferencia OFF ⇒ **hay cómo descansar**», §7.1 p15 y §7.2 p13).

- **Web desktop** (Chrome, light y dark): builder de Movens, ficha del alumno, ejecutor en pantalla
  grande.
- **PWA móvil** (Android Chrome, 390 px, instalada y sin instalar): superserie «Dia B», movilidad
  sola, fuerza por tiempo, modal de D5.
- **RN device** (app 1.1.2 tras aplicar la OTA): mismo recorrido + modo avión + bloqueo de pantalla.

**Control de no-regresión obligatorio, repetido en los tres bloques:** *un coach que solo usa reps y
un alumno suyo se ven exactamente igual que antes del deploy* — es el criterio duro del tren, no un
chequeo opcional (8 173 de 8 960 bloques del sistema son fuerza clásica).

---

## Riesgos

| Riesgo | Mitigación |
|---|---|
| `reps_unit = 'sec'` rebota con `23514` y **tumba el plan entero** (el guardado es por programa completo) | Migración de W0 **antes** del deploy y de la OTA (R4); definición del CHECK copiada literal desde LIVE con `pg_get_constraintdef`, nunca de memoria; 0 filas en violación verificado |
| `metadata.hold_source` nunca llega a la DB por el camino web y el bug es **invisible** (la UI se ve bien) | `packages/schemas/workout.ts:301-320` lo declara en W0 + test que prueba que sobrevive el parse; Zod v4 estripa lo no declarado (`:293-297`) |
| **Movilidad guarda sin marca de fuente** ⇒ CA-28 falso y la métrica «> 50 % `'timer'`» de §15.2 inmedible, justo en el caso que originó el tren (21 de 32 bloques de Movens) | `TypedPayloadContext` gana `holdSource` en **W1** y `buildLogMetadata` lo mezcla como `hr` (bilateral **también** gana `metadata`); RN lo pasa como objeto en **W3**; la rama tipada web lo escribe en bilateral y `collectMetadata` amplía su tipo en **W4**. Test de las 3 claves + test de que sin `holdSource` el payload sigue byte-idéntico |
| **El auto-envío web apuntaba a la fila equivocada**: `holdPrefill` vive en `TypedLogSetRow` y fuerza por tiempo se pinta en `StrengthLogSetForm` ⇒ C no guardaba y **fallaba en silencio** | W4 parte la tarea en (a) fila tipada y (b) fila de fuerza con inputs, refs, efecto por nonce y `formRef.current?.requestSubmit()` sobre el `formRef` de `:449`, más el gate `\|\| isLogged` copiado de cardio (`:1820`) para no re-enviar una serie ya logueada |
| Un bloque de movilidad **sin `duration_sec`** (94 en LIVE) monta el módulo en superserie ⇒ anillo `0:00` y CTA muerta | Predicado único (**R29**): el módulo se monta **solo si `duration_sec > 0` o `isStrengthTimeBlock`**; si no, la fila manual de hoy queda tal cual. Test del predicado + punto de QA sobre un bloque sin duración |
| **El alumno nuevo (pref OFF) se queda sin forma de descansar**: en V3 no existe botón manual (RN solo tiene los `startRest` automáticos de `ExecutorV3.tsx:796,830`; el `ManualTimerButton` web vive en la barra legacy, `WorkoutExecutionClient.tsx:296`) | **R24**: par «Descansar N s» / «Siguiente serie» en las 4 superficies con pref OFF y `rest_time > 0`, tarea `[UI · Fable]` presupuestada en W3 y W4 (+0,25 d-a cada una) y punto de QA propio. **No es recortable** |
| Leer la señal de background **del emisor** (quién disparó el fin) da `false` con la app fuera de foco ⇒ el lado 2 arranca solo y V2 escribe datos falsos | **R27**: `expiredWhileAway` se **deriva de evidencia** (`(now - endAtMs) > 1500` o app no activa), con test de los **dos** caminos de disparo con reloj falso exigiendo el mismo resultado; y `prime(seconds)` para dejar el lado 2 armado sin correr |
| Tocar `.exec-v3-holdwrap` / `.exec-v3-holdnum` para meterle tamaños **rompe cardio**, que las usa (`CardioStepV3.tsx:518,538,689,711,722`) | **R33**: clase nueva `.exec-v3-holdmod` con `--exec-hold-size` y selectores propios; las de cardio **no se tocan**; Movilidad sola migra al módulo nuevo conservando 214 px |
| Prometer que el hold **«suena»** a 0 y que el aviso llega siempre | **R31**: el criterio es **«vibra y avisa»** (háptica en foreground + notificación del SO **solo con permiso ya concedido**, 4 reglas QA-10 de `cardio-notification.ts:15-21`). En «Qué NO se promete»: Android sin `SCHEDULE_EXACT_ALARM` cae a `setAndAllowWhileIdle`; la PWA en iOS en background **no avisa**; y con «Pantalla siempre encendida» apagada la pantalla puede dormirse (el reloj se reconstruye por `endAtMs` y guarda al volver) |
| Con «+ Segundos» (D4) el alumno lee **«+5 rep/ses»** en el ejecutor y en el PDF | `formatProgressionTag` único en el motor (W1) consumido por los **6** puntos (W2), con test de los tres casos y chequeo en Q3 del QA del coach |
| El guardado automático **rompe V3 y D2 en el mismo commit**: cualquier submit dispara `startRest` hoy | Canal de supresión explícito en `LogSetForm.tsx:662,2033-2047` y `ExecutorV3.tsx:754-843` + `pendingRoundRest` (R9). Es el riesgo mayor del tren y se prueba en QA en las 3 plataformas |
| El contexto de ronda se pierde al mover el descanso al toque (el interstitial diría «Serie N de M») | **R28**: `pendingRoundRest` vive en el **orquestador** y lleva el `RestRoundContext` **completo** (`roundNumber`, `totalRounds`, `next`) construido **en el commit y ANTES** del reset de `restRoundContextRef` (`ExecutorV3.tsx:295,696`; el contexto se arma en `:772-791`); RN llama el mismo `startRest(..., countKind:'ronda', setIndex, setTotal)` de `:796` y **web lleva el rótulo en `label`** (no existe `countKind` en web) |
| Doble envío por `restart`, `visibilitychange` o `AppState` | `sentSetsRef` por `(block, set, side)` calcado de `CardioScreenV3.tsx:364`, más `firedRef` del hook y el índice único `workout_logs_one_set_per_day` ⇒ un doble disparo **sobrescribe la misma fila**, no crea una serie fantasma |
| El hold vence en background y el lado 2 **arranca solo** ⇒ datos falsos | **R6 + R27**: con `expiredWhileAway` se guarda **el objetivo** (`prescribedSec`, nunca el reloj de pared) y el lado 2 queda `prime`ado en «Iniciar lado derecho». Caso explícito en el QA del owner |
| El SO mata el proceso y el hold en curso **se pierde** | **R13**: se declara en el SPEC («si la app se cierra del todo, reinicia el hold»). `holdAnchor` persistido queda en el backlog |
| Doble aviso en iOS: el handler global muestra las notificaciones también en foreground (`apps/mobile/lib/push.ts:86-95`), y las huérfanas se apilan en MIUI | La notificación de hold se cancela en los últimos ~2 s y al volver a foreground, copiando `useRestTimerEngine.ts:270,312-313`, con id `eva-hold-end` propio; y **las 4 reglas QA-10** de `cardio-notification.ts:15-21` (id estable, cola serializada, dismiss de entregadas, sweep de huérfanas) se copian enteras (**R31**) |
| Cambiar el default de la preferencia a OFF **regresiona a toda la base viva** (hoy es ON device-scoped) | Default **por cohorte** (R1): quien ya tiene historial conserva ON; OFF + modal solo para el primer entreno. ⚠ Pregunta Q1 al owner |
| La preferencia **no** se sincroniza web ↔ RN (storage local) | Aceptado y declarado: el alumno la puede ver distinta en la PWA y en la app, y el modal sale una vez por superficie. Sincronía por servidor exigiría una política RLS nueva (`client_feature_prefs` **no** admite escritura del alumno, `20260618200000_feature_prefs.sql:102-115`) ⇒ backlog |
| El anillo compacto empuja la fila de captura fuera del viewport a 390 px | El CSS de hoy está fijo en 214 px: **`.exec-v3-holdmod` con `--exec-hold-size` (80/130/214) es cambio obligatorio**, no opcional (R33); QA a 390 px en los 3 bloques |
| Cambiar el default a OFF resulta ser lo que el owner NO quería y hay que revertirlo a mano en 5 archivos | **R25**: la estrategia vive en **una constante única**, `AUTOREST_DEFAULT_STRATEGY` en `auto-rest-pref.ts` (RN y web) ⇒ Q1 = «OFF global» es **una línea** + una fila de test |
| `readAutoRestPref` asíncrona ⇒ la decisión llega **después** del `await` de red y el descanso arranca igual con la pref OFF | **R36**: lectura **síncrona** con caché hidratada una vez (patrón `rest-timer-preferences.ts`), decidida antes del `await` (`ExecutorV3.tsx:748-754`); en web la verdad vive en `WorkoutExecutionClient` y baja como prop `autoTimerEnabled` |
| La doble progresión trata 30 segundos como 30 reps y sube el peso sola | Guard de W1 en `progression.ts:142-149` + test que fija que un bloque de reps con `'double'` queda byte-idéntico |
| Un hold con disco aparece como récord «20 kg × 0 reps» en la ficha y en la PR-card | Migración 2 de W0 (`get_client_exercise_prs`) + `pr-card/route.tsx:79-85` en W4. Las otras 12 RPC ya filtran por `reps_done > 0` o por presencia y dan **0 diff** |
| Un bloque que pasa de Reps a Segundos **conserva su `block_id`** ⇒ conviven logs viejos con `reps_done` y nuevos con `actual_hold_sec` | Es correcto (cada log es la verdad de su día) y la ficha los pinta con líneas distintas; se declara en el SPEC y en el aviso a Gerardo |
| Flota mixta entre el deploy y la OTA | Un cliente 1.1.2 sin la OTA ve el bloque en modo tiempo como fuerza clásica con `reps = "30s"` — degradación honesta, sin crash. Va en el aviso |
| Declarar verde algo que ya estaba rojo en CI | Tabla de baseline arriba (`nutrition-smoke`, `profile-analytics/overview.test.ts`) |

---

## Backlog heredado (no bloquea este tren)

Los IDs **B1–B13** son los mismos acá y en [TASKS](TASKS.md) § «Backlog heredado» —una sola
numeración para todo el SDD—, y la deuda de `RestOptions` web tiene **un solo costo: B13, 0,25 día**.

| # | Deuda | Dónde | Costo estimado |
|---|---|---|---|
| B1 | **Roller con cuenta atrás** (R12). RN usa cronómetro **ascendente** (`RollerScreenV3.tsx:103` `useStopwatch`) y la web **no tiene countdown** en roller: es trabajo nuevo, no reuso. Movens tiene **0** bloques roller con `duration_sec`; global 17 de 85. `HoldModuleV3` nace con `kind: 'mobility' \| 'strength_time'` y deja `'roller'` documentado como extensión | `RollerScreenV3.tsx`, `RollerStepV3.tsx` | 1 día |
| B2 | **`holdAnchor` persistido** (R13): sobrevivir a que el SO mate el proceso, persistiendo el `endTime` en el `SessionDraft` que ya existe (`workout-session.ts:391-398`) | `v3/use-hold-module.ts` + `workout-session.ts` | 0,5 día |
| B3 | **Sonido a 0** (R18): `expo-audio` está instalada y `sound.ts` la carga con `require` guardado, pero el propio archivo dice que la reproducción real «se confirma en device» (`sound.ts:23-27`). No se promete sin QA de device previa | `timers/sound.ts` | 0,5 día + QA device |
| B4 | **Live Activity / lockscreen del hold**: `LiveActivityKind` es `'rest' \| 'cardio'` (`timers/live-activity.ts:34`) y el archivo declara que **exige build EAS nuevo** (Swift + Widget Extension) ⇒ imposible por OTA | `timers/live-activity*` | build nativa |
| B5 | **Sincronización servidor de la preferencia D5**: 1 política RLS aditiva (`client_feature_prefs` con `client_id = auth.uid()` y `domain = '_exec'`) + fila reservada, con el storage local como cache offline | `supabase/migrations` + `auto-rest-pref.ts` ×2 | 0,5 día |
| B6 | **PR / e1RM en modo tiempo** (A4): hoy `detectPR` descarta por `reps_done > 0` ⇒ nunca celebra. Un «récord de tiempo bajo carga» es feature nueva | `pr-detect.ts` | 1 día |
| B7 | **Frenar el salto de paso** tras un guardado por reloj (R5): hoy se mantiene igual que con guardado manual. ⚠ Pregunta Q2 al owner | `ExecutorV3.tsx:1798-1811`, `WorkoutExecutionClient.tsx:1967-1973` | 0,25 día |
| B8 | `TemplatePickerDialog.tsx:102-148` **no copia `warmup_rest_time`** (deuda preexistente, se agrava si el modo tiempo se usa en calentamientos) | builder web | 15 min |
| B9 | `mergeBlocksForSync` empareja por `order_index`: si el coach convierte un bloque a segundos en el plan del alumno y la plantilla no cambia, sin `is_override` la sincronización **lo revierte a reps** (deuda preexistente) | `workout.service.ts:1359-1371` | 0,5 día |
| B10 | Índice sobre `metadata` para consultar `hold_source` a escala (hoy la consulta de adopción va acotada por fecha) | `supabase/migrations` | 30 min |
| B11 | **Persona/seed E2E con superserie de movilidad `per_side`** (hoy no existe ninguna en `docs/testing/E2E_PERSONAS.md`), necesaria para el Playwright del caso canónico sin tocar datos de Movens | `tests/separation/personas.ts` | 0,5 día |
| B12 | Fuera de alcance por decisión del owner: cardio (no se toca en este tren) · Play a producción (calendario ≤ 13-09) · cobros coach→alumno | — | — |
| B13 | **`RestOptions` de la web sin `countKind`/`setIndex`/`setTotal`** (`WorkoutTimerProvider.tsx:18-21,33,41` acepta solo `{label, warmup}`; `grep countKind apps/web` ⇒ 0 hits) ⇒ el interstitial de la PWA no puede decir «Ronda N de M» con **contador estructurado** como el de RN (`TimerProvider.tsx:39,52`). **No bloquea nada**: por R28 el rótulo ya viaja en `label` en este tren; lo que falta es la estructura, no el copy. Este tren declara esos tres campos **solo RN** | `WorkoutTimerProvider.tsx`, `ActiveTimer` / `RestOverlay` web | 0,25 día |
