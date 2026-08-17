# SPEC — Sello EVA v2: fondo por defecto «Horizonte B» (web + PWA + RN)

- **Origen:** decisión del dueño (2026-08-17) sobre el artifact «Variaciones del Sello»
  (`dcdab0a7-3308-4664-8209-d95394918ebc`, versión finalistas + remixes): gana el remix
  **B — Horizonte sin rejilla** (blobs del par de marca derivado, animados a la deriva +
  grano crosshatch; SIN grilla). El artifact es la referencia normativa visual (valores
  exactos de capas, alphas por tema y animación).
- **Rama:** `rnmobiledenuevo`. **Cero dependencias nuevas. Cero backend.**

## Decisiones

**D1 — B es el fondo por defecto de TODA la app logueada** (web coach, área alumno/PWA y
RN coach+alumno). Composición: dos blobs (primario de marca + **secundario derivado**) a la
deriva + grano. La grilla 40×40 actual del RN **se retira**.

**D2 — Excepciones (NO llevan B):**
- Pre-auth completo: landing, `/login`, `/c/*/login`, `/e/*/login`, registro, reset,
  código de alumno y la familia de entrada RN (conservan sus fondos actuales — la entrada
  ya tiene identidad propia).
- Overlays de trabajo denso a pantalla completa (editor de nutrición, builders): fondo
  `surface-app` + **solo grano** (sin blobs — el tinte no compite con datos). El grano ahí
  es una capa estática local.
- Sheets, modales, popovers, PDFs/print y capturas de export: superficies sólidas, sin sello.
- **Chrome del shell (regla del dueño 2026-08-17): topbar y sidebar desktop conservan su
  superficie opaca `var(--surface-app)` tal como hoy** (`CoachTopBar.tsx` y el `aside` de
  `CoachSidebar.tsx`) — blanco en claro, oscuro en dark, SIN sello detrás ni translucidez
  nueva. El sello vive solo en el lienzo de contenido; el wrapper del contenido no debe
  pintar un fondo opaco que lo tape. La pill-nav móvil translúcida (74% + backdrop-blur)
  queda como está: el blur difumina los blobs detrás y mantiene legibilidad solo.

**D3 — El par sale del TEMA del coach (regla del dueño 2026-08-17: «cada tema debe tener
su par»).** Fuente de verdad del secundario, en orden:
1. `secondaryColor` del tema de marca RESUELTO — los 14 presets curados de
   `packages/brand-kit/presets.ts` ya definen su par (ningún preset define
   `accentLight/accentDark` hoy; esos solo llegan por el acordeón manual y el resolutor
   ya los respeta); el Sello consume el MISMO resolutor de branding que el resto de la app
   (`resolveEffectiveCoachBrandTheme` RN / las vars `--theme-*` web). CERO paletas nuevas.
2. Brand SIN preset (custom/legacy): fórmula derivada
   `hsl(H+38°, S×0.85, min(L+14%, 68%))` del primario, en el helper compartido
   `sealPair` — misma matemática web/RN con tests golden. Regla del dueño 2026-08-17
   (SPEC W-brand B2): el `brand_secondary_color` almacenado de un legacy NO se considera —
   par curado viene de preset o se deriva del primario, nunca del hex suelto viejo.
En ambos casos muere el `SKY #38BDF8` fijo de `AppBackground`.
Nota (auditoría 2026-08-17): `--theme-secondary` ya se emite en los layouts web pero hoy
NADIE lo lee — el Sello pasa a ser su primer consumidor real; en RN el resolutor ya expone
el secundario del preset.

**D4 — Contrato de animación (flexibiliza el «jamás anima» del AppBackground actual, con
compromiso firmado por el dueño en el artifact):** SOLO la luz se mueve; el grano JAMÁS.
Deriva de los blobs: trayectorias de 3 puntos, 46s y 58s, alternadas, desfasadas;
exclusivamente `transform` (web compositor / RN Reanimated en UI thread con transform puro).
`prefers-reduced-motion` (web) y `AccessibilityInfo.isReduceMotionEnabled` (RN) congelan la
deriva (los blobs quedan estáticos, no desaparecen). Kill-switch por prop
(`animated={false}`) por si el QA de batería del dueño lo pide.

**D5 — Temas.** Dark: blobs .16/.14, grano blanco .012/.010 capa .5 (tokens actuales).
Light: **alphas propios calibrados en el artifact** — blobs .15/.13, grano tinta
.016/.013 capa .55 (decisión del dueño: en claro debe NOTARSE). Tokens espejados web/RN y
gobernados por `check:tokens`.

**D6 — Reversa consciente del «fondo limpio».** El layout del coach web decía «sin glow
ambient» (pasada CD). El dueño lo revierte el 2026-08-17 para el sello B. Se actualiza el
comentario del layout citando esta SPEC.

## Alcance

- **Web:** componente `AppSeal` (nuevo, `components/` compartido de app) con variantes
  `b` (default) y `grain` (overlays); montaje en el shell del coach
  (`app/coach/layout.tsx`/`CoachMainWrapper`), en el shell del área alumno
  (`app/c/[coach_slug]/…` layout) y capa `grain` en los overlays del editor
  (`QuickEditPlanView` root). CSS puro (radial-gradients + repeating-linear-gradients),
  capas `position:fixed` tras el contenido.
- **RN:** `AppBackground` evoluciona a B: fuera la grilla, secundario derivado, deriva
  Reanimated opcional (D4), mismos montajes actuales (ya es app-wide).
- **Tokens:** `--seal-*` en `globals.css` + espejo en `theme.ts`, dentro del governance.

## Invariantes

- Contraste del contenido intacto: alphas de capa ≤ .16 y todo texto vive sobre cards
  sólidas — el gate visual verifica que el contraste WCAG de los textos de las superficies
  clave no cambia con el sello activo.
- White-label sin trabajo por coach: TODO sale del hex de marca vigente en runtime.
- Print/export limpio (el sello no se imprime).
- Performance: cero JS por frame en web; en RN cero trabajo en JS thread (Reanimated UI
  thread o estático).

## Criterios de aceptación

- B visible y correcto en: coach web (dashboard/hubs/listas), alumno PWA, RN coach+alumno,
  en dark y light, con 3 marcas de prueba (azul EVA, verde, naranja) — capturas del gate.
- Grano-solo presente en el editor overlay; pre-auth intacto (diff cero en esas rutas).
- Reduced-motion congela la deriva (assert), kill-switch funciona.
- Gates de siempre verdes + `check:tokens` con los tokens nuevos + QA visual del dueño.
