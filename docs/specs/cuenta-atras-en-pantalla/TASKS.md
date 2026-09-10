---
status: active
owner: product-engineering
last_verified: "2026-09-10"
canonical: false
---

# TASKS — Cuenta atrás en pantalla

Ver [SPEC](SPEC.md) · [PLAN](PLAN.md) · [DATA-TESTING](DATA-TESTING.md). Un solo tren (D1): rama
`rnmobiledenuevo`, **2 migraciones aditivas**, un deploy web y una OTA runtime **1.1.2**
android+ios. Cada tarea es de **≤ 1 día-agente** y tiene aceptación verificable; el total del tren es
de **≈ 12 días-agente** (**R38**): 11 del OUTLINE §7 + **0,25** del paso **M** de mockups (que el
propio R10 exige y el OUTLINE no presupuestaba) + **0,5** por W6 de 0,5 a 1 d-a + **0,5** por los
CTAs de **R24** en W3 y W4. Totales por wave: **W0** 1 · **W1** 2 · **W2** 2 · **W3** 2,75 ·
**W4** 2,25 · **M** 0,25 · **W5** 1 · **W6** 1 ⇒ **12,25 ≈ 12 días-agente**. Orden de recorte si no
cabe, en este orden: primero la **notificación del SO** de W3.6, después el **mapa muscular**
(R16, W1.9), después el **Playwright** del caso canónico (W6.10), que queda con causa anotada.

Modelo por tarea: **Opus** salvo las marcadas **[UI · Fable]**, que las implementa el jefe. Las de la
superserie, la movilidad y la fuerza por tiempo se apoyan en el **mockup v2 `bab4d4d3` ya aprobado**
(secciones A, B, C, D); las de W5 esperan el **mockup F** (paso M, R10).

Convención de estado: `[ ]` pendiente · `[x]` hecha. **Nada se marca verde sin ejecución real.**
Orden duro: W0 → W1 → (W2 ‖ W3 ‖ W4) → M → W5 → W6. Un solo orden de salida en todo el SDD
(**R35**): **W0 migra → W6 deploya → W6 OTA**. Las 2 migraciones se aplican en LIVE en **W0.9**
(aditivas puras, ningún cliente viejo escribe `'sec'`), nunca en W6.

---

## W0 · Decisiones del owner (2026-09-10) — 0 días-agente

- [x] W0.0 **Reglas del mockup v2** (mensaje literal del owner): **V1** el video/foto NUNCA se
      colapsa ni se quita — el reloj va DEBAJO del media y más chico (anillo ~80 px en superserie,
      ~130 px en fuerza por tiempo, 214 px en Movilidad sola) · **V2** al llegar a 0 el tiempo se
      ANOTA y se ENVÍA solo, sin que el alumno toque nada · **V3** en pantalla sola NUNCA se pasa solo
      al descanso ni al siguiente ejercicio ni a la siguiente serie: el alumno toca «Descansar N s» o
      «Siguiente serie» · **V4** dentro de una superserie SÍ se pasa solo al siguiente miembro de la
      ronda.
- [x] W0.0b **Decisiones D1–D5** (AskUserQuestion 10-09): **D1** todo en UN solo tren (A+B+C+D) ·
      **D2** el último hold de la ronda guarda y muestra «Ronda lista · Descansar N s»; el descanso de
      grupo arranca **cuando el alumno toca** · **D3** fuerza por tiempo vive DENTRO de Fuerza como
      selector «Reps | Segundos» (`duration_sec` + `reps_unit = 'sec'`), conservando carga, RIR,
      tempo, descanso, lado y progresión; **sin quinto tipo** · **D4** progresión en modo tiempo =
      «+ Peso» y «+ Segundos» (el eje `reps` se remapea a segundos por sesión); **doble progresión
      apagada** · **D5** preferencia del alumno «Pasar solo al descanso»: modal de una sola vez en el
      primer ejercicio de su primer entreno + toggle permanente en la tuerca (`ExecSettingsSheet`),
      persistida **por alumno**, por defecto **APAGADA** para quien recién entra.
- [x] W0.0c **Resoluciones del jefe R1–R23** (`OUTLINE.md` §2): D5 = el carril `autoTimer`
      re-encuadrado, per-alumno, con **default por cohorte** (R1) · `actual_hold_sec` + `reps_done
      NULL` + `actual_duration_sec NULL` para fuerza por tiempo (R2) · predicado único
      `isStrengthTimeBlock` con **AND** de `reps_unit === 'sec'` (R3) · **2 migraciones aditivas** y
      orden migraciones → deploy → OTA (R4) · el salto de paso se mantiene como hoy (R5) ·
      `expiredWhileAway` (nombre canónico desde R27): con vencimiento en background se guarda **el
      objetivo** y el lado 2 **no** arranca solo (R6) ·
      la edición del hold por lado entra al tren (R7) · visibilidad de la fila de captura en 3 estados
      (R8) · `pendingRoundRest` en el orquestador (R9) · mockup F antes de W5 (R10) · copys del builder
      y de D5 mandados por el mockup (R11, R11b) · **roller fuera** (R12) · `holdAnchor` fuera con la
      pérdida declarada (R13) · señal de primer entreno + `is_demo` (R14) · paridad del payload web
      (R15) · el hold de fuerza enciende el mapa muscular (R16) · `superset-rounds.test.ts` nuevo y
      baseline de CI rojo (R17) · háptica sí, notificación solo con permiso, **sin promesa de sonido**
      (R18) · 4 eventos PostHog + `tags.area='hold-autolog'` (R19) · waves y presupuesto (R20) ·
      A1 confirmado: arranque manual del primer lado (R21) · A2 confirmado: «Listo» antes de 0 guarda
      lo transcurrido con `hold_source='manual'` (R22) · CueBar sin gesto a 2400 ms (R23).
- [x] W0.0d **Resoluciones del jefe R24–R38** (`OUTLINE-16-RESOLUCIONES.md`; **mandan sobre R1–R23
      donde choquen**): **R24** con la pref **OFF** y `rest_time > 0`, tras cerrar cualquier serie
      (tocada o por reloj) se pinta el par **«Descansar N s»** (juicy) / **«Siguiente serie»**
      (secundario) en fuerza clásica, movilidad, fuerza por tiempo y fin de ronda («Ronda lista ·
      Descansar N s») — hoy **no existe** botón manual de descanso en V3 (RN solo tiene los dos
      `startRest` automáticos de `ExecutorV3.tsx:796` y `:830`; el `ManualTimerButton` web vive solo en
      la barra legacy `!execV3Active`, `WorkoutExecutionClient.tsx:296` usado en `:2995-2998`) ·
      **R25** el default de la pref sale de una constante única `AUTOREST_DEFAULT_STRATEGY = 'cohort'`
      en `auto-rest-pref.ts` (RN y web) ⇒ «OFF global» es **una línea** + una fila de test ·
      **R26** la fila del miembro activo **nunca se desmonta** con el módulo montado (se oculta con
      `hidden`+`inert` en web y `display: 'none'` en RN) · **R27** `expiredWhileAway` **reemplaza** a
      `viaAppState` y los hooks ganan **`prime(seconds)`** · **R28** `pendingRoundRest` lleva el
      `RestRoundContext` completo, construido **en el commit**; en web el rótulo «Ronda N de M» viaja
      en `label` (no hay `countKind`) · **R29** el módulo de hold se monta **solo** si hay reloj que
      montar (`duration_sec > 0` en movilidad o `isStrengthTimeBlock`); sin duración, la fila manual de
      hoy queda intacta (CA-90) · **R30** «rep/ses» → **«seg/ses»** en los 5 lugares que quedan ·
      **R31** el criterio de salida es **«vibra y avisa»**, nunca «suena» · **R32** el modal D5 se
      dispara **después** del Despegue, `clientId` nulo ⇒ **sin modal**, `is_demo` desde el fetch raíz
      del alumno · **R33** `.exec-v3-holdwrap`/`.exec-v3-holdnum` son de cardio y **no se tocan**: el
      módulo usa `.exec-v3-holdmod` con `--exec-hold-size` · **R34** una sola regla de lados,
      `holdSidesFor(sideMode)` · **R35** M1 y M2 **se aplican en W0**, no en W6 · **R36**
      `readAutoRestPref` síncrona con caché hidratada una vez con `clientId` · **R37** la rama
      `per_side` de fuerza por tiempo en web es **código nuevo**, no documentación · **R38**
      presupuesto **≈ 12 días-agente** con su orden de recorte.
- [x] W0.0e **Supuestos del brief con su veredicto**: A1 ✅ confirmado (R21) · A2 ✅ confirmado (R22) ·
      A3 ✅ `metadata.hold_source ∈ {'timer','manual'}` en **todo** hold guardado (movilidad incluida),
      y `undefined` = log anterior al tren, **nunca** «manual» · A4 ✅ sin PR/e1RM en modo tiempo, sale
      gratis del filtro `reps_done > 0` de `pr-detect.ts` · **A5 ❌ REFUTADO**: el CHECK
      `workout_blocks_poly_check` no admite `'sec'` ⇒ hay 2 migraciones · A6 ✅ Android sin código, el
      copy queda preparado y **no aplicado** · A7 ✅ una sola pref por alumno; sin `rest_time` no hay
      nada que arrancar · A8 ✅ primer entreno = bundle vacío (`previousHistory` + `exerciseMaxes` +
      `sessionLogs`), 0 queries.
- [x] W0.0f **Preguntas abiertas al owner que NO bloquean** (van en el mensaje final del plan):
      **Q1** default de la preferencia: por cohorte (recomendado) vs OFF global para todos — con
      **R25** responder «OFF global» cuesta **una línea** (`AUTOREST_DEFAULT_STRATEGY = 'off'`) más la
      fila del test de cohortes que ya cubre la variante, así que no bloquea ninguna wave ·
      **Q2** salto de paso tras la última serie guardada por reloj: se mantiene (recomendado) vs se
      frena · **Q3** mapa muscular con hold de fuerza: entra (recomendado) vs no · **Q4** roller:
      fuera (recomendado) vs entra con +1 día-agente.
      **Respondidas por el owner el 2026-09-10 (tarde, sesión «Asistente Principal»): «Ok, a todo»: SDD
      APROBADO y Q1 = A (cohorte) · Q2 = A (el salto de paso se mantiene) · Q3 = A (mapa muscular
      entra) · Q4 = A (roller fuera). Delegó al jefe toda decisión menor «con las recomendadas». El tren
      se ejecuta en esta sesión, no en la del orquestador que escribió el plan.**

---

## W0 · DB y schemas — 1 día-agente · **Opus**

- [x] W0.1 **(jefe, 10-09)** `supabase/migrations/20260910205046_workout_blocks_reps_unit_sec.sql` — dry-run con prueba positiva y negativa OK (DATA-TESTING §0.5). Original:
      `DROP CONSTRAINT IF EXISTS workout_blocks_poly_check` + `ADD CONSTRAINT` con la **definición
      vigente copiada literal desde LIVE** (`SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE
      conname = 'workout_blocks_poly_check'`), única diferencia
      `reps_unit = ANY (ARRAY['reps','passes','breaths','jumps','floors','sec'])`. Patrón exacto:
      `supabase/migrations/20260725221804_cardio_modality_axes.sql:49-65` (ya hizo esto para `'jumps'`
      y `'floors'`, con el comentario «Se recrea el constraint completo con la MISMA definicion
      vigente + el superset»). Timestamp = el siguiente disponible, confirmado con `list_migrations`;
      **jamás editar una migración aplicada**. Rollback en la cabecera:
      `UPDATE public.workout_blocks SET reps_unit = NULL WHERE reps_unit = 'sec'` + recrear el
      constraint sin `'sec'`. **Aceptación**: dentro de una transacción, `SELECT count(*) FROM
      workout_blocks WHERE reps_unit NOT IN (...)` ⇒ **0**; **prueba positiva del CHECK dentro de la
      misma transacción**: se crea un bloque temporal (`INSERT` sobre un plan del **alumno E2E**,
      jamás sobre datos de Movens ni de un alumno real), se prueba el `UPDATE … SET reps_unit='sec'`
      y se hace `ROLLBACK` ⇒ en LIVE persiste **solo** la migración, la prueba positiva **no deja
      filas**; el `ROLLBACK` queda registrado con su salida real en `DATA-TESTING.md`.
- [x] W0.2 **(jefe, 10-09)** `supabase/migrations/20260910205101_get_client_exercise_prs_reps_filter.sql` — ACL idéntica, `EXPLAIN` sin plan peor (DATA-TESTING §0.5). Original:
      `CREATE OR REPLACE FUNCTION public.get_client_exercise_prs(...)` sobre el linaje vigente, con
      `AND wl.reps_done IS NOT NULL AND wl.reps_done > 0` en el `WHERE`. Hoy filtra **solo** por
      `weight_kg > 0` ⇒ un hold con disco entraría como récord «20 kg × 0 reps»
      (`reps_at_max = COALESCE(reps_done, 0)`). Misma firma, mismos grants (`REVOKE`/`GRANT` del
      linaje reponidos). **Aceptación**: `has_function_privilege` confirma la ACL idéntica a la previa;
      un log con `weight_kg = 10, reps_done = NULL` deja de aparecer; `EXPLAIN` antes/después sin plan
      peor.
- [x] W0.3 **(worker Opus, 10-09: `'sec'` + doc; test acepta `'sec'`/rechaza `'minutos'`)**  `packages/schemas/workout.ts:64`: `REPS_UNIT_VALUES` += `'sec'` y actualizar el
      doc `:58-63`, que declara ser «superset EXACTO del CHECK» y debe seguir siéndolo (nombrar la
      migración de W0.1). **Aceptación**: caso en `packages/schemas/workout.test.ts` que acepta
      `reps_unit: 'sec'` y sigue rechazando `'minutos'`.
- [x] W0.4 **(worker Opus, 10-09: `hold_source` enum cerrado, 6 casos)**  `packages/schemas/workout.ts:301-320`: `WorkoutLogSetSchema.metadata` +=
      `hold_source: z.enum(['timer','manual']).nullable().optional()`. **Sin esto Zod v4 estripa la
      clave y `hold_source` nunca llega a la DB por el camino web** — el propio archivo lo documenta
      en `:293-297` (por eso hubo que declarar `skipped`/`skip_reason`). **Aceptación**: test que
      parsea `{left_sec:30, right_sec:30, hold_source:'timer'}` y verifica que **las tres** claves
      sobreviven; `hold_source:'otro'` se rechaza; un `metadata` con una clave desconocida se sigue
      estripando.
- [x] W0.5 **(worker Opus, 10-09: rama independiente + `STRENGTH_TIME_MIN_SEC`/`MAX_SEC` exportadas)**  `packages/schemas/workout.ts:163-190`: `superRefine` nuevo — con
      `reps_unit === 'sec'`, `duration_sec` debe existir y estar entre **5 y 600** (R11). No toca la
      rama de cardio. **Aceptación**: `{reps_unit:'sec', duration_sec:3}` y `{…, duration_sec:900}`
      fallan con `path: ['duration_sec']`; `{…, duration_sec:30}` pasa; un bloque de cardio valida
      byte-idéntico.
- [x] W0.6 **(worker Opus, 10-09: los dos enums juntos; el espejo web además recupera `'jumps'`/`'floors'` que le faltaban)**  `packages/plan-builder/types.ts:22` (`RepsUnit`) y su espejo
      `apps/web/src/domain/workout/types.ts:34`: += `'sec'`. Los dos se mueven **juntos** o el builder
      web no compila. **Aceptación**: `pnpm typecheck` verde.
- [x] W0.7 **(worker Opus, 10-09: `stripFieldsForStrengthMode` idempotente estricto, `progression_mode` `?? null`; 14 casos)**  `packages/plan-builder/block-type-fields.ts` (tras `:114`): nuevo export
      `stripFieldsForStrengthMode(block, mode: 'reps' | 'sec', durationSec?)`. `'sec'` ⇒
      `{duration_sec, reps_unit:'sec', progression_mode: block.progression_mode === 'double' ?
      'weekly_linear' : block.progression_mode}`; `'reps'` ⇒ `{duration_sec: null, reps_unit: null}`.
      **Siempre `null` explícito, nunca `undefined`** (regla documentada en `:12-17`: en RN un
      `undefined` es no-op y `_raw` repone el valor viejo). **No toca** `sets`, `target_weight_kg`,
      `rir`, `tempo`, `rest_time`, `warmup_rest_time`, `side_mode`, `superset_group`, `notes`,
      `instructions` (D3). **`reps_value` NO se escribe** (R3: sin consumidores verificados).
      Idempotente: llamarlo con el modo actual no reescribe nada (mismo criterio de
      `stripFieldsForType:112`). **Aceptación**: `packages/plan-builder/block-type-fields.test.ts` con
      round-trip reps→sec→reps que verifica `null` explícito (no `undefined`) y que
      `stripFieldsForType(strength→mobility)` sobre un bloque en modo tiempo **limpia `reps_unit`**.
- [x] W0.8 **(jefe, 10-09, salida real en DATA-TESTING §0.5)** Protocolo LIVE de las 2 migraciones (regla del owner: **tx-rollback primero**):
      transacción con el `DROP`+`ADD`, conteo de filas en violación, `INSERT` del bloque temporal del
      alumno E2E + `UPDATE … reps_unit='sec'` de prueba positiva, `EXPLAIN` de
      `get_client_exercise_prs`, `ROLLBACK`. **Aceptación**: la tabla del protocolo queda escrita en
      `DATA-TESTING.md` con la salida real y **sin filas nuevas** en LIVE.
- [x] W0.9 **(jefe, 10-09: LIVE `20260910205046` + `20260910205101`, verificadas)** **Aplicar M1 y M2 en LIVE, en W0** (**R35**), inmediatamente después del
      tx-rollback de W0.8. **Decisión única**: si se aplicaran recién en W6, durante **W2/W3/W4**
      cualquier guardado real con
      `reps_unit = 'sec'` devolvería **23514** y —como el builder guarda **el programa completo**— se
      perdería el **plan entero**, dejando sin poder ejecutarse W2.5 (round-trip guardar→leer) y el
      punto 6 del Playwright §6.5. Aplicarlas en W0 es seguro y **sigue respetando R4** (migraciones
      **antes** del deploy y de la OTA): son **aditivas puras** (0 filas afectadas según §1.2) y
      **ningún cliente viejo puede escribir `'sec'`** (§0.2). **Aceptación**: las 2 aparecen en
      `list_migrations` con su timestamp; `has_function_privilege` confirma la ACL de
      `get_client_exercise_prs` idéntica a la previa. **M2 cambia récords ya listados** (617 filas, 25
      alumnos, **72 pares afectados**): se aplica igual en W0 y se avisa con **una línea del aviso
      general a coaches** del cierre (W6.14), **sin mensajes individuales** (**R35**). El orden queda
      declarado igual en PLAN, TASKS y DATA-TESTING: **W0 migra → W6 deploya → W6 OTA**.

**Gate de W0** — corrido 10-09: `vitest` packages/schemas + packages/plan-builder **13 archivos / 298 tests verdes** (35 nuevos), `pnpm typecheck` 0, `tsc --noEmit` mobile 0, eslint 0 en los 4 archivos. Comando: `pnpm exec vitest run packages/schemas packages/plan-builder` (⚠ **no existe**
`pnpm --filter @eva/schemas test`: esos paquetes no tienen script `test`; los tests de `packages/**`
corren bajo el project `web-node`, `vitest.config.ts:55,86-90`).

---

## W1 · Motor compartido (`@eva/workout-engine`) — 2 días-agente · **Opus**

- [ ] W1.1 **(Opus)** `packages/workout-engine/hold-autolog.ts` (**nuevo**): `HoldEndReason =
      'expired' | 'done-early' | 'paused' | 'restart'`, `HoldAutologDecision`,
      `decideHoldAutolog({reason, elapsedSec, prescribedSec, side, context, closesRound, expiredWhileAway})`
      — ⚠ el campo del OUTLINE §4 se llamaba `viaAppState`; se **renombra a `expiredWhileAway`** porque
      la señal se deriva de la evidencia (`endAtMs` vencido / app o pestaña no visible), **nunca** de
      quién disparó el fin (W3.1a / W4.1). El **estado** homónimo del módulo de hold (`restart` en el
      diagrama de SPEC §7) se rotula **`re-medir`** para no colisionar con `CountdownApi.restart`; el
      miembro `'restart'` de `HoldEndReason` **no cambia** (es nombre canónico, OUTLINE §10)
      ⇒ `{fillSeconds, submit, holdSource, advanceSide, autoStartNextSide, advance}`, con la tabla
      canónica del `OUTLINE.md` §4. **Reusa** el acumulador de reloj de pared de
      `cardio-autolog.ts:84-116` (tipo-agnóstico, se re-exporta con alias neutro; **no se duplica**),
      el tope `min(elapsed, prescribed)` de `:64-70` y el `elapsed <= 0 ⇒ NO_OP` de `:64`. **El motor
      NUNCA arranca descansos.** No toca cardio. **Test**:
      `packages/workout-engine/hold-autolog.test.ts` (nuevo) con las 8 filas — `expired` solo ⇒
      `{submit:true, holdSource:'timer', advance:'stay'}` (V2+V3); `expired` superserie sin cerrar
      ronda ⇒ `advance:'next-member'` (V4); cerrando ronda ⇒ `advance:'stay'` (D2); `done-early` ⇒
      `holdSource:'manual'` con lo transcurrido (A2/R22); `paused` ⇒ `submit:false`; `restart` ⇒
      `fillSeconds:null`; `elapsed <= 0` ⇒ no-op; **volver de background con 300 s en un hold de 30 ⇒
      `fillSeconds: 30`**; `per_side` lado izquierdo ⇒ `submit:false`; `expiredWhileAway:true` ⇒
      `autoStartNextSide:false` (R6), probado con **los dos** caminos de disparo (tick y evento de
      visibilidad) exigiendo el mismo resultado.
- [ ] W1.2 **(Opus)** `packages/workout-engine/hold-autolog.ts`: hermana `mergeHoldCaptureValues`,
      espejo de `mergeCardioCaptureValues` (`cardio-autolog.ts:212-232`), para que **la semilla de la
      fila y el payload del auto-envío sean la MISMA mezcla** — el drift que ese comentario documenta
      como ya vivido en cardio (`:205-207`). **Test**: en `hold-autolog.test.ts`, semilla y payload
      coinciden para bilateral y `per_side`.
- [ ] W1.3 **(Opus)** `packages/workout-engine/set-log-payload.ts` (tras `:281`): export nuevo
      `buildStrengthTimePayload(values, blockId, setNumber, ctx?: {sideMode?, holdSource?})` ⇒
      `weightKg` (con coma es-CL), **`repsDone: null`** (nunca 0), `actualHoldSec` (**suma L+R** en
      `per_side`), **`actualDurationSec` ausente** (es el eje de cardio/roller: usarlo metería el hold
      en `totalCardioDurationSec`, `session-summary.ts:251`), `rpe`, `rir`, `note`, y `metadata`
      **solo** si hay lados o `holdSource` (misma convención de `:279`). Interna
      `strengthHoldValues(values, sideMode)` que reusa la lógica de la rama mobility `per_side` de
      `typedLogValues` (`:121-130`). **Test**: `set-log-payload.strength-time.test.ts` (nuevo) — 5
      casos, incluido «sin `holdSource` ⇒ el payload NO gana la key `metadata`».
- [ ] W1.3b **(Opus)** `packages/workout-engine/set-log-payload.ts` — **`hold_source` también en
      MOVILIDAD** (CA-28, CA-84): hoy `buildTypedPayload` define `metadata` **solo** en la rama
      `per_side` de movilidad (`:120-136`, propagada en `:205-208`) y `TypedPayloadContext`
      (`:140-150`) solo conoce `hrMetadata` ⇒ sin este cambio los **32 holds de movilidad** de Movens
      saldrían **sin marca**, CA-28 sería falso y la consulta de adopción (§8.2 / W6.3) quedaría ciega.
      Cambio: `TypedPayloadContext` gana **`holdSource?: HoldSource | null`** y `buildLogMetadata`
      (`:162-169`) lo mezcla con la **misma mecánica que `hr`** (`if (hr == null) return side` ⇒ pasa a
      contemplar los dos) ⇒ un hold **bilateral** gana `metadata: {hold_source}` y uno `per_side` gana
      `{left_sec, right_sec, hold_source}` en el **mismo objeto** (el UPDATE web reemplaza el jsonb
      entero). **Métrica única**: el **roller** también marca fuente — sin reloj en este tren (R12),
      su commit (`apps/mobile/components/alumno/workout/v3/RollerScreenV3.tsx:153`, hoy
      `buildTypedPayload('roller', values, block.id, activeSet, block.side_mode ?? null)`) pasa al
      contexto-objeto con **`holdSource: 'manual'` siempre**, para que la consulta de adopción (§8.2)
      no tenga un tercer estado sin explicar. **Test**: sin `holdSource` el payload de movilidad sigue
      **byte-idéntico** (no gana la key `metadata`); con `holdSource` bilateral la gana con una sola
      clave; el roller sale siempre con `'manual'`; los 30 asserts de
      `executor-mapping.parity.test.ts` siguen verdes.
- [ ] W1.4 **(Opus)** `packages/workout-engine/set-log-payload.ts:250-281`: **`buildStrengthPayload`
      NO se toca.** Está congelado por 30+ asserts (`set-log-payload.strength-side.test.ts`,
      `set-log-payload.per-side.test.ts`, `executor-mapping.parity.test.ts:290-330`). Motivo: reusar
      `buildTypedPayload` borraría el disco (`weightKg: null`, `:191`) y el esfuerzo (`rir: null`,
      `:199`). **Test**: test de **identidad byte a byte** del payload de un coach que solo usa reps.
- [ ] W1.5 **(Opus)** `packages/workout-engine/workout-exercise-type.ts`: tras `:46`
      `STRENGTH_TIME_REPS_UNIT = 'sec'`; tras `:95` **`isStrengthTimeBlock(block, exercise)`** =
      `effectiveExerciseType(...) === 'strength' && block.reps_unit === 'sec' && (block.duration_sec ??
      0) > 0` (**AND**, nunca OR) — fuente única, nadie compara `reps_unit === 'sec'` a mano.
      **Test**: `workout-exercise-type.test.ts` congela **H8** con los 2 bloques reales de LIVE:
      `{duration_sec: 600, reps_unit: null}` ⇒ **`false`** y `{duration_sec: 120, reps_unit: null}` ⇒
      **`false`**; `{reps_unit:'sec', duration_sec:30}` ⇒ `true`.
- [ ] W1.5b **(Opus)** `packages/workout-engine/` — **una sola regla de lados para el eje hold:
      `holdSidesFor(sideMode)`** (**R34**, CA-91). Para holds (movilidad y fuerza por tiempo):
      `per_side` ⇒ `['left','right']` (**una sola fila** por serie, `actual_hold_sec = L + R`, lados en
      `metadata`); `alternating` y `null` ⇒ `['single']`, exactamente como hace movilidad hoy
      (`apps/mobile/components/alumno/workout/v3/typed-screen-model.ts:146-148` ⇒ `['single']`;
      `packages/workout-engine/set-log-payload.ts:121-122` mira solo `sideMode === 'per_side'`).
      **Fuerza clásica no cambia**: `buildStrengthPayload` sigue tratando `alternating` por lado en el
      eje reps (`set-log-payload.ts:260-261`) y **no se toca** (CA-04). Consumidores obligados:
      `buildStrengthTimePayload` (W1.3), el `keypad-flow` de fuerza por tiempo (W1.7),
      `use-hold-module` (W3.2) y las dos UIs. **Test**: `holdSidesFor('per_side')` ⇒ 2 lados,
      `holdSidesFor('alternating')` y `holdSidesFor(null)` ⇒ `['single']`; **assert de paridad
      web↔RN** en W1.13 con la columna `alternating`, que hoy es justo donde las dos plataformas
      divergen.
- [ ] W1.6 **(Opus)** `packages/workout-engine/workout-exercise-type.ts:184-189` (rama strength de
      `legacyRepsSummaryFor`): devolver `compactDuration(duration_sec) + sideSuffix(side_mode)`
      **antes** del `if (block.reps?.trim())` de `:185`. Sin esto, un bloque que pasó de Reps a
      Segundos conserva `"8-12"` como espejo legacy en toda la app. Y tras `:217`:
      `formatStrengthTimeObjective(block)` ⇒ `"3 × 30s"` / `"3 × 30s por lado"`. `typedBlockSummary`
      (`:197-217`) **sin cambio** (con `reps = "30s"` la rama `:202` ya produce `"3×30s"`).
      **Test**: `legacyRepsSummaryFor` de un strength-time ⇒ `"30s"` / `"30s/lado"`, y de un strength
      clásico **sigue devolviendo el texto del coach**.
- [ ] W1.7 **(Opus)** `packages/workout-engine/keypad-flow.ts`: tras `:70` `strengthTimeMode?: boolean`
      en `KeypadTarget`; tras `:108` `STRENGTH_TIME_KEYPAD_STEPS = [weight, {key:'actual_hold_sec',
      mode:'integer', unit:'seg', label:'Segundos'}]` y `STRENGTH_TIME_PER_SIDE_KEYPAD_STEPS =
      [weight, hold_left_sec, hold_right_sec]` — **mismas keys que movilidad** (`typed-keypad.ts:102-103`);
      rama nueva en `keypadStepsForTarget` entre `:163` y `:164`. `packages/workout-engine/typed-keypad.ts`
      **CERO diff**: `TypedKeypadMode` no gana miembro y `typedTargetFor` (`:132-141`) sigue devolviendo
      `null` en strength. **Test**: `keypad-flow.test.ts` fija los 2 juegos de pasos y que
      `typedTargetFor` de un strength-time sigue siendo `null`.
- [ ] W1.8 **(Opus)** `packages/workout-engine/logged-set-summary.ts` (tras `:182`): export nuevo
      `formatStrengthTimeSetLine(log)` ⇒ `"10 kg × 30 s"`, `"10 kg × 30 s por lado"`, asimétrico
      `"10 kg × Izq. 30 s · Der. 25 s"`, sin peso `"30 s"`, sin hold `null`. Reusa `loggedSideSeconds`
      (`:76-83`). **`formatLoggedSetLine('strength') sigue devolviendo `null`** (`:154`, interruptor
      documentado en `:167-171`): **no se toca**. **Test**: `logged-set-summary.test.ts` con las 5
      formas + anti-regresión de que `formatLoggedSetLine('strength', …)` devuelve `null` **con y sin**
      `actual_hold_sec`.
- [ ] W1.9 **(Opus)** `packages/workout-engine/session-summary.ts`: `:35-45` (`SummaryBlock`) +=
      `reps_unit`; `:201-235` (rama strength, **R16**) un bloque en modo tiempo **no** aporta a
      `strengthVol` (`:233`, es una barra en kg) pero **sí** a `muscleWork` (`:234`) con el mismo proxy
      que movilidad usa en `:195` ⇒ la plancha con disco enciende el core. **Test**:
      `session-summary.test.ts` — `totalVolume === 0`, `strengthMuscleVolume` sin la fila del grupo,
      `muscleWork` **con** el aporte; un bloque strength clásico byte-idéntico.
- [ ] W1.10 **(Opus)** `packages/workout-engine/session-logs.reconcile.ts`: tras `:11`
      `export type HoldSource = 'timer' | 'manual'`; `:13-24` (`WorkoutLogSideMetadata`) +=
      `hold_source?: HoldSource | null`, con el doc de que **`undefined` = log anterior al tren
      (desconocido), nunca «manual»**, y de que el UPDATE web **reemplaza el jsonb entero**
      (`workout-log.actions.ts:150-156`) ⇒ `hold_source` viaja **en el mismo objeto** que los lados.
      `:38-41`, `:79`, `:116`, `:156-195` sin cambio (heredan por composición). **Test**:
      `session-logs.reconcile.test.ts` — un ítem de cola con `hold_source` sobrevive el merge y llega
      al `ReconciledSessionLog`.
- [ ] W1.11 **(Opus)** `packages/workout-engine/repeat-seed.ts:102`: strippear `hold_source` de la
      semilla (la fuente del hold de HOY se decide hoy). Precedente en el mismo archivo: la nota
      tampoco se siembra (`:10-12`). **Test**: `repeat-seed.test.ts` — una fila con
      `{left_sec:30, right_sec:30, hold_source:'timer'}` siembra los lados **sin** `hold_source`.
- [ ] W1.12 **(Opus)** `packages/workout-engine/superset-rounds.test.ts` (**nuevo — hoy no existe**;
      verificado: el paquete solo tiene `superset-rounds.ts`). V4 y D2 se apoyan enteros en
      `isRoundComplete` / `firstIncompleteInRounds` y no tienen test propio en el motor (la única
      cobertura viva es `tests/mobile/executor-v3-superset.test.ts`). **Aceptación**: con el caso
      canónico «Dia B», `isRoundComplete(members, 1, logs, 'blockA')` tras el hold del miembro de
      movilidad ⇒ `false`; tras el press pallof ⇒ `true`; **doble registro del mismo `(block,set)` da
      el mismo veredicto** (idempotencia); `buildRoundOrder` no cambia de salida.
- [ ] W1.13 **(Opus)** `packages/workout-engine/superset-holds.parity.test.ts` (**nuevo**): paridad
      del contrato completo con «Dia B» — `decideHoldAutolog` + `isRoundComplete` +
      `buildStrengthTimePayload`, con el mismo resultado esperado que produce el camino web (el objeto
      que la web manda a `logSetAction`), bilateral, `per_side` y **`alternating`** (**R15** + **R34**:
      el assert de paridad de lados vive acá, y `alternating` tiene que dar **un solo lado** en las dos
      plataformas). Formato de los 30 asserts existentes de `executor-mapping.parity.test.ts:290-330`.
- [ ] W1.14 **(Opus)** `packages/workout-engine/index.ts` (tras `:45`): `export * from './hold-autolog'`,
      junto a `cardio-autolog`. **Único wave que edita el barrel** (evita colisiones entre los workers
      de W2/W3/W4). **Aceptación**: `pnpm typecheck` y `tsc --noEmit` mobile verdes.
- [ ] W1.15 **(Opus)** `apps/web/src/lib/workout-exercise-type.ts:80-89,133-152`: **colapsar las
      copias** re-exportando `hasTypedPrescription`, `typedBlockSummary`, `isStrengthTimeBlock` y
      `formatStrengthTimeObjective` del motor, igual que ya se hizo con `legacyRepsSummaryFor`
      (`:126`). Sin esto hay que replicar la rama strength a mano ⇒ drift garantizado. **Test**: un
      caso que verifica que la copia web y el motor dan **la misma** salida para el bloque canónico.
- [ ] W1.16 **(Opus)** `apps/web/src/lib/workout/progression.ts:50-59` (`ProgressionBlockInput` +=
      `reps_unit`, `duration_sec`) y `:142-149` (**guard D4**: en modo tiempo `case 'double'` cae a
      `weekly_linear`). Es **obligatorio, no cosmético**: `parseRepsTop('30s')` devuelve **30**
      (`:42-48`, regex `\d+`) ⇒ hoy la doble progresión trataría 30 segundos como 30 reps y subiría el
      peso sola. Comentario en `:42` avisando que ese número no son reps. **Test**:
      `apps/web/src/lib/workout/progression.test.ts` — bloque `{reps:'30s', reps_unit:'sec',
      progression_mode:'double'}` con `repsDone:[null,null,null]` **NO** devuelve `holding`; un bloque
      de reps con `'double'` sigue byte-idéntico.
- [ ] W1.17 **(Opus)** Ampliar `packages/workout-engine/day-completion.test.ts` (+ fixtures) y
      `pr-detect.test.ts`: un log `{reps_done: null, actual_hold_sec: 30}` **cuenta como serie** y el
      día cierra en `done`; un set `{weight_kg: 10, reps_done: null}` ⇒ `isPR:false, kind:null` y **no
      altera `prevBest`** (congela A4). `day-completion.ts`, `cycle-completions.ts`, `pr-detect.ts` y
      `workout-save-reconcile.ts` quedan con **cero diff de código**.

**Gate de W1**:
`pnpm exec vitest run packages/workout-engine packages/schemas packages/plan-builder apps/web/src/lib/workout/progression.test.ts`.

---

## W2 · Coach: «Reps | Segundos» dentro de Fuerza — 2 días-agente · Opus (datos) + **Fable (UI)**

### Datos y validez (Opus)

- [ ] W2.1 **(Opus)** Extraer **`isBlockComplete(block, type)`** al motor y cablearlo en los **tres**
      guards que hoy copian la misma regla: `apps/web/src/app/coach/builder/[clientId]/components/BlockEditSheet.tsx:580-591`
      (rama strength `:590`), `apps/web/src/app/coach/builder/[clientId]/WeeklyPlanBuilder.tsx:945-959`
      (`:958`) y `apps/mobile/app/coach/program-builder.tsx:78-91` (`:90`). Regla nueva de strength:
      `sets >= 1 && (modoSeg ? duration_sec ∈ [5,600] : !!reps?.trim())`. Sin esto: **falso positivo**
      (el coach en modo segundos ve «Datos incompletos» y no puede guardar) o **falso negativo** (un
      bloque sin reps y sin segundos se guarda). **Test**: los 3 call sites con el mismo fixture, más
      un caso «sin reps y sin segundos ⇒ incompleto».
- [ ] W2.2 **(Opus)** `WeeklyPlanBuilder.tsx:1017-1024` y `apps/mobile/lib/plan-builder/serialize.ts:84`:
      el **`reps` espejo** en modo tiempo se puebla con `legacyRepsSummaryFor(...)` (W1.6) en vez del
      texto del coach (web) o del fallback `'8-10'` (RN). `workout_blocks.reps` es **NOT NULL** y Zod
      exige `min(1)` (`packages/schemas/workout.ts:128`); además ese espejo es lo que salva la
      degradación de la app vieja. `duration_sec` (`WeeklyPlanBuilder.tsx:1056`) y `reps_unit`
      (`:1050`) **ya viajan**: cero cambios de mapper. **Test**: `tests/mobile/plan-builder-serialize.test.ts`
      y un caso web ⇒ el bloque guardado trae `reps: '30s'` / `'30s/lado'`.
- [ ] W2.3 **(Opus)** Conmutación de modo cableada a `stripFieldsForStrengthMode` (W0.7) en
      `BlockEditSheet.tsx:66-72` (`applyBlockTypeChange` es el hermano ya existente) y
      `apps/mobile/components/coach/BlockEditorSheet.tsx:161-165` (`patch()` es el canal único).
      Reps→Segundos: escribe `duration_sec` + `reps_unit:'sec'` y baja `progression_mode` `'double'` a
      `'weekly_linear'`; **no toca** `reps` en memoria (borrarlo dejaría al coach en «Datos
      incompletos» mientras tipea). Segundos→Reps: `null` explícito en ambas columnas y, si `reps`
      quedó con el resumen (`/^\d+(m\d+)?s$/`), proponer `'8-12'` sin pisar un texto propio del coach.
      **Test**: `tests/mobile/plan-builder-type-change.test.ts` y
      `tests/mobile/plan-builder-strip-roundtrip.test.ts` + `BlockEditSheet.test.tsx` — round-trip
      reps→sec→reps y **Fuerza·Segundos → Movilidad** sin residuos.
- [ ] W2.4 **(Opus)** Plantillas: `apps/web/src/app/coach/builder/[clientId]/components/TemplatePickerDialog.tsx:102-148`
      y `apps/web/src/services/workout/workout.service.ts:1372-1405` (`mapDbBlockToWorkoutInput`) **sin
      cambio de código**, pero **con test**: una plantilla con un bloque en modo tiempo se aplica y se
      sincroniza. ⚠ Sin `'sec'` en el enum (W0.3), re-validar esa plantilla **rompe el plan entero**,
      no solo ese bloque. **Test**: `duration_sec` + `reps_unit` sobreviven la copia de plantilla y el
      sync.
- [ ] W2.5 **(Opus)** `apps/web/src/services/workout/workout.service.ts:178-198` y
      `program-read-mappers.ts:50-106`: verificar (no tocar) que la whitelist `polymorphicBlockColumns`
      y el mapper de lectura ya incluyen `reps_unit` (`:185` / `:91`) y `duration_sec` (`:191` / `:97`).
      **Aceptación**: test de round-trip guardar→leer de un bloque en modo tiempo.

### Pantallas (UI · Fable — mockup v2 sección C, ya aprobado)

- [ ] W2.6 **[UI · Fable]** `BlockEditSheet.tsx:729-901`: grupo **«Prescripción»** con segmented
      **«Reps | Segundos»** encima del grid `:731`; en modo segundos la celda derecha pasa a
      **«Segundos por serie \*»** con `OptionalIntInput` (patrón exacto de movilidad `:1032-1037`),
      placeholder **«Ej. 30»**, hint **«el alumno ve la cuenta atrás»**, rango duro **5–600 s**. El
      segmented de tipo de ejercicio (`:673-727`) **no se toca** (D3: sin quinto tipo). Series, Peso
      Objetivo, RIR, Tempo, Recuperación, Descanso calentamiento y «Ejes adicionales» quedan **igual**.
      Hint del RIR en modo tiempo: «cuántos segundos quedan en el tanque».
- [ ] W2.7 **[UI · Fable]** `BlockEditSheet.tsx:1145-1230` (progresión, **D4**): «+ Peso» /
      **«+ Segundos»** (mismo `progression_type: 'reps'`, sin columna nueva); sufijo `rep/ses` →
      **`seg/ses`** (`:1190`); «¿Cómo sube el peso?» (`:1195-1222`) solo con
      `progression_type === 'weight'`; **doble progresión oculta** en modo tiempo (`:1207-1220`, su
      copy habla de rango de reps); `:1226` pasa a «Activa para subir el peso o los segundos
      automáticamente cada semana».
- [ ] W2.8 **[UI · Fable]** `apps/mobile/components/coach/BlockEditorSheet.tsx:322-376` y `:69-77`:
      mismo segmented sobre `:324`; en modo segundos `IntField` «Segundos por serie \*» sobre
      `duration_sec` (patrón de movilidad `:447`); la 3.ª opción de `PROGRESSIONS` (`:72`) se rotula
      **«Segundos»** (valor sigue `'reps'`), placeholder `1 (rep)` → **`1 (seg)`** (`:362`), nota de
      doble progresión (`:371`) oculta en modo tiempo.
- [ ] W2.9 **[UI · Fable]** Chips, preview y print:
      `apps/web/src/app/coach/builder/[clientId]/components/StudentLivePreview.tsx:73-86` (deja de
      pintar «Sin prescripción» en falso: rama strength en modo segundos ⇒ `3 × 30 s · 10 kg`),
      `components/ExerciseBlock.tsx:102-110,255-282` (chip `3 × 30s`),
      `apps/mobile/components/coach/BuilderBlockCard.tsx:88-93,155-177` (chip + badge de progresión
      **`↑{n}s`** en vez de `↑{n}r`), `components/PrintProgramDialog.tsx:112`
      (`3 series × 30 s`, hoy imprimiría «3 series × 30s reps»), y el **chip de lista «Por tiempo»**.
- [ ] W2.10 **[UI · Fable]** Ficha del coach — prescripción:
      `apps/web/src/app/coach/clients/[clientId]/ProgramTabB7.tsx:487-501` y
      `apps/mobile/components/coach/clientDetail/PlanTab.tsx:563-571` dejan de asumir
      `isTyped = kind !== 'strength'` ⇒ un bloque en modo tiempo muestra la fila «Objetivo» con
      `3 × 30 s` (hoy diría «Series × reps»). El SELECT ya trae `duration_sec`
      (`apps/web/src/services/client/client-detail.service.ts:129`).
- [ ] W2.11 **[UI · Fable]** Ficha del coach — logs: los **4 call sites** de la línea de serie pasan
      por `formatStrengthTimeSetLine` (W1.8) **dentro de su rama de fuerza**, conservando over/under,
      «PC» y RPE/RIR: `apps/web/src/app/coach/clients/[clientId]/TrainingTabB4Panels.tsx:680-693,739`,
      `apps/mobile/components/coach/clientDetail/AnalisisTab.tsx:607-637` (+ el gate
      `apps/mobile/lib/coach-client-detail.ts:1292`),
      `apps/web/src/app/c/[coach_slug]/workout/[planId]/LogSetForm.tsx:960` y
      `apps/mobile/components/alumno/workout/SetRow.tsx:454`. Sin esto un hold de fuerza se pinta
      como «10 kg × —».
- [ ] W2.12 **[UI · Fable]** Copys de error del guardado:
      `WeeklyPlanBuilder.tsx:960` ⇒ «Hay ejercicios con datos incompletos (revisa series,
      repeticiones o segundos, duración o distancia).» y `apps/mobile/app/coach/program-builder.tsx:1939`
      ⇒ «Revisa "X": faltan datos (series y reps o segundos, duración o distancia según el tipo).»
- [ ] W2.13 **[UI · Fable]** **«rep/ses» → «seg/ses» en los 5 lugares que quedan** (**R30**): el
      sufijo de progresión de `BlockEditSheet.tsx:1190` ya lo cubre W2.7, pero el mismo texto vive en
      otros **5** archivos y **dos de ellos son de cara al alumno**, no del coach:
      `apps/web/src/app/c/[coach_slug]/workout/[planId]/WorkoutExecutionClient.tsx:749` y su espejo RN
      `apps/mobile/components/alumno/workout/workout-ui.ts:31`, más
      `apps/mobile/lib/program-pdf.ts:55`,
      `apps/web/src/app/coach/builder/[clientId]/components/ExerciseBlock.tsx:307` y
      `apps/web/src/app/coach/builder/[clientId]/components/PrintProgramDialog.tsx:151`. Regla: con
      `isStrengthTimeBlock` el sufijo imprime **`seg/ses`** (y el badge `↑{n}s`, W2.9); con reps sigue
      `rep/ses` byte-idéntico. La progresión por segundos sigue siendo **cartel, sin motor**, igual que
      hoy «+ Reps» (D4). **Test**: un bloque en modo tiempo imprime `+2 seg/ses` en las 5 superficies y
      uno de reps no cambia.
- [ ] W2.14 **(Opus)** **Convención tipográfica única** (R11), verificada con test: `30s` (sin
      espacio, vía `compactDuration`) en chips de ≤ 20 caracteres; `30 s` (con espacio) en líneas
      largas de ficha y resumen; prescripción `3 × 30 s · 10 kg`; log `10 kg × 30 s` /
      `10 kg × 30 s por lado`. Hoy conviven las dos convenciones en el repo
      (`workout-exercise-type.ts:98-109` vs `logged-set-summary.ts:121`) y el mockup manda.

**Gate de W2**: `pnpm exec vitest run apps/web/src/app/coach/builder packages/plan-builder tests/mobile/plan-builder-serialize.test.ts tests/mobile/plan-builder-type-change.test.ts tests/mobile/plan-builder-strip-roundtrip.test.ts`
+ `pnpm typecheck` + `pnpm --filter @eva/mobile exec tsc --noEmit`.

---

## W3 · Alumno RN (sale por OTA 1.1.2) — 2,75 días-agente · Opus (datos) + **Fable (UI)**

### Motor de tiempo y estado (Opus)

- [ ] W3.1 **(Opus)** `apps/mobile/components/alumno/workout/v3/timing.ts:39-100` — **~15 líneas + test**
      (el OUTLINE presupuestaba «~3 líneas» contando solo `viaAppState`). Tres cambios:
      - **(a) La señal de R6 se deriva de la EVIDENCIA, no del emisor.** `viaAppState` definido por
        «quién disparó el fin» es **falsable**: hay **dos** caminos a `triggerDone` — el tick del
        intervalo (`:63-68`) y el listener de `AppState` (`:73-79`) — y **gana el primero**: al
        desbloquear la pantalla el intervalo pendiente puede correr antes del evento, con lo que un
        hold vencido en background reportaría `viaAppState: false` y **el lado 2 arrancaría solo**
        (datos falsos con V2 escribiendo). Se calcula al disparar:
        `expiredWhileAway := (Date.now() - endAtMs) > 1500 || AppState.currentState !== 'active'`.
        `endRef` ya guarda el fin absoluto (`:61`). El campo se **renombra** en la firma de
        `decideHoldAutolog` (W1.1) y en el `onDone`: `expiredWhileAway`, no `viaAppState`.
      - **(b) `prime(seconds)` — nombre canónico de R27.** `restart()` (`:88-96`) **siempre** hace
        `setRunning(true)` + `setStarted(true)` ⇒ con R6 el lado derecho quedaría en `0:00 done` en vez
        de `0:30 idle`, y **CA-15/CA-18/CA-20/CA-21 y CA-08 no serían implementables**. `CountdownApi`
        gana **`prime(seconds?)`**: deja el reloj **armado en `idle`** con el objetivo, **sin
        arrancarlo** — es lo que hace posible «el lado derecho espera tu toque». `restart` **no se
        toca** (los llamadores actuales siguen compilando byte-idénticos).
      - **(c) Aditivo**: exponer `endAtMs` para el aviso del SO.
      `started` ya existe (`:15-30`). **Se conserva** el invariante del efecto que depende de
      `remaining` (`:88`, funciona porque `endRef` persiste). **Test**: con reloj falso, los **dos**
      caminos de disparo (tick primero / `AppState` primero) sobre un hold vencido en background dan
      **el mismo** `expiredWhileAway: true` (el resultado **no** puede depender de quién ganó la
      carrera); y con `expiredWhileAway: true`, `prime(30)` deja el lado derecho en **idle mostrando el
      objetivo**, no en `done`.
- [ ] W3.2 **(Opus)** `apps/mobile/components/alumno/workout/v3/use-hold-module.ts` (**nuevo**): hook
      fino que compone `useCountdown` + la secuencia de lados —**`holdSidesFor(sideMode)` del motor**
      (W1.5b, R34), que `mobilitySides` (`typed-screen-model.ts:146`) pasa a delegar para no tener dos
      reglas— + `decideHoldAutolog`. **No re-implementa la cuenta.**
      `autoStart` por defecto `false` (A1/R21: «nada corre solo al abrir una pantalla»,
      `MobilityScreenV3.tsx:141`); el lado 2 se **arma con `prime(seconds)`** (W3.1b) y arranca solo
      **solo si `!expiredWhileAway`** (R6, W3.1a). Guard de un
      envío por serie con `sentSetsRef` por `block:set:side`, calcado de `CardioScreenV3.tsx:364`. La
      siembra de la fila va por **`typedSeedPatch` con nonce** (`SetRow.tsx:894-901`), **nunca** por
      `seedValues` (remonta la fila y cierra el keypad abierto — comentario explícito en
      `CardioScreenV3.tsx:610`). El payload lo construye **siempre** el motor
      (`buildTypedPayload` para movilidad, `buildStrengthTimePayload` para fuerza por tiempo), nunca
      el hook a mano. **Contexto como objeto**: al motor se le pasa **`{sideMode, holdSource}`**, nunca
      el `sideMode` suelto del 3.er argumento histórico — es lo único que hace que `hold_source` llegue
      al jsonb en movilidad (W1.3b), tanto bilateral como `per_side`. **Test**:
      `tests/mobile/executor-v3-typed-screens.test.ts` (ampliar) sobre la parte pura del hook, con un
      caso que verifica que el payload de un hold bilateral guardado por reloj trae
      `metadata.hold_source === 'timer'`.
- [ ] W3.3 **(Opus)** `apps/mobile/components/alumno/workout/v3/ExecutorV3.tsx:754-843`
      (`maybeStartRest`): estado nuevo **`pendingRoundRest`** en el orquestador (**R9**), nunca en la
      fila. **Forma ampliada** respecto de R9 (`{groupId, round, seconds}` no alcanza):
      **`{groupId, round, totalRounds, seconds, label, roundContext} | null`**. Motivo verificado:
      `restRoundContextRef` se **anula en cada commit** (`:696`) y **solo** se construye dentro de la
      rama que hoy llama `startRest` (`:770-791`: `totalRounds`, `next`, `prescription`, `tag`), y el
      interstitial lo lee en **render** (`:1763`) ⇒ si el descanso se difiere al toque, D2 quedaría
      **sin banner ni dots y sin `setTotal`**, con CA-42 y el punto 5 de DATA-TESTING §7.2 inalcanzables. Por eso el
      contexto —**el mismo `RestRoundContext`** que hoy arma `:770-791` (`roundNumber`, `totalRounds`,
      `next` con nombre, prescripción y tag; el tipo se exporta en `v3/RestInterstitialV3.tsx:49`)— se
      **calcula en el commit** (donde están `members`, `projected` y `effByBlock`) y se guarda dentro de
      `pendingRoundRest` **antes** del reset de `restRoundContextRef` de `:696` (**R28**), junto con los
      `seconds`. Al tocar el CTA se **repone** `restRoundContextRef.current
      = pendingRoundRest.roundContext` **antes** de llamar el **mismo**
      `startRest(secs, {autoStart:true, countKind:'ronda', setIndex: round, setTotal: totalRounds})` de
      `:796-802` (si no, el interstitial diría «Serie N de M»). Reglas de limpieza: nuevo commit de
      cualquier miembro, cambio de paso, omitir bloque, finalizar entreno. **Test**:
      `tests/mobile/executor-v3-superset.test.ts` (ampliar) — cerrar la ronda por reloj **no** arranca
      descanso; al tocar el CTA el interstitial recibe `countKind:'ronda'`, `setTotal` y el
      `roundContext` **completo** (banner + dots); el estado pendiente se limpia en los 4 casos.
- [ ] W3.4 **(Opus)** `apps/mobile/components/alumno/workout/v3/ExecutorV3.tsx:556-586` (`openSet`,
      **R7**): pasar `sideMode` al `typedCtx` y sembrar `hold_left_sec`/`hold_right_sec` desde
      `metadata`. Hoy el archivo declara en `:556-559` que **deliberadamente no** lo pasa porque
      «confirmar borraría el hold guardado»: con V2 la edición pasa a ser el camino normal, así que la
      deuda se vuelve bug visible. Toda edición manual reescribe `metadata.hold_source = 'manual'`
      **junto con los lados** (el UPDATE reemplaza el jsonb entero). **Test**: editar un hold
      `per_side` guardado por reloj conserva los dos lados y cambia `hold_source` a `'manual'`.
- [ ] W3.5 **(Opus)** `apps/mobile/components/alumno/workout/v3/ExecutorV3.tsx:1798-1811`: **sin
      cambio** (**R5**). El salto de paso a los ~350 ms al cerrar la última serie del bloque se
      mantiene igual que hoy, también cuando el disparador fue el reloj. Se declara como
      interpretación de V3 en el SPEC (V3 gobierna el descanso y la serie siguiente, no el salto de
      paso). **Test de no-regresión**: el guard `autoAdvancedRef` sigue impidiendo el doble salto.
- [ ] W3.6 **(Opus)** `apps/mobile/components/alumno/workout/timers/hold-notification.ts` (**nuevo**,
      **R18**): **clon de `cardio-notification.ts`**, no una versión recortada. Aviso local «Terminó tu
      hold», id estable **`eva-hold-end`**, `data.type = 'hold-end'` (para no barrer las del descanso
      ni las de cardio, `rest-notification.ts:52-53,239-243`), **solo si ya hay permiso concedido**
      (nunca promptea: patrón `rest-notification.ts:176`, permiso **reusado** del descanso vía
      `getRestNotifPermission`). Las **4 reglas del fix QA-10** que documenta su gemelo
      (`cardio-notification.ts:15-21`) son obligatorias, no opcionales:
      **(a)** identificador estable en cada `schedule` ⇒ a lo sumo existe **una**;
      **(b)** todas las ops (`schedule`/`cancel`/`dismiss`/`sweep`) **serializadas por una cola de
      promesas** ⇒ cero carreras `cancel↔schedule` (la fuente demostrada de las huérfanas apiladas en
      MIUI); **(c)** `dismissHoldEndNotification` retira además las ya **entregadas** del tipo `hold-end`;
      **(d)** `sweepHoldNotifications` cancela al arrancar cualquier programada huérfana del tipo.
      El `sound` lo gobierna **`isRestTimerMuted()`** (mismo carril que el descanso). **Tabla de
      disparo** (sin ella nadie sabe cuándo se programa): `start` y `resume` ⇒ `schedule`;
      `pause`, `done-early`, `restart`/`re-medir`, **cambio de lado**, **cambio de miembro** y
      desmontaje ⇒ `cancel` + `dismiss`; `remaining <= 2 s` o vuelta a foreground ⇒ `cancel`
      (`useRestTimerEngine.ts:270`, `:312-313`). Sin esa disciplina el handler global
      (`apps/mobile/lib/push.ts:86-95`) muestra **y suena** la notificación con la app abierta ⇒ doble
      beep. **Test W3.T5** — `tests/mobile/hold-notification.test.ts` (**nuevo**, sumarlo a
      DATA-TESTING §6.3): se programa solo con permiso; se cancela en el umbral de 2 s; una carrera
      `cancel`+`schedule` deja **una sola** programada; cambiar de lado cancela y reprograma. Sumar
      además un punto al checklist de DATA-TESTING §7.1.
- [ ] W3.7 **(Opus)** Verificación (sin cambio de código) de la cola offline:
      `apps/mobile/lib/offline-cache.ts:25-51` ya declara `actual_hold_sec` (`:42`),
      `actual_duration_sec` (`:39`) y `metadata: WorkoutLogMetadata` (`:51`), y el drain spreadea el
      ítem entero (`:130-133`); `apps/mobile/lib/workout-session.ts:952,968,974,1091-1101` ya escribe
      `reps_done: null`, `actual_hold_sec` y `metadata`. **Test**: `tests/mobile/` — un log de hold
      encolado en avión llega al drenado con `hold_source` en el jsonb y con los dos lados.
- [ ] W3.8 **(Opus)** Háptica a 0: `timerHaptics.holdDone()` (`apps/mobile/lib/haptics.ts:83-86`) se
      mantiene en foreground. **El criterio de salida de este tren es «vibra y avisa a 0», nunca
      «suena a 0»** (**R31**). **No se promete** sonido (`sound.ts:23-27` dice que la reproducción real
      «se confirma en device») ni vibración con la pantalla apagada (el JS está congelado). Copiar la
      lista «no prometer» al SPEC, **incluidos los tres ítems que agrega R31**: (1) Android sin
      `SCHEDULE_EXACT_ALARM` cae a `setAndAllowWhileIdle` ⇒ el aviso puede llegar tarde; (2) una PWA en
      iOS con la pestaña en background **no avisa**; (3) **keep-awake**: con «Pantalla siempre
      encendida» apagada la pantalla puede dormirse durante el hold — el reloj se **reconstruye por
      `endAtMs`** y guarda al volver, pero no hay aviso mientras duerme.

### Pantallas (UI · Fable — mockup v2 secciones A y B, ya aprobado)

- [ ] W3.9 **[UI · Fable]** `apps/mobile/components/alumno/workout/v3/HoldModuleV3.tsx` (**nuevo**):
      `ProgressRing` + `formatClock` + pastilla de lado + «luego: {lado}» + CTAs.
      `HoldModuleKind = 'mobility' | 'strength_time'` (roller **fuera**, R12);
      `HoldModuleSize = 'ss' | 'solo130' | 'solo214'` (80 / 130 / 214 px). `reducedMotion` baja como
      prop a `ProgressRing` (`:40`) y `JuicyButton` (`:66,85`). **Nunca** guarda ni arranca descansos:
      su única salida es `onCommit(payload, source)` / `onSeed(values, nonce)`.
      ⚠ **Predicado único de montaje (R29)**: el módulo se monta **solo si hay reloj que montar** —
      `(block.duration_sec ?? 0) > 0` en movilidad, o `isStrengthTimeBlock` en fuerza. **Sin duración**
      (los **94 bloques de movilidad sin `duration_sec`** que hay en LIVE) **no se monta nada**: la
      fila manual de hoy queda **tal cual**, sin módulo, sin anillo y sin CTA de reloj. Y desde `idle`,
      «Listo» conserva el comportamiento de hoy (**CA-90**): siembra el objetivo en la fila y **no**
      envía.
- [ ] W3.10 **[UI · Fable]** `SupersetScreenV3.tsx`: montar `<HoldModuleV3 size="ss">` **justo después
      de `<ExecMediaV3 …/>` (`:453-459`) y antes de la prescripción compacta (`:462`)** cuando el
      miembro activo tiene reloj (**V1**: el media de 150 px queda intacto arriba). Reset del módulo en
      el `useEffect` de `:239-243` **por `activeBlockId` y por ronda**; suspensión de la cuenta
      mientras corre el descanso de grupo (`restingNow`, `:152-153`).
- [ ] W3.11 **[UI · Fable]** `SupersetScreenV3.tsx:325-333`: el commit del módulo entra por el
      `handleCommit` **local** (no por `onCommitSet` directo) para que el CueBar se dispare
      (`:327-330`). **R23**: con V4 el CueBar sale **sin gesto** ⇒ su auto-dismiss sube de **1650 ms a
      2400 ms** solo cuando el origen es `timer` (`:167-172`); el marquee «CONTINÚA SIN DESCANSO»
      (`:409`, `:541`) se mantiene.
- [ ] W3.12 **[UI · Fable]** `SupersetScreenV3.tsx:638-660`: la nota «Descanso {N}s al cerrar la
      ronda» se convierte en el CTA **«Ronda lista · Descansar 90 s»** cuando `pendingRoundRest` apunta
      a este grupo (**D2**). `groupRestSec` ya se calcula en `:231-234`.
- [ ] W3.13 **[UI · Fable]** Visibilidad de la fila de captura (**R8**), 3 estados en superserie:
      **sin arrancar** ⇒ módulo + fila de cajas (`ActiveSetRow` con `typedMode`, `:503-545` →
      `SetRow.tsx:1163-1400`) — el camino manual de hoy **sigue existiendo** (29 de 32 holds de Movens
      se escribieron así); **corriendo** ⇒ solo módulo; **guardado** ⇒ tarjeta del miembro «hecho» con
      `⏱ 30 s / 30 s` y tap = editar.
      ⚠ **Invariante de montaje (R26)**: «corriendo ⇒ solo el módulo» se implementa **ocultando con
      `display: 'none'`**, **nunca** desmontando la fila del miembro activo mientras el
      `HoldModuleV3` esté montado — es el mismo invariante que en web (W4.11), donde desmontar deja
      `formRef` en `null` y **V2 no guarda nada, en silencio**. En `paused` la fila **vuelve a verse**
      (editable + «Reanudar»); solo en `running` se oculta.
- [ ] W3.14 **[UI · Fable]** `MobilityScreenV3.tsx:120-138` y `:221-323`: el módulo reemplaza el bloque
      de hold conservando el anillo **214 px** (V1). A 0 se **guarda solo** (V2). Post-guardado: anillo
      **«¡Listo!»** + chip **«Guardado · 30 s»** + CTAs **«Descansar 30 s»** (juicy) y **«Siguiente
      serie»** (secundario) — **nada arranca solo** (V3) con la pref **APAGADA**; con la pref **ON** el
      descanso arranca solo y ese par **no se pinta** (R24, W3.16). La fila de captura tipada (`:327-351`) sigue
      **siempre visible** (QA4 h8b); corriendo se **deshabilita, no se oculta**. «Listo» antes de 0
      guarda lo transcurrido con `hold_source: 'manual'` (A2/R22) y con 0 s **no envía**.
- [ ] W3.15 **[UI · Fable]** `ExerciseScreenV3.tsx`: variante **fuerza por tiempo** — `<HoldModuleV3
      size="solo130">` **después de `<ExecMediaV3 …/>` (`:329-335`), antes de la prescripción
      (`:338-350`)**; prescripción `{sets} × {compactDuration(duration_sec)} · {kg} · RIR · desc`; el
      segundo `ValueTile` conmuta de «Reps» a **«SEG»** (`SetRow.tsx:1056-1065`) por prop nueva
      `strengthTimeMode`, escribiendo `actual_hold_sec`; `repsHint` (`:196-201`) pasa a los segundos
      prescritos; la rueda dual (`:172-190,513`) se desactiva o pasa a kg\|seg; el hint de captura
      vacía (`SetRow.tsx:906-912`) pide **segundos**, no reps.
      **CTAs de fuerza por tiempo, cerrados**: en `idle` ⇒ **«Iniciar serie»** (juicy); mientras el
      reloj **no** se haya arrancado, **«Aplastar serie»** queda disponible **solo** si el alumno
      escribió los SEG a mano (camino manual de R8); tras el guardado ⇒ **«Descansar N s»** /
      **«Siguiente serie»** (R24, W3.16).
- [ ] W3.16 **[UI · Fable]** **Par de CTAs «Descansar N s» / «Siguiente serie» con la preferencia
      APAGADA** (**R24**, +0,25 d-a). Hoy **no existe** un botón manual de descanso en V3: RN solo
      tiene los dos `startRest` **automáticos** de `v3/ExecutorV3.tsx:796` (superserie) y `:830`
      (bloque suelto), y el `ManualTimerButton` de la web vive únicamente en la barra legacy
      `!execV3Active`. Con **R1** (OFF por defecto para el primer entreno), ese hueco sería **la
      experiencia por defecto del alumno nuevo**: cerraría una serie y no tendría **cómo** descansar.
      Regla: tras cerrar **cualquier** serie —tocada o por reloj— con la pref **OFF** y
      `rest_time > 0`, se pinta el par **«Descansar N s»** (juicy, que llama el **mismo** `startRest`
      de hoy, sin motor nuevo) y **«Siguiente serie»** (secundario), en las **cuatro** superficies de
      RN: **fuerza clásica** (`ExerciseScreenV3.tsx`), **movilidad** (`MobilityScreenV3.tsx`, W3.14),
      **fuerza por tiempo** (`ExerciseScreenV3.tsx` variante tiempo, W3.15) y **fin de ronda** en
      superserie, donde el par se colapsa en **«Ronda lista · Descansar N s»** (W3.12, D2). Con la pref
      **ON** el descanso arranca solo y **el par no se pinta** (nadie ve dos caminos para lo mismo).
      Sin `rest_time` no hay nada que arrancar ⇒ solo «Siguiente serie». Copys literales de R11b; N son
      los **segundos reales** del bloque. **Aceptación**: en las 4 superficies, con pref OFF, cerrar
      una serie deja siempre un camino visible para descansar; con pref ON, ninguno. **CA-80 se
      reescribe sobre este camino**: con OFF ya no se cancela un descanso arrancado a mano — y el que
      lo arranca es justamente este CTA. **Test**: `W5.T5` de [DATA-TESTING §6.3](DATA-TESTING.md)
      (matriz 2×4 + extremo a extremo del toggle + caso CA-80). **Punto de QA**: DATA-TESTING §7.1
      punto 15.

**Gate de W3**: `pnpm --filter @eva/mobile exec tsc --noEmit` +
`pnpm --filter @eva/mobile exec expo export --platform android` +
`pnpm exec vitest run tests/mobile` sin rojos nuevos. **Sin dependencias nativas nuevas**: el tren
tiene que caber en la OTA 1.1.2.

---

## W4 · Alumno web / PWA — 2,25 días-agente · Opus (datos) + **Fable (UI)**

### Datos y guardado (Opus)

- [ ] W4.1 **(Opus)** `apps/web/src/app/c/[coach_slug]/workout/[planId]/v3/useExecCountdown.ts:21-31,34-116`:
      agregar **`started: boolean`** (hoy **no existe**; sin él la web no distingue «nunca arrancó» de
      «pausado» y el botón juicy no puede alternar) y **`expiredWhileAway`** en el `onDone`, espejo
      exacto de W3.1(a): en web el `setInterval` de la pestaña oculta **no se congela, se throttlea**
      (`useExecCountdown.ts:71-83`), así que el tick puede ganarle al re-sync por `visibilitychange`
      (`:86-99`) y reportar `false` en un hold vencido fuera de pantalla. Se deriva de la evidencia:
      `(Date.now() - endTimeRef.current) > 1500 || document.visibilityState !== 'visible'`
      (`endTimeRef` ya existe, `:73`). Además **`prime(seconds?)`** (**R27**, mismo nombre canónico que
      en RN): hoy el JSDoc de `:30-32` declara «Reinicia y arranca» sin argumentos, así que **no hay
      forma de dejar el reloj armado en `idle`** y el lado 2 no puede esperar el toque (R6). `restart`
      **no se toca**: los dos llamadores actuales (`MobilityStepV3.tsx:89`, `CardioStepV3.tsx:444`)
      siguen compilando byte-idénticos. **Test**:
      `v3/useExecCountdown.test.ts` (ampliar) — `started` en los 3 caminos; `expiredWhileAway` **igual
      por los dos caminos de disparo** con reloj falso (el caso `:118` ya existe); `prime()` deja el
      contador en `idle` con el objetivo, sin arrancar.
- [ ] W4.2 **(Opus)** Auto-envío web — **son DOS componentes, no uno**. `LogSetForm.tsx` exporta un
      dispatcher (`:307`) sobre `StrengthLogSetForm` (`:316`–`:1658`) y `TypedLogSetRow` (`:1660`+).
      Hoy `holdPrefill` **solo existe en la fila TIPADA**: se destructura en `:1677`, su efecto vive en
      `:1800-1811` y los refs `holdRef`/`holdLeftRef`/`holdRightRef` en `:1729-1731`. La **fuerza por
      tiempo** se pinta en la fila de FUERZA (guard `:848`, tile `:1143-1170`) ⇒ cablear solo
      `:1800-1811` deja a **C sin auto-guardar en web, y el fallo es silencioso**. Se parte en dos:
      - **(a) Fila tipada (movilidad)**: `holdPrefill` (`:265`) gana **`submit?: boolean`** y
        **`source?: 'timer' | 'manual'`**; al final del efecto `:1800-1811`,
        `if (holdPrefill?.submit) formRef.current?.requestSubmit()` (`formRef` = `:1724`) — espejo de
        la línea de cardio (`:1829`).
      - **(b) NUEVO en `StrengthLogSetForm`**: la prop `holdPrefill` baja también acá; se agregan el
        `input name="actual_hold_sec"` (y `hold_left_sec` / `hold_right_sec` en `per_side`), sus refs,
        el efecto por `nonce` **calcado de `:1800-1811`**, y el `formRef.current?.requestSubmit()`
        contra el `formRef` **propio** de la fila de fuerza (`:449`, montado en `:1099` y `:1423`).
      **Gate obligatorio en ambas**: copiar el `|| isLogged` que cardio ya tiene en `:1820` y que
      `holdPrefill` **hoy no tiene** (`:1802`) — sin `submit` daba igual, con `submit` permitiría
      **re-enviar una serie ya logueada**. **Test**: un `holdPrefill` con `submit` dispara **un solo**
      submit en cada uno de los dos componentes; con `isLogged` no dispara ninguno; el gate de cardio
      (`:1820`, `mode !== 'cardio'`) queda intacto.
- [ ] W4.3 **(Opus)** `LogSetForm.tsx:848`: el guard de serie vacía de fuerza
      (`if (w == null && r == null) return`, con el comentario «cinturón contra un submit
      programático») **bloquea el auto-guardado de fuerza por tiempo** (reps `null`, solo segundos).
      Pasa a `w == null && r == null && hold == null`. ⚠ Sin esto C no guarda nada y **el fallo es
      silencioso**. **Test**: submit programático con solo `actual_hold_sec` guarda; sin ningún valor
      sigue sin guardar.
- [ ] W4.4 **(Opus)** **Metadata del hold en web — tarea de CÓDIGO, no de documentación** (**R37**).
      Regla
      transversal: **`hold_source` viaja en el MISMO objeto que `{left_sec, right_sec}`** — el jsonb se
      reemplaza entero en `_actions/workout-log.actions.ts:150-178`, así que mandarlo solo borraría los
      lados. Tres ramas, tres cambios:
      - **(a) Fuerza `per_side` por tiempo — hoy BORRA la metadata.** `perSideReps` es `true` para
        **toda** fila de fuerza `per_side` o `alternating` (`LogSetForm.tsx:357`) ⇒ una serie de fuerza
        por tiempo entra igual a `:820-846`; sin reps, `buildStrengthPayload` devuelve `metadata`
        `undefined` (`set-log-payload.ts:264-267`) y se ejecuta `formData.delete('metadata')` (`:840`),
        que **borra `{left_sec, right_sec, hold_source}` antes del submit** (rompería CA-13, CA-31 y la
        paridad §5.4, y dejaría la adopción en `sin_marca`). Fix: si `isStrengthTimeBlock`, la rama
        `perSideReps` **no** llama `buildStrengthPayload` ni borra la metadata — lee
        `hold_left_sec`/`hold_right_sec` del `FormData`, arma `{left_sec, right_sec, hold_source}` con
        `buildStrengthTimePayload` y hace **un solo** `formData.set('metadata', …)`; `reps_done` se
        elimina del `FormData`. El `formData.delete('metadata')` queda restringido a **fuerza clásica
        sin lados tipeados**.
      - **(b) Fuerza bilateral por tiempo** (`:838-846`): un único `formData.set('metadata', …)` con
        `{hold_source}` (hoy no viaja metadata en ese camino ⇒ mandarla sola es seguro).
      - **(c) Movilidad, rama tipada** (`:1912-1930`): hoy `:1929` **borra** la metadata cuando no hay
        lados y `:1930` ni siquiera pasa por ahí en bilateral ⇒ un hold bilateral saldría sin marca.
        `collectMetadata` (`:1935`, hoy tipada `{left_sec?, right_sec?} | null`) **amplía su tipo** a
        `{left_sec?, right_sec?, hold_source?}` y la rama escribe `metadata` **también en bilateral**.
      **Aceptación (R37, literal): «tres claves en `metadata`»** — una serie de fuerza **`per_side` por
      tiempo** guardada por la web deja el jsonb con **`left_sec`, `right_sec` y `hold_source`**, las
      tres, en el mismo objeto. **Test**: `workout-log.actions.test.ts` — FormData con
      `{"hold_source":"timer"}` llega a la fila; con lados + `hold_source` el jsonb queda con **las
      tres** claves; **sin** la key `metadata` la columna **no se toca**; y un `reps_done` **no** viaja
      en el FormData de fuerza por tiempo. Mismo assert repetido en **W4.T2**.
- [ ] W4.5 **(Opus)** `LogSetForm.tsx:854-874` (encolado de fuerza) y `:1098` (`key` del form): la cola
      offline de **fuerza** hoy no encola `actualHoldSec` ni `metadata` ⇒ se agregan
      (`apps/web/src/lib/workout-offline-queue.ts:146` ya los serializa y `session-logs.optimistic.ts:21,54`
      ya los preserva). La `key` (`log-${weight}-${reps}`) no cambia al cambiar solo los segundos ⇒ el
      input uncontrolled queda rancio tras la reconciliación: se suma el eje tiempo. **Test**: serie de
      fuerza por tiempo en avión ⇒ al drenar llegan `actual_hold_sec` y `metadata`.
- [ ] W4.6 **(Opus)** `LogSetForm.tsx:662` (**fila de FUERZA**, `buildRest` de `StrengthLogSetForm`,
      `:316`–`:1658`) y `:2033-2047` (**fila TIPADA**, `TypedLogSetRow` desde `:1660`, incluida la
      rama `supersetRest` de `:2036-2040`) — ⚠ las etiquetas estaban **invertidas** en el plan
      original: canal de supresión del descanso. Con
      `hold_source === 'timer'` y la preferencia D5 apagada, el submit **no** llama `startRest`; con la
      ronda cerrada tampoco (**D2**). ⚠ Sin este canal, **V2 rompe V3 y D2 en el mismo commit**: hoy
      cualquier submit de una fila no logueada arranca el descanso, que en V3 es un interstitial a
      pantalla completa. **Test**: submit por reloj con la pref apagada ⇒ 0 llamadas a `startRest`.
- [ ] W4.7 **(Opus)** `WorkoutExecutionClient.tsx`: `pendingRoundRest` en el orquestador (**R9**,
      espejo de W3.3) y `clientId` como prop nueva desde `page.tsx` (hoy el archivo **no tiene**
      `clientId`: verificado con grep ⇒ 0 hits; es aditivo y cuesta 0 queries).
      ⚠ **`rootUser` es nullable**: `page.tsx:61` lo resuelve con `getClientRootUser()` y `:68` ya lo
      trata como tal (`rootUser ? getExecutorWeekStatusDays(rootUser.id) : Promise.resolve(null)`), y
      los dos redirects que abortan miran `data.user` / `data.plan`, **no** `rootUser` ⇒
      `clientId={rootUser.id}` a secas produciría la clave `eva:exec-autorest-v1:undefined`, **una
      preferencia y una marca «visto» compartidas por todos los alumnos de ese navegador**. Fallback
      obligatorio: **`clientId = rootUser?.id ?? data.user?.id ?? null`**, y con `clientId == null` la
      preferencia **cae a la clave legacy por dispositivo `omni_autotimer`** —se **lee y se escribe**,
      sin crear ninguna clave nueva— y **el modal no se muestra** (**R32** literal; misma regla en
      W5.1 y W5.7). No confundir con `storageAvailable === false`, donde no hay storage que leer.
      **Forma canónica de `pendingRoundRest`**: la ampliada de W3.3, con el `RestRoundContext`
      construido **en el commit** (**R28**). ⚠ **`countKind` no existe en web**
      (`grep countKind apps/web` ⇒ 0 hits; `RestOptions` de `WorkoutTimerProvider.tsx:18-21` acepta
      **solo** `{label, warmup}`, y `startRest` se declara con esa firma en `:33`) ⇒ el CTA de D2 en
      web llama `startRest(String(groupRestSeconds), { label })` y **el rótulo «Ronda N de M» viaja en
      `label`** (R28): no se inventa `countKind` en la web ni se promete la notificación de RN.
      `countKind`/`setIndex`/`setTotal` son **solo RN**, y así se declara en SPEC §11.2, CA-42 y el
      el punto 5 de DATA-TESTING §7.2 (la exigencia del texto en el interstitial vale para la app; en la PWA se
      verifica el banner). Ampliar `RestOptions` web queda como **deuda B13**, sin costo en este tren. `:1967-1973` (salto de paso) **sin cambio** (R5). **Test**: el path del estado
      pendiente se limpia en los 4 casos; con `rootUser` nulo la pref sale de `omni_autotimer` (lectura
      y escritura) y **nunca** se toca una clave `eva:exec-autorest-*`, sin modal.
- [ ] W4.8 **(Opus)** `apps/web/src/app/api/pr-card/route.tsx:79-85`: agregar `.gt('reps_done', 0)` al
      select de la curva (hoy filtra **solo** por `weight_kg`) ⇒ el peso de un hold no entra a la
      PR-card. Complementa la migración W0.2. **Test**: un log `{weight_kg:10, reps_done:null}` no
      aparece en la serie.
- [ ] W4.9 **(Opus)** Verificar (sin tocar) que las 12 RPC restantes dan **0 diff** con
      `reps_done NULL`: `get_client_daily_tonnage` y `get_client_muscle_volume` descartan por
      `reps_eff > 0`; `get_client_strength_series` y `get_client_weekly_prs` por `reps_done > 0`; las
      8 de presencia/conteo suman el día igual. **Aceptación**: la tabla consumidor × diff queda en
      `DATA-TESTING.md` con su evidencia.

### Pantallas (UI · Fable — mockup v2 secciones A, B y C, ya aprobado)

- [ ] W4.10 **[UI · Fable]** `apps/web/.../v3/HoldModuleV3.tsx` (**nuevo**): misma pieza visual y
      mismos estados que RN, con `HoldModuleSize = 'ss' | 'solo130' | 'solo214'`. **Contrato de
      no-regresión**: nunca llama `logSetAction`, `enqueueWorkoutLog` ni `startRest`; su única salida
      es `onMeasured({holdSec?, leftSec?, rightSec?, submit, source, nonce})`, que el consumidor
      enchufa a `LogSetForm.holdPrefill`.
      ⚠ **Mismo predicado de montaje que RN (R29)**: se monta **solo si hay reloj que montar**
      (`(block.duration_sec ?? 0) > 0` en movilidad o `isStrengthTimeBlock` en fuerza). Sin duración,
      la fila manual de hoy queda **intacta**, sin módulo; y «Listo» desde `idle` siembra el objetivo
      sin enviar (**CA-90**). Los lados salen de **`holdSidesFor(sideMode)`** (W1.5b, R34), nunca de
      una regla local del componente.
- [ ] W4.11 **[UI · Fable]** `v3/SupersetStepV3.tsx`: `<HoldModuleV3 size="ss">` **entre
      `<ExecMediaCard/>` (`:292-296`) y `.exec-v3-rx` (`:298`)**, dentro de `.exec-v3-ss-body-in`
      (`:291`, que ya anima `grid-template-rows 0fr→1fr` ⇒ el contenido nuevo se anima gratis). El
      estado del reloj resetea por `activeBlockId` **+ `currentRound`** (hoy `:192-194` resetea solo
      por bloque: la ronda 2 del mismo miembro tiene que empezar en 0). `handleActiveLogged`
      (`:219-226`) **no se toca**: el CueBar sale solo. `.exec-v3-ss-restnote` (`:452-457`) se vuelve
      el CTA **«Ronda lista · Descansar 90 s»** → `startRest(String(groupRestSeconds), { label })`,
      con el rótulo **«Ronda N de M» dentro de `label`** (**R28**: la web no tiene `countKind`, ver
      W4.7), lo que requiere importar `useWorkoutTimer` en el paso, que hoy no lo usa.
      ⚠ **Invariante de montaje (R8, §9.1)**: la fila del **miembro activo NUNCA se desmonta** mientras
      el módulo de hold está montado. El auto-envío web es `formRef.current.requestSubmit()` sobre el
      `<form>` del `LogSetForm` renderizado **dentro** de la tarjeta activa
      (`SupersetStepV3.tsx:289-372`); si el estado «corriendo ⇒ solo el módulo» se implementara
      **desmontando**, `formRef` sería `null` y **V2 no guardaría nada, en silencio** — 21 de los 32
      bloques de Movens y 6 de sus 9 alumnos entran por PWA. Se oculta con **`hidden` / `aria-hidden` +
      `inert`**, nunca con un condicional de render. **Test web-dom**: con el módulo en `running` el
      `<form>` sigue en el DOM y `holdPrefill.submit` produce **exactamente un** `logSetAction`.
- [ ] W4.12 **[UI · Fable]** `v3/MobilityStepV3.tsx:223-238` (**punto B del mockup**): el CTA único de
      hoy se parte en **dos botones apilados** (paridad con RN `MobilityScreenV3.tsx:272-321`; regla
      del repo: nunca dos `w-full` en fila) — arriba el control (**«Iniciar hold»** juicy sin arrancar
      / «Pausar»–«Reanudar» secundario de 52 px corriendo), abajo el cierre («Listo este lado» /
      «Listo», juicy de 58-60 px). El rótulo de 10 px **«Tocar para iniciar»** (`:193-197`) deja de
      tener sentido; el anillo sigue tappable como afordancia redundante.
- [ ] W4.13 **[UI · Fable]** `v3/MobilityStepV3.tsx:141-240`: panel post-guardado — anillo «¡Listo!» +
      chip «Guardado · 30 s» + **«Descansar N s»** / **«Siguiente serie»** con la pref **APAGADA** (con
      la pref ON el descanso arranca solo y el par no se pinta, R24 / W4.17; N sale de
      `parseRestTime(block.rest_time)`, `WorkoutTimerProvider.tsx:58-85`). Componente compartido
      `HoldDoneActions` reusado por `v3/ExerciseStepV3.tsx` para no triplicar copy. La fila logueada
      sigue montada y editable (`SubmitSetButton`, `LogSetForm.tsx:2435-2454`).
- [ ] W4.14 **[UI · Fable]** `v3/ExerciseStepV3.tsx`: `<HoldModuleV3 size="solo130">` **entre
      `<ExecMediaCard/>` (`:174`) y `.exec-v3-rx` (`:177`)**; la prescripción (`:177-187`) imprime
      `{sets} × {compactDuration(duration_sec)} · {kg} · RIR · desc`; el tile REPS conmuta a **SEG**
      (`LogSetForm.tsx:1143-1170`) con `name="actual_hold_sec"`, conservando `.exec-v3-val` /
      `.exec-v3-valinput` / `.exec-v3-valu` (`globals.css:2261/2274/2298`) para **cero drift visual**.
      Guard explícito en `LogSetForm.tsx:876-893` para que el modo tiempo **no** entre al camino de PR
      (A4: `classifyThresholdPr` recibiría `r = null`).
      **CTAs de fuerza por tiempo, cerrados** (espejo de W3.15): `idle` ⇒ **«Iniciar serie»** (juicy);
      mientras el reloj no se haya arrancado, el submit de la fila queda disponible **solo** si el
      alumno escribió los SEG a mano (camino manual de R8); tras el guardado ⇒ **«Descansar N s»** /
      **«Siguiente serie»** (R24, W4.17).
- [ ] W4.15 **[UI · Fable]** `apps/web/src/app/globals.css` — **clase nueva, cardio intacto**
      (**R33**). `.exec-v3-holdwrap` está **fijo en 214×214 px** (`:5417-5424`) y `.exec-v3-holdnum` en
      60 px (`:5449`), y **las dos las usa `CardioStepV3`** (`:518`, `:538`, `:689`, `:711`, `:722`),
      que es **intocable** (CA-14): el propio archivo lo dice en `globals.css:5416` («Anillo de HOLD /
      countdown (movilidad + cardio)»). Por eso **no se les agrega `data-size` ni se les cambia el
      valor base «de paso»**: quedan **byte-idénticas**. El módulo nuevo estrena su **propia familia**:
      **`.exec-v3-holdmod`** con la variable **`--exec-hold-size`** (**80 / 130 / 214 px** según
      `HoldModuleSize`) y sus propios selectores para el número, el anillo y el relleno. Sin
      modificador de tamaño el anillo de 214 px empujaría la fila de captura fuera del viewport en
      móvil (`.exec-v3-ss-body-in` tiene `overflow:hidden`). **Movilidad sola migra al módulo nuevo en
      esta wave, conservando sus 214 px** (V1: mismo tamaño, otra clase). El bloque
      `prefers-reduced-motion` de `:6390` —que hoy nombra `.exec-v3-hold-fill`— **gana los selectores
      del módulo**, en vez de reusar la clase de cardio. El `strokeWidth` es atributo JSX
      (`MobilityStepV3.tsx:164,171`) ⇒ pasa a prop del módulo; el `DASH = 2π·92` (`:107`) sigue válido
      porque es coordenada de viewBox, no px de pantalla. **Aceptación**: un diff de `globals.css` que
      **no toca ninguna línea** de `.exec-v3-holdwrap` / `.exec-v3-holdnum` / `.exec-v3-hold-fill`, y
      el render de cardio comparado contra la captura previa al deploy (DATA-TESTING §7.2 punto 15).
- [ ] W4.16 **(Opus)** **Regla de hidratación (EVA-NEXTJS-18)**, verificada en revisión: toda lectura
      de `localStorage` va en `useEffect`, **nunca** en el initializer de `useState` (patrón vigente en
      `WorkoutExecutionClient.tsx:1222-1227` y `v3/exec-settings.ts:82-98`); tampoco `Date.now()` en el
      cuerpo del render (hoy solo se usa en handlers, `SupersetStepV3.tsx:307`,
      `ExerciseStepV3.tsx:145`). **Aceptación**: sin warnings de hidratación en el ejecutor.
- [ ] W4.17 **[UI · Fable]** **Par de CTAs «Descansar N s» / «Siguiente serie» con la preferencia
      APAGADA — espejo web de W3.16** (**R24**, +0,25 d-a). En la web el hueco es aún más visible: el
      único botón manual de descanso que existe hoy es el `ManualTimerButton`
      (`WorkoutExecutionClient.tsx:296`), y **solo se pinta en la barra legacy** `!execV3Active`
      (`:2995-2998`) ⇒ en V3, con la pref OFF, el alumno no tiene **ningún** control de descanso. Se
      pinta el par —**«Descansar N s»** juicy, que llama el **mismo** `startRest` del provider, y
      **«Siguiente serie»** secundario— en **fuerza clásica** (`v3/ExerciseStepV3.tsx`), **movilidad**
      (`v3/MobilityStepV3.tsx`, W4.13, vía el `HoldDoneActions` compartido), **fuerza por tiempo**
      (W4.14) y **fin de ronda** en `v3/SupersetStepV3.tsx`, donde se colapsa en **«Ronda lista ·
      Descansar N s»** (W4.11, D2). Con la pref **ON** el par **no se pinta**. Sin `rest_time`, solo
      «Siguiente serie». N sale de `parseRestTime(block.rest_time)`
      (`WorkoutTimerProvider.tsx:58-85`). Copys literales de R11b. **Aceptación**: en las 4
      superficies, con pref OFF, cerrar una serie deja siempre un camino visible para descansar; con
      pref ON, ninguno. **Test**: `W5.T5` de [DATA-TESTING §6.2](DATA-TESTING.md) (matriz 2×4 +
      extremo a extremo del toggle + caso CA-80). **Punto de QA**: DATA-TESTING §7.2 punto 13.

**Gate de W4**: `pnpm exec vitest run "apps/web/src/app/c/[coach_slug]/workout/[planId]" packages/workout-engine`
+ `pnpm typecheck` + `pnpm check:tokens`.

---

## M · Mockup de la sección F (Fable, jefe) — 0,25 días · **bloquea toda tarea [UI · Fable] de W5**

- [ ] M.1 **[UI · Fable]** Artifact con la **sección F**: modal de primera vez (RN y web) + fila de la
      tuerca renombrada en sus 2 estados, dibujado contra el código vivo — RN `Sheet` con `nativeModal`
      + `forceDark` (`apps/mobile/components/Sheet.tsx:82,110,157`, uso en
      `v3/ExecSettingsSheet.tsx:187-196`); web clases `.exec-v3-settings*`
      (`apps/web/src/app/globals.css:5143-5246`) montado dentro de `[data-exec-v3]` **sin portal**
      para heredar `--exec-brand` (`WorkoutExecutionClient.tsx:3030-3041`).
- [ ] M.2 **[UI · Fable]** Copys **literales** de R11b en el mockup, sin variantes: título
      «¿Pasamos solo al descanso?» · cuerpo «Cuando termines una serie, podemos arrancar tu descanso
      automáticamente. Si prefieres, lo arrancas tú con el botón.» · toggle «Pasar solo al descanso»
      (ON «El descanso empieza solo al terminar cada serie.» / OFF «Tú decides cuándo empieza el
      descanso.») · CTA «Listo» · pie «Puedes cambiarlo cuando quieras en los ajustes del entrenamiento
      (⚙).». El **rojo `danger`** del OFF de la fila actual (RN `v3/ExecSettingsSheet.tsx:204-215`)
      **se va**: con default OFF para el alumno nuevo, apagado es una elección legítima, no una avería.
- [ ] M.3 **Aprobación explícita del owner** por artifact. **Sin ese OK, W5 hace solo su capa de
      datos** (W5.1–W5.5) y las tareas `[UI · Fable]` quedan bloqueadas.

---

## W5 · Preferencia D5 «Pasar solo al descanso» — 1 día-agente · Opus (datos) + **Fable (UI)**

> La preferencia **ya existe con otro nombre**: `omni_autotimer` / «Cronómetro automático»
> (`apps/mobile/components/alumno/workout/timers/rest-timer-preferences.ts:37,54,171-179`;
> `WorkoutExecutionClient.tsx:1222,1227`), **device-scoped** y con **default ON**. D5 no es motor
> nuevo: es re-encuadrarla, hacerla por alumno, cambiar el default **solo para quien recién entra** y
> agregar el modal.

- [ ] W5.1 **(Opus)** `apps/mobile/components/alumno/workout/v3/auto-rest-pref.ts` y
      `apps/web/src/app/c/[coach_slug]/workout/[planId]/v3/auto-rest-pref.ts` (**nuevos**): claves
      `eva:exec-autorest-v1:<clientId>` (`'1'`/`'0'`) y `eva:exec-autorest-seen-v1:<clientId>`. Patrón
      calcado de `v3/exec-settings.ts` (RN `:30-110`: cache + `useSyncExternalStore` + hidratación
      única + escritura optimista; web `:34-46` `readBool`/`writeBool` + evento
      `exec-settings-changed` + hook hidratación-safe `:86-124`). El `clientId` **en la clave** hace
      imposible leer la del otro alumno en el mismo dispositivo (lección del bug de marca cruzada,
      `apps/mobile/lib/branding.ts:79`). API: `readAutoRestPref({clientId, hasHistory})`,
      `writeAutoRestPref`, `resolveAutoRestDefault`, **`hydrateAutoRestPref(clientId)`** y `reset()`.
      El booleano `hasHistory` que reciben **siempre** vale `!showModal` (**F5**, W5.2): ninguna
      superficie lo calcula por su cuenta.
      ⚠ **Hidratación con `clientId` (R36)**: `readAutoRestPref` reemplaza a `isRestAutoTimerEnabled()` en una decisión
      **síncrona previa al `await` de red** (`ExecutorV3.tsx:748-754`), que hoy funciona porque el
      lector vive sobre un **cache de claves fijas hidratado una sola vez**
      (`timers/rest-timer-preferences.ts:40-56,74-104`). La clave nueva depende del `clientId`, que
      recién se conoce con el bundle, y AsyncStorage es **asíncrono** ⇒ hay que declarar el contrato:
      `hydrateAutoRestPref(clientId)` **idempotente**, disparado al montar el ejecutor (junto a
      `hydrateRestTimerPrefs`), flag **`ready`**, y la regla **«sin hidratar se usa el comportamiento
      de hoy (ON) y NO se escribe nada»** (una lectura pre-hidratación jamás pisa lo guardado). La
      decisión de `maybeStartRest` queda **síncrona y previa al `await` de red** (R36); en **web** la
      verdad vive en `WorkoutExecutionClient` (estado + prop `autoTimerEnabled` hacia `LogSetForm`),
      **nunca** en `LogSetForm`.
      `reset()` en `SIGNED_OUT` y al cambiar de `clientId` (lección del bug de marca cruzada).
      ⚠ **`clientId` nulo — regla única del SDD (R32 literal)**: si no es un uuid no vacío (web con
      `rootUser === null`, contemplado en `page.tsx`; ver W4.7 y W5.7) la preferencia **cae a la clave
      legacy por dispositivo `omni_autotimer`** —se **lee y se escribe** esa clave, exactamente como
      hoy— **no se crea ninguna clave nueva** (ni `eva:exec-autorest-v1:` ni `-seen-`) y el modal **no
      se muestra** (`showModal` = `false`). Es lo contrario de «no se lee ni se escribe»: no leerla
      pisaría con ON el OFF que ese dispositivo ya tenía elegido.
      **Test**: lectura/escritura y aislamiento entre dos `clientId` distintos (ninguno ve la clave del
      otro); una lectura pre-hidratación **no** pisa lo guardado; `clientId` nulo ⇒ **0 accesos a las
      claves nuevas** y lectura/escritura de `omni_autotimer` (un OFF previo del dispositivo se
      respeta), sin modal.
- [ ] W5.2 **(Opus)** `resolveAutoRestDefault` como **función pura con test** — default **por cohorte**
      (**R1**): (a) existe la clave nueva ⇒ su valor; (b) no existe pero sí `omni_autotimer` ⇒
      **copiarla** (migración de lectura); (c) sin clave y **con** historial ⇒ **ON** (es lo que viven
      hoy: cero regresión para la base viva); (d) sin clave y **sin** historial ⇒ **OFF + modal**
      (D5 literal).
      ⚠ **El default sale de UNA constante (R25)**: `resolveAutoRestDefault` recibe
      **`strategy: 'cohort' | 'off'`**, y esa estrategia viene de
      **`AUTOREST_DEFAULT_STRATEGY = 'cohort'`** declarada en `auto-rest-pref.ts` **de las dos
      plataformas** (RN y web). Con `'off'` los pasos (c) y (d) colapsan en **OFF**. Así, si el owner
      responde **Q1 = «OFF global»**, el cambio es **una línea** —no un refactor ni una wave nueva— y
      el SPEC declara la divergencia respecto de la letra de D5 («Por defecto APAGADA») junto con esa
      pregunta.
      ⚠ **De dónde sale `hasHistory` — regla única del tren (F5, obligatoria por DECISIONS-2)**:
      **`hasHistory := !showModal`**. Primero se resuelve `showModal` con `resolveShowAutoRestModal`
      (W5.4/W5.5) y recién después se llama `resolveAutoRestDefault({..., hasHistory: !showModal})`.
      **No** sale de `weekStatusDays` ni de `lastSessionByBlock` ni de la racha: esas señales están
      acotadas a los ejercicios del plan abierto o a la semana en curso y dejarían en **OFF sin decisión**
      a un veterano con mesociclo nuevo, al demo y a `stepIndex > 0` (es la regresión **T9** de
      DATA-TESTING §9). Leído en castellano: **la pref solo nace OFF cuando el alumno va a ver el modal
      y decidir**; en cualquier otro caso nace **ON**, que es lo que la base vive hoy. Detalle y
      evidencia en [DATA-TESTING §3.6.a](DATA-TESTING.md). **Firma**:
      `resolveShowAutoRestModal` acepta **`clientId`** además de
      `{hasHistory, isDemo, storageAvailable}` (hoy §3.7 no lo contempla) y devuelve «no mostrar»
      cuando `clientId` no es un uuid no vacío. **Test**: las 4 ramas + **una fila propia para
      `strategy: 'off'`** (que no puede ser rama muerta: entra como fila de la tabla de cohortes, no
      como código sin cubrir) + storage inaccesible ⇒ no mostrar el modal y conservar el default
      vigente (fail-safe) + **un caso con `clientId` nulo** (sumarlo también al test puro W1.T4).
- [ ] W5.3 **(Opus)** Reemplazo de la preferencia vieja: **4 lecturas + 3 escrituras/estado**, no
      «4 puntos». Si solo se repuntan las lecturas, apenas el modal escribe
      `eva:exec-autorest-v1:<clientId>` la regla (b) de **R1** deja de copiar `omni_autotimer` y **el
      toggle de la tuerca queda inerte** (cambia de rótulo pero ya no gobierna nada) ⇒ rompería D5.
      **Etiquetas corregidas** (verificado: `StrengthLogSetForm` va de `LogSetForm.tsx:316` a `:1658`
      y `TypedLogSetRow` empieza en `:1660`; `grep -rn isRestAutoTimerEnabled apps/web/src` ⇒ **0
      resultados**).
      **Lecturas (4)** — reemplazar `isRestAutoTimerEnabled()` por `readAutoRestPref(...)`:
      1. RN `v3/ExecutorV3.tsx:762` (superserie) — punto real.
      2. RN `v3/ExecutorV3.tsx:822` (bloque suelto) — punto real.
      3. Web `LogSetForm.tsx:662` (`buildRest`, **fila de FUERZA**) y 4. `:2034` (**fila TIPADA**): en
         web **la verdad no vive en `LogSetForm`** — las dos ramas leen la **prop** `autoTimerEnabled`
         (`Props:144`, default `true` en `:330` y `:1667`) y el archivo **no tiene** `clientId`. El
         único punto real es el estado del orquestador `WorkoutExecutionClient.tsx:1222-1227`, que pasa
         a `resolveAutoRestDefault({clientId, hasHistory})`. En `LogSetForm` solo cambia la **semántica
         de `cancelRest`** (ver abajo).
      **Escrituras/estado (3)** — pasan por `writeAutoRestPref(clientId, v)`:
      5. RN `v3/ExecSettingsSheet.tsx:101` (`useState(isRestAutoTimerEnabled())`), `:115` (el `sync()`
         del `useEffect`) y `:218` (`setRestAutoTimerEnabled(v)` del `Toggle`) — el sheet gana
         `clientId` como **prop nueva** desde `v3/ExecutorV3.tsx:2173` (donde ya se le pasan props);
         `clientId` ya existe en el orquestador (`:350`, viene de la sesión).
      6. Web `WorkoutExecutionClient.tsx:1222-1227` (estado + lectura post-montaje de `omni_autotimer`).
      7. Web `WorkoutExecutionClient.tsx:1790-1793` (`toggleAutoTimer`, hoy
         `localStorage.setItem('omni_autotimer', …)`).
      **Cambio de comportamiento declarado (CA-80, reescrito sobre R24)**: con la pref **OFF** ya **no
      se cancela** un descanso que el alumno arrancó a mano (hoy `LogSetForm.tsx:662` y `:2034` hacen
      `cancelRest()`; con OFF masivo eso mataría descansos manuales) — y el que lo arranca a mano es
      justamente el CTA **«Descansar N s»** de R24 (W3.16 / W4.17), así que cancelarlo sería matar el
      único camino que le dejamos al alumno nuevo. OFF pasa a significar «no arranco uno nuevo», no
      «mato el que hay». **Se declara en el SPEC y va en UNA línea del aviso general a coaches** del
      cierre (`news_items`, W6.14), **sin mensajes individuales**.
      **Test — `W5.T5`, declarado en [DATA-TESTING §6.2/§6.3](DATA-TESTING.md)** (RN y web): matriz
      **2×4** (pref ON/OFF × pantalla sola / miembro no-último / miembro último / bloque sin
      `rest_time`) verificando **quién** llama `startRest`; **más un test de extremo a extremo del
      toggle**: mover el switch de la tuerca escribe la clave nueva, el lector la ve y **la serie
      siguiente** se comporta según lo elegido (es el criterio 3 de W5 y el que probaría que la tuerca
      sigue gobernando después del modal); **más el caso CA-80**: con la pref **OFF**, cerrar una serie
      **no** llama `cancelRest` sobre un descanso arrancado a mano con el CTA de R24.
- [ ] W5.4 **(Opus)** Señal de «primer entreno» (**R14**) como función pura con test:
      `esPrimerEntreno = previousHistory vacío && exerciseMaxes vacío && sessionLogs.length === 0`.
      Las tres **ya viajan en el bundle** (web `page.tsx:81` ← `_data/workout-execution.queries.ts:245-297`;
      RN `lib/workout-session.ts:257,1203`) ⇒ **0 queries, offline-safe**. Marca «visto» escrita **al
      responder** (o al cerrar sin responder ⇒ marca + OFF). **Falso positivo aceptado y declarado**:
      un alumno veterano con un plan de ejercicios 100 % nuevos vería el modal una vez en su vida.
      Excluidos por construcción: personas E2E (reciben historial sembrado) y los modos `?fecha` /
      `?repetir` / `?recuperar` (RN `app/alumno/workout/[planId].tsx:44-48`, web `page.tsx`).
- [ ] W5.5 **(Opus)** Exclusión del alumno demo (**A7/R14/R32**): `is_demo` se lee **en el fetch raíz
      del alumno**, no en un select condicional. **RN**: sumarlo al select ya existente de
      `apps/mobile/lib/client.ts:17` (`RICH`/`MIN`). **Web**: sumarlo al fetch raíz de
      `apps/web/src/app/c/[coach_slug]/_data/client-root.queries.ts` — `getClientRootUser` (`:33-42`)
      resuelve identidad y su hermano **incondicional y cacheado por request** `getStudentScopeRow`
      (`:58-68`) ya hace el único `.select('id, full_name, coach_id, team_id, org_id')` sobre
      `clients`: se le agrega `is_demo` ahí (**aditivo, 0 queries nuevas**). ⚠ **Lo que NO alcanza**:
      el `from('clients')` del bundle del ejecutor es **condicional** —
      `workout-execution.queries.ts:275-283` solo corre `if (areaIds.length > 0)` y hoy pide
      `'team_id'` ⇒ un alumno **sin áreas** nunca traería `is_demo` y el demo quedaría **sin guard**
      (rompería el T6). El coach entra
      como su alumno demo por «Vive tu app» (`apps/mobile/lib/vive-tu-app.ts:8-16`) y **no** debe ver
      el modal. Si `is_demo` no llega, el fallback es confiar en el historial. **Test**: con
      `is_demo: true` el resolver devuelve «no mostrar».
- [ ] W5.6 **[UI · Fable]** `apps/mobile/components/alumno/workout/v3/AutoRestModalV3.tsx` (**nuevo**),
      montado junto a la tuerca en `v3/ExecutorV3.tsx:2107-2120` (ahí ya están `exec`,
      `motion.reduced` e `insets`), con guard de una sola vez por montaje (`useRef`). `Sheet` con
      `nativeModal` + `forceDark` y `snapPoints` chico. Copys de M.2.
      ⚠ **Disparo — `phase === 'session' && stepIndex === 0` NO alcanza y cae encima del Despegue**:
      `ExecutorV3.tsx:312-317` arranca **directo** en `'session'` cuando se entra por morph, y
      `:363-370` declara que «el overlay del Despegue todavía cubre la pantalla» ⇒ el modal de una sola
      vez se abriría **debajo de la ceremonia de lanzamiento**, justo en el primer entreno, que es su
      único momento. Condiciones completas: `!loading`, **ningún overlay ni sheet abierto**
      (`listOpen`, `settingsOpen`, `substituteBlockId`, `KeypadHost`) y, si `viaMorphRef`, **esperar a
      que el Despegue haya cerrado** suscribiéndose al canal de `v3/session-morph.ts` en vez de asumir
      la fase. **Regla canónica (R32)**: el modal se muestra en el **primer ejercicio** de la sesión,
      **después** de que el overlay del Despegue/morph se retira y la pantalla es interactiva, y **sin
      importar si ese bloque tiene descanso** (la preferencia es **global**; A7 habla del
      comportamiento, no del momento del modal). Con **`clientId` nulo** el modal **no se muestra** y la
      preferencia cae a la clave legacy por dispositivo `omni_autotimer`, que **sí** se lee y se escribe
      (**R32**, igual que W5.1 y W5.7).
- [ ] W5.7 **[UI · Fable]** `apps/web/.../v3/AutoRestModalV3.tsx` (**nuevo**), montado en
      `WorkoutExecutionClient.tsx:3034-3041` dentro de `[data-exec-v3]` **sin portal**, con
      `framer-motion` + `useReducedMotion` como el sheet de ajustes y `.exec-v3-tog` /
      `.exec-v3-tog-knob` (`globals.css:5232,5246`) para el toggle interno. Disparo en efecto
      post-montaje, **nunca** en el initializer, y con **las mismas condiciones que W5.6** (espejo):
      `!loading`, ningún overlay/sheet abierto y la ceremonia de entrada cerrada; se muestra igual
      aunque el primer bloque **no tenga descanso** (R32). ⚠ **`clientId` nulo** (web con
      `rootUser === null`, contemplado en `page.tsx`): la preferencia cae a la clave **legacy por
      dispositivo** `omni_autotimer` —que se **lee y se escribe**, sin clave nueva— y el modal **no se
      muestra** (**R32**; idéntico a W5.1 y W4.7).
- [ ] W5.8 **[UI · Fable]** Filas de la tuerca renombradas: RN `v3/ExecSettingsSheet.tsx:198-221` y
      web `v3/ExecSettingsSheet.tsx:179-207` ⇒ **«Pasar solo al descanso»** con los sublabels de R11b
      (hoy dicen «Cronómetro automático» / «El descanso empieza solo al guardar cada serie»). **Sin
      fila nueva** (dos switches que gobiernan el mismo `startRest` es duplicidad semántica) y **sin
      el `danger` rojo** del OFF. ⚠ **Esta tarea es solo de copy**: el cableado del switch a la clave
      nueva lo hace **W5.3** (puntos 5–7). Una tuerca que cambie de rótulo sin ese cableado sigue
      escribiendo `omni_autotimer` y deja de gobernar la sesión.
- [ ] W5.9 **(Opus)** Evento `rest_autostart_pref_set {source: 'first_modal' | 'settings_sheet',
      enabled}` en las dos superficies (ver W6.1). **Test**: se emite una sola vez por cambio.

**Gate de W5**: `pnpm exec vitest run tests/mobile "apps/web/src/app/c/[coach_slug]/workout/[planId]"`
+ `pnpm --filter @eva/mobile exec tsc --noEmit` +
`pnpm --filter @eva/mobile exec expo export --platform android` + `pnpm typecheck`.

---

## W6 · Analytics, docs, gates y cierre — 1 día-agente · **Fable (jefe)** + owner

- [ ] W6.1 **(Opus)** **4 eventos PostHog** (**R19**, snake_case, sin PII, verificando con grep contra
      `apps/mobile/lib/analytics.ts` que no colisionen): `hold_timer_started {block_id, exercise_type,
      context, side_mode}` · `hold_timer_completed {block_id, exercise_type, context, hold_source,
      closes_round, via_app_state}` (la **propiedad** conserva su nombre canónico de R19; su **valor**
      es el `expiredWhileAway` de W3.1a) · `hold_early_finished {block_id, exercise_type, context,
      elapsed_sec, prescribed_sec}` · `rest_autostart_pref_set {source, enabled}`. **`hold_auto_saved`
      del brief original se elimina** (se fusiona con `hold_timer_completed`). RN por
      `captureAppEvent` (`apps/mobile/lib/analytics.ts:136-139`); web por `ph?.capture` (patrón
      `LogSetForm.tsx:895`). **Aceptación**: los 4 aparecen en PostHog tras el deploy.
- [ ] W6.2 **(Opus)** Sentry en el camino de auto-envío de **las dos** plataformas:
      `captureException(err, { tags: { area: 'hold-autolog' }, extra: { blockId, exerciseType } })`,
      patrón `apps/mobile/components/alumno/workout/v3/session-morph.tsx:311`. **Umbral de alarma**:
      > 2 % de auto-envíos con error en 72 h. **Aceptación**: un error forzado aparece con ese tag.
- [ ] W6.3 **(Opus)** Consulta de adopción a 72 h, declarada en `DATA-TESTING.md` como **la** fuente
      de verdad: `SELECT metadata->>'hold_source', count(*) FROM workout_logs WHERE logged_at >=
      <fecha del deploy> AND actual_hold_sec IS NOT NULL GROUP BY 1`. Declarar también que **no hay
      índice sobre `metadata`** ⇒ la consulta va **acotada por fecha** y no es un dashboard (backlog
      B10).
- [ ] W6.4 SDD versionada en `docs/specs/cuenta-atras-en-pantalla/` (SPEC.md, PLAN.md, TASKS.md,
      DATA-TESTING.md) con frontmatter `status: draft` → `active` al empezar la ejecución → `done` con
      el QA verde; `canonical: false` (la lista de canónicos está hardcodeada en
      `scripts/check-docs.mjs:11-31` y **no** incluye specs de feature). **Aceptación**:
      `pnpm docs:check` verde (valida enlaces relativos rotos y credenciales literales en **todo** el
      Markdown activo).
- [ ] W6.5 `docs/status/CURRENT.md`: **fila** en la tabla de estado activo con link
      enlace «SDD» con ruta `../specs/cuenta-atras-en-pantalla/SPEC.md` (relativa a `docs/status/`) **y** **entrada numerada** en la lista de
      trenes con el patrón `N. **Título — ESTADO** (enlace «tareas» a `../specs/cuenta-atras-en-pantalla/TASKS.md`, hash/deploy/OTA)`.
      **Aceptación**: el archivo queda **≤ 16 KB** (`scripts/check-docs.mjs:106-118`) y `docs:check`
      verde.
- [ ] W6.6 `docs/status/MOBILE_PARITY.md`: bloque de cita (`>`) **fechado** arriba del resumen
      ejecutivo, con hash, deploy y **ambos** hashes de OTA, nombrando explícitamente: el mismo motor
      (`useCountdown` / `useExecCountdown` + `hold-autolog`), la superserie (RN `SupersetScreenV3.tsx`
      / web `SupersetStepV3.tsx`), el builder «Reps | Segundos» (RN `BlockEditorSheet.tsx` / web
      `BlockEditSheet.tsx`) y la preferencia D5 en el `ExecSettingsSheet` de ambas plataformas.
      **Aceptación**: cada punto dice «paridad nueva», «solo web» o «solo RN».
- [ ] W6.7 `docs/testing/TEST_STATUS.md`: registrar la **tabla de baseline de CI rojo preexistente**
      (`nutrition-smoke` sin `NEXT_PUBLIC_SUPABASE_*`; `profile-analytics/overview.test.ts` rojo según
      la hora) para no declarar verde lo que ya estaba rojo, y los gates nuevos del tren.
      **Aceptación**: `docs:check` verde y el archivo sigue siendo canónico válido.
- [ ] W6.8 `docs/operations/MOBILE_RELEASES_OTA.md`: registrar la publicación (tag, grupos
      android/ios y `run id`). **Aceptación**: las dos corridas citadas y verdes.
- [ ] W6.9 **Gates completos, ejecución real** (tabla abajo). **Aceptación**: ninguna casilla verde sin
      salida de consola.
- [ ] W6.10 Playwright del caso canónico **solo al cierre**, 1 navegador: superserie «Dia B» ⇒ el
      reloj corre bajo el video (V1), llega a 0, la serie aparece guardada sin tocar nada (V2) y la
      tarjeta salta al miembro siguiente (V4). **Entra con seed sintético**: se amplía
      `seed:e2e-personas` (`tests/separation/personas.ts`, `docs/testing/E2E_PERSONAS.md`) con un
      **alumno E2E** que tenga la superserie de movilidad `per_side` que hoy **no existe** en ninguna
      persona — **nunca** se corre contra datos de **Movens** ni de ningún alumno real. El **assert
      final es de DB en solo lectura** (la fila de `workout_logs` con `actual_hold_sec` y
      `metadata.hold_source`), sin escribir nada fuera del seed. **Aceptación**: verde, o —si no
      cabe— **es el último recorte del tren** (R38) y queda con **causa anotada** y decisión del owner
      (precedente: en el tren anterior faltaban las vars `E2E_*` y se corrió por GitHub Actions).
- [ ] W6.11 **Verificar que M1 y M2 ya están aplicadas** antes de desplegar (se aplicaron en **W0.9**,
      no acá). Sigue valiendo **R4**: un cliente nuevo que escriba `'sec'` contra una DB vieja recibe
      `23514`; con las migraciones ya en LIVE desde W0, el deploy web y la OTA nunca se adelantan al
      esquema. **Aceptación**: `list_migrations` muestra las 2 con su timestamp y
      `has_function_privilege` confirma la ACL de `get_client_exercise_prs` idéntica a la previa; si
      **alguna faltara**, el deploy se detiene y se aplica antes de continuar.
- [ ] W6.12 Deploy web a Vercel desde `rnmobiledenuevo` = `master`. **Aceptación**: `deployment id` en
      estado READY anotado en CURRENT y MOBILE_PARITY; `pnpm qa:prod:suave` verde después.
- [ ] W6.13 **Aviso a Gerardo (Movens)**, redactado y enviado por el owner **después del deploy y
      antes de la OTA**, con los tres efectos que el tren acepta: (a) sus **21 bloques de movilidad en
      superserie** ahora traen reloj y se guardan solos al llegar a 0; (b) «plancha frontal mantenida»
      (hoy Cardio 3 × 1 min) puede pasar a **Fuerza por tiempo** con carga y RIR — **el cambio lo hace
      él, el tren no migra datos**; (c) **flota mixta**: un alumno en 1.1.2 sin la OTA ve el bloque en
      modo tiempo como fuerza clásica con `reps = "30s"` de objetivo y registra a mano (degradación
      honesta, sin crash). **Aceptación**: el texto queda citado en `DATA-TESTING.md`.
- [ ] W6.14 **Aviso general a coaches** (`news_items`), redactado y enviado por el owner **después del
      deploy y antes de la OTA**, con **dos líneas** que este tren debe a los coaches y que **no van
      como mensajes individuales** (**R35** + DECISIONS-2): (a) **M2 cambia récords ya listados** —
      617 filas, 25 alumnos, **72 pares alumno×ejercicio afectados**: un «récord» que en realidad era
      un hold con disco y **0 repeticiones** deja de figurar como PR; (b) **cambio vivo de W5.3** — con
      «Pasar solo al descanso» **apagado** ya **no se corta** un descanso que el alumno arrancó a mano.
      **Aceptación**: el texto queda citado en `DATA-TESTING.md` y la novedad publicada antes de la
      OTA.
- [ ] W6.15 OTA 1.1.2 android + ios por `.github/workflows/mobile-ota.yml` (**publicar a mano está
      prohibido por runbook**), **última del orden**. Antes: releer el estado real en App Store Connect
      con `ios-submit-review.yml` en `dry_run=true` para confirmar el piso. **Aceptación**: los dos
      grupos EAS Update verdes, con hash y `run id` anotados.
- [ ] W6.16 Memoria del owner: actualizar los ganchos de `project_ejecutor_entreno.md`,
      `project_rn_paridad_web.md`, `project_builder_y_programas.md` y `project_coaches_casos.md` (caso
      Movens). **Aceptación**: el índice de memoria sigue ≤ 45 líneas y no duplica estado del repo.

### Android — sin código en este tren (A6)

- [ ] W6.17 **Runbook del owner (Play Console, fuera del repo)**, para el segundo punto del mensaje de
      Movens («algunos usuarios de Android aún no tienen habilitada la app»): (1) confirmar que el
      alumno usa la **misma cuenta Google** con la que se lo invitó; (2) el owner agrega ese correo a
      la lista de testers en Play Console → Testing → Closed testing; (3) el alumno abre el link de
      opt-in con esa cuenta y acepta ser tester; (4) recién ahí Play Store le muestra «Instalar» (sin
      el opt-in la app **no aparece**, es comportamiento de la plataforma); (5) instala build 86,
      runtime 1.1.2, y entra con su código de coach; (6) **alternativa inmediata sin depender de
      Play**: la **PWA** desde Chrome — el prompt nativo `beforeinstallprompt`
      (`apps/web/src/components/InstallPrompt.tsx:230`) o «Instalar la app» siempre visible en el
      perfil (`apps/web/src/components/client/PwaNavButton.tsx:19-20,54`), ya en producción.
      **Aceptación**: el owner confirma que los alumnos Android de Movens quedaron habilitados o
      quedaron con la PWA.
- [ ] W6.18 **Runbook «cuando Google apruebe producción»** (respuesta esperada ≤ 13-09): Producción →
      Crear versión con el **mismo AAB build 86** (sin cambio nativo no se fuerza build,
      `docs/operations/MOBILE_RELEASES_OTA.md:101-111`) → países → revisión. **Aceptación**: versión
      de producción creada y aprobada.
- [ ] W6.19 **Copy iOS y Android — NO aplicar hasta el correo de Google.** Diff preparado y en espera
      en **2 archivos + 1 test**:
      `apps/mobile/components/coach/InviteStudent.tsx:214` («Tu alumno entra desde el navegador con tu
      link o desde la app en iOS. No necesita instalar nada.» → «…en iOS **y Android**. No necesita
      instalar nada.») y
      `apps/web/src/lib/email/transactional-templates.ts:270`
      (`STUDENT_ACCESS_NO_INSTALL_LABEL`, mismo cambio), con su guard
      `apps/web/src/lib/email/transactional-templates.test.ts:284`, que **fija el string literal** y
      rompe CI si se cambia uno sin el otro ⇒ los tres se mueven en el **mismo commit**. La variante
      web `apps/web/src/app/coach/dashboard/_components/invite/InviteStudentSheet.tsx:159` **no
      menciona iOS** y no se toca. Es texto puro (JS): sale por deploy + OTA, sin build nativa.
      **Aceptación**: `grep -rn "app en iOS" apps tests` ⇒ 0 resultados tras aplicarlo, y
      `transactional-templates.test.ts` verde.
- [ ] W6.20 Al aplicar W6.19, actualizar `docs/operations/MOBILE_RELEASES_OTA.md:79` («closed testing
      Alpha» → «producción») y `docs/status/CURRENT.md` (las dos menciones de Android en Alpha).
      **Aceptación**: `docs:check` verde.

### Gates (tabla a completar con la ejecución real)

| Gate | Comando | Resultado |
|---|---|---|
| Tests | `pnpm test` | |
| Motor y schemas | `pnpm exec vitest run packages/workout-engine packages/schemas packages/plan-builder` | |
| Typecheck web | `pnpm typecheck` | |
| Typecheck mobile | `pnpm --filter @eva/mobile exec tsc --noEmit` | |
| Bundle mobile | `pnpm --filter @eva/mobile exec expo export --platform android` | |
| Lint | `pnpm lint` | |
| Tokens | `pnpm check:tokens` | |
| Docs | `pnpm docs:check` | |
| E2E ejecutor | `pnpm test:e2e` (1 navegador, solo al cierre) | |
| Humo prod | `pnpm qa:prod:suave` (después del deploy) | |
| SQL | tx-rollback ×2 + conteo de filas en violación (0) + **prueba positiva del CHECK sobre un bloque temporal del alumno E2E, con `ROLLBACK`** + `EXPLAIN` de `get_client_exercise_prs` | |

**Baseline de CI rojo preexistente (no se declara verde lo que ya estaba rojo):** `nutrition-smoke`
(job sin `NEXT_PUBLIC_SUPABASE_*`) y `apps/web/.../profile-analytics/overview.test.ts` (rojo según la
hora del día). Ninguno lo toca este tren.

---

## QA del owner (solo contra algo desplegado; 3 plataformas)

**El checklist canónico del QA del owner es [DATA-TESTING §7](DATA-TESTING.md)** — uno solo en todo el
SDD, para que ningún punto obligatorio viva en un archivo y falte en el otro. Son **45 puntos**:
**§7.1** RN iOS device con la OTA aplicada (**18**), **§7.2** PWA móvil, Chrome Android + Safari iOS
(**15**) y **§7.3** web desktop, sesión de coach (**12**), más **§7.4** los casos de **Movens en solo
lectura**. Ahí viven, entre otros, los puntos que el SPEC declara obligatorios y que no pueden
recortarse: **keep-awake** (CA-96, §7.1 punto 17), **movilidad sin `duration_sec`** (CA-97/R29, §7.1
punto 18), **notificación del SO** (R31, §7.1 punto 16 y §7.2 punto 14) y **R24 «con la preferencia
apagada, ¿hay cómo descansar?»** (§7.1 punto 15 y §7.2 punto 13). Acá no se duplica ningún punto: si
una tarea necesita citar uno, lo cita por `§7.x punto N`.

Caso canónico en todas las plataformas: coach **Movens**, plan **«Dia B»**, superserie B = «Plancha
lateral con rodillas apoyadas» (movilidad 3 × 30 s/lado, `per_side`) + «Press pallof horizontal con
banda» (fuerza 3 × 8-12, `per_side`, descanso 90 s); fuerza por tiempo = «plancha frontal mantenida»
convertida a `3 × 30 s · 10 kg`. **Los datos de Movens son de solo lectura**: para registrar series va
el alumno de prueba con el plan sintético del seed (DATA-TESTING §6.5).

Lo ejecuta el owner en **W6**, después del deploy y de la OTA; **transversal y bloqueante del tren**:
en cada plataforma se repite el recorrido con un alumno de control **sin ningún bloque por tiempo** y
cualquier diferencia visible frena el cierre.

---

## Backlog heredado (para próximas sesiones; ninguno bloquea)

| # | Deuda | Dónde | Costo estimado |
|---|---|---|---|
| B1 | **Roller con cuenta atrás** (R12): RN usa cronómetro **ascendente** (`RollerScreenV3.tsx:103` `useStopwatch`) y la web **no tiene countdown** en roller ⇒ trabajo nuevo, no reuso. Movens tiene **0** roller con `duration_sec`; global 17 de 85. `HoldModuleV3` nace con `kind: 'mobility' \| 'strength_time'` y deja `'roller'` documentado como extensión | `RollerScreenV3.tsx`, `RollerStepV3.tsx` | 1 día |
| B2 | **`holdAnchor` persistido** (R13): si el SO mata el proceso en background, el hold en curso se pierde y el alumno lo reinicia. Mitigación OTA: persistir el `endTime` en el `SessionDraft` que ya existe (`workout-session.ts:391-398`) | `v3/use-hold-module.ts` + `workout-session.ts` | 0,5 día |
| B3 | **Sonido a 0** (R18): `expo-audio` está instalada pero `sound.ts:23-27` declara que la reproducción real «se confirma en device» ⇒ no se promete sin QA de device previa | `timers/sound.ts` | 0,5 día + QA device |
| B4 | **Live Activity / lockscreen del hold**: `LiveActivityKind` es `'rest' \| 'cardio'` y el archivo declara que exige **build EAS nuevo** (`timers/live-activity.ts:31,34`) ⇒ imposible por OTA | `timers/live-activity*` | build nativa |
| B5 | **Sincronización servidor de la preferencia D5**: hoy es storage local ⇒ no viaja web ↔ RN y el modal sale una vez por superficie. Requiere 1 política RLS aditiva (`client_feature_prefs` **no** admite escritura del alumno, `20260618200000_feature_prefs.sql:102-115`) | `supabase/migrations` + `auto-rest-pref.ts` ×2 | 0,5 día |
| B6 | **PR / e1RM en modo tiempo** (A4): hoy `detectPR` descarta por `reps_done > 0` ⇒ nunca celebra. «Récord de tiempo bajo carga» es feature nueva | `pr-detect.ts` | 1 día |
| B7 | **Frenar el salto de paso** tras un guardado por reloj (R5, pregunta Q2 al owner) | `ExecutorV3.tsx:1798-1811`, `WorkoutExecutionClient.tsx:1967-1973` | 0,25 día |
| B8 | `TemplatePickerDialog.tsx:102-148` **no copia `warmup_rest_time`** (deuda preexistente; se agrava si el modo tiempo se usa en calentamientos) | builder web | 15 min |
| B9 | `mergeBlocksForSync` empareja por `order_index`: convertir un bloque a segundos en el plan del alumno sin `is_override` puede **revertirse** al sincronizar la plantilla (deuda preexistente) | `workout.service.ts:1359-1371` | 0,5 día |
| B10 | Índice sobre `metadata` para consultar `hold_source` a escala (hoy la consulta de adopción va acotada por fecha) | `supabase/migrations` | 30 min |
| B11 | Persona/seed E2E con superserie de movilidad `per_side` (hoy no existe ninguna en `docs/testing/E2E_PERSONAS.md`) | `tests/separation/personas.ts` | 0,5 día |
| B12 | Fuera de alcance por decisión del owner: cardio (no se toca) · Play a producción (calendario ≤ 13-09) · cobros coach→alumno | — | — |
| B13 | **`RestOptions` de la web sin `countKind`/`setIndex`/`setTotal`** (`WorkoutTimerProvider.tsx:18-21` acepta solo `{label, warmup}`; `grep countKind apps/web` ⇒ 0 hits) ⇒ el interstitial de la PWA no puede decir «Ronda N de M» como el de RN (`TimerProvider.tsx:39,52`). Este tren declara esos tres campos **solo RN** (W4.7) | `WorkoutTimerProvider.tsx`, `ActiveTimer` | 0,25 día |
