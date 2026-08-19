# QA6 — Espejo RN del morph "Impulso" + labels izq/der por lado (web + RN)

Unidad `qa6-morph-rn-labels`. Coreografia del jefe transcrita fiel; motor de guardado INTOCABLE;
dark-only dentro del ejecutor; color = MARCA del coach resuelta (theme/brand-kit, jamas hardcodeado).

## 1. Morph RN (espejo del contrato)

Nuevo `components/alumno/workout/v3/session-morph.tsx`:

- `SessionMorphProvider` (montado en `app/alumno/(tabs)/_layout.tsx`, envuelve las Tabs) + hook
  `useSessionMorph()` con `startMorph({ planId, origin?, params? })`. El hook cae a un `router.push`
  plano si no hay provider (fail-safe).
- `SessionMorphOverlay`: overlay Reanimated dentro de un **`Modal` NATIVO** — la clave del handoff:
  el Modal flota SOBRE la transicion de navegacion del stack, asi el ejecutor V3 monta debajo y su
  `SessionIntro` SSR toma el relevo cuando el overlay se desvanece (mismo fondo + mismo avatar).
- Coreografia (contrato):
  - (2) clon del rect del trigger, con `exec.accent` (marca resuelta via `resolveExecTheme`), se
    expande a `inset:0` con radius→0 en **480ms** `cubic-bezier(.22,1,.36,1)`.
  - (3) desde **~300ms** el solido de marca cross-fadea al **tono splash** — la MISMA formula del
    `SessionIntro` (base `appBgSplash` + radial de acento 0.52 por capas) — y el logo del coach entra
    escalando **0.6→1** hasta un circulo **116px** al centro (posicion del avatar del splash).
  - (4) **"PREPARANDO TU SESIÓN"** entra con fade a los **~900ms** (11px/800, tracking .16em).
  - (5) `router.push` dispara al inicio de la fase 2 (~140ms), bajo el Modal; dismiss con fade a los
    ~820ms → handoff invisible al `SessionIntro` ya montado.
- Guard anti doble-tap (`busyRef`), red de seguridad (auto-desmonta a los 2.4s), error de navegacion →
  cierra el overlay sin dejar al usuario pegado.
- `prefers-reduced-motion` (via `useReducedMotion`): crossfade simple, sin expansion ni escala.

Triggers cableados (reemplazan el `router.push` directo por `startMorph`):
- Home — CTA "Empezar entrenamiento" (`components/alumno/home/HeroSection.tsx` → `WorkoutHero`):
  **rect real medido** (`measureMorphOrigin` + ref-wrapper `collapsable={false}`) → el clon nace exacto
  del boton.
- Tab entreno — `TodayHero` CTA (`app/alumno/(tabs)/workout.tsx`): rect real medido.
- Day-cards: home (`ActiveProgramSection`) y tab entreno (`renderPlan`) → `startMorph` sin origin.

### DELTA anotado (version digna simplificada, autorizada por contrato)
- **Day-cards** caen a un **origen sintetico centrado-bajo** (radial desde el centro del CTA) con los
  MISMOS tiempos/curvas — no miden su rect (medir cada card anidada en FlatList/secciones es fragil y
  rompe reglas de hooks). Los dos CTA "Empezar entrenamiento" (home/entreno) SI hacen el rect-morph
  exacto, que es el trigger primario nombrado en el contrato.
- **Fase 1** (fade del texto del trigger + scale 1.02 del boton): omitida; el overlay abre directo en
  fase 2. En RN el texto vive dentro del `Button` DS y animarlo por-instancia no aporta al handoff.
- El avatar del overlay queda a **centro exacto** de pantalla; el del `SessionIntro` va un poco mas
  arriba (lleva el titulo del dia debajo). El crossfade del tono splash enmascara el micro-salto de Y;
  el logo/circulo (116px) coincide 1:1.
- El anillo conico giratorio + halo latiente del `SessionIntro` NO se replican en el overlay (aparecen
  al hacer handoff); el avatar en si es identico.

## 2. Logo del coach en el splash RN

**Ya estaba implementado en esta rama**: `SessionIntro` renderiza `coachLogoUrl` (expo-image, circulo,
`contentFit="cover"`) con fallback a la inicial, y `ExecutorV3` le pasa `branding?.logoUrl`. El overlay
del morph usa EXACTAMENTE el mismo `branding?.logoUrl` + inicial (`displayName`) para que el handoff sea
pixel-identico. Verificado; sin cambios necesarios.

## 3. Labels por lado (izq/der)

Screenshot CEO: fila de hold `per_side` con dos inputs "60 | 60" sin señal de cual lado es cual (el
placeholder "izq"/"der" desaparece al cargar valores).

- **Web** (`LogSetForm.tsx`, fila tipada `mode==='mobility' && perSide`): cada input queda envuelto en
  un `<label>` con una etiqueta CHICA encima — **"Izq" / "Der"**, `10px / font-extrabold / uppercase /
  tracking .06em / #7f7f8c` (Tailwind inline, sin tocar globals.css). Placeholder unificado a "seg".
  El grid pasa a `items-end` **solo** en `perSide` para que el numero de serie y el boton de submit
  alineen con el borde inferior de los inputs (otros modos intactos: `items-center`). Presentacion pura:
  `name`/`metadata`/motor sin cambios.
- **RN**: la fila activa `per_side` **ya** rotula cada input via `FieldBox` (label arriba) con las
  etiquetas de `typedKeypadFields`: **"Hold izq." / "Hold der."**. Cubre el "cual es cual" del screenshot.
  Se deja tal cual (cambiar el label del engine arrastraria tambien las pestañas del keypad); nota de
  unificacion: web usa "Izq/Der" cortos por el ancho de columna, RN "Hold izq./Hold der." descriptivos
  — ambos small/uppercase/atenuado. Las filas logueadas RN muestran el total `actual_hold_sec` (diseño
  previo, fuera de alcance de este fix).

## Verificacion
- `pnpm --filter @eva/mobile exec tsc --noEmit` → **exit 0**.
- `pnpm --filter web exec tsc --noEmit` → **exit 0**.
- Sin commits (por instruccion).

## Archivos tocados
- NEW `apps/mobile/components/alumno/workout/v3/session-morph.tsx`
- `apps/mobile/app/alumno/(tabs)/_layout.tsx` (provider)
- `apps/mobile/app/alumno/(tabs)/home.tsx` (triggers → startMorph)
- `apps/mobile/app/alumno/(tabs)/workout.tsx` (hero + day-cards → startMorph)
- `apps/mobile/components/alumno/home/HeroSection.tsx` (rect medido del CTA)
- `apps/web/src/app/c/[coach_slug]/workout/[planId]/LogSetForm.tsx` (labels izq/der + align)
