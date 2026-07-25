# QA6 — Morph loader WEB "Impulso" (unidad qa6-morph-web)

Puente visual efímero dashboard→ejecutor. Al tocar un trigger, se tiñe de MARCA y expande a pantalla
completa, cruza al tono del splash V3 y muestra el logo del coach en la posición del avatar, mientras
el App Router hace el swap y el splash SSR (SessionIntro) toma el relevo (handoff invisible).

## Archivos

- **Nuevo** `apps/web/src/lib/workout/exec-launch-brand.ts` — `resolveLaunchBrand(el)`: sube por el DOM
  al wrapper `/c` (`data-logo-url` / `data-brand-name`) y resuelve LOGO real + inicial. `BRAND_APP_ICON`
  (ícono EVA de respaldo) se trata como "sin logo" → cae a la inicial, igual que el splash.
- **Nuevo** `apps/web/src/app/c/[coach_slug]/dashboard/_components/launch/WorkoutLaunchMorph.tsx` —
  hook reutilizable `useWorkoutLaunch()` → `{ launch, morph }`. Portal a `<body>`, z-index 100000,
  framer-motion, `pointer-events:none`. Coreografía completa del contrato: fade del texto del trigger
  (120 ms, CSS) → clon del rect expandiendo a inset:0 y radio→0 en 480 ms `cubic-bezier(.22,1,.36,1)`
  → desde ~300 ms crossfade al tono splash + logo escalando 0.6→1 → "Preparando tu sesión" a ~900 ms.
  `router.push` dispara al inicio de la fase 2. Guard anti doble-tap. Error/nav fallida → revert con
  fade + `toast.error`. `prefers-reduced-motion` → crossfade simple sin expansión.
- `globals.css` — (1) `.exec-v3-splash-av` gana `overflow:hidden` + regla `.exec-v3-splash-av-img`
  para el logo del coach en el splash; (2) bloque `.exec-morph-*` nuevo: fondo copiado byte a byte de
  `.exec-v3-splash` / `::after` / `.exec-v3-splash-av`, columna que replica el ritmo vertical del splash
  (avatar+título+prep) para alinear el logo con el avatar SSR, y `[data-exec-morphing]` (fade+scale del
  trigger, gateado a `prefers-reduced-motion: no-preference`).
- `v3/SessionIntro.tsx` — el avatar muestra el LOGO del coach si existe (resuelto en cliente vía
  `resolveLaunchBrand`, sin tocar el motor `WorkoutExecutionClient`); fallback a la inicial como hoy.
- `hero/WorkoutHeroCard.tsx` — CTA "Empezar entrenamiento"/"Continuar"/"Ver registro": `onClick`
  intercepta (`preventDefault` + `launch`) y navega al MISMO `href`. `<Link>` conserva prefetch/fallback.
- `program/WorkoutPlanCard.tsx` — day-cards (`<Link>`): mismo morph desde el rect de la card. El caso
  `doneOtherDay` (abre sheet, no navega) queda intacto.

## Contrato / reglas

- COLOR = `--exec-brand: var(--theme-primary)` inline en el overlay (misma fórmula que el splash,
  white-label safe; `--theme-primary` vive en `:root` global, resuelve aun portaleado a `<body>`).
- Motor de guardado y rutas de navegación INTOCADOS (sólo se intercepta el click para animar).
- Dark-only NO se filtra al dashboard: el overlay es efímero y no toca el tema de la página.
- Prefetch del route: cubierto por el auto-prefetch de `<Link>` en viewport (ambos triggers son Links).
- V2 byte-idéntico (no se tocó ninguna ruta V2). RN no tocado (otro worker).

## Verificación

- `pnpm --filter web exec tsc --noEmit` → **exit 0**.
- `pnpm --filter @eva/mobile exec tsc --noEmit` → **exit 0**.

## Notas / handoff

- Handoff: el morph termina con el logo en scale 1; SessionIntro (SSR) reanima su avatar desde
  scale 0.3 (comportamiento previo del splash, no tocado) → puede haber un micro-pop del avatar. El
  FONDO es idéntico (invisible) y el contenido del avatar (logo) coincide. Suavizarlo requeriría un
  flag para saltar la reanimación del splash cuando se llega por morph (no incluido; fuera de alcance).
- El clon usa el tono de marca canónico (`--theme-primary`), no el `--cta-fill`/sport exacto del botón
  hero; diferencia mínima y on-contract ("color = la MARCA del coach resuelta").
