# QA1 · Fidelidad visual — Unidad 10: Rueda dual (peso × reps) + alternativa teclado

Componente: rueda dual estilo iOS que se abre al MANTENER PRESIONADO el valor de una serie de
fuerza (tap corto = teclado numerico custom). Contrato visual: `concepto-a-v31-cardio-wheel.html`
columna "Captura · rueda" (bottom sheet con dos columnas kg|reps, item central en capsula, mask de
desvanecido, boton "Listo" juicy) + los tools `a3a-tool.kb/pen` del mockup fuerza `concepto-a-v3-core.html`.

## Veredicto (2 lineas)

La LOGICA de la rueda es fiel en ambas plataformas (rango kg paso 2,5 ±20 · reps paso 1 ±10,
centrado en el anterior, formateo 57,5 con coma, 5 items visibles, tick haptico). La PRESENTACION
diverge fuerte: **web renderiza la rueda en un Dialog CENTRADO (no el bottom sheet del mockup)**, el
item central no crece ni se resalta como pill, los vecinos no tienen profundidad (rueda "plana") y el
boton "Listo" NO es juicy. RN esta mucho mas cerca (bottom Sheet + JuicyButton), pero su item central
tampoco se agranda a 27px y agrega un fondo hundido por columna que el mockup no tiene.

Severidad maxima: **BLOCKER** (presentacion web = modal centrado en vez de bottom sheet).

---

## Deltas WEB (`DualWheelPicker.tsx` + `globals.css` + integracion `LogSetForm.tsx`)

### [BLOCKER] Presentacion: modal CENTRADO en vez de bottom sheet
- **mockup**: `.a3c-sheet` = `position:absolute; left:0; right:0; bottom:0; height:66%;` con drag
  `.a3c-handle` (40×5 `#45454f`), `border-radius:24px 24px 34px 34px`, `border-top:2px solid #33333f`,
  `box-shadow:0 -22px 50px -18px rgba(0,0,0,.8)`, desliza desde abajo sobre el fondo de fuerza atenuado.
- **web**: `apps/web/src/components/ui/dialog.tsx:56` → `DialogContent` es
  `fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 ... data-open:zoom-in-95` = tarjeta al
  CENTRO de la pantalla con animacion fade+zoom. `DualWheelPicker.tsx:82-86` usa ese `Dialog`. No hay
  handle, no hay slide-up, no ancla al fondo. Ademas hereda del `DialogContent` una **X de cerrar**
  circular arriba-derecha (`dialog.tsx:71`) y un **overlay de gradiente decorativo** (`dialog.tsx:61`)
  que NO existen en el mockup.
- **RN**: correcto — `DualWheelPicker.tsx:231-238` monta `Sheet nativeModal forceDark snapPoints={['54%']}`
  (bottom sheet). Es la referencia.
- **fix**: reemplazar el `Dialog` por el mismo patron de bottom sheet que ya usa el ejecutor web
  (sheet reusable con handle, anclado abajo, radios 24/24/34/34, slide-up), o al menos anclar el
  `DialogContent` abajo (`bottom-0`, `translate-y-0`, `rounded-t`) y suprimir la X y el gradiente.

### [MAYOR] Fondo del contenedor demasiado oscuro
- **mockup**: `.a3c-sheet { background:#1d1d26 }` (superficie ELEVADA, gris-violaceo claro).
- **web**: `DualWheelPicker.tsx:84` → `bg-[var(--ink-950)]`; `globals.css:378` `--ink-950:#0B0E13`
  (casi negro). El sheet se ve mas hundido que el mockup, no elevado.
- **RN**: el `Sheet forceDark` usa su fondo dark propio; las columnas encima son `#15151c` (ver R2).
- **fix**: usar `#1d1d26` (o token equivalente) como fondo del contenedor de la rueda.

### [MAYOR] Item central no se agranda ni se resalta como pill
- **mockup**: `.a3c-wv.sel` = `font-size:27px; font-weight:900; color:#fff; letter-spacing:-.02em`,
  con **capsula propia**: `min-width:80px; height:44px; border-radius:13px;
  background:color-mix(brand 16%, #16161d); border:2px solid color-mix(brand 55%, transparent);
  box-shadow:0 0 0 3px color-mix(brand 12%, transparent)`. Adicional, banda fija `.a3c-wheelband`
  con hairlines `rgba(255,255,255,.14)` arriba/abajo.
- **web**: `globals.css:2256` `.exec-wheel-item[data-selected]` solo sube a `font-size:23px;
  font-weight:900; color:#fff` (23 vs 27). La capsula es un elemento fijo `.exec-wheel-cap`
  (`globals.css:2203`) con SOLO `border-top`/`border-bottom` 1.5px `color-mix(brand 60%)` +
  `background:color-mix(brand 10%)` + `border-radius:11px` — le faltan los **bordes laterales**, o
  sea no se ve el recuadro/pill de 2px alrededor del numero. Falta el `box-shadow 0 0 0 3px`.
- **RN**: capsula bien (recuadro completo 2px, ver mas abajo) PERO el numero central NO crece (ver R1).
- **fix**: subir el seleccionado a 27px/900 y darle a `.exec-wheel-cap` borde completo 2px
  `color-mix(brand 55%)` + `box-shadow:0 0 0 3px color-mix(brand 12%)`.

### [MAYOR] Vecinos "planos": sin profundidad de rueda iOS
- **mockup**: los vecinos escalan y se desvanecen por distancia — `.a3c-wv` base
  `font-size:22px; font-weight:800; color:#b7b7c2`; `.f1` `opacity:.5; transform:scale(.9); #9a9aa6`;
  `.f2` `opacity:.24; transform:scale(.78); #8f8f9c`. Da el efecto 3D de UIPickerView.
- **web**: `globals.css:2243` `.exec-wheel-item` base = `font-size:18px; font-weight:700; color:#6d6d78`
  para TODOS los no-seleccionados; sin `scale` ni `opacity` graduada por distancia. El unico
  desvanecido es la mask del wrap. Resultado: numeros vecinos mas chicos (18 vs 22), mas finos
  (700 vs 800), mas apagados (#6d6d78 vs #b7b7c2) y sin la curvatura de rueda.
- **RN**: correcto — `DualWheelPicker.tsx:87-93` interpola `opacity [1,0.45,0.18]` y
  `scale [1,0.84,0.7]` por distancia al centro (equivalente a f1/f2 del mockup).
- **fix**: emular el efecto en web (interpolar opacity/scale de cada item segun distancia al centro
  usando el scrollTop, o al menos subir base a 22px/800/#b7b7c2 y aplicar la escala en 2 anillos).

### [MAYOR] Boton "Listo" no es juicy
- **mockup**: `.a3c-listo.a3c-juicy` = juicy real → `border:2px solid color-mix(brand 55%, #000)`,
  `box-shadow:0 5px 0 0 color-mix(brand 55%, #000)`, `:active { translateY(5px); shadow 0 }`,
  texto `#072100` (verde casi-negro sobre marca), `height:58px; border-radius:16px; font-size:18px`,
  con check en circulo `.ck` (22×22, fondo `rgba(7,33,0,.22)`).
- **web**: `globals.css:2261` `.exec-wheel-done` = `background:brand; border:2px color-mix 55% black;`
  pero **sin** `box-shadow:0 5px 0` (solo `transition:transform` + `:active{scale(.98)}`). Texto
  **blanco** (`DualWheelPicker.tsx:123` `text-white`) en vez de accent-text oscuro; icono `<Check>`
  suelto sin circulo; `h-14`=56px vs 58; `text-[15px]` vs 18px; `rounded-control`=14px vs 16.
- **RN**: correcto — `DualWheelPicker.tsx:241-249` usa `<JuicyButton>` (barra de sombra dura 5px,
  hundido al presionar, label en `exec.accentText`). Solo MINOR: height 56/fontSize 17/radius 15 vs 58/18/16.
- **fix**: agregar la sombra `0 5px 0 color-mix(brand 55% black)` + hundido `translateY(5px)`, texto
  en accent-text oscuro (no blanco), y envolver el check en circulo semitransparente.

### [MAYOR] Copy y jerarquia del titulo
- **mockup**: `.a3c-sheethd` → titulo `.t` = "**Serie 3**" (20px/900/-.02em) + `.c` = "Press banca · 3 de 4"
  (12px/800/#8f8f9c).
- **web**: `DualWheelPicker.tsx:88-90` `DialogTitle` = "**Ajustar peso y reps**" (generico, text-base,
  centrado), sin subtitulo de ejercicio/serie.
- **RN**: `DualWheelPicker.tsx:238` `title={`Serie ${setNumber}`}` (bien) pero sin el subtitulo
  "Press banca · N de M" (ver R3).
- **fix**: web → titulo "Serie {n}" + subtitulo "{ejercicio} · {n} de {total}".

### [MINOR] Separador "×" agregado que no esta en el mockup
- **mockup**: dos columnas con `gap:12px`, sin simbolo entre ellas.
- **web**: `DualWheelPicker.tsx:99-101` renderiza un `.exec-wheel-x` "×" central (`globals.css:2215`,
  17px #8f8f9c). Elemento extra no contractual.
- **fix**: quitar el "×" (o confirmarlo con diseno; el mockup no lo tiene).

### [MINOR] Falta la nota inferior "Centrada en tu valor anterior · tick haptico por paso"
- **mockup**: `.a3c-wheelnote` bajo la rueda, con "**tick haptico**" en marca.
- **web**: ausente. **RN**: reemplazada por caption superior distinta (ver R3).
- **fix**: agregar la nota (informa el tick haptico y el centrado).

### [MINOR] Hint pill dentro del sheet
- **mockup**: `.a3c-hint` "**Tap** = teclado · **Manten presionado** = rueda" con dedo animado, DENTRO
  del sheet.
- **web/RN**: el hint se maneja fuera (pill "una sola vez" en la pantalla de fuerza — `WheelHint.tsx` /
  RN `ExerciseScreenV3.tsx:378`). Adaptacion aceptable (no repetir en cada apertura); se deja anotado
  para no "arreglarlo" duplicando.

### [MINOR] Encabezados de columna: tracking/color
- **mockup**: `.a3c-wheelhd` `letter-spacing:.14em; color:#7f7f8c; margin-bottom:6px`.
- **web**: `globals.css:2186` `.exec-wheel-lbl` `letter-spacing:0.08em; color:#8f8f9c`. Delta sutil.

### [MINOR] Mask y radios del contenedor
- **mockup**: mask `linear-gradient(180deg, transparent 0%, #000 26%, #000 74%, transparent 100%)`;
  sheet radios 24/24/34/34.
- **web**: `globals.css:2200` mask `transparent, #000 24%, #000 76%, transparent`; `rounded-sheet`=28px
  uniforme (`globals.css:133`); borde `--border-inverse` = `rgba(255,255,255,0.10)` vs `#33333f`.

---

## Deltas RN (`apps/mobile/.../v3/DualWheelPicker.tsx` + `ExerciseScreenV3.tsx`)

### [MAYOR] Item central NO se agranda (queda 22px)
- **mockup**: seleccionado `27px/900`.
- **RN**: `DualWheelPicker.tsx:97` todos los items usan `fontSize:22` y el centrado solo llega a
  `scale(1)` (`:87-93`), o sea 22px efectivos — nunca salta a 27. El numero elegido no "manda"
  visualmente como en el mockup.
- **fix**: en `WheelItem`, interpolar tambien la escala del centro por encima de 1 (p.ej. hasta
  ~1.23 → 22·1.23≈27) o subir el fontSize base y ajustar la interpolacion para que el centro llegue a 27.

### [MINOR] Fondo hundido por columna que el mockup no tiene
- **mockup**: columnas transparentes sobre el sheet `#1d1d26`; solo la capsula del centro tiene fondo.
- **RN**: `DualWheelPicker.tsx:159` cada columna es un `View` con `backgroundColor:s.surfaceSunken`
  (`#15151c`) y `borderRadius:16` → dos cajas oscuras insertadas, ausentes en el mockup.
- **fix**: quitar el `backgroundColor` de la columna (dejarla transparente); conservar solo la capsula.

### [MINOR] Titulo sin subtitulo + caption distinta
- **mockup**: subtitulo "Press banca · 3 de 4" + nota inferior "Centrada en tu valor anterior · tick haptico".
- **RN**: `DualWheelPicker.tsx:252-254` caption superior = "Desliza para ajustar el peso y las
  repeticiones" (copy propio) y sin subtitulo de ejercicio.
- **fix**: agregar subtitulo "{ejercicio} · {n} de {total}" y alinear copy de la nota con el mockup.

### [MINOR] Capsula: color e hairlines
- **mockup**: borde `color-mix(brand 55%, transparent)`; band hairlines `rgba(255,255,255,.14)` (blanco).
- **RN**: `DualWheelPicker.tsx:163-166` borde `hexToRgba(accent,0.9)` (mas opaco que 55%) y hairlines
  `hexToRgba(accent,0.28)` teñidas de acento en vez de blanco 14%.
- **fix**: bajar el borde a ~0.55 y hairlines a blanco `rgba(255,255,255,.14)`.

### [MINOR] Desvanecido de vecinos algo mas agresivo + medidas
- **RN** interpola `opacity .45/.18` y `scale .84/.7` vs mockup `.5/.24` y `.9/.78` (RN apaga/encoge un
  poco mas). `ITEM_HEIGHT=44` vs 46; sheet `54%` vs 66%; `JuicyButton` height 56/fontSize 17/radius 15
  vs listo 58/18/16. Sin mask suave de bordes (clip duro por `overflow:hidden`, compensado por la opacidad).

---

## Cumple (fiel — NO re-tocar)

- **Rango e incrementos identicos al mockup y entre plataformas**: kg paso 2,5 radio ±20 (55·57,5·60·62,5·65),
  reps paso 1 radio ±10 (6·7·8·9·10). Web `wheel-range.ts:26-27` (`WHEEL_KG_SPEC`/`WHEEL_REPS_SPEC`);
  RN `DualWheelPicker.tsx:45-48` (`KG_STEP/KG_SPREAD/REPS_STEP/REPS_SPREAD`).
- **Centrado en el valor anterior** (`nearestWheelIndex` / `buildWheelValues` redondean al grid del paso).
- **Formateo kg con coma** (`formatWeightEsCl` → "57,5"), tal como el mockup. Reps como entero.
- **5 items visibles** (web `VISIBLE=5 ITEM_H=46` → wrap 230px = mockup; RN `VISIBLE=5`).
- **Modelo de interaccion**: Tap = teclado numerico custom, Mantener presionado = rueda
  (`LogSetForm.tsx:503-565`, long-press 400ms con umbral de movimiento; RN `onLongPressValue`), con
  **tick haptico por paso** (web `wheelTick`/`navigator.vibrate`; RN `haptics.select()` con throttle 35ms).
- **Encabezados KG / REPS** en mayusculas/tracking (ambas plataformas).
- **Los tools `a3a-tool.kb`/`a3a-tool.pen` del mockup fuerza NO se renderizan — es CORRECTO**: el modelo
  v3.1 los sustituyo por tap/long-press sobre el propio valor + el hint pill. No re-agregar botones kb/pen.
- **RN acierta la estructura del mockup**: bottom Sheet (`Sheet nativeModal`) + boton "Listo" juicy real
  (`JuicyButton` con sombra dura 5px y hundido) — es la referencia a la que debe acercarse web.
- **La rueda NO toca el guardado**: solo produce (peso, reps) y los inyecta por el mismo autofill de la
  fila "Anterior" (web `applyWheel` dispara evento `input` nativo; RN `setAutofill` con nonce). Sin
  restos del ejecutor viejo en este flujo.

---

## Prioridad de fix sugerida (web primero, es donde estan los BLOCKER/MAYOR)
1. Web: bottom sheet en vez de Dialog centrado (+ quitar X y gradiente heredados). **BLOCKER**
2. Web: fondo `#1d1d26`; item central 27px/900 con pill de borde completo 2px; vecinos con
   escala/opacidad graduada. **MAYOR**
3. Web: boton "Listo" juicy (sombra 0 5px 0, hundido, texto accent-text, check en circulo). **MAYOR**
4. Web: titulo "Serie {n}" + subtitulo. **MAYOR**
5. RN: item central a 27px + quitar fondo hundido de columna + subtitulo/nota. **MAYOR/MINOR**
