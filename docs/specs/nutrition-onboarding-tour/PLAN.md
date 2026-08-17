# PLAN — Guía Viva (onboarding spotlight de Nutrición)

Referencia normativa: [SPEC](SPEC.md) + artifact «Guía Viva EVA» aprobado (motor demostrado
ahí en ~120 líneas). Política de ejecución del dueño: Fable orquesta/juzga; Opus implementa
guiado; Sonnet mecánico. Detalle por tarea en [TASKS](TASKS.md).

## Arquitectura

### 1. Motor web (`apps/web/src/components/nutrition-v2/tour/`)

- `tour-engine.tsx`: componente controlado `<TourOverlay steps active onEnd/>` que porta el
  motor probado del artifact: 4 paños + halo (transiciones 220-280ms, curva del DS), tarjeta
  con clamp+flip+scrollIntoView (D3), variante `dock` bajo `(max-width: 767px)`, focus trap,
  Esc=Saltar, `motion-reduce` apaga transiciones. Targets por `document.querySelector('[data-tour="x"]')`
  dentro del contenedor del tour (prop `scopeRef`), midiendo con `getBoundingClientRect` y
  re-midiendo en `resize`/`scroll` (captura) del scope.
- `tour-flags.ts`: `hasSeenTour(tourId, coachId)` / `markTour(...)` sobre localStorage con
  clave `eva.tour.<tourId>.v1.<coachId>`; SSR-safe (no toca window en server).
- `TourHelpButton.tsx`: el «?» (D2) con variantes `floating` (editor) e `inline` (hub);
  pulso `motion-safe` solo si `!hasSeenTour`.
- `tours.ts`: guiones cerrados de la SPEC (editor 8 / editor-móvil 6 / hub 6) tipados
  `{ target, icon, title, body }`, iconos de `/action-icons/` + `/food-icons/`.

### 2. Montaje web

- Editor: `QuickEditPlanView` monta `<TourHelpButton floating/>` + `<TourOverlay/>` SOLO en
  modo editor (`state.meta`), guion 8 pasos ≥768 y 6 pasos <768 (mismo breakpoint JS de la
  cinta). Auto-arranque en el primer montaje SIN flag y SIN `creation` (invariante SPEC).
  `data-tour` en: cinta, botón Metas, rail, primera franja, ⋮ del primer item, sección
  porciones, paleta, Publicar (cinta) / PublishBar (móvil).
- Hub: la página del hub monta el «?» inline junto al título (pestaña Alumnos) + overlay con
  el guion de 6; `data-tour` en tablist, stats, filtros, primera fila del roster, CTA nueva
  versión y el propio «?».

### 3. Motor y montaje RN (`apps/mobile/components/nutrition-v2/tour/`)

- `TourOverlay.tsx`: `Modal transparent` + registro de targets por contexto
  (`TourTargetsProvider` con `registerTarget(name, ref)`); medición `measureInWindow` al
  entrar a cada paso; 4 Views oscuras + halo; tarjeta SIEMPRE dock inferior con safe-area;
  back de Android = Saltar (`onRequestClose`); reduce-motion vía el helper existente del kit
  si lo hay (si no, `AccessibilityInfo.isReduceMotionEnabled`).
- `tour-flags.ts` sobre el storage que ya use el móvil (mirar cómo persisten los respaldos
  del quick-edit y usar el mismo módulo; clave idéntica a web).
- Montaje: `QuickEditMode` (editor, guion 6) y hub `index.tsx` (guion 6, «?» junto al título).
  Targets registrados en: mini-cinta, botón Metas, primera franja, botón agregar/stack,
  porciones, PublishBar; hub: tablist, stats, filtros, fila, CTA, «?».

### 4. Gates geométricos (D2/D3, bloqueantes)

`scripts/cabina-visual-check.mjs` suma, por cada ancho del harness y para ambos tours web:
- «?» sin solapes: rect del help vs rects de todo `button/a/input/select` visibles ⇒ 0
  intersecciones (tolerancia 0).
- Recorrido completo del tour: por CADA paso, `tarjeta ⊆ viewport` y `halo` visible; Saltar
  cierra; el flag simulado evita re-auto-arranque (localStorage seed + reload).
El harness gana `?tour=editor|hub` para montar el guion sin flag y un coachId fijo.

## Backend

Ninguno. Checklist de guardia idéntica a Cabina: `_actions/`, `_data/`, `services/`, SQL o
`app/api/` en el diff ⇒ tarea mal planteada, abortar y reportar.

## Verificación

- Local primero: harness + `cabina-visual-check` (asserts nuevos incluidos) en 5 anchos.
- Gates de siempre: `lint`, `typecheck`, `test`, `check:tokens`, boundaries, `tsc` mobile,
  `expo export --platform android`, `docs:check`.
- QA humano: preview (owner) + device Android (puede fundirse con el QA del paquete Familia N).

## Waves

| Wave | Contenido | Gate |
|---|---|---|
| G1 | Motor web + flags + «?» + guiones + stories harness | vitest tour + harness monta |
| G2 | Montaje editor + hub web + asserts D2/D3 en el visual check | visual check EXIT 0 |
| G3 | Motor + montajes RN | tsc mobile + expo export |
| G4 | Gates completos + docs (`CURRENT`/`MOBILE_PARITY`) + QA owner → entra al OTA acumulado vigente | todo verde |

G1→G2 secuenciales; G3 arranca tras G1 (guiones/flags compartidos por contrato, no por código).

## Qué NO hacer

- No usar driver.js ni ninguna lib de tour (decisión D1: motor propio ya probado).
- No tocar reducers, publish, ni la estructura de las superficies (solo `data-tour`/refs).
- No auto-arrancar el tour en `?from=` (creación) ni más de una vez por flag.
- No inventar copys: los guiones de la SPEC son cerrados.
