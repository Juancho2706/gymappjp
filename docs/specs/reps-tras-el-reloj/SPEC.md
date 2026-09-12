---
status: active
owner: product-engineering
last_verified: "2026-09-12"
canonical: false
---

# SPEC — Reps tras el reloj

> Fuerza por tiempo: timbre a 0 en RN, teclado que se abre solo para pedir lo que falta, línea
> «Serie N · Editar · Repetir» y reinicio del reloj después de guardar.
>
> Origen: mensaje del owner del 2026-09-12 (§2). Mockup aprobado: artifact `6ead4180` v2
> («ok me parece bien», 12-09). Hereda el tren [cuenta-atras-en-pantalla](../cuenta-atras-en-pantalla/SPEC.md)
> (V1–V4, D5, R2, R6/R27, R24, R34 y la enmienda **F1** del 11-09) y **no reabre ninguna de esas
> decisiones**. Plan de ejecución en [PLAN.md](PLAN.md); tareas en [TASKS.md](TASKS.md).

Un solo tren: motor `@eva/workout-engine` + RN + web, un deploy web y una OTA sobre runtime 1.1.2.
**Cero migraciones y cero RPC** (§8).

---

## 1. El problema, con evidencia

En un bloque de **fuerza por tiempo** (`reps_unit = 'sec'` + `duration_sec > 0`, predicado
`isStrengthTimeBlock` en `packages/workout-engine/workout-exercise-type.ts:124`) el alumno sostiene
la carga con las dos manos: mientras corre el reloj **no puede anotar nada**. Lo que pasa hoy:

| Hecho | Dónde vive | Consecuencia |
|---|---|---|
| A 0 la serie se guarda sola (V2) con lo que hubiera en la fila | `use-hold-module.ts:274-311` (RN) · `v3/HoldModuleV3.tsx:159-178` (web) | La serie queda con `reps_done = NULL` y con el peso sugerido, aunque el alumno haya hecho otra cosa |
| Con la pref D5 ON el descanso arranca solo tras el guardado | `ExecutorV3.tsx:1054-1067` | El interstitial de descanso (`z-index: 60`, `globals.css:4348-4355`) **tapa** la fila: el alumno ni ve que le falta anotar |
| RN a 0 **vibra pero no suena** (invariante W3.8/R31) | `use-hold-module.ts:255-257` | Con la app en el bolsillo o la pantalla apagada no hay señal audible de que terminó |
| Después de guardar no hay forma de rehacer la serie | «Volver a medir» (`HoldModuleV3.tsx:225-238` RN, `v3/HoldModuleV3.tsx:277-280` web) existe **solo mientras corre** | Si el alumno se equivocó de carga o se cortó, no puede repetir: no hay reinicio ni borrado en ninguna plataforma |

La web **sí suena** a 0 desde el primer día (`v3/useExecCountdown.ts:105-106`: `playTimerSound` +
`triggerHaptic([200,100,400])` en `triggerDone`), así que esto es además una **brecha de paridad**.

F1 (11-09) devolvió el tile REPS al hero de fuerza por tiempo y lo dejó **opcional**
(`reps_done = int > 0 o NULL`, nunca `0`; con reps > 0 la serie cuenta para PR). Este tren cierra el
hueco que abrió: las reps existen pero el alumno no tiene manos para escribirlas a tiempo.

---

## 2. Decisiones del owner (literales del 12-09, no se reabren)

1. > «si uno hace el ejercicio de fuerza y tiene tiempo pues no le da chance de colocar las reps o kg que hizo».
2. Eligió la idea **C**:
   > «si tiene descanso automático, igual avisar con un sonido (como el del descanso) cuando se termine el tiempo de ejercicio de fuerza, para que vea que tiene que anotar kg y reps (si no lo ha anotado) o sea si lo anotó esos dos antes de darle play al ejercicio pues debería seguir como ahora».
3. > «Dejo que tomes la decisión, arma SDD y ten en cuenta todo al hacerlo: front y back end y UI/UX».
4. > «igual debería tener la opción de reiniciar el contador de tiempo que tiene allí en ejercicio de fuerza».
5. Mockup aprobado con la adición del punto 4: artifact **`6ead4180` v2** (4 frames RN con la pref ON,
   2 frames con la pref OFF y superserie, 1 frame web, tabla «cuándo se abre solo»).

---

## 3. Lo que ya existe (verificado en HEAD `7ade566c`)

### Motor `@eva/workout-engine`

| Pieza | Archivo:línea | Qué da a este tren |
|---|---|---|
| `decideHoldAutolog` | `hold-autolog.ts:129` | `submit`, `fillSeconds`, `holdSource`, `advance`, `advanceSide` |
| `holdSidesFor` | `hold-autolog.ts:205` | `per_side` ⇒ `['left','right']`; el resto ⇒ `['single']` (R34) |
| `mergeHoldCaptureValues` | `hold-autolog.ts:234` | Mezcla restaurado + tipeado + segundos del lado |
| `buildStrengthTimePayload` | `set-log-payload.ts:382-406` | `repsDone: optionalReps(values.reps)` (:399), `metadata` con `hold_source` (:392) |
| `KeypadTarget.strengthTimeMode` | `keypad-flow.ts:83` | Campo **ya declarado y sin ningún productor en RN** |
| `keypadStepsForTarget` | `keypad-flow.ts:205-229` | Rama `strengthTimeMode` (:220-224) ⇒ pasos `weight` → `reps` → `actual_hold_sec` (`keypad-flow.ts:137-141`) o los dos lados (`:155-160`) |
| `formatStrengthTimeSetLine` | `logged-set-summary.ts:204-216` | `«45 kg × 5 · 30 s»` con reps; `«10 kg × 30 s»` sin reps |
| `isStrengthTimeBlock` | `workout-exercise-type.ts:124` | Predicado único del modo tiempo |

### RN

| Pieza | Archivo:línea | Estado |
|---|---|---|
| Fin del hold | `v3/use-hold-module.ts:226-332` | Háptica solo en foreground (`:255-257`); auto-envío con candado `sentSetsRef` (`:184`, `:274`); `onCommit(payload, source, info)` (`:305-310`) con `HoldCommitInfo` (`:93-98`) |
| Reset por serie | `v3/use-hold-module.ts:338-349` | **No limpia `sentSetsRef`** (hallazgo (a) y riesgo 1 del [PLAN](PLAN.md)) |
| Re-medir | `v3/use-hold-module.ts:465-472` · botón `v3/HoldModuleV3.tsx:225-238` | Solo mientras corre (`api.started && !done`), conserva el candado |
| Pantalla sola | `v3/ExerciseScreenV3.tsx` | `activeSet = skipped ? null : firstUnlogged` (`:180`); `commitSet(payload)` (`:236-250`) descarta `info`; hero `ActiveSetRow` (`:300-333`) con `seedValues` (`:314`); `HoldModuleV3` (`:423-444`) con `onCommit={(payload) => commitSet(payload)}` (`:440`) y `resetKey={block.id}:{activeSet}:1` (`:433`); `onOpenSet: (setNumber) => void` (`:149`); `RestOfferV3` (`:559-568`) |
| Superserie | `v3/SupersetScreenV3.tsx` | `onOpenSet: (blockId, setNumber) => void` (`:152`); `handleCommit(payload, source?)` (`:365-372`); `HoldModuleV3` `size="ss"` (`:516-539`) |
| Orquestador | `v3/ExecutorV3.tsx` | `openSet(blockId, setNumber, prefill?)` (`:689-817`) — `typedTargetFor` (`:719`) devuelve `null` en strength_time ⇒ cae a la rama clásica (`:767-813`), que **no** siembra el hold ni pone `strengthTimeMode`; `handleCommit` (`:853-1109`) con `setKeypadTarget(null)` (`:857`), `holdSource` del payload (`:930`), `maybeStartRest()` (`:1075`) antes del `await logSet` (`:1077`) y `wasLogged` (`:866`) como llave del descanso; `keypadTypedContext` (`:831-841`) devuelve `undefined` sin `target.typed`; interstitial (`:2042-2058`, registro `:2063-2066`) |
| Teclado | `KeypadHost.tsx` | `Modal` nativo (`:286`); `commit()` (`:220-240`) con **dos** ramas (`typed` / `strength`); `isEmptyCapture` (`:162`); `doneLabel` (`:278`); botones `keypad-save-set` (`:439`) y `keypad-done`/`keypad-next` (`:495`) |
| Audio y háptica | `timers/sound.ts:148-185` (`playTimerCue`, mute en `:149`, timbre del alumno en `:158-171`) · `lib/haptics.ts:84` (`holdDone`) | Precedente: `timers/HoldTimer.tsx:70` usa `playTimerCue('done', { force: true })` |
| Cola y guardado | `lib/workout-session.ts:1018-1176` · `lib/offline-cache.ts:87-112` | Upsert por `client:block:set:día`, con purga de duplicados (§8) |

### Web (`apps/web/src/app/c/[coach_slug]/workout/[planId]/`)

| Pieza | Archivo:línea | Estado |
|---|---|---|
| Reloj | `v3/HoldModuleV3.tsx:144-209` | Única salida `onMeasured(...)` (`:167-178`, tipo `HoldMeasured` `:38-50`); candado `sentRef` por `${resetKey}:${side}` (`:162-164`) |
| Timbre a 0 | `v3/useExecCountdown.ts:92-111` | Ya suena y vibra (`:105-106`) — **sin cambios en este tren** |
| Pantalla sola | `v3/ExerciseStepV3.tsx` | `firstUnlogged` llega como **prop** (`:114`); `holdPrefill` (`:149`, limpieza `:151-153`); `HoldModuleV3` (`:238-253`); `LogSetForm` por serie (`:316-349`); `onLogged` (`:159-174`); `RestOfferV3` (`:359`). **No hay sheet de edición** |
| Superserie | `v3/SupersetStepV3.tsx` | Sheet de edición **ya existe**: `editBlockId` (`:161`), `editVM` (`:250`), `.exec-v3-settings` `role="dialog"` (`:592-595`), filas `LogSetForm existingLog` (`:617-660`); `lastHoldSourceRef` (`:155`, `:370`) |
| Fila | `LogSetForm.tsx` | Auto-submit del hold (`:621-636`, gate `holdPrefillNonce == null \|\| isLogged` en `:623`); `handleSubmit` rama tiempo (`:997-1021`) con `holdSource: holdSourceRef.current` (`:1010`); `holdSourceRef` (`:508`) **nunca se siembra desde `existingLog`**; `formIdentityKey` (`:1337`) y `key` del form (`:1357`); `ctaLabel` (`:1352`); `collapsed` (`:769`) |
| Interstitial | `v3/RestInterstitialV3.tsx:51-58` | `RestInterstitialData` llega por **contexto** (`:60-72`), poblado en `WorkoutExecutionClient.tsx:2932-2934`; `role="dialog" aria-label="Descanso"` (`:181-183`), `z-index: 60` (`globals.css:4348-4355`); `.exec-v3-settings` es `z-index: 61` (`globals.css:5143-5148`) ⇒ **la sheet se pinta encima del descanso** |
| Guardado | `_actions/workout-log.actions.ts:138-191` | SELECT por `(block_id, client_id, set_number, ventana del día)` → UPDATE + purga; `metadata` solo si viene (`:157`, `:177`) |

---

## 4. Requisitos

Cada requisito es un criterio verificable: si no se puede probar con un test o con un paso del QA
de §10, no es un requisito de este SPEC.

- **R1 · Timbre a 0 en RN (paridad con web).** En `use-hold-module.ts:finish`, junto a la háptica de
  `:257` y con el **mismo gate** (`reason === 'expired' && !away && AppState.currentState === 'active'`):
  `playTimerCue('done')` **sin `force`**. Un solo disparo, como la web (`triggerDone`), nunca la alarma
  repetida de `useRestTimerEngine.ts:207-216`. El timbre es el que el alumno eligió para el descanso
  (`getRestTimerSound`, `sound.ts:169`) y **respeta su silencio** (`sound.ts:149`) — divergencia
  deliberada con `HoldTimer.tsx:70`, que fuerza. Con «Listo» antes de 0 (`done-early`) **no suena**: el
  alumno ya está tocando la pantalla. La invariante W3.8/R31 («vibra y avisa, nunca suena») queda
  **derogada para el hold**: se actualiza el comentario de `:255-256` y el test
  `tests/mobile/executor-v3-hold-module.test.ts:367`. **Web: sin cambio de audio.**
- **R2 · Los huecos los calcula el motor.** Nuevo helper puro en `packages/workout-engine/hold-autolog.ts`:
  `captureGapsFor(values, kind): Array<'weight' | 'reps'>`. Para `kind === 'strength_time'`: `'reps'` si
  `optionalReps(values.reps) == null`, `'weight'` si `num(values.weight) == null`. Para `'mobility'`
  siempre `[]`. **El peso sugerido cuenta como anotado**: es lo que se guarda y queda a un toque en el
  mismo teclado. `HoldCommitInfo` (`use-hold-module.ts:93-98`) gana `captureGaps: Array<'weight'|'reps'>`.
- **R3 · Cuándo se abre el teclado solo (regla única, RN y web, pref ON u OFF, pantalla sola y
  superserie).** Se abre **si y solo si** las cuatro condiciones: (a) la serie se **envió**
  (`decision.submit`: `expired` o `done-early`, lado `single` o `right`); (b) `kind === 'strength_time'`;
  (c) `captureGaps.length > 0`; (d) **no** `expiredWhileAway`. Foco: `reps` si falta reps; si además
  falta el peso, el foco va a `weight`. Nada se abre en el **lado izquierdo** de `per_side`, en
  **movilidad**, ni cuando **venció con la app fuera** (R6/R27 heredados). La matriz completa está en §5.
- **R4 · Quién lo abre (RN).** `ExerciseScreenV3.commitSet(payload, info)` pasa a recibir el `info` del
  hook (hoy lo descarta en `:440`) y, tras `onCommitSet(payload)`, si aplica R3 llama
  `onOpenSet(setNumber, { seed: payload, focus, prompt: 'hold-gap' })`. `SupersetScreenV3.handleCommit(payload, source, info)`
  hace lo mismo con su `onOpenSet(blockId, setNumber, opts?)` (`:152`). La firma de `onOpenSet` gana un
  **tercer argumento opcional** en las dos pantallas y en `ExecutorV3.openSet` (compatible con los usos
  actuales de `ExecutorV3.tsx:1683`, `:1762`, `:1799`, `:1828`, `:1859`, `:1890`).
- **R5 · `openSet` aprende fuerza por tiempo.** Rama nueva **antes** de la clásica (`ExecutorV3.tsx:767`):
  si `isStrengthTimeBlock(block, exercise)`, el `KeypadTarget` lleva `strengthTimeMode: true`, `sideMode`,
  `isEdit: true`, `initialValues` sembrados desde `opts.seed` (el **payload**: `weightKg`, `repsDone`,
  `actualHoldSec` o `metadata.left_sec`/`right_sec`, `rpe`, `rir`, `note`) y, sin seed, desde el
  `existingLog` reutilizando `holdEditValues(sideMode, log)`
  (`v3/typed-screen-model.ts:215`); `initialFieldIndex` = índice del campo de foco dentro de
  `keypadStepsForTarget(target)` (0 = `weight`, 1 = `reps`); y **`holdSource`** = `metadata.hold_source`
  del seed o del log — **campo opcional nuevo en `KeypadTarget`** (`keypad-flow.ts`). Sin ese campo la
  edición degradaría la marca a `'manual'` y rompería el E2E W6.10 (`tests/exec-hold-superset.spec.ts:230`).
  El target lleva además un `prompt?: 'hold-gap'` opcional para el copy de R9.
- **R6 · `KeypadHost.commit` gana la tercera rama.** En `KeypadHost.tsx:234-238`:
  `target.strengthTimeMode ? buildStrengthTimePayload(v, target.blockId, target.setNumber, { sideMode: target.sideMode ?? null, holdSource: target.holdSource ?? 'manual' })`.
  `isEmptyCapture` (`:162`) aplica en modo tiempo la **misma regla que la fila**
  (`SetRow.tsx:952-962`): el peso **no** cuenta. La línea de objetivo del header se lee `4×30s · 60 kg`.
- **R7 · Línea «Serie N · 60 kg × 8 · 30 s · Editar · Repetir».** Aparece después de cerrar una serie de
  fuerza por tiempo:
  - **RN, pref ON**: dentro de `RestInterstitialV3`, bajo los controles del anillo. `RestInterstitialData`
    (`v3/RestInterstitialV3.tsx:84-99`) gana `lastSet?: { line: string; onEdit(): void; onRepeat?(): void }`,
    alimentado por `ExecutorV3` en el mismo `interstitialDataRef` de `:2042-2052` (el renderer se registra
    una sola vez, `:2063-2066`, así que la línea viaja por el ref, no por deps nuevas).
  - **RN, pref OFF**: en `ExerciseScreenV3`, encima de `RestOfferV3` (`:559-568`).
  - **RN, superserie**: solo «Editar» (sin «Repetir», ver R8), en la tarjeta del miembro hecho.
  - **Web**: la misma línea dentro de `RestInterstitialData` (contexto, `WorkoutExecutionClient.tsx:2933`)
    y bajo el anillo «¡Listo!» con la pref OFF.

  El texto lo arma `formatStrengthTimeSetLine` **tal cual está** (`logged-set-summary.ts:204-216`): sin
  reps la línea es `«60 kg × 30 s»`, sin guion inventado. «Editar» = R4/R5 con `focus: 'reps'` y sin
  `prompt`.
- **R8 · «Repetir» (solo pantalla sola, RN y web).** Es lo que pidió el owner en el punto 4 de §2:
  reiniciar el contador **después** de guardar. Reglas:
  - `activeSet = repeatSet ?? firstUnlogged` (RN `ExerciseScreenV3.tsx:180`; web sobre la prop
    `firstUnlogged` de `v3/ExerciseStepV3.tsx:114`).
  - Tocar «Repetir» pone `repeatSet = N`, **corta el descanso si corre** (`timers.cancelRest()` en RN;
    el equivalente de `useWorkoutTimer` en web), remonta el hero de la serie N con KG/REPS sembrados
    desde el log existente (RN vía `seedValues`, `ExerciseScreenV3.tsx:314`) y deja el módulo en `idle`
    («Iniciar serie») con un `resetKey` que incluya un nonce: `${block.id}:${N}:repeat:${nonce}`.
  - El hook **debe limpiar el candado** `sentSetsRef` al cambiar `resetKey` (hoy no lo hace,
    `use-hold-module.ts:338-349`). En web el candado ya es por `resetKey` (`v3/HoldModuleV3.tsx:162`) y
    se limpia solo.
  - El nuevo commit **reemplaza la misma fila** (upsert por bloque+serie+día en las dos plataformas, §8).
    Como `wasLogged` sería `true`, `handleCommit` no arrancaría el descanso (`ExecutorV3.tsx:866`,
    `:1036`): el commit de repetición viaja como `onCommitSet(payload, { repeat: true })` para que el
    descanso y la celebración lo traten como serie nueva. Web: igual en `onLogged`.
  - Al commitear se limpia `repeatSet`. Analítica `hold_set_repeated`.
  - **Fuera**: superserie (rondas) y borrar la fila.
- **R9 · Copy y UI del teclado.** Ver §6.
- **R10 · Web: el «teclado» es una sheet.** En `ExerciseStepV3` se agrega una sheet gemela de la de
  `SupersetStepV3` (`:580-670`): `.exec-v3-settings`, `role="dialog"`, `z-index: 61` — **encima** del
  interstitial de descanso (`z-index: 60`) — con la `LogSetForm` de la serie N en modo `editing`
  (`existingLog`), foco programático en el input de REPS, el copy de §6 y el secundario «Sin reps». Se
  abre sola bajo R3 y desde «Editar». En `SupersetStepV3` se reutiliza `editBlockId` (`:161`) con foco
  en REPS. El re-submit **conserva** `hold_source: 'timer'`: para eso `holdSourceRef` (`LogSetForm.tsx:508`)
  se siembra desde `existingLog.metadata.hold_source` cuando la fila abre en edición (hoy nace en `null`,
  y en la sheet de superserie cada `LogSetForm` es una instancia nueva). El mockup pinta una card inline:
  la sheet es la implementación equivalente, con el mismo contenido.
- **R11 · Backend: cero migraciones, cero RPC.** Ver §8.
- **R12 · Analítica.** Ver §7.
- **R13 · Fuera de alcance.** Ver §9.
- **R14 · Paridad y cierre.** Un solo tren: motor + RN + web. Salida: gates completos (`pnpm test`,
  `tsc` mobile, `typecheck`, `lint`, `lint:mobile`, `check:tokens`, `docs:check`, `expo export`), commit
  por wave, **push solo con OK del owner**, deploy web, OTA 1.1.2 android + ios, E2E `prod-suave`, QA del
  owner ⇒ `done`. El fix del «teletransporte» del share que está en el working tree
  (`apps/mobile/components/alumno/share/*`) sale en un commit **previo** `fix(share): …` y viaja en la
  misma OTA.
- **R15 · Tests obligatorios.** Ver [PLAN.md](PLAN.md) §5.
- **R16 · QA del owner.** Ver §10.

---

## 5. Estados y matriz «cuándo se abre solo»

`captureGaps` se evalúa con los valores **mezclados** que ya usa el auto-envío
(`mergeHoldCaptureValues`, `use-hold-module.ts:260-267`): lo restaurado + lo tipeado + los segundos del
lado. El peso sugerido, que la fila siembra en `captureRef` (`ExerciseScreenV3.tsx:231-235`), cuenta
como anotado.

| Situación | Timbre a 0 (RN) | Teclado / sheet solos | Línea «Serie N» |
|---|---|---|---|
| Reloj llega a 0 con **reps vacío** (KG sugerido puesto) | Sí | **Sí**, foco en REPS | Sí, con «Editar» y «Repetir» |
| Reps **tipeadas antes** de «Iniciar serie» | Sí | No (`captureGaps` vacío) | Sí |
| **«Listo» antes de 0** con reps vacío | No (el alumno ya está tocando) | **Sí**, foco en REPS | Sí |
| **Sin KG ni reps** (bloque sin peso objetivo) | Sí | **Sí**, foco en **KG** | Sí |
| **Vencido con la app fuera** (`expiredWhileAway`) | No (el canal es el aviso del SO) | **No** (R3 d) | Sí, con «Editar» y «Repetir» |
| **Por lado**, cierra el **izquierdo** | No (no venció la serie) | No | No (la serie no cerró) |
| **Por lado**, cierra el **derecho** con reps vacío | Sí | **Sí**, foco en REPS | Sí |
| **Movilidad** (cualquier caso) | Sí (R1 aplica a todo hold, como ya hace la web; hoy RN solo vibra) | **No** (`captureGapsFor` ⇒ `[]`) | No |
| **Mientras corre**: «Volver a medir» (ya existe) | — | No | No |
| **Después de guardar**: «Repetir» (nuevo) | Al siguiente 0, sí | Al siguiente 0, según las filas de arriba | Sí, y reemplaza la línea anterior |

Notas de estado:

- El descanso **sigue contando detrás** del teclado. Si termina con el teclado abierto, su alarma suena
  igual y el interstitial queda detrás hasta que el alumno cierre (RN: `KeypadHost` es un `Modal` nativo,
  `KeypadHost.tsx:286`, que se pinta sobre el overlay del `TimerProvider`; web: la sheet es `z-61` sobre
  el interstitial `z-60`).
- Cerrar sin guardar **no borra nada**: la serie ya quedó guardada con `reps_done = NULL` (V2 intacto).
- **Superserie**: el teclado se abre igual (R3) y el avance de miembro (V4) ocurre por detrás; el alumno
  cierra y sigue la ronda. «Repetir» no existe en superserie (R8/R13).
- El modal D5 de primera vez no puede aparecer con el teclado abierto: `autoRestModalVisible` ya exige
  `keypadTarget == null` (`ExecutorV3.tsx:521`).

---

## 6. Copy (R9)

Español latinoamericano neutro, tuteo, igual que el resto del ejecutor.

**Teclado RN / sheet web con `prompt: 'hold-gap'`:**

| Elemento | Texto |
|---|---|
| Eyebrow | `Serie 2 · guardada con 30 s` |
| Título (falta reps) | `¿Cuántas reps hiciste?` |
| Título (falta también el peso) | `¿Con cuánto peso?` |
| Pestañas | `KG 60` · `REPS —` · `SEG 30` |
| Botón secundario | `Sin reps` |
| Botón primario | `Guardar` |

- El secundario **cierra sin guardar** y equivale al scrim o a la X. `accessibilityLabel` /
  `aria-label`: `Dejar la serie sin reps`.
- Cuando falta el peso y no las reps, el secundario dice `Sin peso` con la etiqueta accesible
  `Dejar la serie sin peso`.
- Abierto desde «Editar» (sin `prompt`) el teclado conserva su cabecera de siempre y el primario es
  `Guardar` (`KeypadHost.tsx:278`, `isEdit: true`).

**Línea posterior al guardado (R7):** `Serie 2 · 60 kg × 8 · 30 s` + acciones `Editar` y `Repetir`.
Sin reps la línea es `Serie 2 · 60 kg × 30 s`. En superserie solo aparece `Editar`.

**«Repetir»:** `accessibilityLabel` / `aria-label` `Repetir la serie 2 desde el reloj`. Al tocarlo el
módulo vuelve a decir `Iniciar serie` con el reloj en el objetivo.

---

## 7. Analítica (R12 · PostHog, sin PII)

| Evento | Propiedades | Quién lo emite |
|---|---|---|
| `hold_capture_prompted` | `block_id`, `exercise_type: 'strength'`, `context: 'solo'\|'superset'`, `missing: string[]`, `trigger: 'timer'\|'manual'`, `platform` | Al abrir el teclado/sheet: la pantalla (RN) o el step (web) |
| `hold_capture_resolved` | `block_id`, `context`, `outcome: 'saved'\|'dismissed'`, `reps_filled: boolean`, `weight_changed: boolean` | Al cerrarse, por cualquiera de las dos vías |
| `hold_set_repeated` | `block_id`, `set_number` | Al tocar «Repetir» |

RN emite con `captureAppEvent` (`apps/mobile/lib/analytics.ts:157-164`); web con el `usePostHog()` que ya
usa `v3/HoldModuleV3.tsx`. Los eventos heredados `hold_timer_started`, `hold_timer_completed` y
`hold_early_finished` **no cambian de forma** (`use-hold-module.ts:286-304`, `:427-432`).

---

## 8. Backend (R11): cero migraciones, cero RPC

Ninguna columna nueva. `reps_done` pasa de `NULL` a entero > 0 y `metadata.hold_source` se conserva
`'timer'`. Un segundo commit de la **misma** serie **actualiza**, no duplica, en los tres caminos:

| Camino | Archivo:línea | Comportamiento |
|---|---|---|
| RN online | `apps/mobile/lib/workout-session.ts:1104-1173` | SELECT por `(client_id, block_id, set_number, ventana del día)` → UPDATE de la fila más reciente + `DELETE` de duplicados; un `23505` contra `workout_logs_one_set_per_day` se degrada a UPDATE |
| RN offline | `apps/mobile/lib/offline-cache.ts:87-112` + `apps/mobile/lib/offline-queue.ts:195-197` | `dedupKey = client:block:set:día`; re-encolar la misma serie **reemplaza** el item (last-wins). El drenaje (`offline-cache.ts:138-154`) repite el SELECT-then-UPDATE |
| Web | `_actions/workout-log.actions.ts:138-191` | SELECT por la ventana del día → UPDATE + purga de duplicados |
| Optimismo | `applyOptimisticSessionLog` (motor), usado en `workout-session.ts:1025` y `WorkoutExecutionClient.tsx:2192` | Dedup por bloque+serie preservando los ejes tipados |

Cuidado con el jsonb: `metadata` **reemplaza la columna entera** cuando viaja (RN `:1087`, web `:177`),
así que la marca `hold_source` y los lados `{left_sec, right_sec}` tienen que ir **en el mismo objeto**
(por eso R5 y R10 exigen sembrar el `holdSource` antes de re-guardar).

Con reps > 0 la serie entra a PR y tonelaje (F1, deseado): la celebración de PR puede dispararse en el
re-commit. Es aceptable y buscado.

---

## 9. Fuera de alcance (R13)

- Borrar series (no existe en ninguna plataforma y no se agrega).
- «Repetir» en superserie: la unidad de repetición ahí es la ronda, no la serie.
- Prompt tras cerrar el **lado izquierdo** de `per_side`.
- Live Activity de iOS.
- Cambiar la alarma repetida del descanso (`useRestTimerEngine.ts:194-219`).
- Cambiar V2, V3, V4 o D5 del tren heredado.
- Cambiar el audio de la web (ya suena desde `useExecCountdown.ts:105`).

---

## 10. QA del owner (R16) — lista cerrada

Device (RN) y navegador (web). Ninguna tarea de este SDD pasa a `done` sin estos diez puntos.

1. **Reps vacío, pref ON.** Fuerza por tiempo, tocar «Iniciar serie», dejar correr hasta 0: **suena** el
   timbre del descanso una vez y el teclado se abre en REPS **encima** del descanso. Escribir 8 y
   «Guardar» ⇒ la línea dice `Serie 1 · 60 kg × 8 · 30 s`.
2. **Reps tipeadas antes.** Escribir las reps antes de «Iniciar serie» y dejar llegar a 0: **suena** y
   **no** se abre nada (comportamiento de hoy).
3. **Pref OFF.** Mismo caso 1 con «Pasar solo al descanso» apagada: se abre el teclado y detrás quedan
   «Descansar N s» / «Siguiente serie».
4. **«Sin reps».** Cerrar con el secundario: nada se pierde, la serie sigue guardada con sus segundos y
   «Editar» la reabre con los valores puestos.
5. **«Repetir».** Tocar «Repetir» en la línea: el descanso se corta, la serie N vuelve a estar activa con
   el reloj en 0:30 y «Iniciar serie»; al llegar a 0 **reemplaza** la fila (no aparece una serie extra) y
   el descanso vuelve a arrancar.
6. **App en background.** Mandar la app al fondo antes de que el reloj llegue a 0: llega el aviso del SO,
   al volver **no** hay teclado abierto y la línea ofrece «Editar».
7. **Por lado.** Bloque `per_side`: al cerrar el lado **izquierdo** no pasa nada; al cerrar el **derecho**
   se abre el teclado en REPS.
8. **Superserie.** Miembro de fuerza por tiempo dentro de una superserie: se abre el teclado, «Sin reps»
   lo cierra y la ronda sigue su curso normal (V4 intacto).
9. **Web.** Los puntos 1 a 5 en el navegador, con la sheet en lugar del teclado.
10. **Silencio.** Con el mute del cronómetro activado en RN: **no suena**, pero **sí vibra**.

---

## 11. Referencias

- Mockup aprobado: artifact **`6ead4180` v2** («Reps tras el reloj», aprobado por el owner el 12-09).
- SDD heredado: [`docs/specs/cuenta-atras-en-pantalla/`](../cuenta-atras-en-pantalla/SPEC.md) — V1–V4 y
  D5 en §3, R1–R38 en §4 (en particular R2, R6, R24, R27, R34 y la enmienda F1 del 11-09).
- Tren anterior de la misma superficie: [`docs/specs/despegue-rapido/`](../despegue-rapido/SPEC.md) y
  [`docs/specs/arreglos-chicos-pre-ota/`](../arreglos-chicos-pre-ota/SPEC.md).
- E2E del caso canónico: `tests/exec-hold-superset.spec.ts` (W6.10) y su seed
  `scripts/seed-e2e-personas.mjs:499-551`.
