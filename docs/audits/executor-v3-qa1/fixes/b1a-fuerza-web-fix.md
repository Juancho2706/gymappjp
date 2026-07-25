# Fix B1a — Fuerza WEB completa (informes 03 + 13 + 14)

Rama `fix/executor-v3-qa1`. Sin commits. tsc web LIMPIO tras los cambios.

## Archivos tocados
- `apps/web/src/app/c/[coach_slug]/workout/[planId]/LogSetForm.tsx`
- `apps/web/src/app/c/[coach_slug]/workout/[planId]/v3/ExerciseStepV3.tsx`
- `apps/web/src/app/globals.css` (ediciones quirúrgicas en el bloque `[data-exec-v3]`)

## Regla de motor: cumplida
No se tocó payload/keys de log/Zod/flujo submit/draft/cola/reconciliación. Todo lo nuevo es:
prop aditiva `heroV3` (default false ⇒ V2 byte-idéntico), una **rama de RENDER** nueva que **reusa**
los mismos `weightRef`/`repsRef`/`rpe`/`rir`/`handleSubmit`/gesto, y CSS scoped. No hay key de log nueva.

### Decisión clave (anti-regresión de resiliencia)
La rama hero se renderiza para **toda serie no colapsada** (activa Y futuras; las futuras las oculta el
CSS del slot), NO sólo la activa. Motivo: si activa y futura usaran ramas distintas, al avanzar
`firstUnlogged` el `<input>` cambiaría de identidad de elemento y el `useEffect` del listener nativo de
BORRADOR (deps `[isLogged, editing, existingLog, queuedInit]`, que NO cambian en esa transición) quedaría
ligado al input viejo → se perdería lo tipeado de la serie activa. Compartiendo branch, el elemento es
estable y el listener sigue vivo. Los instances quedan SIEMPRE montados (reconciliación de cola/optimismo
intacta); sólo cambia su visibilidad por CSS (`is-active`/`is-prev`/`is-future`).

## Deltas cerrados

### BLOCKER — captura HERO de fuerza (informe 03)
Reemplazada la lista de filas por el hero del mockup a3a, en la fila activa:
- **Tiles de valor** (`.exec-v3-cur`/`.exec-v3-val`/`.exec-v3-valinput`): los MISMOS inputs kg/reps
  restilizados a 30px/900 (`letter-spacing:-.03em`, tabular) con unidad KG/REPS debajo; tile bg `#1c1c24`
  border 2px `#2f2f3a` radius 16, borde de marca en `:focus-within`. Sin spinners. El gesto tap/long-press
  y el keypad quedan sobre estos inputs (mismos handlers).
- **Panel de esfuerzo** (`.exec-v3-effpanel`) compacto y secundario: label "Esfuerzo" + tag "Opcional" +
  pills RPE/RIR (activa = teñida de marca, valor blanco tabular) + **escala de ticks única** (11/10 ticks,
  seleccionado sube a 11px + glow + `pulsebrand`), extremos 1/0…10. Tap tick = set; tap pill = alterna
  escala. Sigue OPCIONAL (reusa `setRpe`/`setRir`). Mantiene la clase `exec-v3-effort` para el gear-hide E3.7.
- **CTA único juicy full-width** (`.exec-v3-cta`) "Aplastar serie", 60px, círculo-check en tinta on-brand
  (`--exec-brand-ink`), `breathe 2.6s` (`:not(:active)`), variante `hero` de `SubmitSetButton`. Submit =
  mismo `handleSubmit` de siempre. Copy "Guardar" al editar/re-loggear.
- **Pie** (`.exec-v3-foot`): cuadraditos 24px (izq, `doneCount`) + herramientas (der): botón teclado (enfoca
  el valor de la serie activa → abre keypad vía el foco ya arreglado) y botón lápiz (revela las series
  anteriores para corregir, `data-showprev`; también se abre solo al recibir `reopenSignal`/Deshacer).

### FIX GESTO "no sale" (informe 14 · causa A · BLOCKER)
- `onFocus` restaurado como camino confiable (abre keypad SIEMPRE, incluso en modo rueda; se quitó el guard
  `useWheel ? undefined`).
- `pointerdown` YA NO hace `e.preventDefault()`; añade `setPointerCapture`.
- Long-press (400ms) abre rueda y cierra el keypad que el foco pudo abrir (`keypad.closeKeypad()` + `blur`).
- Umbral de cancelación por movimiento 10 → **16px**.
- `touch-action: none` en los inputs de valor SOLO en modo rueda (clase `.exec-v3-touchnone`).
- `onPointerUp` ya no reabre el keypad a mano (lo hace el foco) → sin doble apertura.

### CHIPS MEDIA (informe 13)
- Keyframe `forwards` reemplazado por **estado React** (`chipsCollapsed`, init false = pinta extendido
  primero) + **transición CSS sobre `data-collapsed`** (max-width, opacity, margin-left) — mata el "salen
  contraídos" y el jank. `will-change: max-width`.
- **One-shot por EJERCICIO**: quitado el `key={firstUnlogged}` del contenedor; el timeout (1500ms) vive en
  estado con dep `[block.id]` → NO re-expande por serie.
- Colapso anima también el **padding 11→8** del pill (`mchippad`).
- Badge con **halo de marca** `0 0 0 4px marca-45%` + **pulso** `exec-v3-badge-pulse 1.8s`.
- Íconos teñidos `#cfcfd8`; `letter-spacing:.01em`; `max-width` base 110; **blur 4px→2px** (perf sobre video).
- Reduced-motion: labels quedan extendidos (JS via matchMedia + CSS override).

### SHIMMER media (informe 03 MAYOR)
`.exec-v3-media::after` diagonal 105deg + `background-size:220% 100%` + `exec-v3-media-shimmer 3.2s` lineal
(bajo `prefers-reduced-motion: no-preference`). `pointer-events:none`, clip por `overflow:hidden`.

### RUEDA — props aditivas
`DualWheelPicker` recibe `setNumber`/`exerciseName`/`totalSets` desde ambos montajes (hero + fila V2).

### Fila "Anterior"
Quitados el ícono `History` y el chip "Supera tu marca"; queda label "Anterior" / valor / hint "1 tap ↻"
en marca. El 1-tap prefill (`fillByBlock`) intacto.

### Menores
- Cuadraditos de serie 22→**24px**.
- Chip de sobrecarga extra **removido** (no está en el mockup); prescripción queda "4 × 8 · 60 kg · RIR · desc".
- CTA en tinta on-brand vía `.exec-v3-juicy`.

### Task 8 — tinta juicy unificada
`.exec-v3-juicy` ya usa `color: var(--exec-brand-ink)` (Wave A). El CTA hero hereda de ahí. Los juicy de
otras pantallas (Pausar cardio / Saltar descanso / Empezar) heredan la misma base → nada que cambiar en mi
unidad. La variante `SubmitSetButton` etiquetada (texto blanco) sólo se usa en el camino V2/no-hero → se
deja byte-idéntica.

## Notas / estado sin media
Estado "sin media" (silueta/Dumbbell estático) se deja como está (anotado en informe 03 como opcional).

## Pendientes con razón
- **Espejo RN**: PROHIBIDO en esta unidad (`archivos RN`). El espejo de estos fixes (gesto nativo ya sano,
  hero RN, shimmer RN, foot RN, blur/chip) corresponde a la unidad RN de fuerza. RN ya no sufre el bug de
  gesto (Pressable nativo) ni el de chips (patrón `chipsExpanded` correcto), por informes 13/14.
- Informe 14 causas B/C (backdrop-filter del Dialog y tormenta de re-render al girar): la rueda web ya fue
  migrada a bottom-sheet sin backdrop-filter + índice en ref (Wave A, ver cabecera de `DualWheelPicker`).
  Fuera de mi superficie (dueño exclusivo: ExerciseStepV3 + LogSetForm). No re-tocado.

## Verificación
`npx tsc --noEmit` en `apps/web` del worktree: sin errores.
