# PLAN — Ejecutor V3 por olas

> Cómo se construye lo definido en `SPEC.md`. Seis olas + una diferida; cada ola es shippable, con flag/rollback propio y gates. Orden pensado para: (1) valor temprano sin esperar el rediseño, (2) cimientos puros antes que UI, (3) RN como versión de referencia con web espejo, (4) lo que exige build nativa al final del tramo de código.
> Ejecución: waves de workers (Opus) orquestadas; unidades en `TASKS.md` con marca [P] paralelizable / [S] secuencial (comparten archivo).

## Arquitectura transversal

**Flags y rollout.** RN: `executorV3` en `apps/mobile/lib/flags.ts` (default OFF, remoteable vía `/api/mobile/config`), switch en `app/alumno/workout/[planId].tsx` → V3 | ExecutorV2 (fallback fail-safe, mismo patrón del flag `executorV2` actual). Web: key `executor_v3` en Edge Config `eva-config` (patrón nutrición `mode=on`) + override localStorage para dev/QA. Las piezas fuera del ejecutor (gate, atribución, sheet día hecho) NO van tras el flag del ejecutor: son fixes de producto independientes con su propio riesgo (bajo) y se despliegan directo.

**Theming.** Ejecutor dark-only. Token raíz `--exec-brand` resuelto por `coaches.executor_theme` (`'coach' | 'eva'`, default `'coach'`): coach → `--theme-primary` actual; eva → tema multicolor EVA (Sport acciones / Aqua recovery-movilidad-roller / Ember celebración). Zonas FC: tokens fijos nuevos `--zone-z1..z5` compartidos (web `globals.css` + RN brand-kit), jamás re-teñidos. El chooser/gate (fuera del ejecutor) usan los temas claro/oscuro normales de la app.

**Motor.** Todo lo puro nuevo entra a `@eva/workout-engine` con unit tests: `cardio-progress.ts` (objetivo+avance → % y restante), `hr-zone.ts` (`hrToZone(bpm, perfil)`), `pr-detect.ts` (`detectPR(log, histórico)`, excluye sustituidos), `celebration.ts` (evento semántico → tier micro/media/épica), y la subida de `keypad-flow.ts` + `set-log-payload.ts` desde `apps/mobile` (la web deja de espejar el mapeo a mano en `LogSetForm.tsx`). Motion tokens (duraciones, springs, tiers) en módulo compartido consumible por ambas UIs.

**Datos (todo aditivo).**
- `rpe`/`rir` (corrección CEO 2026-07-22): RPE queda 1-10; RIR pasa a **0-10** en Zod (el CHECK de DB de rir ya era 0-10; el de rpe se mantiene 1-10).
- Holds por lado: exponer `metadata` (jsonb ya existente y reservado para esto) en el schema como record opcional `{left_sec?, right_sec?}`; tocar las 5 superficies del payload de una vez; keypad de movilidad pide 1 o 2 valores según `side_mode`. Verificar column-level grant de `metadata` antes de escribir.
- `target_date` (edición de fechas pasadas): `getWorkoutExecutionData(planId, targetDate?)` carga logs de esa ventana Santiago; `logSetAction` con `targetDate` opcional en **modo solo-UPDATE** (si no existe la fila, error tipado; jamás INSERT en fechas pasadas → imposible farmear adherencia retroactiva; respaldado por el índice único `workout_logs_one_set_per_day`).
- `coaches.executor_theme text default 'coach'` + column-level grant UPDATE para el coach; migración aditiva LIVE con protocolo AGENTS.md; expuesta en branding web (layouts) y en el payload de branding/config de RN.

**Atribución semanal (fix del gap).** `deriveWeekWorkoutStatus`: un día X de la semana actual queda `done` si SU plan tiene logs en cualquier día de esta semana; la celda informa "Hecho el {día}". Edge: mismo plan asignado a 2+ días → asignación greedy al día pendiente más antiguo sin done. Espejo exacto en RN (`home.tsx`). Momentum/racha intactos (fecha real, by design).

**Gate bloqueo total.** Web: allowlist del proxy (`proxy.ts:970-1001`) queda solo `/suspended` (+ assets/logout); `suspended/page.tsx` variante `reason=coach` pierde los CTAs de lectura y adopta el diseño v3.3 (avatar coach, CTA contacto — link `mailto:`/WhatsApp del coach si hay teléfono en branding, sino copy plano — y cerrar sesión). RN: el layout del alumno consulta el resolver espejado y monta `<StudentAccessBlocked/>` fullscreen cuando `state==='readonly'`. Gracia 7d (funcional + banner) y kill-switch intactos. Fail-open se conserva.

**Sonido (asimétrico honesto).** Catálogo EVA bundleado (timbres ya existentes en `sound.ts`) + `expo-audio`; Android suma "Del sistema" vía tono de alarma del usuario (RingtoneManager; canal notif con `USAGE_ALARM`, gotcha un-canal-por-sonido). iOS jamás muestra "del sistema". Ajustes en tuerca: on/off cronómetro, tono, volumen, vibración, celebraciones (default OFF), keep-awake, RPE/RIR visibles. Persistencia device-scoped.

## Las olas

### Ola 0 — Cimientos (engine + datos + white-label) — sin UI de alumno
Motor y datos listos antes de cualquier pantalla. Unidades: motion-tokens + eventos/tiers; funciones puras (cardio-progress, hr-zone, pr-detect) con tests; subida de keypad-flow/set-log-payload al package (refactor consumo mobile + web); Zod RIR 0-10 (RPE queda 1-10); metadata sides en 5 superficies; migración `executor_theme` + grant + toggle en creador de marca (web) + propagación branding web/RN. Gate: typecheck+tests+boundaries+tokens; migración validada con tx-rollback + advisors.
**Riesgo**: la subida de keypad-flow toca el ejecutor actual (V2/web) — cubrir con tests de paridad de payload antes/después. **Rollback**: revert de PR; flag no aplica (sin UI).

### Ola 1 — Producto inmediato fuera del ejecutor (gate + atribución + día hecho)
Valor directo sin esperar el rediseño; todo con tema claro/oscuro. Unidades: fix atribución web+RN con tests de la semana tipo; gate bloqueo total web (proxy+suspended) + RN (pantalla bloqueo); sheet doble intención al tap de día (dashboard web + RN): hecho-hoy → resumen+editar directo; hecho-otro-día → "Revisar y editar" (target_date) / "Repetir hoy"; pendiente-semana → abre ejecutor con banner "Recuperando" (banner mínimo en ejecutor ACTUAL, se rediseña en Ola 2); plumbing target_date en query+action con tests de solo-UPDATE.
**Riesgo**: proxy es superficie sensible (login alumno) — QA manual de las 3 rutas (ok/grace/blocked) en preview antes de prod. **Rollback**: revert por unidad; gate tiene kill-switch.

### Ola 2 — Ejecutor V3 core loop (fuerza) — RN referencia, web espejo
Detrás de flag `executorV3`/Edge Config. Unidades: shell V3 (theming exec-brand + zonas fijas, header progreso, tuerca placeholder, dark-only); pantalla entrada animada + inicio; pantalla fuerza (stepper-first, media siempre visible con chips Instrucciones/Nota colapsables ~1.2s, "Anterior" 1-tap, prellenado sobrecarga, RPE/RIR pills (RPE 1-10, RIR 0-10), modales instrucciones/nota); captura dual (teclado custom preservado/agrandado + rueda long-press kg|reps — RN `@quidone/react-native-wheel-picker` o custom Reanimated, web scroll-snap custom — con hint primera vez); vista lista "ver todo"; integración intacta con draft/cola/reconciliación (cero cambios al motor de resiliencia). Web responsive: 320px→desktop (≥768px dos columnas).
**Riesgo**: el más grande de UI; mitigación = V2 intacto como fallback + flag off por default hasta QA. **Rollback**: flag off.

### Ola 3 — Descanso, tipos únicos y superseries
Unidades: descanso-interstitial fullscreen (countdown, ±15s/saltar, siguiente con media, micro-celebración, peek "Plan completo" arrastrable); movilidad serena con holds secuenciados por lado (escribe `{left_sec,right_sec}` si `per_side`; suma al agregado `actual_hold_sec` para compatibilidad); roller contador +1 gigante; cardio con identidad (nombre+media catálogo, métricas por máquina, countdown anillo, jerarquía N1/N2/N3, FC manual aún) + fases de intervalo (colores fijos esfuerzo/recuperación, cues visuales; beeps quedan listos para Ola 5); superserie V3 (rondas intercaladas + momento ronda-cerrada + descanso de grupo); sustitución "máquina ocupada" portada a RN; tuerca ajustes UI completa (sonido gris "requiere actualización" hasta Ola 5 en RN; web ya suena con Web Audio actual).
**Riesgo**: movilidad toca payload — ya cubierto por Ola 0 (5 superficies) + tests. **Rollback**: flag off.

### Ola 4 — Celebración, cierre y rachas
Unidades: sistema de celebración (eventos del engine → micro por serie / media por ejercicio-ronda / épica fin+PR; confetti `react-native-fast-confetti` RN / canvas-confetti web; reduced-motion variantes); PR en vivo inline (detectPR + dorado); pantalla final (coreografía 2 fases, stats tickers, mapa muscular evolucionado del actual, racha semanal, share-card reencuadrada); racha semanal (sesiones vs plan de la semana, UI en inicio+final+dashboard; sin streaks diarias, sin guilt).
**Riesgo**: fatiga de celebración — dosificación por tiers es parte del contrato de `celebration.ts` (testeable). **Rollback**: flag off.

### Ola 5 — Nativo I (build EAS #1 del ejecutor)
Todo lo que exige binario nuevo, junto para UNA build. Unidades: activar `expo-audio` (timbres bundleados) + catálogo en tuerca; "Del sistema" Android (módulo ringtone + canal USAGE_ALARM); cronómetro lockscreen Android (notify-kit, ya codificado NO-OP → ON); `expo-video` para media del ejercicio; Media Session RN (paridad con web); haptics enriquecidos por evento (paleta semántica). iOS Live Activity del descanso queda DIFERIDA (módulo ActivityKit propio, expo-live-activity deprecada) → candidata a Ola 7.
**Gate extra**: build EAS + QA device CEO (Android e iOS). **Rollback**: flag de features por ajuste (sonido off) + build anterior.

### Ola 6 — Wearables capa 1 + pasos (build EAS #2)
Unidades: BLE 0x180D con `react-native-ble-plx` (dev build, permisos iOS/Android) + sheet "Conectar sensor" + BPM vivo en cardio con `hrToZone` (zona en vivo) + persistencia `actual_avg_hr` automática; PWA Web Bluetooth (solo Chrome/Edge Android; iOS PWA oculta el módulo); pasos: HealthKit + Health Connect leen pasos diarios → auto-llenar widget de hábitos (con opt-in del alumno y edición manual conservada); distancia/calorías al resumen post-sesión.
**Gate extra**: build EAS + QA device con cinta/reloj real del CEO. **Rollback**: módulo sensor oculto por flag; hábitos vuelven a manual.

### Ola 7A — Descanso en lockscreen premium (build EAS #3)
La jugada estrella que la PWA no puede igualar. **iOS**: Live Activity + Dynamic Island para el rest timer — módulo ActivityKit PROPIO (expo-live-activity fue deprecada jun-2026): config plugin Expo + Widget Extension como target adicional del proyecto iOS (vía `@bacons/apple-targets` o target manual), `Text(timerInterval:)` cuenta nativo con la app suspendida, botones −15s/Saltar/+15s vía App Intents que despiertan la app, iOS 16.2+, payload <4KB, inicio local al arrancar el descanso (sin push necesario). **Android**: upgrade del cronómetro de Ola 5 a Live Updates de Android 16 (`ProgressStyle` + promoted ongoing, API 36+) con fallback limpio al chronometer de notify-kit en APIs menores.
**Prerequisitos duros**: acceso a la cuenta Apple Developer (targets nuevos = provisioning profiles nuevos; aprovechar para cerrar también el pendiente de Associated Domains) + device iOS con Dynamic Island para QA ideal.
**Riesgo**: revisión de App Store del extension target; mantenimiento de módulo nativo propio. **Rollback**: el Live Activity es aditivo — sin él, notificación normal (Ola 5) sigue funcionando.

### Ola 7B — Companions de reloj (DIFERIDA, decisión CEO 2026-07-22)
El CEO no quiere apps dentro del smartwatch por ahora. Se documenta porque es el ÚNICO camino técnico futuro para BPM en vivo desde Apple Watch / Galaxy Watch (protocolos cerrados, no transmiten BLE abierto). Todo lo demás del reloj (pasos, sueño, distancia, calorías, BPM promedio) llega SIN app de reloj vía agregadores en Ola 6.
Cierra el único hueco que BLE no cubre (protocolos cerrados). **Secuencia recomendada: watchOS primero** (cohorte mayor en Chile), Wear OS después como sub-fase. **watchOS**: app companion SwiftUI embebida en el binario iOS — `HKWorkoutSession` + `HKLiveWorkoutBuilder` (HR latido-a-latido, calorías, distancia) + WatchConnectivity al teléfono (módulo: `expo-watch-connectivity` v0.1.0 está verde → probablemente módulo propio delgado); sesión espejo iniciable desde el iPhone (iOS 17+); el BPM entra al MISMO pipeline `hrToZone`/`actual_avg_hr` de la Ola 6 (cero cambio de datos). **Wear OS**: app Kotlin con Health Services en el reloj + Data Layer API al teléfono; mismo contrato de datos.
**Prerequisitos duros**: Apple Watch y Galaxy Watch físicos para QA (¿los tienen tú o el socio? — si no, comprar/prestar antes de arrancar 7B); cuenta Apple con capacidad HealthKit en ambos targets; Play Console para el módulo Wear.
**Riesgo**: el mayor esfuerzo del proyecto (Swift/Kotlin reales, dos plataformas de reloj, review doble); estimarlo por sub-fase al llegar. **Rollback**: sin companion, el usuario de Apple/Galaxy Watch usa cinta BLE (Ola 6) o registra manual — la UI ya degrada honesta.

## Secuencia y dependencias

```
Ola 0 ──► Ola 2 ──► Ola 3 ──► Ola 4 ──► Ola 5 (build) ──► Ola 6 (build) ──► Ola 7A (build, teléfono no reloj)
   └────► Ola 1 (independiente; puede correr en paralelo con Ola 2)
Ola 7B (companions de reloj): DIFERIDA — decisión futura del CEO.
```
Nota: 7A depende de Ola 5 (rest timer nativo encendido) y NO involucra relojes — es lockscreen/Dynamic Island del TELÉFONO. 7B queda diferida; si algún día se activa, depende de Ola 6 (el companion solo es otra fuente del mismo pipeline BPM/zona) y de prerequisitos externos (cuenta Apple, relojes físicos de QA).
Dentro de cada ola, `TASKS.md` marca [P]/[S]. Tras cada wave de workers: pasada de juicio (diff vs pedido) → correcciones al mismo worker → gates de la ola → commit por unidad lógica en esta rama → PR #162 acumula; merge a `rnmobiledenuevo` por ola completa (o al cierre, decisión CEO).

## QA y gates por ola

- Siempre: `pnpm lint` + `pnpm typecheck` + `pnpm test` + `pnpm --filter @eva/mobile exec tsc --noEmit` + `pnpm check:tokens` + `pnpm docs:check`; diff revisado; sin tocar lockfile salvo unidad que lo declare (wheel-picker, ble-plx, expo-audio/video: `pnpm` en raíz, lockfile actualizado en el MISMO commit — gotcha Dependabot).
- Olas 2-4: QA visual web en preview Vercel (viewports 320/390/768/1280, dark) + Expo dev en device; Playwright solo local con OK explícito del CEO (regla vigente).
- Olas 5-6: build EAS + QA device CEO obligatorio antes de encender flags.
- Migraciones (Ola 0): snapshot + tx-rollback + advisors en LIVE aditivo (protocolo AGENTS.md); jamás editar migraciones aplicadas.
- Docs canónicos (`docs/status/CURRENT.md`, `MOBILE_PARITY.md`) se actualizan AL MERGEAR a `rnmobiledenuevo` (no antes, para no chocar con la sesión de paridad activa).

## Riesgos top y mitigación

1. **Romper el motor de resiliencia** al montar UI nueva → prohibido tocarlo (Ola 0 lo blinda con tests de paridad de payload); toda serie sigue pasando por el mismo pipeline.
2. **Drift RN/web** → mapeos en el engine (Ola 0), misma fuente de verdad; unidades espejo se hacen en pares dentro de la misma wave.
3. **Proxy/gate** (superficie de login) → cambios mínimos, QA de los 3 estados en preview, kill-switch listo.
4. **Builds nativas** concentradas en 2 olas para minimizar ciclos de QA device del CEO.
5. **Scope creep visual** → los mockups v3.3 son el contrato; cambios de diseño nuevos = iteración de mockup primero, código después.
