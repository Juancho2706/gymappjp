# Ficha del Alumno — Gap: diseño Claude Design vs datos reales

> **Doc 1 de 3.** Estudio de brecha entre lo DISEÑADO en la ficha de Claude Design (CD, 5 tabs)
> y lo que la app REALMENTE respalda con datos persistidos. Insumo para el plan de rework
> (`03-plan-rework-ficha.md`). Hermano: `02-auditoria-ficha-live.md`.
>
> Fecha: 2026-06-30 · Branch: `feat/redesign-eva-design-system`
> Fuentes reales: `services/client/client-detail.service.ts` (loader maestro),
> `app/coach/clients/[clientId]/_data/ficha-panel.data.ts`, `lib/database.types.ts`,
> componentes vivos `ProfileOverviewB3` / `ProgressBodyCompositionB6` / `TrainingTabB4Panels` /
> `ProgramTabB7` / `NutritionTabB5`.

## Veredicto

**~90% de la ficha diseñada ya está respaldada por datos reales** (tabla/columna/RPC + componente
vivo que lo renderiza). Casi todo lo que se ve en CD existe. Los gaps genuinos son pocos y chicos.

Leyenda: ✅ HAY · ⚠️ PARCIAL · ❌ GAP

---

## 1. Resumen (Overview)

| Feature (diseño) | Estado | Notas / qué falta |
|---|---|---|
| Hero chips: Peso, Adherencia, Workouts x/y, Comidas hoy | ✅ | `check_ins.weight`, `compliance.*`, target workouts, comidas de hoy — reales |
| Score de atención + StatusBadge | ✅ | `calculateAttentionScore` (derivado real) |
| Cascada de alertas (sin check-in/ejercicio, nutrición, plan vence) | ✅ | Derivado de flags/compliance reales |
| 3 rings de cumplimiento (Entreno/Nutrición/Check-in) **con Δ vs semana previa** | ✅ | Deltas reales (`workoutsPrevWeek`, `nutritionPrevWeeklyAvgPct`, `checkInCompliancePercentWeekAgo`). El mock CD hardcodea -3/+6; la app los computa null-safe |
| KPI "Sesiones 30d" | ✅ | `countWorkoutDaysInRange(workoutHistory, 30d)` — real |
| KPI "Δ Peso 30d" | ✅ | Último vs check-in ≥30d — real |
| KPI "Sem. programa x/y" | ✅ | De fechas start/end del programa — real |
| KPI "Mejor racha (histórico)" | ⚠️ | Se computa client-side como corrida más larga en calendario de **371 días** (`longestActivityStreakFromCalendar`). No hay best-streak almacenado → tope ~1 año. Para true all-time: RPC/valor materializado. Bajo valor |
| Resumen de programa + barra de fases + próximo workout | ✅ | Fases reales (`program_phases` JSONB) + `resolveNextProgramWorkout` |
| Señal de nutrición (en track / en riesgo) | ✅ | Compliance real |
| Métricas clave (peso actual + variación semanal) | ✅ | Check-ins reales |
| **Modal "Editar biometría inicial" (altura / peso inicial)** | ❌ | **Cosmético en la ficha real** — el Guardar no tiene onClick/action, no escribe nada. El dato vive en `client_intake.height_cm` / `weight_kg` (real) pero **no hay write-path del coach desde la ficha**. Construir: server action que actualice `client_intake` + `GRANT UPDATE(col)` (regla compra-only grants). **Bajo esfuerzo, valor real** — desbloquea IMC de alumnos sin intake. **El de mayor ROI.** |
| Snapshot último check-in + "Marcar revisado" | ✅ | `check_ins.reviewed_at/reviewed_by` + `markCheckInReviewed` — real |
| Evolución visual (fotos) | ✅ | `front/side/back_photo_url` reales |
| Deep-links de módulos (Cardio/Movimiento/Composición) | ✅ | Gateado por entitlement (`hasModule()`) |

---

## 2. Progreso (Progress / Composición corporal)

| Feature (diseño) | Estado | Notas / qué falta |
|---|---|---|
| Peso · tendencia (curva) + delta 7d | ✅ | `check_ins.weight`, curva SVG — real |
| StatBlock: Inicial, Cambio total, **Ritmo 30d (regresión)**, **Proyección 4 sem** | ✅ | `linearRegressionKgPerDay` computa pendiente real + proyección |
| Peso objetivo editable | ✅ | `clients.goal_weight_kg` + `updateClientGoalWeight` — real |
| IMC + categoría + escala | ✅ | `client_intake.height_cm` real (IMC solo si hay altura) |
| Energía media 7d gauge + estrellas | ✅ | `check_ins.energy_level` — real, incl. historial de estrellas por check-in |
| Comparativa de fotos (base/compare + Δ + slider) | ✅ | Check-ins con foto reales + `PhotoComparisonSlider` (requiere ≥2 fotos) |
| Timeline historial de check-ins + notas | ✅ | Real |
| **"Panel de progreso" unificado switcher 7-charts** (peso/tasa/fuerza/volumen/macros/adherencia/balance) | ⚠️ | Este widget consolidado **no existe** en el tab real. Los datos base mayormente existen en otros tabs: fuerza/volumen en **Entreno** (real), macros/adherencia en **Nutrición** (real), peso aquí (real). "Tasa de cambio" es derivable trivialmente de deltas de peso. Construir el switcher = consolidación UI, no datos nuevos — **excepto "Balance neto"** |
| — chart "Balance neto" (superávit/déficit kcal acumulado) | ❌ | Necesita **gasto energético/TDEE** (BMR + actividad). La app guarda kcal **consumidas** solamente — sin modelo de gasto. Gap real; requiere estimar TDEE (fórmula peso/altura/edad/actividad) antes de que el chart tenga sentido |
| — chart "Peso & Comp." (composición integrada) | ⚠️ | Peso es real; composición (grasa%/músculo) existe en `body_composition_measurements` pero como **tab de módulo de pago** (bodycomp) separado, no fusionado en Progreso. Fusionar = trabajo UI sobre dato Pro |

---

## 3. Entreno (Análisis de entrenamiento)

| Feature (diseño) | Estado | Notas |
|---|---|---|
| Banner "Récord de la semana" (e1RM, antes→ahora, %) | ✅ | `findWeeklyWeightPRs` / `get_client_weekly_prs`, e1RM Epley — real |
| Tarjetas 1RM por ejercicio (serie Epley + filtro grupo) | ✅ | `buildExerciseStrengthSeriesMap` / `get_client_strength_series` de `workout_logs` — real |
| **Balance muscular (radar)** | ✅ | SVG radar real de `get_client_muscle_volume` (Σ peso×reps por grupo, 30d) + `detectVolumeImbalances` |
| Tonelaje por sesión + media móvil 7 | ✅ | `buildDailyTonnageSeries` / `get_client_daily_tonnage` — real |
| Historial de sesiones + navegador por fecha (sets/reps/RPE) | ✅ | `getClientWorkoutForDate` (set_number, weight_kg, reps_done, rpe) — real |
| Empty-states | ✅ | Data-driven; entreno es core (sin gate de compra) |

**Entreno está 100% real — sin gaps.**

---

## 4. Programa (Programa / Plan)

| Feature (diseño) | Estado | Notas / qué falta |
|---|---|---|
| Header programa activo + días restantes | ✅ | `workout_programs` start/end — real |
| **Fases (Acumulación/Intensificación/Descarga) barra + leyenda** | ✅ | `parseProgramPhases(workout_programs.program_phases)` JSONB `{name,weeks,color}`. Los 3 nombres del diseño son sample; nombres/semanas/colores reales vienen de DB. El coach los edita en el builder |
| Variante A/B "esta semana" | ✅ | `ab_mode` + `week_variant` + `resolveEffectiveWeekVariant` — real |
| Estructura del ciclo (grilla de semanas coloreada por fase) | ✅ | Nº semanas de schedule/`weeks_to_repeat`; color de fase por semana — real |
| — letra A/B por celda de semana | ⚠️ | **Derivada por paridad par/impar** (`wk%2`), no una variante por-semana almacenada. Cosmético; ok salvo que se quiera asignación A/B real por semana |
| Microciclo L–D (acordeón por día + bloques) | ✅ | `workout_plans.day_of_week` + `workout_blocks` (order_index) — real |
| Sheet de ejercicio: GIF, Series×reps, Obj. peso, Descanso, RIR, Tempo, notas | ✅ | `exercises.gif_url` + columnas de `workout_blocks` (sets, reps, rest_time, rir, tempo, target_weight_kg, notes) |
| — fila "Progresión +X kg/sem" | ⚠️ | **El dato existe pero no se muestra.** `workout_blocks` tiene `progression_mode`/`progression_type`/`progression_value`, pero el sheet real no las renderiza. Surfacearlo = display-only, bajo esfuerzo |

---

## 5. Nutrición

| Feature (diseño) | Estado | Notas |
|---|---|---|
| Hoy: kcal consumidas/meta + barras de macros | ✅ | `daily_nutrition_logs` + macros del plan — real |
| Adherencia 30d heatmap + prom mensual + racha + Δ semana | ✅ | Timeline real (`nutritionAdherence30d`, `nutritionMonthlyAvgPct`, `nutritionStreakDays`) |
| Chart 7d kcal vs meta | ✅ | `nutritionLogsEnriched` — real |
| Alimentos favoritos | ✅ | `client_food_preferences` type `favorite` — real (seteado por alumno) |
| Plan activo card + macros + Editar / **Copiar** / Ver como alumno | ✅ | Real; "Copiar a otro alumno" → `duplicatePlanToClient` (insert real) |
| Lista de comidas (completadas, kcal, colapsable) | ✅ | `nutrition_meals`/`food_items`/`foods` — real |
| Panel de alertas del coach | ✅ | `deriveNutritionCoachAlerts` — derivado real |
| Toggles feature-prefs (por alumno) | ✅ | `feature-prefs.service` override por-cliente, gateado por entitlement — persistido real |
| Contexto de check-in | ✅ | Real |
| **Restricciones y alergias (Alergia/Intolerancia/No le gusta)** | ✅ | `client_food_preferences.preference_type ∈ {allergy,intolerance,dislike,favorite}` + `setClientFoodRestriction`. Los 3 tipos se almacenan de verdad |
| **Conversación de comidas (coach↔alumno, bidireccional)** | ✅ | `nutrition_meal_comments` (`author_role` client/coach); el alumno también escribe. Bidireccional real |
| **Umbrales de micros (Sodio/Fibra/Azúcar, Tope/Meta)** | ✅ | Tabla `nutrient_targets` (`nutrient_key`, `intent`, `floor/target/ceiling_value`). Azúcar/grasa-sat **Pro-gated server-side** (`assertProNutrientAllowed`) |
| Nota privada del coach | ✅ | `nutrition_private_notes` (el alumno nunca la lee) |
| **Ciclo de dieta + bloques + Editar** | ✅ | `nutrition_plan_cycles` (`blocks` jsonb, `start_date`, `is_active`) + `upsertNutritionPlanCycle` |
| **Historial · Restaurar (Plan v3/v2)** | ✅ | `nutrition_plan_history` (`snapshot` jsonb) + `restoreClientNutritionPlanFromHistory` (reaplica snapshot). No cosmético |
| Hábitos del día (agua/pasos/sueño/ayuno/suplementos/nota) | ✅ | `daily_habits` real |

**Nutrición es esencialmente 100% real — el tab más rico.**

---

## TOP gaps a construir (rankeados)

1. **Write-path "Editar biometría" (Resumen)** — ❌ el único control falso de la ficha. El modal existe pero no guarda. Build: server action `update client_intake.height_cm` / peso inicial + `GRANT UPDATE(col)` (regla compra-only). **Bajo esfuerzo, alto pago** — un coach hoy no puede corregir una altura faltante, lo que mata en silencio el IMC. **Mayor ROI.**

2. **Surfacear progresión en el sheet de Programa** — ⚠️ dato ya en `workout_blocks.progression_mode/type/value`; solo renderizar fila "Progresión +X kg/sem". **Display-only, ~trivial.**

3. **Chart "Balance neto" energético (Progreso)** — ❌ gap real de datos: sin modelo TDEE/gasto, solo kcal consumidas. Requiere estimar TDEE (Mifflin-St Jeor de altura/edad/peso/actividad). Esfuerzo medio; decidir si trackear superávit/déficit es prioridad de producto.

4. **Switcher unificado 7-charts de Progreso** — ⚠️ mayormente consolidación UI de datos que ya existen en otros tabs (fuerza/volumen/macros/adherencia); solo "balance neto" necesita dato nuevo (ver #3), y "tasa de cambio" es derivación de 5 líneas. Puro front-end si se deja balance-neto fuera.

5. **"Mejor racha" true all-time** — ⚠️ el valor actual es recompute de ventana 371 días. Solo vale un best-streak almacenado si el "histórico" debe pasar de un año. Prioridad más baja.

Todo lo demás del diseño — fases, A/B, radar muscular, PR semanal, series 1RM, tonelaje, comparativa de fotos, proyección, restricciones-con-tipo, chat bidireccional de comidas, umbrales de micros, versionado/restore del ciclo de dieta, hábitos — ya está respaldado por tablas/RPCs reales y renderizado por los componentes vivos. Sin acción ahí.
