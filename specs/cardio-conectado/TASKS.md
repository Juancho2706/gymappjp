# Cardio Conectado (Fases 1+2) - TASKS

**Status:** IN PROGRESS
**Owner:** CEO + Claude
**Last updated:** 2026-07-30
**Spec:** `specs/cardio-conectado/SPEC.md`
**Plan:** `specs/cardio-conectado/PLAN.md`

---

## Tasks

- [ ] T1 - `packages/cardio/zone-session.ts` + tests (reducer muestras→zonas, debounce fuera-de-zona, downsample ≤360 pts, `HrMetadataV1`)
  - Scope: solo `packages/cardio` (+ export wiring). TS puro, sin RN.
  - Verification: Vitest verde; casos de gaps y clamp.
- [ ] T2 - `packages/cardio/hub-workout.ts` + tests (`HubWorkout`, matching solape ≥50%, `hubImportPatch` solo-vacíos, `hubZoneSec`)
  - Scope: solo `packages/cardio`.
  - Verification: Vitest verde; empates y sin-match cubiertos.
- [ ] T3 - `set-log-payload.ts` ctx `hrMetadata` + test
  - Scope: `packages/workout-engine`; byte-idéntico sin ctx nuevo.
  - Verification: suite cardio existente intacta + casos nuevos.
- [ ] T4 - `ble-hr.ts`: `maxHr` + `lastSampleAtMs` (reset solo en conexión fresca)
  - Scope: `apps/mobile/lib/ble-hr.ts`.
  - Verification: tsc mobile; sin cambio de API restante.
- [ ] T5 - `health-aggregators*`: swap iOS a `@kingstinct/react-native-healthkit`, `readHubWorkouts` ambas plataformas, permisos ampliados, normalizadores puros + tests, deps + `app.json`
  - Scope: `apps/mobile/lib/health-aggregators*.ts`, `package.json`, lockfile, `app.json`, `tests/mobile/health-aggregators.test.ts`.
  - Verification: tsc mobile; Vitest normalizadores; API pública intacta (HabitsCard sin cambios).
- [ ] T6 - `CardioScreenV3`: HUD conectado (tiempo-en-zona, ZoneBar, avg/max, háptica debounce 10 s) + `metadata.hr` al cerrar
  - Scope: `CardioScreenV3.tsx` (+ helpers locales).
  - Verification: tsc; degradación sin perfil FC; a11y labels.
- [ ] T7 - Import del reloj: `ImportWatchSheet.tsx` + card en `SessionCompleteV3` + wiring en `ExecutorV3` (ventana de sesión, patch vía `logSet`)
  - Scope: `components/alumno/workout/v3/`.
  - Verification: tsc; gate `isHealthAvailable()`; jamás pisa tipeado; Sentry sin datos de salud.
- [ ] T8 - Juicio Fable + gates + docs (`MOBILE_PARITY.md`, `MANUAL_TASKS.md` data types Play)
  - Scope: revisión de diffs, `pnpm --filter @eva/mobile exec tsc --noEmit`, Vitest dirigido, `expo export --platform android`.
  - Verification: resultados reales declarados; pendientes honestos (build EAS + QA física).

## Universal Definition of Done

- [ ] `pnpm --filter @eva/mobile exec tsc --noEmit`
- [ ] Vitest dirigido de dominios tocados
- [ ] Sin acceso Supabase nuevo fuera del pipeline `logSet` existente
- [ ] Degradación honesta en Expo Go/web (sin botones muertos)
- [ ] Dark mode + `reducedMotion` + safe areas verificados en UI tocada
- [ ] Docs canónicos actualizados (paridad, manual tasks)
- [ ] Pendientes reales declarados: build EAS nueva (deps/plugins/permisos nuevos NO viajan por OTA) + QA física con sensor y reloj

## Notes

- Prohibido a workers: `git stash`/commits/instalaciones fuera de las listadas.
- `metadata.hr` versionado `v:1`; consumidor web llega en fase 3.
- Precedencia de fuentes: BLE en vivo > import del hub; import solo rellena ejes vacíos.
