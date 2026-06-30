# SPEC — Entrenamiento Movida: ejercicios polimórficos + cardio TrainingPeaks-lite

**Estado:** DRAFT (listo para implementar tras OK)
**Última actualización:** 2026-06-11
**Plan maestro:** `docs/archive/movida/02-PLAN-entrenamiento.md` · Director: `docs/archive/movida/00-DIRECTOR.md`
**Branch:** `feat/movida-platform`

---

## Problema / Por qué

El builder y la ejecución del alumno hoy solo modelan **fuerza**: `sets` int + `reps` texto +
`target_weight_kg` + tempo/RIR/rest (`workout_blocks`), y el log del alumno solo captura
`weight_kg`/`reps_done`/`rpe`/`rir` (`workout_logs`). El Excel real de Movida (`martin Guerra.xlsx`)
y el template correctivo (Villarroel) prescriben además **cardio** (distancia/duración/pace/zona FC/
intervalos), **movilidad** (holds por lado, respiraciones) y **foam roller** (duración o pasadas), con
transversales que hoy no caben: por-lado (`6 x l`), carga polimórfica (kg/lb/segundos/sin carga),
carga + distancia simultáneas (farmer carry), e instrucciones por ejercicio asignado.

Además, en el pool de Movida cada coach crea ejercicios **privados** (`exercises.coach_id`): sin
ownership de team en el catálogo, un ejercicio creado por un kine es invisible para los otros 29
miembros (rompe el full-access plano del team).

Sin esto, Movida no puede cargar sus sesiones reales en EVA — es bloqueante del deal (milestone M3
"Entreno completo" del Director).

## Alcance

Dos sub-features con gating distinto (decisión abajo):

**A. Ejercicios polimórficos por tipo (BASE, sin toggle).**
- `exercises.exercise_type` (`strength|cardio|mobility|roller`) + ownership `team` en el catálogo,
  con regla anti-fantasma en el pool: en workspace team el catálogo ASIGNABLE = system+team; los
  ejercicios personales se prescriben vía "Copiar al team" (copy-on-use a scope team — ver AC11).
- Prescripción polimórfica en `workout_blocks` (columnas tipadas nuevas, nullable) + espejo en
  `workout_logs`, con coexistencia total con `reps` texto legacy (expand-contract).
- UI coach por tipo (BlockEditSheet con 4 formularios, resumen por tipo en ExerciseBlock, selector
  de tipo en ExerciseFormModal) y UI alumno por tipo (LogSetForm variantes, historia por tipo),
  preservando `useActionState`+`useOptimistic`+offline queue.
- Timers: contrato extendido de `WorkoutTimerProvider` (`startRest` + `startHold` + `startInterval`
  + `startStopwatch`), un solo timer activo.
- Seed de ejercicios cardio/movilidad/roller vía script idempotente + CSV versionado con `scope`
  explícito por fila: genéricos curados propios → `system`; lista del kine + Villarroel → `team`
  de Movida (decisión #11 del PLAN).

**B. Cardio "TrainingPeaks-lite" (MÓDULO `cardio`, toggleable).**
- Cálculo puro en `packages/calc/` (FCmax Tanaka/clásica, 5 zonas %FCmax, Karvonen, pace/tiempo/
  distancia/km/h, duración de intervalos). Sin TSS/NP/IF/PMC/FTP (omitidos a propósito).
- Perfil cardio del cliente: `birth_date`, `resting_hr`, `max_hr_override`, `ref_5k_time_sec`
  (hoy NO existen en `clients` — verificado en `database.types.ts`).
- Calculadora de zonas/pace para el coach (`/coach/cardio`) + chips de zona personalizada en el
  builder y en la ejecución del alumno ("Z4 · 150–168 bpm").
- Plantillas de intervalos **system en código** (sin tabla nueva v1); plantillas curadas del coach =
  programas template existentes (ya compartidos en el pool).

### Decisión de gating (pedida por el encargo)

- **Polimórfico = BASE sin toggle.** Es una extensión del núcleo del builder: no agrega superficie
  de navegación propia, los planes legacy se ven idénticos vía fallback (`reps` texto), y un coach
  que no lo usa simplemente nunca elige otro tipo. Ponerlo detrás de un toggle obligaría a duplicar
  formularios y a gatear el catálogo system (cardio/movilidad seedeados) de forma artificial.
- **Inteligencia cardio = módulo `cardio`** (key YA declarada en `MODULE_KEYS` de
  `services/entitlements.service.ts`). Gating server-side con `assertModule(db, 'cardio', {teamId|coachId})`
  al tope de toda action/RSC del módulo; entrada de nav vía `NAV_MODULES` con `entitlement: 'cardio'`.
  OFF por defecto; Movida lo tiene ON a nivel team (el pool manda).

## Fuera de alcance

- Fase CONTRACT: dropear `reps`/`section` legacy (futuro, fuera de este SPEC).
- TSS/rTSS, Normalized Power, IF, PMC, FTP en watts (decisión LOCKED del plan 02).
- Generador automático de sesiones HYROX (v1: plantillas curadas).
- Integración con relojes/bandas FC (import de FC real); `actual_avg_hr` se ingresa a mano.
- Tabla `cardio_templates` con CRUD (v1: plantillas system en código; revisar si Ani pide CRUD).
- Logging por lado separado (L/R como filas distintas) — v1 un registro por set, lado en `metadata`.
- Enterprise: el módulo cardio no se habilita para `enterprise_coach` v1 (enterprise intacto).

## User stories

1. Como coach del pool, quiero prescribir un bloque de **carrera por intervalos** (8×400m @ Z4,
   recuperación 90s) para que el alumno lo vea con sus rangos de FC personalizados.
2. Como kine del pool, quiero prescribir **movilidad por lado** (30s hold ×3 por lado, con tempo de
   respiración) y que el alumno tenga un timer de hold que vibre al terminar.
3. Como coach, quiero prescribir un **farmer carry** con carga (kg o lb) + distancia (7,5 m) + por
   lado simultáneos, sin perder ningún eje al guardar ni al registrar.
4. Como miembro del team, quiero que un ejercicio creado por otro miembro **aparezca en mi catálogo**
   para no duplicar trabajo (full-access plano).
5. Como alumno, quiero **registrar** lo que hice según el tipo (duración/distancia/FC promedio en
   cardio; hold en movilidad; pasadas en roller), también sin conexión.
6. Como alumno, quiero un **timer de intervalos** (trabajo/descanso, N de M) con beep/vibración para
   no mirar el teléfono mientras entreno.
7. Como coach con el módulo cardio ON, quiero una **calculadora de zonas y pace** (Tanaka/Karvonen)
   precargada con los datos del alumno para prescribir sin Excel.
8. Como operador (CEO), quiero que el módulo cardio sea **toggleable por team/coach** y apagable a
   nivel plataforma sin migración.

## Criterios de aceptación (AC medibles)

- **AC1 (round-trip polimórfico):** crear en el builder un bloque cardio con `duration_sec`,
  `distance_value/unit`, `hr_zone` e `interval_config`; guardar; recargar → todos los campos intactos
  y el resumen del bloque muestra "8×400m @ Z4" (no "8-10 reps").
- **AC2 (farmer carry tri-eje):** bloque con `load_type='weight'` + `load_unit='lb'` + `distance_value=7.5`
  + `side_mode='per_side'` coexisten, hacen round-trip y el log del alumno no pierde ningún eje.
- **AC3 (coexistencia reps, cero regresión):** un plan legacy (solo `reps='8-10'`, columnas nuevas NULL)
  se ve **idéntico a hoy** en builder, ejecución del alumno, preview e impresión. `reps='AMRAP'` y
  `reps='al fallo'` no rompen (`reps_value` NULL + fallback texto). Verificado contra baselines unit F0.
- **AC4 (log alumno + offline):** el alumno registra un set cardio (duración/distancia/FC) y queda en
  `workout_logs` con las columnas nuevas; sin conexión, el log entra a la cola offline y se sincroniza
  al reconectar con los campos nuevos completos. RLS: el alumno NO lee logs de otro alumno (policies
  endurecidas `20260530170000`/`20260608120000` siguen en verde).
- **AC5 (timers):** HoldTimer cuenta regresiva y vibra/beep al llegar a 0; IntervalTimer muestra
  trabajo/descanso + "intervalo N de M"; Stopwatch cuenta hacia arriba con vueltas; **un solo timer
  activo** (el nuevo reemplaza con confirmación suave); overlays respetan safe-area y `useReducedMotion`.
- **AC6 (catálogo team, lectura Y escritura):** ejercicio creado en contexto team (`team_id` set,
  `coach_id`/`org_id` NULL) es visible/editable por los demás miembros activos del team y por los
  alumnos del pool; NO es visible para coaches standalone ajenos, otros teams ni enterprise. En
  escritura: un UPDATE que re-apunte `team_id` a un team ajeno es RECHAZADO por RLS (el WITH CHECK
  del update exige `team_id IN (SELECT current_user_team_ids())` — sin inyección cross-team). El
  catálogo system EXISTENTE queda intacto (las únicas altas system permitidas son las del seed
  genérico curado de F8 — decisión de scope explícita, #11 del PLAN).
- **AC7 (gating módulo):** con `cardio` OFF, el ítem de nav no aparece y las actions del módulo
  lanzan `Modulo no habilitado: cardio` (server-side, no solo UI). Con ON a nivel team, un alumno del
  pool con `birth_date` ve sus zonas personalizadas. El flag de operador de plataforma apaga el módulo
  para todos sin migración.
- **AC8 (golden fixtures cardio):** Tanaka edad 30 = 187; clásica `220−30` = 190; Z4 sobre 187 =
  150–168 bpm; Karvonen (reposo 60, 70%) ≈ 149; pace 5:00/km → 5K = 1500 s = 25:00; `3600/300` =
  12 km/h; pace milla de 5:00/km ≈ 8:03. Redondeo a segundos enteros. Tests Vitest en `packages/calc`.
- **AC9 (privacidad):** `birth_date`/`resting_hr` son datos personales/salud: solo visibles por el
  scope ya existente de `clients` (coach dueño / pool / el propio alumno); su captura en el pool queda
  cubierta por el consentimiento ya implementado (gate `/t/[team]/consent`).
- **AC10 (calidad por tanda):** `pnpm typecheck` + `pnpm test` (Vitest) verdes en cada tanda. Los E2E
  (`tests/movida/cardio-builder-execution.spec.ts`, `tests/movida/mobility-timer.spec.ts`) se ESCRIBEN
  en la tanda pero se corren SOLO en el gate final autorizado (regla 2026-06-10).
- **AC11 (sin ejercicios fantasma en el pool):** en workspace team, el catálogo ASIGNABLE del builder
  es system+team; un plan de un alumno del pool nunca queda referenciando un ejercicio personal
  (`coach_id`). Prescribir uno propio pasa por "Copiar al team" (copy-on-use: crea o reutiliza la fila
  team por nombre normalizado y el bloque referencia esa copia). Verificación: la ejecución del alumno
  del pool siempre rinde nombre/gif/instrucciones del bloque (nunca un bloque vacío por RLS), y otro
  coach del pool que abra ese programa ve el mismo ejercicio.

## Research 2026

Verificado 2026-06-11 (búsquedas web fechadas; detalle de fórmulas en plan 02):

- **Targets dinámicos por atleta (TrainingPeaks):** el Structured Workout Builder prescribe cada paso
  por **zona** (FC/pace/power/RPE) y calcula los targets numéricos **al aplicar el workout al atleta**,
  según sus umbrales/zonas vigentes — el mismo workout sirve para todos los atletas y sobrevive a
  cambios de fitness. Adoptamos exactamente eso: el bloque guarda `hr_zone` (1-5), los bpm se calculan
  por alumno al renderizar (nunca se persisten bpm absolutos en la prescripción).
  Fuentes: [Structured Workout Builder](https://help.trainingpeaks.com/hc/en-us/articles/235164967-Structured-Workout-Builder),
  [HR-Based Structured Workouts](https://help.trainingpeaks.com/hc/en-us/articles/34754827060493-Heart-Rate-Based-Structured-Workouts),
  [Workout Builder](https://www.trainingpeaks.com/learn/articles/introducing-trainingpeaks-workout-builder/).
- **Estructura de intervalos (intervals.icu):** pasos con target por zona o valor + bloques repeat
  anidados; zonas custom ancladas a umbrales. Hay demanda comunitaria de tipo de actividad **HYROX**
  (híbrido run/estación) sin soporte dedicado — nicho que Team puede capturar con días mixtos
  fuerza+cardio (ya habilitados por tipos + áreas custom). Fuentes:
  [Workout Builder](https://www.intervals.icu/features/workout-builder/),
  [Custom Zones](https://www.intervals.icu/features/custom-zones),
  [HYROX Activity Type (forum)](https://forum.intervals.icu/t/hyrox-activity-type/113336).
- **Taxonomía de tipos de set (Hevy, estándar de facto 2026):** weight+reps, bodyweight, weighted
  bodyweight, assisted, **duration**, duration+weight, **distance+duration**, **weight+distance**
  (suitcase/farmer carry). Confirma nuestro modelo de **ejes ortogonales** (reps/duración/distancia/
  carga/lado) en vez de un enum de combinaciones: el farmer carry tri-eje de Movida no cabe en enums.
  Trainerize/Everfit agregan targets de RPE/%1RM/tempo por set. Fuentes:
  [Hevy — Exercise Programming Options](https://www.hevyapp.com/features/exercise-programming-options/),
  [Hevy Coach vs Trainerize](https://hevycoach.com/compare/trainerize/),
  [Hevy Coach vs Everfit](https://hevycoach.com/compare/everfit/).
- **Zonas FC (consenso 2026):** Tanaka `208 − 0.7·edad` es más precisa que `220 − edad` (que
  sobreestima en jóvenes y subestima en mayores); Karvonen (reserva FC) personaliza mejor cuando hay
  FC de reposo medida; las apps modernas ofrecen ambas con 5 zonas color-coded. Default: Tanaka,
  Karvonen si hay `resting_hr`, override manual si el coach midió FCmax real. Fuentes:
  [HR Zone Calculator 2026 (CalcBin)](https://calcbin.com/tools/heart-rate-zone-calculator),
  [Tanaka vs Karvonen (Average Joe Cyclist)](https://averagejoecyclist.com/true-heart-rate-zones/),
  [5-zone model](https://www.calculatorian.com/en/articles/health/heart-rate-training-zones).
- **Timers PWA:** Screen Wake Lock requiere gesto del usuario, debe ser **toggle visible** con nota
  de batería y re-adquirirse en `visibilitychange`; `navigator.vibrate` funciona en Chrome/Android
  pero **NO en Safari/iOS** → el beep de audio (Web Audio, activado por gesto) es el canal primario y
  la vibración es refuerzo; háptica con moderación (solo eventos importantes: fin de hold, cambio
  work/rest). Fuentes: [Screen Wake Lock PWA](https://progressier.com/pwa-capabilities/screen-wake-lock),
  [Vibration (PWA Bundle)](https://pwa.spomky-labs.com/symfony-ux/vibration),
  [Haptic feedback UX](https://medium.com/@officialsafamarva/haptic-feedback-in-web-design-ux-you-can-feel-10e1a5095cee).

## Riesgo

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Regresión en builder/ejecución (núcleo compartido, recién refactorizado a áreas) | ALTO | Solo campos nuevos nullable + fallback `reps` texto; baselines unit F0 (schema passthrough, resumen legacy); byte-identical para bloques sin tipo |
| Reescritura de policies RLS de `exercises` (leak team→system) | ALTO | El predicado system pasa a exigir `team_id IS NULL`; CHECK `num_nonnulls(coach,org,team)<=1`; suite SQL de aislamiento del catálogo; advisors 0 críticos en branch |
| `reps` máx 20 chars vs resumen legacy generado | MEDIO | Generador de resumen con presupuesto de 20 chars + tests de truncado |
| Vibración inexistente en iOS (alumnos iPhone) | MEDIO | Beep Web Audio primario + UI visual fuerte; vibración solo refuerzo |
| Migraciones sobre hot tables (`workout_blocks`, `workout_logs`) | MEDIO | Solo `ADD COLUMN` nullable (metadata-only, sin rewrite); CHECKs `NOT VALID`+`VALIDATE` solo en tablas chicas; pre-check read-only en prod de filas legacy ANTES del merge (el VALIDATE re-corre contra la data real); branch efímero Pro + snapshot pre-merge |
| Seed de ejercicios depende de insumos de Ani | MEDIO | Script idempotente desacoplado; seed mínimo curado propio para no bloquear el resto |
| Disk IO Budget Micro (incidente 2026-06-10) | MEDIO | Por tanda solo typecheck+vitest; E2E/SQL una sola corrida al gate autorizado |

## Bloqueantes a pedirle a Ani (extiende §7 del Director — solo lo NUEVO de Plan 2)

- **Lista de ejercicios del kine** (movilidad/foam roller) con nombres canónicos en español + el
  template Villarroel confirmado → insumo del CSV de seed (bloquea go-live del seed, no el código).
  Esta lista entra con scope `team` de Movida (privada del pool — decisión #11 del PLAN).
- **Cómo prescriben intensidad cardio hoy:** ¿por zona FC, por pace, o por sensación (RPE)? ¿Los
  alumnos tienen reloj/banda de FC o registran a mano?
- **Datos de ingreso:** ¿miden FC en reposo y registran fecha de nacimiento al ingresar al centro?
  (habilita Karvonen y zonas personalizadas desde el día 1).
- **Display al alumno:** ¿quieren que el alumno vea los bpm objetivo ("150–168") o solo la zona
  ("Z4")? (sensibilidad/simplicidad).
- **2-3 sesiones HYROX/híbridas reales del box** (ya pedido en §7 — falta concretar formato de
  intervalos típico: distancias, estaciones, descansos) → calibra las plantillas system v1.

## Preguntas abiertas (no dependen de Ani)

- [ ] ¿Backfill curado de `exercise_type` para ejercicios system obviamente cardio (ej. "Burpees",
  "Mountain climbers")? Propuesta: sí, script `_POST_DEPLOY_` idempotente por nombre (lista corta revisada).
- [ ] ¿`/coach/cardio` como página propia de nav o solo herramientas embebidas en builder/perfil?
  Propuesta v1: página liviana (calculadora + galería de plantillas) — validar con uso real.
- [ ] Flag de operador por módulo: env `DISABLED_MODULE_KEYS` (propuesta v1, sin DB) vs tabla
  `feature_flags`. El Director §3 acepta ambas; env requiere redeploy para cambiar.
