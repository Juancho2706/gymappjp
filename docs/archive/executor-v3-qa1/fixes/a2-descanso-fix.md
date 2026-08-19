# QA1 · Fixes Unidad A2 — Descanso / Interstitial

Rama: fix/executor-v3-qa1 · worktree executor-redesign. Sin commits (gate global).

## Deltas cerrados

### 04-descanso-interstitial

MAYOR
- **Anillo delgado → strokeWidth 24** (web + RN). Web: dos `<circle>` 14→24 (`RestInterstitialV3.tsx` web). RN: track y `AnimatedCircle` 14→24. `r=92` intacto ⇒ banda 24px, exterior r=104 al filo (calca la máscara del cónico).
- **Peek "mirador" asoma filas reales** (web + RN). Web: el cuerpo del plan se renderiza SIEMPRE (ya no gateado por `sheetOpen`); colapsado revela ~1-2 filas vía `.exec-v3-restsheet:not(.is-open) .exec-v3-restsheet-body { max-height:66px; overflow:hidden; mask fade }`, abierto `max-height:60dvh; overflow-y:auto`. RN: `PEEK_VISIBLE` 66→128.
- **Web peek: filas sstate en vez de ExecListMapV3.** Nuevas clases CSS `.exec-v3-srow/.exec-v3-sstate(.done/.now/.todo)/.exec-v3-snm/.exec-v3-ssub` portando el look del `PlanStateSquare` de RN (cuadro 20×20 done/now/todo + subtítulo "✓ d/t"/"ahora"/"pendiente"). `ExecListMapV3` NO se borró (sigue para "Ver todo"): solo se dejó de importar su valor en este archivo (se conserva el `type ExecListMapItem`). Un solo título "Plan completo" (se eliminó el doble encabezado del mapa).
- **RN confeti** en la micro-celebración: 8 piezas one-shot (`REST_CONFETTI`, colores de zona del mockup + marca) con keyframes Moti, off en reduced-motion. Espeja el `CONFETTI` de web.
- **RN latido del número** (breathe 2.6s): número envuelto en `MotiView` scale 1↔1.03 (1300ms x2), off en reduced-motion/done.
- **RN botón "Saltar" juicy**: `RestButton` primary ahora dibuja barra dura de 5px (`mixToBlack(accent,0.55)`) + hundido `translateY(5)` al presionar, cara de acento con borde oscurecido. Los -15/+15 quedan planos. Alineación de la fila preservada (barra absoluta, no empuja layout).

MENOR
- **RN fondo cálido**: `LinearGradient` `#1c1c24→#16161d→#121218` (locations 0/.42/1) como capa de fondo (aprox. del radial del mockup).
- **RN hexes del sheet** (`REST_HEX` dedicado): sheet bg `#1d1d26`, borde-top `#33333f`, handle `#45454f`, track anillo `#26262f`, divisor fila `#26262f`, cuadro todo `#26262f`/`#3a3a45`, subtítulo todo `#7f7f8c`. Ya no colapsan a tokens.
- **Confeti web 6→8** con colores de zona (`#facc15`/`#38bdf8`/`#fb923c`/`#f472b6` + marca).
- **Minimizar mismo lado**: RN pasa a arriba-izquierda (paridad con web).
- **±15s sin iconos** (web): se quitaron `Minus`/`Plus`; labels `−15s`/`+15s`. Saltar conserva `SkipForward` en ambos (ya consistente).
- **`#072100` → `var(--exec-brand-ink)`** (web): celly-b, botón Saltar y sstate.done. Nueva var en `[data-exec-v3]`: `--exec-brand-ink: color-mix(in srgb, var(--exec-brand) 30%, #000)` (tinta on-brand white-label). RN ya usaba `accentText`.
- **Estado done unificado** web↔RN: número `¡Listo!`, label `¡A entrenar!`, anillo mantiene el ACENTO (RN ya no vira a celebration).
- **Micro-animaciones de vida** (parcial): web pop del badge (`exec-v3-badgepop` 3.6s) + shimmer del nextmini (`exec-v3-shimmer` 3.2s) + pulse del punto now del peek; RN pop del badge (scale loop). 

### 12-responsive-pwa (delta 3 únicamente)
- `.exec-v3-rest-inner` ahora `overflow-y:auto`; `@media (max-height:700px)` → `justify-content:flex-start`, `gap:10px` y anillo a 168px. Evita recorte en iPhone SE / landscape.

### 09-estados-momentos (delta "ronda cerrada check doble")
- Web: banner "Ronda N lista" usa `CheckCheck` (strokeWidth 3) en vez de `Check` simple, igualando mockup y RN.

## Pendiente / diferido
- **Bob del sheet (mockup peek 4.2s), web y RN**: NO implementado. En web el transform del sheet lo controla framer-motion (drag/slide) y en RN el `sheetY` de Reanimated; una animación de bob pelearía con ese transform o exigiría un wrapper anidado. Bajo valor, riesgo sobre el gesto de arrastre → diferido.

## Archivos tocados
- apps/web/src/app/globals.css (bloques [data-exec-v3]: var --exec-brand-ink, rest-inner responsive, celly-b/badgepop, rb.is-skip, nextmini shimmer, peek srow + collapse)
- apps/web/src/app/c/[coach_slug]/workout/[planId]/v3/RestInterstitialV3.tsx
- apps/mobile/components/alumno/workout/v3/RestInterstitialV3.tsx
