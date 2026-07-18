# Auditoria de bundle PWA (apps/web) — 2026-07-18

Alcance: peso de JavaScript de primera carga (First Load JS) de la PWA web, con foco en las
rutas calientes del alumno (`/c/[coach_slug]/*`). Objetivo: informe accionable. No se aplicaron
cambios de codigo (ver seccion "Quick-wins" para el motivo).

## Como se obtuvieron los numeros

- `@next/bundle-analyzer` NO esta instalado y `next.config.ts` no lo envuelve. La variable
  `ANALYZE=true` no tiene efecto en este repo.
- Next 16 corre el build con **Turbopack por defecto**, y la salida estandar de `next build`
  con Turbopack **ya no imprime las columnas de tamano / First Load JS** por ruta (solo el arbol
  de rutas). Por eso los tamanos se reconstruyeron desde el artefacto que Turbopack SI emite:
  `.next/diagnostics/route-bundle-stats.json` (generado con `next build --experimental-analyze`,
  el analizador nativo de Turbopack — no requiere dependencias nuevas).
- Cada tamano "raw" viene de `firstLoadUncompressedJsBytes`; el "gz" se calculo comprimiendo con
  gzip los chunks reales de `.next/static/chunks`. gzip es la referencia realista de transferencia.
- El build de type-check fallo por un error de TypeScript en `components/loaders/variants.tsx`
  (trabajo en vuelo de otro worker, no relacionado con el bundle). La **compilacion del bundle
  fue exitosa**; para obtener la tabla se corrio el build en el worktree con el type-check
  omitido de forma temporal, y `next.config.ts` quedo revertido a su estado original (verificado
  con `git diff` vacio).

## Baseline compartido (shared chunk)

- **Shared JS comun a las 120 rutas de pagina**: 19 chunks, **1329 KB raw / 410 KB gzip**.
  - El chunk mas grande del baseline es `react-dom` + Sentry (`0spc5ms6ov2v3.js`, 424 KB raw /
    **130 KB gz**). Verificado: NO contiene three.js (0 ocurrencias de `WebGLRenderer`).
- **Baseline del alumno** (chunks comunes a TODAS las rutas `/c/`): 30 chunks,
  **2021 KB raw / 600 KB gzip**. Este es el piso que paga incluso `/c/[coach_slug]/login` y
  `/c/[coach_slug]/suspended`. Contiene: framer-motion (via `ClientNav`), supabase-js, posthog,
  Sentry, react-dom y zod. 600 KB gz de piso en la ruta caliente movil es alto (la referencia
  saludable para PWA movil ronda 130-200 KB gz de First Load).

## Top 15 rutas por First Load JS

| # | Ruta | raw KB | gzip KB |
|---|------|-------:|--------:|
| 1 | `/coach/clients` | 3247 | 985 |
| 2 | `/coach/clients/[clientId]` | 3159 | 960 |
| 3 | `/coach/builder/[clientId]` | 2921 | 874 |
| 4 | `/coach/workout-programs/builder` | 2921 | 874 |
| 5 | **`/c/[coach_slug]/dashboard`** | 2614 | **786** |
| 6 | `/coach/clients/[clientId]/bodycomp` | 2612 | 784 |
| 7 | `/coach/settings` | 2574 | 780 |
| 8 | `/coach/nutrition-plans` | 2521 | 758 |
| 9 | **`/c/[coach_slug]/bodycomp`** | 2429 | **721** |
| 10 | `/coach/nutrition-plans/client/[clientId]` | 2422 | 734 |
| 11 | `/coach/nutrition-v2/[clientId]` | 2387 | 721 |
| 12 | **`/c/[coach_slug]/workout/[planId]`** | 2387 | **721** |
| 13 | `/coach/nutrition-plans/[templateId]/edit` | 2386 | 723 |
| 14 | `/coach/nutrition-plans/new` | 2386 | 723 |
| 15 | `/coach/settings/brand` | 2344 | 706 |

Rutas del alumno (todas, ordenadas): dashboard 786 · bodycomp 721 · workout 721 · nutrition 689 ·
nutrition-v2 671 · perfil 649 · nutrition-v2/scanner 639 · check-in 638 · login 620 ·
onboarding 610 · movimiento 610 · change-password 609 · nutrition/add 608 · exercises 608 ·
workout-history 602 · index 600 · suspended 600 (KB gz).

## Los 5 imports mas sospechosos (librerias pesadas en rutas calientes del alumno)

1. **recharts (import estatico) en `/c/[coach_slug]/dashboard`** —
   `_components/weight/WeightSparkline.tsx` y `_components/weight/WeightProgressChart.tsx` importan
   `recharts` con `import { Area, AreaChart, ... } from 'recharts'` sin `dynamic()`. Se cargan de
   forma ansiosa. El chunk recharts+d3 pesa **~86 KB gz** dentro del First Load del dashboard —
   solo para un sparkline de 72px y un area chart de peso. `WeightSparkline` ni siquiera necesita
   recharts (es una curva trivial).
2. **recharts (estatico) en `/c/[coach_slug]/bodycomp`** — `components/bodycomp/StudentBiaTrend.tsx`
   y `StudentIsakTrend.tsx` importan recharts eager. Mismo patron: ~85 KB gz de recharts+d3 en el
   First Load de otra ruta del alumno.
3. **framer-motion omnipresente** — 107 archivos lo importan, incluido `components/client/ClientNav.tsx`
   que vive en el layout del alumno (presente en TODAS las rutas `/c/`). Empuja framer-motion al
   baseline del alumno (parte de los 600 KB gz). No se usa `LazyMotion`/`m` para reducir el feature
   bundle. La ruta de workout entera (`RestTimer`, `IntervalTimer`, `Stopwatch`, `StepperExecution`,
   `LogSetForm`, etc.) tira framer-motion en ~15 componentes.
4. **zod en el cliente** — un chunk de **63 KB gz** (`1uwmn8rjvst45.js`, `ZodError` confirmado) viaja
   en el First Load del dashboard. zod es una libreria de validacion de servidor; 63 KB gz en el
   bundle del navegador del alumno es carga muerta si no valida input del cliente.
5. **Cero code-splitting a nivel de ruta en `/c/`** — `next/dynamic` aparece en 9 archivos (todos en
   landing / coach / enterprise) y en **cero** archivos del arbol del alumno. Ningun grafico ni widget
   pesado del PWA del alumno se difiere. Este es el multiplicador de fondo de los cuatro puntos
   anteriores.

### Sospechas clasicas que resultaron OK (sin accion)

- **jsPDF**: SIEMPRE via `await import('jspdf')` (dynamic) — `nutrition-exchange-pdf.ts`,
  `nutrition-day-pdf.ts`, `pdf/client-dossier-pdf.ts`, botones de reportes org. No esta en el bundle
  de cliente base. Correcto.
- **three.js (~600 KB)**: solo dynamic — `web-gl-shader` (landing) y `OnboardingThreeRibbonInner`
  (coach onboarding) via `dynamic()`. Verificado ausente del baseline. Correcto.
- **canvas-confetti**: dynamic (`import('canvas-confetti')`) en `AuraHero` y share cards. Correcto.
- **date-fns**: imports nombrados (`differenceInCalendarDays, format, parseISO`), tree-shakeable
  (v4 ESM). No es import de barril. Correcto.
- **Scanner nutrition-v2**: usa `BarcodeDetector` nativo — NO se bundlea zxing/quagga. Correcto.
- **lucide-react / recharts / framer-motion / lottie**: ya estan en
  `experimental.optimizePackageImports`, asi que los imports de barril se transforman a imports
  directos (los ~495 imports de lucide no inflan por barril).

## Top 5 recomendaciones (priorizadas por KB ahorrados en rutas del alumno)

1. **Sacar recharts del sparkline de peso del dashboard (~hasta 86 KB gz en la ruta mas caliente
   del alumno).** `WeightSparkline` dibuja una curva de 72px; reemplazar el `AreaChart` de recharts
   por un `<svg><polyline/>` + gradiente inline elimina recharts del widget por completo. Es el mayor
   ahorro sobre la ruta mas visitada. Cambia el render, requiere revision visual light/dark y
   white-label (usar `var(--sport-500)` como hoy).
2. **Diferir los graficos recharts restantes con `dynamic({ ssr: false })`** en `/c/dashboard`
   (`WeightProgressChart`) y `/c/bodycomp` (`StudentBiaTrend`, `StudentIsakTrend`). Requiere un
   wrapper `'use client'` (los padres actuales son server components, y `ssr:false` no se permite en
   RSC). Difiere ~85 KB gz de recharts+d3 fuera del First Load hacia on-view en dos rutas del alumno.
3. **Reducir framer-motion del baseline del alumno (600 KB gz de piso).** Adoptar `LazyMotion` con
   `domAnimation` + componentes `m.*` en lugar de `motion.*`, y/o migrar animaciones simples de
   `ClientNav` y transiciones estaticas a CSS. Es la palanca mas grande del baseline pero la mas
   amplia (107 archivos) — hacerlo por olas empezando por el layout/nav del alumno.
4. **Sacar zod del cliente (~hasta 63 KB gz en el dashboard).** Auditar que componente `'use client'`
   arrastra zod/`@eva/schemas` al chunk del dashboard; mover la validacion a server actions / evitar
   importar barriles de schemas desde cliente. La validacion de input de server actions no necesita
   viajar al navegador.
5. **Convencion de code-splitting para el PWA del alumno.** Hoy `/c/` tiene 0 `next/dynamic`.
   Establecer que todo grafico o widget pesado (charts, share-card modals, timers con animacion
   compleja) se cargue con `dynamic()`; esto ataca la causa de fondo y evita regresiones futuras del
   First Load del alumno.

## Quick-wins aplicados

**Ninguno.** Los tres candidatos de mayor valor (1, 2, 4 arriba) NO son swaps mecanicos y seguros:
- El sparkline SVG (rec. 1) es una reimplementacion de render, no un cambio de token — exige revision
  visual, no "trivial".
- El lazy-load de charts (rec. 2) cruza la frontera server/client (necesita un wrapper `'use client'`
  nuevo, porque `ssr:false` no se permite en Server Components) — no es mecanico.
- El gate pedido es "con tsc verde", y en este momento el arbol tiene ediciones en vuelo de otros
  workers (p.ej. `components/loaders/variants.tsx` ya rompe el type-check, y layouts de auth
  modificados en el worktree), asi que no se puede verificar `tsc` verde de forma confiable para
  aislar el efecto de un quick-win.

Siguiendo la regla "en duda -> informe", se dejaron los cambios como recomendaciones con instrucciones
exactas en lugar de aplicarlos a medias. Las recomendaciones 1, 2 y 4 son de bajo riesgo cuando el
arbol este limpio y son las de mayor retorno por KB en la ruta del alumno.
