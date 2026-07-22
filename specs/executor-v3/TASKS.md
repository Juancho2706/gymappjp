# TASKS — Ejecutor V3 (por olas y unidades worker-sized)

> [P] = paralelizable dentro de su wave · [S] = secuencial (comparte archivos con la anterior). Cada unidad: entregable + archivos núcleo + gate. Los mockups `docs/research/executor-redesign/mockups/*` son el contrato visual; la síntesis `00-DIRECCION-DISENO.md` el contrato de producto.

## Ola 0 — Cimientos

- [x] **E0.1 [P] Motion tokens + eventos + tiers** — `packages/workout-engine/src/motion-tokens.ts` + `celebration.ts` (evento semántico tipado → tier micro/media/épica) + export en `index.ts`; unit tests. Sin UI.
- [x] **E0.2 [P] Funciones puras cardio/PR** — `cardio-progress.ts` (objetivo+avance→%/restante, usa `formatTypedObjective`/`buildIntervalPhases`), `hr-zone.ts` (`hrToZone(bpm, perfil)` con `resting_hr`/`max_hr_override`), `pr-detect.ts` (excluye sustituidos, reusa lógica `session-summary`); unit tests exhaustivos.
- [x] **E0.3 [S] Subir keypad-flow + set-log-payload al engine** — mover `apps/mobile/components/alumno/workout/keypad-flow.ts` y `set-log-payload.ts` a `packages/workout-engine/src/`; consumir desde mobile; web `LogSetForm.tsx` reemplaza su mapeo espejado por el del package. **Test de paridad de payload antes/después** (fixture por tipo). Riesgo alto: toca ejecutor vivo.
- [x] **E0.4 [P] Escalas RPE/RIR** — corrección CEO 2026-07-22: RPE 1-10 (queda como estaba), RIR 0-10 (`rir` min 0 en Zod); DB alineada (rir check ya 0-10; rpe check 1-10). El componente de escala del rediseño (Ola 2) muestra RPE desde 1 y RIR desde 0.
- [x] **E0.5 [S tras E0.3] Metadata holds por lado (5 superficies)** — `WorkoutLogSetSchema.metadata` record opcional `{left_sec?, right_sec?}` (patrón `extra_targets`); `WorkoutOfflineLog`, `ReconciledSessionLog`, `OptimisticLogPayload`, `typedLogValues` + `typedKeypadFields('mobility')` condicionado por `side_mode`; verificar grant de `workout_logs.metadata`; tests de reconciliación con sides (el bug forense de hold como caso).
- [x] **E0.6 [P] Migración `coaches.executor_theme`** — aditiva `text default 'coach'` + column-level grant UPDATE coach; protocolo AGENTS.md (tx-rollback + advisors); tipos regenerados.
- [x] **E0.7 [S tras E0.6] Toggle en creador de marca + propagación** — UI white-label del coach (web, claro/oscuro) con preview mini; branding payload web (layouts `/c` y `/coach`) + RN (`/api/mobile/config`/branding) expone `executor_theme`; tokens `--zone-z1..z5` fijos en `globals.css` + RN brand-kit.
- **Gate Ola 0**: ✅ CERRADA 2026-07-22 — lint 0 errores, typecheck web+mobile, tokens 86/86, boundaries, docs, suite completa 3522 tests. Migraciones executor_theme + rpe 1-10 aplicadas LIVE.

## Ola 1 — Fuera del ejecutor (independiente; puede correr en paralelo con Ola 2)

- [x] **E1.1 [P] Fix atribución semanal web** — `weekPendingWorkouts.ts`: `done` si el plan del día tiene logs cualquier día de la semana actual; greedy al pendiente más antiguo si plan repetido; celda "Hecho el {día}"; unit tests de la semana tipo (recuperado jueves, plan duplicado, semana límite lun/dom TZ Santiago).
- [x] **E1.2 [S] Espejo RN atribución** — `apps/mobile/app/alumno/(tabs)/home.tsx` réplica exacta + UI day-card "Hecho el jueves".
- [x] **E1.3 [P] Gate bloqueo total web** — `proxy.ts` allowlist → solo `/suspended` (+logout/assets); `suspended/page.tsx` reason=coach rediseñada (mockup v3.3: avatar coach, pausa, CTA contacto, cerrar sesión; claro/oscuro); sin CTAs de lectura; copys en `student-access.ts`. QA manual 3 estados en preview.
- [x] **E1.4 [P] Gate bloqueo total RN** — pantalla `StudentAccessBlocked` fullscreen montada desde el layout alumno cuando `state==='readonly'`; mismo copy/resolver espejado; claro/oscuro.
- [x] **E1.5 [P] target_date plumbing** — `workout-execution.queries.ts` (`targetDate?` → ventana Santiago de esa fecha) + `workout-log.actions.ts` (`targetDate` modo solo-UPDATE, error tipado si no existe fila); tests: UPDATE ok, INSERT rechazado, hoy sin target intacto.
- [x] **E1.6 [S tras E1.5] Sheet doble intención web** — al tap de day-card hecha (dashboard): mismo día → resumen + "Editar registros" (ejecutor con logs de hoy); otro día → sheet "Revisar y editar" (ejecutor readonly-edit con `target_date`) / "Repetir hoy"; claro/oscuro; responsive.
- [x] **E1.7 [S] Sheet doble intención RN** — espejo en `home.tsx`/day-cards; sheet nativo (patrón sheets existentes).
- [x] **E1.8 [P] Banner "Recuperando" (ejecutor actual)** — banner ámbar mínimo en V2/web actual cuando se abre un pendiente de la semana (param desde dashboard); se rediseña en Ola 2/3.
- **Gate Ola 1**: ✅ CERRADA 2026-07-22 (código+tests; QA preview/device pendiente CEO). Fix extra: target_date viaja en el item de la cola offline (flush de reconexión edita la fecha correcta).

## Ola 2 — Ejecutor V3 core loop (flag `executorV3` OFF por default)

- [ ] **E2.1 [P] Flags + shell V3** — RN `flags.ts` `executorV3` remoteable + switch en `[planId].tsx` (V3|V2 fail-safe); web key Edge Config + override local; shell dark-only con `--exec-brand` (coach/eva según `executor_theme`), header progreso (%, ejercicio X de Y, series, volumen, cronómetro), tuerca placeholder.
- [ ] **E2.2 [P] Entrada + Inicio** — splash <1,5s skippable (gradiente marca, avatar coach, día con overshoot; reduced-motion = fade) + pantalla inicio (resumen plan, primeros ejercicios, "la última vez", nota coach, racha placeholder, CTA Empezar). RN Reanimated; web CSS/WAAPI.
- [ ] **E2.3 [S] Pantalla fuerza V3 RN** — stepper-first (engine `workout-stepper`), media siempre visible (`expo-image` gif / WebView video hasta Ola 5) con chips Instrucciones/Nota colapsables ~1,2s + modales sheet; "Anterior" 1-tap; prellenado sobrecarga; RPE/RIR pills opcionales (RPE 1-10, RIR 0-10); montada SOBRE `useWorkoutSession` intacto (draft/cola/reconciliación).
- [ ] **E2.4 [S] Pantalla fuerza V3 web** — espejo responsive (320→desktop; ≥768px dos columnas media+captura), sobre `WorkoutExecutionClient` data-layer sin tocar el motor (extraer render, no estado).
- [ ] **E2.5 [S] Captura dual (teclado + rueda)** — teclado custom preservado/agrandado; long-press en valor → rueda doble kg|reps centrada en anterior (RN: `@quidone/react-native-wheel-picker` o custom Reanimated, tick háptico; web: scroll-snap custom); hint primera vez persistido; lockfile en el mismo commit si entra dependencia.
- [ ] **E2.6 [P] Vista lista "Ver todo"** — web+RN: mapa completo del plan con estado por ejercicio, salto por tap, FAB volver; stepper sigue default.
- **Gate Ola 2**: gates estándar + QA visual flag ON en preview/dev device (checklist mockup core) + verificación offline (modo avión: serie→cola→reconciliación).

## Ola 3 — Descanso, tipos y superseries

- [ ] **E3.1 [P] Descanso-interstitial** — fullscreen al cerrar serie (countdown anillo, ±15s/saltar, siguiente con media, micro-celebración, mensaje coach) + peek "Plan completo" arrastrable; timers actuales por debajo (endTime-based intactos).
- [ ] **E3.2 [P] Movilidad por lado** — tono calmo (aqua en tema EVA); `side_mode='per_side'` → secuencia lado izq→haptic→der con HoldTimer; escribe `{left_sec,right_sec}` + agregado `actual_hold_sec`; `bilateral` = flujo actual.
- [ ] **E3.3 [P] Roller** — contador pasadas gigante +1 (tick háptico, `reps_done` + `applyKeypadIncrement`), timer opcional.
- [ ] **E3.4 [S] Cardio V3** — identidad (nombre+media catálogo, métrica por máquina), countdown `cardio-progress`, jerarquía N1/N2/N3, zonas fijas, FC manual, fases de intervalo (colores esfuerzo/recuperación, `buildIntervalPhases`, cues visuales; guard `isTimeableInterval` → stopwatch). **La zona objetivo del coach se muestra SIEMPRE y con rango bpm concreto** ("Z2 · 128-142 bpm", vía rangos de `@eva/cardio` + perfil FC del alumno): el alumno puede comparar contra su propio reloj con cualquier app; el BPM en vivo de Ola 6 es capa opcional encima, jamás requisito.
- [ ] **E3.5 [P] Superserie V3** — rondas intercaladas (engine intacto), banner "sigue con B", momento ronda-cerrada + descanso de grupo, dots de ronda.
- [ ] **E3.6 [P] Sustitución máquina ocupada RN** — portar `SubstituteExerciseSheet` (web ya la tiene); mismas actions/queries.
- [ ] **E3.7 [S] Tuerca ajustes completa** — sheet: sonido cronómetro on/off + tono + volumen, vibración, celebraciones (OFF default), keep-awake, RPE/RIR visibles; persistencia device; en RN opciones de audio en gris "llega con actualización" hasta Ola 5; web suena ya (Web Audio actual).
- **Gate Ola 3**: gates estándar + QA por tipo con planes seed QA (fuerza/cardio-intervalos/movilidad per_side/roller/superserie) + offline en movilidad (sides reconcilian).

## Ola 4 — Celebración y cierre

- [ ] **E4.1 [P] Sistema de celebración** — wiring eventos engine → tiers (`celebration.ts`); micro (check+haptic+tick), media (ejercicio/ronda), épica (solo fin/PR real); confetti RN fast-confetti / web canvas-confetti; reduced-motion variantes; todo skippable.
- [ ] **E4.2 [P] PR en vivo** — `detectPR` al cerrar serie → dorado inline (borde+toast+micro-confetti), sin modal; histórico desde queries existentes.
- [ ] **E4.3 [S] Pantalla final** — coreografía 2 fases (clima → stats con tickers), mapa muscular (evolución `MuscleMapSvg`/`session-summary`), PR destacados, racha semanal, share-card reencuadrada (canvas actual re-estilizado), volver al inicio.
- [ ] **E4.4 [P] Racha semanal** — cálculo (sesiones de la semana vs días con plan; reusa atribución E1.1) + UI en inicio/final/day-strip dashboard; sin rachas diarias ni guilt-copy.
- **Gate Ola 4**: gates estándar + sesión completa end-to-end (entrada→final) en device + preview; revisión de dosificación (1 épica máx/sesión).

## Ola 5 — Nativo I (build EAS #1)

- [ ] **E5.1 [P] expo-audio + catálogo** — instalar (lockfile mismo commit), activar timbres bundleados de `sound.ts`, volumen, respetar tuerca.
- [ ] **E5.2 [P] Tono del sistema Android** — módulo ringtone (RingtoneManager TYPE_ALARM) + canal notif `USAGE_ALARM` (un canal por sonido); opción "Del sistema" SOLO Android.
- [ ] **E5.3 [P] Cronómetro lockscreen Android** — encender `rest-live-notification` (notify-kit ya codificado NO-OP).
- [ ] **E5.4 [P] expo-video** — media del ejercicio nativa (reemplaza WebView), autoplay muted loop, degradación webp por cuota.
- [ ] **E5.5 [P] Media Session RN** — paridad con web (controles lockscreen del timer).
- [ ] **E5.6 [S] Haptics semánticos** — paleta por evento (serie/aviso/fin descanso/cambio lado/pasada/PR/fase intervalo) sobre `lib/haptics.ts`; Low Power Mode nunca es canal único.
- **Gate Ola 5**: build EAS Android+iOS + **QA device CEO** (sonidos, lockscreen, video, haptics) antes de encender nada por default.

## Ola 6 — Wearables capa 1 + pasos (build EAS #2)

- [ ] **E6.1 [S] BLE Heart Rate** — `react-native-ble-plx` + permisos; servicio 0x180D scan/connect/stream; sheet "Conectar sensor" (mockup v3.2); BPM vivo en cardio + `hrToZone` zona en vivo; `actual_avg_hr` auto al cerrar bloque; reconexión y estado honesto (sin sensor → módulo oculto).
- [ ] **E6.2 [P] PWA Web Bluetooth** — solo Chrome/Edge Android (feature-detect); iOS PWA oculta; misma UI de sheet.
- [ ] **E6.3 [P] Salud del alumno vía agregadores (la estrella de la ola)** — HealthKit (iOS) + Health Connect (Android), opt-in del alumno con permisos granulares: **pasos** diarios → auto-llenar `daily_habits.steps`; **sueño** → `daily_habits.sleep_hours`; **distancia/calorías/BPM promedio** de la actividad → resumen post-sesión de cardio y ficha. Editable manual siempre. Cubre lo que el alumno ya usa SIN app de reloj: Apple Watch, Galaxy Watch, bandas Xiaomi/Amazfit, Fitbit y cualquier dispositivo que sincronice al centro de salud del teléfono (datos agregados, no en vivo).
- **Gate Ola 6**: build EAS + QA device CEO con cinta/reloj real; validar privacidad/permisos (copys claros, revocable).

## Ola 7A — Lockscreen premium (build EAS #3)

- [ ] **E7.1 [S] Módulo ActivityKit propio** — Expo config plugin + Widget Extension target iOS (`@bacons/apple-targets` o target manual); API JS: `startRestActivity(endsAt, exercise)`, `updateActivity`, `endActivity`; `Text(timerInterval:)` nativo; provisioning del extension (aprovechar y cerrar Associated Domains pendiente).
- [ ] **E7.2 [S tras E7.1] Live Activity + Dynamic Island del descanso** — layouts lockscreen + isla (compacta/expandida); botones −15s/Saltar/+15s vía App Intents → deep link a la sesión; arranque local al iniciar descanso, cierre al terminar; iOS 16.2+ con degradación a notificación (Ola 5).
- [ ] **E7.3 [P] Android Live Updates** — upgrade del cronómetro notify-kit a `ProgressStyle`/promoted ongoing (API 36+), fallback chronometer intacto en APIs menores.
- **Gate Ola 7A**: build EAS + QA device CEO (iPhone con Dynamic Island ideal + Android 16); revisión App Store del extension.

## Ola 7B — Companions de reloj (DIFERIDA — decisión CEO 2026-07-22: no se quiere app en el smartwatch por ahora; único camino futuro para BPM EN VIVO de Apple/Galaxy Watch)

- [ ] **E7.4 [S] Prerequisitos** — acceso cuenta Apple Developer (targets watch + HealthKit capability), Apple Watch y Galaxy Watch físicos para QA, Play Console módulo Wear. Gestionar DURANTE olas 2-4; 7B no arranca sin esto.
- [ ] **E7.5 [S] Companion watchOS** — app SwiftUI embebida en el binario iOS: `HKWorkoutSession` + `HKLiveWorkoutBuilder` (HR/calorías/distancia en vivo) + WatchConnectivity al teléfono (módulo propio delgado; `expo-watch-connectivity` v0.1.0 solo como referencia); sesión espejo iniciable desde iPhone (iOS 17+); el stream entra al MISMO pipeline `hrToZone`/`actual_avg_hr` de Ola 6; UI reloj mínima (fase, BPM, zona, tiempo).
- [ ] **E7.6 [S tras E7.5] Companion Wear OS** — app Kotlin: Health Services (ExerciseClient) en reloj + Data Layer API al teléfono; mismo contrato de datos que E7.5; UI espejo de la watchOS.
- **Gate Ola 7B**: build EAS + QA con relojes físicos (sesión completa de cardio con BPM en vivo desde cada reloj); review App Store + Play.

## Cierre (post-olas)
- [ ] **EC.1** Encendido gradual de flags (RN remote + Edge Config) → QA CEO → default ON.
- [ ] **EC.2** Actualizar docs canónicos (`CURRENT.md`, `MOBILE_PARITY.md`) al mergear a `rnmobiledenuevo`; retiro de `LegacyExecutor` y evaluación de retiro de ExecutorV2 = decisión CEO separada.
