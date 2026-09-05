---
status: done
owner: engineering
last_verified: "2026-09-04 @ a567f6e2"
canonical: false
---

# TESTING-QA — Ciclo real y por lado (tren Movens)

Matriz de pruebas del tren D4. Autoridad: `DECISIONS.md` > `OUTLINE-16-RESOLUCIONES.md` (R9–R40) >
`DECISIONS-2.md` > `OUTLINE.md` (§13 Enmiendas incluido) > este archivo.
Todas las rutas y líneas de abajo están verificadas contra `D:/Proyectos/Antigravity/gymappjp`,
rama `rnmobiledenuevo`, HEAD `dbdf4b5e`. Los nombres de archivo nuevos son los canónicos de
RESOLUCIONES y OUTLINE §12/§13; ningún fixer los renombra.

Criterio de salida del tren (OUTLINE §8): **weekly con 0 diff** (equivalencia SQL + parity tests +
`resolveCycleCursor` en modo weekly = identidad), Movens ve «Día N de 3» con racha > 0, y «Remo a un
brazo con kettlebell» registra «10 / 10».

---

## 0. Cómo se corre esta suite (corrección de comandos)

El runner **no** usa filtros de workspace pnpm. `vitest.config.ts:80-121` declara cuatro *projects*:

| Project | `environment` | `include` | Notas |
|---|---|---|---|
| `web-node` | node | `apps/web/src/**/*.test.ts`, `tests/**/*.test.ts`, `packages/**/*.test.ts`, `scripts/**/*.test.ts` | excluye `tests/mobile/**` (`vitest.config.ts:58`) |
| `web-dom` | jsdom | los mismos globs en `.test.tsx` | idem |
| `mobile-node` | node | `tests/mobile/**/*.test.ts` | `testTimeout: 15_000` (`vitest.config.ts:63`) |
| `mobile-dom` | jsdom | `tests/mobile/**/*.test.tsx` | idem |

Consecuencias para este tren:

- `pnpm test --filter <paquete>` **no existe** como gate: el script raíz es `"test": "vitest"`
  (`package.json:14`). El aislamiento se hace por ruta (`pnpm exec vitest run <archivo>`) o por
  project (`--project mobile-node`).
- Todo `packages/workout-engine/*.test.ts` y `packages/schemas/*.test.ts` corre en `web-node`
  (glob `packages/**`), aunque el paquete tenga su propio `package.json`.
- `tests/mobile-program-persistence.test.ts` vive en la **raíz** de `tests/`, no en `tests/mobile/`:
  corre en `web-node` con timeout normal de 5 s. Un test RN que monte módulos de `apps/mobile` con
  `vi.doMock` + `import()` dinámico **debe** ir a `tests/mobile/` o se cae por timeout.
- Los `*.spec.ts` de Playwright quedan fuera por construcción: el patrón de vitest es `*.test.*`
  (`vitest.config.ts:55`).

---

## 1. Unit del motor (W0) — bloquea a todas las waves

### 1.1 `packages/workout-engine/cycle-cursor.test.ts` (NUEVO)

Bajo test: `resolveCycleCursor(input)` (OUTLINE §2 + §13). Función **pura**: no lee `Date.now()`,
recibe `todayIso`. `N` = `cycle_length`. Por **R30** el programa de entrada trae `start_date` **y**
`start_date_flexible`, y la salida agrega `programState: 'not_started' | 'active'`
(`not_started` ⇔ `start_date_flexible && start_date == null`): hero web, hero RN y ficha del coach lo
leen de ahí y **nadie lo re-deriva** — un `it` afirma que el campo existe en las dos ramas.
Las `completions` **no** se calculan acá: llegan de `buildCycleCompletions` (§1.1b, **R9**).

| # | Entrada | Salida esperada |
|---|---|---|
| C1 | `mode weekly`, `todayIso` martes (ISODOW 2), planes dow 1/2/4 | `mode:'weekly'`, `todayPlanId` = plan dow 2, `todayCycleIndex:2`, `slots` por ISODOW. **Las `completions` no alteran nada** (identidad con el comportamiento de hoy) |
| C2 | weekly, `todayIso` domingo, sin plan dow 7 | `todayPlanId:null`, `todayState:'todo'`, `nextPlanId` = el siguiente dow con plan; nunca lanza |
| C3 | weekly con `completions` que en modo cycle darían otro día | salida **byte-idéntica** a C1 (regresión dura de «weekly no cambia ni un byte», DECISIONS D1) |
| C4 | cycle N=3, `completions: []`, `start_date: null` | `todayCycleIndex:1`, `todayState:'todo'`, `nextCycleIndex:2`, `lastCompleted: undefined` |
| C5 | cycle N=3, último completado = índice 1 el día `todayIso-1` | `todayCycleIndex:2`, `todayState:'todo'`, `nextCycleIndex:3` |
| C6 | cycle N=3, último completado = índice **3** hace 2 días | `todayCycleIndex:1` (wrap `(3 mod 3)+1`), `nextCycleIndex:2` |
| C7 | cycle N=3, completado **hoy** el índice 2 | `todayState:'done'`, `todayCycleIndex:2`, `nextCycleIndex:3`, `lastCompleted:{cycleIndex:2,dateIso:todayIso}` |
| C8 | cycle N=3, `inProgress:{planId: plan del índice 2, dateIso: todayIso}` sin completar | `todayState:'in_progress'`, `todayPlanId` = ese plan (el cursor NO adelanta) |
| C9 | cycle N=3, dos completions con la **misma fecha**, índices 1 y 2 | empate → gana el mayor índice ⇒ `todayCycleIndex:3` |
| C10 | cycle N=3, último completado hace 25 días (índice 2) | `todayCycleIndex:3` — la ventana de 30 d lo alcanza, no reinicia |
| C11 | cycle N=3, `completions: []` porque el último fue hace 45 días (fuera de la ventana de 30 d) | `todayCycleIndex:1` — **reinicio explícito, sin persistencia** (R10: es comportamiento, no riesgo); comentario en el test citando la regla |
| C12 | cycle **N=1** | `todayCycleIndex:1` siempre; tras completar hoy, `nextCycleIndex:1` (no hay día 2) |
| C13 | cycle **N=8**, último completado índice 8 | `todayCycleIndex:1`. Cubre R8 tal como lo corrige **R33**: el módulo es sobre `N`, nunca sobre 7 |
| C14 | cycle **N=14**, último completado índice 7 | `todayCycleIndex:8` (jamás «Lun»); `slots.length === 14` |
| C15 | cycle N=3 con índices 1 y 2 completados anteayer/ayer, hoy=3 | `slots` = `[done+doneDateIso, done+doneDateIso, today]`; ningún `'upcoming'` **antes** de hoy |
| C16 | cycle N=3 sin plan cargado para el índice calculado (el coach borró el del día 2) | el cursor **SALTA al siguiente índice con plan** ⇒ `todayCycleIndex:3`, `todayPlanId` = plan del 3 (R9 + DECISIONS-2 D3a: los planes que no participan no son «hoy») |
| C17 | misma entrada invocada dos veces | salidas `toEqual` idénticas; el test congela `todayIso` y no usa `vi.useFakeTimers()` |
| C18 | cycle con `plans` ya filtrados por variante A/B (el caller aplica `filterPlansForStructureView`) | el cursor no vuelve a filtrar: `slots` respeta exactamente el arreglo recibido |
| C19 | cycle N=3, plan del índice 2 **sin bloques** (`buildCycleCompletions` no lo emite y el caller no lo pasa) | el cursor lo salta igual que C16: nunca es «hoy» ni entra en `completions` (R9) |
| C20 | cycle, `start_date_flexible:true` y `start_date:null` | `programState:'not_started'`, `todayCycleIndex:1`, `todayState:'todo'` (R30) |
| C21 | cycle, `start_date_flexible:true` con `start_date` ya fijado; y cycle con `start_date_flexible:false` y `start_date:null` | `programState:'active'` en **ambos** — solo la conjunción de R30 da `not_started` |
| C22 | weekly con `start_date_flexible:true` y `start_date:null` (R13: el flag aplica a weekly y cycle) | `mode:'weekly'` con `programState:'not_started'`; el resto de la salida **byte-idéntico** a C1 |
| C23 | cycle, `todayState:'done'` con el índice 2 hecho hoy | `todayPlanId` = plan del **día hecho** (el 2) y `nextPlanId` = plan del 3 (DECISIONS-2 D3b, explícito para que el hero pueda reabrir el día) |

Anti-caso obligatorio (no-vacuidad, espejo del harness SQL): un `it` que afirme que **al menos un
caso cycle devuelve un índice distinto del ISODOW de `todayIso`** — si no, un cursor que devolviera
siempre el día calendario pasaría los 23 casos.

### 1.1b `packages/workout-engine/cycle-completions.test.ts` (NUEVO — R9, tarea W0.2b)

Bajo test: `buildCycleCompletions({ plans, blocksByPlan, logs, todayIso })
→ { completions: CycleCompletion[], inProgress?: { planId, dateIso } }`
(`packages/workout-engine/cycle-completions.ts`, nombre canónico de OUTLINE §13). Reutiliza
`countLoggedSetsByBlock`, `skippedBlockIdsFromLogs` y `deriveDayCompletion`: el test **no** reimplementa
la completitud, la ejercita a través del productor.

| # | Entrada | Esperado |
|---|---|---|
| B1 | plan con todos sus bloques cubiertos por logs de ayer | una `completion` `{planId, dateIso: ayer}` |
| B2 | plan con logs parciales de **hoy** | **cero** `completions` y `inProgress:{planId, dateIso: todayIso}` |
| B3 | plan **sin bloques** (`blocksByPlan[planId]` vacío) | no participa: ni `completions` ni `inProgress`, y nunca puede ser «hoy» (R9; espejo de C19) |
| B4 | log con `logged_at` de anoche 23:30 UTC que en Santiago cae **ayer** | la completitud se fecha por `eva_santiago_day(logged_at)`, no por UTC (R11) |
| B5 | log escrito con un `target_date` distinto del día del `logged_at` (repetir el día / editar un día pasado) | **manda `target_date`** (R11) en **escritura**: es el `target_date` del ítem encolado —no una columna de `workout_logs`, §1.1b—, que en modo solo-UPDATE actualiza la fila **ya existente de ese día** (`offline-cache.ts:128-146`) sin tocar su `logged_at`; en **lectura** la completitud se fecha por `eva_santiago_day(logged_at)`, así que queda fechada ahí y editar un día viejo **no lo mueve** de fecha |
| B6 | dos completitudes insertadas en orden inverso (la del día 1 se registró después que la del día 2, pero con fecha de ayer) | el consumidor sigue la **más reciente por FECHA**, no por orden de inserción (R11): registrar el Día 1 con fecha de ayer ⇒ hoy toca el Día 2 |
| B7 | log con `block_id: null` (huérfano) | **neutro**: no suma ni resta completitud (R29) |
| B8 | log de un bloque que pertenece a **otro** programa | no cuenta para este ciclo: el enlace `block → plan` es el que decide (R29) |
| B9 | bloque marcado como omitido (`skippedBlockIdsFromLogs`) | no impide la completitud del día — mismo veredicto que `deriveDayCompletion` da hoy |

Contrato de lectura compartido (**R10**), afirmado como test de paridad web↔RN en §3.1/§4.x:
ambas plataformas alimentan el productor con la **misma** query — logs de los **últimos 30 días**,
`select block_id, workout_blocks(plan_id), set_number, logged_at, metadata`, `order by logged_at desc`,
`limit 200`. **Forma verificada** (PLAN.md): `plan_id` no es columna de `workout_logs` (viaja por el
join `workout_blocks(plan_id)`) y `target_date` **tampoco existe** en la tabla
(`apps/mobile/lib/offline-cache.ts:123-124`: «`target_date` no existe en `workout_logs` → PGRST204»;
0 hits en `supabase/migrations`): es metadato de la cola offline. Por eso la fecha de R11 sale de
`eva_santiago_day(logged_at)` **en lectura** y del `target_date` del ítem **encolado** en escritura.
Un `it` fija que con más de 200 logs en la ventana el productor no asume completitud de
lo que no vino (no inventa días) y que sin completitudes en la ventana el resultado es `[]` ⇒ Día 1
por C11.

### 1.2 `packages/workout-engine/program-day-label.test.ts` (NUEVO)

Bajo test: `programDayLabel(dayOfWeek, structure, cycleLength, { form })`.

**R31 manda sobre la columna `chip`:** weekly devuelve las **3 letras de hoy** (`Lun`, `Mar`…), no la
inicial — el chip de 34 px de la biblioteca no cambia para los 276 programas weekly. Solo `cycle`
estrena forma corta (`D1`, `D2`…).

| Entrada | `short` | `long` | `chip` |
|---|---|---|---|
| `(1, 'weekly', null)` | `Lun` | `Lunes` | `Lun` |
| `(7, 'weekly', null)` | `Dom` | `Domingo` | `Dom` |
| `(3, 'weekly', null)` | `Mié` | `Miércoles` | `Mié` (la tilde también en el chip weekly) |
| `(2, 'cycle', 3)` | `Día 2` | `Día 2 de 3` | `D2` |
| `(1, 'cycle', 1)` | `Día 1` | `Día 1 de 1` | `D1` |
| `(8, 'cycle', 14)` | `Día 8` | `Día 8 de 14` | `D8` |

Casos extra:
- `structure` omitido/`null` ⇒ se comporta como `weekly` (espejo de `WorkoutProgramSchema`,
  `packages/schemas/workout.test.ts:46` «estructura omitida = weekly»).
- `('cycle', cycleLength: null)` ⇒ fallback legacy a 7 (`Día 3 de 7`), espejo del test
  «mantiene fallback legacy de 7 días para ciclos sin `cycle_length`».
- Fuera de rango (`0`, `8` en weekly, `15` en cycle) ⇒ cadena vacía, **nunca** lanza ni devuelve
  `undefined` interpolado.
- **Tilde**: `Día` con tilde en `short` y `long` de cycle; el `chip` de cycle (`D2`) no la lleva, pero
  el `chip` weekly de miércoles y sábado **sí** (`Mié`, `Sáb`). Un `expect(...).toContain('í')`
  evita que un fixer la pierda (precedente: la deuda de tildes en `program-model.ts:93`, OUTLINE §11).
- Regresión dura: para **ningún** input `cycle` la salida contiene `Lun|Mar|Mié|Jue|Vie|Sáb|Dom`
  (`expect(out).not.toMatch(/Lun|Mar|Mié|Jue|Vie|Sáb|Dom/)`), en las 3 formas y para `N` de 1 a 14.
  El espejo weekly va en la otra dirección (R31), acotado: para **ningún** input `weekly` cambian la
  **longitud** ni la **inicial** del `chip` (siempre 3 letras, nunca la inicial suelta `L`); la
  **única** diferencia admitida respecto de lo que la biblioteca pinta hoy son las **tildes** de
  `Mié` y `Sáb` (hoy `program-model.ts:93` pinta `Mie`/`Sab`; la deuda de ese archivo sigue en
  backlog, OUTLINE §11). El test lo escribe así —`expect(chip).toHaveLength(3)` + inicial igual a la
  de hoy— y **no** como igualdad byte a byte contra `DAY_LABELS`.

### 1.3 `packages/workout-engine/set-log-payload.per-side.test.ts` (AMPLIAR)

Hoy tiene 3 `describe` (`:13`, `:44`, `:67`) y cubre **solo movilidad**. Se agrega un cuarto:
`describe('buildStrengthPayload — reps POR LADO (per_side / alternating)')`.

`ctx.sideMode` ∈ `per_side | alternating`. `reps_done` = **mínimo** de los dos lados (R3).

| Entrada (`values`) | `reps_done` | `weight_kg` | `metadata` |
|---|---|---|---|
| `reps_left:'12'`, `reps_right:'10'`, `weight:'20'`, `sideMode:'per_side'` | `10` | `20` | `{left_reps:12, right_reps:10}` |
| `reps_left:'10'`, `reps_right:'10'`, `weight:'20'` | `10` | `20` | `{left_reps:10, right_reps:10}` |
| igual, con `sideMode:'alternating'` | `10` | `20` | idéntico al anterior (R4: misma captura) |
| solo `reps_left:'10'` | `10` | — | `{left_reps:10, right_reps:null}` |
| ningún lado | `null` | — | **sin key `metadata`** (no `metadata:null`) |
| `reps_left:'12,6'` (coma es-CL) | redondea a `13` antes de comparar | — | `{left_reps:13, …}` |
| `weight:'62,25'` | — | `62.25` exacto | — |
| lado negativo / `'abc'` / vacío / `10000` | ese lado ⇒ `null`; si el otro tiene dato, `reps_done` = el presente | — | el lado inválido va `null` (rango válido 0..9999, R27) |

Casos de paridad (bloquean la regresión de los 296 logs históricos y de los 63 coaches weekly):
- **Sin `ctx`** (o `ctx.sideMode` ausente/`null`): el payload es **byte-idéntico** al de hoy y
  **no gana la key `metadata`** — espejo literal del `it` vigente `:91`.
- `ctx.sideMode:'per_side'` sobre un bloque **no strength** (cardio/roller) no altera nada:
  `buildTypedPayload` sigue mandando (los `it` `:57` y `:37` deben seguir verdes sin tocarse).
- `metadata` de fuerza **nunca** emite `left_sec`/`right_sec`, y `metadata` de movilidad nunca emite
  `left_reps`/`right_reps`: un `it` cruzado que compare las keys de ambos shapes.

### 1.4 `packages/workout-engine/logged-set-summary.test.ts` (AMPLIAR — export nuevo, contrato viejo intacto)

**R19 (opción a) manda sobre OUTLINE §2.** `formatLoggedSetLine(kind='strength', …)` **SIGUE
devolviendo `null`**. El desglose por lado sale de un export nuevo del mismo módulo:
`formatStrengthSetLine(log) → string | null`, que devuelve «20 kg × 10 / 10» **solo** cuando
`metadata` trae los dos lados y `null` en cualquier otro caso.

Consecuencia directa para las pruebas: el `it` vigente `logged-set-summary.test.ts:111` («fuerza:
`null` ⇒ el caller mantiene su fila peso × reps intacta») **no se toca ni se reescribe** — es la
garantía de que el `null` sigue siendo el interruptor de render de los call sites y de que la
comparación objetivo↔hecho, el «PC» y el RPE/RIR que hoy ven 49 coaches en todas las series de fuerza
**no dependen de este tren**. Los 4 call sites llaman a `formatStrengthSetLine` **dentro** de su rama
de fuerza, sumando el desglose sin sacar nada:

- `apps/web/src/app/c/[coach_slug]/workout/[planId]/LogSetForm.tsx:909-913` (alumno web).
- `apps/mobile/components/alumno/workout/SetRow.tsx:450-454` (alumno RN).
- `apps/web/src/app/coach/clients/[clientId]/TrainingTabB4Panels.tsx:776-783` — conserva
  `targetWeightForSet(s)`, `cmp: 'over'|'under'|'eq'` → `weightClass`, `'PC'` cuando `weight_kg` es
  `null` y `· RPE` / `· RIR`.
- `apps/mobile/components/coach/clientDetail/AnalisisTab.tsx:631` — mismo patrón: `weightTone`
  success/warning, `'PC'` y `· RPE` / `· RIR`.

**W0.6b se elimina** (R19): no hay migración de call sites que blindar en un commit atómico, porque
ninguna rama de render se apaga. W0.6 cambia de contrato — agrega un export, no reemplaza uno.

**No es un quinto call site**: `apps/mobile/components/alumno/workout/workout-ui.ts:105-111`
(`fmtTypedLoggedLine`, `null` ⇒ `'Registrado'`) recibe un `TypedKeypadMode`, y ese tipo es
`'cardio' | 'mobility' | 'roller'` (`packages/workout-engine/typed-keypad.ts:16`): `'strength'` no
entra. `SetRow.tsx:322,443` además lo llama solo bajo `typedMode`. Queda intacto: **R18 fija que
`TypedKeypadMode` no cambia**, y un `it` de que sigue sin `'strength'` cierra ese flanco.

Matriz A — `formatLoggedSetLine` (contrato **sin cambios**, regresión dura):

| `kind` | log | salida |
|---|---|---|
| `strength` | `{weight_kg:20, reps_done:10}` | `null` — el `it :111` queda intacto |
| `strength` | `{weight_kg:20, reps_done:10, metadata:{left_reps:10, right_reps:10}}` | `null` — tener lados **no** cambia esta función |
| `strength` | `{actual_duration_sec:750}` | `null` |
| `mobility` | `{actual_hold_sec:60, metadata:{left_sec:30,right_sec:30}}` | `60 s (30 / 30)` **sin cambio** — los `it` `:93-102` quedan intactos |

Matriz B — `formatStrengthSetLine(log)` (export **nuevo**, R19):

| log | salida |
|---|---|
| `{weight_kg:20, reps_done:10, metadata:{left_reps:10, right_reps:10}}` | `20 kg × 10 / 10` |
| `{weight_kg:20, reps_done:10, metadata:{left_reps:12, right_reps:10}}` | `20 kg × 12 / 10` (imprime los lados reales, no el mínimo) |
| `{reps_done:10, metadata:{left_reps:5, right_reps:5}}` sin peso | `5 / 5 reps` (peso corporal, sin `kg`) |
| `{weight_kg:20, reps_done:10}` **sin** `metadata` | `null` — el caller pinta su fila de hoy sin tocar nada |
| `{weight_kg:20, metadata:{left_reps:10, right_reps:null}}` (un solo lado) | `null` — R19 exige **los dos** lados; el lado suelto no genera línea |
| `{weight_kg:20, reps_done:10, metadata:{left_sec:30, right_sec:30}}` | `null` — no confunde movilidad con fuerza |
| `{weight_kg:20, reps_done:10, metadata:{left_reps:'abc', right_reps:10}}` | `null` — lee por `sideRepsFromMetadata` (R27), nunca castea a ciegas |
| `{}` | `null` |

**Regresión de los call sites (deseable, ya no condición de merge).** Con R19 la fila de fuerza del
coach no se apaga: el `null` sigue mandando y el desglose es aditivo. Por eso los dos tests de
superficie de abajo se **conservan como cobertura del hueco declarado** (`TrainingTabB4Panels` y
`AnalisisTab` no tienen ningún test hoy), pero ya **no** son el gate de un commit atómico ni obligan a
extraer un descriptor puro:

| Superficie | Archivo de test | Casos mínimos |
|---|---|---|
| Web · `TrainingTabB4Panels.tsx` | `apps/web/src/app/coach/clients/[clientId]/TrainingTabB4Panels.test.tsx` (**NUEVO**; hoy ese directorio solo tiene `nutritionTabV2.logic.test.ts` y `profileOverviewUtils.test.ts`) — project `web-dom` | (1) serie de fuerza con `weight_kg` **sobre** el objetivo ⇒ la clase de color `--success-600` sigue presente; (2) **bajo** el objetivo ⇒ `--warning-600`; (3) sin objetivo ⇒ `text-strong`, sin color; (4) `weight_kg: null` ⇒ imprime «PC»; (5) `rpe`/`rir` presentes ⇒ «· RPE 8» / «· RIR 2» siguen visibles; (6) con `metadata {left_reps, right_reps}` ⇒ **además** el desglose «10 / 10», sin perder ninguno de los anteriores |
| RN · `AnalisisTab.tsx` | `tests/mobile/analisis-tab-strength-line.test.ts` (**NUEVO**, project `mobile-node`) | los mismos 6 casos. Si `AnalisisTab` no resulta montable como unidad, vale extraer el descriptor de la fila de fuerza (`:631`) a una función **pura** exportada — `{ weightLabel, tone, repsLabel, rpeLabel, rirLabel }` — y testear esa función. Mismo precedente que §3.1 (`heroComplianceBundle`) y §4.1 (`workout.service`) |

Regla de paridad: los dos tests comparten la tabla de casos y deben dar el **mismo** veredicto de
tono (`over`/`under`/`eq`) para la misma entrada — si divergen, la ficha web y la RN dejaron de decir
lo mismo.

Lo que **sí** es gate de W0.6, barato y suficiente: un `it` que afirme que
`formatLoggedSetLine('strength', …)` devuelve `null` para **todas** las filas de la Matriz B, es decir
que el export nuevo no se coló dentro del viejo. Ese `it` es el que caza una reintroducción del
contrato descartado.

`loggedSideSeconds` (`:34-43`) queda intacto y su `it` «descarta cualquier otra forma» debe seguir
verde con un `metadata` que traiga `left_reps/right_reps`: se agrega ese input al caso existente.

### 1.5 `packages/workout-engine/keypad-flow.test.ts` (NUEVO) + `typed-keypad.test.ts` (AMPLIAR)

`keypad-flow.ts` hoy **no tiene test propio**: `STRENGTH_KEYPAD_STEPS` (`keypad-flow.ts:78`) y
`keypadStepsForTarget` (`:123`) se ejercitan de rebote en `executor-mapping.parity.test.ts:101-164`
y en `tests/mobile/keypad-flow.test.ts`. Se crea el archivo dedicado para los pasos por lado.

**R18 fija el carril:** la fuerza **nunca** entra al carril tipado. Los pasos por lado salen de la
**rama NO tipada** de `keypadStepsForTarget`, que elige `STRENGTH_PER_SIDE_KEYPAD_STEPS` por un
`sideMode` nuevo en `KeypadTarget`. `typedTargetFor` **no cambia** y `TypedKeypadMode` **no cambia**.

| Entrada | Salida |
|---|---|
| `STRENGTH_PER_SIDE_KEYPAD_STEPS` | 3 pasos en orden `peso (kg, decimal)` → `reps izq (entero)` → `reps der (entero)` |
| `keypadStepsForTarget({ …target strength, sideMode:'per_side' })` | `STRENGTH_PER_SIDE_KEYPAD_STEPS` por la rama no tipada (copia, no la referencia — espejo del `it :133` que exige `[...STRENGTH_KEYPAD_STEPS]`) |
| idem con `sideMode:'alternating'` | los mismos 3 pasos (R4) |
| idem con `sideMode` ausente/`null` | `STRENGTH_KEYPAD_STEPS` de 2 pasos, **byte-idéntico a hoy** |
| `target` tipado (cardio/mobility/roller) con `sideMode:'per_side'` | sin cambio: manda el tipo, no el lado |
| header del paso | contiene `Izq` y `Der` (copys canónicos del OUTLINE §7); jamás `Izquierda`/`Derecha` completos |

En `typed-keypad.test.ts` **no** se agrega ningún caso de fuerza al carril tipado. Se agregan dos
guards de R18, ambos negativos:

- `typedTargetFor` con un bloque de **fuerza** y `side_mode:'per_side'` sigue devolviendo `null`
  (`expect(typedTargetFor(strengthBlockPerSide)).toBeNull()`). Es el `it` que caza la rama
  «strength + side» descartada.
- `TypedKeypadMode` sigue siendo `'cardio' | 'mobility' | 'roller'`: `'strength'` no entra (espejo del
  guard de §1.4).

El `it :37` («paridad: `sideMode` ausente/bilateral/otro modo → un solo hold, byte-idéntico») se
conserva **sin tocar**.

### 1.6 Progresión, PR y volumen con `metadata` (R3 los protege — hay que fijarlo)

`progression.ts` **no vive en el motor**: son dos copias, `apps/web/src/lib/workout/progression.ts`
(con test) y `apps/mobile/lib/workout/progression.ts` (sin test). El OUTLINE §2 lo lista dentro de
`packages/workout-engine`; la ruta real es la de arriba.

**Lector único (R27).** Nadie castea `metadata` a mano: hay un helper exportado del motor,
`sideRepsFromMetadata(metadata) → { left, right } | null` (acepta enteros 0..9999 **y cadenas de 1 a
4 dígitos** —paridad con el `->>` del SQL, que compara texto: el JSON string `"10"` matchea la regex
`^[0-9]{1,4}$` y suma (DATA-SECURITY §«Paridad con `->>`»)—; cualquier otra cosa ⇒ `null`), y lo consumen `session-summary.ts`, `apps/mobile/lib/workout-session.ts:418`,
`apps/mobile/components/alumno/share/build-share-data.ts` y los chips. El `describe('sideRepsFromMetadata')` (incluye un `it` de paridad SQL↔TS: cada caso de la tabla de abajo se evalúa también contra el `reps_eff` de DATA-SECURITY §3 con el mismo resultado, como exige DATA-SECURITY §7.4)
va en el test del módulo que lo exporte (W0 elige el archivo; **el nombre del export es canónico, el
archivo no**) con esta tabla: `{left_reps:12,right_reps:10}` ⇒ `{left:12,right:10}` ·
`{left_reps:'12',right_reps:'10'}` ⇒ coerción a enteros · `{left_reps:12}` (un solo lado) ⇒ `null` ·
`{left_reps:-1,…}` / `{left_reps:10000,…}` / `{left_reps:1.5,…}` / `{left_reps:'abc',…}` ⇒ `null` ·
`{left_sec:30,right_sec:30}` ⇒ `null` · `null` / `undefined` / `'x'` ⇒ `null`. Un `it` fija que el
helper **nunca lanza** con `metadata` arbitrario (SEC-03/SEC-07). Sin `jsonb_typeof` ni casts crudos:
el espejo SQL de esta lectura (regex `^[0-9]{1,4}$`) está en §5.2.

| Archivo | Casos nuevos |
|---|---|
| `apps/web/src/lib/workout/progression.test.ts` (AMPLIAR) | `describe('computeEffectiveTarget — double con reps por lado')`: bloque `per_side`, rango `8-12`, 3 series con `metadata {left_reps:12, right_reps:12}` y `reps_done:12` ⇒ `status:'progressed'` (la comparación sigue siendo **por lado**, `progression.ts:208-211`). Contra-caso: `{left_reps:12, right_reps:10}`, `reps_done:10` ⇒ `holding`, **no** sube. Regresión de D2-vs-R3: si alguien vuelve a `reps_done = 12+10 = 22`, este segundo caso pasaría a `progressed` y el test lo caza. Además: `parseRepsTop('10-12 por lado')` sigue dando `12` (`it :124`, no se toca). |
| `packages/workout-engine/pr-detect.test.ts` (AMPLIAR) | un set `{weight_kg:20, reps_done:10, metadata:{left_reps:12,right_reps:10}}` contra un histórico de `{20, 10}` ⇒ `isPR:false`. Con la suma (22) daría un e1RM falso (`pr-detect.ts:93`). El test fija que `detectPR` **ignora** `metadata`. **R22 documenta el costo aceptado**: en bloques `per_side` con logs viejos ya sumados el PR por e1RM puede no dispararse (el PR por peso sigue); un `it` con un histórico sumado (`reps_done:36`) que **no** dispara PR deja la aceptación escrita en el test, no solo en el riesgo. |
| `packages/workout-engine/session-summary.test.ts` (NUEVO — hoy no existe) | volumen de fuerza: sin metadata ⇒ `weight_kg × reps_done` (idéntico a hoy, fixture copiada del `session-summary.test.ts` web `:24`); con `{left_reps:12,right_reps:10}` ⇒ `weight_kg × 22`. Bloque `alternating` idem. Movilidad/cardio sin cambio. Cierra el gap declarado en `maps/docs-tests-analytics.md` §3.1. |
| `apps/web/src/app/c/[coach_slug]/workout/[planId]/session-summary.test.ts` (AMPLIAR) | el `it :24` («agrega volumen de fuerza por ejercicio y grupo muscular») gana una variante con lados: mismo total que el motor. |
| `tests/mobile/share-per-side.test.ts` (**NUEVO**, project `mobile-node`) — **R34, tarea W3.x** | `apps/mobile/components/alumno/share/build-share-data.ts` pasa a leer por `sideRepsFromMetadata`: (a) **volumen** = `peso × (izq + der)` (mismo número que `session-summary.ts`, aserción cruzada contra el motor); (b) **top set** y `repsAtMax` siguen usando `reps_done` (el mínimo), **no** la suma — con `{left_reps:12,right_reps:10, reps_done:10}` el share dice «10 reps», no «22»; (c) sin `metadata`, salida byte-idéntica a hoy. |

### 1.7 `packages/schemas/workout.test.ts` (AMPLIAR)

`WorkoutLogSetSchema.metadata` (`packages/schemas/workout.ts:301-308`) hoy declara solo
`left_sec`, `right_sec`, `skipped`, `skip_reason`. **Zod v4 estripa lo no declarado**: sin ampliar el
schema, `left_reps`/`right_reps` se pierden en silencio en el server action y en la cola offline.

Casos nuevos en `describe('WorkoutLogSetSchema — espejo polimórfico (AC4)', …)` (`:315`):

| Entrada | Esperado |
|---|---|
| `metadata:{left_reps:12, right_reps:10}` | pasa y **conserva ambas keys** (`toEqual`, no `toMatchObject`) |
| `metadata:{left_reps:'12', right_reps:'10'}` | `z.coerce` a enteros 12/10 (mismo patrón que `left_sec`) |
| `metadata:{left_reps:-1}` | rechaza (`min(0)`) |
| `metadata:{left_reps:10000}` | rechaza — el rango es 0..9999, el mismo que lee `sideRepsFromMetadata` (R27) |
| `metadata:{left_reps:1.5}` | rechaza (`int()`); el schema y el helper de R27 dan el **mismo** veredicto para la misma entrada — un `it` cruzado lo afirma |
| `metadata:{left_sec:30, right_sec:30}` | sigue pasando idéntico (regresión de las 28 filas vivas) |
| `metadata:{left_reps:10, foo:'x'}` | `foo` se estripa; `left_reps` sobrevive |
| log de fuerza de hoy sin `metadata` (`:318`) | **byte-idéntico**, sin key `metadata` |

En `describe('WorkoutBlockSchema — prescripción polimórfica', …)` (`:216`) se agrega: `side_mode`
acepta `per_side | alternating | null` y **rechaza `bilateral`** (R4: desaparece como opción, 0 filas
en LIVE). El `it :270` («`side_mode` inválido se rechaza») se extiende con `'bilateral'`.
Los `it` de `describe('WorkoutProgramSchema — límites de estructura', …)` (`:46`) **no se tocan**: el
tren no cambia el rango 1..14 ni la semántica de `day_of_week`.

**No hay CHECK en la columna `metadata` (R27):** la validación vive en el zod y en el lector defensivo,
no en la DB. Un `it` que inserte (a nivel de schema) un `metadata` con lados inválidos y confirme que
**el zod** lo rechaza deja explícito dónde está el guard, para que nadie proponga una migración con
CHECK más adelante.

### 1.8 `packages/plan-builder/block-type-fields.test.ts` (NUEVO — R6 + **R32**)

`stripFieldsForType(block, newType)` y `defaultBlockForType(type)`.

**R32 fija el shape de la limpieza:** se escribe `null` **explícito** (nunca `undefined`) en **todos**
los campos polimórficos del tipo anterior según `packages/schemas/workout.ts` — `duration_sec`,
`distance_value`, `distance_unit`, `hr_zone`, `interval_config`, `reps_value`, `reps_unit`,
`target_pace_sec_per_km`, `load_value`, `load_unit` — y se **conservan** `sets`, `rest_time`, `notes`,
`superset_group`, `side_mode` e `instructions`.

| Entrada | Esperado |
|---|---|
| bloque cardio completo → `newType:'strength'` | los 10 campos polimórficos de R32 quedan en `null` **explícito**: `expect(Object.keys(out)).toContain('duration_sec')` **y** `expect(out.duration_sec).toBeNull()` — un `toBeUndefined()` es fallo, porque `undefined` no viaja al UPDATE y deja el residuo vivo |
| bloque strength con `side_mode:'per_side'` → `'mobility'` | `side_mode` **se conserva** (campo compartido), igual que `instructions` |
| bloque mobility → `'roller'` | se limpia el hold; `reps_value`/`reps_unit` nacen con el default del roller |
| mismo tipo (`newType === tipo actual`) | devuelve el bloque **sin mutar** (`toEqual` estricto) |
| `defaultBlockForType('cardio')` | espejo exacto de `program-read-mappers.ts:190-201` (un `it` que compare campo a campo contra ese mapa) |
| idempotencia | `strip(strip(b, t), t)` `toEqual` `strip(b, t)` |
| cobertura de la lista | un `it` que recorra **los 10 nombres de R32** y afirme que ninguno queda con su valor viejo tras el cambio de tipo — así agregar un campo polimórfico al schema sin agregarlo al helper se caza acá |

**Round-trip RN obligatorio (R32):** `apps/mobile/lib/plan-builder/serialize.ts` — un test que serialice
un bloque **después** de `stripFieldsForType`, lo deserialice y confirme que los `null` explícitos
sobreviven el viaje (no se pierden como keys ausentes ni vuelven como `undefined`). Sin ese
round-trip, la limpieza se ve bien en memoria y no llega a la DB.

---

## 2. Parity tests existentes que deben seguir verdes

| Test | Estado | Qué se le agrega |
|---|---|---|
| `packages/workout-engine/day-completion.parity.test.ts` | **Verde sin tocar el fuente.** `day-completion.ts` es agnóstico de fechas (`:191`) y el tren no lo modifica (OUTLINE §2). | Un `it` nuevo: los fixtures de `DAY_COMPLETION_FIXTURES` con `metadata {left_reps,right_reps}` inyectada dan el **mismo** `pct` que sin ella (la completitud cuenta filas, no reps). Y la invariante `pct = logged/expected`, `pct ≤ 1` (`:24`) se re-corre con un bloque `per_side` de 3 series. |
| `packages/workout-engine/executor-mapping.parity.test.ts` | **Verde sin cambios de firma.** Los `describe` `typedTargetFor` (`:46`), `keypadStepsForTarget` (`:101`), `typedLogValues` (`:190`), `buildTypedPayload` (`:242`) y `buildStrengthPayload` (`:290`) son el contrato web↔RN. | Dos `it` nuevos en `describe('buildStrengthPayload')`: (a) **sin `ctx`** los 4 `it` vigentes (`:291`, `:303`, `:315`, `:321`) dan exactamente lo mismo que hoy — se re-afirman con `toEqual` contra un snapshot inline; (b) con `ctx.sideMode` el payload gana `metadata` y `reps_done` = mínimo. En `keypadStepsForTarget`: el `it :108` («strength con esfuerzo ⇒ peso, reps») se duplica con `sideMode:'per_side'` ⇒ 3 pasos por la rama no tipada, y sin `sideMode` sigue dando 2. El `describe('typedTargetFor')` (`:46`) **no gana ningún caso de fuerza**: R18 lo deja intacto y §1.5 le agrega el guard negativo. |
| `apps/web/.../weekPendingWorkouts.test.ts` → `describe('paridad con DAY_COMPLETION_FIXTURES (@eva/workout-engine)')` (`:570`) | Verde. | Nada nuevo: es el ancla de que web y motor no divergen. Si se pone rojo, el fix de ciclo tocó la completitud y eso está fuera de alcance. |
| `tests/mobile/executor-v3-weekly-streak.test.ts` → `describe('paridad con @eva/workout-engine (regla de completitud del dia)')` (`:88`) | Verde. | Ver §4.3: los `describe` de `weekDatesMondayToSunday` (`:35`) y `plannedDatesForWeek` (`:66`) sí cambian. |

**Regla de oro de esta sección:** ningún parity test se «adapta» al fix. Si uno se pone rojo, el
diagnóstico por defecto es que el fix rompió la paridad web↔RN, no que el test estaba mal.

---

## 3. Web (W2, W5)

### 3.1 `apps/web/src/app/c/[coach_slug]/dashboard/_data/heroComplianceBundle.test.ts` (NUEVO)

**No existe hoy** (verificado: en ese directorio el único `*.test.ts` es `weekPendingWorkouts.test.ts`).
Es el archivo donde vive `todayPlan` (`heroComplianceBundle.ts:96-104`), el primer consumidor a
reemplazar por el cursor.

Bloqueo técnico: `getHeroComplianceBundle` (`:68`) está envuelta en `cache()` y hace consultas a
Supabase — no es testeable como unidad. **Precondición de W2**: extraer el selector puro (el bloque
`:96-119`, que hoy elige `todayPlan` por `assigned_date` y luego por `day_of_week === todayDow`) a
una función exportada que reciba `activePlans`, `program`, `activeVariant`, `abMode`, `today`,
`todayDow` y el resultado de `resolveCycleCursor`. Precedente exacto en el mismo directorio:
`deriveWeekWorkoutStatus` es pura y por eso tiene 30+ casos.

| # | Entrada | Esperado |
|---|---|---|
| H1 | programa weekly, plan suelto con `assigned_date === today` | gana el plan suelto (regresión del incidente 2026-08-25 documentado en `heroComplianceBundle.ts:92-95`) |
| H2 | programa weekly, sin plan suelto, plan del programa con `day_of_week === todayDow` y variante que matchea | ese plan — **idéntico a hoy** |
| H3 | programa weekly con variante B en semana A | `todayPlan:null` (no se rompe `workoutPlanMatchesVariant`) |
| H4 | programa **cycle N=3**, cursor devuelve índice 2 en martes | gana el plan con `day_of_week === 2` **por cursor**, no por ISODOW; un martes con cursor en 3 devuelve el plan 3 |
| H5 | cycle con `start_date_flexible:true`, `start_date: null` (D3/R13) y `completions: []` | `todayPlan` = plan del índice 1, y el hero lee `programState:'not_started'` **del cursor** (R30) para pintar «Tu programa está listo». Un `expect` afirma que el bundle **no re-deriva** el estado (no compara `start_date` por su cuenta) |
| H6 | cycle, cursor `todayState:'done'` | el hero muestra «Día 2 hecho · Próximo: Día 3 de 3»; `todayPlan` sigue siendo el 2 (para poder reabrirlo), no el 3 — DECISIONS-2 D3b |
| H7 | plan suelto (`program_id: null`) con programa cycle activo | el atajo por `assigned_date` sigue mandando sobre el cursor |
| H8 | bloques del hero con `exercise_type_override` | el chip de tipo sale del `effectiveExerciseType`, no de `'strength'` por defecto |
| H9 | la lectura de logs que alimenta `completions` | **R10**: últimos 30 días, `select block_id, workout_blocks(plan_id), set_number, logged_at, metadata` (forma verificada: `plan_id` viaja por el join y `target_date` **no es columna** de `workout_logs`, §1.1b), `order by logged_at desc`, `limit 200`. El test fija la forma de la query (o del input del selector puro) y es el **espejo exacto** del caso RN de §4.6 — si divergen, web y RN calculan cursores distintos |
| H10 | cycle **sin** `start_date_flexible` y `start_date: null` | `programState:'active'` (R30): el hero **no** ofrece «Empezar hoy» |

### 3.2 `weekPendingWorkouts.test.ts` (AMPLIAR)

Ruta real: `apps/web/src/app/c/[coach_slug]/dashboard/_data/weekPendingWorkouts.test.ts`
(el BRIEF §4 cita `apps/web/src/lib/workout/weekPendingWorkouts.ts`, ruta que **no existe**).
Bajo test: `deriveWeekWorkoutStatus`, 30 `it` vigentes.

Casos nuevos, en un `describe('programas de ciclo — sin días perdidos')`:

| # | Entrada | Esperado |
|---|---|---|
| W1 | programa `cycle` N=3, 2 días entrenados esta semana, hoy sin log | **R12**: `weekPendingWorkouts` devuelve **cero pendientes y cero recuperables**, y con eso el `WorkoutRecoverBanner` **no se monta** — un `it` que afirme la lista vacía y otro que afirme que el flag que monta el banner es `false` |
| W2 | cycle N=3, día pasado con log parcial | `in_progress` para ese día, pero **no** entra a la cola de recuperación |
| W3 | cycle, día futuro de la semana | nunca `done`, nunca `pending` — `upcoming` (el `it :281` sigue aplicando) |
| W4 | cycle N=7 con 7 planes | la semana se pinta completa sin que ningún día quede `pending` por ISODOW |
| W5 | **weekly, cualquier fixture existente** | los 30 `it` vigentes pasan **sin editar una línea**. Este es el criterio duro de «weekly 0 diff» del lado web |
| W6 | cycle con `start_date: null` | no genera falsos pendientes ni divide por cero; la semana del programa es 1 (espejo del `it :603`) |

### 3.2.1 `apps/web/src/lib/workout/workoutAdherence30d.test.ts` (AMPLIAR) — el anillo «Entrenos»

**Resuelto por R12; tarea W2.10b.** Era el último consumidor que contaba días planificados por ISODOW
en programas de ciclo, y su valor es visible para todo alumno:

`computeWorkoutScore30d` (`workoutAdherence30d.ts:34-89`) recorre 30 días hacia atrás y, para cada uno,
busca el plan del programa por `p.day_of_week === dow` (`:72`, con `dow` = ISODOW del día en Santiago,
`:49`); cada día con plan suma al denominador (`plannedDays++`, `:80`) y el score sale de
`completedDays / plannedDays` (`:88`, con `plannedDays === 0 ⇒ 0`). Ese score alimenta
`heroComplianceBundle.ts:166-171` (`workoutScore`) y de ahí `MomentumCard.tsx:92` y
`ComplianceRing.tsx:85`, ambos con la etiqueta «Entrenos · Últimos 30 días».

En un programa `cycle` con `cycle_length = 3` y planes `day_of_week` 1/2/3, hoy eso cuenta Lun/Mar/Mié
como «planificados» y el resto como días sin plan: el denominador es calendario puro y no tiene
relación con el cursor por completitud (D1). El archivo figura en la familia A de SPEC y PLAN y **ya
tiene tarea**: **W2.10b** (R12, R38).

**Cobertura previa real:** los 3 `it` vigentes (`:5`, `:17`, `:43`) pasan `program: null` en los tres
casos — solo ejercitan planes **sueltos** por `assigned_date`. La rama de programa (`:55-75`), que es
justo la que este tren cambia, tiene **cero** cobertura hoy. Decir «los 3 `it` weekly no cambian» es
por eso una condición necesaria pero **vacua**: hay que agregar el caso weekly-con-programa antes de
tocar nada.

**La regla ya está fijada (R12), y con ella AD4/AD5 son escribibles.** En programas `cycle` el score
es **`null`** — no hay meta semanal en este tren— y la firma de `computeWorkoutScore30d` pasa a
**`number | null`** (`workoutAdherence30d.ts:39`). **Lista única de consumidores** (la misma en SPEC,
PLAN y TASKS; el head de desktop **no** es uno: `DesktopDashboardHead` no menciona `workoutScore`):
un **propagador**, `heroComplianceBundle.ts:50` (tipo `workoutScore: number`), `:166` (llamada a
`computeWorkoutScore30d`) y `:199` (retorno) — pasa a `number | null` sin colapsarlo a `0` — y dos
**renders**, `MomentumCard.tsx:92` y la cadena `ComplianceScoresCard.tsx:14` →
`ComplianceRing.tsx:59,65,85` (hoy `workoutScore: number` en `ComplianceRingCluster` y el
`<ComplianceRing value={workoutScore} label="Entrenos">`), que pintan «—» con el rótulo
**«Sin meta semanal»**. La meta semanal en ciclo queda
en backlog (R12), no como deuda silenciosa. Tarea **W2.10b**.

Contrato de prueba, en dos bloques:

| # | Caso | Esperado |
|---|---|---|
| AD1 | programa **weekly** con planes dow 1/3/5 y logs en dos de ellos | `plannedDays` y `completedDays` exactos por ISODOW — **baseline nuevo**, se escribe **antes** del fix y no se edita después |
| AD2 | los 3 `it` vigentes (`:5`, `:17`, `:43`) | verdes **sin editar una línea** |
| AD3 | weekly con `ab_mode` y variante efectiva | sin cambio respecto de AD1 (`resolveEffectiveWeekVariant`, `:62-67`) |
| AD4 | programa `cycle` N=3 con logs | `score === null` — **nunca** un número, ni siquiera `0`; el denominador por ISODOW no se calcula |
| AD5 | `cycle` con `start_date: null` (R13/R30) | `score === null` por la misma rama: no divide por cero ni inventa denominador |
| AD6 | weekly de control con `plannedDays === 0` | sigue devolviendo `0` (comportamiento vigente, `:88`), **no** `null`: el `null` es exclusivo de ciclo |

Casos de render (los que paga la firma nueva), en los tests de los 3 consumidores:

| # | Caso | Esperado |
|---|---|---|
| AD7 | los **tres** consumidores reales con `null`: `MomentumCard` con `value: null`, `ComplianceRing.tsx:85` con `value: null`, y `ComplianceScoresCard.tsx:14` pasando `scores.workoutScore = null` a `ComplianceRingCluster` (`ComplianceRing.tsx:59,65`) | los tres pintan «—» y el rótulo «Sin meta semanal»; **no** pintan «0 %» ni un anillo lleno, y el cluster no colapsa el `null` con `?? 0` en el camino |
| AD8 | los mismos con `value: 0` (weekly real con 0 %) | siguen pintando «0 %» — el test distingue `null` de `0`, que es justo lo que un `!value` colapsaría |
| AD9 | `heroComplianceBundle` con programa cycle | propaga `workoutScore: null` hacia arriba sin `?? 0` |

### 3.3 `workout-log.actions.test.ts` (AMPLIAR) — «metadata no se borra»

Ruta: `apps/web/src/app/c/[coach_slug]/workout/[planId]/_actions/workout-log.actions.test.ts`
(17 `it` vigentes en 2 `describe`, `:131` y `:237`). El bug: `workout-log.actions.ts:136-181` escribe
`metadata: parsed.data.metadata ?? null` ⇒ **re-guardar una serie sin lados borra el `metadata`**
que ya estaba (afecta también a las 28 filas de movilidad por lado ya vivas).

`describe('logSetAction — metadata no destructiva (P1 por lado)')`:

| # | Entrada | Esperado |
|---|---|---|
| M1 | fila previa con `metadata {left_reps:12, right_reps:10}`; payload nuevo **sin** `metadata` | el `UPDATE` **no incluye la columna `metadata`** (assert sobre el objeto pasado a `.update(...)`: `expect(payload).not.toHaveProperty('metadata')`) |
| M2 | fila previa con `metadata {left_sec:30, right_sec:30}`; payload nuevo sin `metadata` | idem — regresión de movilidad, no solo de fuerza |
| M3 | payload **con** `metadata {left_reps:10, right_reps:10}` | se escribe tal cual |
| M4 | payload con `metadata: null` **explícito** | se escribe `null` (borrado intencional, p. ej. deshacer un «omitido») |
| M5 | `INSERT` limpio con `metadata` | la fila nueva lo lleva (el `it :159` gana la variante con lados) |
| M6 | carrera 23505 + re-SELECT + UPDATE (`it :170`) con `metadata` en el payload | el `metadata` sobrevive al camino de recuperación |
| M7 | `target_date` pasado + solo-UPDATE (`it :242`) con `metadata` | se conserva; editar un día pasado no pierde los lados |

`describe('logSetAction — auto-start del programa flexible')`:

| # | Entrada | Esperado |
|---|---|---|
| A1 | plan de programa con `start_date_flexible:true` y `start_date:null` | se llama `client_start_workout_program` **una vez** antes/junto al log, con `p_start_date: null` (R14: la RPC solo acepta NULL o **hoy** Santiago) |
| A2 | mismo caso, dos `logSetAction` en la misma sesión | la RPC se invoca **una sola vez**; y si igual se invoca, es idempotente: devuelve la fila con `started:false` y la misma fecha, sin error (R28) |
| A3 | programa con `start_date` ya fijado | la RPC **no** se llama |
| A4 | `start_date_flexible:false` | la RPC **no** se llama, aunque `start_date` fuera `null` |
| A5 | la RPC falla | el log **igual se guarda** (el auto-start es best-effort, jamás bloquea al alumno) |
| A6 | la RPC responde `coach_account_paused` (42501, R17) | el auto-start no rompe el flujo: se ignora como A5. El gate de cuenta pausada del **action** es el tipado de `logSetAction` (`workout-log.actions.ts:112-116`), que ya corre antes y tiene su propio caso |
| A7 | la RPC devuelve `started:true` | se emite `program_started_by_client` con `via:'auto'` **una sola vez**; con `started:false` **no se emite** (R23) |

`apps/web/src/app/c/[coach_slug]/dashboard/_actions/start-program.actions.ts` (nuevo, OUTLINE §4 + §13):
test hermano `start-program.actions.test.ts`. **Firma canónica: `startWorkoutProgramAction({ coachSlug, programId })`**
— objeto, y **sin fecha** (R24 + R14):

| # | Caso | Esperado |
|---|---|---|
| SP1 | usuario no autenticado | rechaza **sin** llamar la RPC |
| SP2 | `programId` inválido / falta `coachSlug` | `validation`; la RPC no se llama. Un `it` afirma que la firma es un **objeto** (llamarla posicionalmente es un error de tipos, no un `programId` interpretado) |
| SP3 | camino feliz | RPC + `revalidatePath('/c/' + coachSlug + '/dashboard')` **con ese path exacto** (R24) |
| SP4 | la RPC devuelve `{ start_date, end_date, started:true }` | éxito; el action expone las **tres** columnas (`RETURNS TABLE`, R23) y emite `program_started_by_client` con `via:'button'` |
| SP5 | programa que ya tenía fecha ⇒ `{ start_date: la vigente, end_date: la vigente, started:false }` | **éxito idempotente**, no error, y **sin** evento (R28 + R23) |
| SP6 | `end_date` de la respuesta | `start_date + weeks_to_repeat*7 − 1`; mientras el programa no empezó era `NULL` (R21) — un `it` con `weeks_to_repeat:4` fija la aritmética |
| SP7 | cuenta del coach pausada ⇒ `coach_account_paused` (42501) | el action lo mapea con el **gate tipado de `logSetAction`** (`workout-log.actions.ts:112-116`), no con un `catch` genérico (R17) |
| SP8 | la RPC responde `program_not_startable` | error tipado; el UPDATE afectó 0 filas por una causa distinta a «ya tenía fecha» (R28) |
| SP9 | alguien intenta pasar una fecha | **no existe el parámetro**: no hay «Elegir otra fecha» en este tren (R14). El `it` es negativo: la firma no acepta un tercer campo |

### 3.4 `apps/web/src/lib/workout-offline-queue.test.ts` (AMPLIAR)

30 `it` vigentes. La cola web viaja por `FormData` (`workout-offline-queue.ts:131-154`) — el mapa
de la cola web era un hueco declarado del crítico (H2).

| # | Caso | Esperado |
|---|---|---|
| Q1 | encolar una serie con `metadata {left_reps:12, right_reps:10}` | el `FormData` reconstruido trae ambos valores (round-trip `write` → `read`, espejo del `it :203`) |
| Q2 | `dedupeWorkoutQueue` con dos intentos de la misma `(block,set)`, el segundo con lados | gana el último (`last-wins`, `it :47`) **con** su `metadata` |
| Q3 | item legacy sin `metadata` en `localStorage` | drena sin inventar keys (espejo del `it` legacy de RN, `tests/mobile-offline-cache-typed-axes.test.ts:170`) |
| Q4 | `localStorage` corrupto | sigue devolviendo `[]` (`it :193`) — el shape nuevo no rompe la resiliencia |

### 3.5 PWA / working tree (W5)

Los tres archivos del working tree **ya traen sus tests** y solo hay que commitearlos junto al tren:
`tests/pwa-sw-navigation.test.ts` (16 `it` en 2 `describe`, `:215` y `:391`; fija
`NAV_TIMEOUT_MS = 2500` y `eva-nav-v5`) y `apps/web/src/lib/client/clear-client-caches.test.ts`
(5 `it`). Ambos **derivan los nombres de cache leyendo `sw.js`**, así que un bump futuro los rompe a
propósito. Caso nuevo mínimo para `InstallPrompt.tsx:93-100`: un test de la función de elegibilidad
que fije «Android Chrome con `beforeinstallprompt` en el **día 1** ⇒ elegible **sin**
`hasCompletedFirstWorkout()`», «descartado hace 10 días ⇒ no elegible», «descartado hace 31 días ⇒
vuelve a ser elegible», «standalone ⇒ nunca».

### 3.6 Aviso de programa asignado **sin fecha** (R20 — tarea W2)

Hoy `apps/web/src/services/workout/program-assignment-notification.service.ts:123` **exige**
`start_date` para despachar el aviso: con R13/R21 un programa flexible nace con `start_date NULL` y el
alumno se quedaría sin email ni push. R20 lo saca del guard y fija el copy.

| # | Archivo de test | Caso | Esperado |
|---|---|---|---|
| N1 | `apps/web/src/services/workout/program-assignment-notification.service.test.ts` (AMPLIAR) | programa flexible **sin** `start_date` | **1 email + 1 push** — el caso literal de R20; hoy este input no despacha nada |
| N2 | idem | programa con `start_date` fijado | idéntico a hoy, sin editar los `it` vigentes |
| N3 | `apps/web/src/lib/email/transactional-templates.test.ts` (AMPLIAR) | `buildProgramAssignedEmail({ …, startDate: null })` | acepta el `null` sin lanzar y la fila «Inicio» dice **«Empieza cuando quieras»**, carácter por carácter |
| N4 | idem | `startDate` con fecha | la fila «Inicio» sigue imprimiendo la fecha como hoy |
| N5 | espejo en `apps/web/src/services/workout/workout.service.ts:1093-1100` (`assignFromTemplate`) | asignación flexible sin fecha | **la misma frase** «Empieza cuando quieras» — un `it` que compare las dos cadenas entre sí, no dos literales copiados |

---

## 4. RN (W3, W4)

### 4.1 `tests/mobile-program-persistence.test.ts` (AMPLIAR) — default `false`

Vive en la **raíz** de `tests/` (project `web-node`), no en `tests/mobile/`. Hoy tiene 11 `it`; el
`:80` («conserva el ancla flexible existente») y el `:90` («usa fecha explícita o hoy Santiago») son
los que R13 + R21 cambian: `resolveProgramScheduleMetadata` (`apps/mobile/lib/program-persistence.ts:89-104`)
hoy hace `requested ?? existing ?? todaySantiagoIso` — siempre estampa una fecha.

| # | Entrada | Esperado |
|---|---|---|
| P1 | `isClientProgram:true`, `startDateFlexible:true`, `requestedStartDate:null`, `existingStartDate:null` | `{startDate: null, endDate: null}` — **ya no** estampa `todaySantiagoIso`, y `end_date` acompaña al `start_date` en el NULL (**R21**: no queda un fin colgado sin inicio) |
| P2 | igual pero `startDateFlexible:false` | `{startDate:'2026-07-13', endDate:'2026-07-19'}` — el `it :90` vigente, intacto |
| P3 | `startDateFlexible:true` con `existingStartDate:'2026-07-01'` | conserva `'2026-07-01'` y el fin inclusivo — **no se reescribe historia** (los 15 programas cycle activos ya estampados; y los 50 con el flag, R13). El `it :80` pasa sin editar |
| P4 | `startDateFlexible:true` con `requestedStartDate:'2026-08-10'` | usa la pedida (el coach sí puede fijarla desde el builder; R14 solo acota lo que puede hacer el **alumno** por la RPC) |
| P5 | flag **ausente** en el input | default `false` (`?? false`), no `true`. Caso literal de R13 |
| P6 | plantilla (`isClientProgram:false`) | `{null, null}` sin cambio (`it :90`, tercera aserción) |
| P7 | programa **weekly** flexible sin fecha | mismo veredicto que P1: **R13 aplica a `weekly` y `cycle`**, no solo a ciclo |

Espejos web obligatorios (**R21** nombra los dos guards): `apps/web/src/services/workout/workout.service.ts:376-392`
(hoy `start_date = existing ?? hoy`, `:385`) y `workout.service.ts:977-981` (`assignFromTemplate`) —
el mismo cuadro, o el test web equivalente si el servicio no expone una función pura. Si no la expone,
**extraerla** es precondición de W2, igual que en §3.1. Un caso extra en `assignFromTemplate`: asignar
una plantilla con el flag en `true` deja `{start_date: null, end_date: null}` en la fila creada.

### 4.2 `tests/mobile/start-program.test.ts` (NUEVO)

`apps/mobile/lib/start-program.ts` → **`startWorkoutProgram(programId)`** (firma canónica de R24: sin
fecha, porque «Elegir otra fecha» salió del tren por R14). Va en `tests/mobile/` (project
`mobile-node`, timeout 15 s) porque monta un módulo de `apps/mobile` con `vi.doMock` del cliente
Supabase + `import()` dinámico — el patrón de `tests/mobile/offline-queue.test.ts`.

| # | Caso | Esperado |
|---|---|---|
| S1 | camino feliz | llama `rpc('client_start_workout_program', {p_program_id, p_start_date: null})` y lee la **fila** `{ start_date, end_date, started }` (R23: `RETURNS TABLE`, no un `date` suelto) |
| S2 | `started:true` | se emite `program_started_by_client` con `via:'button'`; con `started:false` **no** se emite (R23) |
| S3 | programa que ya tiene `start_date` | devuelve `{ start_date: la vigente, end_date: la vigente, started:false }`, **sin error** (R28) |
| S4 | la RPC lanza `program_not_startable` (0 filas por causa distinta a «ya tenía fecha»: no es el dueño, no es flexible, no está activo) | error **tipado**, jamás un crash ni un `start_date` inventado en cliente (R28) |
| S5 | auto-start desde `lib/workout-session.ts` al primer `logSet` | se invoca una vez por sesión; el segundo `logSet` no vuelve a llamar. Si igual llama, S3 lo cubre |
| S6 | error de red | el log de la serie **igual se encola** (best-effort, espejo de A5) |
| S7 | la RPC lanza `coach_account_paused` (42501) | error tipado y diferenciado de S4: el alumno de una cuenta pausada no «empieza» el programa (R17) |
| S8 | `end_date` de la respuesta | `start_date + weeks_to_repeat*7 − 1`; RN lo usa tal cual, **no** lo recalcula en cliente (R21) |
| S9 | intento de pasar una fecha | **no hay dónde**: la firma toma solo `programId` (R24). `it` negativo sobre la firma |

### 4.3 `tests/mobile/executor-v3-weekly-streak.test.ts` (AMPLIAR)

`apps/mobile/components/alumno/workout/v3/weekly-streak.ts` (ruta real; el OUTLINE §7 la abrevia a
`weekly-streak.ts`). **R33 corrige R8**: la aritmética `((dow-1)%7+7)%7` existe **solo en RN**, en
**dos** sitios — `apps/mobile/app/alumno/(tabs)/home.tsx:401` y `v3/weekly-streak.ts:198`. En **web**
el colapso para ciclos de 8-14 días **no** es esa aritmética: está en
`apps/web/src/app/c/[coach_slug]/dashboard/_components/program/ActiveProgramSection.tsx:63-68`, un `dayByDow`
de **7 entradas** que se queda corto para `N > 7`. Son dos regresiones distintas y cada una tiene su
test: K3 acá (RN) y H-cycle en §3.1 / el caso web de abajo. La tarea W2.9 apunta a
`ActiveProgramSection.tsx:63-68`, no a una aritmética que en web no existe.

| # | Caso | Esperado |
|---|---|---|
| K1 | `plannedDatesForWeek` (`it :69`) con programa **weekly** | idéntico a hoy: marca por `day_of_week` 1..7 |
| K2 | mismo helper con programa **cycle N=3** | ya **no** marca Lun/Mar/Mié: el strip se alimenta de los `slots` del cursor |
| K3 | cycle N=14 | ningún índice se pliega a módulo 7 en `weekly-streak.ts:198` (regresión directa de R8 corregido por R33) |
| K4 | `weekDatesMondayToSunday` (`:35-64`) | **sin cambios**: la semana Lun→Dom sigue siendo la unidad visual, también en ciclo — **R12**: `WeekStrip` queda como tira Lun→Dom de «días entrenados» (un punto por día con logs), sin estados asignado/pendiente |
| K5 | `greedyPlanDone` / `greedyStatesForWeek` (`:113`, `:162`) en weekly | los 12 `it` vigentes pasan sin editar |
| K6 | paridad con `DAY_COMPLETION_FIXTURES` (`:88`) | verde sin tocar |
| K7 | espejo del **otro** sitio RN: `home.tsx:401` con N=14 | mismo veredicto que K3 — los dos sitios de R33 tienen caso, no uno solo |
| K8 | espejo **web** de R33: `ActiveProgramSection.tsx:63-68` con un ciclo N=14 | el `dayByDow` de 7 entradas ya no decide: los días 8..14 tienen etiqueta propia («Día 8 de 14») y ninguno colapsa sobre otro. Va en el test del componente/selector puro de W2.9 |

### 4.4 `tests/mobile/client-invite-copy.test.ts` (AMPLIAR) — copy Android

El `it :26-32` («ninguna persona menciona a EVA: el mensaje es white-label por construcción») cubre
`apps/mobile/lib/client-invite-copy.ts` (el mensaje de WhatsApp), **no** el texto visible de
`apps/mobile/components/coach/InviteStudent.tsx:213-215`, que hoy dice literalmente
«Tu alumno baja EVA, escribe este código y entra directo a tu app.»

Dos guards, en este orden de preferencia:

1. **Regla eslint local** en `tools/eslint-rules/rules/` — precedente exacto y documentado:
   `store-plan-caption.mjs` reemplazó a `tests/mobile/store-copy.test.ts` (borrado), y
   `docs/testing/TEST_STATUS.md` fija la política «afirmaciones sobre el **código** son trabajo del
   linter, no de un test que lee el fuente como texto». Una regla nueva acotada a
   `apps/mobile/**/*.{ts,tsx}` que cace `baja EVA` / `descarga EVA` / `bajar la app` en superficies
   del coach, más su caso válido e inválido en `tests/eslint-rules/local-rules.test.ts` (obligatorio:
   «Regla nueva ⇒ caso nuevo ahí»), y su alta en `eslint.mobile.config.mjs:67-71`.
2. `tests/mobile/client-invite-copy.test.ts`: un `it` nuevo que afirme el copy canónico del
   OUTLINE §7 — «Tu alumno entra desde el navegador con tu link o desde la app en iOS. No necesita
   instalar nada.» — carácter por carácter, si ese texto se extrae a una constante exportada.
   Si queda inline en el JSX, **solo** la regla eslint lo cubre.

`tests/mobile/store-compliance.test.ts` (13 `it`) se re-corre sin cambios: el tren no agrega destinos
de pago ni CTAs de tienda.

### 4.5 Otros RN que se amplían

- `tests/mobile-offline-cache-typed-axes.test.ts` (`:143`, movilidad `per_side`): caso hermano para
  fuerza `per_side` — la cola drena con `metadata {left_reps,right_reps}` + `reps_done` mínimo, y el
  `it :170` («un item LEGACY drena sin inventar columnas nuevas») sigue verde.
- `tests/mobile/keypad-flow.test.ts`: el routing tipo→campos gana `strength + per_side` ⇒ 3 pasos, y
  el caso de regresión que ya cuida («movilidad NUNCA abre el teclado de kg×reps») se refuerza con
  «fuerza `per_side` **sí** abre kg + 2 reps, nunca el teclado de hold».
- `tests/mobile-coach-client-detail-logic.test.ts`: el DTO `ProgramBlock` ampliado
  (`apps/mobile/lib/coach-client-detail.ts:142-157,806-815,952-967`) mapea `exercise_type_override`,
  `side_mode` y los campos tipados; un bloque cardio en la ficha ya **no** imprime «Series × reps».

### 4.5b Chip «Por lado» en la fila de objetivo (R39 — tareas W2.15 / W3.9)

**R39 saca el chip de `TypedTargetGrid`.** El chip sale de la **fila de objetivo de fuerza**, con
`SIDE_LABEL[side_mode]` importado del motor (`packages/workout-engine/workout-exercise-type.ts:31`).
`TypedTargetGrid` **no cambia** — ni web ni `apps/mobile/components/alumno/workout/TypedTargetGrid.tsx:91`.

| # | Superficie | Caso |
|---|---|---|
| CH1 | Web: `ExerciseStepV3.tsx:196-204`, `SingleExerciseCard`, superserie | bloque de fuerza `per_side` ⇒ la fila de objetivo trae «Por lado»; `alternating` ⇒ «Alternado»; `side_mode` null ⇒ **sin chip**, fila byte-idéntica a hoy |
| CH2 | RN: `ExerciseScreenV3.tsx:327-338`, `SupersetGroupCard.tsx:428-429` | los mismos 3 veredictos, con las mismas palabras |
| CH3 | `TypedTargetGrid` (web y RN) | un `it` de **no-regresión**: para un bloque de fuerza `per_side` la grilla devuelve **las mismas tarjetas que hoy** — el chip no se coló ahí |
| CH4 | fuente del label | `SIDE_LABEL` se importa del motor; la copia local de `WorkoutExecutionClient.tsx:308-311` **se borra**. Guard: una regla eslint local (mismo precedente de §4.4) o un `it` que compare el label renderizado contra `SIDE_LABEL` del motor, nunca contra un literal |

### 4.6 Lectura de logs del cursor en RN (R10, **tarea W3.7b** — espejo de §3.1 H9)

`apps/mobile/app/alumno/(tabs)/home.tsx:172-179` hoy trae **solo fechas**. R10 le devuelve las
columnas que `buildCycleCompletions` necesita, y exige que sea la **misma** lectura que web:

| # | Caso | Esperado |
|---|---|---|
| L1 | la query del home | `select block_id, workout_blocks(plan_id), set_number, logged_at, metadata`, ventana de **30 días**, `order by logged_at desc`, `limit 200` — los cinco campos, no un subconjunto. **`target_date` no se pide**: no es columna de `workout_logs` (`offline-cache.ts:123-124`, PGRST204); la fecha de R11 sale de `eva_santiago_day(logged_at)` en lectura |
| L2 | paridad web↔RN | el test compara la **forma** de la query RN contra la de §3.1 H9: mismas columnas, misma ventana, mismo `limit`. Si divergen, los dos cursores pueden discrepar y el alumno ve un día distinto en cada plataforma |
| L3 | sin logs en la ventana | `completions: []` ⇒ Día 1 (C11), sin persistir nada |
| L4 | `home.tsx:162-167` | el select del programa trae `program_structure_type`, `cycle_length`, `start_date_flexible` y `start_date` — los cuatro que R30 necesita para `programState` |

---

## 5. SQL — equivalencia de racha y migraciones del tren

El detalle del threat model, los grants, el `EXPLAIN` y el protocolo tx-rollback en LIVE viven en
**`DATA-SECURITY.md`** de esta misma spec. Acá va solo el contrato de prueba.

**Punto de partida:** `grep -rn "get_client_current_streak"` sobre `tests/` y `supabase/tests/` no
devuelve ningún archivo — la racha **no tiene ninguna red de regresión hoy**, ni SQL ni TS. Es el
riesgo de cobertura más grande del tren y el único que toca a los 63 coaches weekly.

**Nombres (fijados por R25, sin variantes).** El archivo es **`supabase/tests/streak_cycle_equivalence.sql`
— sin prefijo de timestamp** — y la función espejo es **`public._streak_next(uuid)`**. R25 elige la
convención real del repo, que es la de los dos `*_equivalence.sql` existentes
(`student_gate_equivalence.sql`, `nutrition_v2_sets_equivalence.sql`): ninguno lleva `<ts>`. Todo
documento del tren usa estos dos nombres y **ninguna variante** — ni `<ts>_streak_cycle_equivalence.sql`
ni `get_client_current_streak_next`. El harness completo está en `DATA-SECURITY.md:574-700`
(`:584`, `:588`, `:613`, `:623`); el SQL verbatim vive **solo** ahí y esta sección no lo duplica, solo
fija el contrato de prueba.

Harness: el de `supabase/tests/student_gate_equivalence.sql` — `BEGIN;` +
`SET LOCAL statement_timeout` + `CREATE OR REPLACE` del cuerpo nuevo bajo el nombre espejo,
comparación masiva contra la vigente, `ROLLBACK` al final. Solo lectura salvo las funciones.

**Criterio de paso — las CUATRO condiciones de `DATA-SECURITY.md:596-604`, sin recortes.** Si falla
cualquiera se detiene y **no** se aplica la migración. (Las dos que este archivo listaba antes eran un
subconjunto; manda la lista de abajo.)

1. `difs_weekly = 0` — la rama nueva no contaminó el camino semanal (criterio DURO, OUTLINE §8;
   104 programas weekly, 63 coaches).
2. `difs_sin_programa = 0` — la regla 7 sigue idéntica para quien no tiene programa activo.
3. `mixtos = 0` — nadie tiene weekly **y** cycle activos a la vez. Si aparece alguno, su racha cambia
   a propósito y se revisa **a mano** antes de seguir. Esta condición no se omite: sin ella un cliente
   mixto pasa como «weekly» o como «cycle» según el `bool_and` y el diff se lee mal.
4. `cycle_con_cambio > 0` — la prueba no es vacua. Umbral operativo del tren: **≥ 5**, que son los
   5 alumnos de Movens con logs que hoy dan racha 0 y con R1 deben dar > 0.

### 5.1 Fixtures sintéticos en la misma transacción (paso 7 del harness)

El barrido masivo compara agregados sobre datos reales: **no** puede probar un escenario que hoy no
existe en LIVE (una semana cerrada vacía, un `start_date NULL`). Por eso el mismo `.sql`, **después**
del barrido y **antes** del `ROLLBACK`, inserta clientes/programas/logs sintéticos y afirma el valor
esperado de `public._streak_next` uno por uno. Todo dentro de la misma tx: nada queda escrito.
Precedente de cómo se arma el fixture sintético sin dejar residuo:
`supabase/tests/student_gate_org_fixture.sql`, del mismo par que el harness que se copia.

| # | Fixture sintético | Esperado de `_streak_next` |
|---|---|---|
| SQ1 | weekly con día asignado perdido | corta (regla 2 del encabezado de `20260723110000_streak_assigned_days_semantics.sql:10-11`); **igual** a `get_client_current_streak` |
| SQ2 | weekly, recuperación en la misma semana | +1 (regla 3); igual a la vigente |
| SQ3 | sin programa activo | regla 7 («todo día entrenado suma y ningún día corta», `:18-19`); igual a la vigente |
| SQ4 | `cycle` que entrenó 6 días salteados en 3 semanas, sin ninguna semana vacía | `6`; ningún día individual corta |
| SQ5 | `cycle` con una semana calendario Lun–Dom **ya cerrada** y cero logs | corta ahí (R1). Los límites de esa semana se eligen **cruzando el cambio de hora de Chile** (primer domingo de septiembre / primer domingo de abril) para que el caso valga también como borde DST |
| SQ6 | `cycle` con la semana **en curso** vacía, también sobre el borde DST | **no** corta (la semana no cerró) |
| SQ7 | `cycle` con `start_date IS NULL` (D3/R13) | entra por la regla 7 con guard explícito contra NULL; no evalúa `dy.day - g.start_date` (que daría NULL ⇒ cero días asignados). Cierra H8 del crítico |
| SQ8 | `cycle` con logs de `block_id NULL` (huérfanos) y logs de bloques de **otro** programa, en días sin ningún log propio | esos días **no** suman: el huérfano es **neutro** y el día del ciclo suma con ≥ 1 log **del programa** (enlace `block → plan`), coherente con las reglas 4-5 de weekly (**R29**) |
| SQ9 | `weekly` **flexible** con `start_date IS NULL` (R13 aplica a los dos tipos) | mismo veredicto que SQ7 por la regla 7, y la rama weekly del cuerpo **no** cambia respecto de la vigente |

SQ1–SQ3 se afirman **contra la función vigente** (`viejo = nuevo`), no contra un número escrito a
mano: así el fixture no puede «pasar» porque alguien copió el valor equivocado. SQ9 también se afirma
contra la vigente (es weekly: 0 diff por criterio duro).

**El borde DST no es un fixture aparte**: se prueba dentro de SQ5/SQ6 con fechas elegidas. Y la
comprobación de las funciones batch tampoco es un fixture: es una consulta del mismo harness sobre los
ids del barrido —

- `get_clients_streaks_by_ids` y `get_coach_clients_streaks` devuelven, para los mismos ids, **el
  mismo entero** que la individual (ambas heredan la rama; ninguna cambia de firma).

Firma, `SECURITY DEFINER`, `search_path` y grants: **idénticos** antes y después (un `SELECT` sobre
`pg_proc` + `information_schema.role_routine_grants` dentro del harness lo afirma).

Complemento TS barato (project `web-node`, sin base): si la rama `cycle` se puede expresar como una
función pura de una lista de fechas de log + fecha de hoy, escribir
`packages/workout-engine/cycle-streak.test.ts` con SQ4–SQ9 como tabla. **No sustituye** al harness
SQL (la verdad vive en Postgres) pero da regresión en cada `pnpm test`.

### 5.2 Las otras tres migraciones del tren (R15 — son **cuatro** en total)

OUTLINE §13 sube el conteo a **4 migraciones**. La de racha es la de arriba; las otras tres tienen su
propio contrato de prueba dentro del mismo protocolo tx-rollback de `DATA-SECURITY.md`.

| # | Migración | Qué se afirma |
|---|---|---|
| MG1 | `20260903212038_client_start_workout_program_rpc.sql` | Firma **`client_start_workout_program(p_program_id uuid, p_start_date date DEFAULT NULL) RETURNS TABLE (start_date date, end_date date, started boolean)`** (R23) — un `SELECT` sobre `pg_proc` la afirma columna por columna. `p_start_date` NULL **o igual a hoy Santiago** pasa; **cualquier otra fecha** ⇒ `start_date_out_of_range` (R14), con casos de ayer y de mañana. `end_date = start_date + weeks_to_repeat*7 − 1` fijado en el **mismo UPDATE** (R21). Idempotencia: segunda llamada ⇒ fecha existente con `started=false`; 0 filas por otra causa ⇒ `program_not_startable` (R28). Gate `private.student_write_allowed(v_uid)` **antes** del UPDATE ⇒ `coach_account_paused` (42501) con la cuenta del coach pausada (R17). Guard de pertenencia: **exactamente el mismo predicado que la policy INSERT de `workout_logs`** para el alumno — el test lo lee de `pg_policies` y compara, no lo transcribe (R40) |
| MG2 | `20260903212700_daily_tonnage_side_metadata.sql` (`get_client_daily_tonnage`) | `reps_eff` con **regex**, nunca `jsonb_typeof`: `CASE WHEN metadata->>'left_reps' ~ '^[0-9]{1,4}$' AND metadata->>'right_reps' ~ '^[0-9]{1,4}$' THEN (…)::int + (…)::int ELSE reps_done END` (R27). Casos: sin metadata ⇒ `reps_done` (idéntico a hoy); con lados válidos ⇒ suma; con `'abc'`, `'-1'`, `'10000'` o un solo lado ⇒ `reps_done`, **sin excepción de cast**. Misma firma y mismos grants |
| MG3 | `20260903212800_muscle_volume_side_metadata.sql` (`get_client_muscle_volume(uuid, integer)`, **R15**) | El **mismo** `reps_eff` de MG2, verbatim — un `it`/consulta que compare los dos cuerpos para que no se separen. Espejos TS alineados: `enterprise-profile-analytics.ts:131` y `coach-client-detail.ts:755` dan el **mismo número** que la RPC para el mismo fixture |

**Grants, en las CUATRO (R16).** `REVOKE ALL ON FUNCTION … FROM PUBLIC, anon, service_role;` **antes**
del `GRANT … TO authenticated`, y un `has_function_privilege` **inmediatamente después del CREATE**
que lo afirme. El `service_role` en el REVOKE no es opcional ni un detalle de estilo: es parte del
patrón, y el test falla si falta en cualquiera de las cuatro.

**Rendimiento (R26).** Se acepta que la lectura de `metadata` quede fuera del índice covering del
tonelaje. El protocolo LIVE mide `EXPLAIN (ANALYZE, BUFFERS)` de la RPC **antes y después**; si el
tiempo sube más de **2×**, la migración extra con `INCLUDE (metadata)` es **seguimiento**, no parte de
este tren. El número medido queda escrito en `DATA-SECURITY.md`.

---

## 6. Playwright (solo al cierre, W6)

**No existe `tests/e2e/**`.** Los specs viven en `tests/*.spec.ts` y `tests/<dominio>/*.spec.ts`, con
`playwright.config.ts` en la raíz (`testDir: './tests'` `:41`, `testMatch: '**/*.spec.ts'` `:42`).
Regla del owner: Playwright solo al cierre, **un** navegador, `--workers=1`, contra build de prod.

### 6.1 Specs existentes que se corren en el cierre

| Spec | Por qué entra | Env |
|---|---|---|
| `tests/workout-flow.spec.ts` | el flujo del ejecutor del alumno de punta a punta (login → workout → «Finalizar entrenamiento» → «Sesión completada»). Es **el** spec del ejecutor. Se corre sin editar: si el tren rompió la ejecución de fuerza, cae acá | `E2E_COACH_SLUG`, `E2E_CLIENT_EMAIL`, `E2E_CLIENT_PASSWORD`, `E2E_WORKOUT_PLAN_ID` |
| `tests/movida/mobility-timer.spec.ts` | movilidad `per_side` ya viva: garantiza que la captura por lado de **fuerza** no contaminó la de **hold** | + `E2E_MOBILITY_PLAN_ID` |
| `tests/movida/cardio-builder-execution.spec.ts` | el motor por tipo; R5 (filtro de sustituciones) y R6 (limpieza de campos) pasan por ahí | + `E2E_CARDIO_CLIENT_ID` |

`tests/smoke/*.spec.ts` (project `prod-suave`, `pnpm qa:prod:suave`) se corre después del deploy como
humo de lectura, no como gate del tren.

### 6.2 Dos escenarios nuevos mínimos

`tests/movens/ciclo-dia-n.spec.ts` (NUEVO) — **un** `test`:
login del alumno de un coach con programa `cycle` N=3 → el Inicio muestra un chip «Día N de 3»
(regex `/Día [1-3] de 3/`) y **ningún** nombre de día de la semana en el bloque del programa →
abrir el entreno → completar → volver al Inicio → el chip avanzó al día siguiente del ciclo
(`Día ((N mod 3)+1) de 3`). Si el programa es flexible sin fecha, el hero ofrece **solo** «Empezar
hoy» y el spec afirma que **no** existe ningún control de «Elegir otra fecha» (R14). Env nuevo:
`E2E_CYCLE_CLIENT_EMAIL`, `E2E_CYCLE_CLIENT_PASSWORD`, `E2E_CYCLE_PLAN_ID`; `test.skip` si faltan
(patrón literal de los 3 specs de arriba).

`tests/movens/fuerza-por-lado.spec.ts` (NUEVO) — **un** `test`:
abrir un plan con un bloque de fuerza `side_mode='per_side'` → la **fila de objetivo** muestra el chip
«Por lado» (R39: en la fila de objetivo, **no** en `TypedTargetGrid`) y la fila de serie trae **dos**
campos de reps con etiquetas «Izq» y «Der» → registrar 12 / 10 con 20 kg →
el resumen de la serie imprime el desglose de lados → el bloque queda 1/3 → **recargar la página** →
los dos lados **siguen** ahí (regresión del borrado de `metadata`, §3.3 M1). Env:
`E2E_PER_SIDE_PLAN_ID`.

Ambos caen en el project `chromium` sin project nuevo y se corren explícitamente:
`pnpm exec playwright test tests/movens --workers=1`.

---

## 7. QA manual del owner (W6) — checklist por plataforma

Cuentas: las de `docs/testing/E2E_PERSONAS.md` y las cuentas de prueba del owner. **Nunca** tocar
datos reales de Movens ni de sus 7 alumnos; el QA sobre datos de Movens es de **solo lectura**
(mirar la ficha, no registrar series). Para escribir, un alumno de prueba con un programa cycle N=3
clonado.

**Criterio transversal «weekly no cambió nada»:** en cada una de las tres plataformas se repite el
mismo recorrido con un coach de control **weekly**; el veredicto es «no noto ninguna diferencia
respecto de antes del deploy». Cualquier diferencia visible en weekly — etiqueta, orden de días,
racha, chips, copy — es **bloqueante del tren**, no un detalle. Captura antes/después del Inicio
weekly para poder comparar.

### 7.1 Web desktop (Chrome, sesión de coach)

1. Ficha del alumno → pestaña **Programa**: un bloque de cardio muestra sus ejes (min/metros/FC), uno
   de movilidad su hold, uno de fuerza «3 × 10». Ya no hay «Series × reps» con mancuerna para todo.
2. En un bloque `per_side` de fuerza se ve «Por lado»; en uno `alternating`, «Alternado».
3. Programa de **ciclo**: los días dicen «Día 1 de 3», «Día 2 de 3»… y **nunca** Lun/Mar/Mié.
4. Builder: cambiar el tipo de un bloque de cardio a fuerza limpia los campos de cardio al instante,
   sin diálogo (R6); el selector «Lado» ofrece solo `Por lado` y `Alternado` (R4, sin `bilateral`).
5. «Cambiar ejercicio» en un bloque con `exercise_type_override` ofrece solo candidatos del tipo
   efectivo; sin candidatos, «No hay reemplazos de este tipo» (R5).
6. Toggle «Inicio flexible» en un programa **nuevo** viene **apagado**, en `weekly` y en `cycle`
   (R13); los programas ya guardados con el flag conservan su fecha y nunca muestran «Empezar hoy».
7. Chip «Por lado» / «Alternado» en la **fila de objetivo** del ejercicio de fuerza, no en la grilla
   de objetivos tipados (R39).
8. Coach de control **weekly**: **ficha y builder** idénticos a antes (R37, los dos, no solo la ficha).

### 7.2 PWA móvil (Chrome Android + Safari iOS, sesión de alumno)

1. Alumno con ciclo y sin haber empezado: hero «Tu programa está listo · Día 1 de 3» con **«Empezar
   hoy» como única acción** — **no** hay «Elegir otra fecha» ni un estado «Empieza el \<fecha\>» (R14).
2. «Empezar hoy» → el hero pasa a «Hoy toca · Día 1 de 3»; recargar no lo revierte. Tocarlo dos veces
   no da error (idempotente, R28).
3. Entrenar el día 1 completo → el hero pasa a «Día 1 hecho · Próximo: Día 2 de 3»; **al día
   siguiente** toca el 2, y si el alumno se salta 3 días, **igual** toca el 2 (no el calendario).
4. Fuerza por lado: la serie pide «Izq» y «Der» + un peso; el resumen dice «10 / 10 · 20 kg».
   Registrar 12/10, salir del ejecutor y volver: **los dos lados siguen ahí**.
5. Racha: para un alumno de ciclo con días entrenados, la racha es > 0 (hoy es 0). Avisar al coach de
   que el número «salta» al desplegar — es esperado y no se persiste (OUTLINE §10).
6. Android Chrome, cuenta nueva **sin ningún entreno**: el prompt de instalar aparece el día 1;
   descartarlo lo silencia 30 días.
7. Modo avión: registrar una serie por lado, volver a red, la serie sube con sus dos lados.
8. **Anillo «Entrenos» en ciclo (R12):** muestra «—» con el rótulo «Sin meta semanal»; **nunca** un
   porcentaje ni un 0 %. En el alumno weekly de control sigue mostrando su número de siempre.
9. **Grillas en ciclo (R12):** no hay `WeekCalendar`, no hay «Recuperar» ni días pendientes; la
   `MomentumCard` y la tira del ejecutor siguen siendo Lun→Dom con un punto por día entrenado.
10. **Aviso de programa asignado sin fecha (R20):** asignar un programa flexible sin fecha ⇒ llega
   **1 email + 1 push**, y la fila «Inicio» del email dice «Empieza cuando quieras».
11. Alumno de control **weekly**: Inicio, day-cards, racha, anillos y ejecutor idénticos a antes (R37).

### 7.3 RN iOS device (app 1.1.2 **con la OTA aplicada**)

Este bloque cubre **solo** el device que ya recibió la OTA. El resto de la flota va en §7.5, que es
obligatorio: sin él el QA declara verde un tren que la mitad de los usuarios no tiene.

1. Confirmar que la OTA entró (runtime `1.1.2` de `apps/mobile/app.json:6`, grupo del update).
2. Home del alumno: mismos 3 estados del ciclo que en PWA (§7.2 puntos 1-3), con las mismas palabras.
3. Ejecutor V3 de fuerza `per_side`: teclado con peso → Izq → Der; el `SetRow` muestra el desglose;
   editar la serie reabre los dos lados con sus valores (no los pierde).
4. Superserie con un bloque `per_side` adentro: la captura por lado funciona igual.
5. Movilidad `per_side` (p. ej. un hold asimétrico): **sin cambios** — sigue guardando
   `left_sec/right_sec` y el hold agregado. Es el control de que fuerza no contaminó movilidad.
6. Ficha del coach en RN (pestañas Plan / Resumen / Análisis): tipo de ejercicio correcto y
   «Día N de 3» en programas de ciclo; biblioteca de programas idem.
7. Hoja «Invitar alumno»: el copy ya no dice «baja EVA».
8. Cola offline: modo avión → 2 series por lado → volver a red → ambas suben con sus lados.
9. Alumno y coach de control **weekly** (R37): Inicio y ejecutor del alumno **y** ficha y builder del
   coach, sin diferencias. Los cuatro recorridos, no un muestreo.

### 7.4 Casos específicos de Movens (solo lectura, con el coach avisado)

- Programa de ciclo N=3 con 7 alumnos activos: la ficha de cada uno muestra «Día N de 3».
- «Remo a un brazo con kettlebell» (3 series, hoy `reps_done=36` con la nota «2 x 18 izq/der»):
  los **logs históricos no se migran** — siguen mostrando 36. Solo las series **nuevas** capturan
  por lado. Confirmar que la ficha no rompe con las dos formas conviviendo.
- «Brettzel 2.0» (movilidad, `{left_sec:30, right_sec:30}`): sin cambios.
- Los 8 bloques con `exercise_type_override` de Movens muestran su tipo en la ficha.
- 3 de 5 alumnos con logs entrenan **por web**: el QA de PWA (§7.2) pesa más que el de RN para este
  coach en particular. Con 0 tokens Android en la instancia, el punto 6 de §7.2 se prueba en un
  dispositivo del owner, no esperando a un alumno real.

### 7.5 Flota mixta — devices **sin** la OTA (obligatorio, antes del deploy)

`apps/mobile/app.json` fija `runtimeVersion.policy = "appVersion"` (`:263-264`) y `version` `1.1.2`
(`:6`): la OTA del tren **solo** alcanza a binarios 1.1.2. Todo device con un binario anterior se
queda con el código de hoy —ISODOW en `home.tsx:350` y `:401-412`, `reps_done` sin lados— por tiempo
indefinido, hasta que su usuario actualice desde la tienda. Y aun dentro de 1.1.2,
`fallbackToCacheTimeout: 6000` (`:261`) hace que el **primer** arranque tras el deploy corra el bundle
viejo al menos una vez si la descarga tarda más de 6 s.

Conclusión operativa: durante la ventana de convivencia hay **dos clientes escribiendo en la misma
base**. El tren no la puede ignorar.

**Orden de salida obligatorio (R35): deploy web → migraciones → OTA.** Los clientes 1.1.2 sin la OTA
escriben logs **sin** `metadata` (válido) y ven `reps_done` —que es el **lado más bajo**— en los
bloques por lado hasta actualizar; `fallbackToCacheTimeout` implica que un arranque puede correr con
el bundle viejo. Está documentado acá y en el aviso a coaches, y **no bloquea** el tren.

**Q-flota-1 · Reparto medido (previo al deploy, no estimado).** Antes de publicar la OTA, medir con
EAS Update / Observe qué porcentaje de sesiones activas está en 1.1.2 y qué porcentaje en binarios
anteriores, y dejar el número escrito en el SPEC. Si el grueso está por debajo de 1.1.2, la decisión
de **forzar update** (o de no publicar RN en este tren) es del owner, no del deploy.

**Q-flota-2 · Un device SIN la OTA no se rompe ni corrompe datos.** Con un binario anterior (o
1.1.2 con la OTA bloqueada / primer arranque con bundle viejo), y contra la **DB ya migrada**:

1. Home del alumno con programa `cycle`: sigue mostrando lo de hoy (día por ISODOW, etiquetas de
   semana). Feo, no roto: **no** pantalla en blanco, **no** crash.
2. Registrar una serie de fuerza en un bloque `side_mode='per_side'`: guarda `reps_done` sin
   `metadata` de lados. El log es válido y **no** bloquea al alumno.
3. Esa misma serie vista después desde un device **con** la OTA y desde la ficha web del coach: se
   muestra sin lados, sin romper el render (es el mismo caso que los 296 logs históricos, §7.4).
4. Al revés: una serie escrita **con** lados desde un device actualizado, abierta en el device viejo:
   muestra el `reps_done` y **descarta** el `metadata` que no entiende, sin crash ni valores raros.
5. Racha y anillos del alumno: el número lo calcula la DB (ya migrada), así que el device viejo ve el
   valor **nuevo** con la UI vieja. Confirmar que ninguna pantalla asume el valor anterior.
6. Cola offline del device viejo drenando **después** del deploy: los items encolados con el shape
   antiguo suben sin error (espejo del `it` legacy de `tests/mobile-offline-cache-typed-axes.test.ts:170`).

**Criterio de paso:** ningún punto puede terminar en crash, dato perdido ni fila que la app nueva no
sepa leer. Un device viejo puede verse desactualizado; **no** puede corromper.

---

## 8. Comandos exactos

Aislados durante el desarrollo (rápidos, por ruta):

```bash
pnpm exec vitest run packages/workout-engine/cycle-cursor.test.ts
pnpm exec vitest run packages/workout-engine/cycle-completions.test.ts
pnpm exec vitest run packages/workout-engine/program-day-label.test.ts
pnpm exec vitest run packages/workout-engine/set-log-payload.per-side.test.ts
pnpm exec vitest run packages/workout-engine/logged-set-summary.test.ts
pnpm exec vitest run packages/workout-engine/keypad-flow.test.ts
pnpm exec vitest run packages/workout-engine/session-summary.test.ts
pnpm exec vitest run packages/workout-engine/day-completion.parity.test.ts packages/workout-engine/executor-mapping.parity.test.ts
pnpm exec vitest run packages/schemas/workout.test.ts
pnpm exec vitest run packages/plan-builder/block-type-fields.test.ts
pnpm exec vitest run "apps/web/src/app/c/[coach_slug]/dashboard/_data/heroComplianceBundle.test.ts"
pnpm exec vitest run "apps/web/src/app/c/[coach_slug]/dashboard/_data/weekPendingWorkouts.test.ts"
pnpm exec vitest run "apps/web/src/app/c/[coach_slug]/workout/[planId]/_actions/workout-log.actions.test.ts"
pnpm exec vitest run apps/web/src/lib/workout-offline-queue.test.ts
pnpm exec vitest run apps/web/src/lib/workout/progression.test.ts
pnpm exec vitest run apps/web/src/lib/workout/workoutAdherence30d.test.ts
pnpm exec vitest run "apps/web/src/app/coach/clients/[clientId]/TrainingTabB4Panels.test.tsx"
pnpm exec vitest run apps/web/src/services/workout/program-assignment-notification.service.test.ts
pnpm exec vitest run apps/web/src/lib/email/transactional-templates.test.ts
pnpm exec vitest run --project mobile-node tests/mobile/analisis-tab-strength-line.test.ts
pnpm exec vitest run tests/mobile-program-persistence.test.ts tests/mobile-offline-cache-typed-axes.test.ts
pnpm exec vitest run --project mobile-node tests/mobile/start-program.test.ts tests/mobile/share-per-side.test.ts
pnpm exec vitest run --project mobile-node tests/mobile/executor-v3-weekly-streak.test.ts tests/mobile/client-invite-copy.test.ts tests/mobile/keypad-flow.test.ts
pnpm exec vitest run tests/eslint-rules/local-rules.test.ts
```

> Las rutas con `[` y `]` van **entre comillas** en PowerShell y en bash: sin comillas el shell las
> expande como glob y vitest no encuentra el archivo.

Gates de cierre (los del `package.json` raíz, en este orden):

```bash
pnpm docs:check                                  # scripts/check-docs.mjs — tope duro 16 KB en CURRENT.md
pnpm lint                                        # 2 pasadas: web/tests/scripts/tools + eslint.mobile.config.mjs
pnpm typecheck                                   # solo web (pnpm --filter @eva/web typecheck)
pnpm test                                        # vitest, suite completa (676 archivos / 8.892 tests al 02-09)
pnpm check:tokens                                # paridad del design system
pnpm check:nutrition-v2-boundaries               # gate local obligatorio que CI no corre
pnpm --filter @eva/mobile exec tsc --noEmit      # TypeScript móvil (apps/mobile no declara script `typecheck`)
pnpm --filter @eva/mobile exec expo export --platform android
```

Playwright, **solo al cierre**, un navegador:

```bash
pnpm exec playwright test tests/workout-flow.spec.ts --workers=1
pnpm exec playwright test tests/movida --workers=1
pnpm exec playwright test tests/movens --workers=1
pnpm qa:prod:suave                               # humo post-deploy (project prod-suave)
```

SQL (antes de aplicar la migración, con tx-rollback; detalle y credenciales en `DATA-SECURITY.md`):

```
psql "<connection string de LIVE>" -f supabase/tests/streak_cycle_equivalence.sql
```

> El archivo **no** lleva prefijo de timestamp (R25). Las **4** migraciones del tren (R15) sí lo
> llevan, como todas las de `supabase/migrations/`.

Notas de ejecución:
- `pnpm test` sin `run` queda en modo watch (`"test": "vitest"`); para una corrida única, `pnpm exec vitest run`.
- Local, vitest usa `maxWorkers: '50%'` (`vitest.config.ts:73`): con la CPU ocupada, correr por ruta
  y dejar la suite completa para el cierre.
- CI parte la suite en 3 shards (`npx vitest run --shard=N/3`); la unión es la suite completa.

---

## 9. Matriz wave × gate

| Wave | Tests que deben quedar verdes antes de cerrar la wave |
|---|---|
| **W0 Motor** | §1.1, **§1.1b** (`cycle-completions.test.ts`, tarea W0.2b — **bloquea M4**), §1.2–§1.8 completos + §2 (los dos parity sin editar). §1.4 ya **no** exige un commit atómico: **W0.6b se elimina** (R19) y el gate de W0.6 es el `it` de que `formatLoggedSetLine('strength')` sigue devolviendo `null` |
| **W1 DB** | §5 (`streak_cycle_equivalence.sql` — **sin `<ts>`**, R25 — con sus **cuatro** condiciones) + §5.1 (fixtures SQ1–SQ9 en la misma tx + la consulta de las batch) + **§5.2 (las otras 3 migraciones: MG1–MG3, grants de R16 en las cuatro, EXPLAIN de R26)** + el complemento TS si aplica |
| **W2 Alumno web** | §3.1, §3.2, **§3.2.1 (AD1–AD9, ya sin condicional: R12 fijó la regla; tarea W2.10b)**, §3.3 (incluye SP1–SP9 de `startWorkoutProgramAction({ coachSlug, programId })`), §3.4, **§3.6** + `pnpm typecheck` |
| **W3 Alumno RN** | §4.1, §4.2, §4.3, §4.5, **§4.5b (chip de R39, tarea W3.9)**, **§4.6 (lectura de R10, tarea W3.7b)** y el test de share de §1.6 (**tarea W3.x**, R34) + `pnpm --filter @eva/mobile exec tsc --noEmit` |
| **W4 Coach web + RN** | §1.8 (incluye el round-trip de `serialize.ts`, R32), §4.4 (regla eslint + `local-rules.test.ts`), §4.5b lado web (W2.15), `mobile-coach-client-detail-logic.test.ts`. Los dos tests de superficie de §1.4 se re-corren acá como cobertura del hueco declarado |
| **W5 PWA / working tree** | `tests/pwa-sw-navigation.test.ts` y `clear-client-caches.test.ts` verdes **ya commiteados** + el test de elegibilidad del `InstallPrompt` |
| **W6 Cierre** | los 8 gates de §8, §6 (Playwright), §7 (QA del owner en las 3 plataformas) **+ §7.5 (flota mixta)**: Q-flota-1 se mide **antes** de publicar la OTA, Q-flota-2 se corre contra la DB ya migrada, y el orden de salida es **deploy web → migraciones → OTA** (R35) |

**Costo de la matriz (R38).** Las tareas nuevas que esta matriz cubre — W0.2b (`cycle-completions`),
W2.10b (anillo «Entrenos»), W3.7b, W3.x (share RN) y la **4.ª migración** — suben el tren a
**≈ 14,5 días-agente**. Se absorbe en el mismo tren (D4): **nada pasa a no-objetivo** por costo.

---

## 10. Gaps de cobertura aceptados (declarados, no tapados)

1. **La racha parte sin red.** No hay test previo de `get_client_current_streak`; el harness de §5 se
   escribe *en* este tren. El «antes» contra el que se compara es la función vigente en LIVE, no un
   baseline versionado.
2. **`apps/mobile/lib/workout/progression.ts` no tiene test** (la copia web sí). Si el fix toca el
   cálculo por lado, la copia RN queda cubierta solo por el typecheck y el QA en device.
3. **`heroComplianceBundle` y `workout.service.ts` no son testeables tal cual**: §3.1 y §4.1 dependen
   de extraer selectores puros. Si W2 decide no extraerlos, esos dos bloques de la matriz caen y el
   punto P0 se queda sin unit test.
4. **Los 296 logs históricos de bloques `per_side` no se migran.** Ningún test cubre el «después»
   de esos datos; solo el QA de §7.4 confirma que las dos formas conviven sin romper la ficha.
5. **`WeekCalendar.tsx`** figura como código muerto a borrar (OUTLINE §7): si tenía cobertura
   indirecta, se pierde al borrarlo. Verificar con `grep` antes de eliminar.
6. **El anillo «Entrenos» en ciclo ya NO es un gap.** R12 fijó la regla: `score = null`, firma
   `number | null`, los 3 consumidores pintan «—» con «Sin meta semanal», tarea W2.10b. §3.2.1 tiene
   AD1–AD9 y es gate de W2. Lo que **sí** queda como no-objetivo declarado —y va a backlog, no a este
   tren— es la **meta semanal de sesiones en programas de ciclo** (R12 + OUTLINE §11): mientras no
   exista, el alumno de ciclo no tiene un porcentaje de adherencia semanal, y eso es una decisión, no
   una omisión.
7. **La flota sin la OTA no tiene test automático.** §7.5 es QA manual: no hay forma de correr el
   bundle viejo contra la DB nueva dentro de vitest ni de Playwright. La red es la compatibilidad de
   datos —`metadata` aditivo, `reps_done` siempre poblado (= lado más bajo)— el orden de salida de
   **R35** y el QA de Q-flota-2. Si el reparto medido en Q-flota-1 deja a la mayoría fuera de 1.1.2,
   eso es una decisión de release del owner, no un gap de testing.
8. **`get_client_muscle_volume` y sus espejos TS entran con la 4.ª migración (R15) y sin baseline
   previo**, igual que la racha: `enterprise-profile-analytics.ts:131` y `coach-client-detail.ts:755`
   no tienen test hoy. §5.2 MG3 escribe el «después»; el «antes» es la función vigente en LIVE.
9. **El PR por e1RM puede no dispararse en bloques `per_side` con historial sumado (R22).** Es un
   costo **aceptado**, no un descubrimiento: va en el aviso a los 11 coaches afectados y tiene su `it`
   en §1.6. El PR por peso sigue funcionando.

## 11. Aviso a los coaches afectados (W6.5b) — borrador; lo envía el owner, nunca la sesión

Sale **después del deploy web y antes de la OTA** (R35). Destinatarios: los 8 coaches con programas
`cycle` activos y los 11 con bloques `per_side`/`alternating` en fuerza (consulta de DATA-SECURITY §1.3
y §9). Canal: el que el owner elija (correo desde Resend o mensaje directo); no es marketing.

> Hola {nombre}, te cuento dos cambios que salen hoy en EVA y que tocan cosas que ya usas:
>
> **1. Programas por ciclo (Día 1, Día 2, Día 3…).** Ahora el alumno ve «Hoy toca · Día 2 de 3» y el
> ciclo avanza cuando completa el día, no por el calendario. Si un programa se creó con «Inicio
> flexible», el alumno lo empieza con el botón «Empezar hoy». En tu ficha del alumno vas a ver «Día 1
> de 3 / Día 2 de 3 / Día 3 de 3» en vez de «Lun / Mar / Mié». Los programas semanales no cambian.
>
> **2. Series «por lado» en fuerza.** El alumno registra las repeticiones de cada lado (Izq / Der) con un
> solo peso, y en tu ficha lo ves como «20 kg × 10 / 10». Dos cosas a tener en cuenta:
> · En los ejercicios donde antes el alumno sumaba los dos lados en un solo número, el récord por
>   1RM estimado puede no dispararse la primera vez; el récord por peso sigue igual.
> · Durante unos días la app en el teléfono puede seguir con la versión anterior hasta que se
>   actualice: esos alumnos registran como siempre (un solo número). Al actualizar, ya piden Izq/Der.
>
> Si ves algo raro en tu ficha o en la app del alumno, escríbeme y lo miramos.

Texto canónico de los dos puntos aceptados como cambio visible: (a) PR por e1RM con historial sumado
(R22, `pr-detect.ts` compara `reps_done` = mínimo contra el histórico sumado) y (b) flota mixta 1.1.2
sin OTA (R35: logs sin `metadata`, `reps_done` como hoy; `fallbackToCacheTimeout` puede dar un arranque
con bundle viejo). Registro del envío (fecha, canal, cantidad): **ENVIADO el 2026-09-05 ~18:10Z por orden explícita del
owner en la sesión de cierre**, canal correo (Resend, `EVA <noreply@eva-app.cl>`, reply-to
`contacto@eva-app.cl`, batch idempotente `w65b-ciclo-por-lado-20260905`, tag `tipo=aviso_ciclo_por_lado`),
**14 destinatarios** (unión de los 8 con `cycle` y los 11 con `per_side`/`alternating` sobre alumnos reales
no demo, recalculada en LIVE el 05-09; excluido solo `josefit` = cuenta del owner). Asunto «Dos cambios en
EVA que tocan tus programas»; a `joaquinamr7` se le sumó el aviso de que sus 10 plantillas volvieron (T5.3
de plan-templates-v2). Texto = el borrador de arriba con «salen hoy» → «ya están en EVA».
