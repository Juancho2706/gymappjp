# QA1 · Ejecutor V3 — Cierre Unidad A4 (FINAL DE SESIÓN)

**Fecha:** 2026-07-22 · **Rama:** fix/executor-v3-qa1 · **Informe origen:** `docs/audits/executor-v3-qa1/06-final-sesion.md`
**Dueño de:** `SessionCompleteV3.tsx` (web + RN) + racha (`WeeklyStreakDots` web / `WeekStreakDots` RN).

## Deltas CERRADOS

### BLOCKER
- **B-1** (web) — Quitado `bg-[var(--ink-950)]` del contenedor raíz → `bg-transparent`; ahora hereda el degradado cálido del root `[data-exec-v3]` (`#1c1c24→#16161d→#121218`). Es el "color de fondo distinto" del CEO.
- **B-1 espejo RN / m-11** — Agregado degradado radial cálido real con `react-native-svg` (`RadialGradient` `#1c1c24→#16161d→#121218`, `cx 50% cy -8% r 120%`) como `absoluteFill` detrás del contenido; SafeAreaView pasa a `appBgDeep` como fallback. Antes era plano `#16161d`.

### MAYOR
- **M-2** (web) — StatTile, card PR y card mapa repintadas con literales cálidos del contrato: StatTile `#1a1a22` borde `1.5px #2a2a34`; mapa `#15151c` borde `1.5px #24242e`; base del gradiente PR `#16161d`/`#17171f` (antes `--ink-900`/`--border-inverse`/`white/[0.03]`).
- **M-3** (web+RN) — Radio 16px: StatTile/PR/mapa web `rounded-[16px]`; RN StatTile 14→16, mapa 18→16 (PR ya 16).
- **M-4** (web) — `GOLD` pasa de `#F4B740` hardcodeado a `var(--exec-pr)` (#f5c451); coherente con el PR-en-vivo y con RN. Se propaga a borde/gradiente/medalla/textos vía las template-strings existentes.
- **M-5** (RN) — "Volver al inicio" recupera chrome de botón: `#1c1c24`, borde `2px #2f2f3a`, radio 15, alto 52, texto `#e8e8ee` peso 800.
- **M-6** (RN) — Labels de stat: `uppercase`, peso 800 (`FONT.uiExtra`), 10px, `letterSpacing 0.8`, color `#7f7f8c`.
- **M-7** (RN) — Números de Duración/Volumen/Distancia/Series en BLANCO (`s.text`); el dorado queda reservado al PR.
- **M-8 / M-8b** (RN) — "Series" es ahora un TILE de la grilla (no fila full-width): grilla 2-col, Series como 3.er tile (fila 2) cuando hay volumen/distancia, o como 2.o tile si no. Tile bg `s.surface` (#1a1a22), no `surfaceSunken`.
- **M-9** (web+RN, decisión jefe) — Se mantiene la regla SEMANAL (7 dots Lun→Dom) pero con el ESTILO del mockup: dot 16px, borde 2px, `.on` = relleno de marca + borde oscurecido + glow `0 0 0 3px` marca@20% (web `box-shadow`; RN anillo exterior 22px marca@20% por falta de spread crisp). Web: dots empujados a la derecha (`ml-auto`) en vez de centrados. RN: fila suelta en la Final (`compact`, sin card contenedora).
- **M-10** (web+RN) — CTA principal "Compartir logro" 60px/17px (web `h-[60px] text-[17px]`; RN `height 60 fontSize 17`).

### MENOR
- **m-12** — Título 28px / `-0.02em` (web) y 28px / `-0.6` (RN); antes 30px.
- **m-14** (web) — Números de stat con peso 900 y `-0.03em` (`font-display font-black tracking-[-0.03em]` en vez de `eva-metric` 800/-0.01).
- **m-17** — Texto atenuado cálido: subtítulo `#a8a8b3`, labels de stat/mapa `#7f7f8c`, label de racha `#8f8f9c` (web); labels RN `#7f7f8c`.
- **m-18** (RN) — StatTile alineado a la izquierda (`flex-start`).
- **m-19** (RN) — Removida la medalla-héroe (círculo 64px dorado) sobre el título: fuera del contrato.

## PENDIENTES (no cerrados, con razón)
- **m-13** (web, etiqueta de día corta) — Se agregó la prop OPCIONAL `completionLabel` (default → `planTitle`, comportamiento V2 idéntico), pero CABLEARLA desde el host queda diferido: el emisor es `WorkoutExecutionClient.tsx`, que es motor de resiliencia y está FUERA de esta wave. En prod el título sigue mostrando `plan.title` hasta que se cablee.
- **m-15** (leyenda mapa "Fuerte/Medio/Leve") — Vive en `MuscleMapSvg.tsx`, componente COMPARTIDO web+RN que NO es propiedad de esta unidad; no se toca. Menor.
- **m-16** (breathe/pop/glow continuos) — Diferido: los tickers ya sustituyen el breathe; añadir `pop` de medalla / `glow` de músculo exigiría keyframes nuevos en el globals.css compartido (riesgo de colisión con otros workers en paralelo) para una ganancia menor/opcional.

## Archivos tocados
- `apps/web/src/app/c/[coach_slug]/workout/[planId]/v3/SessionCompleteV3.tsx`
- `apps/web/src/app/c/[coach_slug]/workout/[planId]/v3/WeeklyStreakDots.tsx`
- `apps/mobile/components/alumno/workout/v3/SessionCompleteV3.tsx`
- `apps/mobile/components/alumno/workout/v3/WeekStreakDots.tsx`

No se tocó `globals.css` (todos los valores cálidos/radios se aplicaron con arbitrary values inline en el componente, evitando ediciones al archivo compartido). No se tocó ningún archivo del motor de resiliencia.
