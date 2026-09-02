---
status: implemented-pending-qa
owner: engineering
last_verified: "2026-09-02"
canonical: false
---

# SPEC — Entrada dark v1 (splash, valor+selector, retorno branded)

Redesign completo de la familia de entrada de EVA Mobile (RN). Diseño ganador elegido por el owner el 2026-07-28: mockup `r2-c-craft` como base + mecanismo de "capa de luz white-label" del frame 06 de `r2-b-capaluz`. Direccion completa en `docs/research/entrada-redesign/00-DIRECCION-ENTRADA.md`; spec visual normativa en [`DESIGN-SPEC.md`](DESIGN-SPEC.md).

## Problema

1. El splash nativo es invisible: marca NEGRA (`eva-mark-filled.png`) sobre `#07080C` (QA ronda 1, F10).
2. El selector renderiza full-bleed azul saturado por bug de `react-native-svg` (alpha del `stopColor` descartado) — **afecta prod hoy**, tambien a GlassCard y 3 heroes.
3. El CTA del walkthrough y la card "Soy coach" pierden su layout por bug de css-interop (`className` + `style`-funcion) — **afecta prod hoy**.
4. La entrada fuerza tema claro (`ForceLightTheme`) → flash oscuro→claro garantizado en cada cold start.
5. El walkthrough de 3 slides es el patron con peor evidencia de la investigacion (1% interactua con dots, swipe <2s, NN/g: no mejora desempeño) y sus ilustraciones no sirven en dark.
6. Un usuario YA logueado pasa por un loader generico ("Preparando EVA…") sin marca, en vez de una entrada directa y brandeada a su dashboard.

## Solucion

Atmosfera dark continua `#07080C` desde el primer frame nativo, con la textura sello (crosshatch 3px + lavados radiales de acento — decision explicita del owner) presente en toda la familia:

- **Splash**: figura blanca EVA nativa → replica JS pixel-identica animada (halo respira) mientras se resuelve el gate de sesion.
- **Sin sesion**: UNA pantalla de valor + selector de rol fusionados (sin carrusel, sin walkthrough): H1 + 3 mini-fragmentos de producto real (semana, anillo de macros, grafica de progreso) + cards de rol con craft. Rol elegible a ~1.6s del cold start.
- **Con sesion**: cero selector — el splash JS cruza (220ms) a la marca del coach cacheada (capa de luz cambia de acento: la luz ES el white-label) y entra directo al dashboard (alumno o coach). El loader "Preparando EVA…" desaparece.
- **Transiciones**: morph de la card elegida hacia su destino — alumno → `/alumno/codigo` (dark), coach → login de coach (dark, identidad EVA).
- **Walkthrough**: RETIRADO (componente, flag `walkthrough_seen` y sus 3 ilustraciones webp).

## Alcance

**Incluye**: `app/index.tsx` (pantalla fusionada), splash JS + gate (`_layout`/nuevo `SplashGate`), retorno branded, `app/alumno/codigo.tsx` dark, login de coach dark (unica superficie de auth tocada — llega por morph desde el selector, identidad EVA), fixes previos de librerias (Fase 0 del PLAN), infra `ForceScheme`/`DARK_SCHEME_VARS`, tokens nuevos, cambio de asset del splash nativo (binario).

**NO incluye**: login white-label del alumno (`/c/slug`, sigue claro/branded — y su bug F1 P0 de QA ronda 1 es otra ola), onboarding intake del alumno, register de coach, dashboards (solo se llega a ellos), web/PWA.

## Criterios de aceptacion

1. Cold start sin sesion: nativo → replica JS sin flash perceptible (mismo `#07080C`, misma posicion de marca); rol elegible ≤2s en device medio; jamas pantalla blanca.
2. Cold start con sesion: splash → dashboard directo; la marca del coach aparece via crossfade ≤300ms; sin selector, sin loader generico; sin red en el arranque (branding desde AsyncStorage, fallback identidad EVA).
3. El selector NUNCA se tiñe con la marca de un coach cacheado (identidad EVA, `branded=false` se conserva).
4. Textura sello y capa de luz presentes en las 7 superficies; glows con `stopOpacity` correcto (cero rects solidos).
5. Ambos morphs funcionan y su variante reduce-motion es un crossfade plano; toda animacion respeta `useReducedMotion`.
6. `fontScale` 1.3 y pantallas ≤667px: CTA de rol nunca bajo el fold (colapso a 2 beneficios documentado en DESIGN-SPEC).
7. Los 2 bugs de librerias corregidos y verificados tambien en las superficies de prod afectadas (GlassCard, brand.tsx, ProgramLibraryHero, NutritionHeader).
8. Gates verdes: `pnpm --filter @eva/mobile exec tsc --noEmit` + `expo export --platform android` + QA visual en emulador y device del owner (Android e iOS).
9. Sin deps nuevas (nativas ni JS). Sin Lottie. Todo lo JS viaja por OTA; solo el asset del splash nativo exige binario.

## Riesgos

- **Halation OLED** en blooms/capa de luz → validar en device real; fallback alpha .40 documentado en mockup B.
- **Jank de morph en gama baja** → fallback crossfade 160ms.
- **Costura login alumno claro**: al tocar la card alumno → codigo (dark) → login white-label (claro). Transicion anotada en DESIGN-SPEC como cambio de identidad legitimo; se suaviza con scrim/fade.
- **Splash nativo viejo en binarios existentes**: el asset blanco llega con el proximo binario EAS; mientras tanto el nativo se ve "negro plano" (aceptable — hoy ya es invisible) y la mejora JS llega igual por OTA.
