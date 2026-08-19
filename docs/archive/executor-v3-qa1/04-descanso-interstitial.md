# QA1 · Fidelidad visual — Descanso (interstitial)

**Unidad:** 04-descanso-interstitial
**Mockup (contrato):** `docs/research/executor-redesign/mockups/concepto-a-v3-core.html` · sección **4 · DESCANSO** (`.a3a-rest`, líneas HTML 861-935; CSS 405-489, animaciones 567-651)
**Web:** `apps/web/src/app/c/[coach_slug]/workout/[planId]/v3/RestInterstitialV3.tsx` + `apps/web/src/app/globals.css` (`[data-exec-v3] .exec-v3-rest*`, líneas 2441-3065) + `ExecListMapV3.tsx` (peek)
**RN:** `apps/mobile/components/alumno/workout/v3/RestInterstitialV3.tsx` (+ `JuicyButton.tsx`, `exec-theme.ts`)

## Veredicto (2 líneas)
La **web** es de altísima fidelidad en superficies y hexes (fondo, celly, anillo, botones, tarjeta SIGUIENTE y sheet clavan el contrato), pero pierde la esencia del "mirador": el peek colapsado **no asoma ninguna fila** del plan y, al abrirlo, usa el mapa numerado (`ExecListMapV3`) en vez de las filas `sstate` del mockup. La **RN** clava justamente esas filas del peek (done/now/todo idénticas), pero arrastra varias faltas de animación e identidad: **sin confeti**, **sin latido del número**, **botón Saltar no-juicy** (sin la sombra dura de 5px) y superficies aplanadas a tokens (fondo sin gradiente, handle y track del anillo más oscuros). El anillo es ~40% más delgado que el contrato en **ambas** plataformas.

---

## Deltas

### BLOCKER
Ninguno. La identidad base (fondo cálido, anillo cónico con número gigante, celly "+1 serie", botones, sheet "Plan completo") está presente y reconocible en ambas plataformas; no hay restos del ejecutor viejo dentro del componente interstitial (el estado minimizado cae a la barra compacta del `RestTimer`, que es la fuente única del conteo — decisión de arquitectura, no un resto visual).

### MAYOR

**[MAYOR] Anillo ~40% más delgado y algo más chico que el contrato (web + RN).**
Mockup: banda del anillo ≈ **24px** y borde exterior al filo de la caja (radio 104 de 208).
`.a3a-ring` conic-gradient con `mask: radial-gradient(closest-side, transparent 76%, #000 77%)` ⇒ anillo visible de r≈79.5 a r=104 (banda 24.5px), líneas 424-430.
Web: `RING_R=92`, `strokeWidth="14"` en viewBox 208 ⇒ banda **14px**, exterior r=99 (5px de aire al borde) — `RestInterstitialV3.tsx:98,249,256` y CSS 2739-2756.
RN: `RING_R=92`, `strokeWidth={14}` idéntico — `RestInterstitialV3.tsx:76,269,274`.
Además el arco usa `strokeLinecap="round"` (extremos redondeados) vs los cortes planos del cónico. La delgadez es visible al ojo: el número gigante domina y el anillo se ve "flaco".
**Fix:** subir `strokeWidth` de 14 → **~24** (mantener `r=92` ⇒ exterior r=104, interior r=80, calca la máscara). Opcional exactitud: `strokeLinecap="butt"` para bordes planos como el cónico. Aplicar en web y RN.

**[MAYOR] El peek "mirador" no asoma ninguna fila del plan colapsado (web + RN).**
Mockup: la hoja tiene alto natural ≈160px y `transform: translateY(58px)` (línea 467) ⇒ **asoman handle + "Plan completo 2/8" + ~1-2 filas** (Press banca ✓, Press inclinado ahora). Es el titular del concepto: "El descanso es un mirador… ves toda la sesión" / "Estados de un vistazo" (bullets 931-932).
Web: colapsado sólo renderiza el `exec-v3-restsheet-grab` (handle + encabezado); el cuerpo con filas se monta **sólo** con `sheetOpen` — `RestInterstitialV3.tsx:359-378`. Cero filas asomando.
RN: `PEEK_VISIBLE = 66` (`RestInterstitialV3.tsx:81`) ⇒ colapsado revela sólo handle + encabezado (~66px); las filas quedan bajo el pliegue.
**Fix RN:** subir `PEEK_VISIBLE` a ~120-140 para que asomen 1-2 filas. **Fix web:** renderizar el cuerpo del plan también en estado colapsado (o las primeras N filas) y fijar una altura colapsada que deje ver ~1-2 filas detrás del encabezado.

**[MAYOR] Web: las filas del peek usan el mapa numerado, no las filas `sstate` del mockup.**
Mockup `.a3a-srow` (473-488): cuadro de estado 20×20 (`sstate` done=marca+check / now=aro+punto pulsante / todo=gris) + nombre + subtítulo textual **"✓ 4/4" / "ahora" / "pendiente"**; la fila `is-now` se resalta con fondo `color-mix(brand 10%)`.
Web reusa `ExecListMapV3` (`RestInterstitialV3.tsx:376`): índice numerado 24×24, dots por-serie, count "d/t", badge "AHORA" y flecha `ArrowLeftRight` — CSS 2325-2410. Es otro lenguaje visual (más "índice de navegación" que "estados de un vistazo").
RN **sí** clava el contrato: `PlanStateSquare` (líneas 495-512) reproduce done/now/todo exactos + subtítulos "✓ d/t"/"ahora"/"pendiente" + resalte `is-now` — FIEL.
**Fix web:** en el sheet del descanso, renderizar filas al estilo `a3a-srow` (cuadro sstate + subtítulo textual) en vez de `ExecListMapV3`, o portar el look de `PlanStateSquare` de RN. (El mapa numerado puede quedarse para la vista "Ver todo" del stepper; el peek del descanso debe usar el diseño del mockup.)

**[MAYOR] RN: micro-celebración sin confeti.**
Mockup: la celly va envuelta en `.a3a-confetti` con 8 `.a3a-conf` (HTML 871-876; CSS 421-422, 597-605) — bullet "confetti CSS" (933).
Web: 6 partículas one-shot al montar — `RestInterstitialV3.tsx:101-108,220-237` + CSS 2534-2566 (traducción correcta a la app real: un pulso, no loop de demo).
RN: el bloque `data.celebrate` (líneas 242-263) sólo anima el chip (spring); **no dibuja partículas**. Falta el confeti.
**Fix RN:** agregar una capa de confeti (p.ej. `MotiView`s con posiciones fijas espejando el array `CONFETTI` de web) alrededor del chip, one-shot, apagada en reduced-motion.

**[MAYOR] RN: el número gigante no "respira".**
Mockup: `.a3a-bignum` con `animation: concept-a3a-breathe 2.6s` (scale 1↔1.035, líneas 576, 612) — bullet "el número del anillo respirando" (933).
Web: `.exec-v3-bignum:not(.is-done)` con `exec-v3-breathe 2.6s` — CSS 2775-2783. FIEL.
RN: el `Text` del número (líneas 284-289) es estático, sin `MotiView` de latido.
**Fix RN:** envolver el número en un `MotiView` con `scale 1↔1.03` loop 2.6s, apagado en `reducedMotion`.

**[MAYOR] RN: botón "Saltar" no es juicy (sin sombra dura de 5px).**
Mockup `.a3a-rb.skip` (441): cara acento + `border color-mix(brand 55%, #000)` + `box-shadow: 0 5px 0 0 color-mix(brand 55%, #000)` (barra sólida inferior) + hundido al presionar.
Web `.exec-v3-rb.is-skip` (2817-2826): calca borde, sombra `0 5px 0` y `:active { translateY(4px) }`. FIEL.
RN `RestButton` primary (líneas 407-448): `borderColor: hexToRgba(accent, 0.6)` (acento translúcido, no oscurecido) + **sin** barra de sombra + press = `scale(0.96)`. No usa `JuicyButton` (que sí implementa la barra de 5px + hundido, `JuicyButton.tsx:68-72,80`).
**Fix RN:** usar `JuicyButton` para "Saltar" (o replicar su barra `DEPTH=5` + borde `mixToBlack(accent,0.55)` + hundido `translateY`), conservando `flex:1`, alto 54, radio 15.

### MENOR

**[MENOR] RN: fondo plano `#16161d` en vez del gradiente radial cálido.**
Mockup screen bg: `radial-gradient(120% 80% at 50% -8%, #1c1c24, #16161d 42%, #121218)` (línea 59). Web lo hereda vía base `[data-exec-v3]` (globals 1418-1425) — FIEL. RN: `backgroundColor: s.appBg` = `#16161d` plano (`RestInterstitialV3.tsx:181`; `exec-theme.ts:66`). Pierde el viñeteado/calidez superior.
**Fix RN:** usar un `LinearGradient`/radial (o al menos degradado vertical `#1c1c24`→`#16161d`→`#121218`) como fondo del overlay.

**[MENOR] RN: superficies del sheet y detalles fuera de hex por colapsar a tokens.**
- Sheet bg: RN `s.surface` = `#1a1a22` vs mockup `#1d1d26` (462) — web `#1d1d26` ✓.
- Handle: RN `s.borderStrong` = `#2f2f3a` vs mockup `#45454f` (469, notablemente más claro) — web `#45454f` ✓.
- Track del anillo: RN `s.border` = `#2a2a34` vs mockup `#26262f` (427) — web `#26262f` ✓.
- Cuadro `todo`: RN bg `#1c1c24`/borde `#2f2f3a` vs mockup bg `#26262f`/inset `#3a3a45` (481).
- Divisor de fila: RN `s.borderSubtle` = `#24242e` vs mockup `#26262f` (473).
- Subtítulo `todo`: RN `s.textDim` = `#6f6f7c` vs mockup `#7f7f8c` (488).
- Borde-top del sheet: RN `s.borderStrong` = `#2f2f3a` vs mockup `#33333f` (464) — web `#33333f` ✓.
(Referencias RN: `RestInterstitialV3.tsx:345-347,365,269,382,511`; `exec-theme.ts:65-78`.)
**Fix RN:** introducir literales dedicados para el sheet del descanso (bg `#1d1d26`, handle `#45454f`, track anillo `#26262f`, todo `#26262f`/`#3a3a45`) o añadir esos tokens a `EXEC_SURFACE`.

**[MENOR] Micro-animaciones de "vida" ausentes en ambas plataformas.**
Mockup: badge `.b` con pop loop (`concept-a3a-pop 3.6s`, línea 580); `.a3a-nextmini::after` shimmer (`3.2s`, 570); `.a3a-sheet` bob (`concept-a3a-peek 4.2s`, 583). Ni web ni RN reproducen estas tres (web sólo tiene el `cellypop` de montaje; el shimmer del nextmini no está — CSS 2842-2851 sin `::after` animado). Son adornos sutiles.
**Fix:** opcional — añadir shimmer al `nextmini` (o dejarlo, pues ahí va media real), pop del badge y bob leve del sheet, todos apagados en reduced-motion.

**[MENOR] Confeti: cantidad y colores.**
Mockup: 8 piezas con colores de zona (brand, `--z3` #facc15, `--z1` #38bdf8, `--z4` #fb923c, #f472b6…) (598-605). Web: 6 piezas brand/celebration/recovery/#f472b6 (`RestInterstitialV3.tsx:101-108`). Diferencia menor de riqueza cromática.
**Fix web:** subir a 8 piezas y sumar algún tono de zona para más variedad.

**[MENOR] Botón minimizar: existe (no está en el mockup) y difiere de lado entre plataformas.**
El mockup de descanso no tiene header ni botón. Web añade "minimizar" **arriba-izquierda** (`RestInterstitialV3.tsx:180-187`, chevron); RN lo pone **arriba-derecha** (`RestInterstitialV3.tsx:190-201`). Control necesario en la app real, pero inconsistente entre web y RN.
**Fix:** unificar el lado (sugerido: arriba-izquierda, para no chocar con la tuerca de ajustes que en otras pantallas va a la derecha).

**[MENOR] Botones ±15s enriquecidos con iconos.**
Mockup: texto puro "-15s" / "+15s" y "Saltar" (890-892). Web/RN agregan iconos `Minus`/`Plus` + "15s" y `SkipForward` + "Saltar" (`web 284-296`, `RN 298-300`). Enriquecimiento aceptable, leve desviación del contrato textual.

**[MENOR] Web hardcodea `#072100` en la marca-check de la celly y en el texto de "Saltar".**
Mockup (marca verde) usa `#072100` (419, 441). Web fija `#072100` (`globals 2532, 2818`), que sólo luce bien con marcas verdosas; en white-label no-verde el texto quedaría verde-oscuro sobre acento ajeno. RN usa `exec.accentText` (theme-aware, `RestInterstitialV3.tsx:257,299,446`) — más correcto para white-label aunque se aparte del literal del mockup.
**Fix web:** usar el foreground del tema (`--exec-accent-text` o equivalente) en vez de `#072100` fijo.

**[MENOR] Estado "terminado" (0s) inconsistente web↔RN (no está en el mockup).**
Web: número → "¡Listo!" (brand) y label "A entrenar" (`RestInterstitialV3.tsx:264-269`). RN: número queda "0:00" y label "¡A entrenar!" (`RestInterstitialV3.tsx:288,291`); además el anillo RN vira a `exec.celebration` en done (línea 276) mientras el web mantiene el acento. El mockup no define done. Alinear el copy y el color del anillo entre plataformas.

### INFORMATIVO (adiciones intencionales, no regresiones)
- **Mensaje del coach** bajo la tarjeta SIGUIENTE (`exec-v3-nextcoach` / `coachNote`) — no está en la tarjeta del mockup core; es feature deliberada (E3.x). No es delta de fidelidad.
- **Contexto de ronda cerrada (E3.5)** — banner "Ronda N lista" + dots reemplazando la celly cuando el descanso cierra una ronda de superserie. Pertenece a `concepto-a-v32-momentos` (fuera del core rest); implementado consistente en web (`exec-v3-roundban`, CSS 2902-2994) y RN (`ClosedRoundDot`, líneas 455-493). No auditado contra el core.

---

## Cumple (fiel — no re-tocar)

- **Fondo web:** gradiente radial cálido del mockup calcado (base `[data-exec-v3]`, globals 1424-1425). El overlay `.exec-v3-rest` lo hereda en móvil (lleva `data-exec-v3`).
- **Celly "+1 serie":** bg `color-mix(brand 14%, #16161d)`, borde `2px color-mix(brand 34%)`, `padding 8px 16px`, `radius 999`, `13px/800`, badge 22×22 acento + check `#072100` — web (2511-2533) y RN (líneas 255-260) fieles.
- **Copys exactos:** "Serie cerrada", "+1 serie · vas volando", "Descanso", "Plan completo", "Siguiente", conteo "d / t" — coinciden en ambos.
- **Número gigante:** 56px / 900 / `-.04em` / line-height 1, tabular — web `clamp(40,13vw,56)` (2765-2770), RN 56 fijo. Etiqueta "Descanso" 11px/800/`.16em`/uppercase/`#8f8f9c` — fiel.
- **Botones descanso (geometría):** `flex:1`, alto 54, radio 15, `15px/800`, bg `#1c1c24`, borde `2px #2f2f3a` — web (2799-2812) y RN (líneas 431-443) fieles. **Saltar juicy en web** (bg brand, borde `color-mix 55% #000`, `box-shadow 0 5px 0`, hundido) — calcado.
- **Tarjeta SIGUIENTE:** bg `#1a1a22`, borde `2px #2f2f3a`, radio 18, padding 11, mini 58×58 radio 12 (web con gradiente `160deg #23232c→#17171f` + borde `1.5px #34343f`), eyebrow 10px brand / título 16px/900 / prescripción 12px/700 `#a8a8b3` — fiel en ambos.
- **Sheet (web):** bg `#1d1d26`, borde-top `2px #33333f`, radio `22 22 0 0`, `box-shadow 0 -18px 40px -18px`, handle 40×5 `#45454f`, encabezado "Plan completo"/count 14px-900 / 11px-800 `#8f8f9c` — calcado (3004-3061).
- **Filas del peek RN:** `PlanStateSquare` done (acento+check) / now (aro `color-mix 25%` + punto) / todo (gris + borde) y subtítulos "✓ d/t"/"ahora"/"pendiente" + resalte `is-now` — clavan `a3a-srow` del mockup (líneas 376-401, 495-512).
- **Motor único:** el interstitial NO corre un timer propio; consume `timeLeft/total/done` del `RestTimer`/`RestTimerEngine` y la fracción del anillo deriva de ahí (`web 149-150`, `RN 116-124`). Arquitectura correcta.
- **Confeti como pulso (web):** one-shot 1.5s al montar (no loop de demo) — traducción correcta a la app real.
- **Reduced-motion:** ambos respetan la preferencia (confeti/latido/springs → fade o estático).
