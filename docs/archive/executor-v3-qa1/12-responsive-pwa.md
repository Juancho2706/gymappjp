# QA1 Ejecutor V3 — Unidad 12: Responsive / PWA (iPhone standalone + web responsive)

## Veredicto (2 líneas)
La base PWA está bien puesta (`viewportFit: 'cover'`, `min-h-dvh`, casi todas las superficies fijas respetan `env(safe-area-inset-*)`), así que el ejecutor NO se rompe en el grueso de los casos. Pero hay tres deltas visibles en el iPhone PWA del CEO: (1) el fondo cálido usa `background-attachment: fixed`, que WebKit/iOS renderiza mal — candidato directo a "el fondo se ve distinto"; (2) la pantalla de Inicio no reserva la franja del home indicator, así que el botón EMPEZAR queda pegado/bajo la barra inferior; y (3) el descanso a pantalla completa no hace scroll y se recorta en pantallas cortas (iPhone SE / landscape). El resto es MENOR (desalineación en tablet/desktop, drift de paddings, picker en landscape).

Severidad máxima: **MAYOR** (no hay BLOCKER puro de layout en portrait de iPhone estándar, pero #1 puede leerse como identidad rota en iOS).

---

## Contexto del contrato
El mockup enmarca TODO dentro de un phone shell fijo de **375×760** sin safe-areas:
- `docs/research/executor-redesign/mockups/concepto-a-v3-core.html:50` → `.a3a-phone { width: 375px; height: 760px; }`
- `:57-59` → `.a3a-screen { background: radial-gradient(120% 80% at 50% -8%, #1c1c24 0%, #16161d 42%, #121218 100%); }` **(sin `fixed`)**
- `:66` → `.a3a-body { flex:1; ... padding: 40px 18px 18px; min-height:0; }`
- `:239-242` → `.a3a-startcta { height:66px; width:100%; ... }`, empujado al fondo del body (streak con `margin-top:auto`, `:229`), a **18px** del borde inferior del shell.

Como el mockup es un marco de diseño sin notch ni home indicator, la implementación DEBE añadir las safe-areas. Lo hace casi en todos lados; las excepciones son los deltas de abajo.

---

## Deltas

### [MAYOR] 1 — Fondo con `background-attachment: fixed` (roto/janky en iOS Safari y PWA standalone)
- **Mockup:** el gradiente cálido vive en `.a3a-screen` SIN `fixed` (`concepto-a-v3-core.html:57-59`); se pinta anclado al alto del shell (760px).
- **Web:** `apps/web/src/app/globals.css:1424-1425` →
  ```css
  [data-exec-v3] { background: radial-gradient(120% 80% at 50% -8%, #1c1c24 0%, #16161d 42%, #121218 100%) fixed; }
  ```
  El keyword `fixed` = `background-attachment: fixed`. WebKit/iOS (Safari y PWA standalone es el mismo motor) tiene un bug histórico: los fondos `fixed` se dimensionan/pintan mal (relativos al documento, no al viewport; sin repaint en scroll; a veces se ven "lavados" o con banding). En un ejecutor que scrollea (root es `min-h-dvh`, `WorkoutExecutionClient.tsx:2131`) el radial se desancla del top visible y el resultado no coincide ni con el mockup ni con Android → es el sospechoso #1 de "color de fondo distinto" que reportó el CEO en su iPhone.
- **RN:** N/A (RN pinta `exec.surface.appBg` plano por pantalla, p.ej. `ExecutorV3.tsx:1171`).
- **Fix:** quitar `fixed` (dejar el gradiente en scroll) o —mejor, para clavar el encuadre del mockup en iOS/Android por igual— pintar el gradiente en una capa dedicada `position:fixed; inset:0; z-index:-1; pointer-events:none` dentro del root V3, y dejar `[data-exec-v3] { background: #121218 }` como base sólida.

### [MAYOR] 2 — Inicio: el botón EMPEZAR no reserva `env(safe-area-inset-bottom)` (queda bajo el home indicator)
- **Mockup:** CTA a 18px del borde inferior del shell (`concepto-a-v3-core.html:66` body `padding: … 18px`), con aire limpio debajo.
- **Web:** `apps/web/src/app/c/[coach_slug]/workout/[planId]/v3/SessionStart.tsx:82` →
  ```
  className="… flex min-h-full … px-5 pb-8 pt-[calc(env(safe-area-inset-top,0px)+28px)]"
  ```
  El TOP sí suma safe-area; el BOTTOM es `pb-8` (32px) plano. El CTA está anclado abajo con `mt-auto pt-6` (`:132`) y es un botón juicy con sombra dura de 5px (`.exec-v3-juicy`, `globals.css:1473`). En iPhone PWA standalone el home indicator ocupa ~34px: el botón (y su sombra) quedan a ~32px del borde real → colisionan/quedan bajo la barra inferior, justo en la thumb zone del gesto principal.
- **RN:** correcto — `SessionStart.tsx:74` usa `SafeAreaView edges={['top','bottom']}` + ScrollView con `paddingBottom:28` (`:76`). **Es una brecha de paridad: RN lo respeta, la web no.**
- **Fix:** `pb-[calc(env(safe-area-inset-bottom,0px)+2rem)]` en el contenedor de `SessionStart.tsx:82` (equivale al 18px del mockup + safe-area).

### [MAYOR] 3 — Descanso a pantalla completa: contenido no scrollable → se recorta en pantallas cortas (iPhone SE, landscape)
- **Mockup:** contenido del descanso cabe en el shell de 760px (`concepto-a-v3-core.html:867`).
- **Web:** `apps/web/src/app/globals.css:2449-2461` →
  ```css
  [data-exec-v3] .exec-v3-rest-inner { flex:1; display:flex; flex-direction:column;
    align-items:center; justify-content:center; gap:14px; …
    padding: max(env(safe-area-inset-top,0px),20px) 20px 120px; }   /* sin overflow-y */
  ```
  Suma vertical del bloque: anillo 208px (`RestInterstitialV3.tsx:98` `RING_R=92` → svg 208) + banner/celly + 3 botones ±15s/Saltar + tarjeta SIGUIENTE + coach message + 120px de padding inferior. En un viewport de **667px** (iPhone SE 2/3) o en **landscape**, la altura supera el alto disponible; como el inner está centrado (`justify-content:center`) y NO tiene `overflow-y`, el contenido se recorta arriba y abajo. El "Serie cerrada"/celly de arriba puede quedar tapado por el botón minimizar absoluto (`.exec-v3-rest-min`, `globals.css:2478-2482`), y la tarjeta SIGUIENTE puede quedar bajo el peek "Plan completo".
- **RN:** comparte el patrón centrado (`RestInterstitialV3.tsx:188` `View flex:1`, sin ScrollView en el bloque principal); solo el peek se limita con `maxHeight: winH*0.7` (`:352`). Mismo riesgo en pantallas cortas, aunque RN al menos lee `useWindowDimensions` (`:101`).
- **Fix:** en `.exec-v3-rest-inner` añadir `overflow-y:auto` y cambiar a `justify-content:flex-start` cuando el contenido no quepa (o media-query por alto: bajar el anillo a ~168px y `gap` a 10px bajo `@media (max-height:700px)`), reservando el peek con `padding-bottom` real.

### [MENOR] 4 — Ancho máximo inconsistente entre las piezas del chrome V3 (se nota en tablet/desktop, no en iPhone)
- **Web:** el header dibuja los dots a `max-w-5xl` (`ExecHeaderV3.tsx:49`, 1024px), el pager de ejercicios centra a `max-w-3xl` (`StepperExecution.tsx` `<section … max-w-3xl>`, 768px) y la barra Finalizar vuelve a `max-w-5xl` (`WorkoutExecutionClient.tsx:2386`). En pantallas anchas, la barra de progreso y el botón Finalizar se alinean a 1024px mientras el ejercicio queda a 768px → tres columnas desalineadas.
- **Mockup:** solo define phone (375px); en iPhone del CEO las tres son 100% ancho y NO se ve el problema.
- **Fix:** unificar a un único `max-w` (p.ej. `max-w-3xl`) en header, pager y barra Finalizar. Severidad MENOR porque el CEO usa PWA en iPhone; solo afecta la web responsive ancha.

### [MENOR] 5 — Padding inferior del pager `pb-32` fijo, no safe-area-aware
- **Web:** `StepperExecution.tsx` `<section … px-4 py-4 pb-32>` reserva 128px para la barra Finalizar fija. Pero esa barra crece en iPhone (`pb-[calc(1rem+env(safe-area-inset-bottom,0px))]`, `WorkoutExecutionClient.tsx:2385`), así que el colchón efectivo baja de 128px. Con `FOOTER_H=88` (`WorkoutExecutionClient.tsx:593`) suele alcanzar, pero en home indicator grande + última fila alta queda al límite (la última serie/FAB puede rozar la barra).
- **Fix:** `pb-[calc(8rem+env(safe-area-inset-bottom,0px))]`.

### [MENOR] 6 — Drift de padding horizontal vs mockup
- **Mockup:** body a **18px** por lado (`concepto-a-v3-core.html:66`).
- **Web:** header y pager usan `px-4` (16px) (`ExecHeaderV3.tsx:49`, `StepperExecution.tsx`), Inicio usa `px-5` (20px) (`SessionStart.tsx:82`), interstitial usa 20px (`globals.css:2459`). Ninguno rompe layout, pero el aire lateral no es uniforme entre pantallas (mockup sí es 18px consistente).
- **Fix:** homogeneizar a 18px (`px-[18px]`) en las superficies V3 principales.

### [MENOR] 7 — DualWheelPicker sin `max-height`: puede desbordar en landscape / viewport muy corto
- **Web:** `DualWheelPicker.tsx:84` `DialogContent className="exec-wheel-dialog max-w-xs …"`; alto total ≈ wrap `46*5=230px` (`:19-20,97`) + título + botón "Listo" `h-14` (`:123`) + `p-5` → ~400px, sin scroll interno propio ni `max-h`. En portrait de iPhone sobra; en landscape (alto ~375-430px) el diálogo puede quedar más alto que el viewport.
- **Fix:** `max-h-[85dvh] overflow-y-auto` en el `DialogContent` del picker.

### [OK-nota] 8 — Splash (Entrada) sin safe-area pero centrado
- `SessionIntro.tsx:46` es `fixed inset-0 flex items-center justify-center px-8`; todo va centrado vertical, así que el notch/home indicator no recortan nada crítico. Sin acción salvo que crezca el contenido.

---

## Cumple (fiel — no re-tocar)

- **`viewportFit: 'cover'` global** — `apps/web/src/app/layout.tsx:76`. Sin esto `env(safe-area-inset-*)` sería 0 en iOS; está bien puesto, así que todo el manejo de safe-area de abajo es efectivo.
- **Root con viewport dinámico** — `WorkoutExecutionClient.tsx:2131` usa `min-h-dvh` (no `100vh`), correcto para la barra dinámica de iOS/Android; el helper `.min-h-dvh` cae a `100vh` y luego `100dvh` (`globals.css:1151-1154`).
- **Barra "Finalizar" respeta el home indicator** — `WorkoutExecutionClient.tsx:2385` `pb-[calc(1rem+env(safe-area-inset-bottom,0px))]`, `fixed bottom-0`.
- **FAB "Volver al ejercicio" safe-area-aware** — `globals.css:2416` `bottom: calc(5.5rem + env(safe-area-inset-bottom,0px))`.
- **Sheets inferiores (descanso/ajustes/sensor)** — padding `calc(16px + env(safe-area-inset-bottom,0px))` y tope `78dvh`/`88dvh`: peek `globals.css:3014-3015`, ajustes `:3081,3088`, sensor hereda ajustes `:3551`. En ≥768px se recentran como panel con `max-w` (`:2462-2476, 3019-3030, 3091-3101`).
- **Descanso: botón minimizar y padding-top con notch** — `globals.css:2480` `top: max(env(safe-area-inset-top,0px),14px)`; inner top `:2459` `max(env(top),20px)`.
- **SessionComplete safe-area top+bottom** — `SessionCompleteV3.tsx:133` `pt-[calc(env(safe-area-inset-top,0px)+28px)] pb-[calc(env(safe-area-inset-bottom,0px)+24px)]`, con `overflow-y-auto`.
- **Header sticky cubre el notch** — `ExecHeaderV3.tsx:48` `sticky top-0 pt-safe backdrop-blur`; `.pt-safe = env(top)+0.5rem` (`globals.css:1055-1056`).
- **Nav móvil del alumno oculto en `/workout/`** — `ClientNav.tsx:516` (`!isWorkout`), y `<main>` con `has-[.is-workout-page]:pb-0` (`layout.tsx:366`): no hay barra inferior del alumno peleando con la barra Finalizar.
- **Sin scroll horizontal del body** — `globals.css` `html { overflow-x: clip }` (~1146) + `body > * { max-width:100% }`; los círculos/rueda son de tamaño fijo seguro (anillos 208px svg, `.exec-v3-holdwrap` 214px `globals.css:3261`, media 150px `:1629`) que caben en 375px.
- **Overlays full-screen usan `fixed inset-0`** (correcto en PWA standalone) con z-index coherente: splash 70 / inicio 65 / settings 61 / descanso 60 / FAB 45 / finish 40 / header 20.

## Paridad RN (referencia)
RN es más estricto con safe-areas que la web y sirve de patrón para los fixes:
- `useSafeAreaInsets` en todas las pantallas: `ExecutorV3.tsx:138`, `RestInterstitialV3.tsx:100`.
- `SessionStart.tsx:74` `SafeAreaView edges top+bottom` + ScrollView → el fix del delta #2 solo iguala a lo que RN ya hace.
- `ExecutorV3.tsx:1206` barra fija con `paddingBottom: 16 + insets.bottom`; `ExerciseListV3.tsx:62` y `SessionCompleteV3.tsx:195` con `edges top+bottom`.

## Resumen de acciones priorizadas
1. Quitar `fixed` del fondo `[data-exec-v3]` (o moverlo a capa `position:fixed` dedicada) — `globals.css:1425`.
2. Añadir `env(safe-area-inset-bottom)` al `pb` de Inicio — `SessionStart.tsx:82`.
3. Hacer scrollable/adaptativo el descanso en pantallas cortas — `globals.css:2449-2461`.
4. Unificar `max-w` del chrome V3 y hacer `pb` del pager safe-area-aware — `ExecHeaderV3.tsx:49` / `StepperExecution.tsx` / `WorkoutExecutionClient.tsx:2386`.
5. `max-h-[85dvh] overflow-y-auto` en el picker de rueda — `DualWheelPicker.tsx:84`.
