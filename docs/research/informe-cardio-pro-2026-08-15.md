---
status: reference
owner: engineering
last_verified: 2026-08-15
canonical: false
---

# Informe 2 — Área de Cardio profesional: sección dedicada, asignación a alumnos y gadgets

**Fecha de corte:** 2026-08-15 · **Rama:** `claude/free-plan-nutrition-cardio-qbyycb` (desde `rnmobiledenuevo`)
**Método:** auditoría del código del repo + investigación de mercado (Trainerize, Everfit, TrueCoach, TrainHeroic como peers; TrainingPeaks, Final Surge, Intervals.icu como estándar profesional de endurance). Fuentes al final.
**Nota:** informe de decisión; no implementa nada. Los cambios citados son propuestas.

---

## TL;DR

**EVA no parte de cero — parte con ventaja.** El dominio de cardio ya está construido y es de calidad profesional: zonas individualizadas (Tanaka + Karvonen, mejor que Trainerize que usa 220−edad), prescripción por zona/pace/distancia/intervalos, 7 modalidades con ejes de captura propios, HUD BLE en vivo con tiempo-en-zona, import desde Apple Watch / Health Connect, y la curva de FC ya se persiste (`workout_logs.metadata.hr` v1) esperando un consumidor. Lo que falta es exactamente lo que pides: **superficie** (sección de cardio del alumno, riel de asignación propio, panel del coach — la "fase 3" que la spec `cardio-conectado` dejó declarada pero sin spec) y **agregación** (analytics, carga aeróbica, tests de campo).

El gap de mercado es real: los generalistas (Trainerize/Everfit/TrueCoach) tratan cardio como bloque genérico sin zonas por umbral ni carga ni cumplimiento; TrainingPeaks tiene todo eso pero es hostil para el coach de fitness general y débil en fuerza/nutrición. **Nadie sirve bien al coach híbrido "pesas + cardio serio"** — y el pivot HYROX de TrainingPeaks y las apps nicho de híbrido confirman que la demanda existe. EVA ya tiene la mitad pesada hecha.

---

## 1. Qué hay hoy en el código (resumen de auditoría)

### 1.1 Fundaciones construidas y en producción

| Pieza | Dónde | Estado |
|---|---|---|
| Dominio puro de zonas/pace/sesión | `packages/cardio` (~1.100 L código + 930 L tests, 42 consumidores) | En uso web+RN |
| Zonas individualizadas | `zones.ts`: Tanaka default (`maxHrTanaka`, L65), override del coach (`resolveMaxHr`, L107), **Karvonen si hay FC reposo** (`resolveClientZones`, L124); prescripción persiste SOLO la zona 1-5, bpm derivados al render | Sólido |
| Prescripción polimórfica | `workout_blocks`: `distance_value/unit`, `duration_sec`, `target_pace_sec_per_km`, `hr_zone`, `interval_config` (`packages/schemas/workout.ts:121-175`) | Sólido |
| Intervalos con plantillas | `workout-interval.ts`: warmup/work/recovery/cooldown, targets `hr_zone|pace|rpe`, 5 plantillas (8×400, VO2 6×1', 20' Z2, fartlek 30/30, HYROX) | Sólido |
| Modalidades → ejes de captura | `cardio-modality.ts`: run/bike/row/elliptical/jump_rope/hiit_reps/stairs, 9 ejercicios de sistema (PR #170, migración en LIVE) | Sólido |
| Perfil cardio del alumno | `clients`: `birth_date`, `resting_hr`, `max_hr_override`, `ref_5k_time_sec` | Sólido |
| Ejecutor con HUD en vivo | `CardioScreenV3.tsx`: tiempo-en-zona, ZoneBar, avg/max, háptica fuera-de-zona; cronómetro en lockscreen/Dynamic Island | Construido |
| BLE HR | `react-native-ble-plx` + GATT 0x180D (`lib/ble-hr.ts`): Polar, Garmin, Wahoo, Coospo, Magene + relojes en broadcast; web BLE en Chrome Android | Construido |
| Import del reloj | `@kingstinct/react-native-healthkit` (iOS) + `react-native-health-connect` (Android), matching por solape ≥50%, jamás pisa lo tipeado (`hub-workout.ts`) | Construido |
| Curva de FC persistida | `metadata.hr` v1 (avg, max, zone_sec, serie ≤360 pts) desde 2026-07-30 | **Se escribe, nadie la lee** |
| Módulo coach `/coach/cardio` | Calculadora de Zonas/Pace/Plantillas + perfil por alumno, web y RN, gate `assertModule('cardio')` | Es una calculadora, no un panel |

### 1.2 Los 8 huecos reales

1. **El alumno no tiene sección de cardio** — ni tab en RN (`app/alumno/(tabs)/_layout.tsx:122-151`: Inicio · Nutrición · Aprender · Check-in · Historial · Perfil) ni en web (`ClientNav.tsx:122-136`). El cardio solo existe dentro del ejecutor de una rutina.
2. **No hay riel de asignación de cardio independiente**: el cardio viaja como bloques dentro de la rutina normal (`workout_programs` → `workout_plans` → `workout_blocks`).
3. **La fase 3 (panel del coach) está declarada y vacía**: `specs/cardio-conectado/SPEC.md:34` la nombra como Non-Goal "spec aparte cuando se apruebe"; la data (`zone_sec`, curva) ya se persiste para ella. Antecedente grave documentado: *"el coach no ve nada de lo que el alumno registra en cardio"* (hallazgo G1 de la investigación 2026-07-25, parcialmente resuelto en ejes web).
4. **Analytics ciegas a cardio**: `packages/profile-analytics` solo sabe de 1RM/tonelaje/PRs; cero minutos/semana, km/semana, distribución de zonas, tendencia de FC reposo. Deuda declarada viva en `specs/cardio-ejes-y-fixes/TASKS.md:27-28`.
5. **Cero métricas derivadas**: no se calcula VO2max estimado, ni carga aeróbica (TRIMP/hrTSS), ni progresión; `ref_5k_time_sec` solo alimenta conversiones de pace.
6. **Sin GPS ni pedómetro propios** (no hay `expo-location`/`expo-sensors`): dependencia total del hub del teléfono o del sensor BLE. Para outdoor running con mapa, hoy no hay nada.
7. **Deuda visual BLOCKER** en la pantalla de cardio del ejecutor (auditoría `docs/audits/executor-v3-qa1/05-cardio.md`: falta la grilla de chips de métricas del mockup).
8. **QA física pendiente**: la build EAS con sensor y reloj reales de `cardio-conectado` nunca se corrió — los permisos/plugins nuevos no viajan por OTA.

---

## 2. Qué hace la competencia y dónde está el gap

### 2.1 Tabla comparativa (y dónde quedaría EVA)

| Feature | Trainerize | Everfit | TrueCoach | TrainingPeaks | **EVA hoy** | **EVA propuesto** |
|---|---|---|---|---|---|---|
| Intervalos estructurados | Parcial (HR targets) | No | No | Completo | **Sí** | Sí |
| Zonas individualizadas | No (220−edad) | No | No | Sí (umbral) | **Sí (Tanaka/Karvonen + override)** | Sí + umbral por test |
| Targets de ritmo | No | No | No | Sí | **Sí (pace)** | Sí |
| Carga (TRIMP/TSS, tendencia) | No | No | No | Sí (PMC/CTL/ATL) | No | **Sí (hrTRIMP simplificado)** |
| FC en vivo en la app | Solo Apple Watch propio | Sí | No | No | **Sí (BLE)** | Sí |
| Import del reloj (AW/HC) | Sí | Sí | Parcial | Sí | **Sí** | Sí |
| Resumen FC + tiempo en zonas | Parcial | Sí | Parcial | Completo | Se persiste, no se muestra | **Sí** |
| Cumplimiento plan-vs-hecho cuantificado | No | No | Parcial | Sí (semáforo TSS) | No | **Sí (semáforo)** |
| Sección de cardio del alumno | No | No | No | Sí (es toda la app) | No | **Sí** |
| Panel de cardio del coach | No | Parcial | No | Sí | No | **Sí** |
| Push del workout al reloj | No | No | No | Sí (Garmin/Wahoo/Zwift) | No | Fase posterior |
| Fuerza + nutrición + negocio | Sí | Sí | Sí | No | **Sí** | Sí |

Datos clave del mercado: Trainerize **retiró** los targets de distancia de sus workouts y sus usuarios llevan años pidiendo zonas de FC propias en el foro de ideas; Everfit tiene la mejor experiencia móvil del segmento (FC en vivo con smartwatch + resumen con gráfica) pero su *programación* sigue siendo "actividad + tiempo"; TrainingPeaks/TrainHeroic ahora son de **Garmin** (adquisición de Peaksware) — el ecosistema pro se está consolidando y encareciendo para terceros, otra razón para que el generalista híbrido lo ataque desde abajo.

### 2.2 La tesis de producto

**"TrainingPeaks-lite dentro de una plataforma all-in-one"**: zonas por umbral individuales, intervalos estructurados, carga aeróbica simplificada y cumplimiento con semáforo — sin el jargon ni la curva de aprendizaje de TrainingPeaks, y conviviendo con fuerza, nutrición y check-ins en la misma app. Eso no lo tiene nadie del peer group, y las piezas duras (dominio de zonas, BLE, health import, persistencia de curvas) EVA ya las construyó.

---

## 3. Propuesta EVA: el área de cardio profesional, por fases

Principio rector (el mismo del repo): **cero tablas nuevas donde se pueda evitar, superficie nueva sobre datos existentes**.

### Fase C1 — "Ver lo que ya se mide" (el quick-win, ~1-2 semanas)

La curva de FC, `zone_sec` y los ejes reales llevan semanas persistiéndose sin un solo lector. Antes de programar nada nuevo, mostrar lo que ya existe:

1. **Sección "Cardio" del alumno** (RN + web): el patrón de tab condicional ya está resuelto (`movement`/`bodycomp` con `href:null` en `app/alumno/(tabs)/_layout.tsx` y `showMovement` en `ClientNav.tsx:131-132`). Contenido v1: próximas sesiones con bloques cardio, historial cardio-only (fecha, modalidad, tiempo/distancia/FC, gráfica de la curva desde `metadata.hr`), tiempo en zonas de la semana, y acceso al perfil cardio (FC reposo, etc.).
2. **Panel del coach = la fase 3 pendiente de `cardio-conectado`**: en `/coach/cardio` (hoy solo calculadora), añadir vista por alumno: sesiones cardio con **semáforo de cumplimiento** (modelo TrainingPeaks: verde ±20% del objetivo de tiempo-en-zona/duración, amarillo parcial, rojo no hecho), curva de FC por sesión, tendencia semanal de minutos/km/zonas.
3. **Analytics cardio en `profile-analytics`**: minutos/semana, km/semana, distribución de zonas, tendencia FC reposo — cierra la deuda declarada en `cardio-ejes-y-fixes`.
4. **Pagar las deudas**: la grilla de chips del BLOCKER visual y la QA física con sensor/reloj (build EAS) — sin esto, todo lo anterior se construye sobre integraciones nunca probadas en hardware real.

### Fase C2 — "Programar cardio como un pro" (~2-4 semanas)

5. **Riel de asignación de cardio**: recomiendo **NO crear una entidad nueva**. Un "plan de cardio" es un `workout_program` cuyos días solo tienen bloques cardio. Añadir un flag/derivación (`program_kind: 'cardio'` o derivarlo de los bloques) + un **builder de cardio dedicado** en `/coach/cardio` que crea esos programas con UX específica (plantillas de intervalos al frente, calendario semanal de sesiones, progresión de volumen). Ventajas: reusa ejecutor V3, logs, RLS, offline y paridad RN sin tocar el modelo; el alumno puede tener rutina de fuerza Y plan de cardio activos en paralelo (el modelo ya soporta múltiples programas).
6. **Tests de campo guiados** como sesiones especiales: Cooper 12', 20' LTHR (95% de la FC media → umbral), test de FCmax — al completarse actualizan el perfil cardio del alumno (`max_hr_override`, nuevo `lthr` en el perfil o en metadata) y recalculan zonas. Esto es lo que convierte "zonas por fórmula" en "zonas por umbral" = el estándar profesional real, y es TypeScript puro sobre datos que ya se capturan.
7. **Carga aeróbica simplificada**: hrTRIMP por sesión (Banister/Edwards sobre `zone_sec` — ya persistido) + media móvil semanal con banda de progresión segura. Sin llamarlo CTL/ATL: "Carga aeróbica" con semáforo. Diferenciador enorme frente a todo el peer group y barato: es una función pura sobre `metadata.hr`.
8. **Progresiones en plantillas**: las 5 `INTERVAL_TEMPLATES` de sistema pasan a familias con progresión (p. ej. 6×400 → 8×400 → 10×400) que el builder sugiere según cumplimiento.

### Fase C3 — "La muñeca" (diferenciador defendible, cuando C1+C2 estén en producción)

9. **iOS — WorkoutKit** (iOS 17+/watchOS 10+): programar el intervalo estructurado directamente en la app Workout del Apple Watch **sin app watchOS propia** (módulo nativo Swift vía config plugin de Expo; no hay wrapper RN maduro, es trabajo nativo acotado). El alumno recibe alertas de zona en la muñeca — ningún generalista lo hace.
10. **Android — `PlannedExerciseSessionRecord`** de Health Connect: escribir el plan estructurado para que relojes/apps compatibles lo lean. Ojo: desde sep-2026 el acceso a Health Connect se aprueba vía Play Console — **iniciar el trámite antes de construir** (los permisos actuales ya pasaron por ahí; los nuevos data types requieren re-declaración, `MANUAL_TASKS`).
11. **Garmin Training API** (gratuita, con aprobación): push de workouts al calendario de Garmin Connect — lo que usan TrainingPeaks y Final Surge; Final Surge demuestra que un player mediano la consigue. **Solicitar el acceso ya** (lead time de semanas) aunque se construya después.
12. **Qué NO hacer**: agregadores de pago (Terra ~US$500/mes base, ROOK/Spike por uso) solo si aparece demanda real de Whoop/Oura — el stack gratuito (BLE + HealthKit + Health Connect) ya cubre el 90% de los gadgets reales de alumnos; **Strava como fuente, no** (su API de nov-2024 prohíbe mostrar datos de un usuario a terceros — riesgo directo para el caso coach); app watchOS propia, no (WorkoutKit la hace innecesaria en esta etapa); GPS propio con `expo-location`, diferir (batería/permisos/antifraude, y el import del reloj ya trae distancia).

### Monetización

Cardio ya es módulo de pago incluido en todos los planes pagos (`assertModule('cardio')`, decisión 2026-07-17) y el Free no lo tiene — **la sección profesional cae naturalmente en la escalera del Informe 1** sin decisiones nuevas: Free = fuerza + nutrición base; pagos = módulos, con cardio pro como el "wow" demostrable en la venta. Si en el futuro se quiere un escalón extra, C3 (push al reloj) es el candidato natural a exclusivo Pro/Elite, espejo de lo que el mercado cobra como premium.

---

## 4. Riesgos y dependencias

| Riesgo | Mitigación |
|---|---|
| QA física nunca corrida: BLE/HealthKit pueden fallar en hardware real | Hacerla ANTES de construir superficie encima (build EAS + sensor + reloj, ya declarada pendiente en `cardio-conectado/TASKS.md:3`) |
| `metadata.hr` es jsonb versionado sin CHECKs | Mantener validación Zod en el borde como hoy; congelar `v:1` y versionar aditivamente |
| Aprobaciones externas (Play Console Health Connect, Garmin Developer Program) con semanas de lead time | Iniciar trámites en C1 aunque se usen en C3 |
| Sobre-ingeniería estilo TrainingPeaks (jargon TSS/CTL) que asuste al coach generalista | Vocabulario propio y simple ("carga aeróbica", semáforos); las fórmulas quedan bajo el capó |
| Doble fuente BLE vs import para el mismo bloque | Ya resuelto por diseño: BLE gana, import solo rellena vacíos (`hub-workout.ts:129`) — mantener esa invariante en todo lo nuevo |
| Ecosistema Garmin (dueño de TrainingPeaks/TrainHeroic) puede cerrar o encarecer APIs | Integración directa propia (no vía agregador) + BLE estándar como piso que nadie puede quitar |

---

## Fuentes de mercado (agosto 2026)

Trainerize: help.trainerize.com (wearable sync, exercise stats, heart rate targets) · ideas.trainerize.com (petición de zonas propias) — Everfit: help.everfit.io (smartwatch integration) · everfit.io/integration — TrueCoach: truecoach.co/features/wearables — TrainHeroic: support.trainheroic.com (sin integraciones) · traindaly.com (adquisición Garmin/Peaksware) — TrainingPeaks: help.trainingpeaks.com (Workout Builder, CTL/ATL/TSB, structured export, workout card compliance) · trainingpeaks.com/hyrox — Final Surge: support.finalsurge.com (sync Garmin Connect) — Intervals.icu: intervals.icu/features — Apple WorkoutKit: developer.apple.com WWDC23 session 10016 — Health Connect Training Plans: developer.android.com/health-and-fitness/health-connect/features/training-plans — Garmin Training API: developer.garmin.com/gc-developer-program/training-api — Agregadores: tryterra.co/pricing · tryrook.io/pricing · themomentum.ai (build-vs-buy) — Strava API: dcrainmaker.com 2024-11 + press.strava.com. Cifras de terceros no verificables de primera mano marcadas en la investigación original.
