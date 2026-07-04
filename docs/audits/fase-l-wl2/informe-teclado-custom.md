# Informe técnico — Teclado numérico custom para la exec del alumno (peso/reps)

> Rama: `feat/redesign-eva-design-system` · App: `apps/web` (Next.js App Router + Supabase + Tailwind v4)
> Fecha: 2026-07-04 · Autor: investigador técnico (subagente)
> Alcance: solo investigación + diseño. Ningún archivo de producto tocado.

## Resumen del problema

Hoy la exec del alumno registra peso/reps con `<input type="number">` nativos. En móvil el teclado del
sistema tapa la mitad inferior de la pantalla y, como el **objetivo prescrito** (peso/reps sugeridos, "última
vez", sobrecarga) vive en la card **por encima** de la fila de series, al abrir el teclado el alumno pierde de
vista el objetivo. Referentes del mercado: Strong y Hevy.

Objetivo: keypad in-app que (1) mantenga el **objetivo siempre visible** mientras se tipea, (2) ofrezca
incrementos rápidos (+2.5/+5 kg), (3) no rompa accesibilidad ni el fallback de teclado físico en desktop, y
(4) **conviva** con el flujo Enter-no-cierra-serie, el autofill "= última vez" y la cola offline ya existentes.

---

## Estado actual (archivos:líneas concretos)

### El formulario de registro — `apps/web/src/app/c/[coach_slug]/workout/[planId]/LogSetForm.tsx`

- **Dispatch por tipo** (`LogSetForm`, líneas 119-126): `strength` → `StrengthLogSetForm`; `cardio|mobility|roller`
  → `TypedLogSetRow`. Cualquier cambio debe respetar esta bifurcación (anti-regresión AC4).
- **Input de peso** (fuerza) — líneas 537-554:
  - `name="weight_kg"`, `type="number"`, `step="0.5"`, `min="0"`, `inputMode="decimal"`.
  - **Uncontrolled**: `defaultValue={existingLog?.weight_kg ?? queuedInit?.weightKg ?? suggestedWeightKg ?? ''}`,
    ligado a `weightRef` (línea 270, 538).
  - `onKeyDown`: **Enter NO submitea** — `preventDefault()` + pasa foco a reps (líneas 547-552).
- **Input de reps** (fuerza) — líneas 559-575:
  - `name="reps_done"`, `type="number"`, `min="0"`, `inputMode="numeric"`, uncontrolled + `repsRef` (271, 560).
  - `onKeyDown`: **Enter hace blur** (cierra teclado) sin submitear (líneas 568-573).
- **Clase de input** — `inputClass`, líneas 496-499: fila activa `h-14 text-2xl`, resto `h-11 text-base`.
  Ya distingue serie activa (protagonista) de próximas — el keypad debe respetar esa jerarquía.
- **Submit** = `<form action={handleSubmit}>` (línea 515). `handleSubmit(formData)` (357-422) lee los valores
  **de la FormData** (líneas 368-370), normaliza coma decimal → punto (364-366), encola SIEMPRE (write-through
  offline, `enqueueWorkoutLog`, 376-387) y despacha `formAction(formData)` (421). **Punto clave: el keypad NO
  debe cambiar este pipeline** — basta con que escriba en los inputs nombrados (`weight_kg`/`reps_done`) para
  que la FormData los recoja intacta.
- **Autofill "= última vez"** (prefill) — líneas 296-301: escribe **directo** en los inputs uncontrolled vía
  refs (`weightRef.current.value = String(...)`). Disparado desde `WorkoutExecutionClient` (fillByBlock, ver
  abajo). El keypad reutilizará este mismo mecanismo de "mutar `ref.value`".
- **Botón "Listo/Guardar"** — `SubmitSetButton` (973-999): único disparador del submit real (type="submit").
- **RPE / RIR**: `ScaleDots` (162-211) — botones segmentados 1-10, **no** usan teclado. Fuera del scope del keypad.
- **Nota rápida**: input `type="text"` (626-634) — teclado de texto nativo. Fuera del scope del keypad.
- **Variante tipada** `TypedLogSetRow` (670-971): inputs `type="number"` con `inputMode="numeric|decimal"`
  (cardio min/metros/FC 842-876; movilidad seg 879-890; roller seg/pasadas 892-915). Enter gobernado por
  `handleFormKeyDown` (807-816): avanza al siguiente `input[type=number]`, blur en el último.

### Dónde vive el objetivo prescrito — `WorkoutExecutionClient.tsx` (1878 líneas)

- **Línea de prescripción de fuerza** — 1524-1537: `{block.sets} × {block.reps}` · `{suggestedWeightKg ??
  block.target_weight_kg} kg` · `desc {rest_time}` · `tempo` · `RIR`, + chip de sobrecarga (`overloadLabel`).
- **"Última vez" (autollena)** — 1539-1567: `bestPrev.weight_kg × reps_done`, botón que setea `fillByBlock`
  (estado en 945) → prop `prefill` de la serie activa (1663). El keypad debe reflejar este autollenado.
- **Grid de objetivo tipado** (cardio/movilidad/roller) — `TypedTargetGrid` (203-277), render 1573-1580.
- **Todo esto está ARRIBA de los `LogSetForm`** (fuerza: 1643-1670; tipado: 1671-1697). Al abrir el teclado
  nativo, esta zona sale del viewport → **causa raíz** del problema.
- `suggestedWeightKg` = `eff?.weightKg ?? block.target_weight_kg` (1392) — el número que debería viajar con el keypad.

### Layout / apilamiento inferior (con qué debe convivir el keypad)

- **Barra fija "Finalizar"** — `WorkoutExecutionClient.tsx` 1712: `fixed bottom-0 z-40`, con `pb-[calc(1rem+
  env(safe-area-inset-bottom,0px))]`.
- **RestTimer** — `RestTimer.tsx` 308-309: `fixed z-50`, `bottom-[calc(env(safe-area-inset-bottom,0px)+5.5rem)]`
  (por encima del footer). Se monta desde `WorkoutTimerProvider` (130) y arranca **al submitear la serie**
  (`buildRest()` en LogSetForm 337-355), no durante la captura → normalmente el keypad y el RestTimer no
  coinciden en el tiempo, pero hay que definir z-order igual.
- **Contenedor de scroll**: `pb-32` en 1293. Helper de auto-scroll ya existe:
  `smoothScrollIntoViewIfNeeded()` (WorkoutExecutionClient 493-502) con constantes `HEADER_H=96`, `FOOTER_H=88`.

### Infra y tokens disponibles

- **NO existe** ningún uso de `visualViewport`, `VirtualKeyboard`, `keypad`, `numpad` en `**/src/**`
  (verificado por Grep — sería un componente nuevo desde cero).
- **Háptica**: `triggerHaptic(pattern)` en `apps/web/src/lib/client/haptics.ts` (Vibration API Android + truco
  switch iOS 18+). Reusar en cada tap del keypad.
- **Primitivas de sheet**: `components/ui/sheet.tsx` (shadcn, soporta `side="bottom"`) y `dialog.tsx`.
  Presets de animación: `lib/animation-presets.ts` → `springs`, `springsSheet`, `springsRow`. El RestTimer usa
  `springsSheet`; el keypad debería usar el mismo para consistencia.
- **Tokens** (`apps/web/src/app/globals.css`): `--breakpoint-md: 760px` (26), `--sport-500: #2680FF` (350),
  `--sport-400` (351), `--radius-control: 14px` (131) → `rounded-control`, `--radius-card: 20px` (130),
  `--ink-950: #0B0E13` (333). Utilidades safe-area: `.pb-safe` (998), `.bottom-safe` (1016), etc.
- **Schema** (sin cambios necesarios): `WorkoutLogSetSchema` en `packages/schemas/workout.ts` 218-238 —
  `weight_kg: z.coerce.number().min(0).optional()`, `reps_done: z.coerce.number().int().min(0).optional()`.
  Acepta strings crudos (coerce) → el keypad solo produce texto en los inputs, cero cambios de validación.
- **DB**: sin cambios (feature 100% presentación). No hay columnas nuevas → no aplica el gotcha de
  `GRANT UPDATE(col)`.

---

## Investigación web 2026 (fuentes)

### Referentes (Strong / Hevy)

Ambas apps priorizan **minimizar taps** en el core loop de logging: tap para confirmar la serie, autollenado de
peso/reps de la sesión anterior, "sets previos" en gris arriba del input, y timers de descanso por ejercicio.
Hevy destaca RIR/RPE por serie y volumen (kg×reps×sets); varias reviews mencionan el **plate calculator** (qué
discos cargar) como reductor de fricción/mental math. Estas apps nativas usan **keypad propio** (no el teclado
del SO) justamente para no tapar el contexto y ofrecer incrementos — pero las reviews públicas no documentan el
markup interno.
Fuentes:
- https://prpath.app/blog/strong-vs-hevy-2026.html
- https://setgraph.app/ai-blog/hevy-vs-strong-app-comparison-2026
- https://apps.apple.com/us/app/strong-workout-tracker-gym-log/id464254577
- https://medium.com/@hwaijunyap/ui-ux-case-study-strong-workout-app-redesign-fc22afbada65

### VirtualKeyboard API + visualViewport (estado real 2026)

- **VirtualKeyboard API**: soportada solo en **Chromium/Chrome (desde v94)**. **Safari/WebKit NO la implementa**
  (6 años después de la spec) y **Firefox tampoco** (Mozilla declaró en 2025 que no es prioridad de interop
  2026; spec sin update desde 2022). Habilita `navigator.virtualKeyboard.overlaysContent = true`, evento
  `geometrychange`, y CSS `env(keyboard-inset-height)`.
- **Fallback real hoy** en Safari/Firefox: adivinar la altura del teclado con heurísticas de
  `visualViewport` (`resize`/`scroll`, `offsetTop`, `window.innerHeight`) — que "rompen de formas sutiles y
  específicas por dispositivo".
- **Bugs documentados incluso en Chromium** (artículo forense de Zouhir): la geometría **sobredispara** por
  encima de la altura real y luego corrige (salto visible); `boundingRect` en espacio de coordenadas
  equivocado (discrepancias de 368+ px); solo `keyboard-inset-height` funciona "por coincidencia".
- Patrón de "barra de acción sobre el teclado" (ishadeed): `position: fixed; bottom: env(keyboard-inset-height,
  0)` — elegante **pero solo en Chrome Android**; en el resto degrada a 0 (barra queda tras el teclado).

**Conclusión de diseño**: el patrón "input nativo + barra flotante sobre el teclado del SO vía visualViewport"
es frágil y desigual por navegador en 2026. La estrategia superior para este caso es **suprimir el teclado del
SO** (`inputMode="none"`) y renderizar un **keypad propio** como elemento fijo nuestro → así **no peleamos con
visualViewport ni con la VirtualKeyboard API en ningún navegador** (no hay teclado nativo = no hay resize del
viewport que compensar). Es el mismo motivo por el que Strong/Hevy usan keypad propio.
Fuentes:
- https://developer.mozilla.org/en-US/docs/Web/API/VirtualKeyboard_API
- https://developer.chrome.com/docs/web-platform/virtual-keyboard
- https://zouhir.org/blog/virtual-keyboard-api/
- https://ishadeed.com/article/virtual-keyboard-api/
- https://developer.mozilla.org/en-US/docs/Web/API/VirtualKeyboard/overlaysContent

### Accesibilidad de keypads custom (2026)

- ARIA por sí solo **no** hace accesible un widget custom: hay que dar foco (`tabindex`), manejo de teclado y
  estados a mano; el navegador no aporta teclado a componentes ARIA (a diferencia de los form controls nativos).
- El WebAIM Million 2026: páginas con ARIA promedian **más** issues (59.1 vs 42) → señal de que ARIA mal puesto
  empeora. Regla: **mantener el `<input>` nativo real** como fuente de verdad (lector de pantalla lo anuncia
  solo; teclado físico en desktop lo edita solo) y que el keypad sea **complementario**, no un reemplazo que
  rompa AT.
- Screen readers / voice / switch dependen de eventos de teclado y de nombres accesibles + eventos click.
Fuentes:
- https://www.a11y-collective.com/blog/aria-button/
- https://www.levelaccess.com/blog/wai-aria-guidance-best-practices-for-accessible-web-interfaces/
- https://webaim.org/techniques/keyboard/
- https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/
- https://www.uxpin.com/studio/blog/keyboard-navigation-patterns-complex-widgets/

---

## Diseño propuesto

### Principio rector

**El `<input>` nativo sigue siendo la fuente de verdad** (uncontrolled, con su `name`, `defaultValue` y ref).
El keypad **muta `ref.value`** (idéntico mecanismo al autofill "= última vez" ya existente) y despacha un evento
`input` sintético. Así el pipeline actual (`handleSubmit` → FormData → normalización coma→punto → `enqueue` →
`formAction`) queda **intacto** y offline/optimismo no se tocan. Cero cambios en `services/`, `infrastructure/`,
`domain/`, schema o DB → la feature es **puramente de capa de presentación** (`app/.../workout/[planId]/`).

### Decisión responsive (recomendada)

- **Gate por `matchMedia('(pointer: coarse)')`** (no solo por ancho): touch/tablet/móvil → keypad custom;
  puntero fino (desktop con mouse+teclado físico) → **input nativo sin tocar** (Tab, tipeo, Enter-no-cierra
  siguen igual). Es más correcto que `<760px` porque el problema real es "hay teclado en pantalla", que
  correlaciona con pointer coarse, no con el ancho. (Ver pregunta CEO #2 si se prefiere solo por breakpoint md=760.)
- La detección corre **post-montaje** (efecto), nunca en el initializer, para no desalinear la hidratación SSR
  (mismo patrón que la lectura de `omni_autotimer` en WorkoutExecutionClient 928-930).

### Arquitectura por capas y componentes

**Capa presentación — co-locada en `apps/web/src/app/c/[coach_slug]/workout/[planId]/`** (misma convención que
los archivos hermanos, que viven planos en `[planId]/`, no en `_components/`):

1. **`WorkoutKeypadProvider.tsx`** (nuevo, `'use client'`) — contexto análogo a `WorkoutTimerProvider`. Monta
   **una sola** instancia del keypad (portal a `document.body`) para toda la sesión (solo hay una serie activa a
   la vez). Expone por contexto:
   - `openKeypad(cfg)` / `closeKeypad()` — `cfg = { fieldRefs: { weight?, reps? }, initialField, target, allowDecimalByField }`.
   - Gestiona: campo activo (`weight | reps`), lectura/escritura del `ref.value`, mirror de display, háptica.
   - Renderiza `<NumericKeypadSheet>` cuando `open && coarsePointer`.
   Motivo de usar provider (no un keypad por fila): evita N keypads en el árbol, centraliza z-index/portal y el
   `--keypad-h`, y calca un patrón ya probado en el repo (`WorkoutTimerProvider`).

2. **`NumericKeypadSheet.tsx`** (nuevo, `'use client'`, presentacional puro) — el panel fijo inferior. Props:
   `open, field, displayValue, target, allowDecimal, onDigit, onDecimal, onBackspace, onClear, onIncrement,
   onSwitchField, onDone, onClose`. Estructura vertical:
   - **Header de objetivo (SIEMPRE visible)** — la pieza que resuelve el requisito central: reimprime
     `Objetivo: {sets}×{reps} · {suggestedWeightKg} kg` + `Última vez: {peso}×{reps}` justo encima de los
     dígitos. Aunque la card se haya scrolleado fuera, el objetivo viaja **con** el keypad.
   - **Display grande** del valor en curso (fuente mono, tabular-nums, `text-3xl`), con el label del campo
     activo (`Kg` / `Reps`) y switch `Kg | Reps`.
   - **Chips de incremento rápido** (solo peso): `-2.5  +2.5  +5` (coherentes con `step="0.5"`). Reps: opcional
     `-1 / +1` (los dígitos ya alcanzan → ver pregunta CEO #3).
   - **Grid 3×4 de dígitos**: `1..9`, `,` (coma decimal; oculta/disabled si `!allowDecimal`, p.ej. reps),
     `0`, `⌫` (backspace). Botones ≥48px (touch), `active:scale`, háptica por tap.
   - **Barra de acción**: `Siguiente` (weight→reps) y `Listo` (dispara `form.requestSubmit()` → reusa
     `SubmitSetButton`/`handleSubmit`). `Listo` es el único submit, igual que hoy.
   - Estilo: `rounded-t-sheet`, `bg-[var(--ink-950)]`, borde `--border-inverse`, `pb-safe`, animación
     `springsSheet` con guarda `useReducedMotion` (igual que RestTimer). Tema oscuro (la exec es dark siempre).

3. **Integración en `StrengthLogSetForm`** (edición mínima de `LogSetForm.tsx`):
   - Añadir `const coarse = useCoarsePointer()` (hook nuevo, ver abajo).
   - En los inputs `weight_kg`/`reps_done`: cuando `coarse`, setear `inputMode="none"` (suprime teclado SO) y
     `onFocus={() => openKeypad({...})}` con `focus({ preventScroll: true })`. Cuando `!coarse`, dejar el input
     **exactamente como hoy** (inputMode decimal/numeric, onKeyDown Enter-no-cierra intacto).
   - El `target` que se pasa a `openKeypad` se arma de props que **ya llegan**: `suggestedWeightKg`, `setNumber`,
     y `sets/reps` (estos dos habría que pasarlos como props nuevas opcionales `targetSets`/`targetReps` desde el
     render de WorkoutExecutionClient 1649-1667, o derivarlos de `nextUpLabel`+bloque — preferible props
     explícitas, aditivas y opcionales).
   - El autofill "= última vez" (prefill effect 296-301) ya muta `ref.value`; añadir que, si el keypad está
     abierto en ese campo, refresque su mirror (el provider re-lee el ref en cada apertura/prefill nonce).

4. **`useCoarsePointer.ts`** (nuevo hook en `lib/client/`) — `matchMedia('(pointer: coarse)')` leído
   post-montaje + listener de cambios. Reutilizable (multi-domain → candidato a `lib/client/`).

**Data flow**: RSC (page) → props → `WorkoutExecutionClient` → `LogSetForm` (sin cambio de datos) → keypad muta
`ref.value` → submit lee FormData → `logSetAction` (server action, **sin tocar**). No hay `_data/` ni `_actions/`
nuevos. Respeta Clean Architecture porque no cruza capas (todo presentación).

### Cómo resuelve cada requisito

| Requisito | Solución |
|---|---|
| Objetivo siempre visible | Header de objetivo dentro del `NumericKeypadSheet` (reimprime peso/reps prescritos + última vez). |
| Incrementos rápidos | Chips `-2.5/+2.5/+5` kg (mutan `ref.value` con `step`). |
| No romper lector de pantalla | El `<input>` real permanece (nombre, label, `aria`); keypad complementario con `<button aria-label>`; panel `role="group"`. |
| Fallback teclado físico desktop | Gate `pointer: coarse` → desktop conserva input nativo + Enter-no-cierra + Tab. |
| Convivir Enter-no-cierra | En touch no hay teclado SO (sin Enter); "Listo" = único submit (igual que hoy). En desktop, onKeyDown intacto. |
| Convivir autofill "= última vez" | Mismo mecanismo `ref.value =` que ya usa prefill; keypad refresca su mirror. |
| Offline / optimismo | `handleSubmit`/`enqueueWorkoutLog`/`formAction` sin tocar (el keypad solo llena inputs). |
| No pelear con visualViewport | Se suprime el teclado SO (`inputMode="none"`) → no hay resize del viewport que compensar. |

### Z-order / posicionamiento

- Keypad: `fixed bottom-0 left-0 right-0 z-50`, `pb-safe`. Al abrir, **ocultar la barra "Finalizar"** (z-40)
  para no apilar dos barras (el keypad ya trae "Listo"). El RestTimer normalmente no coincide (arranca en el
  submit); si por edición coincidiera, el keypad se cierra al hacer "Listo" y recién ahí arranca el descanso.
- Publicar `--keypad-h` (altura real del panel) y sumar `padding-bottom` al contenedor de scroll + usar el
  helper `smoothScrollIntoViewIfNeeded` para traer la **fila activa** por encima del keypad al abrir.

---

## Tareas atómicas estimadas (S/M/L)

1. **(S)** `useCoarsePointer.ts` en `lib/client/` — `matchMedia('(pointer: coarse)')` post-montaje + listener.
   Test unitario simple (mock matchMedia).
2. **(M)** `WorkoutKeypadProvider.tsx` — contexto + estado (campo activo, mirror), portal, escritura a
   `ref.value` + dispatch `input`, háptica, `--keypad-h`, cierre. Envolver el árbol de exec (junto a
   `WorkoutTimerProvider`, WorkoutExecutionClient 1204).
3. **(L)** `NumericKeypadSheet.tsx` — panel presentacional: header de objetivo, display, chips de incremento,
   grid de dígitos, coma decimal condicional, backspace/clear, `Siguiente`/`Listo`, animación `springsSheet` +
   reduced-motion, tema oscuro con tokens EVA, botones ≥48px + háptica.
4. **(M)** Integrar en `StrengthLogSetForm` (`LogSetForm.tsx`): gate `coarse`, `inputMode="none"` +
   `onFocus`→`openKeypad`, `focus({preventScroll:true})`, sincronizar prefill con el mirror. Pasar props nuevas
   opcionales `targetSets`/`targetReps` desde WorkoutExecutionClient (1649-1667). No regresionar el path desktop.
5. **(S)** Ajuste de layout: ocultar barra "Finalizar" cuando el keypad está abierto; padding-bottom dinámico
   (`--keypad-h`) + `smoothScrollIntoViewIfNeeded` de la fila activa.
6. **(M)** QA cross-device (iOS Safari, Android Chrome, desktop): verificar supresión del teclado SO, objetivo
   visible, incrementos, coma decimal es-CL, autofill, offline write-through, RestTimer tras submit, VoiceOver/
   TalkBack anuncian el input, y Tab/tecla física en desktop.
7. **(S, opcional / fase 2)** Extender el keypad a `TypedLogSetRow` (cardio min/metros/FC, movilidad seg, roller
   seg/pasadas). Requiere mapear campos numéricos y su `allowDecimal`. Ver pregunta CEO #1.
8. **(S, opcional)** Chips de incremento configurables y/o plate math (calculadora de discos) — fase posterior.

---

## Riesgos y gotchas

- **iOS `inputMode="none"`**: en general iOS respeta `inputmode="none"` (desde iOS 12.2) y no abre teclado, pero
  hay reportes de fugas en versiones puntuales. Mitigación si QA lo detecta: además `readOnly` (los inputs
  readOnly **sí** viajan en FormData; los `disabled` no) — pero readOnly cambia caret/focus ring. Empezar con
  `inputMode="none"` y escalar a readOnly solo si hace falta. **Verificar en iOS real** (no basta el simulador).
- **Focus scroll iOS**: enfocar un input al abrir el keypad puede saltar el scroll → usar
  `element.focus({ preventScroll: true })`.
- **Inputs uncontrolled + mutación externa**: al setear `ref.value` desde el keypad, despachar un evento
  `input` (`new Event('input', { bubbles: true })`) por robustez futura (hoy no hay listeners que dependan de
  ello, pero previene sorpresas si algún día se controlan).
- **Coma decimal es-CL**: el keypad debe permitir **una** `,` para peso; `handleSubmit` ya normaliza `,`→`.`
  (LogSetForm 364-366). Guardar contra doble coma y contra coma en reps (entero).
- **Hidratación SSR**: la detección `pointer: coarse` y la apertura del keypad son client-only, post-montaje.
  El render inicial debe ser idéntico al del server (input nativo) para no romper hidratación.
- **Z-order con footer/RestTimer**: definir explícitamente (keypad z-50; ocultar footer z-40 al abrir). Evitar
  dos barras apiladas y que el keypad tape la fila activa (padding + scroll-into-view).
- **Accesibilidad**: no atrapar foco lejos del AT; keypad complementario. Cada botón con `aria-label` claro
  ("siete", "coma", "borrar", "más 2.5 kilos"), panel `role="group" aria-label="Teclado numérico"`. El input
  real conserva su `<label>` (Kg/Reps) para lectores.
- **No regresionar** `Enter-no-cierra-serie` en desktop: el path `!coarse` debe dejar los `onKeyDown` (547-552,
  568-573) exactamente como están.
- **Reduced motion**: guarda `useReducedMotion` en toda animación del sheet (igual que RestTimer/LogSetForm).
- **Paridad mobile RN**: `apps/mobile` es codebase aparte (Expo/NativeWind) y **no** hereda este componente web;
  si se quiere paridad, es trabajo separado (fuera de este scope web/PWA).
- **Scope creep tipado**: limitar v1 a fuerza (weight/reps) reduce superficie de regresión; cardio/movilidad/
  roller a fase 2.

---

## Preguntas para el CEO

1. **Alcance v1**: ¿keypad solo en **fuerza** (peso/reps) o también en cardio/movilidad/roller (min, metros, FC,
   seg, pasadas)? Recomendado: **fuerza primero**, tipado en fase 2.
2. **Gate responsive**: ¿activar el keypad por **`pointer: coarse`** (todo touch, incluye tablets) o solo por
   ancho **<760px** (breakpoint md)? Recomendado: **pointer: coarse** (ataca el problema real "hay teclado en
   pantalla").
3. **Incrementos / plate math**: ¿chips fijos **-2.5 / +2.5 / +5 kg** alcanzan, o querés incrementos
   configurables y/o **calculadora de discos** (plate math, à la Strong/Hevy)? Recomendado: **chips fijos** en
   v1, plate math diferido.
