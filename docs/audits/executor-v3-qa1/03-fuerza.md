# Auditoría de fidelidad visual — Ejecutor V3 "Impulso" · Unidad 03: Ejercicio de FUERZA

**Mockup (contrato):** `docs/research/executor-redesign/mockups/concepto-a-v3-core.html` — pantalla FUERZA (`#concept-a3a .a3a-body`, líneas CSS 249-403, markup 755-849).
**Web:** `apps/web/src/app/c/[coach_slug]/workout/[planId]/v3/ExerciseStepV3.tsx` + `exec-media.ts` + reuso de `LogSetForm.tsx` · CSS `apps/web/src/app/globals.css` (`[data-exec-v3]`).
**RN:** `apps/mobile/components/alumno/workout/v3/ExerciseScreenV3.tsx` + reuso de `SetRow.tsx` (`ActiveSetRow`/`SetRow`) · tokens `exec-theme.ts`.

## Veredicto (2 líneas)

La estructura superior (nombre, chip, media, chips glass, prescripción, fila "Anterior") es **muy fiel** al mockup, con detalles menores. **PERO el corazón de la pantalla — el bloque de captura del mockup (tiles de valor grandes, esfuerzo compacto con pills+escala de ticks, y CTA único full-width "Aplastar serie") — NO se reproduce**: se reusa el `LogSetForm`/`SetRow` legacy como lista de filas de input, que es EXACTAMENTE el "resto del ejecutor viejo" que reportó el CEO. Además faltan el **shimmer diagonal** de la media y las **herramientas del pie** (teclado/lápiz), y en RN falta todo el pie de series.

---

## Deltas

### BLOCKER

**[BLOCKER] El bloque de captura del mockup está reemplazado por el ejecutor viejo (LogSetForm/SetRow legacy).**
El mockup define la captura como un HERO de la serie activa: dos tiles de valor grandes (`a3a-cur`/`a3a-val`), un panel de esfuerzo compacto (`a3a-effort`), y **un** CTA full-width "Aplastar serie" (`a3a-cta`), con el progreso de series resumido en cuadraditos en el pie (`a3a-foot`/`a3a-sq`). La implementación NO pinta nada de eso: monta una **lista vertical de `LogSetForm` (web) / `ActiveSetRow`+`SetRow` (RN), una fila por serie**, cada una con sus inputs, sus dos escalas de esfuerzo y su propio submit "Listo". Es el paradigma "todas las series como formulario", re-skineado, no el hero de una serie a la vez del mockup.
- mockup: `a3a-cur` (2 tiles) + `a3a-effort` + `a3a-cta` "Aplastar serie" + `a3a-foot` (líneas 814-849).
- web: `ExerciseStepV3.tsx:242-276` mapea `block.sets` → `<LogSetForm>`; los tiles/effort/CTA del mockup no existen. `LogSetForm.tsx:803-894` = inputs Kg/Reps + `ScaleDots` RPE/RIR + `SubmitSetButton`.
- RN: `ExerciseScreenV3.tsx:176-230,399-400` mapea `block.sets` → `ActiveSetRow`/`SetRow`.
- Nota: fue una decisión consciente ("`LogSetForm` REUSADO tal cual — superficie de captura/resiliencia", `ExerciseStepV3.tsx:68-69`) para preservar cola offline/drafts. Choca con el contrato visual.
- fix: re-skinear la superficie reusada para que la fila ACTIVA rinda como el mockup (dos tiles `a3a-val` de 30px/900 con unidad KG/REPS debajo, panel `a3a-effort` compacto, y un submit full-width juicy "Aplastar serie"), dejando el motor de guardado intacto por debajo. Como mínimo: alcanzar los sub-deltas MAYOR de abajo (tiles, effort, CTA, foot).

### MAYOR

**[MAYOR] Shimmer diagonal de la media AUSENTE.**
El contrato pide el barrido de brillo animado sobre la card de media.
- mockup: `.a3a-media::after { background: linear-gradient(105deg, transparent 20%, rgba(255,255,255,.07) 45%, transparent 68%); background-size: 220% 100%; }` + `animation: concept-a3a-shimmer 3.2s linear infinite` (líneas 259-263, 569, 607).
- web: `globals.css:1627-1637` `.exec-v3-media` **no tiene `::after`** ni animación. El único `shimmer` del archivo (`globals.css:854,999`) es un util no aplicado a la media.
- RN: `ExerciseScreenV3.tsx:279-306` la View de media no tiene overlay de barrido.
- fix: añadir `[data-exec-v3] .exec-v3-media::after` con el gradiente 105deg + `background-size:220% 100%` + `@keyframes` que anime `background-position` a `-220% 0` en 3.2s (respetando `prefers-reduced-motion`). En RN, un `MotiView` con gradiente que traslada en X, o `expo-linear-gradient` animado.

**[MAYOR] CTA "Aplastar serie" no existe; el submit es "Listo"/"Guardar", no full-width, sin check-circle ni breathe.**
- mockup: `<div class="a3a-juicy a3a-cta"><span class="ck">✓</span> Aplastar serie</div>` — `width:100%; height:60px; font-size:18px`, círculo-check `a3a-ck` (bg `rgba(7,33,0,.22)`), texto `#072100`, `animation: concept-a3a-breathe 2.6s` (líneas 373-384, 574, 612, 837).
- web: `LogSetForm.tsx:892-893` submit en `flex justify-end` (NO full-width) con `SubmitSetButton` (`:1454-1467`) = `h-12 min-w-[104px] bg-[var(--sport-500)] text-white`, ícono `Check` plano (no círculo), label `'Listo'`/`'Guardar'`. El override `globals.css:1805-1815` le da sombra juicy y `min-height:56px` (vs 60px) pero **no** breathe. Copy "Aplastar serie" no aparece en toda la web (grep sin hits).
- RN: `SetRow.tsx:826-835,846` mismo patrón `h-12 min-w-[104px]` + `Check` + `'Listo'`/`'Guardar'`.
- fix: para la fila activa de fuerza, CTA full-width 60px con el copy "Aplastar serie", círculo-check y `breathe 2.6s`. Si el copy "Aplastar serie" se considera muy agresivo, decisión del CEO — pero hoy no está.

**[MAYOR] Panel de esfuerzo compacto (`a3a-effort`) reemplazado por dos escalas `ScaleDots` apiladas.**
- mockup: bloque `a3a-effort` (bg `#15151c`, border `1.5px #24242e`, radius 14) con header "Esfuerzo" + pill "Opcional" + toggle de pills `RPE —` / `RIR 2` (la activa teñida de marca) + **una** escala de 11 ticks (`a3a-tick`, el `.sel` sube a 11px con glow + `pulsebrand 2.2s`) + extremos "0"…"10" (líneas 339-370, 819-835).
- web: `LogSetForm.tsx:875-890` — **dos** escalas apiladas con labels "Esfuerzo · RPE" y "Reps en reserva · RIR", cada una un `ScaleDots` (dots segmentados), ambas siempre visibles. Sin pill "Opcional", sin toggle RPE/RIR, sin la escala de ticks con tick agrandado/glow.
- RN: `SetRow.tsx:797-811` mismo patrón (dos `EffortLabel` + escalas).
- fix: re-skinear la sección de esfuerzo del paso activo al formato mockup (pills toggle + escala de ticks única con `.sel` agrandado y pulsante). El wrapper `.exec-v3-effort` (`globals.css:3231`) ya existe como gancho.

**[MAYOR] Tiles de valor grandes (`a3a-cur`/`a3a-val`) ausentes.**
El mockup muestra el peso/reps de la serie activa como dos tiles de lectura grandes (no inputs): `n` a 30px/900, unidad "KG"/"REPS" debajo a 11px/800.
- mockup: `a3a-cur` con dos `a3a-val` (bg `#1c1c24`, border `2px #2f2f3a`, radius 16), `.n {font-size:30px;font-weight:900;letter-spacing:-.03em}` (líneas 330-336, 814-817).
- web: no existe; se ven los `<input>` Kg/Reps de `LogSetForm.tsx:815-869` (fila activa `h-14 text-2xl`, con mini-labels "Kg"/"Reps" dentro del form).
- RN: no existe; inputs de `ActiveSetRow` (`SetRow.tsx:756-773`).
- fix: parte del re-skin del BLOCKER — presentar los valores capturados como tiles de 30px/900 con unidad debajo.

**[MAYOR] Herramientas del pie (teclado/lápiz) ausentes; en RN falta TODO el pie de series.**
- mockup: `a3a-foot` = `a3a-sets` (cuadraditos `a3a-sq` + label "2/4") a la izquierda **y** `a3a-tools` (dos botones 38×38 radius 12: `a3a-tool.kb` teclado, `a3a-tool.pen` lápiz) a la derecha (líneas 386-403, 839-848).
- web: `ExerciseStepV3.tsx:279-288` renderiza `exec-v3-foot` con SOLO los cuadraditos + label; **no** hay `a3a-tools`. (La afordancia teclado/rueda se movió al `WheelHint` de texto, `ExerciseStepV3.tsx:239`.)
- RN: `ExerciseScreenV3.tsx` **no renderiza `a3a-foot` en absoluto** — ni cuadraditos, ni label "n/total", ni herramientas.
- fix web: añadir el par de tool-buttons (38×38, radius 12, bg `#1c1c24`, border `2px #2f2f3a`) al `.exec-v3-foot`. fix RN: añadir el pie completo (cuadraditos 22-24px + label + tools).

### MENOR

**[MENOR] RN: altura de media 176 vs 150 del contrato.**
- mockup/web: 150px (`a3a-media` línea 254 / `globals.css:1629`). RN: `MEDIA_HEIGHT = 176` (`ExerciseScreenV3.tsx:34,279`).
- fix: bajar a 150.

**[MENOR] RN: fondo de media plano vs gradiente del mockup.**
- mockup: `linear-gradient(160deg, #202029, #17171f)` (línea 256). web lo replica (`globals.css:1633`). RN usa `backgroundColor: s.surfaceRaised` = `#1c1c24` plano (`ExerciseScreenV3.tsx:279`, `exec-theme.ts:69`).
- fix: usar `expo-linear-gradient` 160deg #202029→#17171f de fondo de la card.

**[MENOR] RN: el peso en la prescripción NO va resaltado en blanco/bold.**
- mockup: `<b>60 kg</b>` en `#fff` dentro del `a3a-rx` gris (línea 806, 318-319). web: `<b>{...} kg</b>` (`ExerciseStepV3.tsx:198`, `globals.css:1724`). RN: `prescription` es un único `Text` con color uniforme `hexToRgba(s.text,0.82)`, el kg no se distingue (`ExerciseScreenV3.tsx:232-239,310-312`).
- fix: partir la línea y pintar el kg con `s.text`/bold.

**[MENOR] RN: el chip tipo·músculo lleva ícono Dumbbell (mockup y web no llevan ícono).**
- mockup: `<span class="a3a-chip">Fuerza · Pecho</span>` sin ícono (línea 774). web: idem (`ExerciseStepV3.tsx:124-126`). RN: `<Dumbbell size={13}/>` dentro del chip (`ExerciseScreenV3.tsx:250`).
- fix: quitar el ícono del chip en RN para paridad.

**[MENOR] Badge de "Nota del coach" sin halo de marca ni pulso.**
- mockup: `a3a-badge` con `box-shadow: 0 0 0 2px #16161d, 0 0 0 4px color-mix(brand 45%, transparent)` + `animation: concept-a3a-badge 1.8s` (líneas 295-299, 584). web: solo el anillo interno `0 0 0 2px #16161d`, sin halo, sin pulso (`globals.css:1696-1705`). RN: solo `borderWidth:2 #16161d` (`ExerciseScreenV3.tsx:490`).
- fix: añadir el segundo anillo de marca + keyframe de pulso.

**[MENOR] Web: fondo del ejecutor con `background: …fixed` y clase `bg-[var(--ink-950)]` compitiendo en el mismo nodo.**
El contenedor V3 lleva `data-exec-v3` **y** `className="… bg-[var(--ink-950)]"` (`WorkoutExecutionClient.tsx:2129-2131`). El gradiente gana como `background-image` (los stops son opacos), pero `background-attachment: fixed` (`globals.css:1425`) no está en el mockup y en iOS Safari/PWA `fixed` suele renderizarse mal o cambiar el origen del gradiente (`at 50% -8%` pasa a ser relativo al viewport, no a la pantalla). Candidato real al "color de fondo distinto" reportado por el CEO en device.
- mockup: `.a3a-screen { background: radial-gradient(120% 80% at 50% -8%, #1c1c24 0%, #16161d 42%, #121218 100%) }` SIN `fixed` (líneas 57-61).
- fix: quitar `fixed` (o poner el gradiente en un pseudo-elemento `position:fixed` dedicado), y quitar/neutralizar el `bg-[var(--ink-950)]` del nodo `data-exec-v3` para evitar el conflicto.

**[MENOR] Web: cuadraditos de serie 22×22 vs 24×24 del mockup.**
- mockup: `a3a-sq { width:24px; height:24px }` (línea 388). web: `.exec-v3-sq { width:22px; height:22px }` (`globals.css:1787-1788`).
- fix: subir a 24px.

**[MENOR] Media sin contenido: ícono Dumbbell estático vs silueta animada del mockup.**
El mockup rellena la card con una silueta de press animada (`a3a-fig`/`a3a-bar`/`a3a-arm` con `concept-a3a-press 2.4s`, líneas 264-280, 571-572, 794-803). Es un stand-in de demo, pero el estado "sin media" real difiere: web `exec-v3-media-empty` = Dumbbell gris estático (`ExerciseStepV3.tsx:184-188`, `globals.css:1638`); RN = Dumbbell (`ExerciseScreenV3.tsx:548`). Con gif/video reales la card se ve bien; la observación aplica al vacío.
- fix (opcional): estado vacío con más vida (silueta o pulso de marca).

**[MENOR] Colapso de chips glass: timing web 1.6s vs contrato ~1.2s; `max-width` 120 vs 110.**
- mockup: colapsa ~1.2s; `a3a-mlabel { max-width:110px }` (líneas 300-301). web: `exec-v3-mlabel-collapse 1.6s` (colapso total a 1.6s) y `max-width:120px` (`globals.css:1690-1716`). RN: `CHIP_COLLAPSE_MS = 1200` (fiel, `ExerciseScreenV3.tsx:37`).
- fix: ajustar la duración/keyframe web a ~1.2s y `max-width:110px`.

**[MENOR] Copy/tipografía de la línea `rx`: "×" vs "x", separador y chip de sobrecarga extra.**
- mockup: `4 x 8 · 60 kg · RIR 2 · desc 90s` (línea 806, "x" simple). web: usa "×" (`ExerciseStepV3.tsx:194`) y añade chip `exec-v3-overload` (TrendingUp) al lado (`:204-208`, no en el mockup). RN: separador doble-espacio `  ·  ` y añade `tempo` (`ExerciseScreenV3.tsx:233-238`).
- fix: unificar a "×" o "x" según preferencia CEO; el chip de sobrecarga es aditivo (dejar si aporta).

**[MENOR] Fila "Anterior": ícono History + chip "Supera tu marca" añadidos (no en el mockup).**
- mockup: `l "Anterior" | r "60 kg × 8" | tap "1 tap ↻"` sin ícono ni chip extra (líneas 808-812). web añade `<History>` al inicio y `"Supera tu marca"` (`ExerciseStepV3.tsx:224-234`); RN añade `<History>` (`ExerciseScreenV3.tsx:345`). Aditivo, no rompe identidad.
- fix: opcional; si se quiere paridad estricta, quitar el History o validarlo con el CEO.

**[MENOR] Color de texto del CTA: blanco vs `#072100` del mockup.**
- mockup: juicy con `color:#072100` (verde oscuro sobre verde) (línea 85). impl: `text-white` + `text-shadow` (`globals.css:1468,1472`; submit `text-white` en `LogSetForm.tsx:1461`).
- fix: decisión de contraste white-label; si el acento es claro, texto oscuro rinde mejor (como el mockup). Validar con CEO.

**[MENOR] Header: dots en fila propia + back-arrow + segunda fila de info (el mockup los tiene inline con el conteo y la tuerca).**
Pertenece a la unidad `ExecHeaderV3`, pero afecta la pantalla fuerza: mockup = `a3a-progress` (dots `gap:7` + "Ejercicio 3 de 8" + tuerca) en UNA fila dentro del body (líneas 104-112, 756-770). web = header sticky con back-arrow + dots (`gap-1.5`=6px) + "Ver todo" + tuerca, y una SEGUNDA fila "Ejercicio X de Y · series · cronómetro" (`ExecHeaderV3.tsx:48-118`). Los tokens de dot sí coinciden.
- fix: revisar en la unidad de header; aquí solo se registra la divergencia de layout y el `gap` 6 vs 7.

---

## Cumple (fiel — no re-tocar)

- **Nombre del ejercicio** `exec-v3-exname`: 26px / weight 900 / `letter-spacing:-.02em`, color `#f4f4f6` — coincide (web `globals.css:1620-1626`; RN `ExerciseScreenV3.tsx:245` fontSize 26 / ls -0.5 / displayBlack).
- **Chip tipo·músculo** (web): pill `bg color-mix(brand 16%, #16161d)`, texto `color-mix(brand 82%, #fff)`, border `1.5px color-mix(brand 34%)` — 1:1 con `a3a-chip` (`globals.css:1499-1510` vs línea 69-75).
- **Card de media**: 150px (web), radius 22, border `2px #2f2f3a`, gradiente `160deg #202029→#17171f` — fiel en web (`globals.css:1627-1637`). RN acierta radius/border 2px.
- **Chips glass** `exec-v3-mchip`: pill `rgba(8,8,12,.6)` + `backdrop-filter: blur(4px)`, border `1.5px rgba(255,255,255,.16)`, `min-height:30`, font 11/800, y la animación de colapso extendido→ícono con remount por serie (key en el contenedor) — fiel (web `globals.css:1665-1716`, `ExerciseStepV3.tsx:132`; RN `ExerciseScreenV3.tsx:281-305,435-494` con `AnimatePresence`). reduced-motion deja extendido en ambos.
- **Línea de prescripción** `exec-v3-rx` (web): 13px/700 `#c4c4cf`, centrada, `letter-spacing:.01em`, con `<b>` en blanco — fiel (`globals.css:1717-1726`).
- **Fila "Anterior"** `exec-v3-prev`: `border:2px dashed #34343f`, `bg:#1b1b23`, radius 14, label "Anterior" 12px `#8f8f9c`, valor 14px/800 `#e8e8ee`, "1 tap ↻" en marca; y el 1-tap re-usa el autollenado real (`fillByBlock` web / `autofill` RN) — fiel (web `globals.css:1739-1774`, `ExerciseStepV3.tsx:212-236`; RN `ExerciseScreenV3.tsx:322-374`).
- **Cuadraditos de serie** (web) `exec-v3-sq`: radius 8, `bg:#26262f`, border `2px #34343f`, `.is-on` marca + border `color-mix(brand 55%, #000)`, label "n/total" 12px/800 — fiel salvo el tamaño (22 vs 24, ver MENOR) (`globals.css:1786-1802`, `ExerciseStepV3.tsx:279-288`).
- **Dots de progreso** (tokens): height 9, track `#2a2a34`, `.done` `color-mix(brand 60%, #16161d)`, `.now` marca + anillo `0 0 0 3px color-mix(brand 25%)` + `beat 1.4s` — fiel (`globals.css:1432-1453`; RN `WeekStreakDots`/header). Respeta reduced-motion.
- **Sombra juicy** `0 5px 0` del acento oscurecido + hundido al presionar — presente en el submit reusado (`globals.css:1805-1815`) y en el token `.exec-v3-juicy` (`:1465-1479`).
- **Acento dinámico**: el verde `--brand-a3a` del mockup es placeholder; la impl resuelve marca white-label / EVA Sport vía `exec-theme` — correcto por diseño, NO es delta (`globals.css:1418-1462`, `exec-theme.ts:106-139`).
- **Regla de media** (gif→imagen, mp4/webm→video autoplay-mute-loop, YouTube→placeholder+chip) idéntica web/RN al modal de técnica (`exec-media.ts:22-49`, `ExerciseScreenV3.tsx:506-557`).
- **Extras coherentes con otras pantallas del contrato** (no en el core pero sí en `v32`): PR en vivo en la fila "Anterior" (tachado + flecha dorada), sustitución "máquina ocupada", rueda dual `DualWheelPicker` por long-press — presentes y bien integrados.
