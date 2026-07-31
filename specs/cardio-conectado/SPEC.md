# Cardio Conectado (Fases 1+2) - SPEC

**Status:** APPROVED (alcance fases 1+2 aprobado por CEO 2026-07-30)
**Owner:** CEO + Claude
**Last updated:** 2026-07-30
**Related plan:** `specs/cardio-conectado/PLAN.md`
**Investigación origen:** artifact "EVA x Gadgets" 2026-07-30 + mapa técnico ejecutor V3 (esta sesión)

---

## Problem

Un coach asigna cardio ("30 min zona 2") y el alumno entrena con un gadget (correa de pecho, banda, smartwatch), pero EVA aprovecha casi nada de ese hardware:

- El BLE en vivo (E6.1) solo muestra un chip de BPM + zona instantánea; no acumula tiempo en zona, ni max, ni guarda la curva — el coach recibe un único promedio (`actual_avg_hr`).
- Apple Watch / Galaxy Watch / Mi Band no transmiten BLE estándar, así que hoy quedan **totalmente fuera**: la sesión que el reloj registró (duración, distancia, calorías, serie de FC) muere en Apple Health / Health Connect sin que EVA la lea (los agregadores hoy solo leen pasos + sueño).
- Resultado real reportado por el CEO: un alumno con Apple Watch no pudo ver su pulso en EVA de ninguna forma.

## Users

- Primary: alumno que ejecuta bloques cardio en el ejecutor V3 (RN) con cualquier gadget.
- Secondary: coach que prescribe zonas y quiere evidencia de cumplimiento (consume en fase 3, fuera de este alcance).
- Internal/operator: QA de builds nativas (los módulos viven tras guards dinámicos).

## Goals

- **G1 (Fase 1 — HUD en vivo BLE):** con sensor conectado, la ventana del bloque cardio muestra tiempo acumulado en la zona objetivo, barra de zonas con posición actual vs objetivo, promedio y máximo en vivo, y aviso háptico sutil al salirse de zona de forma sostenida.
- **G2 (Fase 1 — persistir la curva):** al cerrar un bloque cardio con stream BLE, guardar en `workout_logs.metadata.hr` resumen + serie downsampleada (max, avg, tiempo por zona, muestras) sin migración DB.
- **G3 (Fase 2 — importar del reloj):** al terminar una sesión con bloques cardio, si hay agregador de salud disponible, ofrecer importar el workout que el reloj registró (duración, distancia, FC promedio/máx, calorías, serie FC si existe) y rellenar los ejes vacíos del log + `metadata.hr` con `source: 'health_import'`.
- **G4 (Fase 2 — plumbing de salud):** ampliar los agregadores a lectura de workouts + FC + distancia + calorías activas, migrando iOS de `react-native-health` (congelada por sus autores) a `@kingstinct/react-native-healthkit`, conservando la API pública de `health-aggregators.ts` (pasos/sueño incluidos).

## Non-Goals

- Panel del coach en web (fase 3, spec aparte cuando se apruebe).
- Espejo del HUD nuevo en la PWA web (`web-ble-hr`) — se difiere; se anota en paridad.
- Background sync / observers (lectura solo just-in-time en foreground).
- Companion app de reloj, FTMS (máquinas), GPS del teléfono, VBT, agregadores API de pago.
- Escribir workouts de EVA de vuelta a los hubs (candidato a fase posterior).
- Cambiar el modelo de captura manual: el teclado y sus ejes quedan intactos; el import **jamás pisa un valor tipeado por el alumno**.

## User Stories

- Como alumno con correa/banda BLE, quiero conectar el sensor en la misma ventana del bloque y ver cuánto tiempo llevo en la zona pedida, para saber si voy bien sin sacar cuentas.
- Como alumno con Apple Watch / Galaxy Watch / Mi Band, quiero que al terminar la sesión EVA me ofrezca importar lo que registró mi reloj, para no teclear duración/distancia/FC a mano.
- Como alumno, quiero que nada de esto invente datos ni pise lo que yo escribí, para confiar en mi historial.
- Como coach (fase 3), quiero que la curva y el tiempo en zona queden persistidos desde ya, para que el panel futuro tenga historia real.

## Acceptance Criteria

- [ ] Funcional F1: con stream BLE activo y `hr_zone` prescrita, el HUD muestra tiempo-en-zona acumulado (mm:ss), barra de 5 zonas con marcador vivo y objetivo, avg y max de sesión; sin perfil FC del alumno degrada al chip actual (BPM crudo) sin inventar zona.
- [ ] Funcional F1: háptica de fuera-de-zona solo tras ≥10 s sostenidos fuera, con rearme al volver, respetando `reducedMotion` y sin sonar en pausa.
- [ ] Funcional F1: al cerrar el bloque con stream, `metadata.hr` queda `{v:1, source:'ble', avg, max, target_zone, zone_sec, sample_period_sec, samples}` con serie downsampleada (≤360 puntos); sin stream no se escribe `metadata.hr`.
- [ ] Funcional F2: al finalizar sesión con ≥1 bloque cardio y agregador disponible, aparece card "Importar de tu reloj" en el resumen (`SessionCompleteV3`); permisos se piden just-in-time al tocarla; si el hub no tiene workout que calce con la ventana de la sesión, la card muestra estado vacío honesto.
- [ ] Funcional F2: el import rellena SOLO ejes vacíos (`actual_duration_sec`, `actual_distance_m`, `actual_avg_hr`) del/los bloques cardio elegidos, escribe `metadata.hr` con `source:'health_import'` (+ `zone_sec` si el hub trajo serie), y muestra "Tiempo en Z2: X de Y min" cuando hay zona prescrita y serie.
- [ ] Seguridad/privacidad: solo permisos de LECTURA nuevos (workouts, FC, distancia, calorías activas); opt-in revocable; escritura vía pipeline existente `logSet` (PostgREST + RLS `client_id = auth.uid()`); cero secretos; cero escritura a los hubs.
- [ ] Degradación honesta: en Expo Go/web o build sin módulos nativos, ni el HUD extendido BLE ni la card de import aparecen; jamás un dato inventado ni un botón muerto.
- [ ] Accesibilidad: tiempo-en-zona y barra de zonas con `accessibilityLabel` descriptivos; card de import operable con lector de pantalla.
- [ ] Observabilidad: fallos de import loguean a Sentry con tag `cardio-conectado` sin datos de salud en el mensaje (solo códigos/conteos).
- [ ] Gates: `pnpm --filter @eva/mobile exec tsc --noEmit`, Vitest de los dominios tocados, `expo export --platform android` verdes; QA física y build EAS quedan declarados como pendientes reales.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Migración iOS a `@kingstinct/react-native-healthkit` rompe pasos/sueño existentes | Regresión en HabitsCard | API pública de `health-aggregators.ts` intacta; mitades puras ya testeadas; QA física en build nueva antes de release |
| `metadata.hr` crece el payload de `workout_logs` | Filas pesadas / cola offline lenta | Downsample a ≤360 puntos (~6-8 KB); serie opcional, resumen siempre |
| Matching del workout del hub equivoca la sesión | Import llena datos ajenos | Solape mínimo 50% con la ventana de sesión + confirmación visual del alumno antes de aplicar (fecha, duración, fuente) |
| Nuevos permisos de salud requieren actualizar la declaración de Play | Rechazo/bloqueo del form Health Connect | Documentar en MANUAL_TASKS los data types nuevos + justificación; recordar Organization Account |
| Doble fuente (BLE + import) para el mismo bloque | Datos inconsistentes | Precedencia: BLE en vivo gana; import solo rellena ejes vacíos y no reemplaza `metadata.hr` con `source:'ble'` |

## Open Questions

- [ ] ¿La card de import debe reaparecer si el alumno la saltó y el workout del reloj llegó tarde al hub (sync diferido del fabricante)? V1: no; se anota como deuda.
- [ ] Copy exacto de la háptica/aviso fuera-de-zona (revisar con CEO en QA física).
