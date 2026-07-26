# SPEC — Cardio: ejes de captura por modalidad + fixes de la investigación 2026-07-25

Estado: **en diseño — pendiente de aprobación del owner**. Nada de esto está construido.

## Problema

Investigación del 2026-07-25 (informe en artifact `informe-cardio-eva`, hallazgos G1-G11):

1. Todo ejercicio cardio pide las mismas 3 cajas (Min / Metros / FC) sin importar la modalidad:
   a un alumno en bicicleta estática, saltando la cuerda o haciendo burpees se le piden "Metros",
   un dato sin sentido en esos casos (G6). El owner pide **entradas propias por ejercicio** para el
   catálogo de cardio del sistema (cinta ≠ escaladora ≠ cuerda).
2. **El coach no ve nada de lo que el alumno registra en cardio** (G1, grave): ninguna pantalla de
   coach lee `actual_duration_sec` / `actual_distance_m` / `actual_avg_hr`.
3. **Trampa de unidades** (G3, alto): se prescribe "5 km", la caja dice "Metros"; escribir 5 guarda
   5 metros.
4. Plantillas de intervalos por distancia (8x400m, HYROX) dejan un cronómetro pelado sin fases y
   borran la prescripción del bloque (G2, alto).
5. Menores: pace prescrito nunca se muestra ni se captura (G4), target por intervalo muerto (G5),
   drift min↔seg (G7), key de remonte ignora distancia/FC (G8), ronda cerrable vacía (G9), gate del
   módulo Cardio divergente web/RN en el builder (G10), `legacyRepsSummaryFor` duplicado (G11).

## Alcance

- Ejes de captura por **modalidad** para los ejercicios cardio **de sistema** (8 filas del seed
  `scripts/seed-cardio-exercises.mjs`; opcionalmente +1 "Escaladora" nueva). Ejercicios cardio
  creados por coaches: modalidad opcional en el editor de ejercicios, default = genérica (las 3
  cajas de hoy). Nada cambia para strength/mobility/roller.
- Visibilidad coach de los registros cardio (web primero; ficha coach RN después).
- Corrección de unidades m/km en la captura del alumno.
- Intervalos por distancia utilizables.
- Los menores que sean baratos en el mismo paso.

## Requisitos funcionales

- **RF1 — Modalidad por ejercicio**: `exercises.cardio_modality` (nullable). Los 8 del seed quedan
  backfilleados. El motor compartido (`packages/workout-engine`) resuelve
  `modalidad → ejes de captura`; web y RN consumen el mismo mapa (paridad gratis).
- **RF2 — Ejes propuestos** (aprobación del owner, ver PLAN §2):
  correr/cinta/caminata = Min · Distancia · FC; remo = Min · Metros · FC; bici = Min · Distancia ·
  FC; elíptica = Min · FC; cuerda = Min · Saltos · FC; burpees = Min · Reps · FC; escaladora
  (si se agrega) = Min · Pisos · FC; genérica = Min · Distancia · FC (compat actual).
- **RF3 — Sin columnas nuevas en logs**: saltos/reps/pisos se guardan en `workout_logs.reps_done`
  (ya existe); la semántica la da la modalidad del ejercicio. Distancia sigue en
  `actual_distance_m`, tiempo en `actual_duration_sec`, FC en `actual_avg_hr`.
- **RF4 — Unidad de captura = unidad prescrita**: si el bloque prescribe km, la caja es "Km"
  (decimal) y se guarda ×1000 en metros. Sin prescripción de distancia → caja "Metros" como hoy.
  Etiquetas visibles sobre las cajas en web (hoy solo hay aria-label; RN ya las tiene).
- **RF5 — Pace real derivado**: si una ronda queda con tiempo y distancia, el cliente calcula y
  guarda `actual_pace_sec_per_km` (columna ya cableada en action/schema). Cero inputs nuevos.
- **RF6 — Coach ve cardio**: el detalle de día de la ficha del alumno (web) muestra por ronda lo
  registrado según la modalidad ("12,5 min · 3.200 m · FC 148" / "8 min · 420 saltos"). La query
  de `client-detail.service.ts` agrega las columnas `actual_*` y `reps_done`.
- **RF7 — Intervalos por distancia**: fases por distancia se muestran como pasos manuales
  ("400 m fuerte → 90 s suave", botón "Fase siguiente"; la recuperación por tiempo sí se
  cronometra). Aplicar plantilla deja de borrar `duration_sec`/`distance_value` del bloque.
- **RF8 — Prescripción rep-based**: para cuerda/burpees/escaladora el builder permite objetivo en
  la unidad propia (saltos/reps/pisos) usando `workout_blocks.reps_value` + `reps_unit`
  (CHECK actual `('reps','passes','breaths')` se extiende de forma aditiva).

## Decisiones del owner (resueltas 2026-07-25)

- D1: **Fases A+B primero** (datos correctos + visibilidad coach); C y D después.
- D2: **mapa aprobado tal cual** — bici CON distancia, elíptica solo Min · FC.
- D3: **ronda vacía se mantiene** (marca rápida de "hecho"); el coach la verá sin datos.
- D4: **Escaladora SÍ se agrega** como 9º ejercicio de sistema (modalidad stairs, entra en Fase C).

## No-objetivos

- Nuevas métricas de hardware (vatios, cadencia, calorías): fuera de alcance.
- Cambiar el modelo de rondas (`sets`) o el motor de completitud.
- Editor de modalidad masivo para ejercicios de coaches existentes (solo default + selector).
