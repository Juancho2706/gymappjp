# Auditoría de fidelidad visual — Ejecutor V3 "Impulso"

## Unidad 02 · Inicio de sesión (pantalla pre-arranque)

**Contrato visual:** `docs/research/executor-redesign/mockups/concepto-a-v3-core.html` — columna "Inicio" (`.a3a-start`, líneas HTML 690-746; CSS 170-246 y animaciones 567-644).
**Implementación web:** `apps/web/src/app/c/[coach_slug]/workout/[planId]/v3/SessionStart.tsx` + CSS `apps/web/src/app/globals.css` (bloque `[data-exec-v3]`, 1481-1617) + wiring `WorkoutExecutionClient.tsx` (2070-2171).
**Espejo RN:** `apps/mobile/components/alumno/workout/v3/SessionStart.tsx` + `JuicyButton.tsx` + `WeekStreakDots.tsx` + `exec-theme.ts` + wiring `ExecutorV3.tsx` (688-731, 1147-1166).

---

## Veredicto (2 líneas)

La estructura base (eyebrow, título 34/900, chips, mini-lista del plan, CTA juicy) está transcrita con alta fidelidad y varios hex coinciden al pixel. PERO hay **1 BLOCKER**: la **nota del coach con su globo y flechita** — elemento estrella del brief — NO se renderiza en ninguna plataforma (web ni siquiera tiene la prop; RN la tiene cableada a `null` fijo). Además la **fila de contexto pierde su segunda tarjeta ("Duración")** quedando media vacía, la **racha semanal fue rediseñada** (7 dots de semana vs 4 del mockup, tamaño y layout distintos), el **color del texto/triángulo del CTA cambió a blanco** y en **RN el fondo es plano en vez del degradado radial cálido** del contrato.

---

## Deltas

### BLOCKER

**[BLOCKER] Nota del coach (globo `a3a-note`) ausente en ambas plataformas**
- **Mockup:** bloque prominente entre la fila de contexto y la racha (HTML 725-728): tarjeta con `background: color-mix(in srgb, var(--brand) 12%, #16161d)`, `border: 1.5px color-mix(brand 26%)`, `border-radius: 14px`, avatar redondo 22px con degradado de marca, nombre "Coach Andrea" en color de marca (11px/800) y mensaje "Hoy subimos el press. Confío en ti." (14px/700 #eaeaf0). CSS 210-228.
- **Web:** `SessionStart.tsx` NO declara prop de nota; `WorkoutExecutionClient.tsx:2097-2109` (`execV3StartVM`) NO calcula `coachNote` → el elemento no existe. No hay clase `.exec-v3-note` en `globals.css`.
- **RN:** el componente SÍ soporta la nota (`SessionStart.tsx:186-209`) pero `ExecutorV3.tsx:1159` pasa `coachNote={null}` HARDCODEADO → nunca se pinta.
- **Fix:** Web — añadir `coachNote`/`coachName` al VM (de `blocks[…].notes` o nota del día del plan) y renderizar la burbuja + clase `.exec-v3-note` (portar los hex del mockup). RN — reemplazar `coachNote={null}` por la nota real derivada del plan/día. Ambos deben incluir la **flechita** (ver delta siguiente).

### MAYOR

**[MAYOR] Flechita del globo (`a3a-note::after` rotada 45°) no implementada en ninguna parte**
- **Mockup:** cola del globo apuntando hacia el CTA — `::after` de 14×14px en `left: 26px; bottom: -8px`, con `border-right`+`border-bottom` de marca y `transform: rotate(45deg)` (CSS 215-221).
- **Web:** inexistente (la nota entera falta).
- **RN:** el componente de nota tiene `position: relative` (`SessionStart.tsx:189`) pero NO dibuja la cola/pico — el globo queda como caja rectangular.
- **Fix:** añadir el pico rotado (web: `::after` con los mismos bordes; RN: cuadrado rotado 45° absolutamente posicionado a `left:26 bottom:-7`, mismos color de fondo y bordes que la nota).

**[MAYOR] Fila de contexto pierde la 2ª tarjeta "Duración" → layout de dos columnas colapsa a una sola caja ancha**
- **Mockup:** `a3a-ctxrow` = flex con DOS tarjetas `flex:1` lado a lado (HTML 714-723): "La última vez / 4.320 kg" y "Duración / 52 min" (duración real de la sesión anterior).
- **Web:** sólo renderiza `lastVolumeLabel` en una única `.exec-v3-ctx` a ancho completo (`SessionStart.tsx:123-128`); no calcula ni muestra la duración de la última sesión (`execV3StartVM` sólo produce `lastVolumeLabel`).
- **RN:** idéntico problema — una sola caja `flex:1` dentro de una fila (`SessionStart.tsx:172-183`); `startData` sólo trae `lastVolumeLabel` (`ExecutorV3.tsx:731`).
- **Fix:** surfacing de la duración de la última sesión y render de la segunda tarjeta para restaurar el par a mitad de ancho; si no hay dato, ambas plataformas ya omiten la pieza — pero cuando existe, debe ir el par.

**[MAYOR] Racha semanal rediseñada: 7 dots de semana (Lun→Dom) vs 4 dots "3 de 4" del mockup, y tamaño 10px vs 16px**
- **Mockup:** `a3a-streak` con exactamente 4 `a3a-sd` de **16×16px** (`border-radius:50%`), apagado `#26262f` + `border:2px #33333f`; encendido = marca + `border-color color-mix(brand 55%,#000)` + anillo `0 0 0 3px brand 20%` (CSS 231-238). Copy "3 de 4".
- **Web:** `WeeklyStreakDots.tsx` pinta **7 dots** de estado semanal a **10px** (`h-2.5 w-2.5`, líneas 46-47); apagado `rgba(255,255,255,0.14)` sin borde; `done` = marca + anillo 3px pero SIN borde; agrega estado `today` (anillo hueco) que el mockup no tiene.
- **RN:** `WeekStreakDots.tsx` también **7 dots** a **10px** (rest 6px); `done` marca sólido SIN anillo ni borde (línea 72); pending `#2a2a34` plano.
- **Fix:** decisión de diseño (evolución E4.4 a semana completa). Si se conserva la semana, al menos subir el tamaño hacia 14-16px y devolver el borde/anillo del encendido para recuperar el peso visual del mockup. Confirmar con CEO si quiere el modelo "N de M" original.

**[MAYOR] Layout de la racha en WEB centrado, en vez de etiqueta-izquierda / dots-derecha**
- **Mockup:** etiqueta "Racha semanal" + conteo a la izquierda, dots empujados a la derecha con `margin-left:auto` (CSS 229-231).
- **Web:** `WeeklyStreakDots.tsx:36` usa `flex items-center justify-center` → todo CENTRADO en fila.
- **RN:** CORRECTO — `WeekStreakDots.tsx:42` usa `marginLeft:'auto'` en el grupo de dots (espeja el mockup). Sólo web diverge.
- **Fix (web):** cambiar `justify-center` por `justify-start` y dar `ml-auto` al contenedor de dots.

**[MAYOR] Posición vertical de la racha (web): flota en el cluster superior en vez de anclarse al fondo junto al CTA**
- **Mockup:** `a3a-streak` tiene `margin-top:auto` → la racha y el CTA quedan pegados al fondo como bloque (CSS 229).
- **Web:** el `mt-auto` está en el contenedor del CTA (`SessionStart.tsx:132`), NO en la racha → en pantallas altas la racha sube con el cluster superior y sólo el CTA queda abajo.
- **RN:** CORRECTO — spacer `flex:1` ANTES de la racha (`SessionStart.tsx:212`) ancla racha+CTA al fondo.
- **Fix (web):** mover el empuje (`mt-auto`) al bloque de la racha para que racha+CTA bajen juntos.

**[MAYOR] Color de texto y triángulo del CTA cambiado a blanco (+ text-shadow) en vez del verde oscuro del mockup**
- **Mockup:** `.a3a-juicy { color:#072100 }` y `.a3a-play` triángulo `border-color: … #072100` — texto/ícono verde muy oscuro sobre el botón (contraste "candy"). Sin text-shadow (CSS 82-90, 243-246).
- **Web:** `.exec-v3-juicy { color:#fff; text-shadow: 0 1px 0 rgba(0,0,0,.18) }` (globals 1468, 1472) y `.exec-v3-play` triángulo `#fff` (1616).
- **RN:** `JuicyButton` usa `exec.accentText` para label e ícono (línea 108, 243) = `#FFFFFF` en modo eva (`exec-theme.ts:116,131`).
- **Fix:** para acentos claros/verdes conviene texto oscuro tintado como el mockup (p. ej. derivar `accentText` = `color-mix(accent 20%, #000)` o el foreground del brand); si se mantiene blanco por seguridad de contraste en marcas oscuras, dejarlo documentado. El `text-shadow` añadido no está en el contrato — evaluarlo.

**[MAYOR] RN: fondo plano `#16161d` en vez del degradado radial cálido del contrato**
- **Mockup:** `.a3a-screen` fondo `radial-gradient(120% 80% at 50% -8%, #1c1c24 0%, #16161d 42%, #121218 100%)` — más claro arriba-centro, oscureciendo al fondo (CSS 57-61).
- **Web:** CORRECTO — `.exec-v3-start` replica el mismo degradado radial (globals 1483) y el root `[data-exec-v3]` también (1424-1425).
- **RN:** `SessionStart.tsx:74` usa `backgroundColor: s.appBg` = `#16161d` PLANO (`exec-theme.ts:66`); no hay `LinearGradient`. Se pierde el "warm glow" superior — probable origen del reporte "color de fondo distinto".
- **Fix (RN):** envolver la pantalla en `expo-linear-gradient` radial/aprox. (o `RadialGradient`) con los 3 stops `#1c1c24 → #16161d → #121218`.

**[MAYOR] RN: la línea de resumen no resalta "N ejercicios" en color de marca**
- **Mockup:** `<b>8 ejercicios</b>` con `.a3a-summary b { color: var(--brand) }` — el conteo va en marca (HTML 704, CSS 184).
- **Web:** CORRECTO — `<b className="text-[color:var(--exec-brand)]">{n} ejercicios</b>` (`SessionStart.tsx:102-104`).
- **RN:** `summaryLine` es un único `Text` sin segmento coloreado (`ExecutorV3.tsx:715`; render `SessionStart.tsx:128-130`) → todo el resumen va en gris.
- **Fix (RN):** partir la línea y envolver "N ejercicios" en un `<Text>` con `color: exec.accent`.

**[MAYOR] WEB: la línea de resumen usa tipografía MONOESPACIADA en vez de fuente de sistema con cifras tabulares**
- **Mockup:** `.a3a-summary.a3a-tnum` = fuente system-ui con `font-variant-numeric: tabular-nums` (sólo tabular, NO monospace) (CSS 79, 181).
- **Web:** `SessionStart.tsx:101` aplica `font-mono` (familia monoespaciada) a toda la línea → "8 ejercicios · 24 series" se ve monospace, alterando la textura tipográfica.
- **RN:** CORRECTO — `FONT.uiExtra` + `fontVariant:['tabular-nums']` (`SessionStart.tsx:128`), sin cambiar la familia.
- **Fix (web):** quitar `font-mono`, dejar `tabular-nums` (o `font-variant-numeric: tabular-nums`) manteniendo la familia display/ui.

### MENOR

**[MENOR] Altura del CTA 64px vs 66px del mockup (ambas plataformas)**
- Mockup `.a3a-startcta { height:66px }` (CSS 240). Web `.exec-v3-startcta { height:64px; min-height:60px }` (globals 1602-1603). RN `JuicyButton height={64}` (`SessionStart.tsx:238`). Diferencia consistente de 2px.

**[MENOR] Amplitud del "respiro" del CTA menor en web (scale 1.02 vs 1.035)**
- Mockup `@keyframes concept-a3a-breathe { 50% { scale:1.035 } }` a 2.4s (CSS 575, 612). Web `animate={{ scale:[1,1.02,1] }}` (`SessionStart.tsx:137`) — respira menos. RN CORRECTO 1.035 (`JuicyButton.tsx:76`) pero con ciclo 2.6s (1300ms×2) vs 2.4s del mockup.
- **Fix (web):** subir a `scale:[1,1.035,1]`.

**[MENOR] RN: radio del botón juicy 15px vs 16px del contrato**
- Mockup `.a3a-juicy { border-radius:16px }` (CSS 86). Web 16px (globals 1471). RN `borderRadius:15` en cara y barra de sombra (`JuicyButton.tsx:71,94`).

**[MENOR] RN: letter-spacing del label del CTA fijo 0.3px (mockup .04em ≈ 0.8px a 20px)**
- Mockup `.a3a-startcta { letter-spacing:.04em }` (CSS 240). Web `.04em` (globals 1609). RN `letterSpacing:0.3` (`JuicyButton.tsx:108`).

**[MENOR] RN: interlineado del título 36 vs 34 (line-height 1) del mockup**
- Mockup `.a3a-bigday { line-height:1 }` (=34px, CSS 179). Web `leading-none`. RN `lineHeight:36` (`SessionStart.tsx:98`).

**[MENOR] RN: fondo de la tarjeta de contexto `#15151c` vs `#17171f` del mockup, y valor 18px vs 15px**
- Mockup `.a3a-ctx { background:#17171f }`, `.v { font-size:15px }` (CSS 205, 208). Web CORRECTO (#17171f, 15px; globals 1581,1595). RN usa `surfaceSunken` `#15151c` y `fontSize:18` (`SessionStart.tsx:174,178`).

**[MENOR] RN: etiqueta de contexto (`.k`) en `#8f8f9c` vs `#7f7f8c` del mockup**
- Mockup `.a3a-ctx .k { color:#7f7f8c }` (CSS 207). Web CORRECTO. RN `textMuted` `#8f8f9c` (`SessionStart.tsx:175`).

**[MENOR] RN: nombre de ejercicio (`pname`) en `#f4f4f6` vs `#e8e8ee` del mockup**
- Mockup `.a3a-pname { color:#e8e8ee }` (CSS 195). Web CORRECTO (#e8e8ee, globals 1549). RN `s.text` `#f4f4f6` (`SessionStart.tsx:153`) — un pelo más brillante.

**[MENOR] RN: avatar de la nota es color sólido, no el degradado 135° del mockup (irrelevante hasta que la nota se active)**
- Mockup `.a3a-note .av { background: linear-gradient(135deg, brand, color-mix(brand 40%,#000)) }` (CSS 223-226). RN `backgroundColor: exec.accent` plano (`SessionStart.tsx:200`).

**[MENOR] Resumen web: peso 700 vs 800 del mockup y color `on-dark/80` vs `#cfcfd8`**
- Mockup `.a3a-summary { font-weight:800; color:#cfcfd8 }` (CSS 181-182). Web `font-bold` (700) + `text-on-dark/80` (`SessionStart.tsx:101`).

**[MENOR] RN: `padding-vertical` de la card del plan 4px vs 6px del mockup**
- Mockup `.a3a-plan { padding:6px 6px }` (CSS 186). Web `padding:6px` (globals 1520). RN `paddingVertical:4` (`SessionStart.tsx:135`).

---

## Cumple (fiel al contrato — NO re-tocar)

- **Fondo del Inicio (web):** degradado radial `#1c1c24→#16161d→#121218` idéntico al mockup (`globals.css:1483`; root 1424-1425). El reporte "fondo distinto" NO aplica a la web en esta pantalla.
- **Eyebrow (`a3a-eyb`):** 11px/800, `.16em`, uppercase, color de marca, `bg color-mix(brand 12%,#16161d)`, `border 1.5px color-mix(brand 30%)`, `radius 999`, `padding 5/12`. Web (`globals 1486-1498`) y RN (`SessionStart.tsx:80-95`) coinciden.
- **Título del día:** 34px / peso 900 / `letter-spacing:-.03em`. Web (`SessionStart.tsx:84`) y RN (98) fieles (salvo el line-height menor en RN).
- **Chips de contexto:** 12px/700, `radius 999`, `bg color-mix(brand 16%)`, `color color-mix(brand 82%,#fff)`, `border 1.5px color-mix(brand 34%)`; variante `is-plain` `#1c1c24`/`#b7b7c2`/`#33333f`. Web (`globals 1499-1515`) y RN (`SessionStart.tsx:103-125`) fieles.
- **Card del plan (`a3a-plan`):** `bg #1a1a22`, `border 2px #2a2a34`, `radius 18`, `padding 6`. Filas con `border-top 1.5px #24242e`, índice cuadrado 24×24 `radius 8` `bg #24242e` `#8f8f9c`, nombre 14/800, tag por tipo (strength=marca, cardio=`#4ade80`), "+N ejercicios más" 11/800 `#6f6f7c`. Web (`globals 1516-1578`) y RN (`SessionStart.tsx:133-168`) transcritos con precisión.
- **Botón juicy — geometría de profundidad:** `border 2px color-mix(accent 55%,#000)`, sombra dura inferior `0 5px 0 color-mix(accent 55%,#000)`, hundido `translateY(5)` al presionar. Web (`globals 1465-1479`) y RN (`JuicyButton.tsx` barra de sombra 5px + `translateY` en press) fieles al patrón "juicy".
- **Triángulo play + copy "EMPEZAR":** presente en ambas; geometría del triángulo web 9/15 idéntica al mockup (`globals 1611-1616`); font-size 20px y gap 12px correctos.
- **Racha (RN) — layout:** etiqueta+conteo a la izquierda, dots a la derecha con `marginLeft:auto`, y anclaje al fondo vía spacer `flex:1` — espeja el mockup (web NO, ver deltas).
- **Copy exacto:** "EMPEZAR", "Saltar al ejercicio", "La última vez", "+ N ejercicios más", "Racha semanal", eyebrow "Hoy · {día} {n}", resumen "N ejercicios · M series · ~min min" — coinciden con el contrato.
