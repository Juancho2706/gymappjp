---
status: active
owner: product-engineering
last_verified: "2026-09-12"
canonical: false
---

# TASKS — Reps tras el reloj

Ver [SPEC](SPEC.md) y [PLAN](PLAN.md). **Ningún checkbox se marca sin gate real o QA del owner.**

Reparto de archivos: **ningún archivo aparece en dos workers** (PLAN §2). W1 escribe solo en
`packages/`, W2 solo en `apps/mobile/` + `tests/mobile/`, W3 solo en `apps/web/` +
`tests/exec-hold-superset.spec.ts`. Todo lo que dice «archivo:línea» está verificado contra HEAD
`7ade566c`.

Orden duro: **W0 → W1 → (W2 ‖ W3) → W4**.

---

## W0 · SDD y decisiones (Fable)

- [x] **W0.1 SDD escrito.** `docs/specs/reps-tras-el-reloj/SPEC.md`, `PLAN.md` y `TASKS.md` con la
      arquitectura R1–R16, la matriz «cuándo se abre solo» (SPEC §5), el copy (§6), la analítica (§7),
      el backend (§8) y los 10 puntos del QA del owner (§10). Cada `archivo:línea` verificado contra
      HEAD.
      **Done:** los tres archivos existen y ninguna cita apunta a una línea inexistente.
- [ ] **W0.2 Commit previo del fix del share.** Los 5 archivos sueltos del working tree
      (`apps/mobile/components/alumno/share/ShareCanvas.tsx`, `StickerGestureLayer.tsx`,
      `WorkoutShareComposer.tsx`, `index.ts`, `share-types.ts`) salen **antes** de este tren en un
      commit `fix(share): …`, sin push.
      **Done:** `git status --porcelain` limpio en `apps/mobile/components/alumno/share/` y el commit
      existe en `rnmobiledenuevo`.
- [ ] **W0.3 Commit del SDD.** `docs(specs): SDD del tren «Reps tras el reloj»` en `rnmobiledenuevo`,
      sin push.
      **Done:** el commit contiene solo `docs/specs/reps-tras-el-reloj/*`.
- [x] **W0.4 Decisiones cerradas antes de repartir (12-09).** Los tres puntos de
      [PLAN §8](PLAN.md#8-hallazgos-del-writer-y-decisión-del-jefe-w04-cerrado-12-09) quedaron resueltos
      aceptando la propuesta del writer: (1) el E2E cierra la sheet del bloque suelto con «Sin reps» y el
      test 2 no se toca, (2) sin guion: `formatStrengthTimeSetLine` tal cual (mockup a v3),
      (3) `opts` al final en las tres firmas, reenviado por los seis montajes.
      **Done:** escritas en PLAN §8 y SPEC §4 R7; ningún worker arranca con una pregunta abierta.

## W1 · Motor (worker Sonnet)

Archivos: `packages/workout-engine/hold-autolog.ts`, `packages/workout-engine/keypad-flow.ts`,
`packages/workout-engine/hold-autolog.test.ts`, `packages/workout-engine/keypad-flow.test.ts`.
El barrel `packages/workout-engine/index.ts` ya re-exporta los dos módulos (`:28`, `:46`): **no se toca**.

- [ ] **W1.1 (R2) `captureGapsFor`.** Helper puro nuevo en `hold-autolog.ts`, junto a `holdSidesFor`
      (`:205`) y `mergeHoldCaptureValues` (`:234`):
      `captureGapsFor(values: Record<string, string>, kind: HoldModuleKind): Array<'weight' | 'reps'>`.
      `strength_time`: `'reps'` si las reps no son un entero > 0 (misma regla que `optionalReps`,
      `set-log-payload.ts:334`), `'weight'` si el peso no parsea (misma regla que `num`,
      `set-log-payload.ts:29`). `mobility`: `[]` siempre. Orden estable: reps antes que weight.
      **Done:** el helper es puro (cero imports de RN/Next), se exporta por el barrel existente y
      `pnpm vitest run packages/workout-engine/hold-autolog.test.ts` pasa con los 6 casos de
      [PLAN §5](PLAN.md#5-tests-por-capa-r15).
- [ ] **W1.2 (R5/R6) `KeypadTarget` gana `holdSource` y `prompt`.** En `keypad-flow.ts:29-84`, dos campos
      opcionales: `holdSource?: HoldSource | null` (para que la edición no degrade
      `metadata.hold_source` a `'manual'`) y `prompt?: 'hold-gap'` (para el copy de SPEC §6).
      `keypadStepsForTarget` (`:205-229`) **no cambia**: la rama `strengthTimeMode` de `:220-224` ya
      rutea bien.
      **Done:** `pnpm typecheck` y `pnpm --filter @eva/mobile exec tsc --noEmit` en 0; el test de
      `keypad-flow.test.ts` prueba que un target con los campos nuevos devuelve **exactamente** los
      mismos pasos que hoy.
- [ ] **W1.3 Tests del motor.** Casos de W1.1 + no-regresión de W1.2.
      **Done:** `pnpm vitest run packages/workout-engine` verde y sin tests saltados nuevos.

## W2 · RN (worker Opus)

Archivos en [PLAN §2](PLAN.md#2-reparto-de-archivos--ningún-archivo-aparece-en-dos-workers). Depende de W1.

- [ ] **W2.1 (R1) Timbre a 0.** En `use-hold-module.ts:257`, junto a `timerHaptics.holdDone()` y con el
      **mismo gate**, `playTimerCue('done')` **sin `force`** (`timers/sound.ts:148`). Actualizar el
      comentario de `:255-256` (la invariante W3.8/R31 «nunca suena» queda derogada para el hold) y el
      test `tests/mobile/executor-v3-hold-module.test.ts:367`.
      **Done:** el cue se dispara una sola vez en `expired` + foreground; **no** se dispara con
      `expiredWhileAway`, ni en `done-early`, ni con el mute activado (`sound.ts:149`); el test lo
      prueba por los cuatro caminos.
- [ ] **W2.2 (R2) `captureGaps` en el commit.** `HoldCommitInfo` (`use-hold-module.ts:93-98`) gana
      `captureGaps`, calculado con `captureGapsFor(values, a.kind)` sobre los **mismos** `values`
      mezclados de `:260-267` y enviado en `a.onCommit(payload, source, { ... })` (`:305-310`).
      **Done:** el test cubre single, `left` (siempre sin prompt porque no hay `submit`), `right` y
      movilidad.
- [ ] **W2.3 (R8) Candado limpio al cambiar `resetKey`.** Agregar `sentSetsRef.current.clear()`
      (`:184`) al efecto de reset (`:338-349`). `remeasure` (`:465-472`) no cambia `resetKey` ⇒ sigue
      conservando el candado.
      **Done:** test **por negación**: con el código viejo, cambiar `resetKey` y volver a vencer NO
      llama a `onCommit`; con el nuevo, sí. Los casos de auto-envío único por serie siguen verdes.
- [ ] **W2.4 (R4) Las pantallas deciden y abren.** `ExerciseScreenV3.commitSet(payload, info)`
      (`:236-250`, montaje `:440`) y `SupersetScreenV3.handleCommit(payload, source, info)`
      (`:365-372`, montaje `:534`) aplican la regla R3 y llaman a `onOpenSet` con
      `{ seed: payload, focus, prompt: 'hold-gap' }`. Las firmas de `onOpenSet`
      (`ExerciseScreenV3.tsx:149`, `SupersetScreenV3.tsx:152`) ganan el `opts` **al final**.
      **Done:** las cuatro condiciones de R3 se evalúan en un helper puro con test; con reps ya tipeadas
      o con `expiredWhileAway` no se abre nada.
- [ ] **W2.5 (R4) `ExecutorV3` propaga el `opts`.** `openSet` pasa a
      `(blockId, setNumber, prefill?, opts?)` (`:689-817`) y los **seis** montajes lo reenvían:
      `:1683` (superserie, directo), `:1762`, `:1799`, `:1828`, `:1859`, `:1890` (envueltos).
      **Done:** ningún montaje descarta el `opts` en silencio; revisado uno por uno en el juicio de W4.1.
- [ ] **W2.6 (R5) `openSet` aprende fuerza por tiempo.** Rama nueva **antes** de la clásica
      (`:767`): con `isStrengthTimeBlock(block, exercise)` el target lleva `strengthTimeMode: true`,
      `sideMode`, `isEdit: true`, `holdSource` (del seed o del log), `prompt`, `initialValues` sembrados
      **desde `opts.seed`** (nunca desde `sessionLogs`, riesgo 3 del PLAN) y, sin seed, desde
      `holdEditValues(sideMode, log)` (`v3/typed-screen-model.ts:215`); `initialFieldIndex` = índice del
      campo de foco en `keypadStepsForTarget` (0 `weight`, 1 `reps`).
      **Done:** editar una serie cerrada por reloj conserva `metadata.hold_source = 'timer'`; el teclado
      abre en REPS con los segundos ya puestos; el camino clásico de fuerza queda byte-idéntico.
- [ ] **W2.7 (R6) Tercera rama del `KeypadHost`.** En `KeypadHost.tsx:234-238`, `strengthTimeMode` ⇒
      `buildStrengthTimePayload(v, blockId, setNumber, { sideMode, holdSource: target.holdSource ?? 'manual' })`.
      `isEmptyCapture` (`:162`) en modo tiempo replica `SetRow.tsx:952-962` (el peso no cuenta). Copy de
      SPEC §6 cuando `target.prompt === 'hold-gap'`, con el secundario «Sin reps»
      (`accessibilityLabel` «Dejar la serie sin reps»).
      **Done:** test nuevo `tests/mobile/executor-v3-keypad-strength-time.test.ts` con el payload
      completo (`actual_hold_sec`, `reps_done`, `metadata.hold_source`); «Sin reps» cierra sin commitear
      y la serie guardada no cambia.
- [ ] **W2.8 (R7) Línea «Serie N».** `RestInterstitialData` (`v3/RestInterstitialV3.tsx:84-99`) gana
      `lastSet?: { line: string; onEdit(): void; onRepeat?(): void }`, alimentado desde el
      `interstitialDataRef` de `ExecutorV3.tsx:2042-2052` (sin tocar el registro de `:2063-2066`); con la
      pref OFF la línea va en `ExerciseScreenV3` encima de `RestOfferV3` (`:559-568`); en superserie solo
      «Editar». El texto sale de `formatStrengthTimeSetLine` (`logged-set-summary.ts:204-216`) **sin
      guion inventado**.
      **Done:** los callbacks leen refs estables (nunca capturan `sessionLogs`); la línea aparece con la
      pref ON dentro del descanso y con la pref OFF sobre el CTA, y desaparece al cambiar de serie.
- [ ] **W2.9 (R8) «Repetir».** `activeSet = repeatSet ?? firstUnlogged` (`ExerciseScreenV3.tsx:180`);
      `resetKey` con nonce (`:433`); siembra del hero desde el log por el carril `seedValues` (`:314`);
      `timers.cancelRest()` al repetir; `onCommitSet(payload, { repeat: true })` para que
      `ExecutorV3.handleCommit` (`:853-1109`) trate el re-commit como serie nueva pese a `wasLogged`
      (`:866`, `:1036`); `repeatSet` se limpia al commitear.
      **Done:** el reloj vuelve a 0:30 con «Iniciar serie», el segundo commit **reemplaza** la fila (no
      hay serie extra en `sessionLogs`), el descanso vuelve a arrancar y el test lo prueba.
- [ ] **W2.10 (R12) Analítica.** `hold_capture_prompted` y `hold_capture_resolved` los emite la
      **pantalla**; `hold_set_repeated`, el botón. Todo con `captureAppEvent`
      (`apps/mobile/lib/analytics.ts:157-164`), sin PII.
      **Done:** las propiedades son exactamente las de SPEC §7 y los tres eventos heredados
      (`use-hold-module.ts:286-304`, `:427-432`) no cambian de forma.
- [ ] **W2.11 Gates del worker.** `pnpm vitest run tests/mobile` (focalizado en los archivos tocados) y
      `pnpm --filter @eva/mobile exec tsc --noEmit`.
      **Done:** ambos en 0, con el resultado real anotado en el reporte del worker.

## W3 · Web (worker Opus)

Archivos en [PLAN §2](PLAN.md#2-reparto-de-archivos--ningún-archivo-aparece-en-dos-workers). Depende de W1.
Base: `apps/web/src/app/c/[coach_slug]/workout/[planId]/`.

- [ ] **W3.1 (R10) Sheet de captura en pantalla sola.** En `v3/ExerciseStepV3.tsx`, sheet gemela de la
      de `v3/SupersetStepV3.tsx:580-670`: `.exec-v3-settings` (`globals.css:5143-5148`, `z-index: 61`
      sobre el interstitial `z-index: 60` de `globals.css:4348-4355`), `role="dialog"` con nombre
      accesible **propio** (nunca «Descanso»), la `LogSetForm` de la serie N en `editing` con
      `existingLog`, foco programático en el input de REPS y el copy de SPEC §6 con el secundario
      «Sin reps».
      **Done:** la sheet se pinta encima del descanso; cerrarla no altera la serie guardada; el assert
      `dialog 'Descanso' count 0` del E2E sigue válido porque el nombre accesible es distinto.
- [ ] **W3.2 (R3) Apertura automática.** La abre `onMeasured` / `onLogged` (`v3/ExerciseStepV3.tsx:159-174`,
      `:248-250`) con las cuatro condiciones de R3, usando `captureGapsFor` del motor sobre los valores
      de la fila. En `v3/SupersetStepV3.tsx` se reutiliza `editBlockId` (`:161`) con foco en REPS.
      **Done:** los tres casos del test nuevo (abre / no abre con reps tipeadas / no abre con
      `expiredWhileAway`) pasan.
- [ ] **W3.3 (R10) `hold_source` sobrevive al re-submit.** `holdSourceRef` (`LogSetForm.tsx:508`) se
      siembra desde `existingLog.metadata.hold_source` cuando la fila abre en edición — hoy nace en
      `null` y el efecto de prefill se saltea con `isLogged` (`:623`), así que cada `LogSetForm` de la
      sheet perdería la marca al re-guardar (el UPDATE reemplaza el jsonb entero,
      `_actions/workout-log.actions.ts:177`).
      **Done:** caso nuevo en `LogSetForm.test.tsx` — re-submit de una serie cerrada por reloj ⇒
      `reps_done = '5'` y `metadata.hold_source = 'timer'`.
- [ ] **W3.4 (R7) Línea «Serie N».** `RestInterstitialData` (`v3/RestInterstitialV3.tsx:51-58`) gana
      `lastSet` y `WorkoutExecutionClient.tsx:2932-2934` lo alimenta en el
      `RestInterstitialDataProvider`; con la pref OFF la línea va bajo el anillo «¡Listo!», sobre
      `RestOfferV3` (`v3/ExerciseStepV3.tsx:359`); en superserie solo «Editar» (`v3/SupersetStepV3.tsx:473`).
      **Done:** mismo texto que RN (`formatStrengthTimeSetLine`) y misma regla de aparición.
- [ ] **W3.5 (R8) «Repetir» en pantalla sola.** Override local al step:
      `activeSetNumber = repeatSet ?? firstUnlogged` reemplazando los cinco usos de la prop dentro de
      `v3/ExerciseStepV3.tsx` (`:238`, `:247`, `:307`, `:320`, `:335`); corta el descanso con el
      equivalente de `useWorkoutTimer` (`:148`); `resetKey` con nonce (`:247`); el re-commit se trata
      como serie nueva en `WorkoutExecutionClient.handleLogged` (`:2166`). **No** se toca el cálculo de
      `firstUnlogged` del cliente (`WorkoutExecutionClient.tsx:2575-2576`).
      **Done:** repetir la serie N la vuelve activa con el reloj armado y el nuevo commit reemplaza la
      fila (upsert de `_actions/workout-log.actions.ts:180-191`), sin serie extra.
- [ ] **W3.6 (R12) Analítica web.** Los tres eventos de SPEC §7 con el `usePostHog()` que ya usa
      `v3/HoldModuleV3.tsx`, con `platform: 'web'`.
      **Done:** mismas propiedades que RN, sin PII.
- [ ] **W3.7 (R15) E2E W6.10.** Ajustar `tests/exec-hold-superset.spec.ts` según la decisión de W0.4 y
      [PLAN §6](PLAN.md#6-e2e-w610--qué-cambia-y-qué-no): tras el 0 del bloque suelto (paso 5,
      `:156-178`) assertar la sheet y cerrarla con «Sin reps» **antes** de los asserts de
      `10 kg × 5 s` (`:175`) y `rest-offer-strength-*` (`:176-177`). Los pasos 1 a 4 (`:130-154`) y el
      test 2 (`:185-233`) **no se tocan**.
      **Done:** el spec compila y su lectura deja claro por qué `reps_done IS NULL` sigue siendo el
      resultado esperado.
- [ ] **W3.8 Gates del worker.** `pnpm vitest run` focalizado en `LogSetForm.test.tsx`,
      `v3/ExerciseStepV3.test.tsx`, `v3/auto-rest-matrix.test.tsx`, `v3/HoldModuleV3.analytics.test.tsx`
      + `pnpm typecheck`.
      **Done:** ambos en 0, con el resultado real anotado en el reporte del worker.

## W4 · Juicio, gates y salida (Fable)

- [ ] **W4.1 Juicio de los diffs.** Los tres diffs contra R1–R16 y contra los 9 riesgos de
      [PLAN §4](PLAN.md#4-riesgos-y-mitigaciones): ningún archivo fuera de su lista, cero lógica de más,
      los seis montajes de `openSet` reenviando el `opts`, `hold_source` conservado en los dos lados,
      tests focalizados de verdad. Lo deficiente vuelve al **mismo** worker con archivo, línea y qué
      falta; nada se arregla «de paso» desde el jefe.
      **Done:** veredicto escrito por worker y cero devoluciones abiertas.
- [ ] **W4.2 Commit por wave.** `feat(engine):`, `feat(exec):` (RN) y `feat(exec):` (web), con los
      prefijos canónicos de la casa. Sin push.
      **Done:** un commit local por worker, cada uno compilando por su cuenta.
- [ ] **W4.3 Gates completos sobre el árbol final** (ninguna celda se llena sin ejecución real):

| Gate | Comando | Resultado real | Fecha |
|---|---|---|---|
| Tests | `pnpm test` | | |
| Typecheck web | `pnpm typecheck` | | |
| Typecheck mobile | `pnpm --filter @eva/mobile exec tsc --noEmit` | | |
| Lint | `pnpm lint` | | |
| Lint mobile | `pnpm lint:mobile` | | |
| Tokens | `pnpm check:tokens` | | |
| Docs | `pnpm docs:check` | | |
| Bundle mobile | `pnpm --filter @eva/mobile exec expo export --platform android` | | |

- [ ] **W4.4 Documentos canónicos.** `docs/status/CURRENT.md` (**≤ 16 KB**: el bloque de este tren entra
      **reemplazando** el del tren anterior, no sumando — lo valida `pnpm docs:check`),
      `docs/status/MOBILE_PARITY.md` (RN gana el timbre a 0 ⇒ paridad con web; «Repetir» en las dos
      plataformas o la divergencia declarada si se recortó) y `docs/testing/TEST_STATUS.md` (tests
      nuevos + resultado real de la suite).
      **Done:** `pnpm docs:check` OK y CURRENT bajo el tope.
- [ ] **W4.5 OK del owner.** Pedirlo con la tabla de gates llena y el resumen de los tres diffs.
      **Sin ese OK no se pushea nada.**
      **Done:** respuesta del owner citada en esta tarea.
- [ ] **W4.6 Salida.** Push de `rnmobiledenuevo` + `master` → deploy web → verificar READY → **una sola
      OTA 1.1.2 android + ios** que lleve el fix del share (W0.2) y este tren → anotar los dos ids de
      update → E2E `prod-suave`.
      **Done:** deploy READY, los dos ids de OTA anotados y el E2E con su resultado real.
- [ ] **W4.7 QA del owner (device + web).** Los 10 puntos de [SPEC §10](SPEC.md#10-qa-del-owner-r16--lista-cerrada).
      **Done:** los 10 verdes ⇒ SPEC y TASKS a `status: done` con commit `docs(specs):`.

## Backlog (no bloquea el cierre)

- [ ] «Repetir» en superserie (unidad = ronda, no serie).
- [ ] Borrar una serie ya guardada: no existe en ninguna plataforma; si el owner lo pide, es tren aparte.
- [ ] Live Activity de iOS para el hold.
- [ ] Prompt tras cerrar el lado izquierdo de `per_side` (hoy se espera al derecho, R3).
