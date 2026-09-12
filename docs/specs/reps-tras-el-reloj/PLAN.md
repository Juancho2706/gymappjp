---
status: active
owner: product-engineering
last_verified: "2026-09-12"
canonical: false
---

# PLAN — Reps tras el reloj

Ejecución del [SPEC](SPEC.md). Todo lo que dice «archivo:línea» está verificado contra HEAD
`7ade566c`. Tareas con checkbox en [TASKS.md](TASKS.md).

## 1. Arquitectura por capa

El tren baja en tres capas y en ese orden. **La capa de abajo no sabe nada de la de arriba.**

```text
packages/workout-engine        (W1 · puro, sin RN ni Next)
  captureGapsFor(values, kind) ........ qué falta anotar
  KeypadTarget.holdSource / .prompt ... contrato del teclado
        │
        ├─► apps/mobile              (W2 · RN)
        │     use-hold-module  → HoldCommitInfo.captureGaps + timbre a 0
        │     ExerciseScreenV3 / SupersetScreenV3 → deciden abrir (R3) y llaman onOpenSet
        │     ExecutorV3.openSet → arma el KeypadTarget de fuerza por tiempo
        │     KeypadHost.commit → tercera rama buildStrengthTimePayload
        │     RestInterstitialV3 → línea «Serie N»
        │
        └─► apps/web                 (W3 · Next)
              ExerciseStepV3 → sheet nueva + «Repetir»
              SupersetStepV3 → reutiliza editBlockId con foco en REPS
              LogSetForm → siembra holdSourceRef desde el log
              WorkoutExecutionClient → lastSet al contexto del interstitial
```

**Qué NO se toca**: la decisión del motor (`decideHoldAutolog`), el payload
(`buildStrengthTimePayload`), el guardado (`logSet`, `logSetAction`, la cola offline), la matriz de
descanso (`resolveRestAfterCommit`) y el audio de la web (`useExecCountdown.ts:105`).

**Orden duro**: W1 → (W2 ‖ W3) → W4. W2 y W3 dependen del helper y del campo nuevo de W1, y entre
ellos no comparten ningún archivo.

## 2. Reparto de archivos — ningún archivo aparece en dos workers

### W1 · Motor (worker Sonnet)

| Archivo | Cambio |
|---|---|
| `packages/workout-engine/hold-autolog.ts` | `captureGapsFor(values, kind)` puro, junto a `holdSidesFor` (`:205`) y `mergeHoldCaptureValues` (`:234`) |
| `packages/workout-engine/keypad-flow.ts` | `KeypadTarget` (`:29-84`) gana `holdSource?: HoldSource \| null` y `prompt?: 'hold-gap'`. **`keypadStepsForTarget` no cambia** (`:220-224` ya rutea `strengthTimeMode`) |
| `packages/workout-engine/hold-autolog.test.ts` | Casos de `captureGapsFor` |
| `packages/workout-engine/keypad-flow.test.ts` | El target con `holdSource` sigue devolviendo los mismos pasos (no-regresión) |

El barrel `packages/workout-engine/index.ts` ya re-exporta los dos módulos (`:28`, `:46`): **no se toca**.
`optionalReps` (`set-log-payload.ts:334`) y `num` (`:29`) son privados de ese módulo; el helper nuevo
replica la regla en `hold-autolog.ts` o los exporta — decisión del worker, con test que congele las dos
formas (`''`, `'0'`, `'0,5'`, `'8'`).

### W2 · RN (worker Opus)

| Archivo | Cambio |
|---|---|
| `apps/mobile/components/alumno/workout/v3/use-hold-module.ts` | R1 timbre en `:257`; R2 `captureGaps` en `HoldCommitInfo` (`:93-98`) y en `a.onCommit(...)` (`:305-310`); R8 limpieza de `sentSetsRef` (`:184`) en el efecto de `resetKey` (`:338-349`) |
| `apps/mobile/components/alumno/workout/v3/ExerciseScreenV3.tsx` | R4 `commitSet(payload, info)` (`:236-250`, montaje `:440`); R7 línea con la pref OFF sobre `RestOfferV3` (`:559-568`); R8 `activeSet = repeatSet ?? firstUnlogged` (`:180`) + `resetKey` con nonce (`:433`) + siembra del hero (`:314`) |
| `apps/mobile/components/alumno/workout/v3/SupersetScreenV3.tsx` | R4 `handleCommit(payload, source, info)` (`:365-372`, montaje `:534`); R7 solo «Editar» |
| `apps/mobile/components/alumno/workout/v3/ExecutorV3.tsx` | R4/R5 `openSet(blockId, setNumber, prefill?, opts?)` (`:689-817`); R7 `lastSet` en `interstitialDataRef` (`:2042-2052`); R8 `onCommitSet(payload, { repeat })` en `handleCommit` (`:853-1109`) |
| `apps/mobile/components/alumno/workout/v3/RestInterstitialV3.tsx` | R7 `lastSet` en `RestInterstitialData` (`:84-99`) y su render bajo los controles del anillo |
| `apps/mobile/components/alumno/workout/KeypadHost.tsx` | R6 tercera rama en `commit()` (`:220-240`); `isEmptyCapture` en modo tiempo (`:162`); copy R9 con `target.prompt` |
| `apps/mobile/components/alumno/workout/v3/HoldModuleV3.tsx` | Solo si la línea «Serie N» necesita un ancla en el módulo. Por defecto **no se toca** |
| `tests/mobile/executor-v3-hold-module.test.ts` | Timbre, `captureGaps`, candado limpio al cambiar `resetKey` |
| `tests/mobile/keypad-flow.test.ts` | Pasos y foco en modo tiempo desde el lado RN |
| `tests/mobile/executor-v3-keypad-strength-time.test.ts` (nuevo) | Commit del `KeypadHost` con `strengthTimeMode` |

### W3 · Web (worker Opus)

Base: `apps/web/src/app/c/[coach_slug]/workout/[planId]/`.

| Archivo | Cambio |
|---|---|
| `v3/ExerciseStepV3.tsx` | R10 sheet nueva (gemela de `SupersetStepV3.tsx:580-670`); R3 apertura desde `onMeasured` (`:248-250`) / `onLogged` (`:159-174`); R7 línea con la pref OFF sobre `RestOfferV3` (`:359`); R8 «Repetir» sobre la prop `firstUnlogged` (`:114`, gate del módulo `:238`) |
| `v3/SupersetStepV3.tsx` | R10 apertura automática de `editBlockId` (`:161`) con foco en REPS; R7 «Editar» en la tarjeta hecha (`:473`) |
| `v3/RestInterstitialV3.tsx` | R7 `lastSet` en `RestInterstitialData` (`:51-58`) y su render |
| `WorkoutExecutionClient.tsx` | R7 alimenta `lastSet` en el `RestInterstitialDataProvider` (`:2932-2934`); R8 tratamiento «serie nueva» del re-commit en `handleLogged` (`:2166`) |
| `LogSetForm.tsx` | R10 siembra de `holdSourceRef` (`:508`) desde `existingLog.metadata.hold_source`; foco programático en REPS al abrir en edición; copy R9 del encabezado de la sheet |
| `apps/web/src/app/globals.css` | Solo si la sheet necesita una clase propia; por defecto **hereda** `.exec-v3-settings` (`:5143-5148`) |
| `v3/ExerciseStepV3.test.tsx` (nuevo) | Los tres casos de R3 |
| `LogSetForm.test.tsx` | Re-submit de una serie cerrada por reloj |
| `tests/exec-hold-superset.spec.ts` | Ajuste del E2E W6.10 (§6) |

**Cruce cero**: W1 solo escribe en `packages/`, W2 solo en `apps/mobile/` + `tests/mobile/`, W3 solo en
`apps/web/` + `tests/exec-hold-superset.spec.ts`.

## 3. Verificaciones pedidas por el jefe (hechas contra HEAD)

**(a) `useHoldModule` NO limpia `sentSetsRef` al cambiar `resetKey`.** El efecto de reset
(`use-hold-module.ts:338-349`) reinicia `sideIdxRef`, `finished`, `expiredWhileAway`, `elapsedRef`,
`seededRef`, `startedEventRef`, hace `prime`, `killNotif()` y `writeHold(null)` — pero **no toca**
`sentSetsRef` (`:184`), cuyo candado es `blockId:setNumber:side` y vive lo que vive la **instancia** del
hook. Con «Repetir» la clave se repite ⇒ el segundo `expired` no volvería a enviar.
**Mitigación**: agregar `sentSetsRef.current.clear()` a ese efecto. Es seguro porque `resetKey` ya
significa «otra serie / otro miembro / otra ronda», y el único caso en que la clave se reutiliza es
justamente «Repetir». `remeasure` (`:465-472`) **no** cambia `resetKey`, así que sigue conservando el
candado como hoy (R8 lo exige). La web ya lo tiene bien: su candado es `${resetKey}:${side}`
(`v3/HoldModuleV3.tsx:162`) y se limpia solo al cambiar la clave.

**(b) Firmas reales de `onOpenSet`.** No hay una sola firma:
`ExerciseScreenV3.tsx:149` declara `(setNumber: number) => void` y `SupersetScreenV3.tsx:152` declara
`(blockId: string, setNumber: number) => void`. `ExecutorV3` monta la de superserie **directa**
(`onOpenSet={openSet}`, `:1683`) y las de pantalla sola **envueltas**
(`onOpenSet={(setNumber) => openSet(block.id, setNumber)}`: `:1762` ejercicio, `:1799` movilidad, `:1828`,
`:1859`, `:1890`). `openSet` es `(blockId, setNumber, prefill?)` (`:690`).
**Consecuencia**: el tercer argumento de R4 es el **cuarto** de `openSet` (`prefill` ya ocupa el tercero)
y el **segundo/tercero** de las pantallas. Se agrega como `opts?: { seed?, focus?, prompt? }` opcional en
las tres firmas y se propaga en los seis montajes; los cinco usos de pantalla sola tienen que reenviarlo
(`(setNumber, opts) => openSet(block.id, setNumber, undefined, opts)`), o el `seed` se pierde en silencio.

**(c) La `data` del interstitial RN es un ref mutado en cada render.**
`ExecutorV3.tsx:2042-2052` reasigna `interstitialDataRef.current` en el cuerpo del componente, y
`renderRestInterstitial` (`:2054-2058`) es un `useCallback` con deps `[]` que lee ese ref; el efecto que
lo registra en el provider (`:2063-2066`) corre una sola vez.
**Consecuencia**: `lastSet` se agrega como un campo más del objeto de `:2043-2052` (alimentado por un ref
del executor escrito en `handleCommit`), sin tocar el registro ni las deps. El repintado llega gratis:
`RestTimerHost` (`timers/TimerProvider.tsx:240-252`) re-renderiza con cada tick del descanso. Los
callbacks `onEdit`/`onRepeat` deben leerse de refs estables (`openSet`/`repeatSet`), nunca capturar
`sessionLogs`.

**(d) La cola y el guardado hacen upsert, no duplican.** Verificado en los tres caminos y anotado en el
[SPEC §8](SPEC.md#8-backend-r11-cero-migraciones-cero-rpc): RN online `workout-session.ts:1104-1173`
(SELECT → UPDATE + purga de duplicados; `23505` degradado a UPDATE), RN offline
`offline-cache.ts:87-112` (`dedupKey = client:block:set:día`) + `offline-queue.ts:195-197` (last-wins) con
drenaje `offline-cache.ts:138-154`, y web `_actions/workout-log.actions.ts:138-191`. **Cero migraciones
confirmado.** El único cuidado es el jsonb: `metadata` se escribe entero cuando viaja
(`workout-session.ts:1087`, `workout-log.actions.ts:177`), así que un re-commit sin `hold_source` **borra
la marca** — de ahí R5 y R10.

## 4. Riesgos y mitigaciones

| # | Riesgo | Mitigación |
|---|---|---|
| 1 | **Candado `sentSetsRef`** (`use-hold-module.ts:184`) sobrevive al `resetKey` ⇒ «Repetir» guarda la primera vez y calla la segunda | Limpiarlo en el efecto de `:338-349`. Test de negación: con el orden viejo, el segundo `expired` no llama a `onCommit` |
| 2 | **Orden `setKeypadTarget(null)`** — `handleCommit` limpia el teclado en `ExecutorV3.tsx:857`; si la pantalla llama a `onOpenSet` **antes** de que `handleCommit` termine, el target recién puesto se borra solo | La apertura ocurre **después** de `onCommitSet(payload)` en `commitSet`/`handleCommit` de la pantalla (R4). `handleCommit` es `async` pero `setKeypadTarget(null)` corre síncrono en su primera línea, así que llamar a `openSet` después del `await`-less `onCommitSet(...)` es suficiente. Si el worker ve parpadeo, la salida es diferir con un `queueMicrotask`, **nunca** mover el `:857` |
| 3 | **Closure viejo de `sessionLogs` en `openSet`** — sus deps incluyen `sessionLogs` (`ExecutorV3.tsx:816`) y el optimista de `logSet` (`workout-session.ts:1025-1036`) todavía no propagó al re-render cuando la pantalla abre el teclado ⇒ `existingLog` (`:769`) sería `undefined` | La rama nueva siembra **desde `opts.seed`** (el payload que se acaba de commitear) y solo cae a `sessionLogs` cuando no hay seed (camino «Editar»). Regla explícita en R5 |
| 4 | **`hold_source` degradado a `'manual'`** — RN: `keypadTypedContext` devuelve `undefined` sin `target.typed` (`ExecutorV3.tsx:831-841`), así que la rama nueva del host no recibiría marca; web: cada `LogSetForm` de la sheet es una instancia nueva con `holdSourceRef` en `null` (`LogSetForm.tsx:508`), y el gate `isLogged` del efecto de prefill (`:623`) impide que se rellene | RN: `holdSource` viaja **en el `KeypadTarget`** (R5) y lo consume la tercera rama (R6). Web: sembrar `holdSourceRef` desde `existingLog.metadata.hold_source` al abrir en edición (R10). Los dos casos tienen test (§5) y el E2E los cubre (`tests/exec-hold-superset.spec.ts:230`) |
| 5 | **E2E W6.10** — el bloque suelto de fuerza por tiempo del seed (`scripts/seed-e2e-personas.mjs:536-550`: `reps_unit='sec'`, `duration_sec=5`, `target_weight_kg=10`, sin `side_mode`) ahora **abre la sheet** a 0, y esa sheet tapa los asserts de `10 kg × 5 s` y de los `rest-offer-strength-*` (`spec:175-177`) | Ver §6 |
| 6 | **`formIdentityKey` remonta el form al editar** (`LogSetForm.tsx:1337`, `key` en `:1357`): la clave incluye `reps_done`, así que guardar reps **cambia la identidad** y el `<form>` se re-monta con inputs frescos | Es el comportamiento deseado (la fila tiene que releer la serie), pero el foco programático de la sheet debe re-aplicarse tras el remonte y el `holdSourceRef` **no** puede vivir en el `<form>` (es un `useRef` del componente y sobrevive; verificarlo en el test de R10) |
| 7 | **`captureRef` se reinicia al cambiar `activeSet`** (`ExerciseScreenV3.tsx:232-235`: deja solo el peso sugerido) ⇒ «Repetir» perdería las reps ya guardadas | Sembrar desde el log existente cuando `repeatSet != null`, reutilizando el carril `seedValues` del hero (`:314`), que ya existe para el «día repetido» |
| 8 | **Web: `firstUnlogged` es una prop** (`v3/ExerciseStepV3.tsx:114`, calculada en `WorkoutExecutionClient.tsx:2575-2576`) y el módulo monta bajo `firstUnlogged != null` (`:238`) | El override de «Repetir» vive **local al step** (`activeSetNumber = repeatSet ?? firstUnlogged`) y reemplaza los cinco usos de la prop dentro del step (`:238`, `:247`, `:307`, `:320`, `:335`). No se toca el cálculo del cliente |
| 9 | **Doble emisión de analítica**: si el prompt se abre y se cierra dos veces (por «Editar» y por el automático) se contarían dos `hold_capture_prompted` | `trigger: 'timer' \| 'manual'` distingue los dos orígenes y `hold_capture_resolved` se emite una vez por apertura |

## 5. Tests por capa (R15)

**Motor** (`packages/workout-engine/hold-autolog.test.ts`)

- `captureGapsFor` con reps vacío ⇒ `['reps']`; con `'0'` ⇒ `['reps']` (nunca cuenta como anotado, F1);
  con reps `'8'` ⇒ `[]`; con peso sugerido presente ⇒ el peso **no** aparece en los huecos; sin peso y sin
  reps ⇒ `['reps','weight']` con el orden estable; `kind: 'mobility'` ⇒ `[]` siempre.
- `keypad-flow.test.ts`: un `KeypadTarget` con `holdSource` y `prompt` devuelve exactamente los mismos
  pasos que hoy (no-regresión de `keypadStepsForTarget`).

**RN** (`tests/mobile/`)

- `executor-v3-hold-module.test.ts`: (1) el cue suena en foreground a 0 y **no** cuando venció con la app
  fuera ni en `done-early` (extiende el caso de `:367`); (2) `onCommit` recibe `captureGaps` correctos por
  lado y por kind; (3) cambiar `resetKey` limpia el candado y un segundo `expired` **vuelve** a llamar a
  `onCommit` (probado por negación contra el orden viejo).
- `executor-v3-keypad-strength-time.test.ts` (nuevo): `KeypadHost.commit` con `strengthTimeMode` produce
  `actual_hold_sec`, `reps_done` y `metadata.hold_source` **conservado**; `isEmptyCapture` ignora el peso.
- `keypad-flow.test.ts`: `initialFieldIndex` = 1 con foco en `reps` y 0 con foco en `weight`, sobre los
  pasos reales (`keypad-flow.ts:137-141` y `:155-160`).
- Lógica de `openSet` en modo tiempo: siembra desde el **seed** (no desde `sessionLogs`) y arrastra
  `holdSource`. Si el harness de RN no permite montar `ExecutorV3`, se extrae la construcción del target a
  un helper puro testeable (patrón `typed-screen-model.ts`).
- «Repetir»: `activeSet` override, `resetKey` con nonce y `onCommitSet(..., { repeat: true })` ⇒ el
  descanso vuelve a arrancar aunque `wasLogged` sea `true`.

**Web**

- `LogSetForm.test.tsx`: re-submit de una serie ya cerrada por reloj ⇒ el FormData lleva
  `reps_done = '5'` y `metadata.hold_source = 'timer'` (hoy la marca se perdería, riesgo 4).
- `v3/ExerciseStepV3.test.tsx` (nuevo, mínimo): la sheet **se abre** cuando el hold cierra con reps
  vacías; **no** se abre con reps ya tipeadas; **no** se abre con `expiredWhileAway`.
- `v3/auto-rest-matrix.test.tsx` y `v3/HoldModuleV3.analytics.test.tsx` (mocks de audio en `:22-27`) no
  cambian de contrato: sirven de red de no-regresión.

**E2E**: ver §6.

## 6. E2E W6.10 — qué cambia y qué no

El seed del caso canónico (`scripts/seed-e2e-personas.mjs:499-551`) tiene **tres** bloques: superserie B
con un miembro de **movilidad** `per_side` con reloj (`exercise_type_override: 'mobility'`) y un miembro
de **fuerza clásica** `per_side` sin reloj, más un bloque **suelto de fuerza por tiempo**
(`reps_unit: 'sec'`, `duration_sec: 5`, `target_weight_kg: 10`).

Consecuencias medidas:

1. El miembro con reloj de la superserie es **movilidad** ⇒ por R3 **nunca** abre el prompt. Los pasos 1
   a 4 del spec (`tests/exec-hold-superset.spec.ts:130-154`) quedan **intactos**, incluido el assert
   `dialog 'Descanso'` count 0 (`:154`).
2. El único prompt del recorrido es el del **bloque suelto** (paso 5, `:156-178`), que es exactamente la
   fila que el segundo test asserta en DB con `reps_done IS NULL` (`:226`).

Cambio mínimo propuesto: tras el 0 del bloque suelto, **assertar que la sheet aparece** (por su nombre
accesible propio, distinto de «Descanso») y cerrarla con **«Sin reps»**; recién entonces corren los
asserts existentes de `10 kg × 5 s` (`:175`) y de `rest-offer-strength-*` (`:176-177`). Así el segundo
test (`reps_done IS NULL`, `actual_hold_sec = 5`, `metadata.hold_source = 'timer'`) **sigue válido sin
tocarse**, y de yapa queda cubierto el camino «cerrar sin guardar no pierde nada». Ver el bloque
«⚠ Para el jefe» de §8.

## 7. Presupuesto y orden

| Wave | Quién | Estimación |
|---|---|---|
| W0 · SDD, commit del share, decisiones | Fable | 0,25 d-a |
| W1 · Motor | Sonnet | 0,5 d-a |
| W2 · RN | Opus | 2 d-a |
| W3 · Web | Opus | 1,5 d-a |
| W4 · Juicio, gates y salida | Fable | 0,75 d-a |

Total ≈ **5 días-agente**. Orden de recorte si aprieta: (1) «Repetir» en web (queda solo en RN, con la
divergencia declarada), (2) la línea «Serie N» dentro del interstitial (queda solo con la pref OFF),
(3) el test nuevo de `ExerciseStepV3`.

## 8. Hallazgos del writer y decisión del jefe (W0.4, cerrado 12-09)

Tres hallazgos que **no cambian** la arquitectura R1–R16 pero la precisan. **Decisión del jefe: se
aceptan los tres tal como los propone el writer.** (1) el E2E cierra la sheet del bloque suelto con
«Sin reps» y el test 2 no se toca; el camino «Guardar» queda cubierto por los tests unitarios de W2.7 y
W3.3 y por el QA del owner (SPEC §10, puntos 1 y 9). (2) sin guion: `formatStrengthTimeSetLine` tal cual
(el mockup `6ead4180` se actualizó a v3 con `«60 kg × 30 s»`). (3) `opts` al final en las tres firmas y
los seis montajes lo reenvían; entra a la checklist de W4.1.

1. **R15 y el E2E: el miembro de superserie con reloj es MOVILIDAD, no fuerza por tiempo.**
   R15 pide «en el miembro de superserie usar "Sin reps" para que el assert de DB `reps_done IS NULL` siga
   válido». Verificado en `scripts/seed-e2e-personas.mjs:500-518`: ese miembro tiene
   `exercise_type_override: 'mobility'` ⇒ por R3 nunca abre el prompt, y su fila no es la que el test 2
   asserta. La fila del assert (`reps_done IS NULL`, `hold_source = 'timer'`) es la del **bloque suelto**
   de fuerza por tiempo, que sí abrirá la sheet.
   **Propuesta**: aplicar «Sin reps» en el **bloque suelto** y **no** tipear 5 reps ahí. Así el test 2
   queda intacto (cero cambios en `:185-233`) y el paso 5 gana dos asserts nuevos: la sheet aparece y, al
   cerrarla, la línea sigue diciendo `10 kg × 5 s`. Si preferís cubrir el camino «Guardar», la variante es
   tipear las reps y cambiar el test 2 a `reps_done = 5` — pero pierde la cobertura de «cerrar sin
   guardar no borra nada», que es la regla más frágil del tren.

2. **R7 y el guion: `formatStrengthTimeSetLine` ya resuelve el caso sin reps.**
   R7 dice «`«60 kg × — · 30 s»` cuando reps es null: definir el guion». El helper existente
   (`packages/workout-engine/logged-set-summary.ts:204-216`) ya devuelve `«10 kg × 30 s»` sin reps, y es el
   mismo texto que el E2E asserta hoy (`tests/exec-hold-superset.spec.ts:175`) y el que la web pinta en el
   chip colapsado (`LogSetForm.tsx:1195-1201`, con su comentario de F1).
   **Propuesta (escrita así en el SPEC §4 R7)**: **no** inventar el guion y reutilizar el helper tal cual.
   Meter un `—` obligaría a tocar el motor, rompería el assert del E2E y crearía dos formatos para la
   misma serie. Si el mockup `6ead4180` v2 muestra el guion, el cambio sería solo de mockup.

3. **R4 y las firmas: `openSet` ya tiene tres argumentos, así que el nuevo es el cuarto.**
   El brief habla de «un tercer arg opcional». En HEAD `openSet` es `(blockId, setNumber, prefill?)`
   (`ExecutorV3.tsx:690`) y las pantallas tienen firmas distintas entre sí
   (`ExerciseScreenV3.tsx:149` vs `SupersetScreenV3.tsx:152`).
   **Propuesta**: `opts` va **al final** en las tres firmas (cuarto en `openSet`, segundo en la pantalla
   sola, tercero en la superserie) y los **seis** montajes de `ExecutorV3` (`:1683`, `:1762`, `:1799`,
   `:1828`, `:1859`, `:1890`) lo reenvían explícitamente. Los cinco montajes envueltos que hoy tiran el
   argumento extra son el punto exacto donde el `seed` se perdería en silencio: entran a la checklist de
   juicio de W4.
