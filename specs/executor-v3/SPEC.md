# SPEC — Ejecutor de entrenamiento V3 "Impulso"

> Rediseño completo del ejecutor del alumno (visor "qué toca hoy" + ejecución + descanso + cierre) en RN nativo y PWA, más las piezas satélite decididas: gate de acceso, recuperación de días, edición de días hechos y white-label del ejecutor.
> Investigación y decisiones: `docs/research/executor-redesign/00-DIRECCION-DISENO.md` (18 informes + 22 pantallas de mockup aprobadas por el CEO, iteraciones v2→v3.3, 2026-07-21).
> Rama: `feat/executorv2-redesign` (worktree `executor-redesign`, base `rnmobiledenuevo`). PR #162.

## 1. Qué se construye

1. **Ejecutor V3** (RN `apps/mobile` = versión de referencia; PWA `apps/web` espejo responsive): stepper-first, media del ejercicio siempre visible, captura 1-tap + teclado + rueda long-press, descanso-interstitial con peek de plan, experiencias únicas por tipo (fuerza/cardio/movilidad/roller/superserie), celebración escalonada, pantallas de inicio/entrada/final con mapa muscular, tuerca de ajustes de sonido.
2. **Fuera del ejecutor** (nivel dashboard/app shell, con modo claro/oscuro):
   - Bloqueo total post-gracia al login (pantalla "habla con tu coach"; ni dashboard).
   - Sheet de doble intención al abrir un día hecho ("Revisar y editar" / "Repetir hoy").
   - Recuperación de días pendientes de la semana actual con atribución correcta.
3. **White-label**: opción nueva del coach en su creador de marca — el ejecutor usa "mis colores" o "colores EVA" (tema multicolor propio: Sport `#2680FF` acciones, Aqua `#18ABD4` recovery, Ember `#FF6A3D` celebración).
4. **Motor compartido**: funciones puras nuevas en `@eva/workout-engine` (progreso cardio, `hrToZone`, `detectPR`, eventos semánticos, tiers de celebración) + subir `keypad-flow`/`set-log-payload` al package.
5. **Nativo por fases**: sonido (catálogo + tono del sistema en Android), cronómetro lockscreen, video nativo, y wearables capa 1 (BLE Heart Rate estándar) con pasos vía HealthKit/Health Connect.

## 2. Decisiones cerradas (CEO, 2026-07-21/22)

| # | Decisión | Detalle |
|---|---|---|
| 1 | Concepto visual | A "Impulso" (juicy, ADN Duolingo sin mascota). Ejecutor **dark-only**. |
| 2 | RPE/RIR | Ambos visibles como pills opcionales, escala **0-10**, solo fuerza, jamás bloquean. Validación actual 1-10 → 0-10 (aditivo). |
| 3 | Sonido | Global OFF; solo cronómetro de descanso suena. Tono del sistema (Android, RingtoneManager) o catálogo EVA (iOS no expone tonos). Ajustes en tuerca dentro del workout. |
| 4 | Rachas | Semanales contra el plan, nunca diarias. |
| 5 | Wearables | Lo que el CEO necesita (2026-07-22): leer los sensores/datos de los dispositivos del alumno SIN app de reloj — agregadores HealthKit/Health Connect para pasos, sueño, distancia, calorías y BPM promedio (Ola 6, estrella) + BLE 0x180D para BPM en vivo de cintas/relojes que transmiten (Ola 6). Companions de reloj (7B) DIFERIDOS: solo serían necesarios para BPM en vivo de Apple/Galaxy Watch. |
| 6 | White-label ejecutor | Toggle del coach: "mis colores" / "colores EVA". Zonas FC SIEMPRE colores fijos semánticos. |
| 7 | Holds por lado | Sí: `metadata jsonb` `{left_sec, right_sec}` cuando `side_mode='per_side'`; junto al keypad nuevo. |
| 8 | Captura kg/reps | Dual: tap = teclado custom; long-press = rueda doble kg\|reps (iOS y Android), centrada en el valor anterior, tick háptico, hint la primera vez. |
| 9 | Gate post-gracia | Bloqueo TOTAL al login pasados los 7 días: pantalla fullscreen calma con CTA "escribir a mi coach" + cerrar sesión. Ni dashboard. Reemplaza el híbrido readonly actual. |
| 10 | Días pendientes / re-hacer | Recuperar solo semana actual; atribución al día del plan ("Hecho el jueves ✓" — fix del gap real de `deriveWeekWorkoutStatus`); día hecho → sheet dual; edición de fecha pasada SOLO sobre filas existentes. |

## 3. Restricciones no negociables

- **Offline intransable**: cola write-through, drafts, snapshot y reconciliación NO se reescriben; la UI nueva se monta encima. Regla de las 5 superficies para cualquier key nueva de log (Zod, `WorkoutOfflineLog`, `ReconciledSessionLog`, `OptimisticLogPayload`, `typedLogValues`).
- **`effectiveExerciseType` es la única puerta de tipo**. Sin CHECKs nuevos por tipo en DB (diseño deliberado: schema permisivo).
- **RLS es la barrera real** de datos (RN habla PostgREST directo). El gate UI se espeja en RN pero jamás sustituye RLS. Kill-switch `STUDENT_ACCESS_GATE` y fail-open se mantienen.
- **Clean Architecture** `_data → services → infrastructure/db → Supabase`; lógica compartible en `packages/*`; nunca duplicar web/mobile lo que pueda vivir en el engine.
- **`prefers-reduced-motion` / Reduce Motion**: variantes fade obligatorias; nunca >3 destellos/s; sin loops perpetuos durante esfuerzo.
- **Responsive**: PWA usable de 320px a desktop (en ≥768px el ejecutor usa layout de dos columnas media+captura); RN respeta safe areas/notch/teclado.
- **Temas**: ejecutor dark-only por diseño; todo lo de nivel dashboard (sheet día hecho, bloqueo, toggle de marca) respeta claro/oscuro.
- **Migraciones**: solo aditivas, protocolo AGENTS.md (nunca db push ciego); toda columna user-editable nueva con su column-level grant.
- **Rollout con flags y fallback**: RN patrón `executorV2` existente → flag `executorV3` con fallback; web vía Edge Config (`eva-config`), patrón nutrición V2. Rollback = apagar flag.
- **Features nativas nuevas = build EAS** (precedente notify-kit); nada llega por OTA. QA device del CEO por ola nativa.
- Cuota Supabase Image Transformations: gifs → webp estático en listas; media animada solo en la card activa.

## 4. Fuera de alcance (este plan)

- Plate calculator, wheel como método primario, mascota/personaje.
- Editor de planes del coach (solo se consume el plan).
- Deprecación de `LegacyExecutor`/ExecutorV2: se retira recién cuando V3 esté estable en prod (tarea de cierre, no de este plan... salvo la ola final lo declare).

## 5. Criterio de éxito

- Alumno registra una serie típica en ≤2 taps; sesión completa sin señal termina y reconcilia sin pérdida.
- Los 4 tipos tienen experiencia propia; superseries con rondas intercaladas intactas.
- Recuperar un día pendiente limpia el pendiente de la semana (atribución visible).
- Post-gracia: cero superficies visibles del alumno salvo la pantalla de bloqueo.
- Gates verdes por ola: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm --filter @eva/mobile exec tsc --noEmit`, `pnpm check:tokens`, `pnpm docs:check` (+ build Vercel para web).
- El coach puede alternar ejecutor coach-color/EVA-color desde su creador de marca y el cambio se refleja en web y RN.
