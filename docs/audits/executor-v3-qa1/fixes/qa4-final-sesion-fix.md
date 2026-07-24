# QA4 — Final de sesión "UN VERDADERO DESASTRE" (fix)

Unidad `qa4-final-sesion`. Dueño de `SessionCompleteV3.tsx` (web + RN) y sus estilos. NO se tocó el WEC.

## Diagnóstico
El CEO vio la pantalla final SIN fondo, mezclada con el paso de cardio visible detrás (anillo, confetti,
stats superpuestos). Causa raíz: en QA1 el contenedor de la pantalla final se dejó `bg-transparent` para
"heredar el gradiente del root", pero la pantalla final es un **overlay `fixed` montado sobre el ejecutor
vivo** (el motor nunca se desmonta → el paso de sesión sigue renderizado detrás). Con fondo transparente,
todo lo de atrás traslucía. Esto además hacía imperceptible la coreografía (se veía "plana").

## Cambios

### 1. Fondo propio opaco (web)
`SessionCompleteV3.tsx` web: el contenedor sigue `fixed inset-0 z-[9999] overflow-y-auto` (z sobre
header/pager/barra Finalizar, que van z-40..z-70; el confetti sigue en zIndex 10000, por encima). Se quitó
`bg-transparent` y se pintó su **propio** gradiente radial cálido del contrato (`.a2-screen` de
`concepto-a-v2.html`): `radial-gradient(120% 80% at 50% -8%, #1c1c24 0%, #16161d 42%, #121218 100%)`, opaco
al 100%. Tapa por completo lo que hay debajo.

RN: ya estaba correcto — Modal opaco por defecto + `SafeAreaView` `backgroundColor: appBgDeep (#121218)` +
SVG `RadialGradient execFinalBg` (#1c1c24→#16161d→#121218) en `absoluteFill`. Verificado full-screen opaco.
Sin cambios necesarios en el fondo RN.

### 2. Coreografía de entrada (clima → stats)
La coreografía de dos fases YA existía y es correcta en ambas plataformas (fase 1 clima: título grande +
confetti denso si hubo PR; fase 2 stats con tickers, PR dorado, mapa, racha, CTAs). El motivo de que "se
saltara o quedara plana" era el fondo transparente que la volvía imperceptible. Con el fondo opaco la
coreografía se ve correctamente. `reduced-motion` arranca directo en `stats` (por diseño/accesibilidad).
Verificado que el efecto corre SIEMPRE al montar (`showCompleted && execV3Active` monta el componente →
`useEffect` dispara confetti + agenda `setPhase('stats')`). Sin cambios de lógica.

### 3. Las dos siluetas (mapa muscular) SIEMPRE presentes
Decisión del jefe: el mapa se muestra SIEMPRE. Antes iba tras `hasMuscleMap &&` → en días sin fuerza
(cardio/movilidad, como el screenshot del CEO) desaparecía por completo. Ahora la tarjeta se renderiza
siempre:
- **Con fuerza**: caption "Trabajado hoy" + regiones pintadas (Fuerte/Medio/Leve) + leyenda (comportamiento
  intacto).
- **Sin fuerza**: caption "Sin trabajo de fuerza hoy", siluetas en gris sutil (`opacity: 0.55`), y leyenda
  omitida (`showLegend={false}`) porque no hay niveles que rotular. `MuscleMapSvg` ya dibuja las dos
  siluetas frente/espalda en gris neutro cuando no hay regiones encendidas.

Prop nuevo `showLegend?: boolean` (default `true`) agregado a `MuscleMapSvg` web y RN — **aditivo**, el
default preserva byte-idéntico el V2 y el V3 normal. Solo el estado vacío del Final V3 pasa `false`.

### 4. Espejo RN
Mismos cambios de mapa-siempre + caption + `showLegend` aplicados a `SessionCompleteV3` RN y a
`MuscleMapSvg` RN. Fondo RN ya opaco (ver punto 1).

## Archivos tocados
- `apps/web/src/app/c/[coach_slug]/workout/[planId]/v3/SessionCompleteV3.tsx`
- `apps/web/src/app/c/[coach_slug]/workout/[planId]/MuscleMapSvg.tsx`
- `apps/mobile/components/alumno/workout/v3/SessionCompleteV3.tsx`
- `apps/mobile/components/alumno/workout/MuscleMapSvg.tsx`

## Reglas de oro respetadas
- Motor de guardado/drafts/cola INTOCABLE (no se tocó WEC ni handlers/payloads/Zod).
- V2 byte-idéntico (`WorkoutSummaryOverlay` intacto; `showLegend` default-true y `legendVariant` default
  `'ramp'` preservan V2).
- Dark-only; white-label intacto (el oro del PR sigue en `--exec-pr`/`exec.pr`, la marca en
  `--exec-brand`/`exec.accent`; el gradiente del fondo es el neutro del contrato, no re-teñido).
- Copy español latam con tildes.
- Espejo RN completo.
- Sin edits a globals.css (fondo pintado inline en el componente propio → cero contención con workers
  paralelos).

## tsc
- `pnpm --filter @eva/mobile exec tsc --noEmit` → **0 errores**.
- `pnpm --filter web exec tsc --noEmit` → mis 4 archivos: **0 errores** (verificado con grep). El comando
  falla por errores en `CardioStepV3.tsx`/`MobilityStepV3.tsx`/`RollerStepV3.tsx` (props `note`/`liveLabel`
  del contrato `ExecTypedMedia`), que son ediciones en vuelo de OTRO worker paralelo, ajenas a esta unidad.

## Pendientes
- Ninguno propio. El WEC no requirió cambios (el punto de montaje ya renderiza `SessionCompleteV3` con
  `fixed`/z alto correcto; el fix del fondo vive enteramente en el componente).
- Los errores de tsc web de `CardioStepV3/MobilityStepV3/RollerStepV3` los debe cerrar el worker de
  `ExecTypedMedia`.
