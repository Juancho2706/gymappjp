# 14 — BUG: "el teclado o la rueda estan lageados o no salen al colocar un valor" (PWA)

## Veredicto (2 lineas)
El bug NO es de la rueda ni del teclado en si — es la **capa de gesto V3** que reemplaza el `onFocus`
robusto por un long-press manual sobre el `<input>` que se **cancela solo** (el navegador roba el toque
como scroll y cualquier micro-movimiento >10px aborta AMBOS caminos), por eso "no sale"; y el "lag" es la
**rueda dentro de un `Dialog` de Base UI con doble `backdrop-filter` de pantalla completa** + una **tormenta
de re-render** (setState del padre por cada tope cruzado → 62 botones reconciliados por frame) sin throttle
de haptico. El espejo RN NO comparte el problema (gesto nativo + scroll en UI-thread + indice en ref).

Alcance real: el "no sale" afecta SOLO al camino **fuerza V3** (`ExerciseStepV3` → `StrengthLogSetForm`,
rama `useWheel`). El camino **cardio/tipado** (`CardioStepV3` → `TypedLogSetRow`) usa `onFocus` y NO
reproduce el "no sale" (aunque comparte el lag de la rueda? — no: cardio no abre rueda; solo teclado por
foco, robusto). Ver secciones "Causa raiz A/B/C" y "Cumple".

---

## Mapa del flujo (web)

Tap/hold en el valor de una serie de fuerza V3:

1. `ExerciseStepV3` renderiza `WheelHint` ("Tap = teclado · Manten presionado = rueda") y delega la captura
   al **`LogSetForm` reusado** (no hay input propio del step). — `ExerciseStepV3.tsx:239-276`
2. En `StrengthLogSetForm`, con `useWheel = v3 && coarse` (`LogSetForm.tsx:221`):
   - el `<input>` kg/reps tiene **`onFocus` = `undefined`** (deshabilitado a proposito) — `LogSetForm.tsx:827,854`
   - `onPointerDown` = `onFieldPointerDown` → **`e.preventDefault()`** (bloquea el foco nativo) + arranca timer 400ms — `LogSetForm.tsx:524-538`
   - `onPointerMove` → si mueve >10px, limpia timer **y** marca `p.moved=true` — `LogSetForm.tsx:539-547`
   - `onPointerUp` → si `p.fired`/`p.moved`, **return sin abrir nada**; si no, `openKeypadFor(field)` — `LogSetForm.tsx:548-565`
   - `onPointerCancel`/`onPointerLeave` → limpia el timer (y no hay reintento) — `LogSetForm.tsx:566-572,831-832,858-859`
3. Tap corto → teclado custom (`WorkoutKeypadProvider` → portal `NumericKeypadSheet`). Long-press 400ms → `openWheel` → `setWheelOpen(true)` → **`DualWheelPicker`** (Base UI `Dialog`). — `LogSetForm.tsx:503-521,951-960`

El `WorkoutKeypadProvider` SI envuelve todo el arbol V3 (`WorkoutExecutionClient.tsx:2126→2598`), asi que
`keypad != null`: el problema NO es un provider ausente.

---

## Causa raiz A — "NO SALE" (teclado y rueda): gesto fragil sobre el input (BLOCKER)

El teclado, en modo rueda, **solo** puede abrirse por `onFieldPointerUp` (el `onFocus` esta anulado,
`LogSetForm.tsx:827,854`). Ese `pointerup` se pierde en dos escenarios muy frecuentes en tactil:

1. **Robo del toque como scroll (`pointercancel`).** `e.preventDefault()` sobre un `pointerdown`
   **NO impide el scroll tactil** — solo `touch-action` (CSS) o `preventDefault` en `touchstart` lo hacen
   (spec Pointer Events / MDN). El `<input>` esta dentro de una pagina que scrollea vertical y **no tiene
   `touch-action: none`** (`inputClass` en `LogSetForm.tsx:758-761`; el unico `touch-action` del feature esta
   en `.exec-wheel-scroll`, `globals.css:2237`). Resultado: el navegador puede interpretar el toque como pan,
   dispara **`pointercancel`** (que solo limpia el timer, `LogSetForm.tsx:566-572`) y **nunca llega el
   `pointerup`** → ni teclado ni rueda. Sintoma exacto del CEO: "toco y no sale".
2. **Micro-movimiento del dedo (>10px).** `onFieldPointerMove` marca `p.moved=true` (`LogSetForm.tsx:542-545`)
   y `onFieldPointerUp` hace `if (p.moved) return` (`LogSetForm.tsx:559-562`) → un tap levemente impreciso
   sobre un target de 56px (h-14) **no abre nada**. En un gym (de pie, con guantes, en movimiento) esto pasa seguido.

La rueda hereda la MISMA fragilidad: requiere mantener quieto 400ms; cualquier `pointercancel`/move dentro de
esa ventana la aborta → "la rueda no sale".

Contraste que prueba la regresion: el camino **cardio/tipado** (`TypedLogSetRow`) y el desktop/V2 abren el
teclado por **`onFocus`** (`LogSetForm.tsx:1083`, `fieldProps`) — un foco dispara con el tap
independientemente de micro-movimientos o de que el navegador considere el gesto un pan. Es decir, el gesto V3
**introdujo** esta fragilidad al sustituir `onFocus` por un pointer-handler manual.

- **Mockup:** el contrato ("Tap = teclado · Manten presionado = rueda", `concepto-a-*` + hint) NO pide anular
  el foco; asume que el tap abre el teclado de forma confiable.
- **Web:** `LogSetForm.tsx:524-572` (gesto) + `:827,854` (onFocus anulado) + `:758-761` (input sin touch-action).
- **RN:** N/A (usa `onPress`/`onLongPress` nativos, robustos) — `ExerciseScreenV3.tsx:203,219`.
- **Fix propuesto (el mas seguro):** **no anular `onFocus`.** Dejar que el tap enfoque y abra el teclado por
  `onFocus` como en cardio/V2, y detectar el long-press en paralelo (sin `preventDefault` del pointerdown):
  al cumplirse 400ms, `openWheel()` y `weightRef.current?.blur()` (para cerrar el teclado que pudiera haber
  abierto el foco). Ademas:
  - añadir **`touch-action: none`** (o `manipulation`) al `<input>` SOLO en modo `useWheel`, para que el
    navegador no robe el gesto como scroll.
  - usar **`e.currentTarget.setPointerCapture(e.pointerId)`** en pointerdown para garantizar que el
    `pointerup` llegue al mismo input aunque el dedo se desplace.
  - subir el umbral de cancelacion de 10px a ~14-16px (tolerancia real de dedo).
  - opcional: si se conserva el `pointerup`-para-tap, abrir el teclado en `pointerdown` corto NO — mejor foco.

---

## Causa raiz B — "LAG": doble backdrop-filter de pantalla completa en el Dialog de la rueda (MAYOR)

`DualWheelPicker` monta un `Dialog` de Base UI (`DualWheelPicker.tsx:82`, via `components/ui/dialog.tsx`).
Ese Dialog aplica DOS blur de compositing costosos:

- **Overlay:** `supports-backdrop-filter:backdrop-blur-xl` = `backdrop-filter: blur(24px)` sobre TODO el
  viewport — `dialog.tsx:34`.
- **Popup:** `dark:backdrop-blur-2xl` = `backdrop-filter: blur(40px)` sobre el contenido — `dialog.tsx:56`.
  (El picker le pone `bg-[var(--ink-950)]` encima, `DualWheelPicker.tsx:84`, asi que ese blur de 40px es en
  gran parte **trabajo de GPU desperdiciado** — invisible pero se computa igual.)

`backdrop-filter` a pantalla completa es de lo mas caro en GPUs moviles; produce un hitch visible al abrir la
rueda y la deja "pesada", sobre todo en Android gama media/baja. Es la sensacion de "lag" al aparecer.

- **Mockup:** la rueda es un sheet oscuro solido con capsula de acento; NO especifica blur de fondo pesado.
- **Web:** `dialog.tsx:34,56`.
- **RN:** `Sheet nativeModal forceDark` — sin backdrop-filter — `DualWheelPicker.tsx (RN):231-237`.
- **Fix propuesto:** en `exec-wheel-dialog` quitar el blur del popup (`bg` ya es opaco) y reducir/eliminar el
  del overlay: pasar `showCloseButton`/className que anule `dark:backdrop-blur-2xl` y bajar el overlay a un
  `bg-black/60` plano sin `backdrop-blur-xl`. O montar la rueda en un sheet propio (como RN) en vez del
  `Dialog` generico. Objetivo: 0 `backdrop-filter` de viewport mientras la rueda esta abierta.

---

## Causa raiz C — "LAG" al girar: tormenta de re-render + haptico sin throttle (MAYOR)

En web la rueda **re-renderiza React por cada tope cruzado** durante el flick:

- `onScroll` agenda `commitFromScroll` (rAF + settle 90ms) — `DualWheelPicker.tsx:175-185`.
- `commitFromScroll` llama `onIndex(clamped)` cuando cambia el indice — `DualWheelPicker.tsx:163-173`.
- `onIndex` es `setKgIdx`/`setRepsIdx` **en el padre `DualWheelPicker`** — `:106,113` → re-render del padre
  → re-render de **ambas** `WheelColumn` (ninguna esta memoizada) → se reconcilian sus `range.map(...)` de
  **41 + 21 = 62 `<button>`**, cada uno con **closure `onClick` nueva** e **inline `style={{height}}` nuevo**
  por render — `DualWheelPicker.tsx:208-231`.
- Ademas cada cruce dispara `wheelTick()` = `navigator.vibrate(8)` **sin throttle** — `DualWheelPicker.tsx:10-16,170`.
- Y el efecto de posicionamiento de cada columna (`useEffect [index, range.length]`) **lee `el.scrollTop`**
  (forced layout) en cada cambio de indice — `DualWheelPicker.tsx:153-161` — layout thrash durante el scroll.

En un flick rapido se cruzan ~10-20 topes → 10-20 re-renders completos de 62 botones + 10-20 `vibrate` +
lecturas de layout. En gama media/baja = jank ("lageado") mientras gira.

- **Web:** `DualWheelPicker.tsx:10-16,106,113,153-173,208-231`.
- **RN (como deberia ser):** `useAnimatedScrollHandler` corre en **UI-thread**; el indice vive en `useRef`
  (`kgIdx.current`, `ExerciseScreenV3` + `DualWheelPicker.tsx (RN):127-150,263,275`) → **cero re-render de
  React al girar**; haptico con **throttle 35ms** (`DualWheelPicker.tsx (RN):51,131-138`).
- **Fix propuesto:** no hacer `setState` del padre por cada cruce. Guardar el indice vivo en un `ref` y
  actualizar SOLO la clase `data-selected` del tope activo por manipulacion directa del DOM (o memoizar
  `WheelColumn` con `React.memo` y mover el resaltado a un overlay/capsula fija sin re-render de los 62
  botones). Añadir throttle al `wheelTick` (p.ej. 30-40ms como RN). Sacar la lectura de `scrollTop` del
  camino caliente (solo posicionar al abrir/reabrir).

---

## Causa raiz D — getComputedStyle en fase de render (MENOR)

`accent` se resuelve con `getComputedStyle(root).getPropertyValue('--exec-brand')` **dentro de un `useMemo`
en render** (`DualWheelPicker.tsx:63-69`). Es un forced style flush en el commit de apertura (dep `[open]`,
1 vez por apertura) — no es el causante del lag continuo, pero es un efecto de layout en fase de render que
conviene mover a `useEffect`/`useLayoutEffect`. Impacto real: bajo.

---

## Tabla de deltas

| Sev | Delta | Mockup / esperado | Web (file:line · valor) | RN | Fix |
|-----|-------|-------------------|-------------------------|----|-----|
| BLOCKER | Teclado/rueda "no salen" en tactil | Tap abre teclado siempre; hold abre rueda | `LogSetForm.tsx:827,854` onFocus=undefined en wheel; `:524-572` gesto que cancela por >10px y por `pointercancel`; `:758-761` input sin `touch-action` | No (Pressable nativo `onPress`/`onLongPress`, `ExerciseScreenV3.tsx:203,219`) | Restaurar `onFocus`→teclado; long-press en paralelo sin `preventDefault`; `touch-action:none` + `setPointerCapture` en modo wheel; umbral 14-16px |
| MAYOR | Rueda "lageada" al aparecer | Sheet oscuro solido, ligero | `dialog.tsx:34` overlay `backdrop-blur-xl`(24px) + `:56` popup `backdrop-blur-2xl`(40px, tapado por bg opaco) | No (`Sheet nativeModal`, sin blur) | Anular ambos `backdrop-filter` para la rueda; overlay plano o sheet propio |
| MAYOR | Rueda "lageada" al girar | Giro fluido 60fps | `DualWheelPicker.tsx:106,113,163-173` setState del padre por tope → re-render de 62 botones; `:10-16,170` vibrate sin throttle; `:153-161` lee scrollTop por indice | No (UI-thread + ref + throttle 35ms) | Indice en ref + resaltado directo/memo; throttle vibrate; sacar scrollTop del hot path |
| MENOR | getComputedStyle en render | — | `DualWheelPicker.tsx:63-69` | No | Mover a useLayoutEffect |
| MENOR | Tap abre en `pointerup`, no en foco | Respuesta inmediata al tocar | `LogSetForm.tsx:548-565` | onPress nativo | Se resuelve con el fix A (volver a onFocus) |

---

## Cumple (fiel — NO re-tocar)

- **Rango de la rueda es corto y memoizado** — kg ±20/2,5 = 41 topes, reps ±10 = 21; `useMemo` por
  `initialWeight`/`initialReps` (`DualWheelPicker.tsx:49-50`, `wheel-range.ts:26-27,39-53`). NO genera arrays
  gigantes. El rango NO es la causa del lag.
- **`.exec-wheel-scroll` tiene `touch-action: pan-y`** (`globals.css:2237`) — el scroll DENTRO de la rueda
  esta bien acotado; el problema de touch-action es en el `<input>`, no aca.
- **`onScroll` usa rAF + settle-timeout** para no saturar (`DualWheelPicker.tsx:176-185`) — el patron es
  correcto; lo que falta es evitar el setState del padre (causa C), no el rAF.
- **Keypad custom (`NumericKeypadSheet`) es liviano** — portal + framer slide-up, **sin backdrop-filter**
  (`NumericKeypadSheet.tsx:169-192`), ResizeObserver de altura correcto (`:142-152`). El teclado en si NO es
  el "lageado"; su unico problema es el "no sale" (causa A, aguas arriba en el gesto).
- **Provider presente** — `WorkoutKeypadProvider` envuelve todo el arbol V3
  (`WorkoutExecutionClient.tsx:2126→2598`); `keypad` nunca es null en V3, asi que NO hay un caso de tap que
  cae en el vacio por provider ausente.
- **Camino cardio/tipado NO reproduce el "no sale"** — `TypedLogSetRow` abre el teclado por `onFocus`
  (`LogSetForm.tsx:1083`), robusto; solo hereda el lag de la rueda si abriera rueda, pero cardio no abre
  rueda (solo teclado). El fix debe centrarse en el camino fuerza (`StrengthLogSetForm`, rama `useWheel`).
- **Espejo RN sano** — arquitectura correcta: scroll en UI-thread, indice en ref, haptico con throttle,
  sheet nativo. **No requiere cambios** (`apps/mobile/.../v3/DualWheelPicker.tsx`,
  `.../v3/ExerciseScreenV3.tsx:203,219`). El fix web puede tomar el patron RN como referencia.

---

## Recomendacion de fix priorizada

1. **(BLOCKER) Rehabilitar `onFocus`→teclado + touch-action + pointer-capture** en el input de fuerza V3.
   Esto solo elimina el "no sale" del teclado Y de la rueda (ambos dependen de que el gesto no sea robado).
2. **(MAYOR) Matar los `backdrop-filter`** de la rueda (overlay + popup) — elimina el hitch de apertura.
3. **(MAYOR) Quitar el setState-del-padre por tope** en el giro (indice en ref + resaltado directo) y
   **throttlear el vibrate** — elimina el jank al girar.
4. **(MENOR)** mover `getComputedStyle` a efecto.

Ninguno toca guardado/draft/cola/reconciliacion (la rueda y el teclado solo PRODUCEN valores por el mismo
autofill). El riesgo del fix es puramente de UI de captura.
