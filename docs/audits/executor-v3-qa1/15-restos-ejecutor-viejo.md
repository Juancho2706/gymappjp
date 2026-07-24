# QA1 · Ejecutor V3 "Impulso" — SWEEP #15: Restos del ejecutor viejo (V2) visibles en modo V3

**Auditor:** fidelidad visual (sweep restos V2)
**Alcance:** árbol de render completo del modo V3 web (`WorkoutExecutionClient` rama V3 + componentes `v3/`) y su espejo RN (`ExecutorV3` + hijos). Solo lectura; ningún archivo tocado.

## Veredicto (2 líneas)
El chrome V3 (header, pasos, descanso, inicio, final) está bien montado y el legacy header queda `hidden`, PERO sobreviven **restos V2 reales y visibles** dentro de V3: el **modal de Técnica** y el sheet **"Nota del coach"** se abren como diálogos **shadcn en tema claro (BLANCO) porque la app corre `defaultTheme="light"`** encima del shell oscuro — el mockup pide un **sheet oscuro in-context (#1d1d26)**. Además hay superficies **porteadas a `body` que escapan el remap `--sport-500 → --exec-brand`** (keypad, sheet de sustitución) por lo que su acento queda **azul Sport en vez de la marca del coach**, toasts `sonner` claros, y una **barra "Finalizar" persistente V2 que no existe en el mockup**. En RN el patrón se repite 1:1 (TechniqueSheet claro, keypad `bg-sport-500` fijo, OfflineBanner ámbar).

**Severidad máxima: BLOCKER** (modal de técnica/nota BLANCO sobre el shell oscuro).

---

## Hallazgos (ordenados por severidad)

### [BLOCKER] Modal de Técnica = diálogo shadcn en tema CLARO (blanco) sobre el shell oscuro
- **Mockup:** `docs/research/executor-redesign/mockups/concepto-a-v3-core.html:854` — "el chip sobre la media abre un **sheet** con la técnica paso a paso, sin salir del ejercicio". El sheet del mockup es oscuro: `.a3a-sheet { background:#1d1d26; border-top:2px solid #33333f; border-radius:22px 22px 0 0 }` (líneas 461-467).
- **Web:** `apps/web/src/app/c/[coach_slug]/workout/[planId]/WorkoutExecutionClient.tsx:2468-2579` — el `<Dialog>`/`DialogContent` usa tokens claros `bg-card border-border` (2471), `text-foreground` (2545), `text-muted-foreground` (2547, 2569), `bg-muted` (2496), `bg-white` (2514, 2528). Es un Radix Dialog **porteado a `document.body`** (fuera de `[data-exec-v3]`) y con tokens semánticos que **siguen el tema de la app**.
- **Causa raíz:** `apps/web/src/app/layout.tsx:133-136` → `ThemeProvider defaultTheme="light" enableSystem={false}`. Sin clase `.dark` en `<html>`, `--card`/`--foreground`/`--popover` resuelven a sus valores **claros** ⇒ el modal es **blanco con texto oscuro** sobre el ejecutor `bg-[var(--ink-950)]`.
- **Reachable en V3 (stepper default):** `v3/ExerciseStepV3.tsx:137` y `:174` (chips "Instrucciones"/"Ver video") y `v3/SupersetStepV3.tsx:210` llaman `openTechnique(...)` que abre ESTE modal.
- **RN (espejo, mismo bug):** `apps/mobile/components/alumno/workout/TechniqueSheet.tsx` — es un port DELIBERADO del modal web V2 (comentarios citan `WorkoutExecutionClient.tsx:2001-2113`): superficie con tokens que siguen el tema (`text-body`=ink-800, `bg-surface-sunken`, `bg-secondary` en 176-177, 237), número de paso `bg-sport-500/15` (206), y **letterboxes de video/imagen forzados a BLANCO**: `bg-white` (59, 117) y `letterbox="#ffffff"` (119). El tema RN sigue el OS (`ThemeContext.tsx:55`, default `system`) ⇒ en un dispositivo en modo claro (default habitual) la técnica es un **sheet claro** sobre el ejecutor oscuro. Se abre desde `ExecutorV3.tsx:1245`.
- **Fix propuesto:** crear un **sheet V3 oscuro** dedicado (mismo patrón que `RestInterstitialV3`/`ExecSettingsSheet`: `bg-[var(--ink-900)]`/`#1d1d26`, `border-[var(--border-inverse)]`, `text-on-dark`, radio `rounded-t-sheet`, acento `var(--exec-brand)`) y enrutar `openTechnique`/`TechniqueSheet` a él en modo V3. NO reusar el `Dialog` con tokens `bg-card`/`bg-white`. Los letterboxes de media a `#0b0b10`/`--ink-900`, no blanco.

### [BLOCKER] "Nota del coach" = `<Dialog>` shadcn en tema CLARO (blanco)
- **Mockup:** `concepto-a-v3-core.html:855` — "Nota del coach… se abre en el **mismo sheet**" (oscuro, in-context, con el puntito de marca).
- **Web:** `v3/ExerciseStepV3.tsx:291-305` — `DialogContent` con `border-border bg-card` (292), `text-foreground/90` (296), `bg-secondary text-secondary-foreground` (300). Radix Dialog porteado + tokens claros ⇒ **sheet blanco** con `defaultTheme="light"`. Se dispara desde el chip "Nota del coach" (`:148`).
- **RN:** verificar el equivalente en `ExerciseScreenV3` (la nota debe abrir un sheet oscuro V3, no `bg-surface-*` claro).
- **Fix propuesto:** mismo sheet oscuro V3 del hallazgo anterior (o un `bg-[var(--ink-900)] text-on-dark border-[var(--border-inverse)]` scoped), botón "Entendido" con `exec-v3-juicy` o superficie `bg-white/[0.06]` oscura. Eliminar `bg-card`/`bg-secondary`/`text-foreground`.

### [MAYOR] Toasts `sonner` en tema CLARO (blanco) sobre el shell oscuro
- **Web:** `apps/web/src/app/layout.tsx:145` monta `<Toaster>`; `apps/web/src/components/ui/sonner.tsx:8` toma `theme` de `next-themes` (=`light` por `defaultTheme="light"`) y pinta `--normal-bg: var(--popover)` (claro), `--normal-text: var(--popover-foreground)`. Con `richColors` los info/error salen con fondo claro/coloreado.
- **Reachable en V3:** `WorkoutTimerProvider.tsx:101` "Temporizador anterior reemplazado", `:122` "Este bloque se prescribe por distancia — usa el cronómetro", más los toasts de `LogSetForm` (errores/sync). Todos aparecen `bottom-center` como **toast claro** sobre el ejecutor oscuro.
- **RN (espejo):** `apps/mobile/components/Toast.tsx:253` `bg-surface-card` (≈ web `--popover`) sigue el tema del OS ⇒ toast claro en dispositivo en modo claro.
- **Fix propuesto:** para el ejecutor V3, forzar toasts oscuros (variante scoped: `--normal-bg: var(--ink-900)`, `--normal-text: on-dark`, `--normal-border: var(--border-inverse)`), o montar un toaster local dentro de `[data-exec-v3]` con tokens oscuros. En RN, forzar `surface-card` oscuro cuando el ejecutor V3 está activo.

### [MAYOR] Acento del teclado numérico "brand-blind": azul Sport en vez de `--exec-brand`
- **Contexto:** el teclado es la superficie de captura PRIMARIA en V3 (tap abre el keypad; la rueda es long-press). `NumericKeypadSheet` se **portea a `body`** (`WorkoutKeypadProvider.tsx:11` `createPortal`, `NumericKeypadSheet.tsx:187` `fixed`), por lo que queda FUERA de `[data-exec-v3]` y **no recibe el remap** `[data-exec-v3]{ --sport-500: var(--exec-brand) }` (`globals.css:1458-1461`).
- **Web:** `NumericKeypadSheet.tsx:280` y `:413` (botón confirmar/Guardar), `:303` (tab de campo seleccionado), `:349` (RIR activo), `:371` (step chip seleccionado) usan `bg-[var(--sport-500)]` literal ⇒ **azul #2680FF fijo**. El panel sí es oscuro (`bg-[var(--ink-950)]`, `text-on-dark` — OK), pero para un coach white-label con marca no-azul el acento del keypad **no coincide** con el resto del ejecutor (que sí adopta `--exec-brand`).
- **RN (espejo):** `KeypadHost.tsx:367` y `:413` botones `bg-sport-500` fijos (panel `bg-ink-950` dark-forced, línea 241 — OK). `ExecutorV3.tsx:1238` monta `<KeypadHost>` **sin** pasarle `exec`/`accent`.
- **Fix propuesto:** pasar el acento resuelto al keypad (prop `accent`/`accentText`) y usar `style={{ backgroundColor: exec.accent }}` en confirmar/seleccionado; en web, o bien setear `--exec-brand` en el nodo porteado, o cambiar `bg-[var(--sport-500)]` por `bg-[color:var(--exec-brand)]` con el var propagado. Idealmente botón confirmar con estilo `exec-v3-juicy`.

### [MAYOR] Barra "Finalizar entrenamiento" persistente = footer V2 que NO está en el mockup
- **Mockup:** la pantalla Fuerza (`concepto-a-v3-core.html`) NO tiene barra inferior persistente de dos botones. El CTA es el submit **juicy** "Aplastar serie" (`:837`, `.a3a-juicy`: `border:2px … 55% #000` + `box-shadow:0 5px 0 0 …` líneas 82-88) y el pie es solo los cuadritos de serie (`.a3a-foot` :839). Finalizar ocurre por el flujo (última serie → pantalla Final).
- **Web:** `WorkoutExecutionClient.tsx:2385-2396` — barra `exec-finish-bar fixed bottom-0` con `ManualTimerButton` (Descanso 90s) + botón "Finalizar entrenamiento" `h-12 px-5 rounded-control bg-[var(--sport-500)]` (2390). Se renderiza SIEMPRE (sin gate `execV3Active`). El color remapea a `--exec-brand` (dentro del root) pero el botón es **plano V2, no juicy** (sin borde 2px + `box-shadow 0 5px 0`). Se oculta al abrir el keypad (`globals.css:1091`), mitigando solape, pero es visible en toda la sesión.
- **RN (espejo):** `ExecutorV3.tsx:1202-1232` — misma barra absoluta con "Descanso (90)" ember + "Finalizar entrenamiento" `bg={exec.accent}` (1223), plano, no juicy. Usa `exec.surface.appBg`/`borderSubtle` (superficie V3 — mejor que web, pero mismo problema de existir/estilo).
- **Fix propuesto:** decidir con el CEO — (a) ocultar la barra persistente en V3 y ofrecer "Finalizar" desde el header/flujo + un CTA juicy en el último paso, o (b) re-skin del botón a `exec-v3-juicy` (borde 2px `color-mix(--exec-brand 55%, #000)` + `box-shadow 0 5px 0`). En cualquier caso, alinear con el mockup (sin footer de dos botones durante la serie).

### [MENOR] Sheet de sustitución de máquina: acento azul Sport (brand-blind), solo en modo Lista
- **Web:** `_components/SubstituteExerciseSheet.tsx:73` — superficie **oscura correcta** (`bg-[var(--ink-950)] text-on-dark`, porteada a `body` con tokens dark explícitos — bien). PERO los acentos usan `--sport-*` (comentario :31) y al estar fuera de `[data-exec-v3]` no remapean ⇒ botones/acento **azul Sport** en vez de `--exec-brand`. Solo alcanzable en la vista "Ver todo" (Lista): `WorkoutExecutionClient.tsx:1945` (`onOpenSubstitute`) solo se cablea en `SingleExerciseCard`, no en los pasos V3.
- **RN:** `ExecutorV3.tsx:1262` `<SubstituteExerciseSheet>` sin `exec`; revisar acento.
- **Fix propuesto:** pasar/propagar `--exec-brand` al sheet (o prop `accent`) para que el acento coincida con la marca del ejecutor.

### [MENOR] Cronómetro (Stopwatch) legacy sin identidad V3
- **Web:** `Stopwatch.tsx:66` — chip oscuro (`bg-[var(--ink-900)]/95`, `text-on-dark` — dark-safe, OK) PERO **neutro**, sin acento `--exec-brand` ni tratamiento juicy/anillo del lenguaje V3. Se monta fuera de `[data-exec-v3]` (sibling en `WorkoutTimerProvider`). Reachable en V3 vía chip cronómetro: `CardioStepV3.tsx:226` y `RollerStepV3.tsx:134` (`startStopwatch()`). Igual `HoldTimer`/`IntervalTimer` NO reciben variante v3 (`WorkoutTimerProvider.tsx:150-156`) — hoy no se disparan en V3 (cardio usa `useIntervalRunner` propio; nadie llama `startHold`), pero quedan como legacy latente si algún paso los invoca.
- **Fix propuesto:** dar al Stopwatch (y a Hold/Interval si se conectan) una variante V3 con acento `--exec-brand`/`--exec-recovery` y estilo consistente, o reemplazarlo por un cronómetro V3 dedicado.

### [MENOR] Banner "sin conexión" = banner ámbar V2 (no el estado "sin señal" del mockup)
- **Web:** `WorkoutExecutionClient.tsx:2286-2291` — `bg-amber-500/90 text-amber-950` (barra ámbar V2). El mockup de estados (`concepto-a-v32-estados.html`/`-momentos.html`) trae un tratamiento "sin señal" propio. **Cross-ref:** este delta pertenece principalmente al sweep de estados; se anota aquí solo por ser un elemento visual V2 reusado en V3.
- **RN:** `OfflineBanner.tsx:37,47` — ramp warning ámbar; el comentario (:22) confirma que espeja el `bg-amber-500/90` web.
- **Fix propuesto:** coordinar con el sweep de estados; tematizar el banner al lenguaje V3 (o implementar el estado "sin señal" del mockup).

### [INFO] Dialog legacy de "Descanso y alarma" (showTimerSettings) — dead code en V3, no visible
- `WorkoutExecutionClient.tsx:2399-2416` usa `bg-card border-border` (claro) pero SOLO se abre desde el botón Settings del **header legacy**, que está `hidden` en V3 (`:2182`). En V3 la tuerca abre `ExecSettingsSheet` (`:2421`). No es un resto **visible**, pero es código V2 muerto colgando bajo V3. Sin acción urgente; limpiar al deprecar el legacy.

---

## Cumple (fiel a V3 — no re-tocar)

- **Legacy header oculto, no borrado:** `WorkoutExecutionClient.tsx:2176-2284` con `cn(..., execV3Active && 'hidden')` (:2182). Correcto: el chrome V3 (`ExecHeaderV3`, :2133) lo reemplaza.
- **`LogSetForm` recompuesto para V3 (reuse intencional):** `LogSetForm.tsx` — prop `v3` (146), `DualWheelPicker` (24), `PrCelebration` (25), `exec-v3-effort` (875), tokens **oscuros** (`bg-white/[0.06]`, `text-on-dark`, `--border-inverse`) y `--sport-500` que **sí** remapea a `--exec-brand` por estar DENTRO de `[data-exec-v3]`; submit juicy vía `globals.css:1805-1814`. Sin tokens claros.
- **Remap de marca en el subtree:** `globals.css:1458-1461` `[data-exec-v3]{ --sport-500: var(--exec-brand); --sport-400/-300: color-mix(...) }` recolorea TODO uso de `sport-*` dentro del root al acento del ejecutor.
- **RestTimer V3:** `RestTimer.tsx:329-343` delega en `RestInterstitialV3` (interstitial full-screen) y la barra minimizada (346-478) usa `--ember-*`/`--ink-900`/`on-dark` — identidad de descanso V3, no look V2.
- **Resumen final:** `SessionCompleteV3` gateado a `execV3Active` (`:2432`) y el `WorkoutSummaryOverlay` V2 gateado a `!execV3Active` (`:2449`) — no se cruzan.
- **`NumericKeypadSheet` panel oscuro:** superficie `bg-[var(--ink-950)]`/`text-on-dark` correcta (solo el ACENTO es brand-blind — ver hallazgo MAYOR).
- **`SubstituteExerciseSheet` superficie oscura:** tokens dark explícitos (`--ink-950`, `text-on-dark`) — solo el acento es brand-blind (MENOR).
- **RN `ExecutorV3` es reescritura, no rama sucia:** monta `ExecHeaderV3`, pantallas tipadas propias y `exec.surface`/`exec.accent` (theme resuelto, `ExecutorV3.tsx:149`). El `SingleExerciseCard` RN reusado en Lista usa tokens dark (`bg-white/[0.03]`, `text-on-dark`, `SingleExerciseCard.tsx:261`) — dark-safe (sus dots `bg-sport-400` son brand-blind, MENOR, solo en Lista).

---

## Resumen ejecutable de fixes (orden sugerido)
1. **Sheet oscuro V3 para Técnica y Nota del coach** (BLOCKER ×2) — reemplaza los `Dialog` `bg-card`/`bg-white` por un sheet `#1d1d26`/`--ink-900` con acento `--exec-brand`. Web + RN (`TechniqueSheet`, letterboxes a oscuro).
2. **Toasts oscuros en V3** (MAYOR) — variante scoped o toaster local con `--popover→--ink-900`.
3. **Propagar `--exec-brand` a superficies porteadas** (MAYOR/MENOR) — keypad (confirmar/seleccionado), sheet de sustitución: acento = marca, no azul Sport fijo.
4. **Barra "Finalizar"** (MAYOR) — decisión CEO: ocultar en V3 vs re-skin juicy; alinear con mockup.
5. **Stopwatch + banner offline** (MENOR) — variante V3 / coordinar con sweep de estados.
