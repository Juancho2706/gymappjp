---
status: draft
owner: engineering
last_verified: 2026-07-28
canonical: false
---

# TASKS — Entrada dark v1

Estado: `[ ]` pendiente · `[x]` hecho · `[-]` descartado. Referencias: [SPEC](SPEC.md) · [PLAN](PLAN.md) · [DESIGN-SPEC](DESIGN-SPEC.md).

## Fase 0 — Fixes de librerias (prod)

- [ ] F0.1 `stopOpacity` explicito en `components/AmbientBrandGlow.tsx` (6 stops) y `components/GlassCard.tsx` (cornerGlow); barrido `stopColor` en todo `apps/mobile`
- [ ] F0.2 QA visual before/after: selector, `app/(auth)/brand.tsx`, `ProgramLibraryHero`, `NutritionHeader`, un consumidor de GlassCard
- [ ] F0.3 Eliminar combo `className`+`style`-funcion en `components/Walkthrough.tsx:311` y `app/index.tsx:180`; barrido repo del patron; regla en `apps/mobile/AGENTS.md`
- [ ] F0.4 Colaterales: quitar `AppBackground` duplicado de la fase checking (`index.tsx:87` vs `EvaLoader.tsx:99`); `AppBackground.tsx:28` `mode`→`resolvedScheme`; `EvaLoader.tsx` a `useReducedMotion`
- [ ] F0.5 Gates: `pnpm --filter @eva/mobile exec tsc --noEmit` + `expo export --platform android`; commit propio

## Fase 1 — Infra de tema

- [ ] F1.1 `ThemeContext.tsx`: `ForceScheme({ scheme, branded })` + alias deprecado `ForceLightTheme`
- [ ] F1.2 `lib/theme.ts`: `DARK_SCHEME_VARS` espejo del bloque `.dark` de `global.css` + comentario-contrato
- [ ] F1.3 StatusBar `light` cuando scheme dark; tokens nuevos (DESIGN-SPEC §5) en `global.css`, `tailwind.config.js`, `docs/architecture/design-system/TOKENS.md`
- [ ] F1.4 Gates fase

## Fase 2 — SplashGate + retorno branded

- [ ] F2.1 `components/entry/EntryBackground.tsx` — textura sello (DESIGN-SPEC §1): base + radiales (`stopOpacity`) + crosshatch svg Pattern 3px + vineta; prop `accent`
- [ ] F2.2 `components/entry/LightLayer.tsx` — `expo-linear-gradient` con `{heat, lift, rgb}` (DESIGN-SPEC §2)
- [ ] F2.3 `components/entry/EvaFigure.tsx` — asset `assets/eva-icon.png` (verificar que es la figura blanca alfa; si no, importar `apps/web/public/LOGOS/eva-icon-white.png` al bundle mobile)
- [ ] F2.4 `components/entry/SplashGate.tsx` — replica pixel-identica + halo respirando (1 nodo) + `getSession()`/`loadStoredBranding()` en paralelo + `hideAsync()` al montar
- [ ] F2.5 `app/index.tsx`: checking → SplashGate; retirar `EvaLoaderScreen` de la entrada; conservar gates (sesion→home, branding→login alumno, `pick=1`)
- [ ] F2.5b Mitad OTA del anti-flash: `backgroundColor #07080C` en `GestureHandlerRootView` (`_layout.tsx:251`) y contenedores de ThemeContext de la familia (la mitad nativa va en F5.0)
- [ ] F2.6 Retorno branded: crossfade 220ms figura→tile marca coach + LightLayer cruza acento → `router.replace(coach ? '/coach/home' : '/alumno/home')`
- [ ] F2.7 QA: cold start con/sin sesion, sin red, reduce-motion, <1s
- [ ] F2.8 Gates fase

## Fase 3 — Pantalla fusionada + morphs + destinos

- [ ] F3.1 `components/entry/ProductFragments.tsx` — mini semana / anillo macros / grafica (svg estatico, specs DESIGN-SPEC §3; ~34 nodos, datos congelados)
- [ ] F3.2 `components/entry/RoleCards.tsx` — cards glass craft (anatomia DESIGN-SPEC §3) + pressed + haptics `selectionAsync`
- [ ] F3.3 `app/index.tsx` fase selector → pantalla fusionada (frame 02) con cascada de entrada (tabla motion §4)
- [ ] F3.4 Morph generico (overlay Reanimated `measure`→fullscreen 260ms, fallback crossfade 160ms) aplicado a ambas cards
- [ ] F3.5 `app/alumno/codigo.tsx` restyle dark (frame 04)
- [ ] F3.6 `(auth)/login.tsx` variante visual `role=coach` dark identidad EVA (frame 05); cero cambios de logica auth; alumno intacto
- [ ] F3.7 Retirar `Walkthrough.tsx`, `lib/walkthrough.ts`, `assets/onboarding/*.webp` (antes: grep usos de `stickers/logro.webp` — si es exclusivo del walkthrough NO borrarlo, lo usan celebraciones)
- [ ] F3.8 Compact ≤667px / fontScale >1.15: colapso a 2 beneficios; CTA nunca bajo el fold
- [ ] F3.9 QA emulador 7 pantallas + back Android + teclado; gates fase

## Fase 4 — QA integral + docs

- [ ] F4.1 QA device owner: halation OLED, morph gama baja, TalkBack basico
- [ ] F4.2 Docs: `MOBILE_PARITY.md` (divergencia intencional de entrada), `CURRENT.md`, cierre F10 QA ronda 1
- [ ] F4.3 Revision jefe de diffs completos + `pnpm docs:check`

## Fase 5 — Binario (solo con pedido del owner)

- [ ] F5.0 `app.json`: declarar `expo.backgroundColor` (y `android.backgroundColor`) `#07080C` — GAP encontrado en DESIGN-SPEC: hoy el root view nativo es blanco default = flash post-splash (el `#000000` de la linea 36 es del adaptiveIcon, no cuenta)
- [ ] F5.1 `app.json` splash → figura blanca `eva-icon.png` (verificada: 585x526, silueta #FFF, fondo transparente; la actual `eva-mark-filled.png` es la variante NEGRA), `imageWidth` 180→150 per DESIGN-SPEC; verificar antialiasing del alpha casi-binario en device
- [ ] F5.2 Entra al proximo build EAS junto a MOB-01 (HealthKit); verificacion del splash real en device
