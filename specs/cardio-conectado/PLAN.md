# Cardio Conectado (Fases 1+2) - PLAN

**Status:** APPROVED
**Owner:** CEO + Claude
**Last updated:** 2026-07-30
**Spec:** `specs/cardio-conectado/SPEC.md`

---

## Architecture

Sin migración DB: la curva/resumen de FC viaja en `workout_logs.metadata` (jsonb ya existente, mobile ya lo escribe vía PostgREST con RLS `client_id = auth.uid()`), bajo la clave `hr` versionada (`{v:1, source:'ble'|'health_import', ...}`). Los bloques cardio hoy no usan `metadata` (solo movilidad unilateral usa `left_sec/right_sec`), así que no hay colisión.

Lógica portable en `packages/cardio` (acumulador de zona, downsample, matching de workouts del hub); APIs nativas en `apps/mobile/lib` tras guards dinámicos (patrón `ble-hr.ts`/`health-aggregators.ts` intacto); UI route-local en `components/alumno/workout/v3`. Persistencia reutiliza `buildTypedPayload` → `logSet` (select-then-upsert + cola offline) sin tocar el motor.

Datos en vivo (BLE): `ble-hr.ts` expone además `maxHr` y `lastSampleAtMs`; `CardioScreenV3` acumula con el reducer puro de `@eva/cardio` y clasifica con el `hrToZone` existente (mismos cortes que la prescripción — cero drift).

Import del reloj: `health-aggregators.ts` amplía lecturas a workouts/FC/distancia/calorías. iOS migra internamente de `react-native-health` (congelada) a `@kingstinct/react-native-healthkit` (Nitro, New Arch, SDK 54) conservando la API pública del módulo; Android sigue `react-native-health-connect`. La UI de import vive en el resumen (`SessionCompleteV3`), patrón espejo del `checkInReminder`: no bloquea el cierre.

## Files

| Action | Path | Notes |
|---|---|---|
| CREATE | `packages/cardio/zone-session.ts` | Reducer puro: muestras → zone_sec/avg/max/serie; debounce fuera-de-zona; downsample ≤360 pts |
| CREATE | `packages/cardio/zone-session.test.ts` | Vitest |
| CREATE | `packages/cardio/hub-workout.ts` | Tipo `HubWorkout`, `matchHubWorkoutToWindow` (solape ≥50%), `hubImportPatch` (solo ejes vacíos), `hubZoneSec` |
| CREATE | `packages/cardio/hub-workout.test.ts` | Vitest |
| UPDATE | `packages/cardio/types.ts` | `HrMetadataV1` (shape de `metadata.hr`) |
| UPDATE | `packages/workout-engine/set-log-payload.ts` | ctx opcional `hrMetadata` → `payload.metadata` |
| UPDATE | `packages/workout-engine/set-log-payload.cardio.test.ts` | cobertura del ctx nuevo |
| UPDATE | `apps/mobile/lib/ble-hr.ts` | `maxHr` + `lastSampleAtMs` en estado (reset en conexión fresca) |
| UPDATE | `apps/mobile/lib/health-aggregators.ts` | swap iOS a kingstinct; `readHubWorkouts(startMs, endMs)` ambas plataformas; permisos ampliados |
| UPDATE | `apps/mobile/lib/health-aggregators-pure.ts` | normalizadores puros hub→`HubWorkout` |
| UPDATE | `tests/mobile/health-aggregators.test.ts` | normalizadores nuevos |
| UPDATE | `apps/mobile/components/alumno/workout/v3/CardioScreenV3.tsx` | HUD: tiempo-en-zona, ZoneBar, avg/max, háptica; `metadata.hr` al cerrar |
| CREATE | `apps/mobile/components/alumno/workout/v3/ImportWatchSheet.tsx` | sheet de import post-sesión |
| UPDATE | `apps/mobile/components/alumno/workout/v3/SessionCompleteV3.tsx` | card "Importar de tu reloj" (patrón checkInReminder) |
| UPDATE | `apps/mobile/components/alumno/workout/v3/ExecutorV3.tsx` | ventana de sesión + wiring del import → `logSet` |
| UPDATE | `apps/mobile/app.json` | plugin kingstinct; permisos Android `health.READ_EXERCISE/READ_HEART_RATE/READ_DISTANCE/READ_ACTIVE_CALORIES_BURNED`; purpose strings iOS |
| UPDATE | `apps/mobile/package.json` + lockfile | `-react-native-health` `+@kingstinct/react-native-healthkit` |
| UPDATE | `docs/status/MOBILE_PARITY.md`, `docs/operations/MANUAL_TASKS.md` | estado + data types nuevos del form Play Health |

## Data Model

- DB changes: **ninguno** (reuso `workout_logs.metadata` jsonb).
- RLS impact: ninguno (mismo pipeline RLS-scoped).
- Generated types impact: ninguno.
- Shape `metadata.hr` (v1): `{v:1, source:'ble'|'health_import', avg:int, max:int, duration_sec:int, target_zone:1-5|null, zone_sec:{"1"..."5":int}|null, in_target_sec:int|null, sample_period_sec:int|null, samples:[[offsetSec,bpm],...]|null, hub_source?:string, distance_m?:number, calories?:number}`.

## Server Actions

No aplica (mobile PostgREST directo con RLS, patrón existente del ejecutor). Sin endpoints nuevos.

## UI/UX

- Dark-first (el ejecutor V3 es dark); colores de zona vía `zoneRingColor` existente; tema `exec` por props.
- Degradación honesta: sin módulo nativo → UI ausente; sin perfil FC → BPM crudo sin zona.
- Import: confirmación explícita con fuente y horario antes de escribir; jamás pisa valores tipeados.
- Safe areas y `reducedMotion` respetados; háptica con debounce 10 s.

## Phases

1. **W1 Puro** — `packages/cardio` + `set-log-payload` + tests (paralelo con W2).
2. **W2 Nativo** — `ble-hr.ts`, `health-aggregators*`, deps, `app.json` (paralelo con W1).
3. **W3 UI** — CardioScreenV3 + ImportWatchSheet + SessionCompleteV3 + ExecutorV3 (tras W1+W2).
4. **Juicio + gates** — revisión de diffs (Fable), `tsc` mobile, Vitest dirigido, `expo export android`, docs.

## Test Plan

- Unit: zone-session (acumulación, gaps >10 s, downsample), hub-workout (matching solape, patch solo-vacíos, zone_sec), set-log-payload ctx hrMetadata, normalizadores hub puros.
- Integration: no aplica en esta fase (módulos nativos tras guard; sin runner nativo en CI).
- E2E: no (Playwright solo con OK explícito).
- Manual: QA física con correa BLE real + reloj (Apple Watch/Galaxy) en build EAS nueva — pendiente declarado, mismo bloque que QA-4.

## Rollback Plan

Revert del commit (JS puro + config). Sin migración DB que revertir. Si la migración a kingstinct falla en build EAS: revert del par `package.json`/`app.json` + `health-aggregators.ts` restaura `react-native-health` (pasos/sueño quedan como hoy); `metadata.hr` ya escrito es inerte (nadie lo lee aún).
