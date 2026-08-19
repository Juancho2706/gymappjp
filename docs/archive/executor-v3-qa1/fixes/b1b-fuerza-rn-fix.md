# Fix · Unidad B1b — Fuerza RN (espejo)

Rama `fix/executor-v3-qa1`. Informes fuente: `03-fuerza.md` (deltas RN), `13-bug-chips-media.md` (deltas RN).
Mockup contrato: `docs/research/executor-redesign/mockups/concepto-a-v3-core.html` pantalla FUERZA (`.a3a`).

## Archivos tocados
- `apps/mobile/components/alumno/workout/v3/ExerciseScreenV3.tsx` (dueño exclusivo) — reestructura a captura hero + pie + chips/media.
- `apps/mobile/components/alumno/workout/v3/EffortTicksV3.tsx` (NUEVO) — panel de esfuerzo compacto (pills RPE/RIR + escala de ticks).
- `apps/mobile/components/alumno/workout/SetRow.tsx` (compartido, SOLO aditivo) — nueva rama de RENDER `heroMode` en `ActiveSetRow` + tile `ValueTile`; keypad Modal extraído a `keypadModal` (mismo nodo, byte-idéntico).

## Motor INTOCADO
`heroMode` es una rama de render ADITIVA (default `false` ⇒ `ActiveSetRow` byte-idéntico a V2). Reusa el MISMO
estado/handlers: `values`, `patch`→`onDraftChange`, `autofill` (nonce), `buildStrengthPayload`, `handleConfirm`
(guarda de doble-tap), `openField`/keypad Modal. No se tocó payload, keys de log, Zod ni el flujo submit/draft.
El sheet del lápiz monta las filas clásicas `SetRow` (logueadas) — motor de edición existente envuelto.

## Deltas cerrados

### Informe 03 (Fuerza)
- **[BLOCKER] Captura hero** — `ActiveSetRow heroMode`: dos tiles 30/900 (`ValueTile`, tap=`openField`/teclado, mantener=`onLongPressValue`/rueda, borde de marca al editar) + panel esfuerzo + CTA. Una serie a la vez (`activeHero` = `firstUnlogged`); las demás series = cuadraditos del pie.
- **[MAYOR] Tiles de valor** — 30px/900, unidad KG/REPS 11/800, bg `surfaceRaised`, border 2px. Tile REPS con placeholder tenue de la prescripción (`repsHint`, NO sembrado ⇒ no altera el payload).
- **[MAYOR] Panel esfuerzo compacto** — `EffortTicksV3`: header "Esfuerzo" + tag "Opcional" + pills RPE/RIR (activa teñida de marca) + UNA escala de ticks (sel +alto + glow + pulso Moti); extremos 1/10 (RPE) y 0/10 (RIR). RIR con 0 (decisión CEO 8). Sigue opcional y gateado por la tuerca (`showEffort`).
- **[MAYOR] CTA "Aplastar serie"** — `JuicyButton` full-width 60px/18px, breathing, círculo-check (Check en `accentText` sobre círculo `rgba(0,0,0,.22)`), texto `accentText` (white-label safe). Dispara `handleConfirm`.
- **[MAYOR] Shimmer de media** — barrido diagonal con MotiView + `expo-linear-gradient` (banda blanca translúcida, 3.2s lineal, apagado con reduced-motion). Aprox 90deg del 105deg del contrato (viable con Moti).
- **[MAYOR] Pie completo (faltaba entero en RN)** — cuadraditos 24px (done = bg marca, border marca 55%) + "N de M series" + tools 38×38: teclado (nonce → abre keypad en tile activo) y lápiz (sheet oscuro V3 con filas clásicas del motor para editar series guardadas).
- **[MENOR] Media 176→150**, **fondo plano→gradiente 160deg #202029→#17171f** (`expo-linear-gradient`).
- **[MENOR] Peso de prescripción** en blanco/bold (`<b>`), resto gris.
- **[MENOR] Chip tipo·músculo** sin ícono Dumbbell.
- **[MENOR] Fila "Anterior"** sin ícono History (exacta al mockup; PR-en-vivo se conserva porque sólo aparece tras récord).

### Informe 13 (chips)
- **One-shot por ejercicio**: dependencia del efecto `firstUnlogged`→`block.id` (no re-expande por serie).
- **Timeout 1200→1500 ms**.
- **Íconos** `ListChecks`→`AlignLeft`, `MessageSquareText`→`MessageSquare`, color `#eaeaf0`→`#cfcfd8`.
- **Colapso del padding 11→8** animado (MotiView `paddingHorizontal`).
- **Badge doble anillo**: halo de marca 45% + anillo `#16161d` + dot, con pulso Moti 1.8s (reduced-motion ⇒ estático).

## Diferidos (con razón)
- **Glass blur real de los chips** (`backdrop-filter: blur`): RN no lo tiene; requeriría `expo-blur BlurView` (no cableado). El informe 13 lo marca como limitación de plataforma aceptable; se mantiene el fondo sólido `rgba(8,8,12,.6)`.
- **Silueta animada del estado vacío de media** (mockup `.a3a-fig` press): opcional en el informe; se conserva el placeholder Dumbbell. Con gif/video reales no aplica.

## Nota de flujo (sin cambiar motor)
El "Listo" del teclado sigue disparando `handleConfirm` (flujo V2 intocable); el CTA "Aplastar serie" es una
segunda afordancia de submit del mockup. Ambos comparten la guarda `committing` ⇒ sin doble encolado.

## Validación
`npx tsc --noEmit` (apps/mobile) = **0 errores**. No se corrió suite ni build (gates globales posteriores).
No commits.
