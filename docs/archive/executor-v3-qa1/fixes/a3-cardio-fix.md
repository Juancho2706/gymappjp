# Cierre de fixes — Unidad A3 · CARDIO

**Fecha:** 2026-07-22 · **Rama:** fix/executor-v3-qa1 · **Worktree:** executor-redesign

Dueño de: `CardioStepV3.tsx` (web) + `CardioScreenV3.tsx` (RN) + bloques CSS cardio en `globals.css`.

## Deltas cerrados

### BLOCKER
- **D1 — Grilla de chips de métricas reintroducida (web + RN).** Look `.a3a-cchip` exacto (fondo `#1a1a22`, borde 1.5px `#2a2a34`, radio 14, `cv` 15/900, `cl` 9/800 uppercase `#7f7f8c`). Chips SOLO con dato derivable HOY, sin telemetría inventada:
  - Continuo (countdown): **Objetivo** (duración prescrita) + **Distancia** objetivo (si `distance_value>0`).
  - Intervalos: **Trabajo** (duración de la 1ª fase work, ámbar z4) + **Recupera** (1ª fase recovery, verde z2).
  - Los chips sin dato NO se renderizan (el que queda solo pasa a `wide`).
  - **BPM en vivo:** se mantiene en su fila/chip honesto dedicado (`.exec-v3-hrlive` web con corazón latiendo D17; `chip-bpm-vivo` RN con punto latiendo), NO se duplica dentro de la grilla, para no tocar la UI de sensor de Ola 6.

### MAYOR
- **D2 — Botón juicy "Pausar/Reanudar" en web.** Nuevo `CardioPauseButton` (reusa `.exec-v3-juicy` + `.exec-v3-pausebtn`: full-width, alto 58, ícono dos barras `fill`, breathe 2.6s). Presente en continuo (countdown) e intervalos, oculto cuando terminó. RN ya CUMPLÍA.
- **D3 — Anillos engrosados a `strokeWidth 22`** (web 12→22 en los 4 círculos; RN 13/15→22 en los 3 heroes). Proporcional al mockup (banda 20–26).
- **D4 — RN: eliminado el naranja hardcodeado `#FF6A3D`.** Nuevo `chipColor` = `exec.accent` (marca) en continuo / `PHASE_COLORS.work` (#fb923c = z4) en intervalos, aplicado a chip de identidad y `TypedMediaV3 accent`.
- **D5 — Web: chip de identidad ámbar en intervalos.** Variante `.exec-v3-chip.is-amber` (color-mix `--zone-z4`), activada cuando `isInterval`.
- **D6 — RN: pastilla "Luego: {fase} {tiempo}"** con fondo/borde color-mix de la próxima fase + punto 9px (como web).
- **D7 — RN: cue de zona de respaldo.** Mapa `ZONE_CUE` (es-neutro con tildes); el chip muestra rango bpm si el perfil FC viaja, si no el cue ("Mantén el ritmo", etc.).

### MENOR
- **D9 — Web: anillo 196 (continuo) / 224 (intervalo)** vía `width/height` inline en el `holdwrap` (antes 214 fijo). RN ya era fiel.
- **D10 — Números del hero:** web `holdnum` 52→56; RN countdown/stopwatch 52→54 (lineHeight 56), intervalo 56.
- **D11 — Web: track del anillo `#262c31`→`#26262f`.**
- **D12 — Web: `holdlbl` letter-spacing `.14em`→`.16em`.**
- **D13 — Chip de zona:** web padding 9/16→10/18, font 15→16; RN padding 16/9→18/10.
- **D14 — Breathe del número del hero:** web `@keyframes exec-v3-breathe` sobre `holdnum:not(.is-done)` (2.8s); RN `MotiView` scale 1↔1.02 en countdown/interval/stopwatch. Off en reduced-motion.
- **D15 — Keyframe `exec-v3-beat` duplicado ARREGLADO:** eliminado el segundo bloque (escala 1.14); queda UNO solo con escala 1.3 (usado por dots de progreso, corazón del radar y BPM en vivo — ninguno dependía del 1.14). Punto de zona ahora usa `@keyframes exec-v3-cardiopulse` (encoge a .7 + opacidad .4) en vez de beat; RN: punto con halo 4px translúcido + `MotiView` pulse (shrink+fade).
- **D16 — RN: halo del segmento de intervalo ACTUAL** (wrapper con padding 3 + fondo translúcido z4 22%, fila `alignItems:center`), como el `box-shadow 0 0 0 3px` del mockup.
- **D17 — Web: el corazón del chip de BPM en vivo late** (`exec-v3-hrlive-pulse` → beat 1s, off en reduced-motion).

## Pendientes / no cerrados (con razón)

- **D8 (MAYOR) — FC honesta, por diseño.** NO se copió el copy idealizado del mockup ("Reloj conectado · Apple Watch o Galaxy Watch"). La app entrega FC manual (o BLE real si hay sensor Ola 6); mostrar "reloj conectado" sin reloj sería deshonesto. Decisión de producto — requiere OK del CEO para cambiar el encuadre.
- **D18 (MENOR) — copy del chip.** Se mantuvo el label dinámico "Cardio · {detalle}" (más informativo, tildes correctas) en vez del literal "Cardio — Máquina" del mockup `a3c`. Cosmético; alinear vocabulario solo si el CEO prefiere el naming genérico del contrato.
- **Chips condicionales / no mostrados (parte de D1).** Ritmo, cadencia (RPM) y pisos NO se muestran: no hay fuente de dato hoy (salen de la máquina de cardio, la app no la lee) — coherente con el bullet del mockup "nada de números inventados". La grilla recupera densidad con lo derivable (objetivo/distancia/trabajo/recupera + BPM en su fila). Si el CEO quiere esos chips, requieren captura manual o telemetría nueva (fuera de alcance QA1).
- **Tinta on-brand del botón Pausar (web).** El botón reusa `.exec-v3-juicy` (texto blanco), consistente con los demás botones juicy del ejecutor V3 web, en vez del `#072100` literal del mockup (que es tinta derivada del verde placeholder). White-label-safe; RN usa `exec.accentText`. No se introdujo `#072100` hardcodeado.

## Reglas de oro respetadas
- Motor de resiliencia INTOCADO (no se tocó LogSetForm/SetRow/ExerciseStep/Superset/WorkoutExecutionClient).
- Zonas z1–z5 nunca re-teñidas: el ámbar del chip/segmentos/fase usa `--zone-z4`; verde `--zone-z2`; corazón BPM `#f87171` (=z5, token FIJO).
- Sin colores derivados del verde `#58cc02`/`#072100` hardcodeados; la marca viaja por `--exec-brand` (web) / `exec.accent` (RN).
- Ediciones en `globals.css` quirúrgicas con anclas únicas (archivo compartido en paralelo).

## Archivos tocados
- `apps/web/src/app/c/[coach_slug]/workout/[planId]/v3/CardioStepV3.tsx`
- `apps/web/src/app/globals.css` (bloques `[data-exec-v3]` de cardio)
- `apps/mobile/components/alumno/workout/v3/CardioScreenV3.tsx`
