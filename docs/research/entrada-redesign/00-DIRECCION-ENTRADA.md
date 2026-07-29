---
status: reference
owner: engineering
last_verified: 2026-07-28
canonical: false
---

# Direccion de diseño — familia de entrada RN (splash → walkthrough → selector)

Sintesis del jefe de orquestacion sobre r1/r2 (referentes), a1 (auditoria) y f1 (fundamentos). Decision del owner 2026-07-28: **dark premium continuo**, proceso research → mockups → implementacion, alcance splash + walkthrough + selector (login queda fuera; ver costura §5).

## 1. Tesis

Una sola atmosfera oscura desde el primer frame nativo hasta el selector: base `#07080C` identica en splash nativo, window background y primer frame JS (bait-and-switch: en Android no existe crossfade nativo — la continuidad se fabrica con color identico + fade de contenido en JS). "Ambient dark", no negro plano: escalera de superficies + hairlines + grano/glow sutil de marca, y UN solo color saturado reservado al CTA (evidencia Whoop/Peloton/Linear). Off-white sobre carbon, nunca blanco puro sobre negro puro (halation, Oura).

## 2. Por superficie

- **Splash (binario)**: marca BLANCA (`eva-icon.png`, hoy sin usar) sobre `#07080C` — el actual usa la marca negra (~RGB 27) sobre casi-negro: invisible. Regla: ≤1000ms percibido; el splash JS que sigue replica pixel-identico y anima la marca (glow/respiracion) mientras resuelve el gate de sesion.
- **Walkthrough (OTA)**: techo 3 slides, skip visible desde el slide 1 (NN/g: el carrusel pasivo es el patron con peor evidencia — no invertir en MAS slides; los mockups pueden explorar colapsarlo). Ilustraciones webp actuales tienen sesgo claro → en dark se reemplazan (composiciones tipograficas/geometricas con tokens, no Lottie). Value-first en copy.
- **Selector (OTA)**: la arquitectura asimetrica actual es CORRECTA (alumno = card rellena primaria, coach = outline; Hick's Law) — falta atmosfera, no arquitectura. Wordmark display como elemento visual protagonista (Perplexity/Linear). Entrada con stagger 0/90/150ms ya dentro de guardarrailes: conservar lenguaje.
- **`/alumno/codigo` (OTA)**: destino directo de "Soy alumno" — entra al alcance dark (si no, flash claro inmediato).

## 3. Prerequisitos tecnicos (bugs confirmados, van ANTES o CON el redesign)

1. **`react-native-svg` Stop pierde el alpha del `stopColor`** (`extractGradient.ts:83-84`: `color & 0x00ffffff` + `stopOpacity` default 1) → `AmbientBrandGlow` pinta 3 rects `#007AFF` SOLIDOS full-bleed (la pantalla azul del selector). Fix: `stopOpacity` explicito. Auditar tambien `GlassCard` y las 4 superficies que montan el glow (brand.tsx, ProgramLibraryHero, NutritionHeader). OTA, afecta devices reales.
2. **css-interop descarta `style` cuando es funcion** en componentes con `className` (`native-interop.ts` colecta la funcion como declaracion y `{...fn}` = `{}`) → CTA del walkthrough y card "Soy coach" pierden todo el layout (flecha apilada). Regla de repo: NUNCA combinar `className` + `style`-funcion en el mismo componente; fix en `Walkthrough.tsx:311-316`, `index.tsx:180-188` + barrido de otros combos.
3. **`ForceLightTheme` hardcodea claro** (`ThemeContext.tsx:127-163`): parametrizar (`ForceScheme scheme="dark"`), crear `DARK_SCHEME_VARS` espejo (`lib/theme.ts:610-679`), StatusBar `light`, call sites `index.tsx:27` y `alumno/codigo.tsx:33`.
4. Colaterales del mismo recorrido: doble `AppBackground` en fase checking (`index.tsx:87` + `EvaLoader.tsx:99`), `AppBackground.tsx:28` lee `mode` en vez de `resolvedScheme`, `EvaLoader` usa `AccessibilityInfo` en vez de `useReducedMotion` (unificar).

## 4. Motion y presupuesto

Reusar lenguaje del ejecutor V3. Entradas 200-350ms timing/spring barato, stagger 60-90ms, solo `transform`/`opacity`, interrumpible si hay gesto, `useReducedMotion` en TODO, cold start = maximo riesgo de jank (menos nodos animados; Skia solo si hay dibujo real). Splash JS: animacion de marca <1000ms total.

## 5. Costura con login (fuera de alcance, decision explicita)

Login es white-label del coach (`(auth)/_layout` branded) — la transicion selector-dark → login-marca es un cambio de identidad LEGITIMO (EVA → coach). Los mockups pueden proponer como suavizarla (scrim, fade), pero el redesign del login es otra ola (junto con F1 P0 del link `/c/slug`, QA ronda 1).

## 6. Mockups

Ronda 1 (`mockups/concepto-{a-ambient,b-ignicion,c-directo}.html`): el owner eligio la ESTRUCTURA del concepto C (sin carrusel, valor+selector fusionados). Quedan como referencia de acabados.

## 7. Decisiones del owner — ronda 2 (2026-07-28, normativas)

1. **Logo**: la marca visual protagonista es la FIGURA BLANCA de EVA (`apps/web/public/LOGOS/eva-icon-white.png` / `apps/mobile/assets/eva-icon.png`), NO el wordmark "EVA" tipografico.
2. **Retorno logueado**: con sesion activa NO hay selector ni pantalla de valor — splash → dashboard directo (alumno o coach). El splash de retorno es BRANDED del coach (white-label via branding cacheado); el nativo sigue siendo EVA-figura y la replica JS cruza a la marca del coach. El loader "Preparando EVA…" desaparece: la fase checking ES ese splash.
3. **Morph**: la transicion morph de card aprobada, pero para AMBAS cards (alumno → codigo Y coach → login coach).
4. **Craft de cards**: prohibido el look generico "hecho por AI" — iconografia stroke consistente, jerarquia tipografica real, tokens/hairlines/pressed con intencion.
5. Ronda 2 = 3 variantes de C: `r2-a-luminancia` (acabado A), `r2-b-capaluz` (acabado B), `r2-c-craft` (fragmentos de producto real).

## 8. Eleccion FINAL del owner (2026-07-28)

**`r2-c-craft` completo como base + el frame 06 de `r2-b-capaluz`** (splash retorno branded con la capa de luz cuyo acento cruza al color del coach — la luz es el white-label). El owner destaco como sello la TEXTURA de fondo de r2-c (crosshatch 3px + lavados radiales de acento): es intocable y esta en todas las pantallas. Implementacion especificada en `docs/specs/entrada-dark-v1/` (SPEC, PLAN, TASKS, DESIGN-SPEC).
